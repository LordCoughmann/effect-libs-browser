import { BrowserContext } from '../playwright-core/src/client/browserContext.js';
import '../playwright-core/src/protocol/validator.js';
import { apiCallZone } from './apiCallZone.js';
import { TimeoutError } from '../playwright-core/src/client/errors.js';
import { Browser } from '../playwright-core/src/client/browser.js';
import { BrowserType } from '../playwright-core/src/client/browserType.js';
import { CDPSession } from '../playwright-core/src/client/cdpSession.js';
import { Dialog } from '../playwright-core/src/client/dialog.js';
import { ConsoleMessage } from '../playwright-core/src/client/consoleMessage.js';
import { JSHandle } from '../playwright-core/src/client/jsHandle.js';
import { ElementHandle } from '../playwright-core/src/client/elementHandle.js';
import { APIResponse, APIRequestContext, APIRequest } from '../playwright-core/src/client/fetch.js';
import { Frame } from '../playwright-core/src/client/frame.js';
import { WebSocketRoute, WebSocket, Route } from '../playwright-core/src/client/network.js';
import { Page } from '../playwright-core/src/client/page.js';
import { Playwright } from '../playwright-core/src/client/playwright.js';
import { Tracing } from '../playwright-core/src/client/tracing.js';
import { Worker } from '../playwright-core/src/client/worker.js';
import { Clock } from '../playwright-core/src/client/clock.js';
import { Coverage } from '../playwright-core/src/client/coverage.js';
import { Download } from '../playwright-core/src/client/download.js';
import { FrameLocator, Locator } from '../playwright-core/src/client/locator.js';
import { FileChooser } from '../playwright-core/src/client/fileChooser.js';
import { Touchscreen, Mouse, Keyboard } from '../playwright-core/src/client/input.js';
import { Selectors } from '../playwright-core/src/client/selectors.js';
import { Video } from '../playwright-core/src/client/video.js';
import { WebError } from '../playwright-core/src/client/webError.js';

