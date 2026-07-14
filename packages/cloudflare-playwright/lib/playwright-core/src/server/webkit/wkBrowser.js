import { assert } from '../../utils/isomorphic/assert.js';
import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import '../utils/debug.js';
import '../utils/debugLogger.js';
import '../utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../../zipBundle.js';
import '../utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../utils/happyEyeballs.js';
import '../utils/nodePlatform.js';
import '../utils/profiler.js';
import '../utils/socksProxy.js';
import 'node:os';
import '../utils/zones.js';
import { Browser } from '../browser.js';
import { BrowserContext, verifyGeolocation } from '../browserContext.js';
import { filterCookies, rewriteCookies } from '../network.js';
import { WKConnection, kPageProxyMessageReceived, WKSession } from './wkConnection.js';
import { WKPage } from './wkPage.js';
import { TargetClosedError } from '../errors.js';
import { translatePathToWSL } from './webkit.js';

const BROWSER_VERSION = "26.0";
const DEFAULT_USER_AGENT = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${BROWSER_VERSION} Safari/605.1.15`;
class WKBrowser extends Browser {
  constructor(parent, transport, options) {
    super(parent, options);
    this._contexts = /* @__PURE__ */ new Map();
    this._wkPages = /* @__PURE__ */ new Map();
    this._connection = new WKConnection(transport, this._onDisconnect.bind(this), options.protocolLogger, options.browserLogsCollector);
    this._browserSession = this._connection.browserSession;
    this._browserSession.on("Playwright.pageProxyCreated", this._onPageProxyCreated.bind(this));
    this._browserSession.on("Playwright.pageProxyDestroyed", this._onPageProxyDestroyed.bind(this));
    this._browserSession.on("Playwright.provisionalLoadFailed", (event) => this._onProvisionalLoadFailed(event));
    this._browserSession.on("Playwright.windowOpen", (event) => this._onWindowOpen(event));
    this._browserSession.on("Playwright.downloadCreated", this._onDownloadCreated.bind(this));
    this._browserSession.on("Playwright.downloadFilenameSuggested", this._onDownloadFilenameSuggested.bind(this));
    this._browserSession.on("Playwright.downloadFinished", this._onDownloadFinished.bind(this));
    this._browserSession.on(kPageProxyMessageReceived, this._onPageProxyMessageReceived.bind(this));
  }
  static async connect(parent, transport, options) {
    const browser = new WKBrowser(parent, transport, options);
    if (options.__testHookOnConnectToBrowser)
      await options.__testHookOnConnectToBrowser();
    const promises = [
      browser._browserSession.send("Playwright.enable")
    ];
    if (options.persistent) {
      options.persistent.userAgent ||= DEFAULT_USER_AGENT;
      browser._defaultContext = new WKBrowserContext(browser, void 0, options.persistent);
      promises.push(browser._defaultContext._initialize());
    }
    await Promise.all(promises);
    return browser;
  }
  _onDisconnect() {
    for (const wkPage of this._wkPages.values())
      wkPage.didClose();
    this._wkPages.clear();
    for (const video of this._idToVideo.values())
      video.artifact.reportFinished(new TargetClosedError(this.closeReason()));
    this._idToVideo.clear();
    this._didClose();
  }
  async doCreateNewContext(options) {
    const proxy = options.proxyOverride || options.proxy;
    const createOptions = proxy ? {
      // Enable socks5 hostname resolution on Windows.
      // See https://github.com/microsoft/playwright/issues/20451
      proxyServer: process.platform === "win32" && this.attribution.browser?.options.channel !== "webkit-wsl" ? proxy.server.replace(/^socks5:\/\//, "socks5h://") : proxy.server,
      proxyBypassList: proxy.bypass
    } : void 0;
    const { browserContextId } = await this._browserSession.send("Playwright.createContext", createOptions);
    options.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    const context = new WKBrowserContext(this, browserContextId, options);
    await context._initialize();
    this._contexts.set(browserContextId, context);
    return context;
  }
  contexts() {
    return Array.from(this._contexts.values());
  }
  version() {
    return BROWSER_VERSION;
  }
  userAgent() {
    return DEFAULT_USER_AGENT;
  }
  _onDownloadCreated(payload) {
    const page = this._wkPages.get(payload.pageProxyId);
    if (!page)
      return;
    let frameId = payload.frameId;
    if (!page._page.frameManager.frame(frameId))
      frameId = page._page.mainFrame()._id;
    page._page.frameManager.frameAbortedNavigation(frameId, "Download is starting");
    let originPage = page._page.initializedOrUndefined();
    if (!originPage) {
      page._firstNonInitialNavigationCommittedReject(new Error("Starting new page download"));
      if (page._opener)
        originPage = page._opener._page.initializedOrUndefined();
    }
    if (!originPage)
      return;
    this._downloadCreated(originPage, payload.uuid, payload.url);
  }
  _onDownloadFilenameSuggested(payload) {
    this._downloadFilenameSuggested(payload.uuid, payload.suggestedFilename);
  }
  _onDownloadFinished(payload) {
    this._downloadFinished(payload.uuid, payload.error);
  }
  _onPageProxyCreated(event) {
    const pageProxyId = event.pageProxyId;
    let context = null;
    if (event.browserContextId) {
      context = this._contexts.get(event.browserContextId) || null;
    }
    if (!context)
      context = this._defaultContext;
    if (!context)
      return;
    const pageProxySession = new WKSession(this._connection, pageProxyId, (message) => {
      this._connection.rawSend({ ...message, pageProxyId });
    });
    const opener = event.openerId ? this._wkPages.get(event.openerId) : void 0;
    const wkPage = new WKPage(context, pageProxySession, opener || null);
    this._wkPages.set(pageProxyId, wkPage);
  }
  _onPageProxyDestroyed(event) {
    const pageProxyId = event.pageProxyId;
    const wkPage = this._wkPages.get(pageProxyId);
    if (!wkPage)
      return;
    this._wkPages.delete(pageProxyId);
    wkPage.didClose();
  }
  _onPageProxyMessageReceived(event) {
    const wkPage = this._wkPages.get(event.pageProxyId);
    if (!wkPage)
      return;
    wkPage.dispatchMessageToSession(event.message);
  }
  _onProvisionalLoadFailed(event) {
    const wkPage = this._wkPages.get(event.pageProxyId);
    if (!wkPage)
      return;
    wkPage.handleProvisionalLoadFailed(event);
  }
  _onWindowOpen(event) {
    const wkPage = this._wkPages.get(event.pageProxyId);
    if (!wkPage)
      return;
    wkPage.handleWindowOpen(event);
  }
  isConnected() {
    return !this._connection.isClosed();
  }
}
class WKBrowserContext extends BrowserContext {
  constructor(browser, browserContextId, options) {
    super(browser, options, browserContextId);
    this._validateEmulatedViewport(options.viewport);
    this._authenticateProxyViaHeader();
  }
  async _initialize() {
    assert(!this._wkPages().length);
    const browserContextId = this._browserContextId;
    const promises = [super._initialize()];
    promises.push(this._browser._browserSession.send("Playwright.setDownloadBehavior", {
      behavior: this._options.acceptDownloads === "accept" ? "allow" : "deny",
      downloadPath: this._browser.options.channel === "webkit-wsl" ? await translatePathToWSL(this._browser.options.downloadsPath) : this._browser.options.downloadsPath,
      browserContextId
    }));
    if (this._options.ignoreHTTPSErrors || this._options.internalIgnoreHTTPSErrors)
      promises.push(this._browser._browserSession.send("Playwright.setIgnoreCertificateErrors", { browserContextId, ignore: true }));
    if (this._options.locale)
      promises.push(this._browser._browserSession.send("Playwright.setLanguages", { browserContextId, languages: [this._options.locale] }));
    if (this._options.geolocation)
      promises.push(this.setGeolocation(this._options.geolocation));
    if (this._options.offline)
      promises.push(this.doUpdateOffline());
    if (this._options.httpCredentials)
      promises.push(this.setHTTPCredentials(this._options.httpCredentials));
    await Promise.all(promises);
  }
  _wkPages() {
    return Array.from(this._browser._wkPages.values()).filter((wkPage) => wkPage._browserContext === this);
  }
  possiblyUninitializedPages() {
    return this._wkPages().map((wkPage) => wkPage._page);
  }
  async doCreateNewPage() {
    const { pageProxyId } = await this._browser._browserSession.send("Playwright.createPage", { browserContextId: this._browserContextId });
    return this._browser._wkPages.get(pageProxyId)._page;
  }
  async doGetCookies(urls) {
    const { cookies } = await this._browser._browserSession.send("Playwright.getAllCookies", { browserContextId: this._browserContextId });
    return filterCookies(cookies.map((c) => {
      const { name, value, domain, path, expires, httpOnly, secure, sameSite } = c;
      const copy = {
        name,
        value,
        domain,
        path,
        expires: expires === -1 ? -1 : expires / 1e3,
        httpOnly,
        secure,
        sameSite
      };
      return copy;
    }), urls);
  }
  async addCookies(cookies) {
    const cc = rewriteCookies(cookies).map((c) => {
      const { name, value, domain, path, expires, httpOnly, secure, sameSite } = c;
      const copy = {
        name,
        value,
        domain,
        path,
        expires: expires && expires !== -1 ? expires * 1e3 : expires,
        httpOnly,
        secure,
        sameSite,
        session: expires === -1 || expires === void 0
      };
      return copy;
    });
    await this._browser._browserSession.send("Playwright.setCookies", { cookies: cc, browserContextId: this._browserContextId });
  }
  async doClearCookies() {
    await this._browser._browserSession.send("Playwright.deleteAllCookies", { browserContextId: this._browserContextId });
  }
  async doGrantPermissions(origin, permissions) {
    await Promise.all(this.pages().map((page) => page.delegate._grantPermissions(origin, permissions)));
  }
  async doClearPermissions() {
    await Promise.all(this.pages().map((page) => page.delegate._clearPermissions()));
  }
  async setGeolocation(geolocation) {
    verifyGeolocation(geolocation);
    this._options.geolocation = geolocation;
    const payload = geolocation ? { ...geolocation, timestamp: Date.now() } : void 0;
    await this._browser._browserSession.send("Playwright.setGeolocationOverride", { browserContextId: this._browserContextId, geolocation: payload });
  }
  async doUpdateExtraHTTPHeaders() {
    for (const page of this.pages())
      await page.delegate.updateExtraHTTPHeaders();
  }
  async setUserAgent(userAgent) {
    this._options.userAgent = userAgent;
    for (const page of this.pages())
      await page.delegate.updateUserAgent();
  }
  async doUpdateOffline() {
    for (const page of this.pages())
      await page.delegate.updateOffline();
  }
  async doSetHTTPCredentials(httpCredentials) {
    this._options.httpCredentials = httpCredentials;
    for (const page of this.pages())
      await page.delegate.updateHttpCredentials();
  }
  async doAddInitScript(initScript) {
    for (const page of this.pages())
      await page.delegate._updateBootstrapScript();
  }
  async doRemoveInitScripts(initScripts) {
    for (const page of this.pages())
      await page.delegate._updateBootstrapScript();
  }
  async doUpdateRequestInterception() {
    for (const page of this.pages())
      await page.delegate.updateRequestInterception();
  }
  async doUpdateDefaultViewport() {
  }
  async doUpdateDefaultEmulatedMedia() {
  }
  async doExposePlaywrightBinding() {
    for (const page of this.pages())
      await page.delegate.exposePlaywrightBinding();
  }
  onClosePersistent() {
  }
  async clearCache() {
    await this._browser._browserSession.send("Playwright.clearMemoryCache", {
      browserContextId: this._browserContextId
    });
  }
  async doClose(reason) {
    if (!this._browserContextId) {
      await Promise.all(this._wkPages().map((wkPage) => wkPage._page.screencast.stopVideoRecording()));
      await this._browser.close({ reason });
    } else {
      await this._browser._browserSession.send("Playwright.deleteContext", { browserContextId: this._browserContextId });
      this._browser._contexts.delete(this._browserContextId);
    }
  }
  async cancelDownload(uuid) {
    await this._browser._browserSession.send("Playwright.cancelDownload", { uuid });
  }
  _validateEmulatedViewport(viewportSize) {
    if (!viewportSize)
      return;
    if (process.platform === "win32" && this._browser.options.headful && (viewportSize.width < 250 || viewportSize.height < 240))
      throw new Error(`WebKit on Windows has a minimal viewport of 250x240.`);
  }
}

export { WKBrowser, WKBrowserContext };
