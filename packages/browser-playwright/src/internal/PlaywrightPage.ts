/**
 * Playwright Page service — factory pattern.
 *
 * Wraps @cloudflare/playwright Page with Effect error handling.
 *
 * @since 0.1.0
 */

/* eslint-disable effect/avoid-any -- Playwright option types don't include signal, requiring casts */

import type { ConsoleMessage, Page } from "@effect-libs/cloudflare-playwright";
import type { Scope } from "effect";

import type { PlaywrightPage } from "../PlaywrightTypes.js";

import { Effect, PubSub, Stream } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError, NavigationError } from "../PlaywrightError.js";
import { makeAPIRequestContext } from "./PlaywrightAPIRequestContext.js";
import { makeBrowserContext, type PlaywrightBrowserContext } from "./PlaywrightBrowserContext.js";
import { makeClock } from "./PlaywrightClock.js";
import { makeCoverage } from "./PlaywrightCoverage.js";
import { fetchPage } from "./PlaywrightFetch.js";
import { makeFrame } from "./PlaywrightFrame.js";
import { makePageHttpClient } from "./PlaywrightHttpClient.js";
import { makeKeyboard } from "./PlaywrightKeyboard.js";
import { makeFrameLocatorObj, makeLocator } from "./PlaywrightLocator.js";
import { makeMouse } from "./PlaywrightMouse.js";
import { makeTouchscreen } from "./PlaywrightTouchscreen.js";
import { makeVideo } from "./PlaywrightVideo.js";
import { makeWorker } from "./PlaywrightWorker.js";

// ── Internal Helpers ──────────────────────────────────────────────────────────

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      source: "PlaywrightPage",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

const wrapNavigationError =
  (url: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      source: "PlaywrightPage",
      method: "goto",
      reason: new NavigationError({
        method: "goto",
        url,
        description: getErrorMessage(cause),
      }),
    });

const tryPromise = <T>(
  method: string,
  f: (signal: AbortSignal) => Promise<T>,
): Effect.Effect<T, PlaywrightError> =>
  Effect.tryPromise({
    try: f,
    catch: wrapError(method),
  });

/**
 * Merge options with signal. Casts through any because Playwright option
 * types don't include `signal` — we inject it for Effect cancellation.
 */
const withSignal = (options: unknown, signal: AbortSignal): any => ({
  ...(options as Record<string, unknown> | undefined),
  signal,
});

/**
 * Subscribe to an upstream Playwright `Page` event and expose it as an
 * Effect `Stream<Wrapped>`. The subscription is registered inside the
 * returned `Effect` (eager) and torn down when the surrounding `Scope`
 * exits — same lifetime model as `browser-cdp`'s `on*` accessors.
 *
 * The wrapped-typed event handler runs synchronously inside
 * upstream's event emitter callback. `PubSub.publish` is fire-and-forget
 * via `Effect.runFork` because the emitter has no `Effect` context
 * (this is what triggers the `runEffectInsideEffect` lint hint; it is
 * the correct pattern for a Node event-emitter bridge).
 */
const onEvent = <Raw, Wrapped>(
  rawPage: Page,
  event: string,
  wrap: (raw: Raw) => Wrapped,
): Effect.Effect<Stream.Stream<Wrapped>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<Wrapped>();
    const handler = (raw: Raw) => {
      // eslint-disable-next-line effect/runEffectInsideEffect -- bridge from Node event-emitter to Effect pubsub
      // @effect-diagnostics-next-line runEffectInsideEffect:off -- bridge from Node event-emitter to Effect pubsub
      Effect.runFork(PubSub.publish(pubsub, wrap(raw)));
    };
    rawPage.on(event as never, handler as never);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        rawPage.off(event as never, handler as never);
      }),
    );
    return Stream.fromPubSub(pubsub);
  });

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a PlaywrightPage from a raw Playwright Page.
 *
 * @category constructors
 */
