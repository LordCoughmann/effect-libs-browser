/**
 * Session management for CDP page operations.
 */

import { Effect, Ref } from "effect";

import { CdpError, EvaluationError } from "../../CdpError.js";
import { type PageState } from "./PageState.js";

/**
 * Retrieves the current CDP session ID, failing with a {@link CdpError}
 * wrapping {@link EvaluationError} if the page has not been attached to a session yet.
 */
export const ensureSession = Effect.fn("CdpPage.ensureSession")(
  (state: PageState): Effect.Effect<string, CdpError> =>
    Ref.get(state.sessionId).pipe(
      Effect.flatMap((sid) =>
        sid
          ? Effect.succeed(sid)
          : Effect.fail(
              new CdpError({
                module: "CdpPage",
                method: "ensureSession",
                reason: new EvaluationError({ description: "Page not attached to session" }),
              }),
            ),
      ),
    ),
);
