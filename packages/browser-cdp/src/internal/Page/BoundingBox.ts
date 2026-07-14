/**
 * Get an element's bounding box (x, y, width, height) via the browser.
 *
 * Returns `null` when the element is not in the layout (offsetWidth /
 * offsetHeight are both 0 \u2014 the standard "element has no visible size"
 * signal that Playwright also uses for `boundingBox`).
 *
 * Implementation: uses `getBoundingClientRect()` via `evaluatePage`.
 * This is simpler and faster than the CDP `DOM.getBoxModel` path
 * (which requires resolving the selector to a `nodeId` first via
 * `DOM.querySelector`). It also matches Playwright's behavior
 * exactly: Playwright also uses `getBoundingClientRect` for
 * `boundingBox()`.
 *
 * Note: returns `null` for elements with `display: none`, `visibility:
 * hidden`, or that are otherwise detached from the layout. For a
 * boolean visibility check, use `isVisible()` instead.
 *
 * @internal
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, isCdpError, SelectorError } from "../../CdpError.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

/** Map errors to SelectorError for boundingBox operations. */
const mapError = (selector: string) =>
  Effect.mapError((cause: unknown) => {
    let description = getErrorMessage(cause);
    if (isCdpError(cause) && "description" in cause.reason) {
      description = cause.reason.description;
    }
    return new CdpError({
      module: "CdpPage",
      method: "boundingBox",
      reason: new SelectorError({ selector, description }),
    });
  });

/**
 * Bounding box returned by `boundingBox`. Coordinates are CSS pixels,
 * relative to the document (NOT the viewport).
 */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Get the bounding box of the first element matching `selector`.
 *
 * ```typescript
 * const box = yield* boundingBox(conn, state, "#submit-button");
 * if (box) console.log(box.x, box.y, box.width, box.height);
 * ```
 *
 * Returns `null` when no element matches, when more than one element
 * matches (use a more specific selector), or when the resolved element
 * has zero width/height (display:none, etc.).
 *
 * @param conn - CDP connection service
 * @param state - Page state
 * @param selector - CSS selector for the target element
 * @param index - Optional index of the element to resolve (0-based,
 *   -1 for last, undefined for single-match required).
 */
export const boundingBox = Effect.fn("CdpPage.boundingBox")(function (
  conn: CdpConnection["Service"],
  state: PageState,
  selector: string,
  index?: number,
): Effect.Effect<BoundingBox | null, CdpError> {
  // Resolve the element via document.querySelectorAll, fetch its
  // bounding rect, and return either the boxed value or null.
  //
  // For indexed locators (index !== undefined), pick the element at
  // that index (or fail with null if out of bounds). For non-indexed
  // locators, follow Playwright's strict-mode semantics: exactly one
  // match required, otherwise null.
  //
  // Hidden elements (offsetWidth/offsetHeight === 0) also return null.
  //
  // The wrapper is a regular function — the P6 refactor of
  // evaluatePage uses Runtime.callFunctionOn, which expects a
  // function (with `return` semantics) rather than a top-level
  // expression.
  const wrapper = new Function(
    "args",
    `const { sel, idx } = args;
    const els = document.querySelectorAll(sel);
    if (els.length === 0) return null;
    let el;
    if (idx === null || idx === undefined) {
      if (els.length !== 1) return null;
      el = els[0];
    } else {
      const i = idx === -1 ? els.length - 1 : idx;
      if (i < 0 || i >= els.length) return null;
      el = els[i];
    }
    if (!(el instanceof Element)) return null;
    if (el.offsetWidth === 0 || el.offsetHeight === 0) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };`,
  ) as (args: { sel: string; idx: number | null }) => BoundingBox | null;

  const arg = { sel: selector, idx: index ?? null };
  return evaluatePage<BoundingBox | null>(conn, state, wrapper, arg).pipe(mapError(selector));
});
