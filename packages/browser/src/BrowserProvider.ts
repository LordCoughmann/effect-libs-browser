/**
 * Base types and service for browser-provider integrations.
 *
 * Every concrete provider (Steel, Browserbase, Cloudflare Browser Run HTTP
 * and Binding) implements `BrowserProviderService` and publishes a
 * `BrowserProvider` layer. See the {@link BrowserProvider} class below for
 * the consumer-facing documentation (when to use, mental model, common
 * tasks, example, gotchas).
 */
import type { Effect, Redacted, DateTime } from "effect";

import { Brand, Context, Option, Predicate, Schema } from "effect";

import { getCauseMessage } from "./utils/error.js";

/**
 * Layer configuration shared by every provider — the API key and
 * optional base URL. Per-provider options are a separate generic on
 * {@link BrowserProviderService}.
 *
 * @category models
 * @since 0.1.0
 */
export interface BrowserProviderOptions {
  readonly apiKey: Redacted.Redacted<string>;
  readonly baseURL?: string;
}

/**
 * A branded session identifier — the primary handle for correlating
 * logs and for provider-specific API calls that take a session id.
 *
 * @category types
 * @since 0.1.0
 */
export type SessionId = Brand.Branded<string, "SessionId">;
export const SessionId = Brand.nominal<SessionId>();

/**
 * A branded absolute URL — wraps a `string` with a phantom tag so
 * URL parameters can be distinguished from arbitrary strings at the
 * type level.
 *
 * @category types
 * @since 0.1.0
 */
export type UrlString = Brand.Branded<string, "UrlString">;
export const UrlString = Brand.nominal<UrlString>();

const getStatusFromCause = (cause: unknown): Option.Option<number> => {
  if (Predicate.hasProperty(cause, "status") && Predicate.isNumber(cause.status))
    return Option.some(cause.status);
  if (Predicate.hasProperty(cause, "statusCode") && Predicate.isNumber(cause.statusCode))
    return Option.some(cause.statusCode);
  return Option.none();
};

const RETRYABLE_HTTP_STATUS_CODES = new Set([401, 403, 409, 429, 502, 503, 504]);
const isRetryableHttpStatus = (status: number): boolean => RETRYABLE_HTTP_STATUS_CODES.has(status);

/**
 * The error type every provider's `createSession` and `releaseSession`
 * fail with. Inspect {@link isRetryable} to decide whether a
 * 401/403/409/429/502/503/504 response is worth retrying.
 *
 * @category errors
 * @since 0.1.0
 */
export class BrowserProviderError extends Schema.TaggedErrorClass<BrowserProviderError>()(
  "effect-libs/browser/BrowserProviderError",
  {
    reason: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return Option.getOrElse(getCauseMessage(this.cause), () => this.reason);
  }

  get isRetryable(): boolean {
    return Option.exists(getStatusFromCause(this.cause), isRetryableHttpStatus);
  }
}

/**
 * The fields every provider session exposes. A session is a single
 * remote browser instance on the provider's infrastructure — an
 * isolated browser with its own cookies, localStorage, and state.
 * Provider features and limits (timeouts, live view, recording,
 * billing) live in the provider's documentation, not in this type.
 *
 * @category models
 * @since 0.1.0
 */
export interface BrowserProviderSessionBase {
  /**
   * Unique session identifier. The primary handle for correlating logs and
   * for provider-specific API calls that take a session id.
   */
  readonly id: SessionId;
  /**
   * When the session was created. For HTTP-backed providers this is local
   * process time (the API does not return a server-side timestamp).
   */
  readonly createdAt: DateTime.DateTime;
  /**
   * Optional URL for a live view of the browser session, if the provider
   * supports it. Share with a user for human-in-the-loop workflows.
   */
  readonly liveViewUrl?: UrlString;
}

/**
 * A provider session extended with the CDP WebSocket URL. Pass to
 * `withConnection({ session })` (Playwright) or any driver that
 * takes a CDP URL to connect to an existing session without
 * creating a new one.
 *
 * @see {@link BrowserProviderSessionBase} for the common fields
 * @see {@link BrowserProviderSession.cdpUrl} for the CDP endpoint
 *
 * @category models
 * @since 0.1.0
 */
