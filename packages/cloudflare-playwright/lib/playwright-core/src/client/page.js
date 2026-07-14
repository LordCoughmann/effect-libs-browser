import { Artifact } from './artifact.js';
import { ChannelOwner } from './channelOwner.js';
import { evaluationScript } from './clientHelper.js';
import { Coverage } from './coverage.js';
import { Download } from './download.js';
import { ElementHandle, determineScreenshotType } from './elementHandle.js';
import { TargetClosedError, isTargetClosedError, parseError, serializeError } from './errors.js';
import { Events } from './events.js';
import { FileChooser } from './fileChooser.js';
import { Frame, verifyLoadState } from './frame.js';
import { HarRouter } from './harRouter.js';
import { Keyboard, Mouse, Touchscreen } from './input.js';
import { assertMaxArguments, JSHandle, parseResult, serializeArgument } from './jsHandle.js';
import { Route, WebSocketRoute, WebSocket, validateHeaders, Response, RouteHandler, WebSocketRouteHandler, Request } from './network.js';
import { Video } from './video.js';
import { Waiter } from './waiter.js';
import { Worker } from './worker.js';
import { TimeoutSettings } from './timeoutSettings.js';
import { assert } from '../utils/isomorphic/assert.js';
import { mkdirIfNeeded } from './fileUtils.js';
import { headersObjectToArray } from '../utils/isomorphic/headers.js';
import { isString, trimStringWithEllipsis } from '../utils/isomorphic/stringUtils.js';
import { urlMatches, urlMatchesEqual } from '../utils/isomorphic/urlMatch.js';
import { LongStandingScope } from '../utils/isomorphic/manualPromise.js';
import { isObject, isRegExp } from '../utils/isomorphic/rtti.js';
import { ConsoleMessage } from './consoleMessage.js';
import { PageAgent } from './pageAgent.js';

