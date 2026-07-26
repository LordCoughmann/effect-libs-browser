/**
 * Dispatch synthetic DOM events on an element.
 *
 * Mirrors Playwright's `page.dispatchEvent(selector, type, eventInit?)` but
 * without ElementHandle — just resolves the selector and dispatches.
 *
 * Uses `element.dispatchEvent(new Event(type, eventInit))`. The `eventInit`
 * is the standard `EventInit` dict (`{ bubbles, cancelable, composed }` etc.)
 * plus event-type-specific fields like `data` for `MessageEvent`.
 *
 * **Does NOT wait for the element** — fails immediately if no element matches.
 * Use `waitForSelector` before `dispatchEvent` if you need to wait.
 *
 * If multiple elements match, dispatches on the first one. Use a more
 * specific selector for strict mode.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, isCdpError, SelectorError } from "../../CdpError.js";
import { $evalElement } from "./EvalOnSelector.js";
import { type PageState } from "./PageState.js";

/** Map errors to SelectorError for dispatchEvent operations. */
const mapError = (selector: string) =>
  Effect.mapError((cause: unknown) => {
    let description = getErrorMessage(cause);
    if (isCdpError(cause) && "description" in cause.reason) {
      description = cause.reason.description;
    }
    return new CdpError({
      source: "CdpPage",
      method: "dispatchEvent",
      reason: new SelectorError({ selector, description }),
    });
  });

/**
 * Map of event types that require a specialised constructor (so init-time
 * properties like `deltaX` are preserved). For all other types we fall
 * back to the generic `Event` constructor.
 *
 * DeviceOrientationEvent / DeviceMotionEvent are NOT in this map because
 * Chromium's constructors ignore init params (managed by the sensor
 * subsystem) — see NOT_PLANNED entries in the parity tests.
 */
const SPECIALIZED_EVENT_CONSTRUCTORS: Record<string, string> = {
  wheel: "WheelEvent",
  popstate: "PopStateEvent",
  hashchange: "HashChangeEvent",
  storage: "StorageEvent",
};

/**
 * Dispatches a synthetic DOM event on the first element matching the selector.
 *
 * ```typescript
 * yield* page.dispatchEvent("button.submit", "click");
 * yield* page.dispatchEvent("input", "input", { bubbles: true });
 * ```
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the target element
 * @param type - DOM event type (e.g. `"click"`, `"input"`, `"change"`)
 * @param eventInit - Optional `EventInit` properties
 */
export const dispatchEvent = Effect.fn("CdpPage.dispatchEvent")(function (
  conn: CdpConnection["Service"],
  state: PageState,
  selector: string,
  type: string,
  eventInit?: Record<string, unknown>,
) {
  return Effect.gen(function* () {
    // Build a self-contained wrapper that doesn't capture closure refs
    // (the wrapper is serialized and sent to the browser).
    //
    // We pass `el` and `init` as named parameters to `new Function` rather than
    // wrapping the body in an arrow function expression. With the arrow
    // wrapper, `new Function("((el, init) => { ... })").toString()` produces
    // an outer `function anonymous() { <arrow-expression-statement> }` — the
    // arrow is a statement that gets evaluated and discarded, never called.
    // Passing the params + body directly makes the params first-class
    // parameters of the generated function.
    //
    // Mirrors Playwright's default EventInit: { bubbles, cancelable, composed }
    // all default to true so events fire reliably across browsers/versions.
    // A bare `new Event("click", {})` does NOT fire addEventListener handlers
    // in some Chromium versions (verified in CDP integration tests).
    //
    // Some event types (wheel, etc.) need a specialised constructor so init-time
    // properties like `deltaX` are preserved on the resulting event object.
    // We dispatch on the SPECIALIZED_EVENT_CONSTRUCTORS map; unknown types
    // fall back to `Event`. Note: DeviceOrientationEvent / DeviceMotionEvent
    // constructors ignore their init params in Chromium, so those events are
    // NOT_PLANNED (marked in the parity tests).
    const ctorName = SPECIALIZED_EVENT_CONSTRUCTORS[type] ?? "Event";
    const bodyCode = `
      const opts = Object.assign({ bubbles: true, cancelable: true, composed: true }, init || {});
      const Ctor = (typeof ${ctorName} !== "undefined") ? ${ctorName} : Event;
      const event = new Ctor(${JSON.stringify(type)}, opts);
      el.dispatchEvent(event);
      return true;
    `;
    const wrapper = new Function("el", "init", bodyCode) as (
      el: Element,
      init: Record<string, unknown> | undefined,
    ) => boolean;

    yield* $evalElement<boolean, Record<string, unknown> | undefined>(
      conn,
      state,
      selector,
      wrapper,
      eventInit,
    ).pipe(mapError(selector));
  });
});
