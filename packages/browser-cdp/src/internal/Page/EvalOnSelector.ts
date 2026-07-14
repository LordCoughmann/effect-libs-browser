/**
 * Selector-based evaluation operations for CDP page.
 *
 * `$eval` — query single element, evaluate function on it, return result.
 * `$$eval` — query all matching elements, evaluate function on array, return result.
 *
 * These are the recommended methods for scraping per Playwright docs.
 * They query + extract in one call, avoiding ElementHandle intermediaries.
 *
 * Supports Playwright-style selectors:
 * - Plain CSS selectors (default): `div.foo`, `#id`, etc.
 * - CSS selector with prefix: `css=div.foo`
 * - XPath selector: `xpath=/html/body/div`
 * - Text selector: `text=Hello`, `text="Hello World"`, `text=/regex/`
 * - Chained selectors: `css=div >> text=Hello`
 *
 */

import type { Duration } from "effect";

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, isCdpError, SelectorError } from "../../CdpError.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";
import { make$evalWrapperCode, make$$evalWrapperCode } from "./SelectorEngine.js";

/** Map errors to SelectorError for eval operations. */
const mapError = (method: string, selector: string) =>
  Effect.mapError((cause: unknown) => {
    // Extract the browser error description from nested CdpError
    let description = getErrorMessage(cause);
    if (isCdpError(cause) && "description" in cause.reason) {
      description = cause.reason.description;
    }
    return new CdpError({
      module: "CdpPage",
      method,
      reason: new SelectorError({ selector, description }),
    });
  });

/**
 * Creates a wrapper function for $eval that queries a single element and
 * evaluates the user's function on it.
 *
 * Uses `new Function()` to embed the user's function source directly into
 * the wrapper body. When `evaluatePage` stringifies the wrapper via
 * `.toString()`, the result is a self-contained function with no closure
 * references.
 *
 * Supports CSS, XPath, text, and chained selectors via SelectorEngine.
 */
const make$evalWrapper = <T>(
  fnSource: string,
  selector: string,
  hasArg: boolean,
): ((...args: any[]) => T) => {
  const code = make$evalWrapperCode(fnSource, selector, hasArg);
  if (hasArg) {
    return new Function(code) as (...args: any[]) => T;
  }
  return new Function(code) as (...args: any[]) => T;
};

/**
 * Creates a wrapper function for $$eval that queries all matching elements and
 * evaluates the user's function on the array.
 *
 * Uses spread syntax `[...]` instead of `Array.from()` to handle cases where
 * `Array.from` has been overridden (matches Playwright behavior).
 *
 * Supports CSS, XPath, text, and chained selectors via SelectorEngine.
 */
const make$$evalWrapper = <T>(
  fnSource: string,
  selector: string,
  hasArg: boolean,
): ((...args: any[]) => T) => {
  const code = make$$evalWrapperCode(fnSource, selector, hasArg);
  if (hasArg) {
    return new Function(code) as (...args: any[]) => T;
  }
  return new Function(code) as (...args: any[]) => T;
};

/**
 * Evaluates a function on a single element matching the selector.
 *
 * Queries the element using `document.querySelector`, then evaluates
 * the provided function on it. If no element matches, throws SelectorError
 * with message: `Failed to find element matching selector "<selector>"`.
 *
 * **Does NOT wait for the element to appear** — fails immediately if not found.
 * Use `waitForSelector` before `$eval` if you need to wait.
 *
 * This is the recommended method for scraping single elements:
 * ```typescript
 * const price = yield* page.$eval(".price", (el) => el.textContent);
 * const id = yield* page.$eval("section", (el) => el.id);
 * ```
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param pageFunction - Function to evaluate on the element
 * @param arg - Optional argument to pass to the function (in addition to the element)
 * @param timeout - **UNUSED** — kept for API consistency with other methods
 * @returns The result of evaluating pageFunction on the element
 */
export const $evalElement = Effect.fn("CdpPage.$eval")(function <T, Arg = unknown>(
  conn: CdpConnection["Service"],
  state: PageState,
  selector: string,
  pageFunction: (element: Element, arg: Arg) => T,
  arg?: Arg,
  _timeout?: Duration.Duration, // reserved for future use
): Effect.Effect<Awaited<T>, CdpError> {
  return Effect.gen(function* () {
    // $eval does NOT wait for element — fails immediately if not found
    // (matches Playwright behavior)

    const fnSource = pageFunction.toString();
    const hasArg = arg !== undefined;

    // Create wrapper that embeds the function source inline via new Function()
    const wrapper = make$evalWrapper<T>(fnSource, selector, hasArg);

    const result = hasArg
      ? yield* evaluatePage(conn, state, wrapper, arg)
      : yield* evaluatePage(conn, state, wrapper);

    return result;
  }).pipe(mapError("$eval", selector));
});

/**
 * Evaluates a function on all elements matching the selector.
 *
 * Queries elements using `document.querySelectorAll`, converts to array
 * using spread syntax, then evaluates the provided function on the array.
 *
 * Note: Unlike `$eval`, this does NOT wait for elements to appear.
 * If no elements match, the function receives an empty array.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for elements
 * @param pageFunction - Function to evaluate on the elements array
 * @param arg - Optional argument to pass to the function (in addition to elements)
 * @returns The result of evaluating pageFunction on the elements array
 */
export const $$evalElements = Effect.fn("CdpPage.$$eval")(function <T, Arg = unknown>(
  conn: CdpConnection["Service"],
  state: PageState,
  selector: string,
  pageFunction: (elements: Array<Element>, arg: Arg) => T,
  arg?: Arg,
): Effect.Effect<Awaited<T>, CdpError> {
  return Effect.gen(function* () {
    const fnSource = pageFunction.toString();
    const hasArg = arg !== undefined;

    // Create wrapper that embeds the function source inline via new Function()
    const wrapper = make$$evalWrapper<T>(fnSource, selector, hasArg);

    const result = hasArg
      ? yield* evaluatePage(conn, state, wrapper, arg)
      : yield* evaluatePage(conn, state, wrapper);

    return result;
  }).pipe(mapError("$$eval", selector));
});
