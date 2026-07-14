/**
 * Target attachment for CDP page operations.
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect, Ref } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, ConnectionError } from "../../CdpError.js";
import { UTILITY_WORLD_NAME } from "./FrameManager.js";
import { type PageState } from "./PageState.js";

/**
 * Attaches a CDP session to the given target if one has not already been
 * established. After attaching, enables the `Page` and `Runtime` domains
 * so lifecycle and execution context events are delivered. Also creates
 * a utility isolated world for internal evaluations (following Playwright's
 * pattern — internal operations like `page.title()` use the utility world
 * to avoid timing issues with the main world).
 */
export const attachToTarget = Effect.fn("CdpPage.attachToTarget")(
  (conn: CdpConnection["Service"], state: PageState, targetId: string) =>
    Effect.gen(function* () {
      const current = yield* Ref.get(state.sessionId);
      if (current) return;

      const result = yield* conn.cdp.Target.attachToTarget({ targetId, flatten: true }).pipe(
        Effect.mapError(
          (cause) =>
            new CdpError({
              module: "CdpPage",
              method: "attachToTarget",
              reason: new ConnectionError({
                description: `Failed to attach to target: ${getErrorMessage(cause)}`,
                cause,
              }),
            }),
        ),
      );

      if (!result.sessionId) {
        return yield* new CdpError({
          module: "CdpPage",
          method: "attachToTarget",
          reason: new ConnectionError({
            description: "Target.attachToTarget returned no sessionId",
          }),
        });
      }

      yield* Ref.set(state.sessionId, result.sessionId);

      yield* conn.cdp.Page.enable({}, result.sessionId).pipe(
        Effect.mapError(
          (cause) =>
            new CdpError({
              module: "CdpPage",
              method: "attachToTarget",
              reason: new ConnectionError({
                description: `Failed to enable Page domain: ${getErrorMessage(cause)}`,
                cause,
              }),
            }),
        ),
      );

      // Enable lifecycle events so Page.lifecycleEvent is delivered.
      // Playwright uses this instead of the old Page.loadEventFired / Page.domContentEventFired.
      yield* conn.cdp.Page.setLifecycleEventsEnabled({ enabled: true }, result.sessionId).pipe(
        Effect.mapError(
          (cause) =>
            new CdpError({
              module: "CdpPage",
              method: "attachToTarget",
              reason: new ConnectionError({
                description: `Failed to enable lifecycle events: ${getErrorMessage(cause)}`,
                cause,
              }),
            }),
        ),
      );

      // Enable Runtime domain so execution context events are delivered.
      // This is required for execution context tracking — Runtime.evaluate
      // will wait for the context to be available before sending commands.
      yield* conn.cdp.Runtime.enable({}, result.sessionId).pipe(
        Effect.mapError(
          (cause) =>
            new CdpError({
              module: "CdpPage",
              method: "attachToTarget",
              reason: new ConnectionError({
                description: `Failed to enable Runtime domain: ${getErrorMessage(cause)}`,
                cause,
              }),
            }),
        ),
      );

      // Create an isolated "utility world" for internal evaluations.
      // Following Playwright's pattern: internal operations like page.title()
      // use this separate execution context. The utility world is created AFTER
      // the main world, giving the HTML parser more time to process <title>
      // before we evaluate document.title.
      //
      // We use _sendMayFail in Playwright — here we just catch and ignore errors
      // since the frame may not exist yet or the world may already be created.
      yield* conn.cdp.Page.createIsolatedWorld(
        { frameId: targetId, grantUniveralAccess: true, worldName: UTILITY_WORLD_NAME },
        result.sessionId,
      ).pipe(Effect.catch(() => Effect.void));

      // Register an empty script to evaluate on new documents in the utility world.
      // This ensures the utility world is automatically re-created by the browser
      // for each new document (navigation). Without this, the utility world would
      // only exist for the initial page load.
      yield* conn.cdp.Page.addScriptToEvaluateOnNewDocument(
        { source: "", worldName: UTILITY_WORLD_NAME },
        result.sessionId,
      ).pipe(Effect.catch(() => Effect.void));
    }),
);
