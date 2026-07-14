/**
 * Page reload via CDP using FrameManager for navigation waiting.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";
import type { WaitUntil } from "../types.js";

import { Duration, Effect, Option, Ref, SubscriptionRef } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, NavigationError } from "../../CdpError.js";
import { attachToTarget } from "./AttachToTarget.js";
import { ensureSession } from "./EnsureSession.js";
import {
  waitForNavigationFrame,
  type NetworkIdleProvider,
  type FrameManager,
} from "./FrameManager.js";
import { type NetworkResponseTracker } from "./NetworkResponseTracker.js";
import { type PageState } from "./PageState.js";
import { makeResponse } from "./Response.js";

/** Map CDP errors to NavigationError for reload operations. */
const mapNavigationError = Effect.mapError(
  (cause: unknown) =>
    new CdpError({
      module: "CdpPage",
      method: "reload",
      reason: new NavigationError({
        url: "reload",
        description: getErrorMessage(cause),
      }),
    }),
);

/**
 * Reloads the page and waits for the specified load strategy.
 *
 * Uses FrameManager's epoch-based navigation tracking (always-on listeners).
 * Returns the navigation Response for the main document.
 *
 * @returns Response object with status, url, headers, etc., or Option.none() for internal URLs.
 */
export const reloadPage = Effect.fn("CdpPage.reload")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    frameManager: FrameManager,
    networkIdle: NetworkIdleProvider,
    responseTracker: NetworkResponseTracker,
    targetId: string,
    options?: { waitUntil?: WaitUntil; timeout?: Duration.Duration },
  ) =>
    Effect.gen(function* () {
      const sessionId = yield* Ref.get(state.sessionId);
      if (!sessionId) yield* attachToTarget(conn, state, targetId);

      const sid = yield* ensureSession(state);

      const waitUntil = Option.fromUndefinedOr(options?.waitUntil).pipe(
        Option.getOrElse(() => "load" as const),
      );
      const timeout = options?.timeout ?? Duration.seconds(30);

      // Enable Network domain BEFORE reloading for response tracking.
      // Protocol requirement: must be active before requests start.
      yield* conn.cdp.Network.enable({}, sid).pipe(
        Effect.mapError(
          (cause) =>
            new CdpError({
              module: "CdpPage",
              method: "reload",
              reason: new NavigationError({ url: "reload", description: String(cause) }),
            }),
        ),
      );

      // Snapshot before CDP call (handle pattern), then fire and await
      const frameId = yield* Ref.get(state.mainFrameId);
      const nav = waitForNavigationFrame(frameManager, frameId, waitUntil, {
        networkDetector: networkIdle,
        timeout,
      });
      yield* conn.cdp.Page.reload({}, sid).pipe(mapNavigationError);
      yield* nav;

      // Get the loaderId from the frame state after navigation
      const frameState = frameManager.getFrameState(frameId);
      if (!frameState) {
        return Option.none();
      }

      const currentState = yield* SubscriptionRef.get(frameState);
      const loaderId = Option.getOrNull(currentState.loaderId);
      if (!loaderId) {
        return Option.none();
      }

      // Get the current URL for response tracking
      const url = currentState.url;

      // Check if it's an internal URL (no network response)
      const isInternalUrl =
        url.startsWith("about:") ||
        url.startsWith("data:") ||
        url.startsWith("javascript:") ||
        url.startsWith("blob:") ||
        url.startsWith("file:");

      if (isInternalUrl) {
        return Option.none();
      }

      // Wait for response with a timeout to avoid hanging
      const responseData = yield* responseTracker.waitForNavigationResponse(loaderId, url).pipe(
        Effect.timeout("1 second"),
        Effect.catchTag("TimeoutError", () => Effect.void),
      );
      if (responseData) {
        return Option.some(makeResponse(conn, state, responseTracker, responseData));
      }

      // No response data available - return Option.none() as fallback
      return Option.none();
    }),
);
