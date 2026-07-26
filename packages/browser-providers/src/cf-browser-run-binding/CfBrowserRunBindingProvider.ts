/**
 * Cloudflare Browser Run (Binding) provider implementation.
 *
 * See the {@link CfBrowserRunBindingProvider} class below for the
 * consumer-facing documentation (when to use, example, gotchas).
 */

import type { Config, Redacted } from "effect";

import {
  launch,
  type BrowserEndpoint,
  type WorkersLaunchOptions,
} from "@effect-libs/cloudflare-playwright";
import { Context, DateTime, Effect, Layer, Option, Predicate } from "effect";
import * as Arr from "effect/Array";

import {
  BrowserProviderError,
  SessionId,
  type UrlString,
  type BrowserProviderOptions,
  type BrowserProviderService,
  type BrowserProviderSessionBase,
} from "@effect-libs/browser";
import {
  PlaywrightError,
  ConnectionError as ConnectionReason,
  OperationError as OperationReason,
  makePage,
  type PlaywrightPage,
} from "@effect-libs/browser-playwright";

import {
  type CfBrowserRunBindingSdk,
  makeCfBrowserRunBindingSdk,
} from "./CfBrowserRunBindingSdk.js";

// ── Options & Configuration ───────────────────────────────────────────────────

/**
 * Re-export Cloudflare Workers launch options for convenience.
 *
 * @category models
 * @since 0.1.0
 */
export type CfBrowserRunBindingSessionCreateParams = WorkersLaunchOptions;

/**
 * Configuration options for Cloudflare Browser Run binding provider.
 * Omits apiKey because the injected runtime binding handles authentication natively.
 *
 * @category models
 * @since 0.1.0
 */
export interface CfBrowserRunBindingProviderOptions extends Omit<BrowserProviderOptions, "apiKey"> {
  /** Browser endpoint binding from env.MYBROWSER */
  readonly endpoint: BrowserEndpoint;
  /** Default launch options applied to all sessions unless overridden. */
  readonly options?: WorkersLaunchOptions;
}

/**
 * Configuration options for the Cloudflare Browser Run binding layer.
 * Provided to maintain structural layout symmetry across provider suites.
 *
 * @category models
 * @since 0.1.0
 */
export interface CfBrowserRunBindingProviderConfigOptions {
  /** The live browser endpoint binding supplied by the Workers runtime (env.MYBROWSER) */
  readonly endpoint: BrowserEndpoint;
  /** Optional default launch configurations for workers */
  readonly options?: CfBrowserRunBindingSessionCreateParams;
}

/**
 * Supported browser runner types for the Cloudflare edge binding engine.
 * Cloudflare's upstream V8 rendering isolate is anchored strictly to Chromium.
 * @deprecated Removed - type was never used. WorkersLaunchOptions handles browserType directly.
 */
// export type CfBrowserRunBindingBrowserType = "chromium";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Cloudflare Browser Run binding session.
 *
 * For the binding provider, the "session" is just a record of the endpoint
 * and launch options. The actual browser lifecycle is managed by `withSession`.
 *
 * - `id` → generated UUID as `SessionId`
 * - `createdAt` → `DateTime.Utc` (session creation time)
 * - `endpoint` → the browser binding from `env.MYBROWSER`
 * - `launchOptions` → options applied at browser launch
 *
 * @category models
 * @since 0.1.0
 */
export interface CfBrowserRunBindingSession extends BrowserProviderSessionBase {
  /** The raw browser endpoint binding (binding from env.MYBROWSER) */
  readonly endpoint: BrowserEndpoint;
  /** Launch options applied at runtime */
  readonly launchOptions?: WorkersLaunchOptions;
}

// ── Service Interface ─────────────────────────────────────────────────────────

/**
 * Cloudflare Browser Run Binding provider service interface.
 *
 * Provides direct browser access via `launch(endpoint)`. Only works with
 * `browser-playwright` — `browser-cdp` and `browser-stagehand` require
 * Chrome DevTools Protocol WebSocket URLs.
 *
 * Extends `BrowserProviderService` with:
 * - `withSession` - the primary method for browser automation
 * - `use` - access to the binding SDK wrapper
 *
 * @category services
 * @since 0.1.0
 */
