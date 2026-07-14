/**
 * Playwright Locator service — factory pattern.
 *
 * Wraps @cloudflare/playwright Locator with Effect error handling.
 *
 * @since 0.1.0
 */

/* eslint-disable effect/avoid-any -- withSignal casts through any because Playwright option types don't include signal */

import type {
  JSHandle,
  Locator,
  Page,
  FrameLocator as RawFrameLocator,
} from "@effect-libs/cloudflare-playwright";

import type {
  PlaywrightLocator,
  PlaywrightFrameLocator as PlaywrightFrameLocatorShape,
  PlaywrightPage,
} from "../PlaywrightTypes.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

// ── Internal Helpers ──────────────────────────────────────────────────────────

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      module: "PlaywrightLocator",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
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

// ── Frame Locator Helper ──────────────────────────────────────────────────────

export const makeFrameLocatorObj = (
  raw: RawFrameLocator,
  wrapLocator: (raw: Locator) => PlaywrightLocator,
): PlaywrightFrameLocatorShape => ({
  _raw: raw,
  locator: (selector, options) => wrapLocator(raw.locator(selector, options)),
  getByRole: (role, options) => wrapLocator(raw.getByRole(role, options)),
  getByText: (text, options) => wrapLocator(raw.getByText(text, options)),
  getByLabel: (label, options) => wrapLocator(raw.getByLabel(label, options)),
  getByTestId: (testId) => wrapLocator(raw.getByTestId(testId)),
  getByPlaceholder: (text, options) => wrapLocator(raw.getByPlaceholder(text, options)),
  getByAltText: (text, options) => wrapLocator(raw.getByAltText(text, options)),
  getByTitle: (title) => wrapLocator(raw.getByTitle(title)),
  frameLocator: (selector) => makeFrameLocatorObj(raw.frameLocator(selector), wrapLocator),
  // `first` and `last` are getters (not eager values) so that wrapping a
  // FrameLocator doesn't trigger infinite recursion. See the matching fix
  // in `makeLocator` for the full rationale.
  get first(): PlaywrightFrameLocatorShape {
    return makeFrameLocatorObj(raw.first(), wrapLocator);
  },
  get last(): PlaywrightFrameLocatorShape {
    return makeFrameLocatorObj(raw.last(), wrapLocator);
  },
  nth: (index) => makeFrameLocatorObj(raw.nth(index), wrapLocator),
});

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a PlaywrightLocator from a raw Playwright Locator.
 *
 * Accepts a `makePage` factory to avoid circular dependency with PlaywrightPage.
 *
 * @category constructors
 */
