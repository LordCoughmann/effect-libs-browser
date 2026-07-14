import fs from 'node:fs';
import os from 'node:os';
import path__default from 'node:path';
import { chromiumSwitches } from './chromiumSwitches.js';
import { CRBrowser } from './crBrowser.js';
import { kBrowserCloseMessageId } from './crConnection.js';
import { headersArrayToObject, headersObjectToArray } from '../../utils/isomorphic/headers.js';
import { ManualPromise } from '../../utils/isomorphic/manualPromise.js';
import { wrapInASCIIBox } from '../utils/ascii.js';
import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import { debugMode } from '../utils/debug.js';
import { RecentLogsCollector } from '../utils/debugLogger.js';
import '../utils/expectUtils.js';
import { removeFolders } from '../utils/fileUtils.js';
import { hasGpuMac } from '../utils/hostPlatform.js';
import { fetchData } from '../utils/network.js';
import '../utils/nodePlatform.js';
import { gracefullyCloseSet } from '../utils/processLauncher.js';
import '../utils/profiler.js';
import '../utils/socksProxy.js';
import { getUserAgent } from '../utils/userAgent.js';
import '../../zipBundle.js';
import '../utils/zones.js';
import { validateBrowserContextOptions } from '../browserContext.js';
import { BrowserType, kNoXServerRunningError } from '../browserType.js';
import { helper } from '../helper.js';
import { registry } from '../registry/index.js';
import { WebSocketTransport } from '../../../../cloudflare/webSocketTransport.js';
import { CRDevTools } from './crDevTools.js';
import { Browser } from '../browser.js';

