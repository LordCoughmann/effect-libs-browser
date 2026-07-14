import { EventEmitter } from './eventEmitter.js';
import { prepareBrowserContextParams, BrowserContext } from './browserContext.js';
import { ChannelOwner } from './channelOwner.js';
import { isTargetClosedError, TargetClosedError } from './errors.js';
import { Events } from './events.js';
import { Waiter } from './waiter.js';
import { TimeoutSettings } from './timeoutSettings.js';
import { isRegExp } from '../utils/isomorphic/rtti.js';
import { monotonicTime } from '../utils/isomorphic/time.js';
import { raceAgainstDeadline } from '../utils/isomorphic/timeoutRunner.js';
import { connectOverWebSocket } from './webSocket.js';
import { isString } from '../utils/isomorphic/stringUtils.js';

class Android extends ChannelOwner {
  static from(android) {
    return android._object;
  }
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this._timeoutSettings = new TimeoutSettings(this._platform);
  }
  setDefaultTimeout(timeout) {
    this._timeoutSettings.setDefaultTimeout(timeout);
  }
  async devices(options = {}) {
    const { devices } = await this._channel.devices(options);
    return devices.map((d) => AndroidDevice.from(d));
  }
  async launchServer(options = {}) {
    if (!this._serverLauncher)
      throw new Error("Launching server is not supported");
    return await this._serverLauncher.launchServer(options);
  }
  async connect(wsEndpoint, options = {}) {
    return await this._wrapApiCall(async () => {
      const deadline = options.timeout ? monotonicTime() + options.timeout : 0;
      const headers = { "x-playwright-browser": "android", ...options.headers };
      const connectParams = { wsEndpoint, headers, slowMo: options.slowMo, timeout: options.timeout || 0 };
      const connection = await connectOverWebSocket(this._connection, connectParams);
      let device;
      connection.on("close", () => {
        device?._didClose();
      });
      const result = await raceAgainstDeadline(async () => {
        const playwright = await connection.initializePlaywright();
        if (!playwright._initializer.preConnectedAndroidDevice) {
          connection.close();
          throw new Error("Malformed endpoint. Did you use Android.launchServer method?");
        }
        device = AndroidDevice.from(playwright._initializer.preConnectedAndroidDevice);
        device._shouldCloseConnectionOnClose = true;
        device.on(Events.AndroidDevice.Close, () => connection.close());
        return device;
      }, deadline);
      if (!result.timedOut) {
        return result.result;
      } else {
        connection.close();
        throw new Error(`Timeout ${options.timeout}ms exceeded`);
      }
    });
  }
}
class AndroidDevice extends ChannelOwner {
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this._webViews = /* @__PURE__ */ new Map();
    this._shouldCloseConnectionOnClose = false;
    this._android = parent;
    this.input = new AndroidInput(this);
    this._timeoutSettings = new TimeoutSettings(this._platform, parent._timeoutSettings);
    this._channel.on("webViewAdded", ({ webView }) => this._onWebViewAdded(webView));
    this._channel.on("webViewRemoved", ({ socketName }) => this._onWebViewRemoved(socketName));
    this._channel.on("close", () => this._didClose());
  }
  static from(androidDevice) {
    return androidDevice._object;
  }
  _onWebViewAdded(webView) {
    const view = new AndroidWebView(this, webView);
    this._webViews.set(webView.socketName, view);
    this.emit(Events.AndroidDevice.WebView, view);
  }
  _onWebViewRemoved(socketName) {
    const view = this._webViews.get(socketName);
    this._webViews.delete(socketName);
    if (view)
      view.emit(Events.AndroidWebView.Close);
  }
  setDefaultTimeout(timeout) {
    this._timeoutSettings.setDefaultTimeout(timeout);
  }
  serial() {
    return this._initializer.serial;
  }
  model() {
    return this._initializer.model;
  }
  webViews() {
    return [...this._webViews.values()];
  }
  async webView(selector, options) {
    const predicate = (v) => {
      if (selector.pkg)
        return v.pkg() === selector.pkg;
      if (selector.socketName)
        return v._socketName() === selector.socketName;
      return false;
    };
    const webView = [...this._webViews.values()].find(predicate);
    if (webView)
      return webView;
    return await this.waitForEvent("webview", { ...options, predicate });
  }
  async wait(selector, options = {}) {
    await this._channel.wait({ androidSelector: toSelectorChannel(selector), ...options, timeout: this._timeoutSettings.timeout(options) });
  }
  async fill(selector, text, options = {}) {
    await this._channel.fill({ androidSelector: toSelectorChannel(selector), text, ...options, timeout: this._timeoutSettings.timeout(options) });
  }
  async press(selector, key, options = {}) {
    await this.tap(selector, options);
    await this.input.press(key);
  }
  async tap(selector, options = {}) {
    await this._channel.tap({ androidSelector: toSelectorChannel(selector), ...options, timeout: this._timeoutSettings.timeout(options) });
  }
  async drag(selector, dest, options = {}) {
    await this._channel.drag({ androidSelector: toSelectorChannel(selector), dest, ...options, timeout: this._timeoutSettings.timeout(options) });
  }
  async fling(selector, direction, options = {}) {
    await this._channel.fling({ androidSelector: toSelectorChannel(selector), direction, ...options, timeout: this._timeoutSettings.timeout(options) });
  }
  async longTap(selector, options = {}) {
    await this._channel.longTap({ androidSelector: toSelectorChannel(selector), ...options, timeout: this._timeoutSettings.timeout(options) });
  }
  async pinchClose(selector, percent, options = {}) {
    await this._channel.pinchClose({ androidSelector: toSelectorChannel(selector), percent, ...options, timeout: this._timeoutSettings.timeout(options) });
  }
  async pinchOpen(selector, percent, options = {}) {
    await this._channel.pinchOpen({ androidSelector: toSelectorChannel(selector), percent, ...options, timeout: this._timeoutSettings.timeout(options) });
  }
  async scroll(selector, direction, percent, options = {}) {
    await this._channel.scroll({ androidSelector: toSelectorChannel(selector), direction, percent, ...options, timeout: this._timeoutSettings.timeout(options) });
  }
  async swipe(selector, direction, percent, options = {}) {
    await this._channel.swipe({ androidSelector: toSelectorChannel(selector), direction, percent, ...options, timeout: this._timeoutSettings.timeout(options) });
  }
  async info(selector) {
    return (await this._channel.info({ androidSelector: toSelectorChannel(selector) })).info;
  }
  async screenshot(options = {}) {
    const { binary } = await this._channel.screenshot();
    if (options.path)
      await this._platform.fs().promises.writeFile(options.path, binary);
    return binary;
  }
  async [Symbol.asyncDispose]() {
    await this.close();
  }
  async close() {
    try {
      if (this._shouldCloseConnectionOnClose)
        this._connection.close();
      else
        await this._channel.close();
    } catch (e) {
      if (isTargetClosedError(e))
        return;
      throw e;
    }
  }
  _didClose() {
    this.emit(Events.AndroidDevice.Close, this);
  }
  async shell(command) {
    const { result } = await this._channel.shell({ command });
    return result;
  }
  async open(command) {
    return AndroidSocket.from((await this._channel.open({ command })).socket);
  }
  async installApk(file, options) {
    await this._channel.installApk({ file: await loadFile(this._platform, file), args: options && options.args });
  }
  async push(file, path, options) {
    await this._channel.push({ file: await loadFile(this._platform, file), path, mode: options ? options.mode : void 0 });
  }
  async launchBrowser(options = {}) {
    const contextOptions = await prepareBrowserContextParams(this._platform, options);
    const result = await this._channel.launchBrowser(contextOptions);
    const context = BrowserContext.from(result.context);
    const selectors = this._android._playwright.selectors;
    selectors._contextsForSelectors.add(context);
    context.once(Events.BrowserContext.Close, () => selectors._contextsForSelectors.delete(context));
    await context._initializeHarFromOptions(options.recordHar);
    return context;
  }
  async waitForEvent(event, optionsOrPredicate = {}) {
    return await this._wrapApiCall(async () => {
      const timeout = this._timeoutSettings.timeout(typeof optionsOrPredicate === "function" ? {} : optionsOrPredicate);
      const predicate = typeof optionsOrPredicate === "function" ? optionsOrPredicate : optionsOrPredicate.predicate;
      const waiter = Waiter.createForEvent(this, event);
      waiter.rejectOnTimeout(timeout, `Timeout ${timeout}ms exceeded while waiting for event "${event}"`);
      if (event !== Events.AndroidDevice.Close)
        waiter.rejectOnEvent(this, Events.AndroidDevice.Close, () => new TargetClosedError());
      const result = await waiter.waitForEvent(this, event, predicate);
      waiter.dispose();
      return result;
    });
  }
}
class AndroidSocket extends ChannelOwner {
  static from(androidDevice) {
    return androidDevice._object;
  }
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this._channel.on("data", ({ data }) => this.emit(Events.AndroidSocket.Data, data));
    this._channel.on("close", () => this.emit(Events.AndroidSocket.Close));
  }
  async write(data) {
    await this._channel.write({ data });
  }
  async close() {
    await this._channel.close();
  }
  async [Symbol.asyncDispose]() {
    await this.close();
  }
}
async function loadFile(platform, file) {
  if (isString(file))
    return await platform.fs().promises.readFile(file);
  return file;
}
class AndroidInput {
  constructor(device) {
    this._device = device;
  }
  async type(text) {
    await this._device._channel.inputType({ text });
  }
  async press(key) {
    await this._device._channel.inputPress({ key });
  }
  async tap(point) {
    await this._device._channel.inputTap({ point });
  }
  async swipe(from, segments, steps) {
    await this._device._channel.inputSwipe({ segments, steps });
  }
  async drag(from, to, steps) {
    await this._device._channel.inputDrag({ from, to, steps });
  }
}
function toSelectorChannel(selector) {
  const {
    checkable,
    checked,
    clazz,
    clickable,
    depth,
    desc,
    enabled,
    focusable,
    focused,
    hasChild,
    hasDescendant,
    longClickable,
    pkg,
    res,
    scrollable,
    selected,
    text
  } = selector;
  const toRegex = (value) => {
    if (value === void 0)
      return void 0;
    if (isRegExp(value))
      return value.source;
    return "^" + value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d") + "$";
  };
  return {
    checkable,
    checked,
    clazz: toRegex(clazz),
    pkg: toRegex(pkg),
    desc: toRegex(desc),
    res: toRegex(res),
    text: toRegex(text),
    clickable,
    depth,
    enabled,
    focusable,
    focused,
    hasChild: hasChild ? { androidSelector: toSelectorChannel(hasChild.selector) } : void 0,
    hasDescendant: hasDescendant ? { androidSelector: toSelectorChannel(hasDescendant.selector), maxDepth: hasDescendant.maxDepth } : void 0,
    longClickable,
    scrollable,
    selected
  };
}
class AndroidWebView extends EventEmitter {
  constructor(device, data) {
    super(device._platform);
    this._device = device;
    this._data = data;
  }
  pid() {
    return this._data.pid;
  }
  pkg() {
    return this._data.pkg;
  }
  _socketName() {
    return this._data.socketName;
  }
  async page() {
    if (!this._pagePromise)
      this._pagePromise = this._fetchPage();
    return await this._pagePromise;
  }
  async _fetchPage() {
    const { context } = await this._device._channel.connectToWebView({ socketName: this._data.socketName });
    return BrowserContext.from(context).pages()[0];
  }
}

export { Android, AndroidDevice, AndroidInput, AndroidSocket, AndroidWebView };
