/**
 * Structured Stagehand service errors with reason-based pattern matching.
 *
 * Follows the Effect `SqlError` pattern: one parent error (`StagehandError`)
 * wrapping a `reason` union of specific failure types.
 *
 * @category errors
 * @since 0.1.0
 */

import { Schema } from "effect";

// ── Reason TypeId ─────────────────────────────────────────────────────────────

const ReasonTypeId = "~effect-libs/browser/StagehandError/Reason" as const;

// ── Reason Classes ────────────────────────────────────────────────────────────

/**
 * Stagehand error reason: Stagehand initialization or connection failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class ConnectionError extends Schema.TaggedError<ConnectionError>()(
  "effect-libs/browser/StagehandError/ConnectionError",
  {
    description: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return true;
  }
}

/**
 * Stagehand error reason: `act`/`extract`/`observe` operation failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class OperationError extends Schema.TaggedError<OperationError>()(
  "effect-libs/browser/StagehandError/OperationError",
  {
    action: Schema.String,
    description: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return true;
  }
}

/**
 * Stagehand error reason: AI agent error (API, model, etc.).
 *
 * @category errors
 * @since 0.1.0
 */
export class AgentError extends Schema.TaggedError<AgentError>()(
  "effect-libs/browser/StagehandError/AgentError",
  {
    description: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return true;
  }
}

// ── Reason Union ──────────────────────────────────────────────────────────────

/**
 * Union of all Stagehand error reason types.
 *
 * @category types
 * @since 0.1.0
 */
export type StagehandErrorReason = ConnectionError | OperationError | AgentError;

/**
 * Schema union for encoding and decoding Stagehand error reasons.
 *
 * @category schemas
 * @since 0.1.0
 */
export const StagehandErrorReason: Schema.Union<
  [typeof ConnectionError, typeof OperationError, typeof AgentError]
> = Schema.Union([ConnectionError, OperationError, AgentError]);

// ── Parent Error ──────────────────────────────────────────────────────────────

const TypeId = "~effect-libs/browser/StagehandError" as const;

/**
 * Top-level Stagehand service error wrapper.
 *
 * Wraps a structured `reason` for pattern matching.
 *
 * @category errors
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { StagehandError } from "@effect-libs/browser-stagehand";
 *
 * // 1. Catch all Stagehand errors at once — log them and re-fail with the
 * //    full typed error so the receiver sees `StagehandError` (not `Error`).
 * program.pipe(
 *   Effect.catchTag("effect-libs/browser/StagehandError", (e) =>
 *     Effect.gen(function* () {
 *       yield* Effect.logError(e.message);
 *       return yield* Effect.fail(e);
 *     }),
 *   ),
 * )
 *
 * // 2. Handle one specific reason with `Effect.catchReason` — the handler
 * //    receives the narrowed reason (e.g. `reason.description`), and any
 * //    reason that isn't matched re-fails with the typed `StagehandError`
 * //    (never with `new Error(...)`, which would lose the type).
 * //    Retry agent failures with a fallback model instead of the same one.
 * program.pipe(
 *   Effect.catchReason(
 *     "effect-libs/browser/StagehandError",
 *     "effect-libs/browser/StagehandError/AgentError",
 *     (reason) =>
 *       Effect.gen(function* () {
 *         yield* Effect.logWarning(`agent failed, switching model: ${reason.description}`);
 *         return yield* retryWithFallbackModel(reason.description);
 *       }),
 *     (e) => Effect.fail(e),
 *   ),
 * );
 * ```
 */
export class StagehandError extends Schema.TaggedError<StagehandError>()(
  "effect-libs/browser/StagehandError",
  {
    source: Schema.String,
    method: Schema.String,
    reason: StagehandErrorReason,
  },
) {
  readonly [TypeId] = TypeId;

  /**
   * Exposes the structured reason as the JavaScript error cause.
   */
  override readonly cause = this.reason;

  /**
   * Human-readable message derived from source, method, and reason.
   *
   * Mirrors the format used by {@link CdpError} and {@link PlaywrightError}:
   * `${source}.${method}: ${reason._tag} — ${description}`. All three
   * Stagehand reason classes (`ConnectionError`, `OperationError`,
   * `AgentError`) carry a required `description` field, so the "no
   * description" branch is defensive (handles future reason types that
   * don't have one).
   */
  override get message(): string {
    const desc =
      "description" in this.reason
        ? (this.reason as { readonly description: string }).description
        : undefined;
    return desc
      ? `${this.source}.${this.method}: ${this.reason._tag} — ${desc}`
      : `${this.source}.${this.method}: ${this.reason._tag}`;
  }

  /**
   * Delegates retryability to the underlying reason.
   */
  get isRetryable(): boolean {
    return this.reason.isRetryable;
  }
}