export interface CfBrowserRunBindingProviderService extends BrowserProviderService<
  CfBrowserRunBindingSession,
  CfBrowserRunBindingSessionCreateParams
> {
  /**
   * Execute a function within a managed browser isolation context.
   *
   * Launches a browser via `launch(endpoint)`, creates a page, runs the
   * function, and closes the browser when done.
   *
   * **Only works with Playwright.** Cdp and Stagehand require CDP URLs.
   *
   * Can be called in two forms:
   * - `withSession(fn)` - use default launch options
   * - `withSession(options, fn)` - override launch options
   *
   * @example
   * ```typescript
   * // With default options
   * const title = yield* provider.withSession((page) =>
   *   Effect.gen(function* () {
   *     yield* page.goto("https://example.com");
   *     return yield* page.title();
   *   })
   * );
   *
   * // With custom launch options
   * const title = yield* provider.withSession(
   *   { keepAlive: 300000 },
   *   (page) => page.title()
   * );
   * ```
   */
  readonly withSession: <A, E, R>(
    optionsOrFn:
      | CfBrowserRunBindingSessionCreateParams
      | ((page: PlaywrightPage) => Effect.Effect<A, E, R>),
    fn?: (page: PlaywrightPage) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PlaywrightError, R>;

  /**
   * Execute a provider-specific operation via the binding SDK wrapper.
   *
   * @example
   * ```typescript
   * // Access binding methods
   * yield* provider.use(b => b.limits());
   * ```
   */
  readonly use: <A>(
    fn: (client: CfBrowserRunBindingSdk) => Promise<A>,
  ) => Effect.Effect<A, BrowserProviderError>;
}

// ── Error Helper ──────────────────────────────────────────────────────────────

const SOURCE = "CfBrowserRunBindingProvider";
const wrapError = (method: string, reason: PlaywrightError["reason"]) =>
  new PlaywrightError({ source: SOURCE, method, reason });

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Factory function that creates a Cloudflare Browser Run binding provider implementation.
 *
 * The binding provider uses `launch(endpoint)` to start browsers directly
 * without requiring CDP WebSocket connections.
 */
const make = (layerOptions: CfBrowserRunBindingProviderOptions) =>
  Effect.sync(() => {
    const endpoint = layerOptions.endpoint;
    const defaultOptions = layerOptions.options ?? {};
    const bindingSdk = makeCfBrowserRunBindingSdk(endpoint);

    const createSession = Effect.fn("CfBrowserRunBindingProvider.createSession")(function* (
      options?: CfBrowserRunBindingSessionCreateParams,
    ) {
      const launchOptions = { ...defaultOptions, ...options };

      const session: CfBrowserRunBindingSession = {
        id: SessionId(crypto.randomUUID()),
        createdAt: DateTime.makeUnsafe(new Date()),
        endpoint,
        launchOptions,
      };

      yield* Effect.logDebug(`[CfBrowserRunBindingProvider] Session record created: ${session.id}`);
      return session;
    });

    const releaseSession = Effect.fn("CfBrowserRunBindingProvider.releaseSession")(function* (
      sessionId: SessionId,
    ) {
      yield* Effect.logDebug(`[CfBrowserRunBindingProvider] Session release (no-op): ${sessionId}`);
    });

    const getCdpUrl = (_sessionId: SessionId): Option.Option<Redacted.Redacted<UrlString>> =>
      Option.none();

    const withSession = Effect.fn("CfBrowserRunBindingProvider.withSession")(<A, E, R>(
      optionsOrFn:
        | CfBrowserRunBindingSessionCreateParams
        | ((page: PlaywrightPage) => Effect.Effect<A, E, R>),
      fn?: (page: PlaywrightPage) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | PlaywrightError, R> => {
      const isSessionOptions = (
        value:
          | CfBrowserRunBindingSessionCreateParams
          | ((page: PlaywrightPage) => Effect.Effect<A, E, R>),
      ): value is CfBrowserRunBindingSessionCreateParams => !Predicate.isFunction(value);

      const launchOpts = isSessionOptions(optionsOrFn)
        ? { ...defaultOptions, ...optionsOrFn }
        : defaultOptions;

      const callback = isSessionOptions(optionsOrFn)
        ? (fn ?? (() => Effect.die("fn is required when options are provided")))
        : optionsOrFn;

      return Effect.gen(function* () {
        if (!endpoint) {
          return yield* wrapError(
            "withSession",
            new ConnectionReason({
              description:
                "Browser endpoint is missing. Ensure env.MYBROWSER is bound in wrangler.toml.",
            }),
          );
        }

        yield* Effect.logDebug(
          "[CfBrowserRunBindingProvider] Launching browser via edge endpoint",
          { launchOpts },
        );

        const browser = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => launch(endpoint, launchOpts),
            catch: (cause) =>
              wrapError(
                "withSession",
                new ConnectionReason({
                  description: "Failed to launch browser via endpoint",
                  cause,
                }),
              ),
          }),
          (browser) =>
            Effect.tryPromise({
              try: () => browser.close(),
              catch: (cause) =>
                wrapError(
                  "withSession",
                  new OperationReason({
                    method: "close",
                    description: "Failed to close browser",
                    cause,
                  }),
                ),
            }).pipe(Effect.catch(Effect.logError)),
        );

        const context = yield* Effect.tryPromise({
          try: () => {
            const contexts = browser.contexts();
            return Arr.match(contexts, {
              onEmpty: () => browser.newContext(),
              onNonEmpty: ([first]) => Promise.resolve(first),
            });
          },
          catch: (cause) =>
            wrapError(
              "withSession",
              new OperationReason({
                method: "context",
                description: "Failed to resolve browser context",
                cause,
              }),
            ),
        });

        const rawPage = yield* Effect.tryPromise({
          try: () => {
            const pages = context.pages();
            return Arr.match(pages, {
              onEmpty: () => context.newPage(),
              onNonEmpty: ([first]) => Promise.resolve(first),
            });
          },
          catch: (cause) =>
            wrapError(
              "withSession",
              new OperationReason({
                method: "page",
                description: "Failed to resolve page container",
                cause,
              }),
            ),
        });

        const page: PlaywrightPage = makePage(rawPage);
        return yield* callback(page);
      }).pipe(Effect.scoped);
    });

    const use = Effect.fn("CfBrowserRunBindingProvider.use")(
      <A>(
        fn: (client: CfBrowserRunBindingSdk) => Promise<A>,
      ): Effect.Effect<A, BrowserProviderError> =>
        Effect.tryPromise({
          try: () => fn(bindingSdk),
          catch: (cause) =>
            new BrowserProviderError({
              reason: "Cloudflare Browser Run Binding operation failed",
              cause,
            }),
        }),
    );

    return {
      createSession,
      releaseSession,
      getCdpUrl,
      withSession,
      use,
    } satisfies CfBrowserRunBindingProviderService;
  });

