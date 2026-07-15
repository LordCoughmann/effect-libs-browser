/**
 * Element double-click via CDP.
 *
 * Uses CDP `Input.dispatchMouseEvent` to dispatch two mouse pressed/released events.
 * Uses Playwright-style retry: if element disappears between finding and
 * clicking, the entire operation is retried.
 *
 * When `trial: true`, runs actionability checks but does not dispatch clicks.
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

/** Options for dblclick operations. */
export interface DblclickOptions {
  readonly trial?: boolean;
  readonly timeout?: Duration.Duration;
}

const mapSelectorError = (selector: string, method = "dblclick") =>
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

/**
 * Double-clicks an element matching the selector.
 *
 * Uses CDP `Input.dispatchMouseEvent` with left button, two press/release cycles.
 * Retries the entire find + click operation if the element disappears.
 */
export const dblclickElement = Effect.fn("CdpPage.dblclick")((
  conn: CdpConnection["Service"],
  state: PageState,
  targetId: string,
  selector: string,
  options?: DblclickOptions,
) => {
  const timeout = options?.timeout ?? Duration.seconds(30);
  const trial = options?.trial ?? false;
  const methodName = trial ? "dblclick action (trial run)" : "dblclick";

  return Effect.gen(function* () {
    const sessionId = yield* Ref.get(state.sessionId);
    if (!sessionId) yield* attachToTarget(conn, state, targetId);

    yield* retryElementLoop(
      Effect.gen(function* () {
        const sid = yield* ensureSession(state);

        // Get element's bounding box
        const result = yield* conn.cdp.DOM.getDocument({}, sid).pipe(mapSelectorError(selector));

        const node = yield* conn.cdp.DOM.querySelector(
          {
            nodeId: result.root.nodeId,
            selector,
          },
          sid,
        ).pipe(mapSelectorError(selector));

        if (!node.nodeId) {
          // Element not found — signal retry
          return null;
        }

        const box = yield* conn.cdp.DOM.getBoxModel({ nodeId: node.nodeId }, sid).pipe(
          mapSelectorError(selector),
        );

        // Calculate center of element
        const [x1, y1, x2, y2, x3, y3, x4, y4] = box.model.border;
        const centerX = (x1 + x2 + x3 + x4) / 4;
        const centerY = (y1 + y2 + y3 + y4) / 4;

        // Trial mode: actionability passed, but do not click
        if (trial) return undefined;

        // First click
        yield* conn.cdp.Input.dispatchMouseEvent(
          {
            type: "mousePressed",
            x: centerX,
            y: centerY,
            button: "left",
            clickCount: 1,
          },
          sid,
        ).pipe(mapSelectorError(selector));

        yield* conn.cdp.Input.dispatchMouseEvent(
          {
            type: "mouseReleased",
            x: centerX,
            y: centerY,
            button: "left",
            clickCount: 1,
          },
          sid,
        ).pipe(mapSelectorError(selector));

        // Second click
        yield* conn.cdp.Input.dispatchMouseEvent(
          {
            type: "mousePressed",
            x: centerX,
            y: centerY,
            button: "left",
            clickCount: 2,
          },
          sid,
        ).pipe(mapSelectorError(selector));

        yield* conn.cdp.Input.dispatchMouseEvent(
          {
            type: "mouseReleased",
            x: centerX,
            y: centerY,
            button: "left",
            clickCount: 2,
          },
          sid,
        ).pipe(mapSelectorError(selector));

        return undefined;
      }),
      selector,
      timeout,
      methodName,
    );
  });
});
