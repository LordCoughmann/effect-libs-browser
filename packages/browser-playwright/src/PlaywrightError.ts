/**
 * Structured Playwright service errors with reason-based pattern matching.
 *
 * Follows the Effect Reason Pattern: one parent error (`PlaywrightError`)
 * wrapping a `reason` union of specific failure types.
 *
 * @category errors
 * @since 0.1.0
 */

import { Schema } from "effect";

// ── Define the Specific Error Reasons ──────────────────────────────────────

/**
 * Playwright error reason: Connecting to the CDP endpoint failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class ConnectionError extends Schema.TaggedError<ConnectionError>()(
  "effect-libs/browser/PlaywrightError/ConnectionError",
  {
    description: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  get isRetryable(): boolean {
    return true;
  }
}

/**
 * Playwright error reason: Allocating a new browser context failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class ContextError extends Schema.TaggedError<ContextError>()(
  "effect-libs/browser/PlaywrightError/ContextError",
  {
    description: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  get isRetryable(): boolean {
    return true;
  }
}

/**
 * Playwright error reason: Page navigation failed (e.g., net::ERR_CONNECTION_REFUSED, timeout).
 *
 * @category errors
 * @since 0.1.0
 */
export class NavigationError extends Schema.TaggedError<NavigationError>()(
  "effect-libs/browser/PlaywrightError/NavigationError",
  {
    method: Schema.String,
    url: Schema.String,
    description: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  get isRetryable(): boolean {
    return true;
  }
}

/**
 * Playwright error reason: A general page operation failed (e.g., click, fill, evaluate, screenshot).
 *
 * @category errors
 * @since 0.1.0
 */
export class OperationError extends Schema.TaggedError<OperationError>()(
  "effect-libs/browser/PlaywrightError/OperationError",
  {
    method: Schema.String,
    description: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  get isRetryable(): boolean {
    // Operations like target detachment or timeouts might be retryable depending on app logic,
    // whereas evaluation syntax errors are not. Defaulting to true for upper-level retry combinators.
    return true;
  }
}

// ── Reason Union Types & Schemas ───────────────────────────────────────────

/**
 * Union of all Playwright error reason types.
 *
 * @category types
 * @since 0.1.0
 */
export type PlaywrightErrorReason =
  | ConnectionError
  | ContextError
  | NavigationError
  | OperationError;

/**
 * Schema union for encoding, decoding, and parsing Playwright error reasons.
 *
 * @category schemas
 * @since 0.1.0
 */
export const PlaywrightErrorReason: Schema.Union<
  [typeof ConnectionError, typeof ContextError, typeof NavigationError, typeof OperationError]
> = Schema.Union([ConnectionError, ContextError, NavigationError, OperationError]);

// ── Parent Error Domain Wrapper ────────────────────────────────────────────

/**
 * Top-level Playwright service error wrapper.
 *
 * Wraps a structured, nominal `reason` property for type-safe pattern matching.
 *
 * @category errors
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { PlaywrightError } from "@effect-libs/browser-playwright";
 *
 * // 1. Catch all Playwright errors at once — log them and re-fail with the
 * //    full typed error so the receiver sees `PlaywrightError` (not `Error`).
 * program.pipe(
 *   Effect.catchTag("effect-libs/browser/PlaywrightError", (e) =>
 *     Effect.gen(function* () {
 *       yield* Effect.logError(e.message);
 *       return yield* Effect.fail(e);
 *     }),
 *   ),
 * )
 *
 * // 2. Handle one specific reason with `Effect.catchReason` — the handler
 * //    receives the narrowed reason (e.g. `reason.url`), and any reason
 * //    that isn't matched re-fails with the typed `PlaywrightError`
 * //    (never with `new Error(...)`, which would lose the type).
 * //    Branch on `reason.url` to perform a recovery like navigating away.
 * program.pipe(
 *   Effect.catchReason(
 *     "effect-libs/browser/PlaywrightError",
 *     "effect-libs/browser/PlaywrightError/NavigationError",
 *     (reason) =>
 *       Effect.gen(function* () {
 *         yield* Effect.logWarning(`navigation failed, retrying once: ${reason.url}`);
 *         return yield* retryWithDifferentUrl(reason.url);
 *       }),
 *     (e) => Effect.fail(e),
 *   ),
 * );
 * ```
 */
export class PlaywrightError extends Schema.TaggedError<PlaywrightError>()(
  "effect-libs/browser/PlaywrightError",
  {
    source: Schema.String,
    method: Schema.String,
    reason: PlaywrightErrorReason,
  },
) {
  /**
   * Exposes the full structured reason object via the standard JavaScript error cause property.
   */
  override readonly cause = this.reason;

  /**
   * A highly detailed, human-readable message derived directly from the underlying reason.
   * Perfect for out-of-the-box telemetry, console logs, and third-party error tracking.
   */
  override get message(): string {
    const exactMethod = "method" in this.reason ? this.reason.method : this.method;
    return `[${this.source}.${exactMethod}] ${this.reason._tag}: ${this.reason.description}`;
  }

  /**
   * Transparently delegates retryability to the underlying reason class instance.
   */
  get isRetryable(): boolean {
    return this.reason.isRetryable;
  }
}
