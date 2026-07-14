import { Duration, Schema } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

/**
 * Error thrown when CDP connection fails.
 *
 * Thrown when:
 * - WebSocket fails to connect (invalid URL, network issue)
 * - Connection drops unexpectedly
 * - Connection timeout elapses
 *
 * @example
 * ```typescript
 * import { CdpConnectionError } from "@effect-libs/browser-cdp";
 * import { Effect } from "effect";
 *
 * cdp.withConnection({ url: "wss://..." }, ({ page }) => ...).pipe(
 *   Effect.catchTag("effect-libs/browser/CdpConnectionError", (e) => {
 *     console.log(e.reason);  // "Connection timeout", "WebSocket error", etc.
 *     console.log(e.cause);   // Optional underlying error
 *     return retryOrFallback();
 *   }),
 * );
 * ```
 */
export class CdpConnectionError extends Schema.TaggedErrorClass<CdpConnectionError>()(
  "effect-libs/browser/CdpConnectionError",
  {
    reason: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message() {
    return this.reason;
  }
}

/**
 * Error thrown when CDP command times out.
 *
 * Includes method name and timeout duration for debugging.
 * Thrown when a CDP command doesn't receive a response within the timeout.
 *
 * @example
 * ```typescript
 * import { CdpTimeoutError } from "@effect-libs/browser-cdp";
 * import { Effect } from "effect";
 *
 * cdp.withConnection({ url: "wss://..." }, ({ page }) => ...).pipe(
 *   Effect.catchTag("effect-libs/browser/CdpTimeoutError", (e) => {
 *     console.log(e.method);     // "Page.navigate", "Runtime.evaluate", etc.
 *     console.log(e.timeout);  // 30000 (default)
 *     console.log(e.message);    // "Timeout after 30000ms waiting for Page.navigate"
 *     return retryWithLongerTimeout();
 *   }),
 * );
 * ```
 */
export class CdpTimeoutError extends Schema.TaggedErrorClass<CdpTimeoutError>()(
  "effect-libs/browser/CdpTimeoutError",
  {
    method: Schema.String,
    timeout: Schema.Duration,
  },
) {
  override get message() {
    return `Timeout after ${Duration.format(this.timeout)} waiting for ${this.method}`;
  }
}

/**
 * Error thrown when CDP command returns an error response.
 *
 * Includes CDP error code for programmatic handling.
 * See https://chromedevtools.github.io/devtools-protocol/ for error codes.
 *
 * @example
 * ```typescript
 * import { CdpCommandError } from "@effect-libs/browser-cdp";
 * import { Effect } from "effect";
 *
 * cdp.withConnection({ url: "wss://..." }, ({ page }) => ...).pipe(
 *   Effect.catchTag("effect-libs/browser/CdpCommandError", (e) => {
 *     console.log(e.code);     // CDP error code (e.g., -32000)
 *     console.log(e.message);  // CDP error message
 *     console.log(e.method);   // The CDP method that failed
 *     return handleError(e.code);
 *   }),
 * );
 * ```
 */
export class CdpCommandError extends Schema.TaggedErrorClass<CdpCommandError>()(
  "effect-libs/browser/CdpCommandError",
  {
    code: Schema.Finite,
    message: Schema.String,
    method: Schema.String,
  },
) {
  /**
   * Create CdpCommandError from a CDP error response
   */
  public static fromCdpError(method: string, error: { code: number; message: string }) {
    return new CdpCommandError({ code: error.code, message: error.message, method });
  }

  /**
   * Create CdpCommandError for a validation failure
   */
  public static fromValidationError(method: string, message: string) {
    return new CdpCommandError({ code: -1, message, method });
  }
}

/**
 * Error thrown when CDP message parsing fails
 * Used when JSON.parse or schema validation fails on incoming WebSocket messages
 */
export class CdpMessageParseError extends Schema.TaggedErrorClass<CdpMessageParseError>()(
  "effect-libs/browser/CdpMessageParseError",
  Schema.Struct({
    cause: Schema.Defect(),
    raw: Schema.optional(Schema.String),
  }),
) {
  override get message(): string {
    return `Failed to parse CDP message: ${getErrorMessage(this.cause)}`;
  }
}