export const makeLocator = (
  raw: Locator,
  makePage: (page: Page) => PlaywrightPage,
): PlaywrightLocator => {
  // Cache the page service — avoid re-creating on every access
  let _page: PlaywrightPage | undefined;

  // Self-reference for composition methods
  const wrapLocator = (r: Locator): PlaywrightLocator => makeLocator(r, makePage);

  const getPage = (): PlaywrightPage => {
    if (_page === undefined) {
      _page = makePage(raw.page());
    }
    return _page;
  };

  return {
    _raw: raw,

    // ── Actions ──

    click: (options) => tryPromise("click", (signal) => raw.click(withSignal(options, signal))),

    dblclick: (options) =>
      tryPromise("dblclick", (signal) => raw.dblclick(withSignal(options, signal))),

    fill: (value, options) =>
      tryPromise("fill", (signal) => raw.fill(value, withSignal(options, signal))),

    type: (text, options) =>
      tryPromise("type", (signal) => raw.type(text, withSignal(options, signal))),

    press: (key, options) =>
      tryPromise("press", (signal) => raw.press(key, withSignal(options, signal))),

    pressSequentially: (text, options) =>
      tryPromise("pressSequentially", (signal) =>
        raw.pressSequentially(text, withSignal(options, signal)),
      ),

    check: (options) => tryPromise("check", (signal) => raw.check(withSignal(options, signal))),

    uncheck: (options) =>
      tryPromise("uncheck", (signal) => raw.uncheck(withSignal(options, signal))),

    tap: (options) => tryPromise("tap", (signal) => raw.tap(withSignal(options, signal))),

    hover: (options) => tryPromise("hover", (signal) => raw.hover(withSignal(options, signal))),

    clear: (options) => tryPromise("clear", (signal) => raw.clear(withSignal(options, signal))),

    selectOption: (values, options) =>
      tryPromise("selectOption", (signal) => raw.selectOption(values, withSignal(options, signal))),

    selectText: (options) =>
      tryPromise("selectText", (signal) => raw.selectText(withSignal(options, signal))),

    setInputFiles: (files, options) =>
      tryPromise("setInputFiles", (signal) =>
        raw.setInputFiles(files, withSignal(options, signal)),
      ),

    setChecked: (checked, options) =>
      tryPromise("setChecked", (signal) => raw.setChecked(checked, withSignal(options, signal))),

    dragTo: (target, options) =>
      tryPromise("dragTo", (signal) => raw.dragTo(target._raw, withSignal(options, signal))),

    dispatchEvent: (type, eventInit, options) =>
      tryPromise("dispatchEvent", (signal) =>
        raw.dispatchEvent(type, eventInit, withSignal(options, signal)),
      ),

    // ── Queries ──

    textContent: tryPromise("textContent", () => raw.textContent()),
    innerText: tryPromise("innerText", () => raw.innerText()),
    innerHTML: tryPromise("innerHTML", () => raw.innerHTML()),

    inputValue: (options) =>
      tryPromise("inputValue", (signal) => raw.inputValue(withSignal(options, signal))),

    getAttribute: (name, options) =>
      tryPromise("getAttribute", (signal) => raw.getAttribute(name, withSignal(options, signal))),

    boundingBox: tryPromise("boundingBox", () => raw.boundingBox()),
    count: tryPromise("count", () => raw.count()),
    allInnerTexts: tryPromise("allInnerTexts", () => raw.allInnerTexts()),
    allTextContents: tryPromise("allTextContents", () => raw.allTextContents()),
    all: tryPromise("all", () => raw.all()).pipe(
      Effect.map((locators) => locators.map(wrapLocator)),
    ),

    ariaSnapshot: (options) =>
      tryPromise("ariaSnapshot", (signal) => raw.ariaSnapshot(withSignal(options, signal))),

    // ── Evaluation ──

    evaluate: <T, Arg = void>(pageFunction: (...args: [Arg]) => T, arg?: Arg) =>
      Effect.tryPromise({
        try: () =>
          raw.evaluate(pageFunction as (...args: unknown[]) => T, arg as unknown) as Promise<
            Awaited<T>
          >,
        catch: wrapError("evaluate"),
      }),

    evaluateAll: <R, Arg = void>(pageFunction: (...args: [Arg]) => R, arg?: Arg) =>
      Effect.tryPromise({
        try: () =>
          raw.evaluateAll(pageFunction as (...args: unknown[]) => R, arg as unknown) as Promise<R>,
        catch: wrapError("evaluateAll"),
      }),

    evaluateHandle: <R, Arg = void>(pageFunction: (...args: [Arg]) => R, arg?: Arg) =>
      Effect.tryPromise({
        try: () =>
          raw.evaluateHandle(pageFunction as (...args: unknown[]) => R, arg as unknown) as Promise<
            JSHandle<R>
          >,
        catch: wrapError("evaluateHandle"),
      }),

    // ── Handles ──

    elementHandle: (options) =>
      tryPromise("elementHandle", (signal) => raw.elementHandle(withSignal(options, signal))),

    elementHandles: tryPromise("elementHandles", () => raw.elementHandles()),

    // ── Debugging ──

    highlight: tryPromise("highlight", () => raw.highlight()),

    // ── State ──

    isChecked: tryPromise("isChecked", () => raw.isChecked()),
    isDisabled: tryPromise("isDisabled", () => raw.isDisabled()),
    isEditable: tryPromise("isEditable", () => raw.isEditable()),
    isEnabled: tryPromise("isEnabled", () => raw.isEnabled()),
    isHidden: tryPromise("isHidden", () => raw.isHidden()),
    isVisible: tryPromise("isVisible", () => raw.isVisible()),

    // ── Navigation ──

    scrollIntoViewIfNeeded: (options) =>
      tryPromise("scrollIntoViewIfNeeded", (signal) =>
        raw.scrollIntoViewIfNeeded(withSignal(options, signal)),
      ),

    blur: (options) => tryPromise("blur", (signal) => raw.blur(withSignal(options, signal))),

    focus: (options) => tryPromise("focus", (signal) => raw.focus(withSignal(options, signal))),

    waitFor: (options) =>
      tryPromise("waitFor", (signal) => raw.waitFor(withSignal(options, signal))),

    // ── Capture ──

    screenshot: (options) =>
      tryPromise("screenshot", (signal) => raw.screenshot(withSignal(options, signal))),

    // ── Composition ──

    locator: (selector, options) => wrapLocator(raw.locator(selector, options)),

    getByRole: (role, options) => wrapLocator(raw.getByRole(role, options)),

    getByText: (text, options) => wrapLocator(raw.getByText(text, options)),

    getByLabel: (label, options) => wrapLocator(raw.getByLabel(label, options)),

    getByTestId: (testId) => wrapLocator(raw.getByTestId(testId)),

    getByPlaceholder: (text, options) => wrapLocator(raw.getByPlaceholder(text, options)),

    getByAltText: (text, options) => wrapLocator(raw.getByAltText(text, options)),

    getByTitle: (title) => wrapLocator(raw.getByTitle(title)),

    filter: (options) => wrapLocator(raw.filter(options)),

    // `first` and `last` are getters (not eager values) so that wrapping
    // a Locator doesn't trigger infinite recursion. Eager evaluation of
    // `first: wrapLocator(raw.first())` would recurse without termination
    // because each wrapped Locator's `first` eagerly wraps its own raw's
    // `first`, and so on. Upstream Playwright exposes `first()`/`last()` as
    // methods; the wrapper keeps the value shape (`locator.first`, no
    // parens) for DX but makes access lazy via getters.
    get first(): PlaywrightLocator {
      return wrapLocator(raw.first());
    },
    get last(): PlaywrightLocator {
      return wrapLocator(raw.last());
    },
    nth: (index) => wrapLocator(raw.nth(index)),

    and: (locator) => wrapLocator(raw.and(locator._raw)),

    or: (locator) => wrapLocator(raw.or(locator._raw)),

    // ── Structure ──

    // `page` is lazily built once (on first access) and cached for
    // the lifetime of this Locator. This differs from upstream
    // Playwright's `Locator.page` getter, which is a fresh handle
    // each call (in practice upstream returns the same underlying
    // page object — the difference is only in the wrapped-handle
    // identity). See the JSDoc on `PlaywrightMethods.page` for the
    // public-facing explanation.
    page: getPage(),

    contentFrame: makeFrameLocatorObj(raw.contentFrame(), wrapLocator),

    frameLocator: (selector) => makeFrameLocatorObj(raw.frameLocator(selector), wrapLocator),

    // ── Escape hatch ──

    use: <T>(f: (locator: Locator, signal: AbortSignal) => Promise<T>) =>
      Effect.tryPromise({
        try: (signal) => f(raw, signal),
        catch: wrapError("use"),
      }),
  } satisfies PlaywrightLocator;
};

/**
 * `makeLocator` is the public factory for `PlaywrightLocator` instances, used
 * internally by `PlaywrightPage.ts` and `PlaywrightFrame.ts`. It is not
 * re-exported from the package entry point (`index.ts`) because the public
 * surface is the `page.locator(...)` / `page.getBy*(...)` methods; consumers
 * should never need to construct a Locator directly.
 */
