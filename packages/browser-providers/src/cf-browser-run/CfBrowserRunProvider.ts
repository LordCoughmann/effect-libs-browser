/**
 * Cloudflare Browser Run (HTTP) provider implementation.
 *
 * See the {@link CfBrowserRunProvider} class below for the consumer-facing
 * documentation (when to use, example, gotchas).
 */

import {
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Predicate,
  Redacted,
  Schema,
  type Config,
} from "effect";

import {
  BrowserProvider,
  BrowserProviderError,
  SessionId,
  UrlString,
  type BrowserProviderOptions,
  type BrowserProviderService,
  type BrowserProviderSession,
} from "@effect-libs/browser";

import { type CfBrowserRunSdk, Cloudflare } from "./CfBrowserRunSdk.js";

// ── Options ───────────────────────────────────────────────────────────────────

/**
 * Session creation parameters for Cloudflare Browser Run.
 *
 * @category models
 * @since 0.1.0
 */
export interface CfBrowserRunSessionCreateParams {
  /** Session keep-alive in milliseconds (default: 600000 = 10 min) */
  readonly keepAlive?: number;
}

/**
 * Configuration options for Cloudflare Browser Run provider layer.
 *
 * Separates connection parameters (apiKey, accountId) from session options.
 * Session options provided here act as defaults for all `createSession` calls,
 * and can be overridden per-session.
 *
 * @category models
 * @since 0.1.0
 */
export interface CfBrowserRunProviderOptions extends BrowserProviderOptions {
  /**
   * Cloudflare account ID.
   *
   * Found in the Cloudflare dashboard under "Account ID".
   */
  readonly accountId: string;
  /**
   * Default session creation options.
   * These are applied to all sessions unless overridden in `createSession`.
   */
  readonly options?: CfBrowserRunSessionCreateParams;
}

/**
 * Configuration options for CfBrowserRunProvider.layerConfig.
 *
 * Uses Effect's Config system to read values from environment variables.
 *
 * @category models
 * @since 0.1.0
 */
export interface CfBrowserRunProviderConfigOptions {
  /**
   * Cloudflare account ID from Config.
   *
   * Use `Config.string("CF_ACCOUNT_ID")` to read from environment.
   */
  readonly accountId: Config.Config<string>;
  /**
   * Cloudflare API token from Config.
   *
   * Use `Config.redacted("CF_API_TOKEN")` to read from environment.
   */
  readonly apiKey: Config.Config<Redacted.Redacted<string>>;
  /**
   * Optional base URL from Config.
   */
  readonly baseURL?: Config.Config<string>;
  /**
   * Optional default session options.
   * Passed directly (not wrapped in Config or Effect).
   */
  readonly options?: CfBrowserRunSessionCreateParams;
}

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Cloudflare Browser Run session with branded types.
 *
 * Extends BrowserProviderSession with Cloudflare-specific fields:
 * - `id` → branded `SessionId`
 * - `createdAt` → `DateTime.Utc`
 * - `cdpUrl` → `Redacted<UrlString>` (the WebSocket debugger URL)
 * - `liveViewUrl` → optional `UrlString` (DevTools frontend URL)
 *
 * @category models
 * @since 0.1.0
 */
export interface CfBrowserRunSession extends BrowserProviderSession {}

// ── Internal Validation Schema ─────────────────────────────────────────────────

/**
 * Schema for validating Cloudflare Browser Run API response.
 *
 * Ensures the session response has the required fields for CDP connection.
 */
const CfBrowserRunSessionResponse = Schema.Struct({
  sessionId: Schema.String,
  /** Enforced as a required string to completely eliminate template literal fallbacks */
  webSocketDebuggerUrl: Schema.String,
  targets: Schema.optional(
    Schema.Array(
      Schema.Struct({
        devtoolsFrontendUrl: Schema.optional(Schema.String),
      }),
    ),
  ),
});

/** Type for validated Cloudflare session response. */
type CfBrowserRunSessionResponseType = Schema.Schema.Type<typeof CfBrowserRunSessionResponse>;

/**
 * Normalizes a validated Cloudflare API response to our branded session type.
 *
 * Extracts `webSocketDebuggerUrl` as `cdpUrl` and optional `devtoolsFrontendUrl`
 * as `liveViewUrl`.
 */
