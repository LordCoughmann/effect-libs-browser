/**
 * Scroll an element into view via CDP.
 *
 * Uses `element.scrollIntoView()` directly (no special CDP API needed
 * \u2014 CDP doesn't expose a dedicated scrollIntoView method, and the
 * JS call is the canonical way). The element must already be attached
 * to the DOM (use `waitFor` first if needed).
 *
 * Idempotent: if the element is already in view, this is a no-op
 * (browsers don't scroll if the element is already fully visible).
 *
 * Does NOT wait for actionability beyond element resolution \u2014 the
 * selector must match exactly one element. Fails with `SelectorError`
 * on resolution failure.
 *
 * @internal
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, isCdpError, SelectorError } from "../../CdpError.js";
import { $evalElement } from "./EvalOnSelector.js";
import { type PageState } from "./PageState.js";

/** Map errors to SelectorError for scrollIntoView operations. */
const mapError = (selector: string) =>
  Effect.mapError((cause: unknown) => {
    let description = getErrorMessage(cause);
    if (isCdpError(cause) && "description" in cause.reason) {
      description = cause.reason.description;
    }
    return new CdpError({
      source: "CdpPage",
      method: "scrollIntoView",
      reason: new SelectorError({ selector, description }),
    });
  });

/**
 * Options for `scrollIntoView` (matches the standard `ScrollIntoViewOptions`
 * shape).
 */
export interface ScrollIntoViewOptions {
  /** Animation behavior. Default: `"auto"`. */
  readonly behavior?: "auto" | "smooth" | "instant";
  /** Vertical alignment. Default: `"start"`. */
  readonly block?: ScrollLogicalPosition;
  /** Horizontal alignment. Default: `"nearest"`. */
  readonly inline?: ScrollLogicalPosition;
}

/**
 * Scrolls the first element matching `selector` into view.
 *
 * ```typescript
 * yield* scrollIntoView(conn, state, "#submit-button");
 * ```
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the target element
 * @param options - Optional scrollIntoView options (behavior, block, inline)
 */
export const scrollIntoView = Effect.fn("CdpPage.scrollIntoView")(function (
  conn: CdpConnection["Service"],
  state: PageState,
  selector: string,
  options?: ScrollIntoViewOptions,
) {
  // Build a wrapper that takes 2 args (el, opts). When options is
  // undefined, pass null as opts so the wrapper always runs the
  // 2-arg path. `element.scrollIntoView(null)` is equivalent to
  // `element.scrollIntoView()` (browser defaults).
  //
  // We always go through the 2-arg path because $evalElement's
  // `hasArg` check controls wrapper arity \u2014 a single wrapper shape
  // keeps serialization predictable.
  const wrapper = new Function("el", "opts", `el.scrollIntoView(opts); return true;`) as (
    el: Element,
    opts: ScrollIntoViewOptions | null,
  ) => boolean;

  return $evalElement<boolean, ScrollIntoViewOptions | null>(
    conn,
    state,
    selector,
    wrapper,
    options ?? null,
  ).pipe(mapError(selector));
});
