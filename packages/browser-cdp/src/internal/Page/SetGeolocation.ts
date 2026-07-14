/**
 * Geolocation override for CDP page.
 *
 * Uses CDP `Emulation.setGeolocationOverride` to override the geolocation
 * for a single page session. The context-level
 * {@link CdpContextHandle.setGeolocation} applies this to every page in the
 * context, mirroring Playwright's `BrowserContext.setGeolocation` semantics.
 */

import type { CdpConnectionService } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, CommandError } from "../../CdpError.js";
import { type Geolocation } from "./Geolocation.js";

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
 * Apply a geolocation override to a single page session.
 *
 * Calls `Emulation.setGeolocationOverride`. Pass `undefined` to clear the
 * override (the browser will then report position unavailable from
 * `navigator.geolocation`).
 *
 * @param conn - CDP connection service
 * @param sessionId - Session ID of the target page
 * @param override - Geolocation override, or `undefined` to clear.
 */
export const applyGeolocationOverride = (
  conn: CdpConnectionService,
  sessionId: string,
  override: Geolocation | undefined,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    yield* conn.cdp.Emulation.setGeolocationOverride(
      override === undefined
        ? {}
        : {
            latitude: override.latitude,
            longitude: override.longitude,
            // CDP `Emulation.setGeolocationOverride` says: "Omitting latitude,
            // longitude or accuracy emulates position unavailable." So we
            // always include accuracy — default to 0 (exact) when the user
            // did not provide one, matching Playwright's `verifyGeolocation`
            // (`browserContext.ts:770`) which sets `accuracy = accuracy || 0`.
            accuracy: override.accuracy ?? 0,
          },
      sessionId,
    ).pipe(
      Effect.catch((cause: unknown) =>
        failCommand(
          "setGeolocation",
          `Failed to set geolocation override: ${getErrorMessage(cause)}`,
        ),
      ),
    );
  });
