/**
 * Element content extraction operations for CDP page.
 *
 * Convenience wrappers around `evaluatePage` for extracting text, HTML, and
 * attributes from specific elements.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IMPORTANT — DO NOT extract a shared `extractElementOption<T>` helper here.
 * ────────────────────────────────────────────────────────────────────────────
 * Each method passes an inline arrow to `evaluatePage`. The arrow is
 * `.toString()`'d and shipped to the browser via `Runtime.callFunctionOn`
 * + `UtilityScript.evaluate` (see ADR-0004). The arrow body is executed in
 * the browser's execution context, where two constraints apply:
 *
 *   1. **No imports are reachable.** Vite's SSR-mode bundler on the workerd
 *      runtime rewrites any imported identifier to `__vite_ssr_import_0__`,
 *      which throws `ReferenceError` at browser-eval time. Use only native
 *      JS — `typeof passed === "string"`, `Array.isArray`, `instanceof`,
 *      DOM property access — inside the arrow body. Do not reference any
 *      import from `"effect"`, `@effect-libs/browser`, or anywhere else.
 *
 *   2. **No closure variables are reachable.** `Function.prototype.toString()`
 *      serializes only the function's source, not its lexical environment.
 *      So a closure-captured parameter like `(el) => extract(el)` becomes a
 *      free variable in the browser and throws `ReferenceError`. Inline the
 *      property access (`return el.textContent`) directly inside the arrow.
 *
 * The duplication across methods — each one repeats the wait + evaluatePage
 * scaffold around a tiny different body — is the cost of having serializable
 * browser-side code. A previous extraction attempt (`extractElementOption<T>`
 * in commit `b897201`) violated both rules and broke 45 workerd integration
 * tests. It was reverted; do not re-extract.
 *
 * See `docs/contributing/cdp/decisions/0006-ssr-import-constraint.md` for
 * the full rule, a worked example, and the lint override that goes with it.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { CdpError } from "../../CdpError.js";
import type { CdpConnection } from "../CdpConnection.js";

import { Duration, Effect, Option } from "effect";

import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";
import { waitForSelectorElement } from "./WaitForSelector.js";

/**
 * Gets the text content of an element matching the selector.
 *
 * Uses `element.textContent` which returns the raw text content including
 * hidden elements and whitespace (unlike `innerText` which collapses whitespace
 * and excludes hidden elements).
 *
 * Waits for the element to appear, then extracts its text content.
 * Returns `Option.none()` if the element is not found.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param timeout - Maximum wait time for element to appear
 * @returns `Option.some(text)` if found, `Option.none()` otherwise
 */
export const textContentElement = Effect.fn("CdpPage.textContent")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ): Effect.Effect<Option.Option<string>, CdpError> =>
    Effect.gen(function* () {
      yield* waitForSelectorElement(conn, state, selector, { timeout, state: "attached" });
      return yield* evaluatePage(
        conn,
        state,
        // Inline arrow body — see file header. No imports, no closure vars;
        // the property access (`el.textContent`) is inlined directly here.
        (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return el.textContent;
        },
        selector,
      ).pipe(Effect.map(Option.fromNullOr));
    }),
);

/**
 * Gets the inner text of an element matching the selector.
 *
 * Uses `element.innerText` which returns the visible text content,
 * collapsing whitespace and excluding hidden elements (matches Playwright behavior).
 *
 * Waits for the element to appear, then extracts its text content.
 * Returns `Option.none()` if the element is not found.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param timeout - Maximum wait time for element to appear
 * @returns `Option.some(text)` if found, `Option.none()` otherwise
 */
export const innerTextElement = Effect.fn("CdpPage.innerText")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ): Effect.Effect<Option.Option<string>, CdpError> =>
    Effect.gen(function* () {
      yield* waitForSelectorElement(conn, state, selector, { timeout, state: "attached" });
      return yield* evaluatePage(
        conn,
        state,
        // Inline arrow body — see file header.
        (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return (el as HTMLElement).innerText;
        },
        selector,
      ).pipe(Effect.map(Option.fromNullOr));
    }),
);

/**
 * Gets the inner HTML of an element matching the selector.
 *
 * Returns the HTML content inside the element (not including the element's own tags).
 * Waits for the element to appear, then extracts its HTML content.
 * Returns `Option.none()` if the element is not found.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param timeout - Maximum wait time for element to appear
 * @returns `Option.some(html)` if found, `Option.none()` otherwise
 */
export const innerHtmlElement = Effect.fn("CdpPage.innerHTML")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ): Effect.Effect<Option.Option<string>, CdpError> =>
    Effect.gen(function* () {
      yield* waitForSelectorElement(conn, state, selector, { timeout, state: "attached" });
      return yield* evaluatePage(
        conn,
        state,
        // Inline arrow body — see file header.
        (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return el.innerHTML;
        },
        selector,
      ).pipe(Effect.map(Option.fromNullOr));
    }),
);

/**
 * Gets the value of an attribute on an element matching the selector.
 *
 * Uses `element.getAttribute()` which returns the attribute value as a string,
 * or null if the attribute does not exist.
 *
 * Waits for the element to appear, then reads the attribute.
 * Returns `Option.none()` if the element is not found or the attribute does not exist.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param name - The attribute name to retrieve
 * @param timeout - Maximum wait time for element to appear
 * @returns `Option.some(value)` if attribute exists, `Option.none()` otherwise
 */
export const getElementAttribute = Effect.fn("CdpPage.getAttribute")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    name: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ): Effect.Effect<Option.Option<string>, CdpError> =>
    Effect.gen(function* () {
      yield* waitForSelectorElement(conn, state, selector, { timeout, state: "attached" });
      return yield* evaluatePage(
        conn,
        state,
        // Inline arrow body — see file header. The two args come in as a
        // tuple so the second position (`name`) is reachable inside the
        // browser context without binding to a closure variable.
        ([sel, attr]: [string, string]) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return el.getAttribute(attr);
        },
        [selector, name],
      ).pipe(Effect.map(Option.fromNullOr));
    }),
);

/**
 * Gets the value of an input, textarea, or select element matching the selector.
 *
 * Uses `element.value` which returns the current value of form controls.
 * Throws if the element is not found or is not an input/textarea/select element.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param timeout - Maximum wait time for element to appear
 * @returns The input value of the element
 */
export const inputValueElement = Effect.fn("CdpPage.inputValue")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ): Effect.Effect<string, CdpError> =>
    Effect.gen(function* () {
      yield* waitForSelectorElement(conn, state, selector, { timeout, state: "attached" });
      return yield* evaluatePage(
        conn,
        state,
        // Inline arrow body — see file header. This one throws on missing
        // element (vs returning null like the others above), because
        // inputValueElement's public contract is `Effect<string, CdpError>`
        // not `Effect<Option<string>, CdpError>`.
        (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error(`Element not found: ${sel}`);
          if (
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLSelectElement
          ) {
            return el.value;
          }
          throw new Error(`Element ${sel} is not an input, textarea, or select element`);
        },
        selector,
      );
    }),
);