const apis = {
  // android: [Android.prototype],
  // androidDevice: [AndroidDevice.prototype],
  // androidWebView: [AndroidWebView.prototype],
  // androidInput: [AndroidInput.prototype],
  // androidSocket: [AndroidSocket.prototype],
  browser: [Browser.prototype, { newContext: true, newPage: true, newBrowserCDPSession: true, startTracing: true, stopTracing: true, close: true }],
  browserContext: [BrowserContext.prototype, {
    newPage: true,
    cookies: true,
    addCookies: true,
    clearCookies: true,
    grantPermissions: true,
    clearPermissions: true,
    setGeolocation: true,
    setExtraHTTPHeaders: true,
    setOffline: true,
    setHTTPCredentials: true,
    addInitScript: true,
    exposeBinding: true,
    exposeFunction: true,
    route: true,
    routeFromHAR: true,
    unrouteAll: true,
    unroute: true,
    waitForEvent: true,
    storageState: true,
    newCDPSession: true,
    close: true,
    routeWebSocket: true
  }],
  browserType: [BrowserType.prototype, { launch: true, launchServer: true, launchPersistentContext: true, connect: true, connectOverCDP: true }],
  clock: [Clock.prototype, { install: true, fastForward: true, pauseAt: true, resume: true, runFor: true, setFixedTime: true, setSystemTime: true }],
  consoleMessage: [ConsoleMessage.prototype, {}],
  coverage: [Coverage.prototype, { startCSSCoverage: true, stopCSSCoverage: true, startJSCoverage: true, stopJSCoverage: true }],
  dialog: [Dialog.prototype, { accept: true, dismiss: true }],
  download: [Download.prototype, { cancel: true, createReadStream: true, path: true, failure: true, delete: true, saveAs: true }],
  // electron: [Electron.prototype, {}],
  // electronApplication: [ElectronApplication.prototype, {}],
  locator: [Locator.prototype, {
    boundingBox: true,
    check: true,
    click: true,
    dblclick: true,
    dispatchEvent: true,
    dragTo: true,
    evaluate: true,
    evaluateAll: true,
    evaluateHandle: true,
    fill: true,
    clear: true,
    highlight: true,
    elementHandle: true,
    elementHandles: true,
    focus: true,
    blur: true,
    count: true,
    getAttribute: true,
    hover: true,
    innerHTML: true,
    innerText: true,
    inputValue: true,
    isChecked: true,
    isDisabled: true,
    isEditable: true,
    isEnabled: true,
    isHidden: true,
    isVisible: true,
    press: true,
    screenshot: true,
    scrollIntoViewIfNeeded: true,
    selectOption: true,
    selectText: true,
    setChecked: true,
    setInputFiles: true,
    tap: true,
    textContent: true,
    type: true,
    pressSequentially: true,
    uncheck: true,
    all: true,
    allInnerTexts: true,
    allTextContents: true,
    waitFor: true,
    ariaSnapshot: true
  }],
  frameLocator: [FrameLocator.prototype, {}],
  elementHandle: [ElementHandle.prototype, {
    // from JSHandle
    evaluate: true,
    evaluateHandle: true,
    getProperty: true,
    getProperties: true,
    jsonValue: true,
    dispose: true,
    // from ElementHandle
    ownerFrame: true,
    contentFrame: true,
    getAttribute: true,
    inputValue: true,
    textContent: true,
    innerText: true,
    innerHTML: true,
    isChecked: true,
    isDisabled: true,
    isEditable: true,
    isEnabled: true,
    isHidden: true,
    isVisible: true,
    dispatchEvent: true,
    scrollIntoViewIfNeeded: true,
    hover: true,
    click: true,
    dblclick: true,
    tap: true,
    selectOption: true,
    fill: true,
    selectText: true,
    setInputFiles: true,
    focus: true,
    type: true,
    press: true,
    check: true,
    uncheck: true,
    setChecked: true,
    boundingBox: true,
    screenshot: true,
    $: true,
    $$: true,
    $eval: true,
    $$eval: true,
    waitForElementState: true,
    waitForSelector: true
  }],
  fileChooser: [FileChooser.prototype, { setFiles: true }],
  timeoutError: [TimeoutError.prototype, {}],
  frame: [Frame.prototype, {
    goto: true,
    waitForNavigation: true,
    waitForLoadState: true,
    waitForURL: true,
    frameElement: true,
    evaluateHandle: true,
    evaluate: true,
    $: true,
    $$: true,
    waitForSelector: true,
    dispatchEvent: true,
    $eval: true,
    $$eval: true,
    content: true,
    setContent: true,
    addScriptTag: true,
    addStyleTag: true,
    click: true,
    dblclick: true,
    dragAndDrop: true,
    tap: true,
    fill: true,
    focus: true,
    textContent: true,
    innerText: true,
    innerHTML: true,
    getAttribute: true,
    inputValue: true,
    isChecked: true,
    isDisabled: true,
    isEditable: true,
    isEnabled: true,
    isHidden: true,
    isVisible: true,
    hover: true,
    selectOption: true,
    setInputFiles: true,
    type: true,
    press: true,
    check: true,
    uncheck: true,
    setChecked: true,
    waitForTimeout: true,
    waitForFunction: true,
    title: true
  }],
  keyboard: [Keyboard.prototype, { down: true, up: true, insertText: true, type: true, press: true }],
  mouse: [Mouse.prototype, { click: true, dblclick: true, down: true, up: true, move: true, wheel: true }],
  touchscreen: [Touchscreen.prototype, { tap: true }],
  jSHandle: [JSHandle.prototype, { evaluate: true, evaluateHandle: true, getProperty: true, jsonValue: true, getProperties: true, dispose: true }],
  route: [Route.prototype, { fallback: true, abort: true, fetch: true, fulfill: true, continue: true }],
  webSocket: [WebSocket.prototype, { waitForEvent: true }],
  webSocketRoute: [WebSocketRoute.prototype, { close: true }],
  request: [APIRequest.prototype, { newContext: true }],
  requestContext: [APIRequestContext.prototype, { dispose: true, delete: true, head: true, get: true, patch: true, post: true, put: true, fetch: true, storageState: true }],
  response: [APIResponse.prototype, { body: true, json: true, text: true, dispose: true }],
  page: [Page.prototype, {
    opener: true,
    waitForSelector: true,
    dispatchEvent: true,
    evaluateHandle: true,
    $: true,
    $$: true,
    $eval: true,
    $$eval: true,
    addScriptTag: true,
    addStyleTag: true,
    exposeFunction: true,
    exposeBinding: true,
    setExtraHTTPHeaders: true,
    content: true,
    setContent: true,
    goto: true,
    reload: true,
    addLocatorHandler: true,
    waitForLoadState: true,
    waitForNavigation: true,
    waitForURL: true,
    waitForRequest: true,
    waitForResponse: true,
    waitForEvent: true,
    goBack: true,
    goForward: true,
    emulateMedia: true,
    setViewportSize: true,
    evaluate: true,
    addInitScript: true,
    route: true,
    routeFromHAR: true,
    unrouteAll: true,
    unroute: true,
    screenshot: true,
    title: true,
    bringToFront: true,
    close: true,
    click: true,
    dragAndDrop: true,
    dblclick: true,
    tap: true,
    fill: true,
    focus: true,
    textContent: true,
    innerText: true,
    innerHTML: true,
    getAttribute: true,
    inputValue: true,
    isChecked: true,
    isDisabled: true,
    isEditable: true,
    isEnabled: true,
    isHidden: true,
    isVisible: true,
    hover: true,
    selectOption: true,
    setInputFiles: true,
    type: true,
    press: true,
    check: true,
    uncheck: true,
    setChecked: true,
    waitForTimeout: true,
    waitForFunction: true,
    pause: true,
    pdf: true,
    removeLocatorHandler: true,
    requestGC: true,
    routeWebSocket: true,
    consoleMessages: true,
    pageErrors: true,
    requests: true
  }],
  selectors: [Selectors.prototype, { register: true }],
  tracing: [Tracing.prototype, { start: true, startChunk: true, stop: true, stopChunk: true, group: false, groupEnd: false }],
  video: [Video.prototype, { delete: true, path: true, saveAs: true }],
  worker: [Worker.prototype, { evaluate: true, evaluateHandle: true, waitForEvent: true }],
  session: [CDPSession.prototype, { send: true, detach: true }],
  playwright: [Playwright.prototype, { devices: false }],
  webError: [WebError.prototype, {}]
};
const kApiFunctionWrapped = Symbol("kApiFunctionWrapped");
function wrapClientApis() {
  for (const [typeName, [proto, props]] of Object.entries(apis)) {
    for (const [key, needsWrap] of Object.entries(props)) {
      if (!needsWrap)
        continue;
      const originalFn = proto[key];
      if (!originalFn || typeof originalFn !== "function")
        throw new Error(`Method ${key} not found in ${typeName}`);
      if (originalFn[kApiFunctionWrapped] === true)
        continue;
      const wrapFn = async function(...args) {
        const apiName = apiCallZone.getStore();
        if (apiName)
          return await originalFn.apply(this, args);
        return await apiCallZone.run({ apiName: `${typeName}.${key}` }, async () => await originalFn.apply(this, args));
      };
      wrapFn[kApiFunctionWrapped] = true;
      proto[key] = wrapFn;
    }
  }
}

export { wrapClientApis };
