/**
 * Browserbase provider implementation for `BrowserProviderService`.
 *
 * See the {@link BrowserbaseProvider} class below for the consumer-facing
 * documentation (when to use, example, gotchas).
 */

import { Browserbase } from "@browserbasehq/sdk";
import { Context, DateTime, Effect, Layer, Option, Predicate, Redacted, type Config } from "effect";

import {
  BrowserProvider,
  BrowserProviderError,
  SessionId,
  UrlString,
  type BrowserProviderOptions,
  type BrowserProviderService,
  type BrowserProviderSessionBase,
} from "@effect-libs/browser";

const DEFAULT_CDP_URL = "wss://connect.browserbase.com";

/**
 * Re-export Browserbase SDK session creation params for convenience.
 *
 * @category types
 * @since 0.1.0
 */
export type BrowserbaseSessionCreateParams = Browserbase.SessionCreateParams;

/** Raw session type returned by the Browserbase SDK. */
type BrowserbaseSessionRaw = Awaited<ReturnType<Browserbase["sessions"]["create"]>>;

/** Fields we override from the Browserbase SDK Session type. */
type SdkSessionOverrides = "id" | "createdAt" | "connectUrl";

/**
 * Normalized Browserbase session with branded types.
 *
 * Extends BrowserProviderSessionBase with Browserbase-specific fields. The SDK's
 * raw session fields are normalized:
 * - `id` → branded `SessionId`
 * - `createdAt` → `DateTime.Utc` (parsed from ISO string)
 * - `liveViewUrl` → constructed from session ID
 *
 * @category models
 * @since 0.1.0
 */
export interface BrowserbaseSession
  extends BrowserProviderSessionBase, Omit<BrowserbaseSessionRaw, SdkSessionOverrides> {}

/**
 * Browserbase provider service interface.
 *
 * Extends `BrowserProviderService` with Browserbase-specific types:
 * - Session type: `BrowserbaseSession` (normalized with branded types)
 * - Options type: `BrowserbaseSessionCreateParams` (projectId, browserSettings, etc.)
 *
 * Adds the `use` method for direct Browserbase SDK access.
 *
 * @category providers
 * @since 0.1.0
 */
export interface BrowserbaseProviderService extends BrowserProviderService<
  BrowserbaseSession,
  BrowserbaseSessionCreateParams
> {
  /**
   * Execute a provider-specific operation with the raw Browserbase SDK client.
   *
   * Gives type-safe access to the full Browserbase SDK (sessions, contexts, etc.)
   * with full IDE autocomplete.
   *
   * @example
   * ```typescript
   * // List sessions
   * yield* provider.use(s => s.sessions.list());
   *
   * // Get session details
   * yield* provider.use(s => s.sessions.get(sessionId));
   * ```
   */
  readonly use: <A>(
    fn: (client: Browserbase) => Promise<A>,
  ) => Effect.Effect<A, BrowserProviderError>;
}

/**
 * Configuration options for BrowserbaseProvider layer.
 *
 * Separates connection parameters (apiKey) from session options.
 * Session options provided here act as defaults for all `createSession` calls,
 * and can be overridden per-session.
 *
 * @category models
 * @since 0.1.0
 */
export interface BrowserbaseProviderOptions extends BrowserProviderOptions {
  /**
   * Request timeout in milliseconds for the Browserbase SDK client.
   */
  readonly clientTimeout?: number;
  /**
   * Default session creation options.
   * These are applied to all sessions unless overridden in `createSession`.
   */
  readonly options?: BrowserbaseSessionCreateParams;
}

/**
 * Configuration options for BrowserbaseProvider.layerConfig.
 *
 * Uses Effect's Config system to read values from environment variables.
 *
 * @category models
 * @since 0.1.0
 */
