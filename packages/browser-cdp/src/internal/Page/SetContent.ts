/**
 * Set page content via CDP.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";
import type { WaitUntil } from "../types.js";

import { Duration, Effect, Ref, SubscriptionRef } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, NavigationError } from "../../CdpError.js";
import { attachToTarget } from "./AttachToTarget.js";
import { ensureSession } from "./EnsureSession.js";
import { waitForNavEpoch, type NetworkIdleProvider, type FrameManager } from "./FrameManager.js";
import { type PageState } from "./PageState.js";

/** Map CDP errors to NavigationError for setContent operations. */
const mapNavigationError = Effect.mapError(
  (cause: unknown) =>
    new CdpError({
      module: "CdpPage",
      method: "setContent",
      reason: new NavigationError({
        url: "setContent",
        description: getErrorMessage(cause),
      }),
    }),
);

/**
 * Sets the HTML content of the page and optionally waits for the specified load state.
 *
 * Matches Playwright's implementation: uses `document.open()` / `document.write()`
 * / `document.close()` evaluated in the utility world instead of CDP's
 * `Page.setDocumentContent`. This preserves execution contexts (including the
 * utility world with its serializer code).
 *
 * ## How it works
 *
 * 1. Clear lifecycle events (reset for the new document)
 * 2. Evaluate `document.open(); document.write(html); document.close()` in the
 *    utility world — `document.open()` triggers `Page.documentOpened` (navCount++)
 * 3. Wait for navigation epoch (navCount + lifecycle events)
 */
export const setContentPage = Effect.fn("CdpPage.setContent")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    frameManager: FrameManager,
    networkIdle: NetworkIdleProvider,
    targetId: string,
    html: string,
    options?: { waitUntil?: WaitUntil; timeout?: Duration.Duration },
  ) =>
    Effect.gen(function* () {
      const sessionId = yield* Ref.get(state.sessionId);
      if (!sessionId) yield* attachToTarget(conn, state, targetId);

      const sid = yield* ensureSession(state);
      const frameId = yield* Ref.get(state.mainFrameId);

      const waitUntil = options?.waitUntil ?? "load";
      const lifecycleTarget: WaitUntil = waitUntil === "networkidle" ? "load" : waitUntil;
      const timeout = options?.timeout ?? Duration.seconds(30);

      // Enable Network domain BEFORE setting content when tracking network idle.
      if (waitUntil === "networkidle") {
        yield* conn.cdp.Network.enable({}, sid).pipe(mapNavigationError);
      }

      // Wait for the utility context to be available (has serializer code injected).
      yield* frameManager.waitForExecutionContext(frameId, "utility");

      // Get the utility context ID for evaluation.
      const contextId = yield* frameManager.getUtilityContextId(frameId);
      if (contextId === null) {
        return yield* new CdpError({
          module: "CdpPage",
          method: "setContent",
          reason: new NavigationError({
            url: "setContent",
            description: "No utility context available",
          }),
        });
      }

      // Snapshot BEFORE the operation.
      const stateRef = frameManager.getFrameState(frameId);
      const preNavCount = stateRef ? (yield* SubscriptionRef.get(stateRef)).navCount : 0;

      // Clear lifecycle events BEFORE document.open() — the new document
      // will get fresh lifecycle events from the browser.
      yield* frameManager.onClearLifecycle(frameId);

      // Evaluate document.open/write/close in the utility world.
      // document.open() triggers Page.documentOpened → increments navCount.
      // document.close() triggers DOMContentLoaded + load lifecycle events.
      yield* conn.cdp.Runtime.callFunctionOn(
        {
          functionDeclaration: `function() { document.open(); document.write(${JSON.stringify(html)}); document.close(); }`,
          executionContextId: contextId,
          returnByValue: true,
        },
        sid,
      ).pipe(mapNavigationError);

      // No frame state — just return (shouldn't happen in practice)
      if (!stateRef) return;

      // Wait for lifecycle events to fire (DOMContentLoaded/load).
      // document.open() increments navCount via Page.documentOpened.
      yield* waitForNavEpoch(stateRef, {
        method: "setContent",
        targetNav: preNavCount + 1,
        lifecycleTarget,
        timeout,
      });

      // For networkidle, additionally wait for network to settle
      if (waitUntil === "networkidle") {
        yield* networkIdle.waitForIdleNoInitial().pipe(
          Effect.timeout(timeout),
          Effect.mapError(
            () =>
              new CdpError({
                module: "CdpPage",
                method: "setContent",
                reason: new NavigationError({
                  url: "setContent",
                  description: `Timed out after ${Duration.format(timeout)} waiting for networkidle`,
                }),
              }),
          ),
        );
      }
    }),
);