class Page extends ChannelOwner {
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this._frames = /* @__PURE__ */ new Set();
    this._workers = /* @__PURE__ */ new Set();
    this._closed = false;
    this._closedOrCrashedScope = new LongStandingScope();
    this._routes = [];
    this._webSocketRoutes = [];
    this._bindings = /* @__PURE__ */ new Map();
    this._video = null;
    this._closeWasCalled = false;
    this._harRouters = [];
    this._locatorHandlers = /* @__PURE__ */ new Map();
    this._instrumentation.onPage(this);
    this._browserContext = parent;
    this._timeoutSettings = new TimeoutSettings(this._platform, this._browserContext._timeoutSettings);
    this.keyboard = new Keyboard(this);
    this.mouse = new Mouse(this);
    this.request = this._browserContext.request;
    this.touchscreen = new Touchscreen(this);
    this.clock = this._browserContext.clock;
    this._mainFrame = Frame.from(initializer.mainFrame);
    this._mainFrame._page = this;
    this._frames.add(this._mainFrame);
    this._viewportSize = initializer.viewportSize;
    this._closed = initializer.isClosed;
    this._opener = Page.fromNullable(initializer.opener);
    this._channel.on("bindingCall", ({ binding }) => this._onBinding(BindingCall.from(binding)));
    this._channel.on("close", () => this._onClose());
    this._channel.on("crash", () => this._onCrash());
    this._channel.on("download", ({ url, suggestedFilename, artifact }) => {
      const artifactObject = Artifact.from(artifact);
      this.emit(Events.Page.Download, new Download(this, url, suggestedFilename, artifactObject));
    });
    this._channel.on("fileChooser", ({ element, isMultiple }) => this.emit(Events.Page.FileChooser, new FileChooser(this, ElementHandle.from(element), isMultiple)));
    this._channel.on("frameAttached", ({ frame }) => this._onFrameAttached(Frame.from(frame)));
    this._channel.on("frameDetached", ({ frame }) => this._onFrameDetached(Frame.from(frame)));
    this._channel.on("locatorHandlerTriggered", ({ uid }) => this._onLocatorHandlerTriggered(uid));
    this._channel.on("route", ({ route }) => this._onRoute(Route.from(route)));
    this._channel.on("webSocketRoute", ({ webSocketRoute }) => this._onWebSocketRoute(WebSocketRoute.from(webSocketRoute)));
    this._channel.on("video", ({ artifact }) => {
      const artifactObject = Artifact.from(artifact);
      this._forceVideo()._artifactReady(artifactObject);
    });
    this._channel.on("viewportSizeChanged", ({ viewportSize }) => this._viewportSize = viewportSize);
    this._channel.on("webSocket", ({ webSocket }) => this.emit(Events.Page.WebSocket, WebSocket.from(webSocket)));
    this._channel.on("worker", ({ worker }) => this._onWorker(Worker.from(worker)));
    this.coverage = new Coverage(this._channel);
    this.once(Events.Page.Close, () => this._closedOrCrashedScope.close(this._closeErrorWithReason()));
    this.once(Events.Page.Crash, () => this._closedOrCrashedScope.close(new TargetClosedError()));
    this._setEventToSubscriptionMapping(/* @__PURE__ */ new Map([
      [Events.Page.Console, "console"],
      [Events.Page.Dialog, "dialog"],
      [Events.Page.Request, "request"],
      [Events.Page.Response, "response"],
      [Events.Page.RequestFinished, "requestFinished"],
      [Events.Page.RequestFailed, "requestFailed"],
      [Events.Page.FileChooser, "fileChooser"]
    ]));
  }
  static from(page) {
    return page._object;
  }
  static fromNullable(page) {
    return page ? Page.from(page) : null;
  }
  _onFrameAttached(frame) {
    frame._page = this;
    this._frames.add(frame);
    if (frame._parentFrame)
      frame._parentFrame._childFrames.add(frame);
    this.emit(Events.Page.FrameAttached, frame);
  }
  _onFrameDetached(frame) {
    this._frames.delete(frame);
    frame._detached = true;
    if (frame._parentFrame)
      frame._parentFrame._childFrames.delete(frame);
    this.emit(Events.Page.FrameDetached, frame);
  }
  async _onRoute(route) {
    route._context = this.context();
    const routeHandlers = this._routes.slice();
    for (const routeHandler of routeHandlers) {
      if (this._closeWasCalled || this._browserContext._closingStatus !== "none")
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
    await this._browserContext._onRoute(route);
  }
  async _onWebSocketRoute(webSocketRoute) {
    const routeHandler = this._webSocketRoutes.find((route) => route.matches(webSocketRoute.url()));
    if (routeHandler)
      await routeHandler.handle(webSocketRoute);
    else
      await this._browserContext._onWebSocketRoute(webSocketRoute);
  }
  async _onBinding(bindingCall) {
    const func = this._bindings.get(bindingCall._initializer.name);
    if (func) {
      await bindingCall.call(func);
      return;
    }
    await this._browserContext._onBinding(bindingCall);
  }
  _onWorker(worker) {
    this._workers.add(worker);
    worker._page = this;
    this.emit(Events.Page.Worker, worker);
  }
  _onClose() {
    this._closed = true;
    this._browserContext._pages.delete(this);
    this._disposeHarRouters();
    this.emit(Events.Page.Close, this);
  }
  _onCrash() {
    this.emit(Events.Page.Crash, this);
  }
  context() {
    return this._browserContext;
  }
  async opener() {
    if (!this._opener || this._opener.isClosed())
      return null;
    return this._opener;
  }
  mainFrame() {
    return this._mainFrame;
  }
  frame(frameSelector) {
    const name = isString(frameSelector) ? frameSelector : frameSelector.name;
    const url = isObject(frameSelector) ? frameSelector.url : void 0;
    assert(name || url, "Either name or url matcher should be specified");
    return this.frames().find((f) => {
      if (name)
        return f.name() === name;
      return urlMatches(this._browserContext._options.baseURL, f.url(), url);
    }) || null;
  }
  frames() {
    return [...this._frames];
  }
  setDefaultNavigationTimeout(timeout) {
    this._timeoutSettings.setDefaultNavigationTimeout(timeout);
  }
  setDefaultTimeout(timeout) {
    this._timeoutSettings.setDefaultTimeout(timeout);
  }
  _forceVideo() {
    if (!this._video)
      this._video = new Video(this, this._connection);
    return this._video;
  }
  video() {
    if (!this._browserContext._options.recordVideo)
      return null;
    return this._forceVideo();
  }
  async $(selector, options) {
    return await this._mainFrame.$(selector, options);
  }
  async waitForSelector(selector, options) {
    return await this._mainFrame.waitForSelector(selector, options);
  }
  async dispatchEvent(selector, type, eventInit, options) {
    return await this._mainFrame.dispatchEvent(selector, type, eventInit, options);
  }
  async evaluateHandle(pageFunction, arg) {
    assertMaxArguments(arguments.length, 2);
    return await this._mainFrame.evaluateHandle(pageFunction, arg);
  }
  async $eval(selector, pageFunction, arg) {
    assertMaxArguments(arguments.length, 3);
    return await this._mainFrame.$eval(selector, pageFunction, arg);
  }
  async $$eval(selector, pageFunction, arg) {
    assertMaxArguments(arguments.length, 3);
    return await this._mainFrame.$$eval(selector, pageFunction, arg);
  }
  async $$(selector) {
    return await this._mainFrame.$$(selector);
  }
  async addScriptTag(options = {}) {
    return await this._mainFrame.addScriptTag(options);
  }
  async addStyleTag(options = {}) {
    return await this._mainFrame.addStyleTag(options);
  }
  async exposeFunction(name, callback) {
    await this._channel.exposeBinding({ name });
    const binding = (source, ...args) => callback(...args);
    this._bindings.set(name, binding);
  }
  async exposeBinding(name, callback, options = {}) {
    await this._channel.exposeBinding({ name, needsHandle: options.handle });
    this._bindings.set(name, callback);
  }
  async setExtraHTTPHeaders(headers) {
    validateHeaders(headers);
    await this._channel.setExtraHTTPHeaders({ headers: headersObjectToArray(headers) });
  }
  url() {
    return this._mainFrame.url();
  }
  async content() {
    return await this._mainFrame.content();
  }
  async setContent(html, options) {
    return await this._mainFrame.setContent(html, options);
  }
  async goto(url, options) {
    return await this._mainFrame.goto(url, options);
  }
  async reload(options = {}) {
    const waitUntil = verifyLoadState("waitUntil", options.waitUntil === void 0 ? "load" : options.waitUntil);
    return Response.fromNullable((await this._channel.reload({ ...options, waitUntil, timeout: this._timeoutSettings.navigationTimeout(options) })).response);
  }
  async addLocatorHandler(locator, handler, options = {}) {
    if (locator._frame !== this._mainFrame)
      throw new Error(`Locator must belong to the main frame of this page`);
    if (options.times === 0)
      return;
    const { uid } = await this._channel.registerLocatorHandler({ selector: locator._selector, noWaitAfter: options.noWaitAfter });
    this._locatorHandlers.set(uid, { locator, handler, times: options.times });
  }
  async _onLocatorHandlerTriggered(uid) {
    let remove = false;
    try {
      const handler = this._locatorHandlers.get(uid);
      if (handler && handler.times !== 0) {
        if (handler.times !== void 0)
          handler.times--;
        await handler.handler(handler.locator);
      }
      remove = handler?.times === 0;
    } finally {
      if (remove)
        this._locatorHandlers.delete(uid);
      this._channel.resolveLocatorHandlerNoReply({ uid, remove }).catch(() => {
      });
    }
  }
  async removeLocatorHandler(locator) {
    for (const [uid, data] of this._locatorHandlers) {
      if (data.locator._equals(locator)) {
        this._locatorHandlers.delete(uid);
        await this._channel.unregisterLocatorHandler({ uid }).catch(() => {
        });
      }
    }
  }
  async waitForLoadState(state, options) {
    return await this._mainFrame.waitForLoadState(state, options);
  }
  async waitForNavigation(options) {
    return await this._mainFrame.waitForNavigation(options);
  }
  async waitForURL(url, options) {
    return await this._mainFrame.waitForURL(url, options);
  }
  async waitForRequest(urlOrPredicate, options = {}) {
    const predicate = async (request) => {
      if (isString(urlOrPredicate) || isRegExp(urlOrPredicate))
        return urlMatches(this._browserContext._options.baseURL, request.url(), urlOrPredicate);
      return await urlOrPredicate(request);
    };
    const trimmedUrl = trimUrl(urlOrPredicate);
    const logLine = trimmedUrl ? `waiting for request ${trimmedUrl}` : void 0;
    return await this._waitForEvent(Events.Page.Request, { predicate, timeout: options.timeout }, logLine);
  }
  async waitForResponse(urlOrPredicate, options = {}) {
    const predicate = async (response) => {
      if (isString(urlOrPredicate) || isRegExp(urlOrPredicate))
        return urlMatches(this._browserContext._options.baseURL, response.url(), urlOrPredicate);
      return await urlOrPredicate(response);
    };
    const trimmedUrl = trimUrl(urlOrPredicate);
    const logLine = trimmedUrl ? `waiting for response ${trimmedUrl}` : void 0;
    return await this._waitForEvent(Events.Page.Response, { predicate, timeout: options.timeout }, logLine);
  }
  async waitForEvent(event, optionsOrPredicate = {}) {
    return await this._waitForEvent(event, optionsOrPredicate, `waiting for event "${event}"`);
  }
  _closeErrorWithReason() {
    return new TargetClosedError(this._closeReason || this._browserContext._effectiveCloseReason());
  }
  async _waitForEvent(event, optionsOrPredicate, logLine) {
    return await this._wrapApiCall(async () => {
      const timeout = this._timeoutSettings.timeout(typeof optionsOrPredicate === "function" ? {} : optionsOrPredicate);
      const predicate = typeof optionsOrPredicate === "function" ? optionsOrPredicate : optionsOrPredicate.predicate;
      const waiter = Waiter.createForEvent(this, event);
      if (logLine)
        waiter.log(logLine);
      waiter.rejectOnTimeout(timeout, `Timeout ${timeout}ms exceeded while waiting for event "${event}"`);
      if (event !== Events.Page.Crash)
        waiter.rejectOnEvent(this, Events.Page.Crash, new Error("Page crashed"));
      if (event !== Events.Page.Close)
        waiter.rejectOnEvent(this, Events.Page.Close, () => this._closeErrorWithReason());
      const result = await waiter.waitForEvent(this, event, predicate);
      waiter.dispose();
      return result;
    });
  }
  async goBack(options = {}) {
    const waitUntil = verifyLoadState("waitUntil", options.waitUntil === void 0 ? "load" : options.waitUntil);
    return Response.fromNullable((await this._channel.goBack({ ...options, waitUntil, timeout: this._timeoutSettings.navigationTimeout(options) })).response);
  }
  async goForward(options = {}) {
    const waitUntil = verifyLoadState("waitUntil", options.waitUntil === void 0 ? "load" : options.waitUntil);
    return Response.fromNullable((await this._channel.goForward({ ...options, waitUntil, timeout: this._timeoutSettings.navigationTimeout(options) })).response);
  }
  async requestGC() {
    await this._channel.requestGC();
  }
  async emulateMedia(options = {}) {
    await this._channel.emulateMedia({
      media: options.media === null ? "no-override" : options.media,
      colorScheme: options.colorScheme === null ? "no-override" : options.colorScheme,
      reducedMotion: options.reducedMotion === null ? "no-override" : options.reducedMotion,
      forcedColors: options.forcedColors === null ? "no-override" : options.forcedColors,
      contrast: options.contrast === null ? "no-override" : options.contrast
    });
  }
  async setViewportSize(viewportSize) {
    this._viewportSize = viewportSize;
    await this._channel.setViewportSize({ viewportSize });
  }
  viewportSize() {
    return this._viewportSize || null;
  }
  async evaluate(pageFunction, arg) {
    assertMaxArguments(arguments.length, 2);
    return await this._mainFrame.evaluate(pageFunction, arg);
  }
  async _evaluateFunction(functionDeclaration) {
    return this._mainFrame._evaluateFunction(functionDeclaration);
  }
  async addInitScript(script, arg) {
    const source = await evaluationScript(this._platform, script, arg);
    await this._channel.addInitScript({ source });
  }
  async route(url, handler, options = {}) {
    this._routes.unshift(new RouteHandler(this._platform, this._browserContext._options.baseURL, url, handler, options.times));
    await this._updateInterceptionPatterns({ title: "Route requests" });
  }
  async routeFromHAR(har, options = {}) {
    const localUtils = this._connection.localUtils();
    if (!localUtils)
      throw new Error("Route from har is not supported in thin clients");
    if (options.update) {
      await this._browserContext._recordIntoHAR(har, this, options);
      return;
    }
    const harRouter = await HarRouter.create(localUtils, har, options.notFound || "abort", { urlMatch: options.url });
    this._harRouters.push(harRouter);
    await harRouter.addPageRoute(this);
  }
  async routeWebSocket(url, handler) {
    this._webSocketRoutes.unshift(new WebSocketRouteHandler(this._browserContext._options.baseURL, url, handler));
    await this._updateWebSocketInterceptionPatterns({ title: "Route WebSockets" });
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
  async screenshot(options = {}) {
    const mask = options.mask;
    const copy = { ...options, mask: void 0, timeout: this._timeoutSettings.timeout(options) };
    if (!copy.type)
      copy.type = determineScreenshotType(options);
    if (mask) {
      copy.mask = mask.map((locator) => ({
        frame: locator._frame._channel,
        selector: locator._selector
      }));
    }
    const result = await this._channel.screenshot(copy);
    if (options.path) {
      await mkdirIfNeeded(this._platform, options.path);
      await this._platform.fs().promises.writeFile(options.path, result.binary);
    }
    return result.binary;
  }
  async _expectScreenshot(options) {
    const mask = options?.mask ? options?.mask.map((locator2) => ({
      frame: locator2._frame._channel,
      selector: locator2._selector
    })) : void 0;
    const locator = options.locator ? {
      frame: options.locator._frame._channel,
      selector: options.locator._selector
    } : void 0;
    return await this._channel.expectScreenshot({
      ...options,
      isNot: !!options.isNot,
      locator,
      mask
    });
  }
  async title() {
    return await this._mainFrame.title();
  }
  async bringToFront() {
    await this._channel.bringToFront();
  }
  async [Symbol.asyncDispose]() {
    await this.close();
  }
  async close(options = {}) {
    this._closeReason = options.reason;
    if (!options.runBeforeUnload)
      this._closeWasCalled = true;
    try {
      if (this._ownedContext)
        await this._ownedContext.close();
      else
        await this._channel.close(options);
    } catch (e) {
      if (isTargetClosedError(e) && !options.runBeforeUnload)
        return;
      throw e;
    }
  }
  isClosed() {
    return this._closed;
  }
  async click(selector, options) {
    return await this._mainFrame.click(selector, options);
  }
  async dragAndDrop(source, target, options) {
    return await this._mainFrame.dragAndDrop(source, target, options);
  }
  async dblclick(selector, options) {
    await this._mainFrame.dblclick(selector, options);
  }
  async tap(selector, options) {
    return await this._mainFrame.tap(selector, options);
  }
  async fill(selector, value, options) {
    return await this._mainFrame.fill(selector, value, options);
  }
  async consoleMessages() {
    const { messages } = await this._channel.consoleMessages();
    return messages.map((message) => new ConsoleMessage(this._platform, message, this, null));
  }
  async pageErrors() {
    const { errors } = await this._channel.pageErrors();
    return errors.map((error) => parseError(error));
  }
  locator(selector, options) {
    return this.mainFrame().locator(selector, options);
  }
  getByTestId(testId) {
    return this.mainFrame().getByTestId(testId);
  }
  getByAltText(text, options) {
    return this.mainFrame().getByAltText(text, options);
  }
  getByLabel(text, options) {
    return this.mainFrame().getByLabel(text, options);
  }
  getByPlaceholder(text, options) {
    return this.mainFrame().getByPlaceholder(text, options);
  }
  getByText(text, options) {
    return this.mainFrame().getByText(text, options);
  }
  getByTitle(text, options) {
    return this.mainFrame().getByTitle(text, options);
  }
  getByRole(role, options = {}) {
    return this.mainFrame().getByRole(role, options);
  }
  frameLocator(selector) {
    return this.mainFrame().frameLocator(selector);
  }
  async focus(selector, options) {
    return await this._mainFrame.focus(selector, options);
  }
  async textContent(selector, options) {
    return await this._mainFrame.textContent(selector, options);
  }
  async innerText(selector, options) {
    return await this._mainFrame.innerText(selector, options);
  }
  async innerHTML(selector, options) {
    return await this._mainFrame.innerHTML(selector, options);
  }
  async getAttribute(selector, name, options) {
    return await this._mainFrame.getAttribute(selector, name, options);
  }
  async inputValue(selector, options) {
    return await this._mainFrame.inputValue(selector, options);
  }
  async isChecked(selector, options) {
    return await this._mainFrame.isChecked(selector, options);
  }
  async isDisabled(selector, options) {
    return await this._mainFrame.isDisabled(selector, options);
  }
  async isEditable(selector, options) {
    return await this._mainFrame.isEditable(selector, options);
  }
  async isEnabled(selector, options) {
    return await this._mainFrame.isEnabled(selector, options);
  }
  async isHidden(selector, options) {
    return await this._mainFrame.isHidden(selector, options);
  }
  async isVisible(selector, options) {
    return await this._mainFrame.isVisible(selector, options);
  }
  async hover(selector, options) {
    return await this._mainFrame.hover(selector, options);
  }
  async selectOption(selector, values, options) {
    return await this._mainFrame.selectOption(selector, values, options);
  }
  async setInputFiles(selector, files, options) {
    return await this._mainFrame.setInputFiles(selector, files, options);
  }
  async type(selector, text, options) {
    return await this._mainFrame.type(selector, text, options);
  }
  async press(selector, key, options) {
    return await this._mainFrame.press(selector, key, options);
  }
  async check(selector, options) {
    return await this._mainFrame.check(selector, options);
  }
  async uncheck(selector, options) {
    return await this._mainFrame.uncheck(selector, options);
  }
  async setChecked(selector, checked, options) {
    return await this._mainFrame.setChecked(selector, checked, options);
  }
  async waitForTimeout(timeout) {
    return await this._mainFrame.waitForTimeout(timeout);
  }
  async waitForFunction(pageFunction, arg, options) {
    return await this._mainFrame.waitForFunction(pageFunction, arg, options);
  }
  async requests() {
    const { requests } = await this._channel.requests();
    return requests.map((request) => Request.from(request));
  }
  workers() {
    return [...this._workers];
  }
  async pause(_options) {
    if (this._platform.isJSDebuggerAttached())
      return;
    const defaultNavigationTimeout = this._browserContext._timeoutSettings.defaultNavigationTimeout();
    const defaultTimeout = this._browserContext._timeoutSettings.defaultTimeout();
    this._browserContext.setDefaultNavigationTimeout(0);
    this._browserContext.setDefaultTimeout(0);
    this._instrumentation?.onWillPause({ keepTestTimeout: !!_options?.__testHookKeepTestTimeout });
    await this._closedOrCrashedScope.safeRace(this.context()._channel.pause());
    this._browserContext.setDefaultNavigationTimeout(defaultNavigationTimeout);
    this._browserContext.setDefaultTimeout(defaultTimeout);
  }
  async pdf(options = {}) {
    const transportOptions = { ...options };
    if (transportOptions.margin)
      transportOptions.margin = { ...transportOptions.margin };
    if (typeof options.width === "number")
      transportOptions.width = options.width + "px";
    if (typeof options.height === "number")
      transportOptions.height = options.height + "px";
    for (const margin of ["top", "right", "bottom", "left"]) {
      const index = margin;
      if (options.margin && typeof options.margin[index] === "number")
        transportOptions.margin[index] = transportOptions.margin[index] + "px";
    }
    const result = await this._channel.pdf(transportOptions);
    if (options.path) {
      const platform = this._platform;
      await platform.fs().promises.mkdir(platform.path().dirname(options.path), { recursive: true });
      await platform.fs().promises.writeFile(options.path, result.pdf);
    }
    return result.pdf;
  }
  // @ts-expect-error agents are hidden
  async agent(options = {}) {
    const params = {
      api: options.provider?.api,
      apiEndpoint: options.provider?.apiEndpoint,
      apiKey: options.provider?.apiKey,
      apiTimeout: options.provider?.apiTimeout,
      apiCacheFile: options.provider?._apiCacheFile,
      doNotRenderActive: options._doNotRenderActive,
      model: options.provider?.model,
      cacheFile: options.cache?.cacheFile,
      cacheOutFile: options.cache?.cacheOutFile,
      maxTokens: options.limits?.maxTokens,
      maxActions: options.limits?.maxActions,
      maxActionRetries: options.limits?.maxActionRetries,
      // @ts-expect-error runAgents is hidden
      secrets: options.secrets ? Object.entries(options.secrets).map(([name, value]) => ({ name, value })) : void 0,
      systemPrompt: options.systemPrompt
    };
    const { agent } = await this._channel.agent(params);
    const pageAgent = PageAgent.from(agent);
    pageAgent._expectTimeout = options?.expect?.timeout;
    return pageAgent;
  }
  async _snapshotForAI(options = {}) {
    return await this._channel.snapshotForAI({ timeout: this._timeoutSettings.timeout(options), track: options.track });
  }
}
class BindingCall extends ChannelOwner {
  static from(channel) {
    return channel._object;
  }
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
  }
  async call(func) {
    try {
      const frame = Frame.from(this._initializer.frame);
      const source = {
        context: frame._page.context(),
        page: frame._page,
        frame
      };
      let result;
      if (this._initializer.handle)
        result = await func(source, JSHandle.from(this._initializer.handle));
      else
        result = await func(source, ...this._initializer.args.map(parseResult));
      this._channel.resolve({ result: serializeArgument(result) }).catch(() => {
      });
    } catch (e) {
      this._channel.reject({ error: serializeError(e) }).catch(() => {
      });
    }
  }
}
function trimUrl(param) {
  if (isRegExp(param))
    return `/${trimStringWithEllipsis(param.source, 50)}/${param.flags}`;
  if (isString(param))
    return `"${trimStringWithEllipsis(param, 50)}"`;
}

export { BindingCall, Page };