// ── Service Definition ────────────────────────────────────────────────────────

/**
 * Service tag for the Cloudflare Browser Run (Binding) provider.
 *
 * Direct browser binding access for Cloudflare Workers. Uses
 * `launch(endpoint)` from `@cloudflare/playwright` to launch browsers
 * without a CDP WebSocket endpoint.
 *
 * **When to use**
 *
 * Use when you're deploying to Cloudflare Workers and want direct browser
 * binding access (no API token needed; the binding handles authentication
 * natively). **Only works with Playwright** — Cdp and Stagehand require
 * CDP URLs, which this provider does not expose. **Only works in Cloudflare
 * Workers** — other runtimes have no browser bindings. For non-Workers
 * runtimes, use the CfBrowserRun (HTTP) provider. For hosted browsers
 * with persistent profiles, use the Steel provider. For managed browsers
 * with persistent contexts, use the Browserbase provider.
 *
 * Configuration requires a browser binding from the Workers runtime
 * (typically `env.MYBROWSER`) supplied via `endpoint`. The `withSession`
 * method launches a fresh browser, runs the inner effect, and closes the
 * browser when it completes.
 *
 * **Example** (Workers route handler)
 *
 * ```typescript
 * import { CfBrowserRunBindingProvider } from "@effect-libs/browser-providers/cf-browser-run-binding";
 * import { Effect } from "effect";
 *
 * export default {
 *   async fetch(request, env) {
 *     return Effect.runPromise(
 *       Effect.gen(function* () {
 *         const provider = yield* CfBrowserRunBindingProvider;
 *
 *         const title = yield* provider.withSession((page) =>
 *           Effect.gen(function* () {
 *             yield* page.goto("https://example.com");
 *             return yield* page.title();
 *           }),
 *         );
 *
 *         return new Response(`Title: ${title}`);
 *       }).pipe(
 *         Effect.provide(CfBrowserRunBindingProvider.layer({ endpoint: env.MYBROWSER })),
 *       ),
 *     );
 *   },
 * };
 * ```
 *
 * **Example** (wrangler.toml)
 *
 * ```toml
 * # wrangler.toml
 * [browser]
 * binding = "MYBROWSER"
 * ```
 *
 * **Gotchas**
 *
 * - **Only works with Playwright.** Cdp and Stagehand require CDP URLs,
 *   which the binding provider does not expose. Use the HTTP provider
 *   (`@effect-libs/browser-providers/cf-browser-run`) for those modules.
 * - **Only works in Cloudflare Workers.** Other runtimes do not provide
 *   browser bindings; the layer's `endpoint` parameter has no equivalent
 *   outside Workers.
 * - `withSession` launches a fresh browser on every call. There is no
 *   pooling or reuse — for high-throughput workloads, switch to the HTTP
 *   provider or a hosted provider (Steel, Browserbase).
 * - The session's `id` is a generated UUID local to this process, not an
 *   identifier from Cloudflare. The binding provider has no concept of a
 *   remote session id; the `id` field exists only to satisfy the
 *   `BrowserProviderSessionBase` shape.
 * - `withSession` accepts either a function (default options) or options
 *   + a function (overrides). Mixing argument shapes will be caught by
 *   TypeScript at the call site, not at runtime.
 *
 * @see {@link BrowserProvider} for the provider-agnostic interface
 * @see {@link CfBrowserRunBindingProviderService} for the full service contract
 *
 * @category providers
 * @since 0.1.0
 */
