/**
 * Shared fetch schemas and types for browser-context HTTP requests.
 *
 * Used by both `browser-cdp` and `browser-playwright`. The fetch logic is identical
 * for both — only the evaluate backend differs (Runtime.evaluate vs page.evaluate).
 *
 * @category schemas
 * @since 0.1.0
 */

import type { Input as DurationInput } from "effect/Duration";

import { Schema } from "effect";

/**
 * Response from a fetch operation in the browser context.
 *
 * @category schemas
 * @since 0.1.0
 */
export class FetchResponse extends Schema.Class<FetchResponse>("effect-libs/browser/FetchResponse")(
  {
    status: Schema.Finite,
    ok: Schema.Boolean,
    headers: Schema.Record(Schema.String, Schema.String),
    body: Schema.String,
  },
) {}

/**
 * Successful fetch result from page.evaluate.
 *
 * @category schemas
 * @since 0.1.0
 */
export class FetchSuccess extends Schema.Class<FetchSuccess>("effect-libs/browser/FetchSuccess")({
  ok: Schema.Literal(true),
  data: FetchResponse,
}) {}

/**
 * Error response from fetch in page.evaluate (distinct from FetchError type).
 *
 * @category schemas
 * @since 0.1.0
 */
export class FetchErrorResponse extends Schema.Class<FetchErrorResponse>(
  "effect-libs/browser/FetchErrorResponse",
)({
  ok: Schema.Literal(false),
  error: Schema.String,
  message: Schema.optional(Schema.String),
}) {}

/**
 * Raw JavaScript error (when syntax error occurs in evaluated code).
 *
 * @category schemas
 * @since 0.1.0
 */
export class RawError extends Schema.Class<RawError>("effect-libs/browser/RawError")({
  message: Schema.String,
  stack: Schema.optional(Schema.String),
}) {}

/**
 * Any fetch result (success, error response, or raw error).
 *
 * @category schemas
 * @since 0.1.0
 */
export const FetchResult = Schema.Union([FetchSuccess, FetchErrorResponse, RawError]);
/**
 * Type-level alias for `FetchResult`.
 *
 * @category types
 * @since 0.1.0
 */
export type FetchResult = typeof FetchResult.Type;

/**
 * Options for page.fetch() requests.
 *
 * @category models
 * @since 0.1.0
 */
export interface FetchOptions {
  /** HTTP method (default: "GET") */
  readonly method?: string;
  /** Request headers */
  readonly headers?: Record<string, string>;
  /**
   * Request body. Three shapes are supported:
   * - `string`: sent as a UTF-8 text body (no transformation)
   * - `Uint8Array`: sent as raw bytes (e.g. a pre-encoded protobuf payload).
   *   Browsers' `fetch()` accepts `BufferSource` (which `Uint8Array` is) as a
   *   `BodyInit`, so the bytes round-trip without re-encoding.
   * - `object` (anything that isn't a string or `Uint8Array`): serialized with
   *   `JSON.stringify` before sending. Pass `headers: { "content-type":
   *   "application/json" }` if you want the server to see the JSON content type.
   *
   * `null` is treated as "no body" by the browser's `fetch()`.
   *
   * @example
   * ```typescript
   * // String body
   * yield* page.fetch(url, { method: "POST", body: "raw text" });
   *
   * // Binary body
   * yield* page.fetch(url, { method: "POST", body: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) });
   *
   * // JSON object body
   * yield* page.fetch(url, {
   *   method: "POST",
   *   body: { foo: "bar" },
   *   headers: { "content-type": "application/json" },
   * });
   * ```
   */
  readonly body?: string | Uint8Array | object;
  /** Request timeout (DurationInput, default: "30 seconds") */
  readonly timeout?: DurationInput;
}
