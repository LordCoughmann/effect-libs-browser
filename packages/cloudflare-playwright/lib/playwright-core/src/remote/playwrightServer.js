import { PlaywrightConnection } from './playwrightConnection.js';
import { createPlaywright } from '../server/playwright.js';
import { Semaphore } from '../utils/isomorphic/semaphore.js';
import { DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT } from '../utils/isomorphic/time.js';
import { WSServer } from '../server/utils/wsServer.js';
import { wrapInASCIIBox } from '../server/utils/ascii.js';
import { getPlaywrightVersion } from '../server/utils/userAgent.js';
import '../../../_virtual/pixelmatch.js';
import '../utilsBundle.js';
import 'node:crypto';
import { isUnderTest } from '../server/utils/debug.js';
import { debugLogger } from '../server/utils/debugLogger.js';
import '../server/utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../zipBundle.js';
import '../server/utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../server/utils/happyEyeballs.js';
import '../server/utils/nodePlatform.js';
import '../server/utils/profiler.js';
import { SocksProxy } from '../server/utils/socksProxy.js';
import '../server/utils/zones.js';
import { Browser } from '../server/browser.js';
import { ProgressController } from '../server/progress.js';

class PlaywrightServer {
  constructor(options) {
    this._dontReuseBrowsers = /* @__PURE__ */ new Set();
    this._options = options;
    if (options.preLaunchedBrowser) {
      this._playwright = options.preLaunchedBrowser.attribution.playwright;
      this._dontReuse(options.preLaunchedBrowser);
    }
    if (options.preLaunchedAndroidDevice)
      this._playwright = options.preLaunchedAndroidDevice._android.attribution.playwright;
    this._playwright ??= createPlaywright({ sdkLanguage: "javascript", isServer: true });
    const browserSemaphore = new Semaphore(this._options.maxConnections);
    const controllerSemaphore = new Semaphore(1);
    const reuseBrowserSemaphore = new Semaphore(1);
    this._wsServer = new WSServer({
      onRequest: (request, response) => {
        if (request.method === "GET" && request.url === "/json") {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({
            wsEndpointPath: this._options.path
          }));
          return;
        }
        response.end("Running");
      },
      onUpgrade: (request, socket) => {
        const uaError = userAgentVersionMatchesErrorMessage(request.headers["user-agent"] || "");
        if (uaError)
          return { error: `HTTP/${request.httpVersion} 428 Precondition Required\r
\r
${uaError}` };
      },
      onHeaders: (headers) => {
        if (process.env.PWTEST_SERVER_WS_HEADERS)
          headers.push(process.env.PWTEST_SERVER_WS_HEADERS);
      },
      onConnection: (request, url, ws, id) => {
        const browserHeader = request.headers["x-playwright-browser"];
        const browserName = url.searchParams.get("browser") || (Array.isArray(browserHeader) ? browserHeader[0] : browserHeader) || null;
        const proxyHeader = request.headers["x-playwright-proxy"];
        const proxyValue = url.searchParams.get("proxy") || (Array.isArray(proxyHeader) ? proxyHeader[0] : proxyHeader);
        const launchOptionsHeader = request.headers["x-playwright-launch-options"] || "";
        const launchOptionsHeaderValue = Array.isArray(launchOptionsHeader) ? launchOptionsHeader[0] : launchOptionsHeader;
        const launchOptionsParam = url.searchParams.get("launch-options");
        let launchOptions = { timeout: DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT };
        try {
          launchOptions = JSON.parse(launchOptionsParam || launchOptionsHeaderValue);
          if (!launchOptions.timeout)
            launchOptions.timeout = DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT;
        } catch (e) {
        }
        const isExtension = this._options.mode === "extension";
        const allowFSPaths = isExtension;
        launchOptions = filterLaunchOptions(launchOptions, allowFSPaths);
        if (isExtension) {
          const connectFilter = url.searchParams.get("connect");
          if (connectFilter) {
            if (connectFilter !== "first")
              throw new Error(`Unknown connect filter: ${connectFilter}`);
            return new PlaywrightConnection(
              browserSemaphore,
              ws,
              false,
              this._playwright,
              () => this._initConnectMode(id, connectFilter, browserName, launchOptions),
              id
            );
          }
          if (url.searchParams.has("debug-controller")) {
            return new PlaywrightConnection(
              controllerSemaphore,
              ws,
              true,
              this._playwright,
              async () => {
                throw new Error("shouldnt be used");
              },
              id
            );
          }
          return new PlaywrightConnection(
            reuseBrowserSemaphore,
            ws,
            false,
            this._playwright,
            () => this._initReuseBrowsersMode(browserName, launchOptions, id),
            id
          );
        }
        if (this._options.mode === "launchServer" || this._options.mode === "launchServerShared") {
          if (this._options.preLaunchedBrowser) {
            return new PlaywrightConnection(
              browserSemaphore,
              ws,
              false,
              this._playwright,
              () => this._initPreLaunchedBrowserMode(id),
              id
            );
          }
          return new PlaywrightConnection(
            browserSemaphore,
            ws,
            false,
            this._playwright,
            () => this._initPreLaunchedAndroidMode(id),
            id
          );
        }
        return new PlaywrightConnection(
          browserSemaphore,
          ws,
          false,
          this._playwright,
          () => this._initLaunchBrowserMode(browserName, proxyValue, launchOptions, id),
          id
        );
      }
    });
  }
  async _initReuseBrowsersMode(browserName, launchOptions, id) {
    debugLogger.log("server", `[${id}] engaged reuse browsers mode for ${browserName}`);
    const requestedOptions = launchOptionsHash(launchOptions);
    let browser = this._playwright.allBrowsers().find((b) => {
      if (b.options.name !== browserName)
        return false;
      if (this._dontReuseBrowsers.has(b))
        return false;
      const existingOptions = launchOptionsHash({ ...b.options.originalLaunchOptions, timeout: DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT });
      return existingOptions === requestedOptions;
    });
    for (const b of this._playwright.allBrowsers()) {
      if (b === browser)
        continue;
      if (this._dontReuseBrowsers.has(b))
        continue;
      if (b.options.name === browserName && b.options.channel === launchOptions.channel)
        await b.close({ reason: "Connection terminated" });
    }
    if (!browser) {
      const browserType = this._playwright[browserName || "chromium"];
      const controller = new ProgressController();
      browser = await controller.run((progress) => browserType.launch(progress, {
        ...launchOptions,
        headless: !!process.env.PW_DEBUG_CONTROLLER_HEADLESS
      }), launchOptions.timeout);
    }
    return {
      preLaunchedBrowser: browser,
      denyLaunch: true,
      dispose: async () => {
        for (const context of browser.contexts()) {
          if (!context.pages().length)
            await context.close({ reason: "Connection terminated" });
        }
      }
    };
  }
  async _initConnectMode(id, filter, browserName, launchOptions) {
    browserName ??= "chromium";
    debugLogger.log("server", `[${id}] engaged connect mode`);
    let browser = this._playwright.allBrowsers().find((b) => b.options.name === browserName);
    if (!browser) {
      const browserType = this._playwright[browserName];
      const controller = new ProgressController();
      browser = await controller.run((progress) => browserType.launch(progress, launchOptions), launchOptions.timeout);
      this._dontReuse(browser);
    }
    return {
      preLaunchedBrowser: browser,
      denyLaunch: true,
      sharedBrowser: true
    };
  }
  async _initPreLaunchedBrowserMode(id) {
    debugLogger.log("server", `[${id}] engaged pre-launched (browser) mode`);
    const browser = this._options.preLaunchedBrowser;
    for (const b of this._playwright.allBrowsers()) {
      if (b !== browser)
        await b.close({ reason: "Connection terminated" });
    }
    return {
      preLaunchedBrowser: browser,
      socksProxy: this._options.preLaunchedSocksProxy,
      sharedBrowser: this._options.mode === "launchServerShared",
      denyLaunch: true
    };
  }
  async _initPreLaunchedAndroidMode(id) {
    debugLogger.log("server", `[${id}] engaged pre-launched (Android) mode`);
    const androidDevice = this._options.preLaunchedAndroidDevice;
    return {
      preLaunchedAndroidDevice: androidDevice,
      denyLaunch: true
    };
  }
  async _initLaunchBrowserMode(browserName, proxyValue, launchOptions, id) {
    debugLogger.log("server", `[${id}] engaged launch mode for "${browserName}"`);
    let socksProxy;
    if (proxyValue) {
      socksProxy = new SocksProxy();
      socksProxy.setPattern(proxyValue);
      launchOptions.socksProxyPort = await socksProxy.listen(0);
      debugLogger.log("server", `[${id}] started socks proxy on port ${launchOptions.socksProxyPort}`);
    } else {
      launchOptions.socksProxyPort = void 0;
    }
    const browserType = this._playwright[browserName];
    const controller = new ProgressController();
    const browser = await controller.run((progress) => browserType.launch(progress, launchOptions), launchOptions.timeout);
    this._dontReuseBrowsers.add(browser);
    return {
      preLaunchedBrowser: browser,
      socksProxy,
      denyLaunch: true,
      dispose: async () => {
        await browser.close({ reason: "Connection terminated" });
        socksProxy?.close();
      }
    };
  }
  _dontReuse(browser) {
    this._dontReuseBrowsers.add(browser);
    browser.on(Browser.Events.Disconnected, () => {
      this._dontReuseBrowsers.delete(browser);
    });
  }
  async listen(port = 0, hostname) {
    return this._wsServer.listen(port, hostname, this._options.path);
  }
  async close() {
    await this._wsServer.close();
  }
}
function userAgentVersionMatchesErrorMessage(userAgent) {
  const match = userAgent.match(/^Playwright\/(\d+\.\d+\.\d+)/);
  if (!match) {
    return;
  }
  const received = match[1].split(".").slice(0, 2).join(".");
  const expected = getPlaywrightVersion(true);
  if (received !== expected) {
    return wrapInASCIIBox([
      `Playwright version mismatch:`,
      `  - server version: v${expected}`,
      `  - client version: v${received}`,
      ``,
      `If you are using VSCode extension, restart VSCode.`,
      ``,
      `If you are connecting to a remote service,`,
      `keep your local Playwright version in sync`,
      `with the remote service version.`,
      ``,
      `<3 Playwright Team`
    ].join("\n"), 1);
  }
}
function launchOptionsHash(options) {
  const copy = { ...options };
  for (const k of Object.keys(copy)) {
    const key = k;
    if (copy[key] === defaultLaunchOptions[key])
      delete copy[key];
  }
  for (const key of optionsThatAllowBrowserReuse)
    delete copy[key];
  return JSON.stringify(copy);
}
function filterLaunchOptions(options, allowFSPaths) {
  return {
    channel: options.channel,
    args: options.args,
    ignoreAllDefaultArgs: options.ignoreAllDefaultArgs,
    ignoreDefaultArgs: options.ignoreDefaultArgs,
    timeout: options.timeout,
    headless: options.headless,
    proxy: options.proxy,
    chromiumSandbox: options.chromiumSandbox,
    firefoxUserPrefs: options.firefoxUserPrefs,
    slowMo: options.slowMo,
    executablePath: isUnderTest() || allowFSPaths ? options.executablePath : void 0,
    downloadsPath: allowFSPaths ? options.downloadsPath : void 0
  };
}
const defaultLaunchOptions = {
  ignoreAllDefaultArgs: false,
  handleSIGINT: false,
  handleSIGTERM: false,
  handleSIGHUP: false,
  headless: true
};
const optionsThatAllowBrowserReuse = [
  "headless",
  "timeout",
  "tracesDir"
];

export { PlaywrightServer };
