/**
 * Steel.dev provider implementation for `BrowserProviderService`, backed by
 * Steel's official Node SDK (`steel-sdk`).
 *
 * See the {@link SteelProvider} class below for the consumer-facing
 * documentation (when to use, mental model, example, gotchas).
 */
import { Context, DateTime, Effect, Layer, Option, Predicate, Redacted, type Config } from "effect";
import SteelSDK from "steel-sdk";

import {
  BrowserProvider,
  BrowserProviderError,
  SessionId,
  UrlString,
  type BrowserProviderOptions,
  type BrowserProviderService,
  type BrowserProviderSession,
} from "@effect-libs/browser";

const DEFAULT_CDP_URL = "wss://connect.steel.dev";

/**
 * Re-export Steel SDK session creation params for convenience.
 *
 * @category types
 * @since 0.1.0
 */
export type SteelSessionCreateParams = SteelSDK.SessionCreateParams;

/** Fields we override from the Steel SDK Session type. */
type SdkSessionOverrides = "id" | "createdAt" | "debugUrl" | "websocketUrl";

/**
 * Normalized Steel session with branded types.
 *
 * Extends BrowserProviderSession with Steel-specific fields. The SDK's
 * raw session fields are normalized:
 * - `id` → branded `SessionId`
 * - `createdAt` → `DateTime.Utc` (parsed from ISO string)
 * - `debugUrl` → `liveViewUrl` as `UrlString`
 * - `websocketUrl` → `cdpUrl` as `Redacted<UrlString>`
 *
 * @category models
 * @since 0.1.0
 */
export interface SteelSession
  extends BrowserProviderSession, Omit<SteelSDK.Session, SdkSessionOverrides> {}

/**
 * Steel.dev provider service interface.
 *
 * Extends `BrowserProviderService` with Steel-specific types:
 * - Session type: `SteelSession` (normalized with branded types)
 * - Options type: `SteelSessionCreateParams` (profileId, persistProfile, etc.)
 *
 * Adds the `use` method for direct Steel SDK access.
 *
 * @category providers
 * @since 0.1.0
 */
export interface SteelProviderService extends BrowserProviderService<
  SteelSession,
  SteelSessionCreateParams
> {
  /**
   * Execute a provider-specific operation with the raw Steel SDK client.
   *
   * Gives type-safe access to the full Steel SDK (profiles, sessions, health, etc.)
   * with full IDE autocomplete.
   *
   * @example
   * ```typescript
   * // Steel profile management
   * yield* provider.use(s => s.profiles.list());
   *
   * // Steel health check
   * yield* provider.use(s => s.health());
   * ```
   */
  readonly use: <A>(fn: (client: SteelSDK) => Promise<A>) => Effect.Effect<A, BrowserProviderError>;
}

/**
 * Configuration options for SteelProvider layer.
 *
 * Separates connection parameters (apiKey) from session options.
 * Session options provided here act as defaults for all `createSession` calls,
 * and can be overridden per-session.
 *
 * @category models
 * @since 0.1.0
 */
export interface SteelProviderOptions extends BrowserProviderOptions {
  /**
   * Request timeout in milliseconds for the Steel SDK client.
   */
  readonly clientTimeout?: number;
  /**
   * Default session creation options.
   * These are applied to all sessions unless overridden in `createSession`.
   */
  readonly options?: SteelSessionCreateParams;
}

/**
 * Configuration options for SteelProvider.layerConfig.
 *
 * Uses Effect's Config system to read values from environment variables.
 *
 * @category models
 * @since 0.1.0
 */
export interface SteelProviderConfigOptions {
  /**
   * Steel API key from Config.
   *
   * Use `Config.redacted("STEEL_API_KEY")` to read from environment.
   */
  readonly apiKey: Config.Config<Redacted.Redacted<string>>;
  /**
   * Optional base URL from Config.
   */
  readonly baseURL?: Config.Config<string>;
  /**
   * Optional client timeout from Config.
   */
  readonly clientTimeout?: Config.Config<number>;
  /**
   * Optional default session options.
   * Passed directly (not wrapped in Config or Effect).
   */
  readonly options?: SteelSessionCreateParams;
}

const computeCdpUrl = (apiKey: string, sessionId: string): Redacted.Redacted<UrlString> => {
  const url = new URL(DEFAULT_CDP_URL);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("sessionId", sessionId);
  return Redacted.make(UrlString(url.href));
};

