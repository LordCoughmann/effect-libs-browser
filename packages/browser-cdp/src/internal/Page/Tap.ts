/**
 * Tap element operation via CDP.
 *
 * Touchscreen-equivalent of click — dispatches `touchStart` followed by
 * `touchEnd` at the element's center. Uses DOM.getContentQuads for
 * transform-aware coordinates (same approach as Click.ts).
 *
 * Mirrors Playwright's `page.tap(selector, options)` shape:
 * - `position` — tap at a specific point relative to the element's top-left
 * - `force` — skip actionability retry (one-shot tap)
 * - `trial` — run actionability without tapping
 * - `timeout` — wait for the element to appear
 *
 * Differences from `click`:
 * - Uses `Input.dispatchTouchEvent` (touchStart/touchEnd) instead of
 *   `Input.dispatchMouseEvent` (mouseMoved/mousePressed/mouseReleased)
 * - Single touch point at the tap coordinates; touchEnd has empty touchPoints
 *
 * Adapted from Playwright's `Frame.tap` /
 * `CRInput.tap` in
 * `repos/cloudflare-playwright/packages/playwright-core/src/server/chromium/crInput.ts`.
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Duration, Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, ConnectionError, isCdpError, SelectorError } from "../../CdpError.js";
import { type CdpConnectionError, type CdpTimeoutError } from "../CdpProtocolError.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";
import { retryElementLoop } from "./RetryWithElement.js";

/**
 * Options for tap operations (matches Playwright's TapOptions subset).
 *
 * - `position`: Tap at a specific point relative to the element's top-left.
 *   If omitted, the element center (quad centroid) is used.
 * - `force`: Skip actionability auto-waiting. Fails immediately if the
 *   element has no visible quads.
 * - `trial`: Run actionability retry but do not dispatch the touch events.
 * - `timeout`: Maximum wait time for the element to appear
 */
export interface TapOptions {
  readonly position?: { readonly x: number; y: number };
  readonly force?: boolean;
  readonly trial?: boolean;
  readonly timeout?: Duration.Duration;
}

/** Map errors to SelectorError for tap operations. */
const mapInteractionError = (selector: string, method = "tap") =>
  Effect.mapError(
    (cause: unknown) =>
      new CdpError({
        source: "CdpPage",
        method,
        reason: new SelectorError({
          selector,
          description: getErrorMessage(cause),
        }),
      }),
  );

/** Sum of the error types returned by the locator path. */
type DeepLocatorError = CdpError | CdpConnectionError | CdpTimeoutError;

/**
 * Wrap any non-CdpError returned by the locator path as a CdpError.
 * Mirrors Click.ts's `ensureCdpError`.
 */
const ensureCdpError = (err: DeepLocatorError): CdpError => {
  if (isCdpError(err)) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new CdpError({
    source: "CdpPage",
    method: "tap",
    reason: new ConnectionError({ description: message }),
  });
};

/**
 * Locates the element and computes the tap point using the same
 * shadow-DOM-piercing strategy as click. Returns `null` if not found
 * (retry signal).
 */
import { locateAndComputePoint } from "./Click.js";

/**
 * Dispatches the actual touch events (touchStart + touchEnd) for a tap.
 *
 * Mirrors Playwright's CRInput.tap which sends touchStart with the
 * touch point and touchEnd with empty touchPoints in parallel.
 */
const dispatchTap = (
  conn: CdpConnection["Service"],
  sessionId: string,
  selector: string,
  point: { readonly x: number; readonly y: number },
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    // touchStart: press at the tap point
    yield* conn.cdp.Input.dispatchTouchEvent(
      {
        type: "touchStart",
        touchPoints: [{ x: point.x, y: point.y }],
      },
      sessionId,
    ).pipe(mapInteractionError(selector));

    // touchEnd: release (empty touchPoints)
    yield* conn.cdp.Input.dispatchTouchEvent(
      {
        type: "touchEnd",
        touchPoints: [],
      },
      sessionId,
    ).pipe(mapInteractionError(selector));
  });

/**
 * Taps an element matching the selector.
 *
 * Uses CDP `Input.dispatchTouchEvent` for reliable tapping on touch-enabled
 * displays. Uses DOM.getContentQuads for accurate tap coordinates that
 * respect CSS transforms (same path as `clickElement`).
 *
 * Retries the entire find + tap operation if the element disappears
 * or is not actionable (unless `force` is set).
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param options - Tap options (position, force, trial, timeout)
 */
export const tapElement = Effect.fn("CdpPage.tap")((
  conn: CdpConnection["Service"],
  state: PageState,
  selector: string,
  options?: TapOptions,
) => {
  const timeout = options?.timeout ?? Duration.seconds(30);
  const force = options?.force ?? false;
  const trial = options?.trial ?? false;
  const position = options?.position;

  // Force mode: one-shot, no retry, no waiting for actionability.
  // Fails immediately if the element has no visible quads.
  if (force) {
    return Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);
      const point = yield* locateAndComputePoint(conn, state, sessionId, selector, position).pipe(
        Effect.mapError(ensureCdpError),
      );
      if (!point) {
        return yield* new CdpError({
          source: "CdpPage",
          method: "tap",
          reason: new SelectorError({
            selector,
            description: "Element is not visible",
          }),
        });
      }
      if (trial) return;
      yield* dispatchTap(conn, sessionId, selector, point);
    });
  }

  // Retry loop for normal + trial mode
  const methodName = trial ? "tap action (trial run)" : "tap";
  return retryElementLoop(
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);
      const point = yield* locateAndComputePoint(conn, state, sessionId, selector, position).pipe(
        Effect.mapError(ensureCdpError),
      );

      // No visible quads — retry signal (element may be display:none or off-screen)
      if (!point) {
        return null;
      }

      // Trial mode: actionability passed, but do not tap
      if (trial) return undefined;

      yield* dispatchTap(conn, sessionId, selector, point);

      return undefined;
    }),
    selector,
    timeout,
    methodName,
  );
});