const normalizeSession = (response: CfBrowserRunSessionResponseType): CfBrowserRunSession => {
  const liveViewUrl = response.targets?.[0]?.devtoolsFrontendUrl;

  return {
    id: SessionId(response.sessionId),
    createdAt: DateTime.makeUnsafe(new Date()),
    liveViewUrl: liveViewUrl ? UrlString(liveViewUrl) : undefined,
    cdpUrl: Redacted.make(UrlString(response.webSocketDebuggerUrl)),
  };
};

// ── Service Interface ─────────────────────────────────────────────────────────

/**
 * Cloudflare Browser Run provider service interface.
 *
 * Extends `BrowserProviderService` with Cloudflare-specific types:
 * - Session type: `CfBrowserRunSession` (normalized with branded types)
 * - Options type: `CfBrowserRunSessionCreateParams` (keepAlive)
 *
 * Adds the `accountId` property and `use` method for direct SDK access.
 *
 * @category providers
 * @since 0.1.0
 */
export interface CfBrowserRunProviderService extends BrowserProviderService<
  CfBrowserRunSession,
  CfBrowserRunSessionCreateParams
> {
  /**
   * The Cloudflare account ID this provider is configured for.
   */
  readonly accountId: string;
  /**
   * Execute a provider-specific operation with the Cloudflare browser rendering client.
   *
   * Gives type-safe access to the browser rendering SDK with full IDE autocomplete.
   *
   * @example
   * ```typescript
   * // Check browser rendering limits
   * yield* provider.use(c => c.devtools.browser.limits(accountId));
   * ```
   */
  readonly use: <A>(
    fn: (client: CfBrowserRunSdk) => Promise<A>,
  ) => Effect.Effect<A, BrowserProviderError>;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Factory function that creates a Cloudflare Browser Run provider implementation.
 *
 * Maps our standardized options to Cloudflare SDK's ClientOptions.
 */
const make = (layerOptions: CfBrowserRunProviderOptions) =>
  Effect.sync(() => {
    const defaultKeepAlive = layerOptions.options?.keepAlive ?? 600_000;

    const sessionEndpoints = new Map<SessionId, string>();
    const sessionCreated = new Map<SessionId, DateTime.DateTime>();

    const apiKey = Redacted.value(layerOptions.apiKey);
    const accountId = layerOptions.accountId;
    const baseURL = layerOptions.baseURL;

    const cloudflareClient = new Cloudflare({
      apiToken: apiKey,
      baseURL,
    });
    const rendering = cloudflareClient.browserRendering;

    const createSession = Effect.fn("CfBrowserRunProvider.createSession")(function* (
      options?: CfBrowserRunSessionCreateParams,
    ) {
      const keepAlive = options?.keepAlive ?? defaultKeepAlive;
      yield* Effect.logDebug("[CfBrowserRunProvider] Creating session");

      const rawResponse = yield* Effect.tryPromise({
        try: () =>
          rendering.devtools.browser.create({
            account_id: accountId,
            keep_alive: keepAlive,
            targets: true,
          }),
        catch: (cause) =>
          new BrowserProviderError({
            reason: "Failed to create Browser Run session via SDK",
            cause,
          }),
      });

      const response = yield* Schema.decodeUnknownEffect(CfBrowserRunSessionResponse)(
        rawResponse,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new BrowserProviderError({
              reason: "Cloudflare API returned an unexpected session structure",
              cause,
            }),
        ),
      );

      const session = normalizeSession(response);

      sessionEndpoints.set(session.id, response.webSocketDebuggerUrl);
      sessionCreated.set(session.id, DateTime.makeUnsafe(new Date()));

      yield* Effect.logDebug(`[CfBrowserRunProvider] Session created: ${session.id}`);
      return session;
    });

    const releaseSession = Effect.fn("CfBrowserRunProvider.releaseSession")(
      (sessionId: SessionId) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`[CfBrowserRunProvider] Releasing session: ${sessionId}`);

          yield* Effect.tryPromise({
            try: () =>
              rendering.devtools.browser.delete(sessionId, {
                account_id: accountId,
              }),
            catch: (cause) =>
              new BrowserProviderError({
                reason: "Failed to release Browser Run session via SDK",
                cause,
              }),
          }).pipe(
            Effect.catchTag("effect-libs/browser/BrowserProviderError", (e) =>
              e.cause instanceof Cloudflare.NotFoundError
                ? Effect.logDebug(
                    `[CfBrowserRunProvider] Session already released (404): ${sessionId}`,
                  )
                : Effect.fail(e),
            ),
          );

          sessionEndpoints.delete(sessionId);
          sessionCreated.delete(sessionId);
          yield* Effect.logDebug(`[CfBrowserRunProvider] Session released: ${sessionId}`);
        }),
    );

    const getCdpUrl = (sessionId: SessionId): Option.Option<Redacted.Redacted<UrlString>> => {
      const endpoint = sessionEndpoints.get(sessionId);
      return endpoint ? Option.some(Redacted.make(UrlString(endpoint))) : Option.none();
    };

    const use = Effect.fn("CfBrowserRunProvider.use")(
      <A>(fn: (client: CfBrowserRunSdk) => Promise<A>): Effect.Effect<A, BrowserProviderError> =>
        Effect.tryPromise({
          try: () => fn(rendering),
          catch: (cause) =>
            new BrowserProviderError({
              reason: "Cloudflare Browser Run SDK operation failed",
              cause,
            }),
        }),
    );

    return {
      accountId,
      createSession,
      releaseSession,
      getCdpUrl,
      use,
    } satisfies CfBrowserRunProviderService;
  });

