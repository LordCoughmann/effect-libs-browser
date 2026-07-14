/**
 * SDK for the Cloudflare Browser Run binding provider.
 *
 * Wraps the `@cloudflare/playwright` binding operations (`limits`,
 * `sessions`, `history`, `acquire`) plus the raw browser endpoint
 * binding (`env.MYBROWSER`). See the {@link CfBrowserRunBindingProvider}
 * class for the consumer-facing documentation.
 *
 * @category providers
 */

import type {
  AcquireResponse,
  ActiveSession,
  ClosedSession,
  LimitsResponse,
} from "@effect-libs/cloudflare-playwright";

import {
  type BrowserEndpoint,
  type WorkersLaunchOptions,
  acquire,
  history,
  limits,
  sessions,
} from "@effect-libs/cloudflare-playwright";

// ── SDK Interface ─────────────────────────────────────────────────────────────

/**
 * SDK handle for the Cloudflare Browser Run binding provider.
 *
 * Exposes the raw browser endpoint binding (`env.MYBROWSER`) plus the
 * binding operations from `@cloudflare/playwright` — `limits`,
 * `sessions`, `history`, `acquire` — pre-bound to the endpoint. The
 * binding is the native Workers path and does not wrap the `cloudflare`
 * HTTP SDK.
 *
 * @category providers
 * @since 0.1.0
 */
export interface CfBrowserRunBindingSdk {
  /** The raw browser endpoint binding (`env.MYBROWSER`). */
  readonly endpoint: BrowserEndpoint;

  /** Get current browser binding limits. */
  limits(): Promise<LimitsResponse>;

  /** List active browser sessions. */
  sessions(): Promise<ActiveSession[]>;

  /** Get recent session history (active and closed). */
  history(): Promise<ClosedSession[]>;

  /** Acquire a new browser session. */
  acquire(options?: WorkersLaunchOptions): Promise<AcquireResponse>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a binding SDK from the browser endpoint.
 *
 * Pre-binds `@cloudflare/playwright` operations to the endpoint. Use
 * via the provider's `use` method — direct use of this factory is
 * for tests and custom provider implementations.
 *
 * @category utilities
 * @since 0.1.0
 */
export const makeCfBrowserRunBindingSdk = (endpoint: BrowserEndpoint): CfBrowserRunBindingSdk => ({
  endpoint,
  limits: () => limits(endpoint),
  sessions: () => sessions(endpoint),
  history: () => history(endpoint),
  acquire: (options) => acquire(endpoint, options),
});