const ARTIFACTS_FOLDER = path__default.join(os.tmpdir(), "playwright-artifacts-");
class Chromium extends BrowserType {
  constructor(parent, bidiChromium) {
    super(parent, "chromium");
    this._bidiChromium = bidiChromium;
    if (debugMode() === "inspector")
      this._devtools = this._createDevTools();
  }
  launch(progress, options, protocolLogger) {
    if (options.channel?.startsWith("bidi-"))
      return this._bidiChromium.launch(progress, options, protocolLogger);
    return super.launch(progress, options, protocolLogger);
  }
  async launchPersistentContext(progress, userDataDir, options) {
    if (options.channel?.startsWith("bidi-"))
      return this._bidiChromium.launchPersistentContext(progress, userDataDir, options);
    return super.launchPersistentContext(progress, userDataDir, options);
  }
  async connectOverCDP(progress, endpointURL, options) {
    return await this._connectOverCDPInternal(progress, endpointURL, options);
  }
  async _connectOverCDPInternal(progress, endpointURL, options, onClose) {
    let headersMap;
    if (options.headers)
      headersMap = headersArrayToObject(options.headers, false);
    if (!headersMap)
      headersMap = { "User-Agent": getUserAgent() };
    else if (headersMap && !Object.keys(headersMap).some((key) => key.toLowerCase() === "user-agent"))
      headersMap["User-Agent"] = getUserAgent();
    const artifactsDir = await progress.race(fs.promises.mkdtemp(ARTIFACTS_FOLDER));
    const doCleanup = async () => {
      await removeFolders([artifactsDir]);
      const cb = onClose;
      onClose = void 0;
      await cb?.();
    };
    let chromeTransport;
    const doClose = async () => {
      await chromeTransport?.closeAndWait();
      await doCleanup();
    };
    try {
      const wsEndpoint = await urlToWSEndpoint(progress, endpointURL, headersMap);
      chromeTransport = await WebSocketTransport.connect(progress, wsEndpoint, { headers: headersMap });
      const browserProcess = { close: doClose, kill: doClose };
      const noDefaultViewport = globalThis.navigator?.userAgent !== "Cloudflare-Workers";
      const persistent = new URL(endpointURL).searchParams.has("persistent") ? { noDefaultViewport } : void 0;
      const browserOptions = {
        slowMo: options.slowMo,
        name: "chromium",
        isChromium: true,
        persistent,
        browserProcess,
        protocolLogger: helper.debugProtocolLogger(),
        browserLogsCollector: new RecentLogsCollector(),
        artifactsDir,
        downloadsPath: options.downloadsPath || artifactsDir,
        tracesDir: options.tracesDir || artifactsDir,
        originalLaunchOptions: {}
      };
      if (persistent)
        validateBrowserContextOptions(persistent, browserOptions);
      const browser = await progress.race(CRBrowser.connect(this.attribution.playwright, chromeTransport, browserOptions));
      if (!options.isLocal)
        browser._isCollocatedWithServer = false;
      browser.on(Browser.Events.Disconnected, doCleanup);
      return browser;
    } catch (error) {
      await doClose().catch(() => {
      });
      throw error;
    }
  }
  _createDevTools() {
    const directory = registry.findExecutable("chromium").directory;
    return directory ? new CRDevTools(path__default.join(directory, "devtools-preferences.json")) : void 0;
  }
  async connectToTransport(transport, options, browserLogsCollector) {
    try {
      return await CRBrowser.connect(this.attribution.playwright, transport, options, this._devtools);
    } catch (e) {
      if (browserLogsCollector.recentLogs().some((log) => log.includes("Failed to create a ProcessSingleton for your profile directory."))) {
        throw new Error(
          "Failed to create a ProcessSingleton for your profile directory. This usually means that the profile is already in use by another instance of Chromium."
        );
      }
      throw e;
    }
  }
  doRewriteStartupLog(logs) {
    if (logs.includes("Missing X server"))
      logs = "\n" + wrapInASCIIBox(kNoXServerRunningError, 1);
    if (!logs.includes("crbug.com/357670") && !logs.includes("No usable sandbox!") && !logs.includes("crbug.com/638180"))
      return logs;
    return [
      `Chromium sandboxing failed!`,
      `================================`,
      `To avoid the sandboxing issue, do either of the following:`,
      `  - (preferred): Configure your environment to support sandboxing`,
      `  - (alternative): Launch Chromium without sandbox using 'chromiumSandbox: false' option`,
      `================================`,
      ``
    ].join("\n");
  }
  amendEnvironment(env) {
    return env;
  }
  attemptToGracefullyCloseBrowser(transport) {
    const message = { method: "Browser.close", id: kBrowserCloseMessageId, params: {} };
    transport.send(message);
  }
  async _launchWithSeleniumHub(progress, hubUrl, options) {
    await progress.race(this._createArtifactDirs(options));
    if (!hubUrl.endsWith("/"))
      hubUrl = hubUrl + "/";
    const args = this._innerDefaultArgs(options);
    args.push("--remote-debugging-port=0");
    const isEdge = options.channel && options.channel.startsWith("msedge");
    let desiredCapabilities = {
      "browserName": isEdge ? "MicrosoftEdge" : "chrome",
      [isEdge ? "ms:edgeOptions" : "goog:chromeOptions"]: { args }
    };
    if (process.env.SELENIUM_REMOTE_CAPABILITIES) {
      const remoteCapabilities = parseSeleniumRemoteParams({ name: "capabilities", value: process.env.SELENIUM_REMOTE_CAPABILITIES }, progress);
      if (remoteCapabilities)
        desiredCapabilities = { ...desiredCapabilities, ...remoteCapabilities };
    }
    let headers = {};
    if (process.env.SELENIUM_REMOTE_HEADERS) {
      const remoteHeaders = parseSeleniumRemoteParams({ name: "headers", value: process.env.SELENIUM_REMOTE_HEADERS }, progress);
      if (remoteHeaders)
        headers = remoteHeaders;
    }
    progress.log(`<selenium> connecting to ${hubUrl}`);
    const response = await fetchData(progress, {
      url: hubUrl + "session",
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...headers
      },
      data: JSON.stringify({
        capabilities: { alwaysMatch: desiredCapabilities }
      })
    }, seleniumErrorHandler);
    const value = JSON.parse(response).value;
    const sessionId = value.sessionId;
    progress.log(`<selenium> connected to sessionId=${sessionId}`);
    const disconnectFromSelenium = async () => {
      progress.log(`<selenium> disconnecting from sessionId=${sessionId}`);
      await fetchData(void 0, {
        url: hubUrl + "session/" + sessionId,
        method: "DELETE",
        headers
      }).catch((error) => progress.log(`<error disconnecting from selenium>: ${error}`));
      progress.log(`<selenium> disconnected from sessionId=${sessionId}`);
      gracefullyCloseSet.delete(disconnectFromSelenium);
    };
    gracefullyCloseSet.add(disconnectFromSelenium);
    try {
      const capabilities = value.capabilities;
      let endpointURL;
      if (capabilities["se:cdp"]) {
        progress.log(`<selenium> using selenium v4`);
        const endpointURLString = addProtocol(capabilities["se:cdp"]);
        endpointURL = new URL(endpointURLString);
        if (endpointURL.hostname === "localhost" || endpointURL.hostname === "127.0.0.1")
          endpointURL.hostname = new URL(hubUrl).hostname;
        progress.log(`<selenium> retrieved endpoint ${endpointURL.toString()} for sessionId=${sessionId}`);
      } else {
        progress.log(`<selenium> using selenium v3`);
        const maybeChromeOptions = capabilities["goog:chromeOptions"];
        const chromeOptions = maybeChromeOptions && typeof maybeChromeOptions === "object" ? maybeChromeOptions : void 0;
        const debuggerAddress = chromeOptions && typeof chromeOptions.debuggerAddress === "string" ? chromeOptions.debuggerAddress : void 0;
        const chromeOptionsURL = typeof maybeChromeOptions === "string" ? maybeChromeOptions : void 0;
        const endpointURLString = addProtocol(debuggerAddress || chromeOptionsURL).replace("localhost", "127.0.0.1");
        progress.log(`<selenium> retrieved endpoint ${endpointURLString} for sessionId=${sessionId}`);
        endpointURL = new URL(endpointURLString);
        if (endpointURL.hostname === "localhost" || endpointURL.hostname === "127.0.0.1") {
          const sessionInfoUrl = new URL(hubUrl).origin + "/grid/api/testsession?session=" + sessionId;
          try {
            const sessionResponse = await fetchData(progress, {
              url: sessionInfoUrl,
              method: "GET",
              headers
            }, seleniumErrorHandler);
            const proxyId = JSON.parse(sessionResponse).proxyId;
            endpointURL.hostname = new URL(proxyId).hostname;
            progress.log(`<selenium> resolved endpoint ip ${endpointURL.toString()} for sessionId=${sessionId}`);
          } catch (e) {
            progress.log(`<selenium> unable to resolve endpoint ip for sessionId=${sessionId}, running in standalone?`);
          }
        }
      }
      return await this._connectOverCDPInternal(progress, endpointURL.toString(), {
        ...options,
        headers: headersObjectToArray(headers)
      }, disconnectFromSelenium);
    } catch (e) {
      await disconnectFromSelenium();
      throw e;
    }
  }
  async defaultArgs(options, isPersistent, userDataDir) {
    const chromeArguments = this._innerDefaultArgs(options);
    chromeArguments.push(`--user-data-dir=${userDataDir}`);
    if (options.cdpPort !== void 0)
      chromeArguments.push(`--remote-debugging-port=${options.cdpPort}`);
    else
      chromeArguments.push("--remote-debugging-pipe");
    if (isPersistent)
      chromeArguments.push("about:blank");
    else
      chromeArguments.push("--no-startup-window");
    return chromeArguments;
  }
  _innerDefaultArgs(options) {
    const { args = [] } = options;
    const userDataDirArg = args.find((arg) => arg.startsWith("--user-data-dir"));
    if (userDataDirArg)
      throw this._createUserDataDirArgMisuseError("--user-data-dir");
    if (args.find((arg) => arg.startsWith("--remote-debugging-pipe")))
      throw new Error("Playwright manages remote debugging connection itself.");
    if (args.find((arg) => !arg.startsWith("-")))
      throw new Error("Arguments can not specify page to be opened");
    const chromeArguments = [...chromiumSwitches(options.assistantMode, options.channel)];
    if (os.platform() !== "darwin" || !hasGpuMac()) {
      chromeArguments.push("--enable-unsafe-swiftshader");
    }
    if (options.headless) {
      chromeArguments.push("--headless");
      chromeArguments.push(
        "--hide-scrollbars",
        "--mute-audio",
        "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"
      );
    }
    if (options.chromiumSandbox !== true)
      chromeArguments.push("--no-sandbox");
    const proxy = options.proxyOverride || options.proxy;
    if (proxy) {
      const proxyURL = new URL(proxy.server);
      const isSocks = proxyURL.protocol === "socks5:";
      if (isSocks && !options.socksProxyPort) {
        chromeArguments.push(`--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE ${proxyURL.hostname}"`);
      }
      chromeArguments.push(`--proxy-server=${proxy.server}`);
      const proxyBypassRules = [];
      if (options.socksProxyPort)
        proxyBypassRules.push("<-loopback>");
      if (proxy.bypass)
        proxyBypassRules.push(...proxy.bypass.split(",").map((t) => t.trim()).map((t) => t.startsWith(".") ? "*" + t : t));
      if (!process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK && !proxyBypassRules.includes("<-loopback>"))
        proxyBypassRules.push("<-loopback>");
      if (proxyBypassRules.length > 0)
        chromeArguments.push(`--proxy-bypass-list=${proxyBypassRules.join(";")}`);
    }
    chromeArguments.push(...args);
    return chromeArguments;
  }
  async waitForReadyState(options, browserLogsCollector) {
    return waitForReadyState(options, browserLogsCollector);
  }
  getExecutableName(options) {
    if (options.channel && registry.isChromiumAlias(options.channel))
      return "chromium";
    if (options.channel === "chromium-tip-of-tree")
      return options.headless ? "chromium-tip-of-tree-headless-shell" : "chromium-tip-of-tree";
    if (options.channel)
      return options.channel;
    return options.headless ? "chromium-headless-shell" : "chromium";
  }
}
async function waitForReadyState(options, browserLogsCollector) {
  if (options.cdpPort === void 0 && !options.args?.some((a) => a.startsWith("--remote-debugging-port")))
    return {};
  const result = new ManualPromise();
  browserLogsCollector.onMessage((message) => {
    if (message.includes("Failed to create a ProcessSingleton for your profile directory.")) {
      result.reject(new Error("Failed to create a ProcessSingleton for your profile directory. This usually means that the profile is already in use by another instance of Chromium."));
    }
    const match = message.match(/DevTools listening on (.*)/);
    if (match)
      result.resolve({ wsEndpoint: match[1] });
  });
  return result;
}
async function urlToWSEndpoint(progress, endpointURL, headers) {
  if (endpointURL.startsWith("ws"))
    return endpointURL;
  progress.log(`<ws preparing> retrieving websocket url from ${endpointURL}`);
  const url = new URL(endpointURL);
  if (!url.pathname.endsWith("/"))
    url.pathname += "/";
  url.pathname += "json/version/";
  const httpURL = url.toString();
  const json = await fetchData(
    progress,
    {
      url: httpURL,
      headers
    },
    async (_, resp) => new Error(`Unexpected status ${resp.statusCode} when connecting to ${httpURL}.
This does not look like a DevTools server, try connecting via ws://.`)
  );
  return JSON.parse(json).webSocketDebuggerUrl;
}
async function seleniumErrorHandler(params, response) {
  const body = await streamToString(response);
  let message = body;
  try {
    const json = JSON.parse(body);
    message = json.value.localizedMessage || json.value.message;
  } catch (e) {
  }
  return new Error(`Error connecting to Selenium at ${params.url}: ${message}`);
}
function addProtocol(url) {
  if (!["ws://", "wss://", "http://", "https://"].some((protocol) => url.startsWith(protocol)))
    return "http://" + url;
  return url;
}
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
function parseSeleniumRemoteParams(env, progress) {
  try {
    const parsed = JSON.parse(env.value);
    progress.log(`<selenium> using additional ${env.name} "${env.value}"`);
    return parsed;
  } catch (e) {
    progress.log(`<selenium> ignoring additional ${env.name} "${env.value}": ${e}`);
  }
}

export { Chromium, waitForReadyState };
