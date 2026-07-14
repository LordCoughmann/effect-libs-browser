// fallow-ignore-next-line unused-files
/**
 * Browser test configuration using Effect Config.
 *
 * Provides typed, layered, redactable configuration for integration tests.
 */

import { Context, Effect, Layer, Config, Match, Redacted, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http";

import { ChromeVersionResponse } from "../../../packages/browser-cdp/src/internal/CdpSchema.js";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Default Chrome remote debugging port.
 */
export const DEFAULT_CHROME_PORT = 9222;

/**
 * Default HTTP test server port. Kept in sync with `HTTP_PORT` in
 * `tests/setup/http-server/Client.ts` — the server binds this port and
 * the test config layer falls back to it when `HTTP_BASE_URL` is unset.
 */
export const DEFAULT_HTTP_PORT = 9322;

/**
 * Default HTTP test server base URL.
 */
export const DEFAULT_HTTP_BASE_URL = `http://localhost:${DEFAULT_HTTP_PORT}`;

/**
 * Default Chrome WebSocket URL.
 */
export const DEFAULT_CHROME_WS_URL = `ws://localhost:${DEFAULT_CHROME_PORT}`;

// ── Configuration Interface ───────────────────────────────────────────────────

/**
 * Browser mode for integration tests.
 */
export type BrowserMode = "local" | "remote";

/**
 * Browser test configuration service interface.
 */
export interface TestBrowserConfigService {
  /** Browser mode: "local" (Chrome) or "remote" (Steel, Browserbase, etc.) */
  readonly mode: BrowserMode;
  /** WebSocket URL for CDP connection (empty for local mode, fetched from Chrome) */
  readonly wsUrl: Redacted.Redacted<string>;
  /** HTTP base URL for test server */
  readonly httpBaseUrl: string;
  /** Human-readable description */
  readonly description: string;
  /** Get the browser WebSocket URL (fetches from Chrome for local mode) */
  readonly getBrowserWsUrl: Effect.Effect<string, TestBrowserConfigError>;
}

// ── Error ─────────────────────────────────────────────────────────────────────

/**
 * Error thrown when browser test configuration is invalid.
 */
export class TestBrowserConfigError extends Schema.TaggedErrorClass<TestBrowserConfigError>()(
  "TestBrowserConfigError",
  {
    message: Schema.String,
  },
) {}

// ── Predicates ────────────────────────────────────────────────────────────────

const isValidBrowserMode = (v: string): v is BrowserMode => v === "local" || v === "remote";

// ── Config Reading (Direct Access) ────────────────────────────────────────────

/**
 * Read browser config values directly (without service layer).
 * Useful for module-level config access.
 */
export const readBrowserConfigSync = Effect.gen(function* () {
  const httpBaseUrl = yield* Config.string("HTTP_BASE_URL").pipe(
    Config.withDefault(DEFAULT_HTTP_BASE_URL),
  );
  const wsUrl = yield* Config.string("CHROME_WS_URL").pipe(
    Config.withDefault(DEFAULT_CHROME_WS_URL),
  );
  return { wsUrl, httpBaseUrl };
});

/**
 * Get browser config values synchronously.
 * Returns default values if config is not available.
 */
export const getBrowserConfigSync = (): { wsUrl: string; httpBaseUrl: string } =>
  Effect.runSync(readBrowserConfigSync);

// ── Config Service ────────────────────────────────────────────────────────────

/**
 * Make the browser test configuration.
 */
const make = Effect.gen(function* () {
  // Read and validate browser mode
  const mode = yield* Config.string("BROWSER_MODE").pipe(Config.withDefault("local"));

  if (!isValidBrowserMode(mode)) {
    return yield* new TestBrowserConfigError({
      message: `BROWSER_MODE must be 'local' or 'remote', got: '${mode}'`,
    });
  }

  const httpBaseUrl = yield* Config.string("HTTP_BASE_URL").pipe(
    Config.withDefault(DEFAULT_HTTP_BASE_URL),
  );

  return yield* Match.value(mode).pipe(
    Match.when("local", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const getBrowserWsUrl = client
          .get(`http://localhost:${DEFAULT_CHROME_PORT}/json/version`)
          .pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(ChromeVersionResponse)),
            Effect.mapError(
              (cause) =>
                new TestBrowserConfigError({
                  message: `Failed to fetch Chrome CDP URL: ${cause}`,
                }),
            ),
            Effect.map((data) => data.webSocketDebuggerUrl),
          );
        return {
          mode: "local",
          wsUrl: Redacted.make(""),
          httpBaseUrl,
          description: "Local Chrome (auto-started)",
          getBrowserWsUrl,
        } satisfies TestBrowserConfigService;
      }),
    ),
    Match.when("remote", () =>
      Effect.gen(function* () {
        const wsUrl = yield* Config.redacted("BROWSER_WS_URL");
        return {
          mode: "remote",
          wsUrl,
          httpBaseUrl,
          description: "Remote browser",
          getBrowserWsUrl: Effect.succeed(Redacted.value(wsUrl)),
        } satisfies TestBrowserConfigService;
      }),
    ),
    Match.exhaustive,
  );
});

/**
 * Browser test configuration service.
 */
export class TestBrowserConfig extends Context.Service<
  TestBrowserConfig,
  TestBrowserConfigService
>()("test/TestBrowserConfig", { make }) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(FetchHttpClient.layer));
}

// ── Convenience Functions ─────────────────────────────────────────────────────

/**
 * Check if browser is configured.
 * Run with Effect.runSync for module load time skip decisions.
 */
export const hasBrowserConfig: Effect.Effect<boolean, never, TestBrowserConfig> = Effect.gen(
  function* () {
    const config = yield* TestBrowserConfig;
    // Local mode is always available, remote needs wsUrl
    return config.mode === "local" || Redacted.value(config.wsUrl) !== "";
  },
);