export const makePage = (rawPage: Page): PlaywrightPage => {
  return {
    // ── Navigation ──

    goto: (url, options) =>
      Effect.tryPromise({
        try: (signal) => rawPage.goto(url, withSignal(options, signal)),
        catch: wrapNavigationError(url),
      }).pipe(Effect.asVoid),

    reload: (options) =>
      tryPromise("reload", (signal) => rawPage.reload(withSignal(options, signal))).pipe(
        Effect.asVoid,
      ),

    goBack: (options) =>
      tryPromise("goBack", (signal) => rawPage.goBack(withSignal(options, signal))).pipe(
        Effect.asVoid,
      ),

    goForward: (options) =>
      tryPromise("goForward", (signal) => rawPage.goForward(withSignal(options, signal))).pipe(
        Effect.asVoid,
      ),

    // ── Queries ──

    url: () => rawPage.url(),
    title: tryPromise("title", () => rawPage.title()),
    content: tryPromise("content", () => rawPage.content()),
    setContent: (html, options) =>
      tryPromise("setContent", (signal) => rawPage.setContent(html, withSignal(options, signal))),

    // ── Legacy selectors ──

    $: (selector, options) =>
      tryPromise("$", (signal) => rawPage.$(selector, withSignal(options, signal)) as any),

    $$: (selector) => tryPromise("$$", () => rawPage.$$(selector) as any),

    $eval: (selector, pageFunction, arg) =>
      Effect.tryPromise({
        try: () => rawPage.$eval(selector, pageFunction as any, arg as any),
        catch: wrapError("$eval"),
      }),

    $$eval: (selector, pageFunction, arg) =>
      Effect.tryPromise({
        try: () => rawPage.$$eval(selector, pageFunction as any, arg as any),
        catch: wrapError("$$eval"),
      }),

    // ── Element queries (selector-based) ──

    textContent: (selector, options) =>
      tryPromise("textContent", (signal) =>
        rawPage.textContent(selector, withSignal(options, signal)),
      ),

    innerText: (selector, options) =>
      tryPromise("innerText", (signal) => rawPage.innerText(selector, withSignal(options, signal))),

    innerHTML: (selector, options) =>
      tryPromise("innerHTML", (signal) => rawPage.innerHTML(selector, withSignal(options, signal))),

    getAttribute: (selector, name, options) =>
      tryPromise("getAttribute", (signal) =>
        rawPage.getAttribute(selector, name, withSignal(options, signal)),
      ),

    inputValue: (selector, options) =>
      tryPromise("inputValue", (signal) =>
        rawPage.inputValue(selector, withSignal(options, signal)),
      ),

    // ── Element state checks (selector-based) ──

    isChecked: (selector, options) =>
      tryPromise("isChecked", (signal) => rawPage.isChecked(selector, withSignal(options, signal))),

    isDisabled: (selector, options) =>
      tryPromise("isDisabled", (signal) =>
        rawPage.isDisabled(selector, withSignal(options, signal)),
      ),

    isEditable: (selector, options) =>
      tryPromise("isEditable", (signal) =>
        rawPage.isEditable(selector, withSignal(options, signal)),
      ),

    isEnabled: (selector, options) =>
      tryPromise("isEnabled", (signal) => rawPage.isEnabled(selector, withSignal(options, signal))),

    isHidden: (selector, options) =>
      tryPromise("isHidden", (signal) => rawPage.isHidden(selector, withSignal(options, signal))),

    isVisible: (selector, options) =>
      tryPromise("isVisible", (signal) => rawPage.isVisible(selector, withSignal(options, signal))),

    // ── Interactions ──

    click: (selector, options) =>
      tryPromise("click", (signal) => rawPage.click(selector, withSignal(options, signal))),

    dblclick: (selector, options) =>
      tryPromise("dblclick", (signal) => rawPage.dblclick(selector, withSignal(options, signal))),

    tap: (selector, options) =>
      tryPromise("tap", (signal) => rawPage.tap(selector, withSignal(options, signal))),

    hover: (selector, options) =>
      tryPromise("hover", (signal) => rawPage.hover(selector, withSignal(options, signal))),

    fill: (selector, value, options) =>
      tryPromise("fill", (signal) => rawPage.fill(selector, value, withSignal(options, signal))),

    type: (selector, text, options) =>
      tryPromise("type", (signal) => rawPage.type(selector, text, withSignal(options, signal))),

    press: (selector, key, options) =>
      tryPromise("press", (signal) => rawPage.press(selector, key, withSignal(options, signal))),

    selectOption: (selector, values, options) =>
      tryPromise("selectOption", (signal) =>
        rawPage.selectOption(selector, values, withSignal(options, signal)),
      ),

    setChecked: (selector, checked, options) =>
      tryPromise("setChecked", (signal) =>
        rawPage.setChecked(selector, checked, withSignal(options, signal)),
      ),

    check: (selector, options) =>
      tryPromise("check", (signal) => rawPage.check(selector, withSignal(options, signal))),

    uncheck: (selector, options) =>
      tryPromise("uncheck", (signal) => rawPage.uncheck(selector, withSignal(options, signal))),

    setInputFiles: (selector, files, options) =>
      tryPromise("setInputFiles", (signal) =>
        rawPage.setInputFiles(selector, files, withSignal(options, signal)),
      ),

    dragAndDrop: (source, target, options) =>
      tryPromise("dragAndDrop", (signal) =>
        rawPage.dragAndDrop(source, target, withSignal(options, signal)),
      ),

    focus: (selector, options) =>
      tryPromise("focus", (signal) => rawPage.focus(selector, withSignal(options, signal))),

    dispatchEvent: (selector, type, eventInit, options) =>
      tryPromise("dispatchEvent", (signal) =>
        rawPage.dispatchEvent(selector, type, eventInit, withSignal(options, signal)),
      ),

    // ── Evaluation ──

    evaluate: <T, Arg = void>(pageFunction: (...args: [Arg]) => T, arg?: Arg) =>
      Effect.tryPromise({
        try: () =>
          rawPage.evaluate(pageFunction as (...args: unknown[]) => T, arg as unknown) as Promise<
            Awaited<T>
          >,
        catch: wrapError("evaluate"),
      }),

    evaluateHandle: <R, Arg = void>(pageFunction: (...args: [Arg]) => R, arg?: Arg) =>
      Effect.tryPromise({
        try: () =>
          rawPage.evaluateHandle(
            pageFunction as (...args: unknown[]) => R,
            arg as unknown,
          ) as Promise<any>,
        catch: wrapError("evaluateHandle"),
      }),

    // ── Script/Style injection ──

    addScriptTag: (options) =>
      tryPromise("addScriptTag", (signal) => rawPage.addScriptTag(withSignal(options, signal))),

    addStyleTag: (options) =>
      tryPromise("addStyleTag", (signal) => rawPage.addStyleTag(withSignal(options, signal))),

    addInitScript: (script, arg) =>
      tryPromise("addInitScript", () => rawPage.addInitScript(script as any, arg as any)),

    // ── Waiting ──

    waitForSelector: (selector, options) =>
      tryPromise("waitForSelector", (signal) =>
        rawPage.waitForSelector(selector, withSignal(options, signal)),
      ).pipe(Effect.asVoid),

    waitForNavigation: (options) =>
      tryPromise("waitForNavigation", (signal) =>
        rawPage.waitForNavigation(withSignal(options, signal)),
      ).pipe(Effect.asVoid),

    waitForLoadState: (state, options) =>
      tryPromise("waitForLoadState", (signal) =>
        rawPage.waitForLoadState(state, withSignal(options, signal)),
      ),

    waitForURL: (url, options) =>
      tryPromise("waitForURL", (signal) => rawPage.waitForURL(url, withSignal(options, signal))),

    waitForRequest: (urlOrPredicate, options) =>
      tryPromise("waitForRequest", (signal) =>
        rawPage.waitForRequest(urlOrPredicate, withSignal(options, signal)),
      ),

    waitForResponse: (urlOrPredicate, options) =>
      tryPromise("waitForResponse", (signal) =>
        rawPage.waitForResponse(urlOrPredicate, withSignal(options, signal)),
      ),

    waitForEvent: (event, optionsOrPredicate) =>
      tryPromise(
        "waitForEvent",
        (signal) =>
          rawPage.waitForEvent(
            event as any,
            { signal, ...optionsOrPredicate } as any,
          ) as Promise<unknown>,
      ),

    waitForFunction: <R, Arg = void>(
      pageFunction: (...args: [Arg]) => R,
      arg?: Arg,
      options?: any,
    ) =>
      Effect.tryPromise({
        try: () =>
          rawPage
            .waitForFunction(pageFunction as any, arg, options)
            .then((h) => h.jsonValue() as Promise<R>),
        catch: wrapError("waitForFunction"),
      }),

    waitForTimeout: (timeout) =>
      tryPromise("waitForTimeout", () => rawPage.waitForTimeout(timeout)),

    // ── Page state ──

    setViewportSize: (viewportSize) =>
      tryPromise("setViewportSize", () => rawPage.setViewportSize(viewportSize)),

    bringToFront: tryPromise("bringToFront", () => rawPage.bringToFront()),

    emulateMedia: (options) =>
      tryPromise("emulateMedia", () => rawPage.emulateMedia(options as any)),

    setExtraHTTPHeaders: (headers) =>
      tryPromise("setExtraHTTPHeaders", () => rawPage.setExtraHTTPHeaders(headers)),

    // ── Network interception ──

    route: (url, handler, options) =>
      tryPromise("route", () => rawPage.route(url, handler, options)),

    routeFromHAR: (har, options) =>
      tryPromise("routeFromHAR", () => rawPage.routeFromHAR(har as any, options as any)),

    unroute: (url, handler) => tryPromise("unroute", () => rawPage.unroute(url, handler)),

    unrouteAll: (options) => tryPromise("unrouteAll", () => rawPage.unrouteAll(options as any)),

    routeWebSocket: (url, handler) =>
      tryPromise("routeWebSocket", () => rawPage.routeWebSocket(url, handler)),

    // ── Browser function exposure ──

    exposeFunction: (name, callback) =>
      tryPromise("exposeFunction", () => rawPage.exposeFunction(name, callback)),

    exposeBinding: (name, callback, options) =>
      tryPromise("exposeBinding", () => rawPage.exposeBinding(name, callback, options)),

    // ── Locator handlers ──

    addLocatorHandler: (locator, handler, options) =>
      tryPromise("addLocatorHandler", () =>
        rawPage.addLocatorHandler(locator._raw, handler, options),
      ),

    removeLocatorHandler: (locator) =>
      tryPromise("removeLocatorHandler", () => rawPage.removeLocatorHandler(locator._raw)),

    // ── Locators ──

    locator: (selector, options) =>
      makeLocator(rawPage.locator(selector, options as any), makePage),

    getByRole: (role, options) => makeLocator(rawPage.getByRole(role, options as any), makePage),

    getByText: (text, options) =>
      makeLocator(rawPage.getByText(text as any, options as any), makePage),

    getByLabel: (label, options) =>
      makeLocator(rawPage.getByLabel(label as any, options as any), makePage),

    getByTestId: (testId) => makeLocator(rawPage.getByTestId(testId as any), makePage),

    getByPlaceholder: (text, options) =>
      makeLocator(rawPage.getByPlaceholder(text as any, options as any), makePage),

    // ── Frames ──

    frames: () => rawPage.frames().map(makeFrame),

    mainFrame: () => makeFrame(rawPage.mainFrame()),

    // `frame()` performs an eager lookup against the page's current frame tree
    // (returns `PlaywrightFrame | null`). For a lazy / auto-waiting alternative
    // (the right shape for most iframe workflows), use `locator.frameLocator()`
    // instead — it returns a `FrameLocator` builder that re-resolves on every
    // chained action. See the JSDoc on `PlaywrightMethods.frame` for the full
    // comparison.
    frame: (selector) => {
      const f = rawPage.frame(selector as any);
      return f ? makeFrame(f) : null;
    },

    // ── Input Devices ──

    keyboard: makeKeyboard(rawPage.keyboard),

    mouse: makeMouse(rawPage.mouse),

    touchscreen: makeTouchscreen(rawPage.touchscreen),

    // ── Namespaces (lazy-bound) ──

    clock: makeClock(rawPage.clock),

    coverage: makeCoverage(rawPage.coverage),

    request: makeAPIRequestContext(rawPage.request),

    video: () => {
      const raw = rawPage.video();
      return raw ? makeVideo(raw) : null;
    },

    // ── Frames ──

    // Lazy iframe-traversing locator — see {@link Page.frameLocator}
    frameLocator: (selector: string) =>
      makeFrameLocatorObj(rawPage.frameLocator(selector), (r) => makeLocator(r, makePage)),

    // ── Capture ──

    screenshot: (options) =>
      Effect.tryPromise({
        try: (signal) => rawPage.screenshot(withSignal(options, signal)),
        catch: wrapError("screenshot"),
      }),

    pdf: (options) =>
      Effect.tryPromise({
        try: (signal) => rawPage.pdf(withSignal(options, signal)) as Promise<Uint8Array>,
        catch: wrapError("pdf"),
      }),

    // ── Debugging ──

    pause: tryPromise("pause", () => rawPage.pause()),

    // ── Page info ──

    opener: tryPromise("opener", () => rawPage.opener() as Promise<Page | null>),

    // ── Lifecycle ──

    close: (options) => tryPromise("close", (signal) => rawPage.close(withSignal(options, signal))),

    // ── Escape hatch ──

    use: <T>(f: (page: Page, signal: AbortSignal) => Promise<T>) =>
      Effect.tryPromise({
        try: (signal) => f(rawPage, signal),
        catch: wrapError("use"),
      }),

    // ── Extensions beyond Playwright API ──

    fetch: (url, options) => fetchPage(rawPage, url, options),

    httpClient: makePageHttpClient((url, options) => fetchPage(rawPage, url, options)),

    // ── Non-effect queries ──

    isClosed: () => rawPage.isClosed(),

    // ── Context ──

    // Cached because the underlying `BrowserContext` is stable for the
    // page's lifetime. Without caching, every call allocates a fresh
    // `PlaywrightBrowserContext` wrapper around the same raw handle.
    context: (() => {
      let cached: PlaywrightBrowserContext | undefined;
      return () => (cached ??= makeBrowserContext(rawPage.context()));
    })(),

    // ── Workers ──

    workers: () => rawPage.workers().map(makeWorker),

    // ── Timeouts ──

    setDefaultTimeout: (timeout) => {
      rawPage.setDefaultTimeout(timeout);
    },

    setDefaultNavigationTimeout: (timeout) => {
      rawPage.setDefaultNavigationTimeout(timeout);
    },

    // ── Event streams (eager subscriptions, scoped finalizers) ──

    /** Mirror Playwright's `page.on('console', …)`. Yields the raw
     * upstream `ConsoleMessage` — no wrapper is needed since the type is
     * a pure data carrier (no Effect-shaped methods to wrap). */
    onConsole: () => onEvent(rawPage, "console", (m) => m as unknown as ConsoleMessage),

    /** Mirror Playwright's `page.on('pageerror', …)`. Yields raw `Error`
     * objects emitted by the page. */
    onPageError: () => onEvent(rawPage, "pageerror", (e) => e as unknown as Error),
  } satisfies PlaywrightPage;
};
