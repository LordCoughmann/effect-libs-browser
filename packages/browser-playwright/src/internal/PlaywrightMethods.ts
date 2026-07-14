// Originally generated from @cloudflare/playwright types.d.ts at v0.1.0.
// Hand-maintained as of v0.1.0 — the generator script that produced this
// file (scripts/browser-playwright/generate-methods.ts) was removed
// because it depended on a pre-typescript@7 compiler API. When upstream
// Playwright JSDoc changes in a way that affects this file's public
// surface, regenerate manually or restore the script against typescript@7.
//
// Playwright method wrapper interfaces with JSDoc from @cloudflare/playwright.
// References Page/Locator/FrameLocator — no runtime code emitted.

import type {
  ConsoleMessage,
  ElementHandle,
  FrameLocator,
  JSHandle,
  Locator,
  Page,
  Request,
  Response,
} from "@effect-libs/cloudflare-playwright";
import type { Effect, Scope, Stream } from "effect";

import type { PlaywrightError } from "../PlaywrightError.js";
import type { PlaywrightAPIRequestContext } from "./PlaywrightAPIRequestContext.js";
import type { PlaywrightBrowserContext } from "./PlaywrightBrowserContext.js";
import type { PlaywrightClock } from "./PlaywrightClock.js";
import type { PlaywrightCoverage } from "./PlaywrightCoverage.js";
import type { PlaywrightFrame } from "./PlaywrightFrame.js";
import type { PlaywrightKeyboard } from "./PlaywrightKeyboard.js";
import type { PlaywrightMouse } from "./PlaywrightMouse.js";
import type { PlaywrightTouchscreen } from "./PlaywrightTouchscreen.js";
import type { PlaywrightVideo } from "./PlaywrightVideo.js";
import type { PlaywrightWorker } from "./PlaywrightWorker.js";

/**
 * Playwright page service — wraps a Playwright `Page` with curated methods
 * and a `use` escape hatch.
 *
 * Import from `PlaywrightPage.js` for the full interface.
 */