// ── Service Definition ────────────────────────────────────────────────────────

/**
 * Service tag for the Cloudflare Browser Run (HTTP) provider.
 *
 * Implements `BrowserProviderService` using the Cloudflare SDK's
 * browser-rendering API. Works in **any** JavaScript runtime environment.
 *
 * **When to use**
 *
 * Use when you want Cloudflare's browser-rendering service from any
 * JavaScript runtime (Node, Bun, Deno, browser, Workers with a fetch
 * shim). Authentication requires a Cloudflare API token with the
 * **Browser Rendering - Edit** permission plus an account ID. For
 * hosted browsers with persistent profiles, use the Steel provider. For
 * managed browsers with persistent contexts, use the Browserbase
 * provider. For Workers with a direct browser binding (Playwright only,
 * no API token needed), use the CfBrowserRunBinding provider.
 *
 * Sessions are created and released over HTTP against the Cloudflare API;
 * the returned session object contains a `webSocketDebuggerUrl` that is
 * used as the CDP endpoint. The schema for the API response is validated
 * with Effect Schema before normalization, and the normalized session
 * exposes branded `SessionId`, `DateTime.Utc` `createdAt`, and a
 * `Redacted<UrlString>` `cdpUrl`. The `use` escape hatch exposes the raw
 * SDK for Cloudflare-specific operations (limits, custom endpoints).
 *
 * **Example** (Provision a session and drive it with Playwright)
 *
 * ```typescript
 * import { CfBrowserRunProvider } from "@effect-libs/browser-providers/cf-browser-run";
 * import { Playwright } from "@effect-libs/browser-playwright";
 * import { Effect, Redacted } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const playwright = yield* Playwright;
 *   const provider = yield* CfBrowserRunProvider;
 *
 *   const title = yield* playwright.withSession({ provider }, (page) =>
 *     Effect.gen(function* () {
 *       yield* page.goto("https://example.com");
 *       return yield* page.title();
 *     }),
 *   );
 *
 *   return title;
 * });
 *
 * Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(
 *       CfBrowserRunProvider.layer({
 *         accountId: process.env.CF_ACCOUNT_ID!,
 *         apiKey: Redacted.make(process.env.CF_API_TOKEN!),
 *       }),
 *     ),
 *     Effect.provide(Playwright.layer),
 *   ),
 * );
 * ```
 *
 * **Example** (HTTP session lifecycle)
 *
 * ```
 * createSession()     → POST   /accounts/{accountId}/browser-rendering/devtools/browser
 * releaseSession(id)  → DELETE /accounts/{accountId}/browser-rendering/devtools/browser/{id}
 * getCdpUrl(id)       → returns webSocketDebuggerUrl from session
 * ```
 *
 * **Gotchas**
 *
 * - The normalized session's `createdAt` is set to the local process time
 *   when the response is normalized, not to a timestamp returned by the
 *   Cloudflare API. The API response schema does not include a server-side
 *   creation timestamp, so this field is effectively "when did we first see
 *   this session" rather than "when was it created."
 * - Session state (`sessionEndpoints`, `sessionCreated` maps) is held in
 *   memory on the provider. If the process restarts, `getCdpUrl` and
 *   `releaseSession` lose their context for sessions created in a prior
 *   process. There is no persistence layer.
 * - The default `keepAlive` of 600000 ms (10 min) is hardcoded in `make`.
 *   Override via `layerOptions.options.keepAlive` for longer-running
 *   sessions.
 * - `cdpUrl` is `Redacted` so it does not appear in logs; unwrap it only
 *   where the connection logic requires the raw value.
 *
 * @see {@link BrowserProvider} for the provider-agnostic interface
 * @see {@link CfBrowserRunProviderService} for the full service contract
 *
 * @category providers
 * @since 0.1.0
 */
