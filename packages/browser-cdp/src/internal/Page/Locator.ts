/**
 * Locator API for `browser-cdp`.
 *
 * Locators are *lazy* element selectors — they store a recipe (a composed
 * selector string + an optional index) and resolve to a DOM element at
 * action time. This is the modern Playwright API and the recommended way to
 * interact with elements.
 *
 * ## Why Locators instead of ElementHandles?
 *
 * ElementHandles (`$()`, `$$()`) require explicit `.dispose()` calls to free
 * server-side resources; failing to dispose leaks. In Effect, resource
 * management is done via `Scope` and finalizers, so a *lazy* locator that
 * resolves at action time fits the Effect model without any manual cleanup.
 *
 * ## How it works
 *
 * A `CdpLocator` stores:
 * - A composed selector string (built via `>>` chains)
 * - An optional index (for `nth()`, `first()`, `last()`)
 *
 * For non-indexed locators, the composed selector is passed directly to the
 * underlying `page.*` methods, which inherit their auto-wait and
 * actionability behavior.
 *
 * For indexed locators (`first()`, `nth(i)`, `last()`), the element at the
 * given index is resolved, tagged with a unique attribute, and the action
 * is dispatched via `page.*` using a unique-selector that targets only that
 * element. The tag is cleaned up after the action completes.
 *
 * ## Composition
 *
 * ```typescript
 * const submitButton = page
 *   .locator("form")
 *   .getByRole("button", { name: "Submit" });
 *
 * yield* submitButton.click();
 *
 * const firstItem = page.locator("li").first();
 * const lastItem = page.locator("li").last();
 * const thirdItem = page.locator("li").nth(2);
 * ```
 *
 */

import type { Input as DurationInput } from "effect/Duration";

import type { CdpConnection } from "../CdpConnection.js";
import type { CdpPageService } from "../CdpPage.js";

import { Effect, Option, Predicate as P, Duration } from "effect";

import { CdpError, SelectorError } from "../../CdpError.js";
import { boundingBox, type BoundingBox } from "./BoundingBox.js";
import { $evalElement, $$evalElements } from "./EvalOnSelector.js";
import { evaluatePage } from "./Evaluate.js";
import { evaluateHandlePage, type CdpHandle } from "./EvaluateHandle.js";
import { type CdpFrameLocator } from "./FrameLocator.js";
import { type PageState } from "./PageState.js";
import { type ScreenshotOptions } from "./Screenshot.js";
import { scrollIntoView } from "./ScrollIntoView.js";
import { generateQuerySelectorAll } from "./SelectorEngine.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options accepted by `page.locator(selector, options?)`.
 *
 * Mirrors Playwright's `LocatorOptions`. Filters are composed via `>>` chain
 * segments that our `SelectorEngine` understands.
 *
 * **Not supported in v1:** `hasNotText`, `hasNot` (requires negation support
 * in our SelectorEngine — use `browser-playwright` for the full Locator API).
 */
export interface LocatorOptions {
  /** Match elements whose subtree contains this text. */
  readonly hasText?: string | RegExp;
  /** Match elements whose subtree does NOT contain this text. */
  readonly hasNotText?: string | RegExp;
  /** Match elements whose subtree contains an element matching this locator. */
  readonly has?: CdpLocator;
  /** Match elements whose subtree does NOT contain an element matching this locator. */
  readonly hasNot?: CdpLocator;
}

/**
 * Options for `page.getByRole(role, options?)`.
 *
 * Mirrors Playwright's `ByRoleOptions`. Filters by `aria-*` attributes which
 * are translated into CSS attribute selectors our `SelectorEngine` supports.
 */
export interface ByRoleOptions {
  /** Whether the element is checked (checkbox/radio/switch with aria-checked). */
  readonly checked?: boolean;
  /** Whether the element is disabled. */
  readonly disabled?: boolean;
  /** Whether to match text exactly (true) or as a substring (false). Default: false. */
  readonly exact?: boolean;
  /** Whether the element is expanded (disclosure widgets). */
  readonly expanded?: boolean;
  /** Whether to include hidden elements in the search. */
  readonly includeHidden?: boolean;
  /** Heading level for role="heading". */
  readonly level?: number;
  /** Accessible name to match. */
  readonly name?: string | RegExp;
  /** Whether a toggle button is pressed. */
  readonly pressed?: boolean;
  /** Whether an option is selected. */
  readonly selected?: boolean;
}

/**
 * Options for the text-based locators (`getByText`, `getByLabel`, etc.).
 *
 * Mirrors Playwright's `{ exact?: boolean }` option.
 */
export interface TextMatchOptions {
  /** If true, match exactly. If false (default), match as substring. */
  readonly exact?: boolean;
}

/**
 * Options accepted by `locator.click()`. Mirrors Playwright's `ClickOptions`
 * subset that's relevant for locator-based clicks.
 */
export interface ClickOptions {
  readonly button?: "left" | "right" | "middle";
  readonly modifiers?: ReadonlyArray<"Alt" | "Control" | "ControlOrMeta" | "Meta" | "Shift">;
  readonly clickCount?: number;
  readonly position?: { readonly x: number; readonly y: number };
  readonly force?: boolean;
  readonly trial?: boolean;
  readonly timeout?: DurationInput;
}

// ─────────────────────────────────────────────────────────────────────────────
// CdpLocator interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Locator API for `browser-cdp`.
 *
 * Locators are lazy — they store a selector recipe and resolve at action
 * time. They auto-wait for actionability (delegated to page methods) and
 * never need disposal (no ElementHandle lifecycle).
 *
 * Created via `page.locator(selector)` or one of the `page.getBy*` helpers.
 */
export interface CdpLocator {
  /** The composed selector string for debugging / inspection. */
  readonly selector: string;

  // ── Chaining ────────────────────────────────────────────────────────────────

  /**
   * Chains another selector onto this locator.
   *
   * Equivalent to Playwright's `locator.locator(selector)`. Resolves to
   * elements that match `selector` *within* an element matching this locator.
   */
  readonly locator: (
    selectorOrLocator: string | CdpLocator,
    options?: LocatorOptions,
  ) => CdpLocator;

  /** Mirrors Playwright's `getByRole`. */
  readonly getByRole: (role: string, options?: ByRoleOptions) => CdpLocator;

  /** Mirrors Playwright's `getByText`. */
  readonly getByText: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /** Mirrors Playwright's `getByLabel`. */
  readonly getByLabel: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /** Mirrors Playwright's `getByTestId`. */
  readonly getByTestId: (testId: string | RegExp) => CdpLocator;

