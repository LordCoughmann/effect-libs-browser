/**
 * Element hover via CDP.
 *
 * Uses CDP `Input.dispatchMouseEvent` to move the mouse over an element.
 * Uses Playwright-style retry: if element disappears between finding and
 * hovering, the entire operation is retried.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Duration, Effect, Ref } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, SelectorError } from "../../CdpError.js";
import { attachToTarget } from "./AttachToTarget.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";
import { retryElementLoop } from "./RetryWithElement.js";

/** Map errors to SelectorError for hover operations. */
const mapInteractionError = (selector: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new CdpError({
        module: "CdpPage",
        method: "hover",
        reason: new SelectorError({
          selector,
          description: getErrorMessage(cause),
        }),
      }),
  );

/**
 * Hovers over an element matching the selector.
 *
 * Uses CDP `Input.dispatchMouseEvent` with `type: "mouseMoved"`.
 * Retries the entire find + hover operation if the element disappears.
 */
export const hoverElement = Effect.fn("CdpPage.hover")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    targetId: string,
    selector: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ) =>
    Effect.gen(function* () {
      const sessionId = yield* Ref.get(state.sessionId);
      if (!sessionId) yield* attachToTarget(conn, state, targetId);

      yield* retryElementLoop(
        Effect.gen(function* () {
          const sid = yield* ensureSession(state);

          // Get element's bounding box
          const result = yield* conn.cdp.DOM.getDocument({}, sid).pipe(
            mapInteractionError(selector),
          );

          const node = yield* conn.cdp.DOM.querySelector(
            {
              nodeId: result.root.nodeId,
              selector,
            },
            sid,
          ).pipe(mapInteractionError(selector));

          if (!node.nodeId) {
            // Element not found — signal retry
            return null;
          }

          // Scroll into view first (element may be offscreen)
          yield* conn.cdp.DOM.scrollIntoViewIfNeeded({ nodeId: node.nodeId }, sid).pipe(
            Effect.ignore,
          ); // Ignore scroll failures

          const box = yield* conn.cdp.DOM.getBoxModel({ nodeId: node.nodeId }, sid).pipe(
            mapInteractionError(selector),
          );

          // Calculate center of element
          const [x1, y1, x2, y2, x3, y3, x4, y4] = box.model.border;
          const centerX = (x1 + x2 + x3 + x4) / 4;
          const centerY = (y1 + y2 + y3 + y4) / 4;

          // Move mouse to element center
          yield* conn.cdp.Input.dispatchMouseEvent(
            {
              type: "mouseMoved",
              x: centerX,
              y: centerY,
            },
            sid,
          ).pipe(mapInteractionError(selector));

          return undefined;
        }),
        selector,
        timeout,
      );
    }),
);