export interface BrowserProviderSession extends BrowserProviderSessionBase {
  /**
   * The Chrome DevTools Protocol WebSocket URL for this session, redacted
   * to prevent accidental logging. Pass to Playwright's
   * `chromium.connectOverCDP` (or use the `withConnection({ session })`
   * helpers in any browser driver) to open a connection.
   */
  readonly cdpUrl: Redacted.Redacted<UrlString>;
}

/**
 * The service contract every browser provider implements — three
 * operations for provisioning and tearing down sessions, plus a CDP
 * URL lookup. The `Session` type is generic so providers that expose
 * additional fields (e.g. Steel's profile metadata) can narrow or
 * extend it.
 *
 * @see {@link BrowserProvider} for the consumer-facing service tag
 *
 * @category models
 * @since 0.1.0
 */
export interface BrowserProviderService<
  Session extends BrowserProviderSessionBase = BrowserProviderSessionBase,
  Options = any,
> {
  readonly createSession: (options?: Options) => Effect.Effect<Session, BrowserProviderError>;
  readonly releaseSession: (sessionId: SessionId) => Effect.Effect<void, BrowserProviderError>;
  readonly getCdpUrl: (sessionId: SessionId) => Option.Option<Redacted.Redacted<UrlString>>;
}

/**
 * Service tag for the generic browser-provider service.
 *
 * **When to use**
 *
 * Use when you want provider-agnostic code that works with any
 * `BrowserProviderService` (Steel, Browserbase, Cloudflare Browser Run
 * HTTP or Binding). For provider-specific features — Steel's profile
 * metadata, Browserbase's project context — depend on the concrete
 * provider tag (e.g. `SteelProvider`) instead.
 *
 * **Mental model**
 *
 * The service has three tracks at the type level, parallel to the driver
 * services in `src/cdp`, `src/playwright`, and `src/stagehand`:
 *
 * - **`BrowserProviderOptions`** is the layer configuration (API key, base URL).
 *   Per-provider options are a separate generic.
 * - **`BrowserProviderSession`** is the result of `createSession` — a
 *   branded `SessionId`, a `DateTime` timestamp, an optional `liveViewUrl`
 *   for hosted viewing, and a `Redacted` `cdpUrl` used as the connection
 *   endpoint.
 * - **`BrowserProviderService`** is the service shape itself: `createSession`,
 *   `releaseSession`, and `getCdpUrl`. The `Session` type is generic so
 *   providers that expose additional fields (e.g. Steel's profile metadata)
 *   can narrow or extend it.
 *
 * **Common tasks**
 *
 * - Depend on the generic `BrowserProvider` tag in provider-agnostic code.
 * - Depend on a concrete provider tag (e.g. `SteelProvider`) when you need
 *   provider-specific features.
 * - Surface a `BrowserProviderError` with `isRetryable` to check whether a
 *   401/403/409/429/502/503/504 response should be retried.
 *
 * **Example** (Provider-agnostic code)
 *
 * ```typescript
 * import { BrowserProvider, BrowserProviderError } from "@effect-libs/browser";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const provider = yield* BrowserProvider;
 *   const session = yield* provider.createSession();
 *   // ...drive `session.cdpUrl` with Playwright or CDP...
 *   yield* provider.releaseSession(session.id);
 * });
 *
 * Effect.runPromise(program); // .pipe(Effect.provide(SteelProvider.layer(...)))
 * ```
 *
 * **Gotchas**
 *
 * - `cdpUrl` is `Redacted` so it doesn't appear in logs; unwrap it only
 *   inside an `Effect` that needs the value.
 * - `getCdpUrl` returns `Option` because some providers only have a CDP URL
 *   available on the session object, not via a separate lookup.
 * - `BrowserProviderError.isRetryable` is heuristic — it inspects the
 *   underlying cause for a numeric HTTP status. Providers that don't expose
 *   status will report `false`.
 *
 * @see {@link BrowserProviderService} for the service contract
 *
 * @category services
 * @since 0.1.0
 */
export class BrowserProvider extends Context.Service<BrowserProvider, BrowserProviderService>()(
  "effect-libs/browser/BrowserProvider",
) {}