export class CfBrowserRunBindingProvider extends Context.Service<
  CfBrowserRunBindingProvider,
  CfBrowserRunBindingProviderService
>()("effect-libs/browser/CfBrowserRunBindingProvider") {
  /**
   * Factory for creating CfBrowserRunBindingProviderService instances.
   * Useful for creating mock implementations in tests.
   */
  static readonly of = (
    impl: CfBrowserRunBindingProviderService,
  ): CfBrowserRunBindingProviderService => impl;

  /**
   * Layer factory that provides CfBrowserRunBindingProvider.
   *
   * Unlike other providers, this does NOT provide `BrowserProvider` because
   * the binding provider doesn't support CDP WebSocket connections.
   *
   * @param options - Layer options including the browser endpoint binding
   *
   * @example
   * ```typescript
   * // In your Worker entry point
   * CfBrowserRunBindingProvider.layer({ endpoint: env.MYBROWSER })
   *
   * // With default launch options
   * CfBrowserRunBindingProvider.layer({
   *   endpoint: env.MYBROWSER,
   *   options: { keepAlive: 300000 }
   * })
   * ```
   */
  static readonly layer = (
    options: CfBrowserRunBindingProviderOptions,
  ): Layer.Layer<CfBrowserRunBindingProvider> => Layer.effect(this, make(options));

  /**
   * Layer factory that reads configuration from Effect's Config system.
   *
   * Provided for uniform edge-binding layer configuration setups.
   * Note: The endpoint binding cannot be read from Config - it must be passed directly.
   *
   * @param options - Config options including the browser endpoint binding
   */
  static readonly layerConfig = (
    options: CfBrowserRunBindingProviderConfigOptions,
  ): Layer.Layer<CfBrowserRunBindingProvider, Config.ConfigError> =>
    Layer.effectContext(
      Effect.gen(function* () {
        const provider = yield* make({
          endpoint: options.endpoint,
          options: options.options,
        });

        return Context.make(CfBrowserRunBindingProvider, provider);
      }),
    );
}
