/**
 * Browser history navigation (goBack / goForward) via CDP using FrameManager.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";
import type { WaitUntil } from "../types.js";

import { Duration, Effect, Option, Ref } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, NavigationError } from "../../CdpError.js";
import { attachToTarget } from "./AttachToTarget.js";
import { ensureSession } from "./EnsureSession.js";
import {
  waitForNavigationFrame,
  type NetworkIdleProvider,
  type FrameManager,
} from "./FrameManager.js";
import { type PageState } from "./PageState.js";

/** Map CDP errors to NavigationError for history navigation. */
const mapNavigationError = (method: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new CdpError({
        source: "CdpPage",
        method,
        reason: new NavigationError({
          url: method,
          description: getErrorMessage(cause),
        }),
      }),
  );

/**
 * Navigate to a history entry by delta offset.
 */
const goDelta = (
  conn: CdpConnection["Service"],
  state: PageState,
  frameManager: FrameManager,
  networkIdle: NetworkIdleProvider,
  targetId: string,
  delta: number,
  method: string,
  options?: { waitUntil?: WaitUntil; timeout?: Duration.Duration },
) =>
  Effect.gen(function* () {
    const sessionId = yield* Ref.get(state.sessionId);
    if (!sessionId) yield* attachToTarget(conn, state, targetId);

    const sid = yield* ensureSession(state);

    const history = yield* conn.cdp.Page.getNavigationHistory({}, sid).pipe(
      mapNavigationError(method),
    );

    const entry = history.entries[history.currentIndex + delta];
    if (!entry) return false;

    const waitUntil = Option.fromUndefinedOr(options?.waitUntil).pipe(
      Option.getOrElse(() => "commit" as const),
    );
    const timeout = options?.timeout ?? Duration.seconds(30);

    // Enable Network domain BEFORE navigating when tracking network idle.
    if (waitUntil === "networkidle") {
      yield* conn.cdp.Network.enable({}, sid).pipe(
        Effect.mapError(
          (cause) =>
            new CdpError({
              source: "CdpPage",
              method,
              reason: new NavigationError({ url: method, description: String(cause) }),
            }),
        ),
      );
    }

    // Fire navigation and wait — FrameManager is always listening
    // Snapshot before CDP call (handle pattern), then fire and await
    const frameId = yield* Ref.get(state.mainFrameId);
    const nav = waitForNavigationFrame(frameManager, frameId, waitUntil, {
      networkDetector: networkIdle,
      timeout,
    });
    yield* conn.cdp.Page.navigateToHistoryEntry({ entryId: entry.id }, sid).pipe(
      mapNavigationError(method),
    );
    yield* nav;

    return true;
  });

/**
 * Navigate to the previous page in browser history.
 */
export const goBackPage = Effect.fn("CdpPage.goBack")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    frameManager: FrameManager,
    networkIdle: NetworkIdleProvider,
    targetId: string,
    options?: { waitUntil?: WaitUntil; timeout?: Duration.Duration },
  ) => goDelta(conn, state, frameManager, networkIdle, targetId, -1, "goBack", options),
);

/**
 * Navigate to the next page in browser history.
 */
export const goForwardPage = Effect.fn("CdpPage.goForward")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    frameManager: FrameManager,
    networkIdle: NetworkIdleProvider,
    targetId: string,
    options?: { waitUntil?: WaitUntil; timeout?: Duration.Duration },
  ) => goDelta(conn, state, frameManager, networkIdle, targetId, +1, "goForward", options),
);