export interface PlaywrightPage {
  // Navigation
  /**
   * Returns the main resource response. In case of multiple redirects, the navigation will resolve with the first
   * non-redirect response.
   *
   * The method will throw an error if:
   * - there's an SSL error (e.g. in case of self-signed certificates).
   * - target URL is invalid.
   * - the [`timeout`](https://playwright.dev/docs/api/class-page#page-goto-option-timeout) is exceeded during
   *   navigation.
   * - the remote server does not respond or is unreachable.
   * - the main resource failed to load.
   *
   * The method will not throw an error when any valid HTTP status code is returned by the remote server, including 404
   * "Not Found" and 500 "Internal Server Error".  The status code for such responses can be retrieved by calling
   * [response.status()](https://playwright.dev/docs/api/class-response#response-status).
   *
   * **NOTE** The method either throws an error or returns a main resource response. The only exceptions are navigation
   * to `about:blank` or navigation to the same URL with a different hash, which would succeed and return `null`.
   *
   * **NOTE** Headless mode doesn't support navigation to a PDF document. See the
   * [upstream issue](https://bugs.chromium.org/p/chromium/issues/detail?id=761295).
   *
   * @see {@link Page.goto}
   */
  readonly goto: (
    url: string,
    options?: Parameters<Page["goto"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * This method reloads the current page, in the same way as if the user had triggered a browser refresh. Returns the
   * main resource response. In case of multiple redirects, the navigation will resolve with the response of the last
   * redirect.
   *
   * @see {@link Page.reload}
   */
  readonly reload: (
    options?: Parameters<Page["reload"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Returns the main resource response. In case of multiple redirects, the navigation will resolve with the response of
   * the last redirect. If cannot go back, returns `null`.
   *
   * Navigate to the previous page in history.
   *
   * @see {@link Page.goBack}
   */
  readonly goBack: (
    options?: Parameters<Page["goBack"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Returns the main resource response. In case of multiple redirects, the navigation will resolve with the response of
   * the last redirect. If cannot go forward, returns `null`.
   *
   * Navigate to the next page in history.
   *
   * @see {@link Page.goForward}
   */
  readonly goForward: (
    options?: Parameters<Page["goForward"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;

  // Queries
  /**
   * url.
   *
   * @see {@link Page.url}
   */
  readonly url: () => string;
  /**
   * Returns the page's title.
   *
   * @see {@link Page.title}
   */
  readonly title: Effect.Effect<string, PlaywrightError>;
  /**
   * Gets the full HTML contents of the page, including the doctype.
   *
   * @see {@link Page.content}
   */
  readonly content: Effect.Effect<string, PlaywrightError>;
  /**
   * This method internally calls [document.write()](https://developer.mozilla.org/en-US/docs/Web/API/Document/write),
   * inheriting all its specific characteristics and behaviors.
   *
   * @see {@link Page.setContent}
   */
  readonly setContent: (
    html: string,
    options?: Parameters<Page["setContent"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;

  // Legacy selectors
  /**
   * **NOTE** Use locator-based [page.locator(selector[, options])](https://playwright.dev/docs/api/class-page#page-locator)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * The method finds an element matching the specified selector within the page. If no elements match the selector, the
   * return value resolves to `null`. To wait for an element on the page, use
   * [locator.waitFor([options])](https://playwright.dev/docs/api/class-locator#locator-wait-for).
   *
   * @see {@link Page.$}
   */
  readonly $: (
    selector: string,
    options?: Parameters<Page["$"]>[1],
  ) => Effect.Effect<ElementHandle<SVGElement | HTMLElement> | null, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [page.locator(selector[, options])](https://playwright.dev/docs/api/class-page#page-locator)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * The method finds all elements matching the specified selector within the page. If no elements match the selector,
   * the return value resolves to `[]`.
   *
   * @see {@link Page.$$}
   */
  readonly $$: (
    selector: string,
  ) => Effect.Effect<readonly ElementHandle<SVGElement | HTMLElement>[], PlaywrightError>;
  /**
   * **NOTE** This method does not wait for the element to pass actionability checks and therefore can lead to the flaky tests.
   * Use
   * [locator.evaluate(pageFunction[, arg, options])](https://playwright.dev/docs/api/class-locator#locator-evaluate),
   * other [Locator](https://playwright.dev/docs/api/class-locator) helper methods or web-first assertions instead.
   *
   * The method finds an element matching the specified selector within the page and passes it as a first argument to
   * [`pageFunction`](https://playwright.dev/docs/api/class-page#page-eval-on-selector-option-expression). If no
   * elements match the selector, the method throws an error. Returns the value of
   * [`pageFunction`](https://playwright.dev/docs/api/class-page#page-eval-on-selector-option-expression).
   *
   * If [`pageFunction`](https://playwright.dev/docs/api/class-page#page-eval-on-selector-option-expression) returns a
   * [Promise], then
   * [page.$eval(selector, pageFunction[, arg, options])](https://playwright.dev/docs/api/class-page#page-eval-on-selector)
   * would wait for the promise to resolve and return its value.
   *
   * **Usage**
   *
   * ```js
   * const searchValue = await page.$eval('#search', el => el.value);
   * const preloadHref = await page.$eval('link[rel=preload]', el => el.href);
   * const html = await page.$eval('.main-container', (e, suffix) => e.outerHTML + suffix, 'hello');
   * // In TypeScript, this example requires an explicit type annotation (HTMLLinkElement) on el:
   * const preloadHrefTS = await page.$eval('link[rel=preload]', (el: HTMLLinkElement) => el.href);
   * ```
   *
   * @see {@link Page.$eval}
   */
  readonly $eval: <R, Arg = void>(
    selector: string,
    pageFunction: Parameters<Page["$eval"]>[1],
    arg?: Arg,
  ) => Effect.Effect<R, PlaywrightError>;
  /**
   * **NOTE** In most cases,
   * [locator.evaluateAll(pageFunction[, arg])](https://playwright.dev/docs/api/class-locator#locator-evaluate-all),
   * other [Locator](https://playwright.dev/docs/api/class-locator) helper methods and web-first assertions do a better
   * job.
   *
   * The method finds all elements matching the specified selector within the page and passes an array of matched
   * elements as a first argument to
   * [`pageFunction`](https://playwright.dev/docs/api/class-page#page-eval-on-selector-all-option-expression). Returns
   * the result of
   * [`pageFunction`](https://playwright.dev/docs/api/class-page#page-eval-on-selector-all-option-expression)
   * invocation.
   *
   * If [`pageFunction`](https://playwright.dev/docs/api/class-page#page-eval-on-selector-all-option-expression) returns
   * a [Promise], then
   * [page.$$eval(selector, pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-eval-on-selector-all)
   * would wait for the promise to resolve and return its value.
   *
   * **Usage**
   *
   * ```js
   * const divCounts = await page.$$eval('div', (divs, min) => divs.length >= min, 10);
   * ```
   *
   * @see {@link Page.$$eval}
   */
  readonly $$eval: <R, Arg = void>(
    selector: string,
    pageFunction: Parameters<Page["$$eval"]>[1],
    arg?: Arg,
  ) => Effect.Effect<R, PlaywrightError>;

  // Element queries (selector-based)
  /**
   * **NOTE** Use locator-based
   * [locator.textContent([options])](https://playwright.dev/docs/api/class-locator#locator-text-content) instead. Read
   * more about [locators](https://playwright.dev/docs/locators).
   *
   * Returns `element.textContent`.
   *
   * @see {@link Page.textContent}
   */
  readonly textContent: (
    selector: string,
    options?: Parameters<Page["textContent"]>[1],
  ) => Effect.Effect<string | null, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.innerText([options])](https://playwright.dev/docs/api/class-locator#locator-inner-text)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * Returns `element.innerText`.
   *
   * @see {@link Page.innerText}
   */
  readonly innerText: (
    selector: string,
    options?: Parameters<Page["innerText"]>[1],
  ) => Effect.Effect<string, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.innerHTML([options])](https://playwright.dev/docs/api/class-locator#locator-inner-html)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * Returns `element.innerHTML`.
   *
   * @see {@link Page.innerHTML}
   */
  readonly innerHTML: (
    selector: string,
    options?: Parameters<Page["innerHTML"]>[1],
  ) => Effect.Effect<string, PlaywrightError>;
  /**
   * **NOTE** Use locator-based
   * [locator.getAttribute(name[, options])](https://playwright.dev/docs/api/class-locator#locator-get-attribute)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * Returns element attribute value.
   *
   * @see {@link Page.getAttribute}
   */
  readonly getAttribute: (
    selector: string,
    name: string,
    options?: Parameters<Page["getAttribute"]>[2],
  ) => Effect.Effect<string | null, PlaywrightError>;
  /**
   * **NOTE** Use locator-based
   * [locator.inputValue([options])](https://playwright.dev/docs/api/class-locator#locator-input-value) instead. Read
   * more about [locators](https://playwright.dev/docs/locators).
   *
   * Returns `input.value` for the selected `<input>` or `<textarea>` or `<select>` element.
   *
   * Throws for non-input elements. However, if the element is inside the `<label>` element that has an associated
   * [control](https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement/control), returns the value of the
   * control.
   *
   * @see {@link Page.inputValue}
   */
  readonly inputValue: (
    selector: string,
    options?: Parameters<Page["inputValue"]>[1],
  ) => Effect.Effect<string, PlaywrightError>;

  // Element state checks (selector-based)
  /**
   * **NOTE** Use locator-based [locator.isChecked([options])](https://playwright.dev/docs/api/class-locator#locator-is-checked)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * Returns whether the element is checked. Throws if the element is not a checkbox or radio input.
   *
   * @see {@link Page.isChecked}
   */
  readonly isChecked: (
    selector: string,
    options?: Parameters<Page["isChecked"]>[1],
  ) => Effect.Effect<boolean, PlaywrightError>;
  /**
   * **NOTE** Use locator-based
   * [locator.isDisabled([options])](https://playwright.dev/docs/api/class-locator#locator-is-disabled) instead. Read
   * more about [locators](https://playwright.dev/docs/locators).
   *
   * Returns whether the element is disabled, the opposite of [enabled](https://playwright.dev/docs/actionability#enabled).
   *
   * @see {@link Page.isDisabled}
   */
  readonly isDisabled: (
    selector: string,
    options?: Parameters<Page["isDisabled"]>[1],
  ) => Effect.Effect<boolean, PlaywrightError>;
  /**
   * **NOTE** Use locator-based
   * [locator.isEditable([options])](https://playwright.dev/docs/api/class-locator#locator-is-editable) instead. Read
   * more about [locators](https://playwright.dev/docs/locators).
   *
   * Returns whether the element is [editable](https://playwright.dev/docs/actionability#editable).
   *
   * @see {@link Page.isEditable}
   */
  readonly isEditable: (
    selector: string,
    options?: Parameters<Page["isEditable"]>[1],
  ) => Effect.Effect<boolean, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.isEnabled([options])](https://playwright.dev/docs/api/class-locator#locator-is-enabled)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * Returns whether the element is [enabled](https://playwright.dev/docs/actionability#enabled).
   *
   * @see {@link Page.isEnabled}
   */
  readonly isEnabled: (
    selector: string,
    options?: Parameters<Page["isEnabled"]>[1],
  ) => Effect.Effect<boolean, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.isHidden([options])](https://playwright.dev/docs/api/class-locator#locator-is-hidden)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * Returns whether the element is hidden, the opposite of [visible](https://playwright.dev/docs/actionability#visible).
   * [`selector`](https://playwright.dev/docs/api/class-page#page-is-hidden-option-selector) that does not match any
   * elements is considered hidden.
   *
   * @see {@link Page.isHidden}
   */
  readonly isHidden: (
    selector: string,
    options?: Parameters<Page["isHidden"]>[1],
  ) => Effect.Effect<boolean, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.isVisible([options])](https://playwright.dev/docs/api/class-locator#locator-is-visible)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * Returns whether the element is [visible](https://playwright.dev/docs/actionability#visible).
   * [`selector`](https://playwright.dev/docs/api/class-page#page-is-visible-option-selector) that does not match any
   * elements is considered not visible.
   *
   * @see {@link Page.isVisible}
   */
  readonly isVisible: (
    selector: string,
    options?: Parameters<Page["isVisible"]>[1],
  ) => Effect.Effect<boolean, PlaywrightError>;

  // Interactions
  /**
   * **NOTE** Use locator-based [locator.click([options])](https://playwright.dev/docs/api/class-locator#locator-click) instead.
   * Read more about [locators](https://playwright.dev/docs/locators).
   *
   * This method clicks an element matching
   * [`selector`](https://playwright.dev/docs/api/class-page#page-click-option-selector) by performing the following
   * steps:
   * 1. Find an element matching [`selector`](https://playwright.dev/docs/api/class-page#page-click-option-selector).
   *    If there is none, wait until a matching element is attached to the DOM.
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the matched element, unless
   *    [`force`](https://playwright.dev/docs/api/class-page#page-click-option-force) option is set. If the element
   *    is detached during the checks, the whole action is retried.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to click in the center of the
   *    element, or the specified
   *    [`position`](https://playwright.dev/docs/api/class-page#page-click-option-position).
   * 1. Wait for initiated navigations to either succeed or fail, unless
   *    [`noWaitAfter`](https://playwright.dev/docs/api/class-page#page-click-option-no-wait-after) option is set.
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-page#page-click-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * @see {@link Page.click}
   */
  readonly click: (
    selector: string,
    options?: Parameters<Page["click"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.dblclick([options])](https://playwright.dev/docs/api/class-locator#locator-dblclick)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * This method double clicks an element matching
   * [`selector`](https://playwright.dev/docs/api/class-page#page-dblclick-option-selector) by performing the following
   * steps:
   * 1. Find an element matching
   *    [`selector`](https://playwright.dev/docs/api/class-page#page-dblclick-option-selector). If there is none,
   *    wait until a matching element is attached to the DOM.
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the matched element, unless
   *    [`force`](https://playwright.dev/docs/api/class-page#page-dblclick-option-force) option is set. If the
   *    element is detached during the checks, the whole action is retried.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to double click in the center of the
   *    element, or the specified
   *    [`position`](https://playwright.dev/docs/api/class-page#page-dblclick-option-position).
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-page#page-dblclick-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * **NOTE** `page.dblclick()` dispatches two `click` events and a single `dblclick` event.
   *
   * @see {@link Page.dblclick}
   */
  readonly dblclick: (
    selector: string,
    options?: Parameters<Page["dblclick"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.tap([options])](https://playwright.dev/docs/api/class-locator#locator-tap) instead. Read
   * more about [locators](https://playwright.dev/docs/locators).
   *
   * This method taps an element matching
   * [`selector`](https://playwright.dev/docs/api/class-page#page-tap-option-selector) by performing the following
   * steps:
   * 1. Find an element matching [`selector`](https://playwright.dev/docs/api/class-page#page-tap-option-selector).
   *    If there is none, wait until a matching element is attached to the DOM.
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the matched element, unless
   *    [`force`](https://playwright.dev/docs/api/class-page#page-tap-option-force) option is set. If the element is
   *    detached during the checks, the whole action is retried.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.touchscreen](https://playwright.dev/docs/api/class-page#page-touchscreen) to tap the center of the
   *    element, or the specified [`position`](https://playwright.dev/docs/api/class-page#page-tap-option-position).
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-page#page-tap-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * **NOTE** [page.tap(selector[, options])](https://playwright.dev/docs/api/class-page#page-tap) the method will throw
   * if [`hasTouch`](https://playwright.dev/docs/api/class-browser#browser-new-context-option-has-touch) option of the
   * browser context is false.
   *
   * @see {@link Page.tap}
   */
  readonly tap: (
    selector: string,
    options?: Parameters<Page["tap"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.hover([options])](https://playwright.dev/docs/api/class-locator#locator-hover) instead.
   * Read more about [locators](https://playwright.dev/docs/locators).
   *
   * This method hovers over an element matching
   * [`selector`](https://playwright.dev/docs/api/class-page#page-hover-option-selector) by performing the following
   * steps:
   * 1. Find an element matching [`selector`](https://playwright.dev/docs/api/class-page#page-hover-option-selector).
   *    If there is none, wait until a matching element is attached to the DOM.
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the matched element, unless
   *    [`force`](https://playwright.dev/docs/api/class-page#page-hover-option-force) option is set. If the element
   *    is detached during the checks, the whole action is retried.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to hover over the center of the
   *    element, or the specified
   *    [`position`](https://playwright.dev/docs/api/class-page#page-hover-option-position).
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-page#page-hover-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * @see {@link Page.hover}
   */
  readonly hover: (
    selector: string,
    options?: Parameters<Page["hover"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.fill(value[, options])](https://playwright.dev/docs/api/class-locator#locator-fill)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * This method waits for an element matching
   * [`selector`](https://playwright.dev/docs/api/class-page#page-fill-option-selector), waits for
   * [actionability](https://playwright.dev/docs/actionability) checks, focuses the element, fills it and triggers an `input` event after
   * filling. Note that you can pass an empty string to clear the input field.
   *
   * If the target element is not an `<input>`, `<textarea>` or `[contenteditable]` element, this method throws an
   * error. However, if the element is inside the `<label>` element that has an associated
   * [control](https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement/control), the control will be filled
   * instead.
   *
   * To send fine-grained keyboard events, use
   * [locator.pressSequentially(text[, options])](https://playwright.dev/docs/api/class-locator#locator-press-sequentially).
   *
   * @see {@link Page.fill}
   */
  readonly fill: (
    selector: string,
    value: string,
    options?: Parameters<Page["fill"]>[2],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Sends a `keydown`, `keypress`/`input`, and `keyup` event for each character in the text. `page.type` can be used to
   * send fine-grained keyboard events. To fill values in form fields, use
   * [page.fill(selector, value[, options])](https://playwright.dev/docs/api/class-page#page-fill).
   *
   * To press a special key, like `Control` or `ArrowDown`, use
   * [keyboard.press(key[, options])](https://playwright.dev/docs/api/class-keyboard#keyboard-press).
   *
   * **Usage**
   *
   * @see {@link Page.type}
   */
  readonly type: (
    selector: string,
    text: string,
    options?: Parameters<Page["type"]>[2],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.press(key[, options])](https://playwright.dev/docs/api/class-locator#locator-press)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * Focuses the element, and then uses
   * [keyboard.down(key)](https://playwright.dev/docs/api/class-keyboard#keyboard-down) and
   * [keyboard.up(key)](https://playwright.dev/docs/api/class-keyboard#keyboard-up).
   *
   * [`key`](https://playwright.dev/docs/api/class-page#page-press-option-key) can specify the intended
   * [keyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key) value or a single character
   * to generate the text for. A superset of the
   * [`key`](https://playwright.dev/docs/api/class-page#page-press-option-key) values can be found
   * [here](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values). Examples of the keys are:
   *
   * `F1` - `F12`, `Digit0`- `Digit9`, `KeyA`- `KeyZ`, `Backquote`, `Minus`, `Equal`, `Backslash`, `Backspace`, `Tab`,
   * `Delete`, `Escape`, `ArrowDown`, `End`, `Enter`, `Home`, `Insert`, `PageDown`, `PageUp`, `ArrowRight`, `ArrowUp`,
   * etc.
   *
   * Following modification shortcuts are also supported: `Shift`, `Control`, `Alt`, `Meta`, `ShiftLeft`,
   * `ControlOrMeta`. `ControlOrMeta` resolves to `Control` on Windows and Linux and to `Meta` on macOS.
   *
   * Holding down `Shift` will type the text that corresponds to the
   * [`key`](https://playwright.dev/docs/api/class-page#page-press-option-key) in the upper case.
   *
   * If [`key`](https://playwright.dev/docs/api/class-page#page-press-option-key) is a single character, it is
   * case-sensitive, so the values `a` and `A` will generate different respective texts.
   *
   * Shortcuts such as `key: "Control+o"`, `key: "Control++` or `key: "Control+Shift+T"` are supported as well. When
   * specified with the modifier, modifier is pressed and being held while the subsequent key is being pressed.
   *
   * **Usage**
   *
   * ```js
   * const page = await browser.newPage();
   * await page.goto('https://keycode.info');
   * await page.press('body', 'A');
   * await page.screenshot({ path: 'A.png' });
   * await page.press('body', 'ArrowLeft');
   * await page.screenshot({ path: 'ArrowLeft.png' });
   * await page.press('body', 'Shift+O');
   * await page.screenshot({ path: 'O.png' });
   * await browser.close();
   * ```
   *
   * @see {@link Page.press}
   */
  readonly press: (
    selector: string,
    key: string,
    options?: Parameters<Page["press"]>[2],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** Use locator-based
   * [locator.selectOption(values[, options])](https://playwright.dev/docs/api/class-locator#locator-select-option)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * This method waits for an element matching
   * [`selector`](https://playwright.dev/docs/api/class-page#page-select-option-option-selector), waits for
   * [actionability](https://playwright.dev/docs/actionability) checks, waits until all specified options are present in the `<select>`
   * element and selects these options.
   *
   * If the target element is not a `<select>` element, this method throws an error. However, if the element is inside
   * the `<label>` element that has an associated
   * [control](https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement/control), the control will be used
   * instead.
   *
   * Returns the array of option values that have been successfully selected.
   *
   * Triggers a `change` and `input` event once all the provided options have been selected.
   *
   * **Usage**
   *
   * ```js
   * // Single selection matching the value or label
   * page.selectOption('select#colors', 'blue');
   *
   * // single selection matching the label
   * page.selectOption('select#colors', { label: 'Blue' });
   *
   * // multiple selection
   * page.selectOption('select#colors', ['red', 'green', 'blue']);
   *
   * ```
   *
   * @see {@link Page.selectOption}
   */
  readonly selectOption: (
    selector: string,
    values: Parameters<Page["selectOption"]>[1],
    options?: Parameters<Page["selectOption"]>[2],
  ) => Effect.Effect<readonly string[], PlaywrightError>;
  /**
   * **NOTE** Use locator-based
   * [locator.setChecked(checked[, options])](https://playwright.dev/docs/api/class-locator#locator-set-checked)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * This method checks or unchecks an element matching
   * [`selector`](https://playwright.dev/docs/api/class-page#page-set-checked-option-selector) by performing the
   * following steps:
   * 1. Find an element matching
   *    [`selector`](https://playwright.dev/docs/api/class-page#page-set-checked-option-selector). If there is none,
   *    wait until a matching element is attached to the DOM.
   * 1. Ensure that matched element is a checkbox or a radio input. If not, this method throws.
   * 1. If the element already has the right checked state, this method returns immediately.
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the matched element, unless
   *    [`force`](https://playwright.dev/docs/api/class-page#page-set-checked-option-force) option is set. If the
   *    element is detached during the checks, the whole action is retried.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to click in the center of the
   *    element.
   * 1. Ensure that the element is now checked or unchecked. If not, this method throws.
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-page#page-set-checked-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * @see {@link Page.setChecked}
   */
  readonly setChecked: (
    selector: string,
    checked: boolean,
    options?: Parameters<Page["setChecked"]>[2],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.check([options])](https://playwright.dev/docs/api/class-locator#locator-check) instead.
   * Read more about [locators](https://playwright.dev/docs/locators).
   *
   * This method checks an element matching
   * [`selector`](https://playwright.dev/docs/api/class-page#page-check-option-selector) by performing the following
   * steps:
   * 1. Find an element matching [`selector`](https://playwright.dev/docs/api/class-page#page-check-option-selector).
   *    If there is none, wait until a matching element is attached to the DOM.
   * 1. Ensure that matched element is a checkbox or a radio input. If not, this method throws. If the element is
   *    already checked, this method returns immediately.
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the matched element, unless
   *    [`force`](https://playwright.dev/docs/api/class-page#page-check-option-force) option is set. If the element
   *    is detached during the checks, the whole action is retried.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to click in the center of the
   *    element.
   * 1. Ensure that the element is now checked. If not, this method throws.
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-page#page-check-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * @see {@link Page.check}
   */
  readonly check: (
    selector: string,
    options?: Parameters<Page["check"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.uncheck([options])](https://playwright.dev/docs/api/class-locator#locator-uncheck)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * This method unchecks an element matching
   * [`selector`](https://playwright.dev/docs/api/class-page#page-uncheck-option-selector) by performing the following
   * steps:
   * 1. Find an element matching
   *    [`selector`](https://playwright.dev/docs/api/class-page#page-uncheck-option-selector). If there is none, wait
   *    until a matching element is attached to the DOM.
   * 1. Ensure that matched element is a checkbox or a radio input. If not, this method throws. If the element is
   *    already unchecked, this method returns immediately.
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the matched element, unless
   *    [`force`](https://playwright.dev/docs/api/class-page#page-uncheck-option-force) option is set. If the element
   *    is detached during the checks, the whole action is retried.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to click in the center of the
   *    element.
   * 1. Ensure that the element is now unchecked. If not, this method throws.
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-page#page-uncheck-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * @see {@link Page.uncheck}
   */
  readonly uncheck: (
    selector: string,
    options?: Parameters<Page["uncheck"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** Use locator-based
   * [locator.setInputFiles(files[, options])](https://playwright.dev/docs/api/class-locator#locator-set-input-files)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * Sets the value of the file input to these file paths or files. If some of the `filePaths` are relative paths, then
   * they are resolved relative to the current working directory. For empty array, clears the selected files. For inputs
   * with a `[webkitdirectory]` attribute, only a single directory path is supported.
   *
   * This method expects [`selector`](https://playwright.dev/docs/api/class-page#page-set-input-files-option-selector)
   * to point to an [input element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input). However, if the
   * element is inside the `<label>` element that has an associated
   * [control](https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement/control), targets the control instead.
   *
   * @see {@link Page.setInputFiles}
   */
  readonly setInputFiles: (
    selector: string,
    files: Parameters<Page["setInputFiles"]>[1],
    options?: Parameters<Page["setInputFiles"]>[2],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * This method drags the source element to the target element. It will first move to the source element, perform a
   * `mousedown`, then move to the target element and perform a `mouseup`.
   *
   * **Usage**
   *
   * ```js
   * await page.dragAndDrop('#source', '#target');
   * // or specify exact positions relative to the top-left corners of the elements:
   * await page.dragAndDrop('#source', '#target', {
   *   sourcePosition: { x: 34, y: 7 },
   *   targetPosition: { x: 10, y: 20 },
   * });
   * ```
   *
   * @see {@link Page.dragAndDrop}
   */
  readonly dragAndDrop: (
    source: string,
    target: string,
    options?: Parameters<Page["dragAndDrop"]>[2],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** Use locator-based [locator.focus([options])](https://playwright.dev/docs/api/class-locator#locator-focus) instead.
   * Read more about [locators](https://playwright.dev/docs/locators).
   *
   * This method fetches an element with
   * [`selector`](https://playwright.dev/docs/api/class-page#page-focus-option-selector) and focuses it. If there's no
   * element matching [`selector`](https://playwright.dev/docs/api/class-page#page-focus-option-selector), the method
   * waits until a matching element appears in the DOM.
   *
   * @see {@link Page.focus}
   */
  readonly focus: (
    selector: string,
    options?: Parameters<Page["focus"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** Use locator-based
   * [locator.dispatchEvent(type[, eventInit, options])](https://playwright.dev/docs/api/class-locator#locator-dispatch-event)
   * instead. Read more about [locators](https://playwright.dev/docs/locators).
   *
   * The snippet below dispatches the `click` event on the element. Regardless of the visibility state of the element,
   * `click` is dispatched. This is equivalent to calling
   * [element.click()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/click).
   *
   * **Usage**
   *
   * ```js
   * await page.dispatchEvent('button#submit', 'click');
   * ```
   *
   * Under the hood, it creates an instance of an event based on the given
   * [`type`](https://playwright.dev/docs/api/class-page#page-dispatch-event-option-type), initializes it with
   * [`eventInit`](https://playwright.dev/docs/api/class-page#page-dispatch-event-option-event-init) properties and
   * dispatches it on the element. Events are `composed`, `cancelable` and bubble by default.
   *
   * Since [`eventInit`](https://playwright.dev/docs/api/class-page#page-dispatch-event-option-event-init) is
   * event-specific, please refer to the events documentation for the lists of initial properties:
   * - [DeviceMotionEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/DeviceMotionEvent)
   * - [DeviceOrientationEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/DeviceOrientationEvent)
   * - [DragEvent](https://developer.mozilla.org/en-US/docs/Web/API/DragEvent/DragEvent)
   * - [Event](https://developer.mozilla.org/en-US/docs/Web/API/Event/Event)
   * - [FocusEvent](https://developer.mozilla.org/en-US/docs/Web/API/FocusEvent/FocusEvent)
   * - [KeyboardEvent](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/KeyboardEvent)
   * - [MouseEvent](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/MouseEvent)
   * - [PointerEvent](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/PointerEvent)
   * - [TouchEvent](https://developer.mozilla.org/en-US/docs/Web/API/TouchEvent/TouchEvent)
   * - [WheelEvent](https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent/WheelEvent)
   *
   * You can also specify `JSHandle` as the property value if you want live objects to be passed into the event:
   *
   * ```js
   * // Note you can only create DataTransfer in Chromium and Firefox
   * const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
   * await page.dispatchEvent('#source', 'dragstart', { dataTransfer });
   * ```
   *
   * @see {@link Page.dispatchEvent}
   */
  readonly dispatchEvent: (
    selector: string,
    type: string,
    eventInit?: Parameters<Page["dispatchEvent"]>[2],
    options?: Parameters<Page["dispatchEvent"]>[3],
  ) => Effect.Effect<void, PlaywrightError>;

  // Evaluation
  /**
   * Returns the value of the
   * [`pageFunction`](https://playwright.dev/docs/api/class-page#page-evaluate-option-expression) invocation.
   *
   * If the function passed to the
   * [page.evaluate(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate) returns a [Promise],
   * then [page.evaluate(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate) would wait for
   * the promise to resolve and return its value.
   *
   * If the function passed to the
   * [page.evaluate(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate) returns a
   * non-[Serializable] value, then
   * [page.evaluate(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate) resolves to
   * `undefined`. Playwright also supports transferring some additional values that are not serializable by `JSON`:
   * `-0`, `NaN`, `Infinity`, `-Infinity`.
   *
   * **Usage**
   *
   * Passing argument to [`pageFunction`](https://playwright.dev/docs/api/class-page#page-evaluate-option-expression):
   *
   * ```js
   * const result = await page.evaluate(([x, y]) => {
   *   return Promise.resolve(x * y);
   * }, [7, 8]);
   * console.log(result); // prints "56"
   * ```
   *
   * A string can also be passed in instead of a function:
   *
   * ```js
   * console.log(await page.evaluate('1 + 2')); // prints "3"
   * const x = 10;
   * console.log(await page.evaluate(`1 + ${x}`)); // prints "11"
   * ```
   *
   * [ElementHandle](https://playwright.dev/docs/api/class-elementhandle) instances can be passed as an argument to the
   * [page.evaluate(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate):
   *
   * ```js
   * const bodyHandle = await page.evaluate('document.body');
   * const html = await page.evaluate<string, HTMLElement>(([body, suffix]) =>
   *   body.innerHTML + suffix, [bodyHandle, 'hello']
   * );
   * await bodyHandle.dispose();
   * ```
   *
   * @see {@link Page.evaluate}
   */
  readonly evaluate: <T, Arg = void>(
    pageFunction: (...args: [Arg]) => T,
    arg?: Arg,
  ) => Effect.Effect<Awaited<T>, PlaywrightError>;
  /**
   * Returns the value of the
   * [`pageFunction`](https://playwright.dev/docs/api/class-page#page-evaluate-handle-option-expression) invocation as a
   * [JSHandle](https://playwright.dev/docs/api/class-jshandle).
   *
   * The only difference between
   * [page.evaluate(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate) and
   * [page.evaluateHandle(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate-handle) is that
   * [page.evaluateHandle(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate-handle) returns
   * [JSHandle](https://playwright.dev/docs/api/class-jshandle).
   *
   * If the function passed to the
   * [page.evaluateHandle(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate-handle) returns
   * a [Promise], then
   * [page.evaluateHandle(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate-handle) would
   * wait for the promise to resolve and return its value.
   *
   * **Usage**
   *
   * ```js
   * // Handle for the window object.
   * const aWindowHandle = await page.evaluateHandle(() => Promise.resolve(window));
   * ```
   *
   * A string can also be passed in instead of a function:
   *
   * ```js
   * const aHandle = await page.evaluateHandle('document'); // Handle for the 'document'
   * ```
   *
   * [JSHandle](https://playwright.dev/docs/api/class-jshandle) instances can be passed as an argument to the
   * [page.evaluateHandle(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate-handle):
   *
   * ```js
   * const aHandle = await page.evaluateHandle(() => document.body);
   * const resultHandle = await page.evaluateHandle(body => body.innerHTML, aHandle);
   * console.log(await resultHandle.jsonValue());
   * await resultHandle.dispose();
   * ```
   *
   * @see {@link Page.evaluateHandle}
   */
  readonly evaluateHandle: <R, Arg = void>(
    pageFunction: (...args: [Arg]) => R,
    arg?: Arg,
  ) => Effect.Effect<JSHandle<R>, PlaywrightError>;

  // Script/Style injection
  /**
   * Adds a `<script>` tag into the page with the desired url or content. Returns the added tag when the script's onload
   * fires or when the script content was injected into frame.
   *
   * @see {@link Page.addScriptTag}
   */
  readonly addScriptTag: (
    options?: Parameters<Page["addScriptTag"]>[0],
  ) => Effect.Effect<ElementHandle, PlaywrightError>;
  /**
   * Adds a `<link rel="stylesheet">` tag into the page with the desired url or a `<style type="text/css">` tag with the
   * content. Returns the added tag when the stylesheet's onload fires or when the CSS content was injected into frame.
   *
   * @see {@link Page.addStyleTag}
   */
  readonly addStyleTag: (
    options?: Parameters<Page["addStyleTag"]>[0],
  ) => Effect.Effect<ElementHandle, PlaywrightError>;
  /**
   * Adds a script which would be evaluated in one of the following scenarios:
   * - Whenever the page is navigated.
   * - Whenever the child frame is attached or navigated. In this case, the script is evaluated in the context of the
   *   newly attached frame.
   *
   * The script is evaluated after the document was created but before any of its scripts were run. This is useful to
   * amend the JavaScript environment, e.g. to seed `Math.random`.
   *
   * **Usage**
   *
   * An example of overriding `Math.random` before the page loads:
   *
   * ```js
   * // preload.js
   * Math.random = () => 42;
   * ```
   *
   * ```js
   * // In your playwright script, assuming the preload.js file is in same directory
   * await page.addInitScript({ path: './preload.js' });
   * ```
   *
   * ```js
   * await page.addInitScript(mock => {
   *   window.mock = mock;
   * }, mock);
   * ```
   *
   * **NOTE** The order of evaluation of multiple scripts installed via
   * [browserContext.addInitScript(script[, arg])](https://playwright.dev/docs/api/class-browsercontext#browser-context-add-init-script)
   * and [page.addInitScript(script[, arg])](https://playwright.dev/docs/api/class-page#page-add-init-script) is not
   * defined.
   *
   * @see {@link Page.addInitScript}
   */
  readonly addInitScript: (
    script: Parameters<Page["addInitScript"]>[0],
    arg?: Parameters<Page["addInitScript"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;

  // Waiting
  /**
   * **NOTE** Use web assertions that assert visibility or a locator-based
   * [locator.waitFor([options])](https://playwright.dev/docs/api/class-locator#locator-wait-for) instead. Read more
   * about [locators](https://playwright.dev/docs/locators).
   *
   * Returns when element specified by selector satisfies
   * [`state`](https://playwright.dev/docs/api/class-page#page-wait-for-selector-option-state) option. Returns `null` if
   * waiting for `hidden` or `detached`.
   *
   * **NOTE** Playwright automatically waits for element to be ready before performing an action. Using
   * [Locator](https://playwright.dev/docs/api/class-locator) objects and web-first assertions makes the code
   * wait-for-selector-free.
   *
   * Wait for the [`selector`](https://playwright.dev/docs/api/class-page#page-wait-for-selector-option-selector) to
   * satisfy [`state`](https://playwright.dev/docs/api/class-page#page-wait-for-selector-option-state) option (either
   * appear/disappear from dom, or become visible/hidden). If at the moment of calling the method
   * [`selector`](https://playwright.dev/docs/api/class-page#page-wait-for-selector-option-selector) already satisfies
   * the condition, the method will return immediately. If the selector doesn't satisfy the condition for the
   * [`timeout`](https://playwright.dev/docs/api/class-page#page-wait-for-selector-option-timeout) milliseconds, the
   * function will throw.
   *
   * **Usage**
   *
   * This method works across navigations:
   *
   * ```js
   * const { chromium } = require('playwright');  // Or 'firefox' or 'webkit'.
   *
   * (async () => {
   *   const browser = await chromium.launch();
   *   const page = await browser.newPage();
   *   for (const currentURL of ['https://google.com', 'https://bbc.com']) {
   *     await page.goto(currentURL);
   *     const element = await page.waitForSelector('img');
   *     console.log('Loaded image: ' + await element.getAttribute('src'));
   *   }
   *   await browser.close();
   * })();
   * ```
   *
   * @see {@link Page.waitForSelector}
   */
  readonly waitForSelector: (
    selector: string,
    options?: Parameters<Page["waitForSelector"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Waits for the main frame navigation and returns the main resource response. In case of multiple redirects, the
   * navigation will resolve with the response of the last redirect. In case of navigation to a different anchor or
   * navigation due to History API usage, the navigation will resolve with `null`.
   *
   * **Usage**
   *
   * This resolves when the page navigates to a new URL or reloads. It is useful for when you run code which will
   * indirectly cause the page to navigate. e.g. The click target has an `onclick` handler that triggers navigation from
   * a `setTimeout`. Consider this example:
   *
   * ```js
   * // Start waiting for navigation before clicking. Note no await.
   * const navigationPromise = page.waitForNavigation();
   * await page.getByText('Navigate after timeout').click();
   * await navigationPromise;
   * ```
   *
   * **NOTE** Usage of the [History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API) to change the URL
   * is considered a navigation.
   *
   * @see {@link Page.waitForNavigation}
   */
  readonly waitForNavigation: (
    options?: Parameters<Page["waitForNavigation"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Returns when the required load state has been reached.
   *
   * This resolves when the page reaches a required load state, `load` by default. The navigation must have been
   * committed when this method is called. If current document has already reached the required state, resolves
   * immediately.
   *
   * **NOTE** Most of the time, this method is not needed because Playwright
   * [auto-waits before every action](https://playwright.dev/docs/actionability).
   *
   * **Usage**
   *
   * ```js
   * await page.getByRole('button').click(); // Click triggers navigation.
   * await page.waitForLoadState(); // The promise resolves after 'load' event.
   * ```
   *
   * ```js
   * const popupPromise = page.waitForEvent('popup');
   * await page.getByRole('button').click(); // Click triggers a popup.
   * const popup = await popupPromise;
   * await popup.waitForLoadState('domcontentloaded'); // Wait for the 'DOMContentLoaded' event.
   * console.log(await popup.title()); // Popup is ready to use.
   * ```
   *
   * @see {@link Page.waitForLoadState}
   */
  readonly waitForLoadState: (
    state?: Parameters<Page["waitForLoadState"]>[0],
    options?: Parameters<Page["waitForLoadState"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Waits for the main frame to navigate to the given URL.
   *
   * **Usage**
   *
   * ```js
   * await page.click('a.delayed-navigation'); // Clicking the link will indirectly cause a navigation
   * await page.waitForURL('**\/target.html');
   * ```
   *
   * @see {@link Page.waitForURL}
   */
  readonly waitForURL: (
    url: Parameters<Page["waitForURL"]>[0],
    options?: Parameters<Page["waitForURL"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Waits for the matching request and returns it. See [waiting for event](https://playwright.dev/docs/events#waiting-for-event) for more
   * details about events.
   *
   * **Usage**
   *
   * ```js
   * // Start waiting for request before clicking. Note no await.
   * const requestPromise = page.waitForRequest('https://example.com/resource');
   * await page.getByText('trigger request').click();
   * const request = await requestPromise;
   *
   * // Alternative way with a predicate. Note no await.
   * const requestPromise = page.waitForRequest(request =>
   *   request.url() === 'https://example.com' && request.method() === 'GET',
   * );
   * await page.getByText('trigger request').click();
   * const request = await requestPromise;
   * ```
   *
   * @see {@link Page.waitForRequest}
   */
  readonly waitForRequest: (
    urlOrPredicate: Parameters<Page["waitForRequest"]>[0],
    options?: Parameters<Page["waitForRequest"]>[1],
  ) => Effect.Effect<Request, PlaywrightError>;
  /**
   * Returns the matched response. See [waiting for event](https://playwright.dev/docs/events#waiting-for-event) for more details about
   * events.
   *
   * **Usage**
   *
   * ```js
   * // Start waiting for response before clicking. Note no await.
   * const responsePromise = page.waitForResponse('https://example.com/resource');
   * await page.getByText('trigger response').click();
   * const response = await responsePromise;
   *
   * // Alternative way with a predicate. Note no await.
   * const responsePromise = page.waitForResponse(response =>
   *   response.url() === 'https://example.com' && response.status() === 200
   *       && response.request().method() === 'GET'
   * );
   * await page.getByText('trigger response').click();
   * const response = await responsePromise;
   * ```
   *
   * @see {@link Page.waitForResponse}
   */
  readonly waitForResponse: (
    urlOrPredicate: Parameters<Page["waitForResponse"]>[0],
    options?: Parameters<Page["waitForResponse"]>[1],
  ) => Effect.Effect<Response, PlaywrightError>;
  /**
   * Emitted when a dedicated [WebWorker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) is spawned
   * by the page.
   *
   * @see {@link Page.waitForEvent}
   */
  readonly waitForEvent: (
    event: Parameters<Page["waitForEvent"]>[0],
    optionsOrPredicate?: Parameters<Page["waitForEvent"]>[1],
  ) => Effect.Effect<unknown, PlaywrightError>;
  /**
   * Returns when the
   * [`pageFunction`](https://playwright.dev/docs/api/class-page#page-wait-for-function-option-expression) returns a
   * truthy value. It resolves to a JSHandle of the truthy value.
   *
   * **Usage**
   *
   * The
   * [page.waitForFunction(pageFunction[, arg, options])](https://playwright.dev/docs/api/class-page#page-wait-for-function)
   * can be used to observe viewport size change:
   *
   * ```js
   * const { webkit } = require('playwright');  // Or 'chromium' or 'firefox'.
   *
   * (async () => {
   *   const browser = await webkit.launch();
   *   const page = await browser.newPage();
   *   const watchDog = page.waitForFunction(() => window.innerWidth < 100);
   *   await page.setViewportSize({ width: 50, height: 50 });
   *   await watchDog;
   *   await browser.close();
   * })();
   * ```
   *
   * To pass an argument to the predicate of
   * [page.waitForFunction(pageFunction[, arg, options])](https://playwright.dev/docs/api/class-page#page-wait-for-function)
   * function:
   *
   * ```js
   * const selector = '.foo';
   * await page.waitForFunction(selector => !!document.querySelector(selector), selector);
   * ```
   *
   * @see {@link Page.waitForFunction}
   */
  readonly waitForFunction: <R, Arg = void>(
    pageFunction: (...args: [Arg]) => R,
    arg?: Arg,
    options?: Parameters<Page["waitForFunction"]>[2],
  ) => Effect.Effect<R, PlaywrightError>;
  /**
   * **NOTE** Never wait for timeout in production. Tests that wait for time are inherently flaky. Use
   * [Locator](https://playwright.dev/docs/api/class-locator) actions and web assertions that wait automatically.
   *
   * Waits for the given [`timeout`](https://playwright.dev/docs/api/class-page#page-wait-for-timeout-option-timeout) in
   * milliseconds.
   *
   * Note that `page.waitForTimeout()` should only be used for debugging. Tests using the timer in production are going
   * to be flaky. Use signals such as network events, selectors becoming visible and others instead.
   *
   * **Usage**
   *
   * ```js
   * // wait for 1 second
   * await page.waitForTimeout(1000);
   * ```
   *
   * @see {@link Page.waitForTimeout}
   */
  readonly waitForTimeout: (timeout: number) => Effect.Effect<void, PlaywrightError>;

  // Page state
  /**
   * In the case of multiple pages in a single browser, each page can have its own viewport size. However,
   * [browser.newContext([options])](https://playwright.dev/docs/api/class-browser#browser-new-context) allows to set
   * viewport size (and more) for all pages in the context at once.
   *
   * [page.setViewportSize(viewportSize)](https://playwright.dev/docs/api/class-page#page-set-viewport-size) will resize
   * the page. A lot of websites don't expect phones to change size, so you should set the viewport size before
   * navigating to the page.
   * [page.setViewportSize(viewportSize)](https://playwright.dev/docs/api/class-page#page-set-viewport-size) will also
   * reset `screen` size, use
   * [browser.newContext([options])](https://playwright.dev/docs/api/class-browser#browser-new-context) with `screen`
   * and `viewport` parameters if you need better control of these properties.
   *
   * **Usage**
   *
   * ```js
   * const page = await browser.newPage();
   * await page.setViewportSize({
   *   width: 640,
   *   height: 480,
   * });
   * await page.goto('https://example.com');
   * ```
   *
   * @see {@link Page.setViewportSize}
   */
  readonly setViewportSize: (
    viewportSize: Parameters<Page["setViewportSize"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Brings page to front (activates tab).
   *
   * @see {@link Page.bringToFront}
   */
  readonly bringToFront: Effect.Effect<void, PlaywrightError>;
  /**
   * This method changes the `CSS media type` through the `media` argument, and/or the `'prefers-colors-scheme'` media
   * feature, using the `colorScheme` argument.
   *
   * **Usage**
   *
   * ```js
   * await page.evaluate(() => matchMedia('screen').matches);
   * // → true
   * await page.evaluate(() => matchMedia('print').matches);
   * // → false
   *
   * await page.emulateMedia({ media: 'print' });
   * await page.evaluate(() => matchMedia('screen').matches);
   * // → false
   * await page.evaluate(() => matchMedia('print').matches);
   * // → true
   *
   * await page.emulateMedia({});
   * await page.evaluate(() => matchMedia('screen').matches);
   * // → true
   * await page.evaluate(() => matchMedia('print').matches);
   * // → false
   * ```
   *
   * ```js
   * await page.emulateMedia({ colorScheme: 'dark' });
   * await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
   * // → true
   * await page.evaluate(() => matchMedia('(prefers-color-scheme: light)').matches);
   * // → false
   * ```
   *
   * @see {@link Page.emulateMedia}
   */
  readonly emulateMedia: (
    options?: Parameters<Page["emulateMedia"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * The extra HTTP headers will be sent with every request the page initiates.
   *
   * **NOTE**
   * [page.setExtraHTTPHeaders(headers)](https://playwright.dev/docs/api/class-page#page-set-extra-http-headers) does
   * not guarantee the order of headers in the outgoing requests.
   *
   * @see {@link Page.setExtraHTTPHeaders}
   */
  readonly setExtraHTTPHeaders: (
    headers: Parameters<Page["setExtraHTTPHeaders"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;

  // Network interception
  /**
   * Routing provides the capability to modify network requests that are made by a page.
   *
   * Once routing is enabled, every request matching the url pattern will stall unless it's continued, fulfilled or
   * aborted.
   *
   * **NOTE** The handler will only be called for the first url if the response is a redirect.
   *
   * **NOTE** [page.route(url, handler[, options])](https://playwright.dev/docs/api/class-page#page-route) will not
   * intercept requests intercepted by Service Worker. See [this](https://github.com/microsoft/playwright/issues/1090)
   * issue. We recommend disabling Service Workers when using request interception by setting
   * [`serviceWorkers`](https://playwright.dev/docs/api/class-browser#browser-new-context-option-service-workers) to
   * `'block'`.
   *
   * **NOTE** [page.route(url, handler[, options])](https://playwright.dev/docs/api/class-page#page-route) will not
   * intercept the first request of a popup page. Use
   * [browserContext.route(url, handler[, options])](https://playwright.dev/docs/api/class-browsercontext#browser-context-route)
   * instead.
   *
   * **Usage**
   *
   * An example of a naive handler that aborts all image requests:
   *
   * ```js
   * const page = await browser.newPage();
   * await page.route('**\/*.{png,jpg,jpeg}', route => route.abort());
   * await page.goto('https://example.com');
   * await browser.close();
   * ```
   *
   * or the same snippet using a regex pattern instead:
   *
   * ```js
   * const page = await browser.newPage();
   * await page.route(/(\.png$)|(\.jpg$)/, route => route.abort());
   * await page.goto('https://example.com');
   * await browser.close();
   * ```
   *
   * It is possible to examine the request to decide the route action. For example, mocking all requests that contain
   * some post data, and leaving all other requests as is:
   *
   * ```js
   * await page.route('/api/**', async route => {
   *   if (route.request().postData().includes('my-string'))
   *     await route.fulfill({ body: 'mocked-data' });
   *   else
   *     await route.continue();
   * });
   * ```
   *
   * Page routes take precedence over browser context routes (set up with
   * [browserContext.route(url, handler[, options])](https://playwright.dev/docs/api/class-browsercontext#browser-context-route))
   * when request matches both handlers.
   *
   * To remove a route with its handler you can use
   * [page.unroute(url[, handler])](https://playwright.dev/docs/api/class-page#page-unroute).
   *
   * **NOTE** Enabling routing disables http cache.
   *
   * @see {@link Page.route}
   */
  readonly route: (
    url: Parameters<Page["route"]>[0],
    handler: Parameters<Page["route"]>[1],
    options?: Parameters<Page["route"]>[2],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * If specified the network requests that are made in the page will be served from the HAR file. Read more about
   * [Replaying from HAR](https://playwright.dev/docs/mock#replaying-from-har).
   *
   * Playwright will not serve requests intercepted by Service Worker from the HAR file. See
   * [this](https://github.com/microsoft/playwright/issues/1090) issue. We recommend disabling Service Workers when
   * using request interception by setting
   * [`serviceWorkers`](https://playwright.dev/docs/api/class-browser#browser-new-context-option-service-workers) to
   * `'block'`.
   *
   * @see {@link Page.routeFromHAR}
   */
  readonly routeFromHAR: (
    har: Parameters<Page["routeFromHAR"]>[0],
    options?: Parameters<Page["routeFromHAR"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Removes a route created with
   * [page.route(url, handler[, options])](https://playwright.dev/docs/api/class-page#page-route). When
   * [`handler`](https://playwright.dev/docs/api/class-page#page-unroute-option-handler) is not specified, removes all
   * routes for the [`url`](https://playwright.dev/docs/api/class-page#page-unroute-option-url).
   *
   * @see {@link Page.unroute}
   */
  readonly unroute: (
    url: Parameters<Page["unroute"]>[0],
    handler?: Parameters<Page["unroute"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Removes all routes created with
   * [page.route(url, handler[, options])](https://playwright.dev/docs/api/class-page#page-route) and
   * [page.routeFromHAR(har[, options])](https://playwright.dev/docs/api/class-page#page-route-from-har).
   *
   * @see {@link Page.unrouteAll}
   */
  readonly unrouteAll: (
    options?: Parameters<Page["unrouteAll"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * This method allows to modify websocket connections that are made by the page.
   *
   * Note that only `WebSocket`s created after this method was called will be routed. It is recommended to call this
   * method before navigating the page.
   *
   * **Usage**
   *
   * Below is an example of a simple mock that responds to a single message. See
   * [WebSocketRoute](https://playwright.dev/docs/api/class-websocketroute) for more details and examples.
   *
   * ```js
   * await page.routeWebSocket('/ws', ws => {
   *   ws.onMessage(message => {
   *     if (message === 'request')
   *       ws.send('response');
   *   });
   * });
   * ```
   *
   * @see {@link Page.routeWebSocket}
   */
  readonly routeWebSocket: (
    url: Parameters<Page["routeWebSocket"]>[0],
    handler: Parameters<Page["routeWebSocket"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;

  // Browser function exposure
  /**
   * The method adds a function called
   * [`name`](https://playwright.dev/docs/api/class-page#page-expose-function-option-name) on the `window` object of
   * every frame in the page. When called, the function executes
   * [`callback`](https://playwright.dev/docs/api/class-page#page-expose-function-option-callback) and returns a
   * [Promise] which resolves to the return value of
   * [`callback`](https://playwright.dev/docs/api/class-page#page-expose-function-option-callback).
   *
   * If the [`callback`](https://playwright.dev/docs/api/class-page#page-expose-function-option-callback) returns a
   * [Promise], it will be awaited.
   *
   * See
   * [browserContext.exposeFunction(name, callback)](https://playwright.dev/docs/api/class-browsercontext#browser-context-expose-function)
   * for context-wide exposed function.
   *
   * **NOTE** Functions installed via
   * [page.exposeFunction(name, callback)](https://playwright.dev/docs/api/class-page#page-expose-function) survive
   * navigations.
   *
   * **Usage**
   *
   * An example of adding a `sha256` function to the page:
   *
   * ```js
   * const { webkit } = require('playwright');  // Or 'chromium' or 'firefox'.
   * const crypto = require('crypto');
   *
   * (async () => {
   *   const browser = await webkit.launch({ headless: false });
   *   const page = await browser.newPage();
   *   await page.exposeFunction('sha256', text =>
   *     crypto.createHash('sha256').update(text).digest('hex'),
   *   );
   *   await page.setContent(`
   *     <script>
   *       async function onClick() {
   *         document.querySelector('div').textContent = await window.sha256('PLAYWRIGHT');
   *       }
   *     </script>
   *     <button onclick="onClick()">Click me</button>
   *     <div></div>
   *   `);
   *   await page.click('button');
   * })();
   * ```
   *
   * @see {@link Page.exposeFunction}
   */
  readonly exposeFunction: (
    name: string,
    callback: Parameters<Page["exposeFunction"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * The method adds a function called
   * [`name`](https://playwright.dev/docs/api/class-page#page-expose-binding-option-name) on the `window` object of
   * every frame in this page. When called, the function executes
   * [`callback`](https://playwright.dev/docs/api/class-page#page-expose-binding-option-callback) and returns a
   * [Promise] which resolves to the return value of
   * [`callback`](https://playwright.dev/docs/api/class-page#page-expose-binding-option-callback). If the
   * [`callback`](https://playwright.dev/docs/api/class-page#page-expose-binding-option-callback) returns a [Promise],
   * it will be awaited.
   *
   * The first argument of the
   * [`callback`](https://playwright.dev/docs/api/class-page#page-expose-binding-option-callback) function contains
   * information about the caller: `{ browserContext: BrowserContext, page: Page, frame: Frame }`.
   *
   * See
   * [browserContext.exposeBinding(name, callback[, options])](https://playwright.dev/docs/api/class-browsercontext#browser-context-expose-binding)
   * for the context-wide version.
   *
   * **NOTE** Functions installed via
   * [page.exposeBinding(name, callback[, options])](https://playwright.dev/docs/api/class-page#page-expose-binding)
   * survive navigations.
   *
   * **Usage**
   *
   * An example of exposing page URL to all frames in a page:
   *
   * ```js
   * const { webkit } = require('playwright');  // Or 'chromium' or 'firefox'.
   *
   * (async () => {
   *   const browser = await webkit.launch({ headless: false });
   *   const context = await browser.newContext();
   *   const page = await context.newPage();
   *   await page.exposeBinding('pageURL', ({ page }) => page.url());
   *   await page.setContent(`
   *     <script>
   *       async function onClick() {
   *         document.querySelector('div').textContent = await window.pageURL();
   *       }
   *     </script>
   *     <button onclick="onClick()">Click me</button>
   *     <div></div>
   *   `);
   *   await page.click('button');
   * })();
   * ```
   *
   * @see {@link Page.exposeBinding}
   */
  readonly exposeBinding: (
    name: string,
    callback: Parameters<Page["exposeBinding"]>[1],
    options?: Parameters<Page["exposeBinding"]>[2],
  ) => Effect.Effect<void, PlaywrightError>;

  // Locator handlers
  /**
   * When testing a web page, sometimes unexpected overlays like a "Sign up" dialog appear and block actions you want to
   * automate, e.g. clicking a button. These overlays don't always show up in the same way or at the same time, making
   * them tricky to handle in automated tests.
   *
   * This method lets you set up a special function, called a handler, that activates when it detects that overlay is
   * visible. The handler's job is to remove the overlay, allowing your test to continue as if the overlay wasn't there.
   *
   * Things to keep in mind:
   * - When an overlay is shown predictably, we recommend explicitly waiting for it in your test and dismissing it as
   *   a part of your normal test flow, instead of using
   *   [page.addLocatorHandler(locator, handler[, options])](https://playwright.dev/docs/api/class-page#page-add-locator-handler).
   * - Playwright checks for the overlay every time before executing or retrying an action that requires an
   *   [actionability check](https://playwright.dev/docs/actionability), or before performing an auto-waiting assertion check. When overlay
   *   is visible, Playwright calls the handler first, and then proceeds with the action/assertion. Note that the
   *   handler is only called when you perform an action/assertion - if the overlay becomes visible but you don't
   *   perform any actions, the handler will not be triggered.
   * - After executing the handler, Playwright will ensure that overlay that triggered the handler is not visible
   *   anymore. You can opt-out of this behavior with
   *   [`noWaitAfter`](https://playwright.dev/docs/api/class-page#page-add-locator-handler-option-no-wait-after).
   * - The execution time of the handler counts towards the timeout of the action/assertion that executed the handler.
   *   If your handler takes too long, it might cause timeouts.
   * - You can register multiple handlers. However, only a single handler will be running at a time. Make sure the
   *   actions within a handler don't depend on another handler.
   *
   * **NOTE** Running the handler will alter your page state mid-test. For example it will change the currently focused
   * element and move the mouse. Make sure that actions that run after the handler are self-contained and do not rely on
   * the focus and mouse state being unchanged.
   *
   * For example, consider a test that calls
   * [locator.focus([options])](https://playwright.dev/docs/api/class-locator#locator-focus) followed by
   * [keyboard.press(key[, options])](https://playwright.dev/docs/api/class-keyboard#keyboard-press). If your handler
   * clicks a button between these two actions, the focused element most likely will be wrong, and key press will happen
   * on the unexpected element. Use
   * [locator.press(key[, options])](https://playwright.dev/docs/api/class-locator#locator-press) instead to avoid this
   * problem.
   *
   * Another example is a series of mouse actions, where
   * [mouse.move(x, y[, options])](https://playwright.dev/docs/api/class-mouse#mouse-move) is followed by
   * [mouse.down([options])](https://playwright.dev/docs/api/class-mouse#mouse-down). Again, when the handler runs
   * between these two actions, the mouse position will be wrong during the mouse down. Prefer self-contained actions
   * like [locator.click([options])](https://playwright.dev/docs/api/class-locator#locator-click) that do not rely on
   * the state being unchanged by a handler.
   *
   * **Usage**
   *
   * An example that closes a "Sign up to the newsletter" dialog when it appears:
   *
   * ```js
   * // Setup the handler.
   * await page.addLocatorHandler(page.getByText('Sign up to the newsletter'), async () => {
   *   await page.getByRole('button', { name: 'No thanks' }).click();
   * });
   *
   * // Write the test as usual.
   * await page.goto('https://example.com');
   * await page.getByRole('button', { name: 'Start here' }).click();
   * ```
   *
   * An example that skips the "Confirm your security details" page when it is shown:
   *
   * ```js
   * // Setup the handler.
   * await page.addLocatorHandler(page.getByText('Confirm your security details'), async () => {
   *   await page.getByRole('button', { name: 'Remind me later' }).click();
   * });
   *
   * // Write the test as usual.
   * await page.goto('https://example.com');
   * await page.getByRole('button', { name: 'Start here' }).click();
   * ```
   *
   * An example with a custom callback on every actionability check. It uses a `<body>` locator that is always visible,
   * so the handler is called before every actionability check. It is important to specify
   * [`noWaitAfter`](https://playwright.dev/docs/api/class-page#page-add-locator-handler-option-no-wait-after), because
   * the handler does not hide the `<body>` element.
   *
   * ```js
   * // Setup the handler.
   * await page.addLocatorHandler(page.locator('body'), async () => {
   *   await page.evaluate(() => window.removeObstructionsForTestIfNeeded());
   * }, { noWaitAfter: true });
   *
   * // Write the test as usual.
   * await page.goto('https://example.com');
   * await page.getByRole('button', { name: 'Start here' }).click();
   * ```
   *
   * Handler takes the original locator as an argument. You can also automatically remove the handler after a number of
   * invocations by setting [`times`](https://playwright.dev/docs/api/class-page#page-add-locator-handler-option-times):
   *
   * ```js
   * await page.addLocatorHandler(page.getByLabel('Close'), async locator => {
   *   await locator.click();
   * }, { times: 1 });
   * ```
   *
   * @see {@link Page.addLocatorHandler}
   */
  readonly addLocatorHandler: (
    locator: PlaywrightLocator,
    handler: Parameters<Page["addLocatorHandler"]>[1],
    options?: Parameters<Page["addLocatorHandler"]>[2],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Removes all locator handlers added by
   * [page.addLocatorHandler(locator, handler[, options])](https://playwright.dev/docs/api/class-page#page-add-locator-handler)
   * for a specific locator.
   *
   * @see {@link Page.removeLocatorHandler}
   */
  readonly removeLocatorHandler: (
    locator: PlaywrightLocator,
  ) => Effect.Effect<void, PlaywrightError>;

  // Locators
  /**
   * The method returns an element locator that can be used to perform actions on this page / frame. Locator is resolved
   * to the element immediately before performing an action, so a series of actions on the same locator can in fact be
   * performed on different DOM elements. That would happen if the DOM structure between those actions has changed.
   *
   * [Learn more about locators](https://playwright.dev/docs/locators).
   *
   * @see {@link Page.locator}
   */
  readonly locator: (
    selector: string,
    options?: Parameters<Page["locator"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating elements by their [ARIA role](https://www.w3.org/TR/wai-aria-1.2/#roles),
   * [ARIA attributes](https://www.w3.org/TR/wai-aria-1.2/#aria-attributes) and
   * [accessible name](https://w3c.github.io/accname/#dfn-accessible-name).
   *
   * **Usage**
   *
   * Consider the following DOM structure.
   *
   * ```html
   * <h3>Sign up</h3>
   * <label>
   *   <input type="checkbox" /> Subscribe
   * </label>
   * <br/>
   * <button>Submit</button>
   * ```
   *
   * You can locate each element by it's implicit role:
   *
   * ```js
   * await expect(page.getByRole('heading', { name: 'Sign up' })).toBeVisible();
   *
   * await page.getByRole('checkbox', { name: 'Subscribe' }).check();
   *
   * await page.getByRole('button', { name: /submit/i }).click();
   * ```
   *
   * **Details**
   *
   * Role selector **does not replace** accessibility audits and conformance tests, but rather gives early feedback
   * about the ARIA guidelines.
   *
   * Many html elements have an implicitly [defined role](https://w3c.github.io/html-aam/#html-element-role-mappings)
   * that is recognized by the role selector. You can find all the
   * [supported roles here](https://www.w3.org/TR/wai-aria-1.2/#role_definitions). ARIA guidelines **do not recommend**
   * duplicating implicit roles and attributes by setting `role` and/or `aria-*` attributes to default values.
   *
   * @see {@link Page.getByRole}
   */
  readonly getByRole: (
    role: Parameters<Page["getByRole"]>[0],
    options?: Parameters<Page["getByRole"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating elements that contain given text.
   *
   * See also [locator.filter([options])](https://playwright.dev/docs/api/class-locator#locator-filter) that allows to
   * match by another criteria, like an accessible role, and then filter by the text content.
   *
   * **Usage**
   *
   * Consider the following DOM structure:
   *
   * ```html
   * <div>Hello <span>world</span></div>
   * <div>Hello</div>
   * ```
   *
   * You can locate by text substring, exact string, or a regular expression:
   *
   * ```js
   * // Matches <span>
   * page.getByText('world');
   *
   * // Matches first <div>
   * page.getByText('Hello world');
   *
   * // Matches second <div>
   * page.getByText('Hello', { exact: true });
   *
   * // Matches both <div>s
   * page.getByText(/Hello/);
   *
   * // Matches second <div>
   * page.getByText(/^hello$/i);
   * ```
   *
   * **Details**
   *
   * Matching by text always normalizes whitespace, even with exact match. For example, it turns multiple spaces into
   * one, turns line breaks into spaces and ignores leading and trailing whitespace.
   *
   * Input elements of the type `button` and `submit` are matched by their `value` instead of the text content. For
   * example, locating by text `"Log in"` matches `<input type=button value="Log in">`.
   *
   * @see {@link Page.getByText}
   */
  readonly getByText: (
    text: Parameters<Page["getByText"]>[0],
    options?: Parameters<Page["getByText"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating input elements by the text of the associated `<label>` or `aria-labelledby` element, or by the
   * `aria-label` attribute.
   *
   * **Usage**
   *
   * For example, this method will find inputs by label "Username" and "Password" in the following DOM:
   *
   * ```html
   * <input aria-label="Username">
   * <label for="password-input">Password:</label>
   * <input id="password-input">
   * ```
   *
   * ```js
   * await page.getByLabel('Username').fill('john');
   * await page.getByLabel('Password').fill('secret');
   * ```
   *
   * @see {@link Page.getByLabel}
   */
  readonly getByLabel: (
    label: Parameters<Page["getByLabel"]>[0],
    options?: Parameters<Page["getByLabel"]>[1],
  ) => PlaywrightLocator;
  /**
   * Locate element by the test id.
   *
   * **Usage**
   *
   * Consider the following DOM structure.
   *
   * ```html
   * <button data-testid="directions">Itinéraire</button>
   * ```
   *
   * You can locate the element by it's test id:
   *
   * ```js
   * await page.getByTestId('directions').click();
   * ```
   *
   * **Details**
   *
   * By default, the `data-testid` attribute is used as a test id. Use
   * [selectors.setTestIdAttribute(attributeName)](https://playwright.dev/docs/api/class-selectors#selectors-set-test-id-attribute)
   * to configure a different test id attribute if necessary.
   *
   * ```js
   * // Set custom test id attribute from
   *
   * @see {@link Page.getByTestId}
   */
  readonly getByTestId: (testId: Parameters<Page["getByTestId"]>[0]) => PlaywrightLocator;
  /**
   * Allows locating input elements by the placeholder text.
   *
   * **Usage**
   *
   * For example, consider the following DOM structure.
   *
   * ```html
   * <input type="email" placeholder="name@example.com" />
   * ```
   *
   * You can fill the input after locating it by the placeholder text:
   *
   * ```js
   * await page
   *     .getByPlaceholder('name@example.com')
   *     .fill('playwright@microsoft.com');
   * ```
   *
   * @see {@link Page.getByPlaceholder}
   */
  readonly getByPlaceholder: (
    text: Parameters<Page["getByPlaceholder"]>[0],
    options?: Parameters<Page["getByPlaceholder"]>[1],
  ) => PlaywrightLocator;

  // Frames
  /**
   * An array of all frames attached to the page.
   *
   * @see {@link Page.frames}
   */
  readonly frames: () => ReadonlyArray<PlaywrightFrame>;
  /**
   * The page's main frame. Page is guaranteed to have a main frame which persists during navigations.
   *
   * @see {@link Page.mainFrame}
   */
  readonly mainFrame: () => PlaywrightFrame;
  /**
   * Returns frame matching the specified criteria. Either `name` or `url` must be specified.
   *
   * **Usage**
   *
   * ```js
   * const frame = page.frame('frame-name');
   * ```
   *
   * ```js
   * const frame = page.frame({ url: /.*domain.*\/ });
   * ```
   *
   * @see {@link Page.frame}
   */
  readonly frame: (selector: Parameters<Page["frame"]>[0]) => PlaywrightFrame | null;

  // Input Devices
  /**
   * keyboard.
   *
   * @see {@link Page.keyboard}
   */
  readonly keyboard: PlaywrightKeyboard;
  /**
   * mouse.
   *
   * @see {@link Page.mouse}
   */
  readonly mouse: PlaywrightMouse;
  /**
   * touchscreen.
   *
   * @see {@link Page.touchscreen}
   */
  readonly touchscreen: PlaywrightTouchscreen;

  // Namespaces (lazy-bound, no scope concerns)
  /**
   * Playwright has ability to mock clock and passage of time.
   *
   * @see {@link Page.clock}
   */
  readonly clock: PlaywrightClock;
  /**
   * **NOTE** Only available for Chromium atm.
   *
   * Browser-specific Coverage implementation. See [Coverage](https://playwright.dev/docs/api/class-coverage) for more
   * details.
   *
   * @see {@link Page.coverage}
   */
  readonly coverage: PlaywrightCoverage;
  /**
   * API testing helper associated with this page. This method returns the same instance as
   * [browserContext.request](https://playwright.dev/docs/api/class-browsercontext#browser-context-request) on the
   * page's context. See
   * [browserContext.request](https://playwright.dev/docs/api/class-browsercontext#browser-context-request) for more
   * details.
   *
   * @see {@link Page.request}
   */
  readonly request: PlaywrightAPIRequestContext;
  /**
   * Video object associated with this page.
   *
   * @see {@link Page.video}
   */
  readonly video: () => PlaywrightVideo | null;

  // Frames
  /**
   * When working with iframes, you can create a frame locator that will enter the iframe and allow selecting elements
   * in that iframe.
   *
   * **Usage**
   *
   * Following snippet locates element with text "Submit" in the iframe with id `my-frame`, like `<iframe
   * id="my-frame">`:
   *
   * ```js
   * const locator = page.frameLocator('#my-iframe').getByText('Submit');
   * await locator.click();
   * ```
   *
   * @see {@link Page.frameLocator}
   */
  readonly frameLocator: (selector: string) => PlaywrightFrameLocator;

  // Capture
  /**
   * Returns the buffer with the captured screenshot.
   *
   * @see {@link Page.screenshot}
   */
  readonly screenshot: (
    options?: Parameters<Page["screenshot"]>[0],
  ) => Effect.Effect<Uint8Array, PlaywrightError>;
  /**
   * Returns the PDF buffer.
   *
   * `page.pdf()` generates a pdf of the page with `print` css media. To generate a pdf with `screen` media, call
   * [page.emulateMedia([options])](https://playwright.dev/docs/api/class-page#page-emulate-media) before calling
   * `page.pdf()`:
   *
   * **NOTE** By default, `page.pdf()` generates a pdf with modified colors for printing. Use the
   * [`-webkit-print-color-adjust`](https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-print-color-adjust)
   * property to force rendering of exact colors.
   *
   * **Usage**
   *
   * ```js
   * // Generates a PDF with 'screen' media type.
   * await page.emulateMedia({ media: 'screen' });
   * await page.pdf({ path: 'page.pdf' });
   * ```
   *
   * The [`width`](https://playwright.dev/docs/api/class-page#page-pdf-option-width),
   * [`height`](https://playwright.dev/docs/api/class-page#page-pdf-option-height), and
   * [`margin`](https://playwright.dev/docs/api/class-page#page-pdf-option-margin) options accept values labeled with
   * units. Unlabeled values are treated as pixels.
   *
   * A few examples:
   * - `page.pdf({width: 100})` - prints with width set to 100 pixels
   * - `page.pdf({width: '100px'})` - prints with width set to 100 pixels
   * - `page.pdf({width: '10cm'})` - prints with width set to 10 centimeters.
   *
   * All possible units are:
   * - `px` - pixel
   * - `in` - inch
   * - `cm` - centimeter
   * - `mm` - millimeter
   *
   * The [`format`](https://playwright.dev/docs/api/class-page#page-pdf-option-format) options are:
   * - `Letter`: 8.5in x 11in
   * - `Legal`: 8.5in x 14in
   * - `Tabloid`: 11in x 17in
   * - `Ledger`: 17in x 11in
   * - `A0`: 33.1in x 46.8in
   * - `A1`: 23.4in x 33.1in
   * - `A2`: 16.54in x 23.4in
   * - `A3`: 11.7in x 16.54in
   * - `A4`: 8.27in x 11.7in
   * - `A5`: 5.83in x 8.27in
   * - `A6`: 4.13in x 5.83in
   *
   * **NOTE** [`headerTemplate`](https://playwright.dev/docs/api/class-page#page-pdf-option-header-template) and
   * [`footerTemplate`](https://playwright.dev/docs/api/class-page#page-pdf-option-footer-template) markup have the
   * following limitations: > 1. Script tags inside templates are not evaluated. > 2. Page styles are not visible inside
   * templates.
   *
   * @see {@link Page.pdf}
   */
  readonly pdf: (
    options?: Parameters<Page["pdf"]>[0],
  ) => Effect.Effect<Uint8Array, PlaywrightError>;

  // Debugging
  /**
   * Pauses script execution. Playwright will stop executing the script and wait for the user to either press the
   * 'Resume' button in the page overlay or to call `playwright.resume()` in the DevTools console.
   *
   * User can inspect selectors or perform manual steps while paused. Resume will continue running the original script
   * from the place it was paused.
   *
   * **NOTE** This method requires Playwright to be started in a headed mode, with a falsy
   * [`headless`](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-headless) option.
   *
   * @see {@link Page.pause}
   */
  readonly pause: Effect.Effect<void, PlaywrightError>;

  // Page info
  /**
   * Returns the opener for popup pages and `null` for others. If the opener has been closed already the returns `null`.
   *
   * @see {@link Page.opener}
   */
  readonly opener: Effect.Effect<Page | null, PlaywrightError>;

  // Lifecycle
  /**
   * If [`runBeforeUnload`](https://playwright.dev/docs/api/class-page#page-close-option-run-before-unload) is `false`,
   * does not run any unload handlers and waits for the page to be closed. If
   * [`runBeforeUnload`](https://playwright.dev/docs/api/class-page#page-close-option-run-before-unload) is `true` the
   * method will run unload handlers, but will **not** wait for the page to close.
   *
   * By default, `page.close()` **does not** run `beforeunload` handlers.
   *
   * **NOTE** if [`runBeforeUnload`](https://playwright.dev/docs/api/class-page#page-close-option-run-before-unload) is
   * passed as true, a `beforeunload` dialog might be summoned and should be handled manually via
   * [page.on('dialog')](https://playwright.dev/docs/api/class-page#page-event-dialog) event.
   *
   * @see {@link Page.close}
   */
  readonly close: (options?: Parameters<Page["close"]>[0]) => Effect.Effect<void, PlaywrightError>;

  // Escape hatch
  readonly use: <T>(
    f: (page: Page, signal: AbortSignal) => Promise<T>,
  ) => Effect.Effect<T, PlaywrightError>;

  // Non-effect queries
  /**
   * Indicates that the page has been closed.
   *
   * @see {@link Page.isClosed}
   */
  readonly isClosed: () => boolean;

  // Context
  /**
   * Get the browser context that the page belongs to.
   *
   * @see {@link Page.context}
   */
  readonly context: () => PlaywrightBrowserContext;

  // Workers
  /**
   * This method returns all of the dedicated
   * [WebWorkers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) associated with the page.
   *
   * **NOTE** This does not contain ServiceWorkers
   *
   * @see {@link Page.workers}
   */
  readonly workers: () => ReadonlyArray<PlaywrightWorker>;

  // Timeouts
  /**
   * This setting will change the default maximum time for all the methods accepting
   * [`timeout`](https://playwright.dev/docs/api/class-page#page-set-default-timeout-option-timeout) option.
   *
   * **NOTE**
   * [page.setDefaultNavigationTimeout(timeout)](https://playwright.dev/docs/api/class-page#page-set-default-navigation-timeout)
   * takes priority over
   * [page.setDefaultTimeout(timeout)](https://playwright.dev/docs/api/class-page#page-set-default-timeout).
   *
   * @see {@link Page.setDefaultTimeout}
   */
  readonly setDefaultTimeout: (timeout: number) => void;

  /**
   * This setting will change the default maximum navigation time for the following methods and related shortcuts:
   * - [page.goBack([options])](https://playwright.dev/docs/api/class-page#page-go-back)
   * - [page.goForward([options])](https://playwright.dev/docs/api/class-page#page-go-forward)
   * - [page.goto(url[, options])](https://playwright.dev/docs/api/class-page#page-goto)
   * - [page.reload([options])](https://playwright.dev/docs/api/class-page#page-reload)
   * - [page.setContent(html[, options])](https://playwright.dev/docs/api/class-page#page-set-content)
   * - [page.waitForNavigation([options])](https://playwright.dev/docs/api/class-page#page-wait-for-navigation)
   * - [page.waitForURL(url[, options])](https://playwright.dev/docs/api/class-page#page-wait-for-url)
   *
   * **NOTE**
   * [page.setDefaultNavigationTimeout(timeout)](https://playwright.dev/docs/api/class-page#page-set-default-navigation-timeout)
   * takes priority over
   * [page.setDefaultTimeout(timeout)](https://playwright.dev/docs/api/class-page#page-set-default-timeout),
   * [browserContext.setDefaultTimeout(timeout)](https://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-timeout)
   * and
   * [browserContext.setDefaultNavigationTimeout(timeout)](https://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-navigation-timeout).
   *
   * @see {@link Page.setDefaultNavigationTimeout}
   */
  readonly setDefaultNavigationTimeout: (timeout: number) => void;

  // ── Event streams (Effect-idiomatic — manually maintained) ────────────
  // These do not exist on upstream `Page`. They subscribe to upstream
  // events via `page.on(event, handler)` and expose them as
  // `Effect<Stream<T>, never, Scope.Scope>` — same shape as CDP
  // module's stream accessors.

  /**
   * onConsole.
   *
   * @see {@link Page.onConsole}
   */
  readonly onConsole: () => Effect.Effect<Stream.Stream<ConsoleMessage>, never, Scope.Scope>;

  /**
   * onPageError.
   *
   * @see {@link Page.onPageError}
   */
  readonly onPageError: () => Effect.Effect<Stream.Stream<Error>, never, Scope.Scope>;
}

/**
 * Playwright locator service — wraps a Playwright `Locator` with curated methods
 * and a `use` escape hatch.
 *
 * Full implementation in `PlaywrightLocator.ts`.
 */
export interface PlaywrightLocator {
  /** The underlying Playwright `Locator`. */
  readonly _raw: Locator;

  // Actions
  /**
   * Click an element.
   *
   * **Details**
   *
   * This method clicks the element by performing the following steps:
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the element, unless
   *    [`force`](https://playwright.dev/docs/api/class-locator#locator-click-option-force) option is set.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to click in the center of the
   *    element, or the specified
   *    [`position`](https://playwright.dev/docs/api/class-locator#locator-click-option-position).
   * 1. Wait for initiated navigations to either succeed or fail, unless
   *    [`noWaitAfter`](https://playwright.dev/docs/api/class-locator#locator-click-option-no-wait-after) option is
   *    set.
   *
   * If the element is detached from the DOM at any moment during the action, this method throws.
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-locator#locator-click-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * **Usage**
   *
   * Click a button:
   *
   * ```js
   * await page.getByRole('button').click();
   * ```
   *
   * Shift-right-click at a specific position on a canvas:
   *
   * ```js
   * await page.locator('canvas').click({
   *   button: 'right',
   *   modifiers: ['Shift'],
   *   position: { x: 23, y: 32 },
   * });
   * ```
   *
   * @see {@link Locator.click}
   */
  readonly click: (
    options?: Parameters<Locator["click"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Double-click an element.
   *
   * **Details**
   *
   * This method double clicks the element by performing the following steps:
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the element, unless
   *    [`force`](https://playwright.dev/docs/api/class-locator#locator-dblclick-option-force) option is set.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to double click in the center of the
   *    element, or the specified
   *    [`position`](https://playwright.dev/docs/api/class-locator#locator-dblclick-option-position).
   *
   * If the element is detached from the DOM at any moment during the action, this method throws.
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-locator#locator-dblclick-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * **NOTE** `element.dblclick()` dispatches two `click` events and a single `dblclick` event.
   *
   * @see {@link Locator.dblclick}
   */
  readonly dblclick: (
    options?: Parameters<Locator["dblclick"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Set a value to the input field.
   *
   * **Usage**
   *
   * ```js
   * await page.getByRole('textbox').fill('example value');
   * ```
   *
   * **Details**
   *
   * This method waits for [actionability](https://playwright.dev/docs/actionability) checks, focuses the element, fills it and triggers an
   * `input` event after filling. Note that you can pass an empty string to clear the input field.
   *
   * If the target element is not an `<input>`, `<textarea>` or `[contenteditable]` element, this method throws an
   * error. However, if the element is inside the `<label>` element that has an associated
   * [control](https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement/control), the control will be filled
   * instead.
   *
   * To send fine-grained keyboard events, use
   * [locator.pressSequentially(text[, options])](https://playwright.dev/docs/api/class-locator#locator-press-sequentially).
   *
   * @see {@link Locator.fill}
   */
  readonly fill: (
    value: string,
    options?: Parameters<Locator["fill"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Focuses the element, and then sends a `keydown`, `keypress`/`input`, and `keyup` event for each character in the
   * text.
   *
   * To press a special key, like `Control` or `ArrowDown`, use
   * [locator.press(key[, options])](https://playwright.dev/docs/api/class-locator#locator-press).
   *
   * **Usage**
   *
   * @see {@link Locator.type}
   */
  readonly type: (
    text: string,
    options?: Parameters<Locator["type"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Focuses the matching element and presses a combination of the keys.
   *
   * **Usage**
   *
   * ```js
   * await page.getByRole('textbox').press('Backspace');
   * ```
   *
   * **Details**
   *
   * Focuses the element, and then uses
   * [keyboard.down(key)](https://playwright.dev/docs/api/class-keyboard#keyboard-down) and
   * [keyboard.up(key)](https://playwright.dev/docs/api/class-keyboard#keyboard-up).
   *
   * [`key`](https://playwright.dev/docs/api/class-locator#locator-press-option-key) can specify the intended
   * [keyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key) value or a single character
   * to generate the text for. A superset of the
   * [`key`](https://playwright.dev/docs/api/class-locator#locator-press-option-key) values can be found
   * [here](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values). Examples of the keys are:
   *
   * `F1` - `F12`, `Digit0`- `Digit9`, `KeyA`- `KeyZ`, `Backquote`, `Minus`, `Equal`, `Backslash`, `Backspace`, `Tab`,
   * `Delete`, `Escape`, `ArrowDown`, `End`, `Enter`, `Home`, `Insert`, `PageDown`, `PageUp`, `ArrowRight`, `ArrowUp`,
   * etc.
   *
   * Following modification shortcuts are also supported: `Shift`, `Control`, `Alt`, `Meta`, `ShiftLeft`,
   * `ControlOrMeta`. `ControlOrMeta` resolves to `Control` on Windows and Linux and to `Meta` on macOS.
   *
   * Holding down `Shift` will type the text that corresponds to the
   * [`key`](https://playwright.dev/docs/api/class-locator#locator-press-option-key) in the upper case.
   *
   * If [`key`](https://playwright.dev/docs/api/class-locator#locator-press-option-key) is a single character, it is
   * case-sensitive, so the values `a` and `A` will generate different respective texts.
   *
   * Shortcuts such as `key: "Control+o"`, `key: "Control++` or `key: "Control+Shift+T"` are supported as well. When
   * specified with the modifier, modifier is pressed and being held while the subsequent key is being pressed.
   *
   * @see {@link Locator.press}
   */
  readonly press: (
    key: string,
    options?: Parameters<Locator["press"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * **NOTE** In most cases, you should use
   * [locator.fill(value[, options])](https://playwright.dev/docs/api/class-locator#locator-fill) instead. You only need
   * to press keys one by one if there is special keyboard handling on the page.
   *
   * Focuses the element, and then sends a `keydown`, `keypress`/`input`, and `keyup` event for each character in the
   * text.
   *
   * To press a special key, like `Control` or `ArrowDown`, use
   * [locator.press(key[, options])](https://playwright.dev/docs/api/class-locator#locator-press).
   *
   * **Usage**
   *
   * ```js
   * await locator.pressSequentially('Hello'); // Types instantly
   * await locator.pressSequentially('World', { delay: 100 }); // Types slower, like a user
   * ```
   *
   * An example of typing into a text field and then submitting the form:
   *
   * ```js
   * const locator = page.getByLabel('Password');
   * await locator.pressSequentially('my password');
   * await locator.press('Enter');
   * ```
   *
   * @see {@link Locator.pressSequentially}
   */
  readonly pressSequentially: (
    text: string,
    options?: Parameters<Locator["pressSequentially"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Ensure that checkbox or radio element is checked.
   *
   * **Details**
   *
   * Performs the following steps:
   * 1. Ensure that element is a checkbox or a radio input. If not, this method throws. If the element is already
   *    checked, this method returns immediately.
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the element, unless
   *    [`force`](https://playwright.dev/docs/api/class-locator#locator-check-option-force) option is set.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to click in the center of the
   *    element.
   * 1. Ensure that the element is now checked. If not, this method throws.
   *
   * If the element is detached from the DOM at any moment during the action, this method throws.
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-locator#locator-check-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * **Usage**
   *
   * ```js
   * await page.getByRole('checkbox').check();
   * ```
   *
   * @see {@link Locator.check}
   */
  readonly check: (
    options?: Parameters<Locator["check"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Ensure that checkbox or radio element is unchecked.
   *
   * **Usage**
   *
   * ```js
   * await page.getByRole('checkbox').uncheck();
   * ```
   *
   * **Details**
   *
   * This method unchecks the element by performing the following steps:
   * 1. Ensure that element is a checkbox or a radio input. If not, this method throws. If the element is already
   *    unchecked, this method returns immediately.
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the element, unless
   *    [`force`](https://playwright.dev/docs/api/class-locator#locator-uncheck-option-force) option is set.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to click in the center of the
   *    element.
   * 1. Ensure that the element is now unchecked. If not, this method throws.
   *
   * If the element is detached from the DOM at any moment during the action, this method throws.
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-locator#locator-uncheck-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * @see {@link Locator.uncheck}
   */
  readonly uncheck: (
    options?: Parameters<Locator["uncheck"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Perform a tap gesture on the element matching the locator. For examples of emulating other gestures by manually
   * dispatching touch events, see the [emulating legacy touch events](https://playwright.dev/docs/touch-events) page.
   *
   * **Details**
   *
   * This method taps the element by performing the following steps:
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the element, unless
   *    [`force`](https://playwright.dev/docs/api/class-locator#locator-tap-option-force) option is set.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.touchscreen](https://playwright.dev/docs/api/class-page#page-touchscreen) to tap the center of the
   *    element, or the specified
   *    [`position`](https://playwright.dev/docs/api/class-locator#locator-tap-option-position).
   *
   * If the element is detached from the DOM at any moment during the action, this method throws.
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-locator#locator-tap-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * **NOTE** `element.tap()` requires that the `hasTouch` option of the browser context be set to true.
   *
   * @see {@link Locator.tap}
   */
  readonly tap: (options?: Parameters<Locator["tap"]>[0]) => Effect.Effect<void, PlaywrightError>;
  /**
   * Hover over the matching element.
   *
   * **Usage**
   *
   * ```js
   * await page.getByRole('link').hover();
   * ```
   *
   * **Details**
   *
   * This method hovers over the element by performing the following steps:
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the element, unless
   *    [`force`](https://playwright.dev/docs/api/class-locator#locator-hover-option-force) option is set.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to hover over the center of the
   *    element, or the specified
   *    [`position`](https://playwright.dev/docs/api/class-locator#locator-hover-option-position).
   *
   * If the element is detached from the DOM at any moment during the action, this method throws.
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-locator#locator-hover-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * @see {@link Locator.hover}
   */
  readonly hover: (
    options?: Parameters<Locator["hover"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Clear the input field.
   *
   * **Details**
   *
   * This method waits for [actionability](https://playwright.dev/docs/actionability) checks, focuses the element, clears it and triggers an
   * `input` event after clearing.
   *
   * If the target element is not an `<input>`, `<textarea>` or `[contenteditable]` element, this method throws an
   * error. However, if the element is inside the `<label>` element that has an associated
   * [control](https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement/control), the control will be cleared
   * instead.
   *
   * **Usage**
   *
   * ```js
   * await page.getByRole('textbox').clear();
   * ```
   *
   * @see {@link Locator.clear}
   */
  readonly clear: (
    options?: Parameters<Locator["clear"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Selects option or options in `<select>`.
   *
   * **Details**
   *
   * This method waits for [actionability](https://playwright.dev/docs/actionability) checks, waits until all specified options are present in
   * the `<select>` element and selects these options.
   *
   * If the target element is not a `<select>` element, this method throws an error. However, if the element is inside
   * the `<label>` element that has an associated
   * [control](https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement/control), the control will be used
   * instead.
   *
   * Returns the array of option values that have been successfully selected.
   *
   * Triggers a `change` and `input` event once all the provided options have been selected.
   *
   * **Usage**
   *
   * ```html
   * <select multiple>
   *   <option value="red">Red</option>
   *   <option value="green">Green</option>
   *   <option value="blue">Blue</option>
   * </select>
   * ```
   *
   * ```js
   * // single selection matching the value or label
   * element.selectOption('blue');
   *
   * // single selection matching the label
   * element.selectOption({ label: 'Blue' });
   *
   * // multiple selection for red, green and blue options
   * element.selectOption(['red', 'green', 'blue']);
   * ```
   *
   * @see {@link Locator.selectOption}
   */
  readonly selectOption: (
    values: Parameters<Locator["selectOption"]>[0],
    options?: Parameters<Locator["selectOption"]>[1],
  ) => Effect.Effect<readonly string[], PlaywrightError>;
  /**
   * This method waits for [actionability](https://playwright.dev/docs/actionability) checks, then focuses the element and selects all its
   * text content.
   *
   * If the element is inside the `<label>` element that has an associated
   * [control](https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement/control), focuses and selects text in
   * the control instead.
   *
   * @see {@link Locator.selectText}
   */
  readonly selectText: (
    options?: Parameters<Locator["selectText"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Upload file or multiple files into `<input type=file>`. For inputs with a `[webkitdirectory]` attribute, only a
   * single directory path is supported.
   *
   * **Usage**
   *
   * ```js
   * // Select one file
   * await page.getByLabel('Upload file').setInputFiles(path.join(__dirname, 'myfile.pdf'));
   *
   * // Select multiple files
   * await page.getByLabel('Upload files').setInputFiles([
   *   path.join(__dirname, 'file1.txt'),
   *   path.join(__dirname, 'file2.txt'),
   * ]);
   *
   * // Select a directory
   * await page.getByLabel('Upload directory').setInputFiles(path.join(__dirname, 'mydir'));
   *
   * // Remove all the selected files
   * await page.getByLabel('Upload file').setInputFiles([]);
   *
   * // Upload buffer from memory
   * await page.getByLabel('Upload file').setInputFiles({
   *   name: 'file.txt',
   *   mimeType: 'text/plain',
   *   buffer: Buffer.from('this is test')
   * });
   * ```
   *
   * **Details**
   *
   * Sets the value of the file input to these file paths or files. If some of the `filePaths` are relative paths, then
   * they are resolved relative to the current working directory. For empty array, clears the selected files.
   *
   * This method expects [Locator](https://playwright.dev/docs/api/class-locator) to point to an
   * [input element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input). However, if the element is inside
   * the `<label>` element that has an associated
   * [control](https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement/control), targets the control instead.
   *
   * @see {@link Locator.setInputFiles}
   */
  readonly setInputFiles: (
    files: Parameters<Locator["setInputFiles"]>[0],
    options?: Parameters<Locator["setInputFiles"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Set the state of a checkbox or a radio element.
   *
   * **Usage**
   *
   * ```js
   * await page.getByRole('checkbox').setChecked(true);
   * ```
   *
   * **Details**
   *
   * This method checks or unchecks an element by performing the following steps:
   * 1. Ensure that matched element is a checkbox or a radio input. If not, this method throws.
   * 1. If the element already has the right checked state, this method returns immediately.
   * 1. Wait for [actionability](https://playwright.dev/docs/actionability) checks on the matched element, unless
   *    [`force`](https://playwright.dev/docs/api/class-locator#locator-set-checked-option-force) option is set. If
   *    the element is detached during the checks, the whole action is retried.
   * 1. Scroll the element into view if needed.
   * 1. Use [page.mouse](https://playwright.dev/docs/api/class-page#page-mouse) to click in the center of the
   *    element.
   * 1. Ensure that the element is now checked or unchecked. If not, this method throws.
   *
   * When all steps combined have not finished during the specified
   * [`timeout`](https://playwright.dev/docs/api/class-locator#locator-set-checked-option-timeout), this method throws a
   * [TimeoutError](https://playwright.dev/docs/api/class-timeouterror). Passing zero timeout disables this.
   *
   * @see {@link Locator.setChecked}
   */
  readonly setChecked: (
    checked: boolean,
    options?: Parameters<Locator["setChecked"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Drag the source element towards the target element and drop it.
   *
   * **Details**
   *
   * This method drags the locator to another target locator or target position. It will first move to the source
   * element, perform a `mousedown`, then move to the target element or position and perform a `mouseup`.
   *
   * **Usage**
   *
   * ```js
   * const source = page.locator('#source');
   * const target = page.locator('#target');
   *
   * await source.dragTo(target);
   * // or specify exact positions relative to the top-left corners of the elements:
   * await source.dragTo(target, {
   *   sourcePosition: { x: 34, y: 7 },
   *   targetPosition: { x: 10, y: 20 },
   * });
   * ```
   *
   * @see {@link Locator.dragTo}
   */
  readonly dragTo: (
    target: PlaywrightLocator,
    options?: Parameters<Locator["dragTo"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Programmatically dispatch an event on the matching element.
   *
   * **Usage**
   *
   * ```js
   * await locator.dispatchEvent('click');
   * ```
   *
   * **Details**
   *
   * The snippet above dispatches the `click` event on the element. Regardless of the visibility state of the element,
   * `click` is dispatched. This is equivalent to calling
   * [element.click()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/click).
   *
   * Under the hood, it creates an instance of an event based on the given
   * [`type`](https://playwright.dev/docs/api/class-locator#locator-dispatch-event-option-type), initializes it with
   * [`eventInit`](https://playwright.dev/docs/api/class-locator#locator-dispatch-event-option-event-init) properties
   * and dispatches it on the element. Events are `composed`, `cancelable` and bubble by default.
   *
   * Since [`eventInit`](https://playwright.dev/docs/api/class-locator#locator-dispatch-event-option-event-init) is
   * event-specific, please refer to the events documentation for the lists of initial properties:
   * - [DeviceMotionEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/DeviceMotionEvent)
   * - [DeviceOrientationEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/DeviceOrientationEvent)
   * - [DragEvent](https://developer.mozilla.org/en-US/docs/Web/API/DragEvent/DragEvent)
   * - [Event](https://developer.mozilla.org/en-US/docs/Web/API/Event/Event)
   * - [FocusEvent](https://developer.mozilla.org/en-US/docs/Web/API/FocusEvent/FocusEvent)
   * - [KeyboardEvent](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/KeyboardEvent)
   * - [MouseEvent](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/MouseEvent)
   * - [PointerEvent](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/PointerEvent)
   * - [TouchEvent](https://developer.mozilla.org/en-US/docs/Web/API/TouchEvent/TouchEvent)
   * - [WheelEvent](https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent/WheelEvent)
   *
   * You can also specify [JSHandle](https://playwright.dev/docs/api/class-jshandle) as the property value if you want
   * live objects to be passed into the event:
   *
   * ```js
   * const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
   * await locator.dispatchEvent('dragstart', { dataTransfer });
   * ```
   *
   * @see {@link Locator.dispatchEvent}
   */
  readonly dispatchEvent: (
    type: string,
    eventInit?: Parameters<Locator["dispatchEvent"]>[1],
    options?: Parameters<Locator["dispatchEvent"]>[2],
  ) => Effect.Effect<void, PlaywrightError>;

  // Queries
  /**
   * Returns the [`node.textContent`](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent).
   *
   * **NOTE** If you need to assert text on the page, prefer
   * [expect(locator).toHaveText(expected[, options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-text)
   * to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * @see {@link Locator.textContent}
   */
  readonly textContent: Effect.Effect<string | null, PlaywrightError>;
  /**
   * Returns the [`element.innerText`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/innerText).
   *
   * **NOTE** If you need to assert text on the page, prefer
   * [expect(locator).toHaveText(expected[, options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-text)
   * with
   * [`useInnerText`](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-text-option-use-inner-text)
   * option to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * @see {@link Locator.innerText}
   */
  readonly innerText: Effect.Effect<string, PlaywrightError>;
  /**
   * Returns the [`element.innerHTML`](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML).
   *
   * @see {@link Locator.innerHTML}
   */
  readonly innerHTML: Effect.Effect<string, PlaywrightError>;
  /**
   * Returns the value for the matching `<input>` or `<textarea>` or `<select>` element.
   *
   * **NOTE** If you need to assert input value, prefer
   * [expect(locator).toHaveValue(value[, options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-value)
   * to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * **Usage**
   *
   * ```js
   * const value = await page.getByRole('textbox').inputValue();
   * ```
   *
   * **Details**
   *
   * Throws elements that are not an input, textarea or a select. However, if the element is inside the `<label>`
   * element that has an associated
   * [control](https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement/control), returns the value of the
   * control.
   *
   * @see {@link Locator.inputValue}
   */
  readonly inputValue: (
    options?: Parameters<Locator["inputValue"]>[0],
  ) => Effect.Effect<string, PlaywrightError>;
  /**
   * Returns the matching element's attribute value.
   *
   * **NOTE** If you need to assert an element's attribute, prefer
   * [expect(locator).toHaveAttribute(name, value[, options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-attribute)
   * to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * @see {@link Locator.getAttribute}
   */
  readonly getAttribute: (
    name: string,
    options?: Parameters<Locator["getAttribute"]>[1],
  ) => Effect.Effect<string | null, PlaywrightError>;
  /**
   * This method returns the bounding box of the element matching the locator, or `null` if the element is not visible.
   * The bounding box is calculated relative to the main frame viewport - which is usually the same as the browser
   * window.
   *
   * **Details**
   *
   * Scrolling affects the returned bounding box, similarly to
   * [Element.getBoundingClientRect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect).
   * That means `x` and/or `y` may be negative.
   *
   * Elements from child frames return the bounding box relative to the main frame, unlike the
   * [Element.getBoundingClientRect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect).
   *
   * Assuming the page is static, it is safe to use bounding box coordinates to perform input. For example, the
   * following snippet should click the center of the element.
   *
   * **Usage**
   *
   * ```js
   * const box = await page.getByRole('button').boundingBox();
   * await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
   * ```
   *
   * @see {@link Locator.boundingBox}
   */
  readonly boundingBox: Effect.Effect<
    {
      /**
       * x.
       *
       * @see {@link Locator.x}
       */
      readonly x: number;
      /**
       * y.
       *
       * @see {@link Locator.y}
       */
      readonly y: number;
      /**
       * width.
       *
       * @see {@link Locator.width}
       */
      readonly width: number;
      /**
       * height.
       *
       * @see {@link Locator.height}
       */
      readonly height: number;
    } | null,
    PlaywrightError
  >;
  /**
   * Returns the number of elements matching the locator.
   *
   * **NOTE** If you need to assert the number of elements on the page, prefer
   * [expect(locator).toHaveCount(count[, options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-count)
   * to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * **Usage**
   *
   * ```js
   * const count = await page.getByRole('listitem').count();
   * ```
   *
   * @see {@link Locator.count}
   */
  readonly count: Effect.Effect<number, PlaywrightError>;
  /**
   * Returns an array of `node.innerText` values for all matching nodes.
   *
   * **NOTE** If you need to assert text on the page, prefer
   * [expect(locator).toHaveText(expected[, options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-text)
   * with
   * [`useInnerText`](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-text-option-use-inner-text)
   * option to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * **Usage**
   *
   * ```js
   * const texts = await page.getByRole('link').allInnerTexts();
   * ```
   *
   * @see {@link Locator.allInnerTexts}
   */
  readonly allInnerTexts: Effect.Effect<readonly string[], PlaywrightError>;
  /**
   * Returns an array of `node.textContent` values for all matching nodes.
   *
   * **NOTE** If you need to assert text on the page, prefer
   * [expect(locator).toHaveText(expected[, options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-have-text)
   * to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * **Usage**
   *
   * ```js
   * const texts = await page.getByRole('link').allTextContents();
   * ```
   *
   * @see {@link Locator.allTextContents}
   */
  readonly allTextContents: Effect.Effect<readonly string[], PlaywrightError>;
  /**
   * When the locator points to a list of elements, this returns an array of locators, pointing to their respective
   * elements.
   *
   * **NOTE** [locator.all()](https://playwright.dev/docs/api/class-locator#locator-all) does not wait for elements to
   * match the locator, and instead immediately returns whatever is present in the page.
   *
   * When the list of elements changes dynamically,
   * [locator.all()](https://playwright.dev/docs/api/class-locator#locator-all) will produce unpredictable and flaky
   * results.
   *
   * When the list of elements is stable, but loaded dynamically, wait for the full list to finish loading before
   * calling [locator.all()](https://playwright.dev/docs/api/class-locator#locator-all).
   *
   * **Usage**
   *
   * ```js
   * for (const li of await page.getByRole('listitem').all())
   *   await li.click();
   * ```
   *
   * @see {@link Locator.all}
   */
  readonly all: Effect.Effect<readonly PlaywrightLocator[], PlaywrightError>;
  /**
   * Captures the aria snapshot of the given element. Read more about [aria snapshots](https://playwright.dev/docs/aria-snapshots) and
   * [expect(locator).toMatchAriaSnapshot(expected[, options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-match-aria-snapshot)
   * for the corresponding assertion.
   *
   * **Usage**
   *
   * ```js
   * await page.getByRole('link').ariaSnapshot();
   * ```
   *
   * **Details**
   *
   * This method captures the aria snapshot of the given element. The snapshot is a string that represents the state of
   * the element and its children. The snapshot can be used to assert the state of the element in the test, or to
   * compare it to state in the future.
   *
   * The ARIA snapshot is represented using [YAML](https://yaml.org/spec/1.2.2/) markup language:
   * - The keys of the objects are the roles and optional accessible names of the elements.
   * - The values are either text content or an array of child elements.
   * - Generic static text can be represented with the `text` key.
   *
   * Below is the HTML markup and the respective ARIA snapshot:
   *
   * ```html
   * <ul aria-label="Links">
   *   <li><a href="/">Home</a></li>
   *   <li><a href="/about">About</a></li>
   * <ul>
   * ```
   *
   * ```yml
   * - list "Links":
   *   - listitem:
   *     - link "Home"
   *   - listitem:
   *     - link "About"
   * ```
   *
   * @see {@link Locator.ariaSnapshot}
   */
  readonly ariaSnapshot: (
    options?: Parameters<Locator["ariaSnapshot"]>[0],
  ) => Effect.Effect<string, PlaywrightError>;

  // Evaluation
  /**
   * Execute JavaScript code in the page, taking the matching element as an argument.
   *
   * **Details**
   *
   * Returns the return value of
   * [`pageFunction`](https://playwright.dev/docs/api/class-locator#locator-evaluate-option-expression), called with the
   * matching element as a first argument, and
   * [`arg`](https://playwright.dev/docs/api/class-locator#locator-evaluate-option-arg) as a second argument.
   *
   * If [`pageFunction`](https://playwright.dev/docs/api/class-locator#locator-evaluate-option-expression) returns a
   * [Promise], this method will wait for the promise to resolve and return its value.
   *
   * If [`pageFunction`](https://playwright.dev/docs/api/class-locator#locator-evaluate-option-expression) throws or
   * rejects, this method throws.
   *
   * **Usage**
   *
   * Passing argument to
   * [`pageFunction`](https://playwright.dev/docs/api/class-locator#locator-evaluate-option-expression):
   *
   * ```js
   * const result = await page.getByTestId('myId').evaluate((element, [x, y]) => {
   *   return element.textContent + ' ' + x * y;
   * }, [7, 8]);
   * console.log(result); // prints "myId text 56"
   * ```
   *
   * @see {@link Locator.evaluate}
   */
  readonly evaluate: <T, Arg = void>(
    pageFunction: (...args: [Arg]) => T,
    arg?: Arg,
  ) => Effect.Effect<Awaited<T>, PlaywrightError>;
  /**
   * Execute JavaScript code in the page, taking all matching elements as an argument.
   *
   * **Details**
   *
   * Returns the return value of
   * [`pageFunction`](https://playwright.dev/docs/api/class-locator#locator-evaluate-all-option-expression), called with
   * an array of all matching elements as a first argument, and
   * [`arg`](https://playwright.dev/docs/api/class-locator#locator-evaluate-all-option-arg) as a second argument.
   *
   * If [`pageFunction`](https://playwright.dev/docs/api/class-locator#locator-evaluate-all-option-expression) returns a
   * [Promise], this method will wait for the promise to resolve and return its value.
   *
   * If [`pageFunction`](https://playwright.dev/docs/api/class-locator#locator-evaluate-all-option-expression) throws or
   * rejects, this method throws.
   *
   * **Usage**
   *
   * ```js
   * const locator = page.locator('div');
   * const moreThanTen = await locator.evaluateAll((divs, min) => divs.length > min, 10);
   * ```
   *
   * @see {@link Locator.evaluateAll}
   */
  readonly evaluateAll: <R, Arg = void>(
    pageFunction: (...args: [Arg]) => R,
    arg?: Arg,
  ) => Effect.Effect<R, PlaywrightError>;
  /**
   * Execute JavaScript code in the page, taking the matching element as an argument, and return a
   * [JSHandle](https://playwright.dev/docs/api/class-jshandle) with the result.
   *
   * **Details**
   *
   * Returns the return value of
   * [`pageFunction`](https://playwright.dev/docs/api/class-locator#locator-evaluate-handle-option-expression) as
   * a[JSHandle](https://playwright.dev/docs/api/class-jshandle), called with the matching element as a first argument,
   * and [`arg`](https://playwright.dev/docs/api/class-locator#locator-evaluate-handle-option-arg) as a second argument.
   *
   * The only difference between
   * [locator.evaluate(pageFunction[, arg, options])](https://playwright.dev/docs/api/class-locator#locator-evaluate)
   * and
   * [locator.evaluateHandle(pageFunction[, arg, options])](https://playwright.dev/docs/api/class-locator#locator-evaluate-handle)
   * is that
   * [locator.evaluateHandle(pageFunction[, arg, options])](https://playwright.dev/docs/api/class-locator#locator-evaluate-handle)
   * returns [JSHandle](https://playwright.dev/docs/api/class-jshandle).
   *
   * If [`pageFunction`](https://playwright.dev/docs/api/class-locator#locator-evaluate-handle-option-expression)
   * returns a [Promise], this method will wait for the promise to resolve and return its value.
   *
   * If [`pageFunction`](https://playwright.dev/docs/api/class-locator#locator-evaluate-handle-option-expression) throws
   * or rejects, this method throws.
   *
   * See [page.evaluateHandle(pageFunction[, arg])](https://playwright.dev/docs/api/class-page#page-evaluate-handle) for
   * more details.
   *
   * @see {@link Locator.evaluateHandle}
   */
  readonly evaluateHandle: <R, Arg = void>(
    pageFunction: (...args: [Arg]) => R,
    arg?: Arg,
  ) => Effect.Effect<JSHandle<R>, PlaywrightError>;

  // Handles
  /**
   * **NOTE** Always prefer using [Locator](https://playwright.dev/docs/api/class-locator)s and web assertions over
   * [ElementHandle](https://playwright.dev/docs/api/class-elementhandle)s because latter are inherently racy.
   *
   * Resolves given locator to the first matching DOM element. If there are no matching elements, waits for one. If
   * multiple elements match the locator, throws.
   *
   * @see {@link Locator.elementHandle}
   */
  readonly elementHandle: (
    options?: Parameters<Locator["elementHandle"]>[0],
  ) => Effect.Effect<ElementHandle<HTMLElement | SVGElement> | null, PlaywrightError>;
  /**
   * **NOTE** Always prefer using [Locator](https://playwright.dev/docs/api/class-locator)s and web assertions over
   * [ElementHandle](https://playwright.dev/docs/api/class-elementhandle)s because latter are inherently racy.
   *
   * Resolves given locator to all matching DOM elements. If there are no matching elements, returns an empty list.
   *
   * @see {@link Locator.elementHandles}
   */
  readonly elementHandles: Effect.Effect<readonly ElementHandle[], PlaywrightError>;

  // Debugging
  /**
   * Highlight the corresponding element(s) on the screen. Useful for debugging, don't commit the code that uses
   * [locator.highlight()](https://playwright.dev/docs/api/class-locator#locator-highlight).
   *
   * @see {@link Locator.highlight}
   */
  readonly highlight: Effect.Effect<void, PlaywrightError>;

  // State
  /**
   * Returns whether the element is checked. Throws if the element is not a checkbox or radio input.
   *
   * **NOTE** If you need to assert that checkbox is checked, prefer
   * [expect(locator).toBeChecked([options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-be-checked)
   * to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * **Usage**
   *
   * ```js
   * const checked = await page.getByRole('checkbox').isChecked();
   * ```
   *
   * @see {@link Locator.isChecked}
   */
  readonly isChecked: Effect.Effect<boolean, PlaywrightError>;
  /**
   * Returns whether the element is disabled, the opposite of [enabled](https://playwright.dev/docs/actionability#enabled).
   *
   * **NOTE** If you need to assert that an element is disabled, prefer
   * [expect(locator).toBeDisabled([options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-be-disabled)
   * to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * **Usage**
   *
   * ```js
   * const disabled = await page.getByRole('button').isDisabled();
   * ```
   *
   * @see {@link Locator.isDisabled}
   */
  readonly isDisabled: Effect.Effect<boolean, PlaywrightError>;
  /**
   * Returns whether the element is [editable](https://playwright.dev/docs/actionability#editable). If the target element is not an `<input>`,
   * `<textarea>`, `<select>`, `[contenteditable]` and does not have a role allowing `[aria-readonly]`, this method
   * throws an error.
   *
   * **NOTE** If you need to assert that an element is editable, prefer
   * [expect(locator).toBeEditable([options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-be-editable)
   * to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * **Usage**
   *
   * ```js
   * const editable = await page.getByRole('textbox').isEditable();
   * ```
   *
   * @see {@link Locator.isEditable}
   */
  readonly isEditable: Effect.Effect<boolean, PlaywrightError>;
  /**
   * Returns whether the element is [enabled](https://playwright.dev/docs/actionability#enabled).
   *
   * **NOTE** If you need to assert that an element is enabled, prefer
   * [expect(locator).toBeEnabled([options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-be-enabled)
   * to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * **Usage**
   *
   * ```js
   * const enabled = await page.getByRole('button').isEnabled();
   * ```
   *
   * @see {@link Locator.isEnabled}
   */
  readonly isEnabled: Effect.Effect<boolean, PlaywrightError>;
  /**
   * Returns whether the element is hidden, the opposite of [visible](https://playwright.dev/docs/actionability#visible).
   *
   * **NOTE** If you need to assert that element is hidden, prefer
   * [expect(locator).toBeHidden([options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-be-hidden)
   * to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * **Usage**
   *
   * ```js
   * const hidden = await page.getByRole('button').isHidden();
   * ```
   *
   * @see {@link Locator.isHidden}
   */
  readonly isHidden: Effect.Effect<boolean, PlaywrightError>;
  /**
   * Returns whether the element is [visible](https://playwright.dev/docs/actionability#visible).
   *
   * **NOTE** If you need to assert that element is visible, prefer
   * [expect(locator).toBeVisible([options])](https://playwright.dev/docs/api/class-locatorassertions#locator-assertions-to-be-visible)
   * to avoid flakiness. See [assertions guide](https://playwright.dev/docs/test-assertions) for more details.
   *
   * **Usage**
   *
   * ```js
   * const visible = await page.getByRole('button').isVisible();
   * ```
   *
   * @see {@link Locator.isVisible}
   */
  readonly isVisible: Effect.Effect<boolean, PlaywrightError>;

  // Navigation
  /**
   * This method waits for [actionability](https://playwright.dev/docs/actionability) checks, then tries to scroll element into view, unless
   * it is completely visible as defined by
   * [IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)'s `ratio`.
   *
   * See [scrolling](https://playwright.dev/docs/input#scrolling) for alternative ways to scroll.
   *
   * @see {@link Locator.scrollIntoViewIfNeeded}
   */
  readonly scrollIntoViewIfNeeded: (
    options?: Parameters<Locator["scrollIntoViewIfNeeded"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Calls [blur](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/blur) on the element.
   *
   * @see {@link Locator.blur}
   */
  readonly blur: (options?: Parameters<Locator["blur"]>[0]) => Effect.Effect<void, PlaywrightError>;
  /**
   * Calls [focus](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus) on the matching element.
   *
   * @see {@link Locator.focus}
   */
  readonly focus: (
    options?: Parameters<Locator["focus"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
  /**
   * Returns when element specified by locator satisfies the
   * [`state`](https://playwright.dev/docs/api/class-locator#locator-wait-for-option-state) option.
   *
   * If target element already satisfies the condition, the method returns immediately. Otherwise, waits for up to
   * [`timeout`](https://playwright.dev/docs/api/class-locator#locator-wait-for-option-timeout) milliseconds until the
   * condition is met.
   *
   * **Usage**
   *
   * ```js
   * const orderSent = page.locator('#order-sent');
   * await orderSent.waitFor();
   * ```
   *
   * @see {@link Locator.waitFor}
   */
  readonly waitFor: (
    options?: Parameters<Locator["waitFor"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;

  // Capture
  /**
   * Take a screenshot of the element matching the locator.
   *
   * **Usage**
   *
   * ```js
   * await page.getByRole('link').screenshot();
   * ```
   *
   * Disable animations and save screenshot to a file:
   *
   * ```js
   * await page.getByRole('link').screenshot({ animations: 'disabled', path: 'link.png' });
   * ```
   *
   * **Details**
   *
   * This method captures a screenshot of the page, clipped to the size and position of a particular element matching
   * the locator. If the element is covered by other elements, it will not be actually visible on the screenshot. If the
   * element is a scrollable container, only the currently scrolled content will be visible on the screenshot.
   *
   * This method waits for the [actionability](https://playwright.dev/docs/actionability) checks, then scrolls element into view before taking
   * a screenshot. If the element is detached from DOM, the method throws an error.
   *
   * Returns the buffer with the captured screenshot.
   *
   * @see {@link Locator.screenshot}
   */
  readonly screenshot: (
    options?: Parameters<Locator["screenshot"]>[0],
  ) => Effect.Effect<Uint8Array, PlaywrightError>;

  // Composition
  /**
   * The method finds an element matching the specified selector in the locator's subtree. It also accepts filter
   * options, similar to [locator.filter([options])](https://playwright.dev/docs/api/class-locator#locator-filter)
   * method.
   *
   * [Learn more about locators](https://playwright.dev/docs/locators).
   *
   * @see {@link Locator.locator}
   */
  readonly locator: (
    selector: string,
    options?: Parameters<Locator["locator"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating elements by their [ARIA role](https://www.w3.org/TR/wai-aria-1.2/#roles),
   * [ARIA attributes](https://www.w3.org/TR/wai-aria-1.2/#aria-attributes) and
   * [accessible name](https://w3c.github.io/accname/#dfn-accessible-name).
   *
   * **Usage**
   *
   * Consider the following DOM structure.
   *
   * ```html
   * <h3>Sign up</h3>
   * <label>
   *   <input type="checkbox" /> Subscribe
   * </label>
   * <br/>
   * <button>Submit</button>
   * ```
   *
   * You can locate each element by it's implicit role:
   *
   * ```js
   * await expect(page.getByRole('heading', { name: 'Sign up' })).toBeVisible();
   *
   * await page.getByRole('checkbox', { name: 'Subscribe' }).check();
   *
   * await page.getByRole('button', { name: /submit/i }).click();
   * ```
   *
   * **Details**
   *
   * Role selector **does not replace** accessibility audits and conformance tests, but rather gives early feedback
   * about the ARIA guidelines.
   *
   * Many html elements have an implicitly [defined role](https://w3c.github.io/html-aam/#html-element-role-mappings)
   * that is recognized by the role selector. You can find all the
   * [supported roles here](https://www.w3.org/TR/wai-aria-1.2/#role_definitions). ARIA guidelines **do not recommend**
   * duplicating implicit roles and attributes by setting `role` and/or `aria-*` attributes to default values.
   *
   * @see {@link Locator.getByRole}
   */
  readonly getByRole: (
    role: Parameters<Locator["getByRole"]>[0],
    options?: Parameters<Locator["getByRole"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating elements that contain given text.
   *
   * See also [locator.filter([options])](https://playwright.dev/docs/api/class-locator#locator-filter) that allows to
   * match by another criteria, like an accessible role, and then filter by the text content.
   *
   * **Usage**
   *
   * Consider the following DOM structure:
   *
   * ```html
   * <div>Hello <span>world</span></div>
   * <div>Hello</div>
   * ```
   *
   * You can locate by text substring, exact string, or a regular expression:
   *
   * ```js
   * // Matches <span>
   * page.getByText('world');
   *
   * // Matches first <div>
   * page.getByText('Hello world');
   *
   * // Matches second <div>
   * page.getByText('Hello', { exact: true });
   *
   * // Matches both <div>s
   * page.getByText(/Hello/);
   *
   * // Matches second <div>
   * page.getByText(/^hello$/i);
   * ```
   *
   * **Details**
   *
   * Matching by text always normalizes whitespace, even with exact match. For example, it turns multiple spaces into
   * one, turns line breaks into spaces and ignores leading and trailing whitespace.
   *
   * Input elements of the type `button` and `submit` are matched by their `value` instead of the text content. For
   * example, locating by text `"Log in"` matches `<input type=button value="Log in">`.
   *
   * @see {@link Locator.getByText}
   */
  readonly getByText: (
    text: Parameters<Locator["getByText"]>[0],
    options?: Parameters<Locator["getByText"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating input elements by the text of the associated `<label>` or `aria-labelledby` element, or by the
   * `aria-label` attribute.
   *
   * **Usage**
   *
   * For example, this method will find inputs by label "Username" and "Password" in the following DOM:
   *
   * ```html
   * <input aria-label="Username">
   * <label for="password-input">Password:</label>
   * <input id="password-input">
   * ```
   *
   * ```js
   * await page.getByLabel('Username').fill('john');
   * await page.getByLabel('Password').fill('secret');
   * ```
   *
   * @see {@link Locator.getByLabel}
   */
  readonly getByLabel: (
    label: Parameters<Locator["getByLabel"]>[0],
    options?: Parameters<Locator["getByLabel"]>[1],
  ) => PlaywrightLocator;
  /**
   * Locate element by the test id.
   *
   * **Usage**
   *
   * Consider the following DOM structure.
   *
   * ```html
   * <button data-testid="directions">Itinéraire</button>
   * ```
   *
   * You can locate the element by it's test id:
   *
   * ```js
   * await page.getByTestId('directions').click();
   * ```
   *
   * **Details**
   *
   * By default, the `data-testid` attribute is used as a test id. Use
   * [selectors.setTestIdAttribute(attributeName)](https://playwright.dev/docs/api/class-selectors#selectors-set-test-id-attribute)
   * to configure a different test id attribute if necessary.
   *
   * ```js
   * // Set custom test id attribute from
   *
   * @see {@link Locator.getByTestId}
   */
  readonly getByTestId: (testId: Parameters<Locator["getByTestId"]>[0]) => PlaywrightLocator;
  /**
   * Allows locating input elements by the placeholder text.
   *
   * **Usage**
   *
   * For example, consider the following DOM structure.
   *
   * ```html
   * <input type="email" placeholder="name@example.com" />
   * ```
   *
   * You can fill the input after locating it by the placeholder text:
   *
   * ```js
   * await page
   *     .getByPlaceholder('name@example.com')
   *     .fill('playwright@microsoft.com');
   * ```
   *
   * @see {@link Locator.getByPlaceholder}
   */
  readonly getByPlaceholder: (
    text: Parameters<Locator["getByPlaceholder"]>[0],
    options?: Parameters<Locator["getByPlaceholder"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating elements by their alt text.
   *
   * **Usage**
   *
   * For example, this method will find the image by alt text "Playwright logo":
   *
   * ```html
   * <img alt='Playwright logo'>
   * ```
   *
   * ```js
   * await page.getByAltText('Playwright logo').click();
   * ```
   *
   * @see {@link Locator.getByAltText}
   */
  readonly getByAltText: (
    text: Parameters<Locator["getByAltText"]>[0],
    options?: Parameters<Locator["getByAltText"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating elements by their title attribute.
   *
   * **Usage**
   *
   * Consider the following DOM structure.
   *
   * ```html
   * <span title='Issues count'>25 issues</span>
   * ```
   *
   * You can check the issues count after locating it by the title text:
   *
   * ```js
   * await expect(page.getByTitle('Issues count')).toHaveText('25 issues');
   * ```
   *
   * @see {@link Locator.getByTitle}
   */
  readonly getByTitle: (
    title: Parameters<Locator["getByTitle"]>[0],
    options?: Parameters<Locator["getByTitle"]>[1],
  ) => PlaywrightLocator;
  /**
   * This method narrows existing locator according to the options, for example filters by text. It can be chained to
   * filter multiple times.
   *
   * **Usage**
   *
   * ```js
   * const rowLocator = page.locator('tr');
   * // ...
   * await rowLocator
   *     .filter({ hasText: 'text in column 1' })
   *     .filter({ has: page.getByRole('button', { name: 'column 2 button' }) })
   *     .screenshot();
   * ```
   *
   * @see {@link Locator.filter}
   */
  readonly filter: (options: Parameters<Locator["filter"]>[0]) => PlaywrightLocator;
  /**
   * Returns locator to the first matching element.
   *
   * @see {@link Locator.first}
   */
  readonly first: PlaywrightLocator;
  /**
   * Returns locator to the last matching element.
   *
   * **Usage**
   *
   * ```js
   * const banana = await page.getByRole('listitem').last();
   * ```
   *
   * @see {@link Locator.last}
   */
  readonly last: PlaywrightLocator;
  /**
   * Returns locator to the n-th matching element. It's zero based, `nth(0)` selects the first element.
   *
   * **Usage**
   *
   * ```js
   * const banana = await page.getByRole('listitem').nth(2);
   * ```
   *
   * @see {@link Locator.nth}
   */
  readonly nth: (index: number) => PlaywrightLocator;
  /**
   * Creates a locator that matches both this locator and the argument locator.
   *
   * **Usage**
   *
   * The following example finds a button with a specific title.
   *
   * ```js
   * const button = page.getByRole('button').and(page.getByTitle('Subscribe'));
   * ```
   *
   * @see {@link Locator.and}
   */
  readonly and: (locator: PlaywrightLocator) => PlaywrightLocator;
  /**
   * Creates a locator matching all elements that match one or both of the two locators.
   *
   * Note that when both locators match something, the resulting locator will have multiple matches, potentially causing
   * a [locator strictness](https://playwright.dev/docs/locators#strictness) violation.
   *
   * **Usage**
   *
   * Consider a scenario where you'd like to click on a "New email" button, but sometimes a security settings dialog
   * shows up instead. In this case, you can wait for either a "New email" button, or a dialog and act accordingly.
   *
   * **NOTE** If both "New email" button and security dialog appear on screen, the "or" locator will match both of them,
   * possibly throwing the ["strict mode violation" error](https://playwright.dev/docs/locators#strictness). In this case, you can use
   * [locator.first()](https://playwright.dev/docs/api/class-locator#locator-first) to only match one of them.
   *
   * ```js
   * const newEmail = page.getByRole('button', { name: 'New' });
   * const dialog = page.getByText('Confirm security settings');
   * await expect(newEmail.or(dialog).first()).toBeVisible();
   * if (await dialog.isVisible())
   *   await page.getByRole('button', { name: 'Dismiss' }).click();
   * await newEmail.click();
   * ```
   *
   * @see {@link Locator.or}
   */
  readonly or: (locator: PlaywrightLocator) => PlaywrightLocator;

  // Structure
  /**
   * A page this locator belongs to.
   *
   * @see {@link Locator.page}
   */
  readonly page: PlaywrightPage;
  /**
   * Returns a [FrameLocator](https://playwright.dev/docs/api/class-framelocator) object pointing to the same `iframe`
   * as this locator.
   *
   * Useful when you have a [Locator](https://playwright.dev/docs/api/class-locator) object obtained somewhere, and
   * later on would like to interact with the content inside the frame.
   *
   * For a reverse operation, use
   * [frameLocator.owner()](https://playwright.dev/docs/api/class-framelocator#frame-locator-owner).
   *
   * **Usage**
   *
   * ```js
   * const locator = page.locator('iframe[name="embedded"]');
   * // ...
   * const frameLocator = locator.contentFrame();
   * await frameLocator.getByRole('button').click();
   * ```
   *
   * @see {@link Locator.contentFrame}
   */
  readonly contentFrame: PlaywrightFrameLocator;
  /**
   * When working with iframes, you can create a frame locator that will enter the iframe and allow locating elements in
   * that iframe:
   *
   * **Usage**
   *
   * ```js
   * const locator = page.frameLocator('iframe').getByText('Submit');
   * await locator.click();
   * ```
   *
   * @see {@link Locator.frameLocator}
   */
  readonly frameLocator: (selector: string) => PlaywrightFrameLocator;

  // Escape hatch
  readonly use: <T>(
    f: (locator: Locator, signal: AbortSignal) => Promise<T>,
  ) => Effect.Effect<T, PlaywrightError>;
}

/**
 * Playwright frame locator — for iframe support.
 *
 * Full implementation in `PlaywrightLocator.ts`.
 */
export interface PlaywrightFrameLocator {
  /** The underlying Playwright `FrameLocator`. */
  readonly _raw: FrameLocator;

  /**
   * The method finds an element matching the specified selector in the locator's subtree. It also accepts filter
   * options, similar to [locator.filter([options])](https://playwright.dev/docs/api/class-locator#locator-filter)
   * method.
   *
   * [Learn more about locators](https://playwright.dev/docs/locators).
   *
   * @see {@link FrameLocator.locator}
   */
  readonly locator: (
    selector: string,
    options?: Parameters<FrameLocator["locator"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating elements by their [ARIA role](https://www.w3.org/TR/wai-aria-1.2/#roles),
   * [ARIA attributes](https://www.w3.org/TR/wai-aria-1.2/#aria-attributes) and
   * [accessible name](https://w3c.github.io/accname/#dfn-accessible-name).
   *
   * **Usage**
   *
   * Consider the following DOM structure.
   *
   * ```html
   * <h3>Sign up</h3>
   * <label>
   *   <input type="checkbox" /> Subscribe
   * </label>
   * <br/>
   * <button>Submit</button>
   * ```
   *
   * You can locate each element by it's implicit role:
   *
   * ```js
   * await expect(page.getByRole('heading', { name: 'Sign up' })).toBeVisible();
   *
   * await page.getByRole('checkbox', { name: 'Subscribe' }).check();
   *
   * await page.getByRole('button', { name: /submit/i }).click();
   * ```
   *
   * **Details**
   *
   * Role selector **does not replace** accessibility audits and conformance tests, but rather gives early feedback
   * about the ARIA guidelines.
   *
   * Many html elements have an implicitly [defined role](https://w3c.github.io/html-aam/#html-element-role-mappings)
   * that is recognized by the role selector. You can find all the
   * [supported roles here](https://www.w3.org/TR/wai-aria-1.2/#role_definitions). ARIA guidelines **do not recommend**
   * duplicating implicit roles and attributes by setting `role` and/or `aria-*` attributes to default values.
   *
   * @see {@link FrameLocator.getByRole}
   */
  readonly getByRole: (
    role: Parameters<FrameLocator["getByRole"]>[0],
    options?: Parameters<FrameLocator["getByRole"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating elements that contain given text.
   *
   * See also [locator.filter([options])](https://playwright.dev/docs/api/class-locator#locator-filter) that allows to
   * match by another criteria, like an accessible role, and then filter by the text content.
   *
   * **Usage**
   *
   * Consider the following DOM structure:
   *
   * ```html
   * <div>Hello <span>world</span></div>
   * <div>Hello</div>
   * ```
   *
   * You can locate by text substring, exact string, or a regular expression:
   *
   * ```js
   * // Matches <span>
   * page.getByText('world');
   *
   * // Matches first <div>
   * page.getByText('Hello world');
   *
   * // Matches second <div>
   * page.getByText('Hello', { exact: true });
   *
   * // Matches both <div>s
   * page.getByText(/Hello/);
   *
   * // Matches second <div>
   * page.getByText(/^hello$/i);
   * ```
   *
   * **Details**
   *
   * Matching by text always normalizes whitespace, even with exact match. For example, it turns multiple spaces into
   * one, turns line breaks into spaces and ignores leading and trailing whitespace.
   *
   * Input elements of the type `button` and `submit` are matched by their `value` instead of the text content. For
   * example, locating by text `"Log in"` matches `<input type=button value="Log in">`.
   *
   * @see {@link FrameLocator.getByText}
   */
  readonly getByText: (
    text: Parameters<FrameLocator["getByText"]>[0],
    options?: Parameters<FrameLocator["getByText"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating input elements by the text of the associated `<label>` or `aria-labelledby` element, or by the
   * `aria-label` attribute.
   *
   * **Usage**
   *
   * For example, this method will find inputs by label "Username" and "Password" in the following DOM:
   *
   * ```html
   * <input aria-label="Username">
   * <label for="password-input">Password:</label>
   * <input id="password-input">
   * ```
   *
   * ```js
   * await page.getByLabel('Username').fill('john');
   * await page.getByLabel('Password').fill('secret');
   * ```
   *
   * @see {@link FrameLocator.getByLabel}
   */
  readonly getByLabel: (
    label: Parameters<FrameLocator["getByLabel"]>[0],
    options?: Parameters<FrameLocator["getByLabel"]>[1],
  ) => PlaywrightLocator;
  /**
   * Locate element by the test id.
   *
   * **Usage**
   *
   * Consider the following DOM structure.
   *
   * ```html
   * <button data-testid="directions">Itinéraire</button>
   * ```
   *
   * You can locate the element by it's test id:
   *
   * ```js
   * await page.getByTestId('directions').click();
   * ```
   *
   * **Details**
   *
   * By default, the `data-testid` attribute is used as a test id. Use
   * [selectors.setTestIdAttribute(attributeName)](https://playwright.dev/docs/api/class-selectors#selectors-set-test-id-attribute)
   * to configure a different test id attribute if necessary.
   *
   * ```js
   * // Set custom test id attribute from
   *
   * @see {@link FrameLocator.getByTestId}
   */
  readonly getByTestId: (testId: Parameters<FrameLocator["getByTestId"]>[0]) => PlaywrightLocator;
  /**
   * Allows locating input elements by the placeholder text.
   *
   * **Usage**
   *
   * For example, consider the following DOM structure.
   *
   * ```html
   * <input type="email" placeholder="name@example.com" />
   * ```
   *
   * You can fill the input after locating it by the placeholder text:
   *
   * ```js
   * await page
   *     .getByPlaceholder('name@example.com')
   *     .fill('playwright@microsoft.com');
   * ```
   *
   * @see {@link FrameLocator.getByPlaceholder}
   */
  readonly getByPlaceholder: (
    text: Parameters<FrameLocator["getByPlaceholder"]>[0],
    options?: Parameters<FrameLocator["getByPlaceholder"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating elements by their alt text.
   *
   * **Usage**
   *
   * For example, this method will find the image by alt text "Playwright logo":
   *
   * ```html
   * <img alt='Playwright logo'>
   * ```
   *
   * ```js
   * await page.getByAltText('Playwright logo').click();
   * ```
   *
   * @see {@link FrameLocator.getByAltText}
   */
  readonly getByAltText: (
    text: Parameters<FrameLocator["getByAltText"]>[0],
    options?: Parameters<FrameLocator["getByAltText"]>[1],
  ) => PlaywrightLocator;
  /**
   * Allows locating elements by their title attribute.
   *
   * **Usage**
   *
   * Consider the following DOM structure.
   *
   * ```html
   * <span title='Issues count'>25 issues</span>
   * ```
   *
   * You can check the issues count after locating it by the title text:
   *
   * ```js
   * await expect(page.getByTitle('Issues count')).toHaveText('25 issues');
   * ```
   *
   * @see {@link FrameLocator.getByTitle}
   */
  readonly getByTitle: (
    title: Parameters<FrameLocator["getByTitle"]>[0],
    options?: Parameters<FrameLocator["getByTitle"]>[1],
  ) => PlaywrightLocator;
  /**
   * When working with iframes, you can create a frame locator that will enter the iframe and allow selecting elements
   * in that iframe.
   *
   * @see {@link FrameLocator.frameLocator}
   */
  readonly frameLocator: (selector: string) => PlaywrightFrameLocator;
  /**
   * Returns locator to the first matching frame.
   *
   * @see {@link FrameLocator.first}
   */
  readonly first: PlaywrightFrameLocator;
  /**
   * Returns locator to the last matching frame.
   *
   * @see {@link FrameLocator.last}
   */
  readonly last: PlaywrightFrameLocator;
  /**
   * Returns locator to the n-th matching frame. It's zero based, `nth(0)` selects the first frame.
   *
   * @see {@link FrameLocator.nth}
   */
  readonly nth: (index: number) => PlaywrightFrameLocator;
}
