import { Browser } from './browser.js';
import { prepareBrowserContextParams, BrowserContext } from './browserContext.js';
import { ChannelOwner } from './channelOwner.js';
import { envObjectToArray } from './clientHelper.js';
import { Events } from './events.js';
import { assert } from '../utils/isomorphic/assert.js';
import { headersObjectToArray } from '../utils/isomorphic/headers.js';
import { monotonicTime } from '../utils/isomorphic/time.js';
import { raceAgainstDeadline } from '../utils/isomorphic/timeoutRunner.js';
import { connectOverWebSocket } from './webSocket.js';
import { TimeoutSettings } from './timeoutSettings.js';

class BrowserType extends ChannelOwner {
  constructor() {
    super(...arguments);
    this._contexts = /* @__PURE__ */ new Set();
  }
  static from(browserType) {
    return browserType._object;
  }
  executablePath() {
    if (!this._initializer.executablePath)
      throw new Error("Browser is not supported on current platform");
    return this._initializer.executablePath;
  }
  name() {
    return this._initializer.name;
  }
  async launch(options = {}) {
    assert(!options.userDataDir, "userDataDir option is not supported in `browserType.launch`. Use `browserType.launchPersistentContext` instead");
    assert(!options.port, "Cannot specify a port without launching as a server.");
    const logger = options.logger || this._playwright._defaultLaunchOptions?.logger;
    options = { ...this._playwright._defaultLaunchOptions, ...options };
    const launchOptions = {
      ...options,
      ignoreDefaultArgs: Array.isArray(options.ignoreDefaultArgs) ? options.ignoreDefaultArgs : void 0,
      ignoreAllDefaultArgs: !!options.ignoreDefaultArgs && !Array.isArray(options.ignoreDefaultArgs),
      env: options.env ? envObjectToArray(options.env) : void 0,
      timeout: new TimeoutSettings(this._platform).launchTimeout(options)
    };
    return await this._wrapApiCall(async () => {
      const browser = Browser.from((await this._channel.launch(launchOptions)).browser);
      browser._connectToBrowserType(this, options, logger);
      return browser;
    });
  }
  async launchServer(options = {}) {
    if (!this._serverLauncher)
      throw new Error("Launching server is not supported");
    options = { ...this._playwright._defaultLaunchOptions, ...options };
    return await this._serverLauncher.launchServer(options);
  }
  async launchPersistentContext(userDataDir, options = {}) {
    assert(!options.port, "Cannot specify a port without launching as a server.");
    options = this._playwright.selectors._withSelectorOptions({
      ...this._playwright._defaultLaunchOptions,
      ...options
    });
    await this._instrumentation.runBeforeCreateBrowserContext(options);
    const logger = options.logger || this._playwright._defaultLaunchOptions?.logger;
    const contextParams = await prepareBrowserContextParams(this._platform, options);
    const persistentParams = {
      ...contextParams,
      ignoreDefaultArgs: Array.isArray(options.ignoreDefaultArgs) ? options.ignoreDefaultArgs : void 0,
      ignoreAllDefaultArgs: !!options.ignoreDefaultArgs && !Array.isArray(options.ignoreDefaultArgs),
      env: options.env ? envObjectToArray(options.env) : void 0,
      channel: options.channel,
      userDataDir: this._platform.path().isAbsolute(userDataDir) || !userDataDir ? userDataDir : this._platform.path().resolve(userDataDir),
      timeout: new TimeoutSettings(this._platform).launchTimeout(options)
    };
    const context = await this._wrapApiCall(async () => {
      const result = await this._channel.launchPersistentContext(persistentParams);
      const browser = Browser.from(result.browser);
      browser._connectToBrowserType(this, options, logger);
      const context2 = BrowserContext.from(result.context);
      await context2._initializeHarFromOptions(options.recordHar);
      return context2;
    });
    await this._instrumentation.runAfterCreateBrowserContext(context);
    return context;
  }
  async connect(optionsOrWsEndpoint, options) {
    if (typeof optionsOrWsEndpoint === "string")
      return await this._connect({ ...options, wsEndpoint: optionsOrWsEndpoint });
    assert(optionsOrWsEndpoint.wsEndpoint, "options.wsEndpoint is required");
    return await this._connect(optionsOrWsEndpoint);
  }
  async _connect(params) {
    const logger = params.logger;
    return await this._wrapApiCall(async () => {
      const deadline = params.timeout ? monotonicTime() + params.timeout : 0;
      const headers = { "x-playwright-browser": this.name(), ...params.headers };
      const connectParams = {
        wsEndpoint: params.wsEndpoint,
        headers,
        exposeNetwork: params.exposeNetwork ?? params._exposeNetwork,
        slowMo: params.slowMo,
        timeout: params.timeout || 0
      };
      if (params.__testHookRedirectPortForwarding)
        connectParams.socksProxyRedirectPortForTest = params.__testHookRedirectPortForwarding;
      const connection = await connectOverWebSocket(this._connection, connectParams);
      let browser;
      connection.on("close", () => {
        for (const context of browser?.contexts() || []) {
          for (const page of context.pages())
            page._onClose();
          context._onClose();
        }
        setTimeout(() => browser?._didClose(), 0);
      });
      const result = await raceAgainstDeadline(async () => {
        if (params.__testHookBeforeCreateBrowser)
          await params.__testHookBeforeCreateBrowser();
        const playwright = await connection.initializePlaywright();
        if (!playwright._initializer.preLaunchedBrowser) {
          connection.close();
          throw new Error("Malformed endpoint. Did you use BrowserType.launchServer method?");
        }
        playwright.selectors = this._playwright.selectors;
        browser = Browser.from(playwright._initializer.preLaunchedBrowser);
        browser._connectToBrowserType(this, {}, logger);
        browser._shouldCloseConnectionOnClose = true;
        browser.on(Events.Browser.Disconnected, () => connection.close());
        return browser;
      }, deadline);
      if (!result.timedOut) {
        return result.result;
      } else {
        connection.close();
        throw new Error(`Timeout ${params.timeout}ms exceeded`);
      }
    });
  }
  async connectOverCDP(endpointURLOrOptions, options) {
    if (typeof endpointURLOrOptions === "string")
      return await this._connectOverCDP(endpointURLOrOptions, options);
    const endpointURL = "endpointURL" in endpointURLOrOptions ? endpointURLOrOptions.endpointURL : endpointURLOrOptions.wsEndpoint;
    assert(endpointURL, "Cannot connect over CDP without wsEndpoint.");
    return await this.connectOverCDP(endpointURL, endpointURLOrOptions);
  }
  async _connectOverCDP(endpointURL, params = {}) {
    if (this.name() !== "chromium")
      throw new Error("Connecting over CDP is only supported in Chromium.");
    const headers = params.headers ? headersObjectToArray(params.headers) : void 0;
    const result = await this._channel.connectOverCDP({
      endpointURL,
      headers,
      slowMo: params.slowMo,
      timeout: new TimeoutSettings(this._platform).timeout(params),
      isLocal: params.isLocal
    });
    const browser = Browser.from(result.browser);
    browser._connectToBrowserType(this, {}, params.logger);
    if (result.defaultContext)
      await this._instrumentation.runAfterCreateBrowserContext(BrowserContext.from(result.defaultContext));
    return browser;
  }
}

export { BrowserType };