const normalizeSession = (apiKey: string, raw: SteelSDK.Session): SteelSession => {
  const { id, debugUrl, createdAt, ...rest } = raw;

  const sessionCreatedAt = DateTime.make(createdAt).pipe(
    Option.getOrElse(() => DateTime.makeUnsafe(new Date())),
  );

  return {
    ...rest,
    id: SessionId(id),
    createdAt: sessionCreatedAt,
    liveViewUrl: debugUrl ? UrlString(debugUrl) : undefined,
    cdpUrl: computeCdpUrl(apiKey, id),
  };
};

/**
 * Constructs a `SteelProviderService` from a `Redacted` API key, optional base
 * URL and request timeout, and default session options.
 */
const make = (layerOptions: SteelProviderOptions) =>
  Effect.sync(() => {
    const apiKey = Redacted.value(layerOptions.apiKey);
    const client = new SteelSDK({
      steelAPIKey: apiKey,
      baseURL: layerOptions.baseURL,
      timeout: layerOptions.clientTimeout,
    });
    const defaultOptions = layerOptions.options ?? {};

    const createSession = Effect.fn("SteelProvider.createSession")(function* (
      options?: SteelSessionCreateParams,
    ) {
      const mergedOptions = { ...defaultOptions, ...options };
      yield* Effect.logDebug("[SteelProvider] Creating session");

      const rawSession = yield* Effect.tryPromise({
        try: () => client.sessions.create(mergedOptions),
        catch: (cause) =>
          new BrowserProviderError({ reason: "Failed to create Steel session", cause }),
      });

      const session = normalizeSession(apiKey, rawSession);
      yield* Effect.logDebug(`[SteelProvider] Session created: ${session.id}`);
      return session;
    });

    const releaseSession = Effect.fn("SteelProvider.releaseSession")(function* (
      sessionId: SessionId,
    ) {
      yield* Effect.logDebug(`[SteelProvider] Releasing session: ${sessionId}`);
      yield* Effect.tryPromise({
        try: () => client.sessions.release(sessionId),
        catch: (cause) =>
          new BrowserProviderError({ reason: "Failed to release Steel session", cause }),
      });
      yield* Effect.logDebug(`[SteelProvider] Session released: ${sessionId}`);
    });

    const getCdpUrl = (sessionId: SessionId): Option.Option<Redacted.Redacted<UrlString>> => {
      const url = new URL(DEFAULT_CDP_URL);
      url.searchParams.set("apiKey", apiKey);
      url.searchParams.set("sessionId", sessionId);
      return Option.some(Redacted.make(UrlString(url.href)));
    };
    const use = Effect.fn("SteelProvider.use")(
      <A>(fn: (client: SteelSDK) => Promise<A>): Effect.Effect<A, BrowserProviderError> =>
        Effect.tryPromise({
          try: () => fn(client),
          catch: (cause) =>
            new BrowserProviderError({ reason: "Steel SDK operation failed", cause }),
        }),
    );

    return {
      createSession,
      releaseSession,
      getCdpUrl,
      use,
    } satisfies SteelProviderService;
  });

/**
 * Service tag for the Steel browser provider.
 *
 * **When to use**
 *
 * Use when you need a hosted browser service with persistent profiles,
 * advanced fingerprinting controls, and Steel-specific operations like
 * profile management, health checks, and raw SDK access. For managed
 * browsers with simpler session metadata, use the Browserbase provider.
 * For Cloudflare's browser-rendering API from any JS runtime, use the
 * CfBrowserRun (HTTP) provider. For Workers with a direct browser binding
 * (Playwright only), use the CfBrowserRunBinding provider.
 *
 * **Mental model**
 *
 * Provide `SteelProvider.layer` at the application edge to publish a concrete
 * Steel client. Downstream code depends on the generic `BrowserProvider` tag
 * so it stays provider-agnostic; code that needs Steel-specific features
 * (profiles, health, raw SDK access) depends on the concrete `SteelProvider`
 * tag. A single layer satisfies both.
 *
 * **Example** (Provision a Steel session and drive it)
 *
 * ```typescript
 * import { SteelProvider } from "@effect-libs/browser-providers/steel";
 * import { Effect, Redacted } from "effect";
 *
 * // Depend on the concrete tag you configured — the normal case.
 * const scrape = Effect.gen(function* () {
 *   const provider = yield* SteelProvider;
 *   const session = yield* provider.createSession();
 *   // ...drive `session.cdpUrl` with Playwright or CDP...
 *   yield* provider.releaseSession(session.id);
 * });
 *
 * // The `use` escape hatch reaches the raw Steel SDK (profiles, health, ...).
 * const listProfiles = Effect.gen(function* () {
 *   const steel = yield* SteelProvider;
 *   return yield* steel.use((client) => client.profiles.list());
 * });
 *
 * Effect.runPromise(
 *   scrape.pipe(
 *     Effect.provide(
 *       SteelProvider.layer({ apiKey: Redacted.make(process.env.STEEL_API_KEY!) }),
 *     ),
 *   ),
 * );
 * ```
 *
 * The same layer also satisfies the generic `BrowserProvider` tag — depend on
 * that for code that should run unchanged across providers:
 *
 * ```typescript
 * import { BrowserProvider } from "@effect-libs/browser";
 *
 * // Works against any provider layer — local CDP in dev, Steel in prod.
 * const portable = Effect.gen(function* () {
 *   const provider = yield* BrowserProvider;
 *   const session = yield* provider.createSession();
 *   yield* provider.releaseSession(session.id);
 * });
 * ```
 *
 * **Gotchas**
 *
 * - The API key is supplied as a `Redacted<string>`; unwrap it only where the
 *   SDK requires the raw value. A missing or rejected key fails at session
 *   creation, not at layer construction.
 * - Session counts, concurrency, and request limits are enforced by the Steel
 *   plan, not by this client.
 * - `getCdpUrl` is always `Some` for Steel sessions: the CDP endpoint is
 *   derived deterministically from the API key and session id.
 *
 * @see {@link BrowserProvider} for the provider-agnostic interface
 * @see {@link SteelProviderService} for the full service contract
 *
 * @category providers
 * @since 0.1.0
 */
