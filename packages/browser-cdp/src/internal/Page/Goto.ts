/**
 * Page navigation via CDP using FrameManager for navigation waiting.
 *
 */

import type { Protocol } from "devtools-protocol";

import type { CdpConnection } from "../CdpConnection.js";
import type { WaitUntil } from "../types.js";

import { Duration, Effect, Option, Ref } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, NavigationError, PageTimeoutError, CommandError } from "../../CdpError.js";
import { attachToTarget } from "./AttachToTarget.js";
import { ensureSession } from "./EnsureSession.js";
import {
  waitForNavigationFrame,
  type NetworkIdleProvider,
  type FrameManager,
} from "./FrameManager.js";
import { type NetworkResponseTracker } from "./NetworkResponseTracker.js";
import { type PageState } from "./PageState.js";
import { makeResponse, type Response } from "./Response.js";

// fallow-ignore-next-line unused-type
export type { WaitUntil };
export type { Response };

/** Map CDP errors to NavigationError for goto operations. */
const mapNavigationError = (url: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new CdpError({
        source: "CdpPage",
        method: "goto",
        reason: new NavigationError({
          url,
          description: getErrorMessage(cause),
        }),
      }),
  );

/**
 * Navigates the page to a URL and waits for the specified load strategy.
 *
 * Uses FrameManager's epoch-based navigation tracking (always-on listeners).
 * No manual subscription needed — FrameManager tracks navigation state continuously.
 *
 * The timeout covers the ENTIRE operation: sending `Page.navigate` AND waiting
 * for the navigation lifecycle. This matches Playwright's `progress.race()` pattern
 * where a single timeout races against all async work.
 *
 * The race condition is handled by waitForNavEpoch, which subscribes to state
 * changes BEFORE checking the current state, ensuring no events are missed even
 * for fast navigations (localhost redirect chains).
 *
 * @returns Response object with status, url, headers, etc.
 */
export const gotoPage = Effect.fn("CdpPage.goto")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    frameManager: FrameManager,
    networkIdle: NetworkIdleProvider,
    responseTracker: NetworkResponseTracker,
    targetId: string,
    url: string,
    options?: {
      waitUntil?: WaitUntil;
      timeout?: Duration.Duration;
      /** Frame ID for frame-level navigation. Defaults to main frame. */
      frameId?: string;
      /** Referer header to send with the navigation request. */
      referer?: string;
    },
  ) =>
    Effect.gen(function* () {
      const sessionId = yield* Ref.get(state.sessionId);
      if (!sessionId) yield* attachToTarget(conn, state, targetId);

      const sid = yield* ensureSession(state);

      const waitUntil = Option.fromUndefinedOr(options?.waitUntil).pipe(
        Option.getOrElse(() => "load" as const),
      );
      const timeout = options?.timeout ?? Duration.seconds(30);

      // Enable Network domain BEFORE navigating for response tracking.
      // Protocol requirement: must be active before requests start.
      // Required for both networkidle and response tracking.
      yield* conn.cdp.Network.enable({}, sid).pipe(
        Effect.mapError(
          (cause) =>
            new CdpError({
              source: "CdpPage",
              method: "goto",
              reason: new NavigationError({ url, description: String(cause) }),
            }),
        ),
      );

      // Handle referer option - check for conflict with setExtraHTTPHeaders
      if (options?.referer !== undefined) {
        const existingHeaders = yield* Ref.get(state.extraHTTPHeaders);
        // HTTP headers are case-insensitive, check for 'referer' in any case
        const hasExistingReferer =
          existingHeaders &&
          Object.keys(existingHeaders).some((key) => key.toLowerCase() === "referer");
        if (hasExistingReferer) {
          return yield* new CdpError({
            source: "CdpPage",
            method: "goto",
            reason: new CommandError({
              method: "goto",
              description: `"referer" is already specified as extra HTTP header`,
            }),
          });
        }
      }

      // Snapshot before CDP call (handle pattern), then fire and await.
      // The handle captures targetNav in its closure — no race condition.
      // waitForNavEpoch subscribes to changes FIRST, then checks current state,
      // ensuring no events are missed even for fast navigations.
      const frameId = options?.frameId ?? (yield* Ref.get(state.mainFrameId));
      const nav = waitForNavigationFrame(frameManager, frameId, waitUntil, {
        networkDetector: networkIdle,
        timeout,
      });

      // Send Page.navigate, then await the nav handle.
      // Wrap the ENTIRE operation in a timeout — this is critical because
      // Page.navigate itself can hang when the server doesn't respond
      // (Chrome doesn't acknowledge the navigate until the response arrives).
      // Use Effect.timeout (raceFirst-based) so the timeout fires regardless
      // of whether the navigation side succeeds or fails.
      const response = yield* Effect.gen(function* () {
        // Build Page.navigate params
        // Note: Pass referer directly to Page.navigate with referrerPolicy: 'unsafeUrl'
        // to allow cross-protocol referers (HTTPS -> HTTP). This matches Playwright's approach.
        // See: https://github.com/microsoft/playwright/blob/packages/playwright-core/src/server/chromium/crPage.ts
        const navParams: {
          url: string;
          frameId?: string;
          referrer?: string;
          referrerPolicy?: Protocol.Page.ReferrerPolicy;
        } = { url, frameId: options?.frameId };

        if (options?.referer !== undefined) {
          navParams.referrer = options.referer;
          navParams.referrerPolicy = "unsafeUrl";
        }

        const navResult = yield* conn.cdp.Page.navigate(navParams, sid).pipe(
          mapNavigationError(url),
        );

        // CDP returns errorText when navigation fails (e.g., net::ERR_CONNECTION_REFUSED)
        if (navResult.errorText) {
          return yield* new CdpError({
            source: "CdpPage",
            method: "goto",
            reason: new NavigationError({ url, description: navResult.errorText }),
          });
        }

        // Await the navigation waiter.
        // waitForNavEpoch has already subscribed to state changes,
        // so events won't be missed even if navigation completes quickly.
        yield* nav;

        // Wait for the response (correlated by loaderId from Page.navigate)
        // The loaderId from Page.navigate matches the one in Network.responseReceived
        // for the main document request.
        //
        // Browser-internal URLs (about:, data:, javascript:, blob:, file:) have no
        // network response. Return Option.none() to match Playwright behavior.
        const loaderId = navResult.loaderId;
        const isInternalUrl =
          url.startsWith("about:") ||
          url.startsWith("data:") ||
          url.startsWith("javascript:") ||
          url.startsWith("blob:") ||
          url.startsWith("file:");

        if (isInternalUrl) {
          return Option.none();
        }

        if (loaderId) {
          // Wait for response with a timeout to avoid hanging
          const responseData = yield* responseTracker.waitForNavigationResponse(loaderId, url).pipe(
            Effect.timeout("1 second"),
            Effect.catchTag("TimeoutError", () => Effect.void),
          );
          if (responseData) {
            return Option.some(makeResponse(conn, state, responseTracker, responseData));
          }
        }

        // No response data available - should not happen for HTTP URLs
        // Return Option.none() as fallback
        return Option.none();
      }).pipe(
        Effect.timeout(timeout),
        Effect.catchTag("TimeoutError", () =>
          Effect.fail(
            new CdpError({
              source: "CdpPage",
              method: "goto",
              reason: new PageTimeoutError({ timeout }),
            }),
          ),
        ),
      );

      return response;
    }),
);