  /** Mirrors Playwright's `getByPlaceholder`. */
  readonly getByPlaceholder: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /** Mirrors Playwright's `getByAltText`. */
  readonly getByAltText: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /** Mirrors Playwright's `getByTitle`. */
  readonly getByTitle: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  // ── Filtering ───────────────────────────────────────────────────────────────

  /** Mirrors Playwright's `locator.filter(options)`. */
  readonly filter: (options: LocatorOptions) => CdpLocator;

  /**
   * Returns a locator pointing to the first matching element.
   *
   * Mirrors Playwright's `locator.first` — a lazy getter (no parens),
   * not a method, to match upstream and avoid eager-evaluation recursion
   * when a Locator wraps itself.
   */
  get first(): CdpLocator;

  /**
   * Returns a locator pointing to the last matching element.
   *
   * Mirrors Playwright's `locator.last` — a lazy getter (no parens).
   */
  get last(): CdpLocator;

  /** Returns a locator pointing to the Nth matching element (0-indexed). */
  readonly nth: (index: number) => CdpLocator;

  /**
   * Returns a new locator matching elements that match BOTH this locator
   * and the other locator (set intersection).
   *
   * Implemented via CSS `:not(:not(sel2))` applied to the trailing
   * selector segment of this locator. Works for plain CSS selectors
   * in modern Chromium. Limitation: chained selectors (using `>>`) and
   * non-CSS engines (xpath, text) are not yet supported — the
   * SelectorEngine would need an explicit `internal:and=` token (the
   * upstream Playwright approach) for full parity. Use the Playwright
   * module if you need `and` with chained selectors.
   */
  readonly and: (other: CdpLocator) => CdpLocator;

  /**
   * Returns a new locator matching elements that match EITHER this
   * locator or the other locator (set union).
   *
   * Implemented via CSS `:is(sel1, sel2)` applied to the trailing
   * selector segment of this locator. Works for plain CSS selectors
   * in modern Chromium. Same chaining limitation as `and`.
   */
  readonly or: (other: CdpLocator) => CdpLocator;

  /**
   * Returns a new locator with a description attached. The description
   * is surfaced in error messages and `selector` output for easier
   * debugging — it does not affect matching.
   *
   * Mirrors Playwright's `locator.describe(text)`.
   */
  readonly describe: (text: string) => CdpLocator;

  /**
   * Returns the description attached via `.describe(text)`, or `null`
   * when no description was set.
   *
   * Mirrors Playwright's `locator.description()` getter. Useful for
   * debug output and assertions.
   */
  readonly description: () => string | null;

  /**
   * Returns a formatted string representation of the locator.
   *
   * Mirrors Playwright's `locator.toString()`. If a description is set,
   * returns it directly (Playwright: `toString() === description()`).
   * Otherwise returns a Playwright-style format like
   * `locator('selector')` (basic CSS) or `getByRole('button', ...)` for
   * `getBy*` calls (when the selector is a known `getBy*` expression).
   *
   * Note: for chained locators that combine multiple `getBy*` calls,
   * the format may differ from Playwright's because CDP's selector
   * composition is text-based rather than AST-based.
   */
  readonly toString: () => string;

  /**
   * Returns the page this locator is bound to.
   *
   * Mirrors Playwright's `locator.page()` — useful when a locator is
   * passed around and you need to navigate the parent page.
   */
  readonly page: () => CdpPageService;

  /**
   * Returns a `CdpFrameLocator` that resolves an `<iframe>` element
   * matching `selector` within the page.
   *
   * Mirrors Playwright's `locator.frameLocator(selector)`. The returned
   * FrameLocator chains `.locator(inner)` to scope further queries to
   * the iframe's content frame:
   *
   * ```typescript
   * const button = page
   *   .locator("div.card")
   *   .frameLocator("iframe.widget")
   *   .locator("button.submit");
   * ```
   *
   * Implementation: delegates to `page.frameLocator(selector)`. The
   * locator's own selector is intentionally NOT composed into the
   * iframe lookup — the underlying FrameLocator treats its selector
   * as a CSS selector for an `<iframe>` in the parent frame's main
   * world and does not understand parent-scoping. In practice this
   * matches Playwright because iframe CSS selectors are usually
   * unique on the page (e.g. `#my-iframe`).
   */
  readonly frameLocator: (selector: string) => CdpFrameLocator;

  /**
   * Returns a `CdpFrameLocator` for the iframe matched by this locator.
   *
   * Mirrors Playwright's `locator.contentFrame()`. The returned
   * FrameLocator chains `.locator(inner)` to scope further queries to
   * the iframe's content frame:
   *
   * ```typescript
   * const button = page
   *   .locator("iframe.widget")
   *   .contentFrame()
   *   .locator("button.submit");
   * ```
   *
   * Implementation: equivalent to `page.frameLocator(state.selector)`,
   * except that the iframe lookup is treated as strict — when the
   * selector resolves to zero or more than one iframe, the action
   * fails with a clear strict-mode error. Mirrors Playwright's behavior
   * (`Locator.contentFrame()` returns a FrameLocator that errors when
   * the underlying selector is ambiguous, just like `locator()` itself).
   */
  readonly contentFrame: () => CdpFrameLocator;

  /**
   * Waits for the resolved element to reach a given state.
   *
   * Mirrors Playwright's `locator.waitFor({ state })`:
   * - `state: "visible"` (default): wait until the element is visible
   *   in the layout (non-zero size, not display:none/visibility:hidden).
   * - `state: "hidden"`: wait until the element is not visible or detached.
   * - `state: "attached"`: wait until the element is attached to the DOM.
   * - `state: "detached"`: wait until the element is no longer attached.
   *
   * Implementation: delegates to `page.waitForSelector(selector, options)`.
   * For indexed locators (.first / .nth / .last), the resolved element
   * is tagged with a unique attribute so the auto-wait sees exactly
   * one element matching.
   */
  readonly waitFor: (options?: {
    state?: "attached" | "visible" | "hidden" | "detached";
    timeout?: DurationInput;
  }) => Effect.Effect<void, CdpError>;