export interface BrowserbaseProviderConfigOptions {
  /**
   * Browserbase API key from Config.
   *
   * Use `Config.redacted("BROWSERBASE_API_KEY")` to read from environment.
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
  readonly options?: BrowserbaseSessionCreateParams;
}

/**
 * Normalizes a raw Browserbase SDK session to our branded types.
 *
 * Converts the SDK response to use `SessionId`, `DateTime.Utc`, and `UrlString`.
 */
const normalizeSession = (raw: BrowserbaseSessionRaw): BrowserbaseSession => {
  const { id, createdAt, ...rest } = raw;

  const sessionCreatedAt = DateTime.make(createdAt).pipe(
    Option.getOrElse(() => DateTime.makeUnsafe(new Date())),
  );

  return {
    ...rest,
    id: SessionId(id),
    createdAt: sessionCreatedAt,
    liveViewUrl: UrlString(`https://browserbase.com/sessions/${id}`),
  };
};

/**
 * Factory function that creates a Browserbase provider implementation.
 *
 * Maps our standardized options to Browserbase SDK's ClientOptions.
 */
const make = (layerOptions: BrowserbaseProviderOptions) =>
  Effect.sync(() => {
    const apiKey = Redacted.value(layerOptions.apiKey);
    const client = new Browserbase({
      apiKey,
    });
    const defaultOptions = layerOptions.options ?? {};

    const createSession = Effect.fn("BrowserbaseProvider.createSession")(function* (
      options?: BrowserbaseSessionCreateParams,
    ) {
      const mergedOptions = { ...defaultOptions, ...options };
      yield* Effect.logDebug("[BrowserbaseProvider] Creating session");

      const rawSession = yield* Effect.tryPromise({
        try: () => client.sessions.create(mergedOptions),
        catch: (cause) =>
          new BrowserProviderError({ reason: "Failed to create Browserbase session", cause }),
      });

      const session = normalizeSession(rawSession);
      yield* Effect.logDebug(`[BrowserbaseProvider] Session created: ${session.id}`);
      return session;
    });

    const releaseSession = Effect.fn("BrowserbaseProvider.releaseSession")(function* (
      sessionId: SessionId,
    ) {
      yield* Effect.logDebug(`[BrowserbaseProvider] Releasing session: ${sessionId}`);
      yield* Effect.tryPromise({
        try: () => client.sessions.update(sessionId, { status: "REQUEST_RELEASE" }),
        catch: (cause) =>
          new BrowserProviderError({ reason: "Failed to release Browserbase session", cause }),
      });
      yield* Effect.logDebug(`[BrowserbaseProvider] Session released: ${sessionId}`);
    });

    const getCdpUrl = (sessionId: SessionId): Option.Option<Redacted.Redacted<UrlString>> => {
      const url = new URL(`${DEFAULT_CDP_URL}/v1/sessions/${sessionId}`);
      url.searchParams.set("apiKey", apiKey);
      return Option.some(Redacted.make(UrlString(url.href)));
    };

    const use = Effect.fn("BrowserbaseProvider.use")(
      <A>(fn: (client: Browserbase) => Promise<A>): Effect.Effect<A, BrowserProviderError> =>
        Effect.tryPromise({
          try: () => fn(client),
          catch: (cause) =>
            new BrowserProviderError({ reason: "Browserbase SDK operation failed", cause }),
        }),
    );

    return {
      createSession,
      releaseSession,
      getCdpUrl,
      use,
    } satisfies BrowserbaseProviderService;
  });

/**
 * Service tag for the Browserbase browser provider.
 *
 * Adapts the Browserbase managed-browser service (Browserbase provides
 * hosted Chromium with persistent contexts and a CDP WebSocket endpoint)
 * into both the Browserbase-specific `BrowserbaseProvider` service and the
 * generic `BrowserProvider` service.
 *
 * **When to use**
 *
 * Use when you need a managed browser with persistent contexts, detailed
 * session metadata, and the official Browserbase SDK. For hosted browsers
 * with persistent profiles and fingerprinting controls, use the Steel
 * provider. For Cloudflare's browser-rendering API from any JS runtime,
 * use the CfBrowserRun (HTTP) provider. For Workers with a direct browser
 * binding (Playwright only), use the CfBrowserRunBinding provider.
 *
 * Sessions are created and released through the official Browserbase SDK
 * (`@browserbasehq/sdk`). Each raw SDK session is normalized into branded
 * fields: `id` becomes a `SessionId`, `createdAt` becomes a `DateTime.Utc`,
 * and `liveViewUrl` is constructed from the session id. The CDP URL is
 * computed by appending the API key as a query parameter to
 * `wss://connect.browserbase.com/v1/sessions/{id}`. Default session options
 * set on the layer merge with per-call options, and the `use` escape hatch
 * exposes the raw SDK for Browserbase-specific operations.
 *
 * **Example** (Provision a session and drive it with Playwright)
 *
 * ```typescript
 * import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";
 * import { Playwright } from "@effect-libs/browser-playwright";
 * import { Effect, Redacted } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const playwright = yield* Playwright;
 *   const provider = yield* BrowserbaseProvider;
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
 *     Effect.provide(BrowserbaseProvider.layer({ apiKey: Redacted.make(process.env.BROWSERBASE_API_KEY!) })),
 *     Effect.provide(Playwright.layer),
 *   ),
 * );
 * ```
 *
 * **Gotchas**
 *
 * - `releaseSession` is a soft release — it sets the session's status to
 *   `REQUEST_RELEASE` in the Browserbase backend, but the session is not
 *   deleted immediately. The backend reaps released sessions on its own
 *   schedule. If you need a hard delete, call the SDK directly via `use`.
 * - The CDP URL embeds the API key as a query string. The `Redacted` wrapper
 *   keeps it out of logs, but any custom logging of the raw URL will leak
 *   the key.
 * - `normalizeSession` falls back to `new Date()` when the SDK returns a
 *   timestamp that `DateTime.make` cannot parse. This is a non-deterministic
 *   fallback that should be considered a bug if it ever fires.
 *
 * @see {@link BrowserProvider} for the provider-agnostic interface
 * @see {@link BrowserbaseProviderService} for the full service contract
 *
 * @category providers
 * @since 0.1.0
 */
export class BrowserbaseProvider extends Context.Service<
  BrowserbaseProvider,
  BrowserbaseProviderService
>()("effect-libs/browser/BrowserbaseProvider") {
  /**
   * Factory for creating BrowserbaseProviderService instances.
   * Useful for creating mock implementations in tests.
   */
  static readonly of = (impl: BrowserbaseProviderService): BrowserbaseProviderService => impl;

  /**
   * Layer factory that provides BOTH BrowserbaseProvider AND BrowserProvider.
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
   * BrowserbaseProvider.layer({ apiKey: Redacted.make(process.env.BROWSERBASE_API_KEY!) })
   *
   * // With default session options
   * BrowserbaseProvider.layer({
   *   apiKey: Redacted.make(process.env.BROWSERBASE_API_KEY!),
   *   options: { projectId: "my-project" }
   * })
   * ```
   */
  static readonly layer = (
    options: BrowserbaseProviderOptions,
  ): Layer.Layer<BrowserbaseProvider | BrowserProvider> =>
    Layer.effectContext(
      make(options).pipe(
        Effect.map((provider) =>
          Context.make(BrowserbaseProvider, provider).pipe(Context.add(BrowserProvider, provider)),
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
   * // Read API key from BROWSERBASE_API_KEY env var
   * BrowserbaseProvider.layerConfig({
   *   apiKey: Config.redacted("BROWSERBASE_API_KEY")
   * })
   *
   * // With additional config options
   * BrowserbaseProvider.layerConfig({
   *   apiKey: Config.redacted("BROWSERBASE_API_KEY"),
   *   baseURL: Config.string("BROWSERBASE_BASE_URL").pipe(Config.withDefault("https://api.browserbase.com")),
   * })
   * ```
   */
  static readonly layerConfig = (
    options: BrowserbaseProviderConfigOptions,
  ): Layer.Layer<BrowserbaseProvider | BrowserProvider, Config.ConfigError> =>
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

        return Context.make(BrowserbaseProvider, provider).pipe(
          Context.add(BrowserProvider, provider),
        );
      }),
    );
}
