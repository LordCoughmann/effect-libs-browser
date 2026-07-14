/**
 * User Agent override for CDP page.
 *
 * Uses CDP `Emulation.setUserAgentOverride` to override the user agent
 * for a single page session. The context-level
 * {@link CdpContextHandle.setUserAgent} applies this to every page in the
 * context, mirroring Playwright's `BrowserContext.setUserAgent` semantics.
 */

import type { CdpConnectionService } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, CommandError } from "../../CdpError.js";
import { type UserAgentOverride } from "./UserAgent.js";

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
 * Apply a user-agent override to a single page session.
 *
 * Calls `Emulation.setUserAgentOverride`. The override affects both the
 * `User-Agent` request header and `navigator.userAgent` on the page.
 *
 * @param conn - CDP connection service
 * @param sessionId - Session ID of the target page
 * @param override - User agent override (string + optional client hints metadata)
 */
export const applyUserAgentOverride = (
  conn: CdpConnectionService,
  sessionId: string,
  override: UserAgentOverride,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    const params: Parameters<typeof conn.cdp.Emulation.setUserAgentOverride>[0] = {
      userAgent: override.userAgent,
    };
    if (override.userAgentMetadata) {
      params.userAgentMetadata = {
        ...(override.userAgentMetadata.brands && {
          brands: override.userAgentMetadata.brands.map((b) => ({ ...b })),
        }),
        ...(override.userAgentMetadata.fullVersionList && {
          fullVersionList: override.userAgentMetadata.fullVersionList.map((b) => ({ ...b })),
        }),
        platform: override.userAgentMetadata.platform,
        platformVersion: override.userAgentMetadata.platformVersion,
        architecture: override.userAgentMetadata.architecture,
        model: override.userAgentMetadata.model,
        mobile: override.userAgentMetadata.mobile,
        ...(override.userAgentMetadata.fullVersion !== undefined && {
          fullVersion: override.userAgentMetadata.fullVersion,
        }),
        ...(override.userAgentMetadata.bitness !== undefined && {
          bitness: override.userAgentMetadata.bitness,
        }),
        ...(override.userAgentMetadata.wow64 !== undefined && {
          wow64: override.userAgentMetadata.wow64,
        }),
      };
    }
    yield* conn.cdp.Emulation.setUserAgentOverride(params, sessionId).pipe(
      Effect.catch((cause: unknown) =>
        failCommand("setUserAgent", `Failed to set user agent override: ${getErrorMessage(cause)}`),
      ),
    );
  });