export class CfBrowserRunProvider extends Context.Service<
  CfBrowserRunProvider,
  CfBrowserRunProviderService
>()("effect-libs/browser/CfBrowserRunProvider") {
  /**
   * Factory for creating CfBrowserRunProviderService instances.
   * Useful for creating mock implementations in tests.
   */
  static readonly of = (impl: CfBrowserRunProviderService): CfBrowserRunProviderService => impl;

  /**
   * Layer factory that provides BOTH CfBrowserRunProvider AND BrowserProvider.
   *
   * Returns a layer rather than a static layer because the provider
   * requires runtime configuration (API token, account ID). Call this once at
   * the application edge and reuse the resulting layer.
   *
   * @param options - Layer options including accountId, apiKey (as Redacted), and optional session defaults
   *
   * @example
   * ```typescript
   * import { Redacted } from "effect";
   *
   * // Basic usage
   * CfBrowserRunProvider.layer({
   *   accountId: process.env.CF_ACCOUNT_ID!,
   *   apiKey: Redacted.make(process.env.CF_API_TOKEN!)
   * })
   *
   * // With default session options
   * CfBrowserRunProvider.layer({
   *   accountId: process.env.CF_ACCOUNT_ID!,
   *   apiKey: Redacted.make(process.env.CF_API_TOKEN!),
   *   options: { keepAlive: 300000 } // 5 min
   * })
   * ```
   */
  static readonly layer = (
    options: CfBrowserRunProviderOptions,
  ): Layer.Layer<CfBrowserRunProvider | BrowserProvider> =>
    Layer.effectContext(
      make(options).pipe(
        Effect.map((provider) =>
          Context.make(CfBrowserRunProvider, provider).pipe(Context.add(BrowserProvider, provider)),
        ),
      ),
    );

  /**
   * Layer factory that reads configuration from Effect's Config system.
   *
   * Use this when you want to load the API token and account ID from
   * environment variables via Effect's Config module.
   *
   * @param options - Config options including accountId and apiKey (as Config)
   *
   * @example
   * ```typescript
   * import { Config } from "effect";
   *
   * // Read credentials from environment
   * CfBrowserRunProvider.layerConfig({
   *   accountId: Config.string("CF_ACCOUNT_ID"),
   *   apiKey: Config.redacted("CF_API_TOKEN")
   * })
   *
   * // With additional config options
   * CfBrowserRunProvider.layerConfig({
   *   accountId: Config.string("CF_ACCOUNT_ID"),
   *   apiKey: Config.redacted("CF_API_TOKEN"),
   *   baseURL: Config.string("CF_BASE_URL").pipe(Config.withDefault("https://api.cloudflare.com")),
   * })
   * ```
   */
  static readonly layerConfig = (
    options: CfBrowserRunProviderConfigOptions,
  ): Layer.Layer<CfBrowserRunProvider | BrowserProvider, Config.ConfigError> =>
    Layer.effectContext(
      Effect.gen(function* () {
        const accountId = yield* options.accountId;
        const apiKey = yield* options.apiKey;
        const baseURL = Predicate.isNotUndefined(options.baseURL)
          ? yield* options.baseURL
          : undefined;

        const provider = yield* make({ accountId, apiKey, baseURL, options: options.options });
        return Context.make(CfBrowserRunProvider, provider).pipe(
          Context.add(BrowserProvider, provider),
        );
      }),
    );
}
