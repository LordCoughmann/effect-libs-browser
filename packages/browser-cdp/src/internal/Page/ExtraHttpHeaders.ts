/**
 * Extra HTTP headers configuration for CDP page.
 *
 */

import type { CdpConnectionService } from "../CdpConnection.js";

import { Effect, Ref } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, CommandError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";

/** Helper to fail with CdpError wrapping CommandError. */
const failCommand = (method: string, description: string) =>
  Effect.fail(
    new CdpError({
      module: "CdpPage",
      method,
      reason: new CommandError({ method, description }),
    }),
  );

/**
 * Sets extra HTTP headers that will be sent with every request.
 *
 * Uses CDP `Network.setExtraHTTPHeaders` to add headers to all
 * subsequent requests. Overrides any previously set extra headers.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param headers - Record of header name-value pairs
 */
export const setExtraHTTPHeaders = Effect.fn("CdpPage.setExtraHTTPHeaders")(
  (
    conn: CdpConnectionService,
    state: PageState,
    headers: Record<string, string>,
  ): Effect.Effect<void, CdpError> =>
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);

      yield* conn.cdp.Network.setExtraHTTPHeaders({ headers }, sessionId).pipe(
        Effect.catch((cause: unknown) =>
          failCommand(
            "setExtraHTTPHeaders",
            `Failed to set extra HTTP headers: ${getErrorMessage(cause)}`,
          ),
        ),
      );

      // Track headers in state for conflict detection with goto({ referer })
      yield* Ref.set(state.extraHTTPHeaders, headers);
    }),
);
