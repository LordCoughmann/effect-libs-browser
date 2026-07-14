import { BrowserContext, prepareBrowserContextParams } from './browserContext.js';
import { ChannelOwner } from './channelOwner.js';
import { envObjectToArray } from './clientHelper.js';
import { ConsoleMessage } from './consoleMessage.js';
import { isTargetClosedError, TargetClosedError } from './errors.js';
import { Events } from './events.js';
import { JSHandle, serializeArgument, parseResult } from './jsHandle.js';
import { Waiter } from './waiter.js';
import { TimeoutSettings } from './timeoutSettings.js';

class Electron extends ChannelOwner {
  static from(electron) {
    return electron._object;
  }
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
  }
  async launch(options = {}) {
    options = this._playwright.selectors._withSelectorOptions(options);
    const params = {
      ...await prepareBrowserContextParams(this._platform, options),
      env: envObjectToArray(options.env ? options.env : this._platform.env),
      tracesDir: options.tracesDir,
      timeout: new TimeoutSettings(this._platform).launchTimeout(options)
    };
    const app = ElectronApplication.from((await this._channel.launch(params)).electronApplication);
    this._playwright.selectors._contextsForSelectors.add(app._context);
    app.once(Events.ElectronApplication.Close, () => this._playwright.selectors._contextsForSelectors.delete(app._context));
    await app._context._initializeHarFromOptions(options.recordHar);
    app._context.tracing._tracesDir = options.tracesDir;
    return app;
  }
}
class ElectronApplication extends ChannelOwner {
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this._windows = /* @__PURE__ */ new Set();
    this._timeoutSettings = new TimeoutSettings(this._platform);
    this._context = BrowserContext.from(initializer.context);
    for (const page of this._context._pages)
      this._onPage(page);
    this._context.on(Events.BrowserContext.Page, (page) => this._onPage(page));
    this._channel.on("close", () => {
      this.emit(Events.ElectronApplication.Close);
    });
    this._channel.on("console", (event) => this.emit(Events.ElectronApplication.Console, new ConsoleMessage(this._platform, event, null, null)));
    this._setEventToSubscriptionMapping(/* @__PURE__ */ new Map([
      [Events.ElectronApplication.Console, "console"]
    ]));
  }
  static from(electronApplication) {
    return electronApplication._object;
  }
  process() {
    return this._connection.toImpl?.(this)?.process();
  }
  _onPage(page) {
    this._windows.add(page);
    this.emit(Events.ElectronApplication.Window, page);
    page.once(Events.Page.Close, () => this._windows.delete(page));
  }
  windows() {
    return [...this._windows];
  }
  async firstWindow(options) {
    if (this._windows.size)
      return this._windows.values().next().value;
    return await this.waitForEvent("window", options);
  }
  context() {
    return this._context;
  }
  async [Symbol.asyncDispose]() {
    await this.close();
  }
  async close() {
    try {
      await this._context.close();
    } catch (e) {
      if (isTargetClosedError(e))
        return;
      throw e;
    }
  }
  async waitForEvent(event, optionsOrPredicate = {}) {
    return await this._wrapApiCall(async () => {
      const timeout = this._timeoutSettings.timeout(typeof optionsOrPredicate === "function" ? {} : optionsOrPredicate);
      const predicate = typeof optionsOrPredicate === "function" ? optionsOrPredicate : optionsOrPredicate.predicate;
      const waiter = Waiter.createForEvent(this, event);
      waiter.rejectOnTimeout(timeout, `Timeout ${timeout}ms exceeded while waiting for event "${event}"`);
      if (event !== Events.ElectronApplication.Close)
        waiter.rejectOnEvent(this, Events.ElectronApplication.Close, () => new TargetClosedError());
      const result = await waiter.waitForEvent(this, event, predicate);
      waiter.dispose();
      return result;
    });
  }
  async browserWindow(page) {
    const result = await this._channel.browserWindow({ page: page._channel });
    return JSHandle.from(result.handle);
  }
  async evaluate(pageFunction, arg) {
    const result = await this._channel.evaluateExpression({ expression: String(pageFunction), isFunction: typeof pageFunction === "function", arg: serializeArgument(arg) });
    return parseResult(result.value);
  }
  async evaluateHandle(pageFunction, arg) {
    const result = await this._channel.evaluateExpressionHandle({ expression: String(pageFunction), isFunction: typeof pageFunction === "function", arg: serializeArgument(arg) });
    return JSHandle.from(result.handle);
  }
}

export { Electron, ElectronApplication };