export class SteelProvider extends Context.Service<SteelProvider, SteelProviderService>()(
  "effect-libs/browser/SteelProvider",
) {
  /**
   * Factory for creating SteelProviderService instances.
   * Useful for creating mock implementations in tests.
   */
  static readonly of = (impl: SteelProviderService): SteelProviderService => impl;

  /**
   * Layer factory that provides BOTH SteelProvider AND BrowserProvider.
   *
   * Returns a layer rather than a static layer because the provider
   * requires runtime configuration (API key). Call this once at the
   * application edge and reuse the resulting layer.
   *
   * @param options - Layer options including apiKey (as Redacted) and optional session defaults
   *
   * @example
   * ```typescript
   * import { Redacted } from "effect";
   *
   * // Basic usage
   * SteelProvider.layer({ apiKey: Redacted.make(process.env.STEEL_API_KEY!) })
   *
   * // With default session options
   * SteelProvider.layer({
   *   apiKey: Redacted.make(process.env.STEEL_API_KEY!),
   *   options: { profileId: "my-profile", persistProfile: true }
   * })
   * ```
   */
  static readonly layer = (
    options: SteelProviderOptions,
  ): Layer.Layer<SteelProvider | BrowserProvider> =>
    Layer.effectContext(
      make(options).pipe(
        Effect.map((provider) =>
          Context.make(SteelProvider, provider).pipe(Context.add(BrowserProvider, provider)),
        ),
      ),
    );

  /**
   * Layer factory that reads configuration from Effect's Config system.
   *
   * Use this when you want to load the API key from environment variables
   * via Effect's Config module.
   *
   * @param options - Config options including apiKey (as Config.redacted)
   *
   * @example
   * ```typescript
   * import { Config } from "effect";
   *
   * // Read API key from STEEL_API_KEY env var
   * SteelProvider.layerConfig({
   *   apiKey: Config.redacted("STEEL_API_KEY")
   * })
   *
   * // With additional config options
   * SteelProvider.layerConfig({
   *   apiKey: Config.redacted("STEEL_API_KEY"),
   *   baseURL: Config.string("STEEL_BASE_URL").pipe(Config.withDefault("https://api.steel.dev")),
   * })
   * ```
   */
  static readonly layerConfig = (
    options: SteelProviderConfigOptions,
  ): Layer.Layer<SteelProvider | BrowserProvider, Config.ConfigError> =>
    Layer.effectContext(
      Effect.gen(function* () {
        const apiKey = yield* options.apiKey;

        const baseURL = Predicate.isNotUndefined(options.baseURL)
          ? yield* options.baseURL
          : undefined;

        const clientTimeout = Predicate.isNotUndefined(options.clientTimeout)
          ? yield* options.clientTimeout
          : undefined;

        const provider = yield* make({
          apiKey,
          baseURL,
          clientTimeout,
          options: options.options,
        });

        return Context.make(SteelProvider, provider).pipe(Context.add(BrowserProvider, provider));
      }),
    );
}
