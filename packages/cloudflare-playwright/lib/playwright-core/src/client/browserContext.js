import { Artifact } from './artifact.js';
import { CDPSession } from './cdpSession.js';
import { ChannelOwner } from './channelOwner.js';
import { evaluationScript } from './clientHelper.js';
import { Clock } from './clock.js';
import { ConsoleMessage } from './consoleMessage.js';
import { Dialog } from './dialog.js';
import { parseError, TargetClosedError } from './errors.js';
import { Events } from './events.js';
import { APIRequestContext } from './fetch.js';
import { Frame } from './frame.js';
import { HarRouter } from './harRouter.js';
import { Route, WebSocketRoute, Request, Response, validateHeaders, RouteHandler, WebSocketRouteHandler } from './network.js';
import { BindingCall, Page } from './page.js';
import { Tracing } from './tracing.js';
import { Waiter } from './waiter.js';
import { WebError } from './webError.js';
import { Worker } from './worker.js';
import { TimeoutSettings } from './timeoutSettings.js';
import { mkdirIfNeeded } from './fileUtils.js';
import { headersObjectToArray } from '../utils/isomorphic/headers.js';
import { urlMatchesEqual } from '../utils/isomorphic/urlMatch.js';
import { isRegExp } from '../utils/isomorphic/rtti.js';
import { rewriteErrorMessage } from '../utils/isomorphic/stackTrace.js';
import { isString } from '../utils/isomorphic/stringUtils.js';