  /**
   * Dispatches a DOM event on the resolved element.
   *
   * Mirrors Playwright's `locator.dispatchEvent(type, eventInit?)`.
   * Delegates to `page.dispatchEvent(selector, type, eventInit?)`.
   */
  readonly dispatchEvent: (
    type: string,
    eventInit?: Record<string, unknown>,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Scrolls the resolved element into view.
   *
   * Mirrors Playwright's `locator.scrollIntoViewIfNeeded(options?)`.
   * Idempotent — if the element is already in view, this is a no-op.
   *
   * Implementation: delegates to a new `ScrollIntoView` helper that
   * calls `element.scrollIntoView(options)` on the resolved element.
   * Does NOT auto-wait for actionability beyond element resolution.
   */
  readonly scrollIntoViewIfNeeded: (options?: {
    behavior?: "auto" | "smooth" | "instant";
    block?: ScrollLogicalPosition;
    inline?: ScrollLogicalPosition;
    timeout?: DurationInput;
  }) => Effect.Effect<void, CdpError>;

  /**
   * Sets files on a file input element.
   *
   * Mirrors Playwright's `locator.setInputFiles(files)`. Delegates to
   * `page.setInputFiles(selector, files)`. The selector must resolve
   * to a single `<input type="file">` element.
   */
  readonly setInputFiles: (
    files: ReadonlyArray<string>,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  // ── Actions ─────────────────────────────────────────────────────────────────

  /** Clicks the resolved element. */
  readonly click: (options?: ClickOptions) => Effect.Effect<void, CdpError>;

  /** Double-clicks the resolved element. */
  readonly dblclick: (options?: {
    trial?: boolean;
    timeout?: DurationInput;
  }) => Effect.Effect<void, CdpError>;

  /** Hovers over the resolved element. */
  readonly hover: (options?: { timeout?: DurationInput }) => Effect.Effect<void, CdpError>;

  /** Fills the resolved element with a value. */
  readonly fill: (
    value: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Types text into the resolved element character by character. */
  readonly type: (
    text: string,
    options?: { delay?: number; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Types text into the resolved element character by character.
   *
   * Mirrors Playwright's `pressSequentially` — Playwright renamed `type`
   * to `pressSequentially` to disambiguate from keyboard.type. Both names
   * are kept for compatibility; they are exact aliases.
   */
  readonly pressSequentially: (
    text: string,
    options?: { delay?: number; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Clears the resolved input element by setting its value to "".
   *
   * Mirrors Playwright's `locator.clear()` — equivalent to `fill("")`
   * but reads more naturally at the call site. Triggers the same
   * `input` event as a manual clear.
   */
  readonly clear: (options?: { timeout?: DurationInput }) => Effect.Effect<void, CdpError>;

  /** Presses a key while the resolved element is focused. */
  readonly press: (
    key: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Focuses the resolved element. */
  readonly focus: (options?: { timeout?: DurationInput }) => Effect.Effect<void, CdpError>;

  /** Blurs the resolved element. */
  readonly blur: (options?: { timeout?: DurationInput }) => Effect.Effect<void, CdpError>;

  /** Checks a checkbox/radio element. */
  readonly check: (options?: {
    trial?: boolean;
    timeout?: DurationInput;
  }) => Effect.Effect<void, CdpError>;

  /** Unchecks a checkbox element. */
  readonly uncheck: (options?: {
    trial?: boolean;
    timeout?: DurationInput;
  }) => Effect.Effect<void, CdpError>;

  /** Sets the checked state of a checkbox/radio element. */
  readonly setChecked: (
    checked: boolean,
    options?: { trial?: boolean; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Selects options in a `<select>` element. */
  readonly selectOption: <T extends string | { value?: string; label?: string; index?: number }>(
    values: T | T[],
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<readonly string[], CdpError>;

  /**
   * Taps the resolved element using touch events.
   *
   * Mirrors Playwright's `locator.tap()`. Delegates to `page.tap()` with
   * the resolved selector — same options shape, same retry/auto-wait
   * behavior. Use for mobile / touchscreen testing.
   */
  readonly tap: (options?: {
    position?: { readonly x: number; readonly y: number };
    force?: boolean;
    trial?: boolean;
    timeout?: DurationInput;
  }) => Effect.Effect<void, CdpError>;

  // ── Queries ─────────────────────────────────────────────────────────────────

  /** Returns the text content of the resolved element. */
  readonly textContent: (options?: {
    timeout?: DurationInput;
  }) => Effect.Effect<string | null, CdpError>;

  /** Returns the visible text of the resolved element. */
  readonly innerText: (options?: { timeout?: DurationInput }) => Effect.Effect<string, CdpError>;

  /** Returns the inner HTML of the resolved element. */
  readonly innerHTML: (options?: { timeout?: DurationInput }) => Effect.Effect<string, CdpError>;

  /** Returns the value of an attribute on the resolved element. */
  readonly getAttribute: (
    name: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<string | null, CdpError>;

  /** Returns the value of an input/textarea/select element. */
  readonly inputValue: (options?: { timeout?: DurationInput }) => Effect.Effect<string, CdpError>;

  /**
   * Selects the text content of the resolved element (input/textarea).
   *
   * Mirrors Playwright's `locator.selectText()`. After this call,
   * `window.getSelection().toString()` returns the element's text
   * value. Implementation: focuses the element, sets the selection
   * range over the entire text content. For non-text elements, this
   * is a no-op (browser behavior on `setSelectionRange` for non-input
   * elements varies; the upstream test asserts `getSelection().toString()`
   * returns the textarea value).
   *
   * Note: not part of the upstream Locator surface for non-input
   * elements — CDP exposes it only on input/textarea/select because
   * `setSelectionRange` is only defined on those. For form-control
   * elements this matches Playwright.
   */
  readonly selectText: () => Effect.Effect<void, CdpError>;

  /**
   * Returns the element's bounding box as `{x, y, width, height}`, or
   * `null` when the element is not in the layout (display:none, zero
   * size, detached, or selector matches zero / multiple elements).
   *
   * Mirrors Playwright's `locator.boundingBox()`. Coordinates are in
   * CSS pixels, relative to the document.
   */
  readonly boundingBox: () => Effect.Effect<BoundingBox | null, CdpError>;

  /**
   * Returns a new locator for each element matching this locator.
   *
   * Mirrors Playwright's `locator.all()`. The returned array's i-th
   * element corresponds to the i-th match (DOM order). Each returned
   * locator is independent — chaining actions on one does not affect
   * the others.
   *
   * Implementation: uses `count()` to get the match count, then maps
   * each index through `nth(i)`. This re-queries the selector per
   * element (not optimized — Playwright captures a CSS path once).
   * For most use cases the overhead is negligible.
   */
  readonly all: () => Effect.Effect<ReadonlyArray<CdpLocator>, CdpError>;

  /**
   * Returns the innerText of each matching element.
   *
   * Mirrors Playwright's `locator.allInnerTexts()`. Each string is
   * the rendered text content (respects `display: none` children).
   * Returns an empty array when no elements match.
   */
  readonly allInnerTexts: () => Effect.Effect<ReadonlyArray<string>, CdpError>;

  /**
   * Returns the textContent of each matching element.
   *
   * Mirrors Playwright's `locator.allTextContents()`. Each string is
   * the raw text content (does NOT respect `display: none` — includes
   * hidden text). Returns an empty array when no elements match.
   */
  readonly allTextContents: () => Effect.Effect<ReadonlyArray<string>, CdpError>;

  /**
   * Captures a screenshot of the resolved element.
   *
   * Mirrors Playwright's `locator.screenshot(options?)`. Returns a
   * `Uint8Array` containing the encoded image (PNG by default).
   *
   * For indexed locators (.first / .nth / .last), the resolved
   * element is tagged with a unique attribute so the screenshot
   * clip targets exactly that element.
   */
  readonly screenshot: (
    options?: Omit<ScreenshotOptions, "selector">,
  ) => Effect.Effect<Uint8Array, CdpError>;

  // ── State checks ────────────────────────────────────────────────────────────

  readonly isVisible: () => Effect.Effect<boolean, CdpError>;
  readonly isHidden: () => Effect.Effect<boolean, CdpError>;
  readonly isChecked: (options?: { timeout?: DurationInput }) => Effect.Effect<boolean, CdpError>;
  readonly isDisabled: (options?: { timeout?: DurationInput }) => Effect.Effect<boolean, CdpError>;
  readonly isEditable: (options?: { timeout?: DurationInput }) => Effect.Effect<boolean, CdpError>;
  readonly isEnabled: (options?: { timeout?: DurationInput }) => Effect.Effect<boolean, CdpError>;

  // ── Evaluation ──────────────────────────────────────────────────────────────

  /**
   * Evaluates a function on the resolved element.
   *
   * - Non-indexed: delegates to `page.$eval(selector, fn, arg)`.
   * - Indexed: resolves the element, then runs fn on it via a single
   *   `evaluatePage` call.
   */
  readonly evaluate: <T, Arg = void>(
    pageFunction: (element: Element, arg: Arg) => T,
    arg?: Arg,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Awaited<T>, CdpError>;

  /**
   * Evaluates a function on the resolved element and returns a
   * `CdpHandle` referencing the result.
   *
   * Mirrors Playwright's `Locator.evaluateHandle` API. Use this when
   * you need a stable remote reference to the evaluation result (for
   * example, to pass it to subsequent `evaluate` calls or to read
   * properties via `getProperty`).
   *
   * Same strict-mode behavior as `evaluate`: fails for non-indexed
   * locators matching zero or more than one element.
   *
   * @param pageFunction - Function to evaluate on the element
   * @param arg - Optional argument to pass to the function (in addition to the element)
   * @param options - Options
   *   - `timeout`: Maximum wait time for the element (DurationInput, default: "30 seconds")
   * @returns A `CdpHandle` referencing the result
   */
  readonly evaluateHandle: <T, Arg = void>(
    pageFunction: (element: Element, arg: Arg) => T,
    arg?: Arg,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<CdpHandle, CdpError>;

  /**
   * Evaluates a function on ALL matching elements. Passes an array.
   *
   * Index is ignored — operates on all matches.
   */
  readonly evaluateAll: <T, Arg = void>(
    pageFunction: (elements: ReadonlyArray<Element>, arg: Arg) => T,
    arg?: Arg,
  ) => Effect.Effect<Awaited<T>, CdpError>;

  /** Returns the number of elements matching this locator. */
  readonly count: () => Effect.Effect<number, CdpError>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal state and helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal state for a Locator. A Locator is immutable — chaining returns a
 * new Locator with new state.
 */
interface LocatorState {
  /** Composed selector string (e.g. `form >> [role=button]`). */
  readonly selector: string;
  /**
   * If set, the locator resolves to the element at this index of the matching
   * elements. -1 means "last". `undefined` means "single match expected".
   */
  readonly index?: number;
  /**
   * Optional human-readable description for debugging. Set via `.describe(text)`.
   * Surfaced in error messages and the public `selector` getter.
   */
  readonly description?: string;
}

/**
 * Internal context required to build a Locator.
 */
export interface LocatorContext {
  /** The page that owns this locator — actions delegate here. */
  readonly page: CdpPageService;
  /** Underlying CDP connection. */
  readonly connection: CdpConnection["Service"];
  /** Page state. */
  readonly state: PageState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Selector composition helpers (exported for testing)
// ─────────────────────────────────────────────────────────────────────────────

/** Compose two selectors via `>>` chaining. */
export const composeSelectors = (head: string, tail: string): string => {
  if (!tail) return head;
  return `${head} >> ${tail}`;
};

/**
 * Wrap the trailing segment of a (possibly chained) selector with a
 * CSS combinator. Splits on the last ` >> ` and applies `wrap` to the
 * tail. For un-chained selectors, the whole string is the tail.
 *
 * Used by `and` / `or` to inject `:is(...)` / `:not(:not(...))` into
 * the LAST selector segment only. Chained segments are unaffected
 * because they query sub-trees; only the final element-matching step
 * needs the combinator.
 */
const wrapTrailingSegment = (selector: string, wrap: (tail: string) => string): string => {
  const parts = selector.split(" >> ");
  const last = parts.pop();
  if (last === undefined) return selector;
  parts.push(wrap(last));
  return parts.join(" >> ");
};

/**
 * Serialize a string or RegExp into a text selector segment.
 *
 * - Strings: `text="value"` (exact) or `text="value"` (substring)
 * - RegExp: `text=/source/flags`
 */
const textSelectorSegment = (text: string | RegExp, _exact: boolean): string => {
  if (P.isRegExp(text)) {
    return `text=/${text.source}/${text.flags}`;
  }
  // Quote string value to preserve special chars and spaces.
  return `text="${text.replace(/["\\]/g, "\\$&")}"`;
};

/**
 * Serialize a string or RegExp into a `text-contains=` selector segment.
 *
 * Used by `filter({ hasText })` and `locator(sel, { hasText })` to match
 * elements whose subtree text contains the given text (Playwright's
 * `internal:has-text` engine).
 *
 * - Strings: `text-contains="<json-encoded>"` (JSON encoding sidesteps
 *   the `text=` parser's quote-escape bug — e.g. strings containing
 *   `"` or `\` round-trip cleanly).
 * - RegExp: `text-contains=/source/flags`.
 */
const hasTextSelectorSegment = (text: string | RegExp): string => {
  if (P.isRegExp(text)) {
    return `text-contains=/${text.source}/${text.flags}`;
  }
  return `text-contains=${JSON.stringify(text)}`;
};

/**
 * Build a CSS attribute selector.
 *
 * - String value: `[attr="value"]`
 * - RegExp value: `[attr]` (we don't convert regex → CSS in v1)
 */
const attributeSelector = (attr: string, value: string | RegExp): string => {
  if (P.isRegExp(value)) {
    // Without regex → CSS conversion, match any element with the attribute.
    return `[${attr}]`;
  }
  return `[${attr}="${value.replace(/["\\]/g, "\\$&")}"]`;
};

/** Translate `getByRole` options into a CSS attribute selector. */
export const getByRoleSelector = (role: string, options?: ByRoleOptions): string => {
  let sel = `[role="${role.replace(/["\\]/g, "\\$&")}"]`;
  if (options?.checked !== undefined) sel += `[aria-checked="${options.checked}"]`;
  if (options?.disabled !== undefined) sel += `[aria-disabled="${options.disabled}"]`;
  if (options?.expanded !== undefined) sel += `[aria-expanded="${options.expanded}"]`;
  if (options?.pressed !== undefined) sel += `[aria-pressed="${options.pressed}"]`;
  if (options?.selected !== undefined) sel += `[aria-selected="${options.selected}"]`;
  if (options?.level !== undefined) sel += `[aria-level="${options.level}"]`;
  if (options?.name !== undefined) {
    sel += attributeSelector("aria-label", options.name);
  }
  return sel;
};

/** Translate `getByText` text to a text selector segment. */
export const getByTextSelector = (text: string | RegExp, options?: TextMatchOptions): string =>
  textSelectorSegment(text, options?.exact ?? false);

/**
 * Translate `getByLabel` to a CSS `[aria-label]` selector.
 *
 * Approximation: Playwright matches both `aria-label` and `<label>` association.
 * We only match `aria-label` — DOM-walking label association is non-trivial.
 */
export const getByLabelSelector = (text: string | RegExp, _options?: TextMatchOptions): string =>
  attributeSelector("aria-label", text);

/** Translate `getByTestId` to a CSS `[data-testid]` selector. */
export const getByTestIdSelector = (testId: string | RegExp): string =>
  attributeSelector("data-testid", testId);

const getByPlaceholderSelector = (text: string | RegExp, _options?: TextMatchOptions): string =>
  attributeSelector("placeholder", text);

const getByAltTextSelector = (text: string | RegExp, _options?: TextMatchOptions): string =>
  attributeSelector("alt", text);

const getByTitleSelector = (text: string | RegExp, _options?: TextMatchOptions): string =>
  attributeSelector("title", text);

/**
 * Convert a LocatorOptions into a selector segment to append via `>>`.
 *
 * - `hasText` → `>> text=...` (matches elements containing text)
 * - `has` → `>> <inner.selector>` (matches elements containing inner match)
 * - `hasNotText`/`hasNot` → not yet supported in v1 (no error path here —
 *   let the chain produce an invalid selector that fails at action time).
 */
const filterToSelectorSegment = (options: LocatorOptions): string => {
  const parts: string[] = [];
  if (options.hasText !== undefined) {
    // hasText uses Playwright's `internal:has-text` semantic: match elements
    // whose subtree text contains the search string. We emit
    // `text-contains=...` (handled by the SelectorEngine) rather than the
    // self-text-match `text=...` prefix used by getByText.
    parts.push(hasTextSelectorSegment(options.hasText));
  }
  if (options.has !== undefined) {
    parts.push(options.has.selector);
  }
  return parts.join(" >> ");
};

// ─────────────────────────────────────────────────────────────────────────────
// Indexed element resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a unique attribute name for tagging an indexed element. */
const generateTag = (): string =>
  `__cdp_locator_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e12).toString(36)}__`;

/**
 * Run `action` against the resolved element.
 *
 * Strategy: tag the resolved element with a unique attribute, call the
 * page method with the unique-selector, then remove the tag. This lets us
 * reuse existing page.* methods without rewriting their actionability /
 * auto-wait logic.
 *
 * For non-indexed locators, we tag the first match (or nothing if no
 * matches). If no matches, the page method's auto-wait on `[tag]` will
 * time out and fail with its own error.
 *
 * For indexed locators, we tag the element at the index. If the index is
 * out of bounds, we fail with a SelectorError immediately.
 *
 * Limitations:
 * - Tagging adds DOM mutation overhead (negligible in practice).
 * - Indexed locators don't get strict-mode on the *unique* selector
 *   (the tag is unique by construction).
 */
const withIndexedElement = <A>(
  ctx: LocatorContext,
  state: LocatorState,
  action: (uniqueSelector: string) => Effect.Effect<A, CdpError>,
): Effect.Effect<A, CdpError> =>
  Effect.gen(function* () {
    const tag = generateTag();

    // Tag the resolved element.
    const tagged = yield* $$evalElements<
      { readonly ok: boolean; readonly count: number },
      { readonly index: number | null; readonly tag: string }
    >(
      ctx.connection,
      ctx.state,
      state.selector,
      (els, args) => {
        if (args.index === null) {
          // Non-indexed: tag the first match if any.
          const el = els[0];
          if (!el) {
            return { ok: false, count: 0 };
          }
          el.setAttribute(args.tag, "1");
          return { ok: true, count: els.length };
        }
        // Indexed: tag the element at the index.
        const idx = args.index === -1 ? els.length - 1 : args.index;
        const el = els[idx];
        if (!el) {
          return { ok: false, count: els.length };
        }
        el.setAttribute(args.tag, "1");
        return { ok: true, count: 1 };
      },
      { index: state.index ?? null, tag },
    );

    // For indexed locators, fail immediately if index is out of bounds.
    if (!tagged.ok && state.index !== undefined) {
      return yield* selectorError(
        "resolve",
        state.selector,
        `No element at index ${state.index} for selector "${state.selector}" (matched ${tagged.count})`,
      );
    }
    // Strict mode for non-indexed locators: when the selector resolves to
    // more than one element, fail with a strict-mode violation (mirrors
    // Playwright's default strict-mode behavior). Without this, an
    // action like `page.locator("div").focus()` on `<div>A</div><div>B</div>`
    // would silently focus the first div.
    if (tagged.ok && state.index === undefined && tagged.count > 1) {
      // Clean up the tag we just set on the first match before failing.
      yield* $$evalElements<number, { readonly tag: string }>(
        ctx.connection,
        ctx.state,
        `[${tag}]`,
        (els, args) => {
          for (const el of els) el.removeAttribute(args.tag);
          return els.length;
        },
        { tag },
      ).pipe(Effect.ignore);
      return yield* selectorError(
        "resolve",
        state.selector,
        `Selector "${state.selector}" matches ${tagged.count} elements. Use .first, .last, .nth(i), or .filter() to narrow to one.`,
      );
    }
    // For non-indexed with no matches, we proceed and let the page method
    // fail via auto-wait (since `[tag]` matches nothing).

    const uniqueSelector = `[${tag}]`;

    // Run the action against the unique-selector.
    const result = yield* action(uniqueSelector);

    // Cleanup: remove the tag from any element that has it.
    yield* $$evalElements<number, { readonly tag: string }>(
      ctx.connection,
      ctx.state,
      uniqueSelector,
      (els, args) => {
        for (const el of els) {
          el.removeAttribute(args.tag);
        }
        return els.length;
      },
      { tag },
    ).pipe(Effect.ignore);

    return result;
  });

// ─────────────────────────────────────────────────────────────────────────────
// Error helper
// ─────────────────────────────────────────────────────────────────────────────

const selectorError = (method: string, selector: string, description: string): CdpError =>
  new CdpError({
    module: "CdpLocator",
    method,
    reason: new SelectorError({ selector, description }),
  });

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a `CdpLocator` bound to a page and starting selector.
 */
export const makeCdpLocator = (ctx: LocatorContext, initialSelector: string): CdpLocator => {
  const build = (state: LocatorState): CdpLocator => {
    const composeAndBuild = (tail: string): CdpLocator =>
      build({ selector: composeSelectors(state.selector, tail), index: state.index });

    return {
      // The composed selector string. When `.describe()` was applied, the
      // description is prepended for debugging — it doesn't affect matching.
      get selector(): string {
        return state.description ? `${state.description} (${state.selector})` : state.selector;
      },

      // ── Chaining ─────────────────────────────────────────────────────────

      locator: (selectorOrLocator, options) => {
        let tail: string;
        if (P.isString(selectorOrLocator)) {
          tail = selectorOrLocator;
        } else {
          tail = selectorOrLocator.selector;
        }
        if (options) {
          const filterSeg = filterToSelectorSegment(options);
          if (filterSeg) tail = composeSelectors(tail, filterSeg);
        }
        return composeAndBuild(tail);
      },

      getByRole: (role, options) => composeAndBuild(getByRoleSelector(role, options)),
      getByText: (text, options) => composeAndBuild(getByTextSelector(text, options)),
      getByLabel: (text, options) => composeAndBuild(getByLabelSelector(text, options)),
      getByTestId: (testId) => composeAndBuild(getByTestIdSelector(testId)),
      getByPlaceholder: (text, options) => composeAndBuild(getByPlaceholderSelector(text, options)),
      getByAltText: (text, options) => composeAndBuild(getByAltTextSelector(text, options)),
      getByTitle: (text, options) => composeAndBuild(getByTitleSelector(text, options)),

      filter: (options) => {
        const seg = filterToSelectorSegment(options);
        if (!seg) return build(state);
        return composeAndBuild(seg);
      },

      // ── first / last are lazy getters — they return a fresh locator on each
      //    access. Mirrors Playwright's `locator.first` / `locator.last`
      //    properties (no parens). Eager evaluation would recurse without
      //    termination because each wrapped Locator's `first` / `last` would
      //    wrap the underlying `first` / `last` of its own raw handle, and
      //    so on. The lazy getter is the same shape upstream Playwright uses
      //    and avoids that cycle.
      get first(): CdpLocator {
        return build({ ...state, index: 0 });
      },
      get last(): CdpLocator {
        return build({ ...state, index: -1 });
      },
      nth: (index) => build({ ...state, index }),

      and: (other) => {
        // Intersection: sel1:not(:not(sel2)) — elements matching sel1
        // AND sel2. Applied to the trailing segment only.
        const otherTail = other.selector.split(" >> ").pop() ?? other.selector;
        return build({
          ...state,
          selector: wrapTrailingSegment(
            state.selector,
            (tail) => `${tail}:not(:not(${otherTail}))`,
          ),
        });
      },

      or: (other) => {
        // Union: :is(sel1, sel2) — elements matching sel1 OR sel2.
        const otherTail = other.selector.split(" >> ").pop() ?? other.selector;
        return build({
          ...state,
          selector: wrapTrailingSegment(state.selector, (tail) => `:is(${tail}, ${otherTail})`),
        });
      },

      describe: (text) => build({ ...state, description: text }),

      description: () => state.description ?? null,

      toString: () => {
        // Playwright behavior: toString() === description() when a
        // description is set. Otherwise format the selector using
        // the getBy* prefix that produced it (best-effort — CDP's
        // composed selector doesn't preserve the original
        // getBy* / locator() expression AST).
        if (state.description) return state.description;
        // For selectors that are pure getBy* / locator() expressions
        // (i.e. haven't been chained yet), reproduce the upstream
        // format. Chained selectors fall back to the raw selector.
        const sel = state.selector;
        const m =
          /^(locator|getByRole|getByText|getByLabel|getByTestId|getByPlaceholder|getByAltText|getByTitle)\((.*)\)$/.exec(
            sel,
          );
        if (m) {
          return `${m[1]}(${m[2]})`;
        }
        return `locator('${sel}')`;
      },

      page: () => ctx.page,

      contentFrame: () => {
        // Equivalent to page.frameLocator(state.selector) but exposed
        // via the locator chain so callers don't have to repeat the
        // selector. The strict-mode behavior on the underlying
        // frameLocator applies (added in P13 — see FrameLocator.ts
        // `resolveIframeFrameId` for the count check).
        return ctx.page.frameLocator(state.selector);
      },

      // Note: we delegate to page.frameLocator with just the iframe
      // selector — the locator's parent selector is intentionally NOT
      // composed into the iframe lookup. Reason: the underlying
      // FrameLocator treats its selector as a CSS selector for an
      // <iframe> element in the parent frame's main world. It does
      // not understand "find the iframe within an element matching
      // X". In practice, this matches Playwright's behavior because
      // most CSS selectors for iframes are unique on the page
      // (e.g. `#my-iframe`, `iframe.widget`) and don't need parent
      // scoping. For ambiguous cases, use page.frameLocator directly
      // with a more specific selector.
      frameLocator: (selector) => ctx.page.frameLocator(selector),

      waitFor: (options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.waitForSelector(sel, options)),

      dispatchEvent: (type, eventInit) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.dispatchEvent(sel, type, eventInit)),

      scrollIntoViewIfNeeded: (options) =>
        withIndexedElement(ctx, state, (sel) =>
          Effect.gen(function* () {
            yield* scrollIntoView(ctx.connection, ctx.state, sel, options);
          }),
        ),

      setInputFiles: (files) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.setInputFiles(sel, files)),

      // ── Actions ──────────────────────────────────────────────────────────

      click: (options) => withIndexedElement(ctx, state, (sel) => ctx.page.click(sel, options)),
      dblclick: (options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.dblclick(sel, options)),
      hover: (options) => withIndexedElement(ctx, state, (sel) => ctx.page.hover(sel, options)),
      fill: (value, options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.fill(sel, value, options)),
      type: (text, options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.type(sel, text, options)),
      pressSequentially: (text, options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.type(sel, text, options)),
      clear: (options) => withIndexedElement(ctx, state, (sel) => ctx.page.fill(sel, "", options)),
      press: (key, options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.press(sel, key, options)),
      focus: (options) => withIndexedElement(ctx, state, (sel) => ctx.page.focus(sel, options)),
      blur: (options) => withIndexedElement(ctx, state, (sel) => ctx.page.blur(sel, options)),
      check: (options) => withIndexedElement(ctx, state, (sel) => ctx.page.check(sel, options)),
      uncheck: (options) => withIndexedElement(ctx, state, (sel) => ctx.page.uncheck(sel, options)),
      setChecked: (checked, options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.setChecked(sel, checked, options)),
      selectOption: (values, options) =>
        withIndexedElement(ctx, state, (sel) =>
          ctx.page.selectOption(sel, values as never, options),
        ),
      tap: (options) => withIndexedElement(ctx, state, (sel) => ctx.page.tap(sel, options)),

      // ── Queries ──────────────────────────────────────────────────────────

      textContent: (options) =>
        withIndexedElement(ctx, state, (sel) =>
          Effect.map(ctx.page.textContent(sel, options), (opt) =>
            Option.isSome(opt) ? opt.value : null,
          ),
        ),
      innerText: (options) =>
        withIndexedElement(ctx, state, (sel) =>
          Effect.map(ctx.page.innerText(sel, options), (opt) =>
            Option.isSome(opt) ? opt.value : "",
          ),
        ),
      innerHTML: (options) =>
        withIndexedElement(ctx, state, (sel) =>
          Effect.map(ctx.page.innerHTML(sel, options), (opt) =>
            Option.isSome(opt) ? opt.value : "",
          ),
        ),
      getAttribute: (name, options) =>
        withIndexedElement(ctx, state, (sel) =>
          Effect.map(ctx.page.getAttribute(sel, name, options), (opt) =>
            Option.isSome(opt) ? opt.value : null,
          ),
        ),
      inputValue: (options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.inputValue(sel, options)),

      selectText: () =>
        withIndexedElement(ctx, state, (sel) =>
          Effect.gen(function* () {
            yield* evaluatePage(
              ctx.connection,
              ctx.state,
              (s: string) => {
                const el = document.querySelector(s);
                if (!el) return undefined;
                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                  el.focus();
                  try {
                    el.setSelectionRange(0, el.value.length);
                  } catch {
                    // setSelectionRange throws for type=number/email/etc.
                    // Fall back to document.execCommand('selectall').
                    document.execCommand("selectall", false, undefined);
                  }
                }
                return undefined;
              },
              sel,
            );
          }),
        ),

      boundingBox: () => boundingBox(ctx.connection, ctx.state, state.selector, state.index),

      all: () =>
        Effect.gen(function* () {
          // Get the count of matches, then build an array of nth
          // locators. Index is ignored for the count query — we
          // always want the total. For each match, return a fresh
          // locator scoped to that index.
          const total = yield* $$evalElements<ReadonlyArray<Element>, never>(
            ctx.connection,
            ctx.state,
            state.selector,
            (els) => els,
          ).pipe(Effect.map((els) => els.length));
          const out: CdpLocator[] = [];
          for (let i = 0; i < total; i++) {
            out.push(build({ ...state, index: i }));
          }
          return out;
        }),

      allInnerTexts: () =>
        $$evalElements<ReadonlyArray<string>, never>(
          ctx.connection,
          ctx.state,
          state.selector,
          (els) => els.map((el) => (el as HTMLElement).innerText ?? ""),
        ),

      allTextContents: () =>
        $$evalElements<ReadonlyArray<string>, never>(
          ctx.connection,
          ctx.state,
          state.selector,
          (els) => els.map((el) => el.textContent ?? ""),
        ),

      screenshot: (options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.screenshot({ ...options, selector: sel })),

      // ── State checks ─────────────────────────────────────────────────────
      // Indexed locators still work for state checks — page.is* uses
      // querySelector which returns the first match. For indexed locators
      // we delegate the tag-based resolution to keep behavior consistent
      // (the check runs against the indexed element via the tag selector).

      isVisible: () => withIndexedElement(ctx, state, (sel) => ctx.page.isVisible(sel)),
      isHidden: () => withIndexedElement(ctx, state, (sel) => ctx.page.isHidden(sel)),
      isChecked: (options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.isChecked(sel, options)),
      isDisabled: (options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.isDisabled(sel, options)),
      isEditable: (options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.isEditable(sel, options)),
      isEnabled: (options) =>
        withIndexedElement(ctx, state, (sel) => ctx.page.isEnabled(sel, options)),

      // ── Evaluation ───────────────────────────────────────────────────────

      evaluate: <T, Arg = void>(
        pageFunction: (element: Element, arg: Arg) => T,
        arg?: Arg,
        options?: { timeout?: DurationInput },
      ) =>
        // evaluate enforces strict mode (must match exactly one element for
        // non-indexed). For non-indexed with multiple matches, we fail
        // upfront. For indexed, we resolve the indexed element.
        //
        // Strategy: do a strict-mode pre-check, then use $$evalElements to
        // run the user's function on the matches.
        Effect.gen(function* () {
          // Strict mode pre-check. Use evaluatePage with a self-contained
          // string expression so we don't ship closure refs to the browser.
          // `generateQuerySelectorAll` builds the right query code for
          // Playwright-style selectors (text=, xpath=, css, >> chaining).
          if (state.index === undefined) {
            const queryCode = generateQuerySelectorAll(state.selector);
            const count = yield* evaluatePage<number>(
              ctx.connection,
              ctx.state,
              `(() => { const els = ${queryCode}; return els.length; })()`,
            );
            if (count === 0) {
              return yield* new CdpError({
                module: "CdpPage",
                method: "locator.evaluate",
                reason: new SelectorError({
                  selector: state.selector,
                  description: `No element matches selector "${state.selector}"`,
                }),
              });
            }
            if (count > 1) {
              return yield* new CdpError({
                module: "CdpPage",
                method: "locator.evaluate",
                reason: new SelectorError({
                  selector: state.selector,
                  description: `Selector "${state.selector}" matches ${count} elements. Use .first(), .last(), .nth(), or .filter() to narrow to one.`,
                }),
              });
            }
          } else {
            const queryCode = generateQuerySelectorAll(state.selector);
            const indexExpr = state.index === -1 ? "els.length - 1" : String(state.index);
            const errMsg = `No element at index ${state.index} for selector "${state.selector}"`;
            const indexed = yield* evaluatePage<number>(
              ctx.connection,
              ctx.state,
              `(() => { const els = ${queryCode}; if (!els[${indexExpr}]) throw new Error(${JSON.stringify(errMsg)}); return 1; })()`,
            );
            void indexed;
          }

          // For non-indexed, the strict-mode check ensures exactly one
          // match — use $evalElement directly.
          if (state.index === undefined) {
            return yield* $evalElement<T, Arg>(
              ctx.connection,
              ctx.state,
              state.selector,
              pageFunction,
              arg,
              options?.timeout !== undefined
                ? Duration.fromInputUnsafe(options.timeout)
                : undefined,
            );
          }

          // For indexed: build a self-contained browser function source
          // that queries all elements, picks the indexed one, and invokes
          // the user's function. Using the same `new Function(code)`
          // pattern as $eval/$$eval keeps the wrapper free of closure refs.
          const fnSource = pageFunction.toString();
          const idxExpr = state.index === -1 ? "els.length - 1" : String(state.index);
          const errMsg = `No element at index ${state.index} for selector "${state.selector.replace(/"/g, '\\"')}"`;
          const queryAllCode = generateQuerySelectorAll(state.selector);

          const wrapperCode = `
            const argVal = arguments[0];
            const els = ${queryAllCode};
            const idx = ${idxExpr};
            const el = els[idx];
            if (!el) throw new Error(${JSON.stringify(errMsg)});
            const fn = (${fnSource});
            return fn(el, argVal);
          `;
          const wrapper = new Function(wrapperCode) as (...args: any[]) => Awaited<T>;

          const result =
            arg !== undefined
              ? yield* evaluatePage<Awaited<T>>(ctx.connection, ctx.state, wrapper, arg)
              : yield* evaluatePage<Awaited<T>>(ctx.connection, ctx.state, wrapper);
          return result;
        }),

      evaluateHandle: <T, Arg = void>(
        pageFunction: (element: Element, arg: Arg) => T,
        arg?: Arg,
        _options?: { timeout?: DurationInput },
      ) =>
        // Same shape as `evaluate` but uses `evaluateHandlePage` to
        // return a CdpHandle instead of a serialized value. Strict mode
        // and indexed resolution mirror `evaluate`.
        Effect.gen(function* () {
          if (state.index === undefined) {
            const queryCode = generateQuerySelectorAll(state.selector);
            const count = yield* evaluatePage<number>(
              ctx.connection,
              ctx.state,
              `(() => { const els = ${queryCode}; return els.length; })()`,
            );
            if (count === 0) {
              return yield* new CdpError({
                module: "CdpPage",
                method: "locator.evaluateHandle",
                reason: new SelectorError({
                  selector: state.selector,
                  description: `No element matches selector "${state.selector}"`,
                }),
              });
            }
            if (count > 1) {
              return yield* new CdpError({
                module: "CdpPage",
                method: "locator.evaluateHandle",
                reason: new SelectorError({
                  selector: state.selector,
                  description: `Selector "${state.selector}" matches ${count} elements. Use .first(), .last(), .nth(), or .filter() to narrow to one.`,
                }),
              });
            }
          } else {
            const queryCode = generateQuerySelectorAll(state.selector);
            const indexExpr = state.index === -1 ? "els.length - 1" : String(state.index);
            const errMsg = `No element at index ${state.index} for selector "${state.selector}"`;
            const indexed = yield* evaluatePage<number>(
              ctx.connection,
              ctx.state,
              `(() => { const els = ${queryCode}; if (!els[${indexExpr}]) throw new Error(${JSON.stringify(errMsg)}); return 1; })()`,
            );
            void indexed;
          }

          // Build a self-contained wrapper that resolves the element
          // (using querySelectorAll to keep the strict-mode indexing logic
          // identical to `evaluate`) and invokes the user's function.
          // Using `evaluateHandlePage` instead of `evaluatePage` makes the
          // result a CdpHandle instead of a serialized value.
          const fnSource = pageFunction.toString();
          const idxExpr = state.index === -1 ? "els.length - 1" : String(state.index);
          const errMsg = `No element at index ${state.index} for selector "${state.selector.replace(/"/g, '\\"')}"`;
          const selectorJson = JSON.stringify(state.selector);

          const wrapperCode = `
            const argVal = arguments[0];
            const els = document.querySelectorAll(${selectorJson});
            ${state.index === undefined ? `if (els.length === 0) throw new Error(${JSON.stringify(`No element matches selector "${state.selector}"`)});` : ""}
            const idx = ${idxExpr};
            const el = els[idx];
            if (!el) throw new Error(${JSON.stringify(errMsg)});
            const fn = (${fnSource});
            return fn(el, argVal);
          `;
          const wrapper = new Function(wrapperCode) as (...args: any[]) => Awaited<T>;

          return yield* evaluateHandlePage(ctx.connection, ctx.state, wrapper, arg);
        }),

      evaluateAll: (pageFunction, arg) => {
        // $$evalElements passes an array of all matches to fn. Index is
        // ignored — operates on all matches.
        return $$evalElements(
          ctx.connection,
          ctx.state,
          state.selector,
          pageFunction,
          arg as never,
        );
      },

      count: () =>
        Effect.map(
          $$evalElements<ReadonlyArray<Element>, never>(
            ctx.connection,
            ctx.state,
            state.selector,
            (els) => els,
          ),
          (els) => els.length,
        ),
    };
  };

  return build({ selector: initialSelector });
};
