/**
 * Network offline override for CDP page.
 *
 * Uses CDP `Network.emulateNetworkConditions` to make in-flight and new
 * network requests fail with `net::ERR_INTERNET_DISCONNECTED`. The
 * context-level {@link CdpContextHandle.setOffline} applies this to every
 * page in the context, mirroring Playwright's `BrowserContext.setOffline`
 * semantics.
 *
 * Playwright's `BrowserContext.setOffline(offline)` (see
 * `repos/cloudflare-playwright/packages/playwright-core/src/server/chromium/crBrowser.ts:501-505`,
 * `doUpdateOffline`) iterates the context's pages and applies
 * `Network.emulateNetworkConditions` to each. We follow the same shape
 * with a per-context Ref so subsequent pages opened in the context also
 * receive the offline state.
 *
 * Implementation notes:
 * - The CDP `Network.emulateNetworkConditions` call requires a session
 *   that has `Network.enable` activated. `Page.goto` activates it via the
 *   network event tracking, but for sessions that haven't navigated yet
 *   (e.g. a page opened via `withPage` before any goto), the call still
 *   succeeds because the protocol method only requires Network.enable on
 *   the target session, which `attachToTarget` performs implicitly.
 * - Other emulation params (latency, throughput) default to 0/-1 which
 *   matches the Playwright source.
 */

import type { CdpConnectionService } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, CommandError } from "../../CdpError.js";

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
 * Default values for `Network.emulateNetworkConditions` when enabling
 * offline. Mirrors Playwright's `NetworkManager.setOffline` defaults
 * (`networkManager.ts`): 0 latency, -1 throughput (no throttling) so the
 * only effect is the offline flag.
 */
const DEFAULT_LATENCY = 0;
const DEFAULT_THROUGHPUT = -1;

/**
 * Apply or clear an offline override to a single page session.
 *
 * Calls `Network.emulateNetworkConditions`. Pass `true` to make network
 * requests fail with `net::ERR_INTERNET_DISCONNECTED`; pass `false` to
 * restore normal connectivity.
 *
 * @param conn - CDP connection service
 * @param sessionId - Session ID of the target page
 * @param offline - Whether to enable the offline override
 */
export const applyOfflineOverride = (
  conn: CdpConnectionService,
  sessionId: string,
  offline: boolean,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    yield* conn.cdp.Network.emulateNetworkConditions(
      {
        offline,
        latency: DEFAULT_LATENCY,
        downloadThroughput: DEFAULT_THROUGHPUT,
        uploadThroughput: DEFAULT_THROUGHPUT,
      },
      sessionId,
    ).pipe(
      Effect.catch((cause: unknown) =>
        failCommand("setOffline", `Failed to set offline override: ${getErrorMessage(cause)}`),
      ),
    );
  });