class BrowserContext extends ChannelOwner {
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this._pages = /* @__PURE__ */ new Set();
    this._routes = [];
    this._webSocketRoutes = [];
    // Browser is null for browser contexts created outside of normal browser, e.g. android or electron.
    this._browser = null;
    this._bindings = /* @__PURE__ */ new Map();
    this._forReuse = false;
    this._serviceWorkers = /* @__PURE__ */ new Set();
    this._harRecorders = /* @__PURE__ */ new Map();
    this._closingStatus = "none";
    this._harRouters = [];
    this._options = initializer.options;
    this._timeoutSettings = new TimeoutSettings(this._platform);
    this.tracing = Tracing.from(initializer.tracing);
    this.request = APIRequestContext.from(initializer.requestContext);
    this.request._timeoutSettings = this._timeoutSettings;
    this.request._checkUrlAllowed = (url) => this._checkUrlAllowed(url);
    this.clock = new Clock(this);
    this._channel.on("bindingCall", ({ binding }) => this._onBinding(BindingCall.from(binding)));
    this._channel.on("close", () => this._onClose());
    this._channel.on("page", ({ page }) => this._onPage(Page.from(page)));
    this._channel.on("route", ({ route }) => this._onRoute(Route.from(route)));
    this._channel.on("webSocketRoute", ({ webSocketRoute }) => this._onWebSocketRoute(WebSocketRoute.from(webSocketRoute)));
    this._channel.on("serviceWorker", ({ worker }) => {
      const serviceWorker = Worker.from(worker);
      serviceWorker._context = this;
      this._serviceWorkers.add(serviceWorker);
      this.emit(Events.BrowserContext.ServiceWorker, serviceWorker);
    });
    this._channel.on("console", (event) => {
      const worker = Worker.fromNullable(event.worker);
      const page = Page.fromNullable(event.page);
      const consoleMessage = new ConsoleMessage(this._platform, event, page, worker);
      worker?.emit(Events.Worker.Console, consoleMessage);
      page?.emit(Events.Page.Console, consoleMessage);
      if (worker && this._serviceWorkers.has(worker)) {
        const scope = this._serviceWorkerScope(worker);
        for (const page2 of this._pages) {
          if (scope && page2.url().startsWith(scope))
            page2.emit(Events.Page.Console, consoleMessage);
        }
      }
      this.emit(Events.BrowserContext.Console, consoleMessage);
    });
    this._channel.on("pageError", ({ error, page }) => {
      const pageObject = Page.from(page);
      const parsedError = parseError(error);
      this.emit(Events.BrowserContext.WebError, new WebError(pageObject, parsedError));
      if (pageObject)
        pageObject.emit(Events.Page.PageError, parsedError);
    });
    this._channel.on("dialog", ({ dialog }) => {
      const dialogObject = Dialog.from(dialog);
      let hasListeners = this.emit(Events.BrowserContext.Dialog, dialogObject);
      const page = dialogObject.page();
      if (page)
        hasListeners = page.emit(Events.Page.Dialog, dialogObject) || hasListeners;
      if (!hasListeners) {
        if (dialogObject.type() === "beforeunload")
          dialog.accept({}).catch(() => {
          });
        else
          dialog.dismiss().catch(() => {
          });
      }
    });
    this._channel.on("request", ({ request, page }) => this._onRequest(Request.from(request), Page.fromNullable(page)));
    this._channel.on("requestFailed", ({ request, failureText, responseEndTiming, page }) => this._onRequestFailed(Request.from(request), responseEndTiming, failureText, Page.fromNullable(page)));
    this._channel.on("requestFinished", (params) => this._onRequestFinished(params));
    this._channel.on("response", ({ response, page }) => this._onResponse(Response.from(response), Page.fromNullable(page)));
    this._channel.on("recorderEvent", ({ event, data, page, code }) => {
      if (event === "actionAdded")
        this._onRecorderEventSink?.actionAdded?.(Page.from(page), data, code);
      else if (event === "actionUpdated")
        this._onRecorderEventSink?.actionUpdated?.(Page.from(page), data, code);
      else if (event === "signalAdded")
        this._onRecorderEventSink?.signalAdded?.(Page.from(page), data);
    });
    this._closedPromise = new Promise((f) => this.once(Events.BrowserContext.Close, f));
    this._setEventToSubscriptionMapping(/* @__PURE__ */ new Map([
      [Events.BrowserContext.Console, "console"],
      [Events.BrowserContext.Dialog, "dialog"],
      [Events.BrowserContext.Request, "request"],
      [Events.BrowserContext.Response, "response"],
      [Events.BrowserContext.RequestFinished, "requestFinished"],
      [Events.BrowserContext.RequestFailed, "requestFailed"]
    ]));
  }
  static from(context) {
    return context._object;
  }
  static fromNullable(context) {
    return context ? BrowserContext.from(context) : null;
  }
  async _initializeHarFromOptions(recordHar) {
    if (!recordHar)
      return;
    const defaultContent = recordHar.path.endsWith(".zip") ? "attach" : "embed";
    await this._recordIntoHAR(recordHar.path, null, {
      url: recordHar.urlFilter,
      updateContent: recordHar.content ?? (recordHar.omitContent ? "omit" : defaultContent),
      updateMode: recordHar.mode ?? "full"
    });
  }
  _onPage(page) {
    this._pages.add(page);
    this.emit(Events.BrowserContext.Page, page);
    if (page._opener && !page._opener.isClosed())
      page._opener.emit(Events.Page.Popup, page);
  }
  _onRequest(request, page) {
    this.emit(Events.BrowserContext.Request, request);
    if (page)
      page.emit(Events.Page.Request, request);
  }
  _onResponse(response, page) {
    this.emit(Events.BrowserContext.Response, response);
    if (page)
      page.emit(Events.Page.Response, response);
  }
  _onRequestFailed(request, responseEndTiming, failureText, page) {
    request._failureText = failureText || null;
    request._setResponseEndTiming(responseEndTiming);
    this.emit(Events.BrowserContext.RequestFailed, request);
    if (page)
      page.emit(Events.Page.RequestFailed, request);
  }
  _onRequestFinished(params) {
    const { responseEndTiming } = params;
    const request = Request.from(params.request);
    const response = Response.fromNullable(params.response);
    const page = Page.fromNullable(params.page);
    request._setResponseEndTiming(responseEndTiming);
    this.emit(Events.BrowserContext.RequestFinished, request);
    if (page)
      page.emit(Events.Page.RequestFinished, request);
    if (response)
      response._finishedPromise.resolve(null);
  }
  async _onRoute(route) {
    route._context = this;
    const page = route.request()._safePage();
    const routeHandlers = this._routes.slice();
    for (const routeHandler of routeHandlers) {
      if (page?._closeWasCalled || this._closingStatus !== "none")
        return;
      if (!routeHandler.matches(route.request().url()))
        continue;
      const index = this._routes.indexOf(routeHandler);
      if (index === -1)
        continue;
      if (routeHandler.willExpire())
        this._routes.splice(index, 1);
      const handled = await routeHandler.handle(route);
      if (!this._routes.length)
        this._updateInterceptionPatterns({ internal: true }).catch(() => {
        });
      if (handled)
        return;
    }
    await route._innerContinue(
      true
      /* isFallback */
    ).catch(() => {
    });
  }
  async _onWebSocketRoute(webSocketRoute) {
    const routeHandler = this._webSocketRoutes.find((route) => route.matches(webSocketRoute.url()));
    if (routeHandler)
      await routeHandler.handle(webSocketRoute);
    else
      webSocketRoute.connectToServer();
  }
  async _onBinding(bindingCall) {
    const func = this._bindings.get(bindingCall._initializer.name);
    if (!func)
      return;
    await bindingCall.call(func);
  }
  _serviceWorkerScope(serviceWorker) {
    try {
      let url = new URL(".", serviceWorker.url()).href;
      if (!url.endsWith("/"))
        url += "/";
      return url;
    } catch {
      return null;
    }
  }
  setDefaultNavigationTimeout(timeout) {
    this._timeoutSettings.setDefaultNavigationTimeout(timeout);
  }
  setDefaultTimeout(timeout) {
    this._timeoutSettings.setDefaultTimeout(timeout);
  }
  browser() {
    return this._browser;
  }
  pages() {
    return [...this._pages];
  }
  async newPage() {
    if (this._ownerPage)
      throw new Error("Please use browser.newContext()");
    return Page.from((await this._channel.newPage()).page);
  }
  async cookies(urls) {
    if (!urls)
      urls = [];
    if (urls && typeof urls === "string")
      urls = [urls];
    return (await this._channel.cookies({ urls })).cookies;
  }
  async addCookies(cookies) {
    await this._channel.addCookies({ cookies });
  }
  async clearCookies(options = {}) {
    await this._channel.clearCookies({
      name: isString(options.name) ? options.name : void 0,
      nameRegexSource: isRegExp(options.name) ? options.name.source : void 0,
      nameRegexFlags: isRegExp(options.name) ? options.name.flags : void 0,
      domain: isString(options.domain) ? options.domain : void 0,
      domainRegexSource: isRegExp(options.domain) ? options.domain.source : void 0,
      domainRegexFlags: isRegExp(options.domain) ? options.domain.flags : void 0,
      path: isString(options.path) ? options.path : void 0,
      pathRegexSource: isRegExp(options.path) ? options.path.source : void 0,
      pathRegexFlags: isRegExp(options.path) ? options.path.flags : void 0
    });
  }
  async grantPermissions(permissions, options) {
    await this._channel.grantPermissions({ permissions, ...options });
  }
  async clearPermissions() {
    await this._channel.clearPermissions();
  }
  async setGeolocation(geolocation) {
    await this._channel.setGeolocation({ geolocation: geolocation || void 0 });
  }
  async setExtraHTTPHeaders(headers) {
    validateHeaders(headers);
    await this._channel.setExtraHTTPHeaders({ headers: headersObjectToArray(headers) });
  }
  async setOffline(offline) {
    await this._channel.setOffline({ offline });
  }
  async setHTTPCredentials(httpCredentials) {
    await this._channel.setHTTPCredentials({ httpCredentials: httpCredentials || void 0 });
  }
  async addInitScript(script, arg) {
    const source = await evaluationScript(this._platform, script, arg);
    await this._channel.addInitScript({ source });
  }
  async exposeBinding(name, callback, options = {}) {
    await this._channel.exposeBinding({ name, needsHandle: options.handle });
    this._bindings.set(name, callback);
  }
  async exposeFunction(name, callback) {
    await this._channel.exposeBinding({ name });
    const binding = (source, ...args) => callback(...args);
    this._bindings.set(name, binding);
  }
  async route(url, handler, options = {}) {
    this._routes.unshift(new RouteHandler(this._platform, this._options.baseURL, url, handler, options.times));
    await this._updateInterceptionPatterns({ title: "Route requests" });
  }
  async routeWebSocket(url, handler) {
    this._webSocketRoutes.unshift(new WebSocketRouteHandler(this._options.baseURL, url, handler));
    await this._updateWebSocketInterceptionPatterns({ title: "Route WebSockets" });
  }
  async _recordIntoHAR(har, page, options = {}) {
    const { harId } = await this._channel.harStart({
      page: page?._channel,
      options: {
        zip: har.endsWith(".zip"),
        content: options.updateContent ?? "attach",
        urlGlob: isString(options.url) ? options.url : void 0,
        urlRegexSource: isRegExp(options.url) ? options.url.source : void 0,
        urlRegexFlags: isRegExp(options.url) ? options.url.flags : void 0,
        mode: options.updateMode ?? "minimal"
      }
    });
    this._harRecorders.set(harId, { path: har, content: options.updateContent ?? "attach" });
  }
  async routeFromHAR(har, options = {}) {
    const localUtils = this._connection.localUtils();
    if (!localUtils)
      throw new Error("Route from har is not supported in thin clients");
    if (options.update) {
      await this._recordIntoHAR(har, null, options);
      return;
    }
    const harRouter = await HarRouter.create(localUtils, har, options.notFound || "abort", { urlMatch: options.url });
    this._harRouters.push(harRouter);
    await harRouter.addContextRoute(this);
  }
  _disposeHarRouters() {
    this._harRouters.forEach((router) => router.dispose());
    this._harRouters = [];
  }
  async unrouteAll(options) {
    await this._unrouteInternal(this._routes, [], options?.behavior);
    this._disposeHarRouters();
  }
  async unroute(url, handler) {
    const removed = [];
    const remaining = [];
    for (const route of this._routes) {
      if (urlMatchesEqual(route.url, url) && (!handler || route.handler === handler))
        removed.push(route);
      else
        remaining.push(route);
    }
    await this._unrouteInternal(removed, remaining, "default");
  }
  async _unrouteInternal(removed, remaining, behavior) {
    this._routes = remaining;
    if (behavior && behavior !== "default") {
      const promises = removed.map((routeHandler) => routeHandler.stop(behavior));
      await Promise.all(promises);
    }
    await this._updateInterceptionPatterns({ title: "Unroute requests" });
  }
  async _updateInterceptionPatterns(options) {
    const patterns = RouteHandler.prepareInterceptionPatterns(this._routes);
    await this._wrapApiCall(() => this._channel.setNetworkInterceptionPatterns({ patterns }), options);
  }
  async _updateWebSocketInterceptionPatterns(options) {
    const patterns = WebSocketRouteHandler.prepareInterceptionPatterns(this._webSocketRoutes);
    await this._wrapApiCall(() => this._channel.setWebSocketInterceptionPatterns({ patterns }), options);
  }
  _effectiveCloseReason() {
    return this._closeReason || this._browser?._closeReason;
  }
  async waitForEvent(event, optionsOrPredicate = {}) {
    return await this._wrapApiCall(async () => {
      const timeout = this._timeoutSettings.timeout(typeof optionsOrPredicate === "function" ? {} : optionsOrPredicate);
      const predicate = typeof optionsOrPredicate === "function" ? optionsOrPredicate : optionsOrPredicate.predicate;
      const waiter = Waiter.createForEvent(this, event);
      waiter.rejectOnTimeout(timeout, `Timeout ${timeout}ms exceeded while waiting for event "${event}"`);
      if (event !== Events.BrowserContext.Close)
        waiter.rejectOnEvent(this, Events.BrowserContext.Close, () => new TargetClosedError(this._effectiveCloseReason()));
      const result = await waiter.waitForEvent(this, event, predicate);
      waiter.dispose();
      return result;
    });
  }
  async storageState(options = {}) {
    const state = await this._channel.storageState({ indexedDB: options.indexedDB });
    if (options.path) {
      await mkdirIfNeeded(this._platform, options.path);
      await this._platform.fs().promises.writeFile(options.path, JSON.stringify(state, void 0, 2), "utf8");
    }
    return state;
  }
  backgroundPages() {
    return [];
  }
  serviceWorkers() {
    return [...this._serviceWorkers];
  }
  async newCDPSession(page) {
    if (!(page instanceof Page) && !(page instanceof Frame))
      throw new Error("page: expected Page or Frame");
    const result = await this._channel.newCDPSession(page instanceof Page ? { page: page._channel } : { frame: page._channel });
    return CDPSession.from(result.session);
  }
  _onClose() {
    this._closingStatus = "closed";
    this._browser?._contexts.delete(this);
    this._browser?._browserType._contexts.delete(this);
    this._browser?._browserType._playwright.selectors._contextsForSelectors.delete(this);
    this._disposeHarRouters();
    this.tracing._resetStackCounter();
    this.emit(Events.BrowserContext.Close, this);
  }
  async [Symbol.asyncDispose]() {
    await this.close();
  }
  async close(options = {}) {
    if (this._closingStatus !== "none")
      return;
    this._closeReason = options.reason;
    this._closingStatus = "closing";
    await this.request.dispose(options);
    await this._instrumentation.runBeforeCloseBrowserContext(this);
    await this._wrapApiCall(async () => {
      for (const [harId, harParams] of this._harRecorders) {
        const har = await this._channel.harExport({ harId });
        const artifact = Artifact.from(har.artifact);
        const isCompressed = harParams.content === "attach" || harParams.path.endsWith(".zip");
        const needCompressed = harParams.path.endsWith(".zip");
        if (isCompressed && !needCompressed) {
          const localUtils = this._connection.localUtils();
          if (!localUtils)
            throw new Error("Uncompressed har is not supported in thin clients");
          await artifact.saveAs(harParams.path + ".tmp");
          await localUtils.harUnzip({ zipFile: harParams.path + ".tmp", harFile: harParams.path });
        } else {
          await artifact.saveAs(harParams.path);
        }
        await artifact.delete();
      }
    }, { internal: true });
    await this._channel.close(options);
    await this._closedPromise;
  }
  async _enableRecorder(params, eventSink) {
    if (eventSink)
      this._onRecorderEventSink = eventSink;
    await this._channel.enableRecorder(params);
  }
  async _disableRecorder() {
    this._onRecorderEventSink = void 0;
    await this._channel.disableRecorder();
  }
  async _exposeConsoleApi() {
    await this._channel.exposeConsoleApi();
  }
  _setAllowedProtocols(protocols) {
    this._allowedProtocols = protocols;
  }
  _checkUrlAllowed(url) {
    if (!this._allowedProtocols)
      return;
    let parsedURL;
    try {
      parsedURL = new URL(url);
    } catch (e) {
      throw new Error(`Access to ${url} is blocked. Invalid URL: ${e.message}`);
    }
    if (!this._allowedProtocols.includes(parsedURL.protocol))
      throw new Error(`Access to "${parsedURL.protocol}" URL is blocked. Allowed protocols: ${this._allowedProtocols.join(", ")}. Attempted URL: ${url}`);
  }
  _setAllowedDirectories(rootDirectories) {
    this._allowedDirectories = rootDirectories;
  }
  _checkFileAccess(filePath) {
    if (!this._allowedDirectories)
      return;
    const path = this._platform.path().resolve(filePath);
    const isInsideDir = (container, child) => {
      const path2 = this._platform.path();
      const rel = path2.relative(container, child);
      return !!rel && !rel.startsWith("..") && !path2.isAbsolute(rel);
    };
    if (this._allowedDirectories.some((root) => isInsideDir(root, path)))
      return;
    throw new Error(`File access denied: ${filePath} is outside allowed roots. Allowed roots: ${this._allowedDirectories.length ? this._allowedDirectories.join(", ") : "none"}`);
  }
}
async function prepareStorageState(platform, storageState) {
  if (typeof storageState !== "string")
    return storageState;
  try {
    return JSON.parse(await platform.fs().promises.readFile(storageState, "utf8"));
  } catch (e) {
    rewriteErrorMessage(e, `Error reading storage state from ${storageState}:
` + e.message);
    throw e;
  }
}
async function prepareBrowserContextParams(platform, options) {
  if (options.videoSize && !options.videosPath)
    throw new Error(`"videoSize" option requires "videosPath" to be specified`);
  if (options.extraHTTPHeaders)
    validateHeaders(options.extraHTTPHeaders);
  const contextParams = {
    ...options,
    viewport: options.viewport === null ? void 0 : options.viewport,
    noDefaultViewport: options.viewport === null,
    extraHTTPHeaders: options.extraHTTPHeaders ? headersObjectToArray(options.extraHTTPHeaders) : void 0,
    storageState: options.storageState ? await prepareStorageState(platform, options.storageState) : void 0,
    serviceWorkers: options.serviceWorkers,
    colorScheme: options.colorScheme === null ? "no-override" : options.colorScheme,
    reducedMotion: options.reducedMotion === null ? "no-override" : options.reducedMotion,
    forcedColors: options.forcedColors === null ? "no-override" : options.forcedColors,
    contrast: options.contrast === null ? "no-override" : options.contrast,
    acceptDownloads: toAcceptDownloadsProtocol(options.acceptDownloads),
    clientCertificates: await toClientCertificatesProtocol(platform, options.clientCertificates)
  };
  if (!contextParams.recordVideo && options.videosPath) {
    contextParams.recordVideo = {
      dir: options.videosPath,
      size: options.videoSize
    };
  }
  if (contextParams.recordVideo && contextParams.recordVideo.dir)
    contextParams.recordVideo.dir = platform.path().resolve(contextParams.recordVideo.dir);
  return contextParams;
}
function toAcceptDownloadsProtocol(acceptDownloads) {
  if (acceptDownloads === void 0)
    return void 0;
  if (acceptDownloads)
    return "accept";
  return "deny";
}
async function toClientCertificatesProtocol(platform, certs) {
  if (!certs)
    return void 0;
  const bufferizeContent = async (value, path) => {
    if (value)
      return value;
    if (path)
      return await platform.fs().promises.readFile(path);
  };
  return await Promise.all(certs.map(async (cert) => ({
    origin: cert.origin,
    cert: await bufferizeContent(cert.cert, cert.certPath),
    key: await bufferizeContent(cert.key, cert.keyPath),
    pfx: await bufferizeContent(cert.pfx, cert.pfxPath),
    passphrase: cert.passphrase
  })));
}

export { BrowserContext, prepareBrowserContextParams, toClientCertificatesProtocol };
