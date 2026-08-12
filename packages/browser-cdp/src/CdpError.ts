/**
 * Structured CDP service errors with reason-based pattern matching.
 *
 * Follows the Effect `SqlError` pattern: one parent error (`CdpError`)
 * wrapping a `reason` union of specific failure types. Each reason has an
 * `isRetryable` property for retry decisions.
 *
 * @category errors
 * @since 0.1.0
 */

import { Predicate as P, Schema } from "effect";

// ── Reason TypeId ─────────────────────────────────────────────────────────────

const ReasonTypeId = "~effect-libs/browser/CdpError/Reason" as const;

// ── Reason Classes ────────────────────────────────────────────────────────────

/**
 * CDP error reason: WebSocket connection failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class ConnectionError extends Schema.TaggedError<ConnectionError>()(
  "effect-libs/browser/CdpError/ConnectionError",
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
 * CDP error reason: Provider doesn't support `Target.createBrowserContext`.
 *
 * Thrown by `connection.withContext()` when the CDP provider rejects context
 * creation. Catch this reason and fall back to `connection.withPage()`.
 *
 * @category errors
 * @since 0.1.0
 */
export class ContextNotSupportedError extends Schema.TaggedError<ContextNotSupportedError>()(
  "effect-libs/browser/CdpError/ContextNotSupportedError",
  {
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return false;
  }
}

/**
 * CDP error reason: Page navigation failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class NavigationError extends Schema.TaggedError<NavigationError>()(
  "effect-libs/browser/CdpError/NavigationError",
  {
    url: Schema.String,
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return true;
  }
}

/**
 * CDP error reason: Page operation timed out.
 *
 * @category errors
 * @since 0.1.0
 */
export class PageTimeoutError extends Schema.TaggedError<PageTimeoutError>()(
  "effect-libs/browser/CdpError/PageTimeoutError",
  {
    selector: Schema.optional(Schema.String),
    timeout: Schema.Duration,
    /** State that was being waited for (attached/visible/hidden/detached) */
    state: Schema.optional(Schema.String),
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return true;
  }
}

/**
 * CDP error reason: CDP command returned an error response.
 *
 * @category errors
 * @since 0.1.0
 */
export class CommandError extends Schema.TaggedError<CommandError>()(
  "effect-libs/browser/CdpError/CommandError",
  {
    method: Schema.String,
    params: Schema.optional(Schema.Unknown),
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return false;
  }
}

/**
 * CDP error reason: `page.evaluate` threw or returned an error.
 *
 * @category errors
 * @since 0.1.0
 */
export class EvaluationError extends Schema.TaggedError<EvaluationError>()(
  "effect-libs/browser/CdpError/EvaluationError",
  {
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return false;
  }
}

/**
 * CDP error reason: Element not found or not interactable.
 *
 * @category errors
 * @since 0.1.0
 */
export class SelectorError extends Schema.TaggedError<SelectorError>()(
  "effect-libs/browser/CdpError/SelectorError",
  {
    selector: Schema.String,
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return false;
  }
}

/**
 * CDP error reason: Screenshot capture failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class ScreenshotError extends Schema.TaggedError<ScreenshotError>()(
  "effect-libs/browser/CdpError/ScreenshotError",
  {
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return false;
  }
}

/**
 * CDP error reason: Cookie get/set failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class CookieError extends Schema.TaggedError<CookieError>()(
  "effect-libs/browser/CdpError/CookieError",
  {
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return false;
  }
}

/**
 * CDP error reason: Session/localStorage operation failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class StorageError extends Schema.TaggedError<StorageError>()(
  "effect-libs/browser/CdpError/StorageError",
  {
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return false;
  }
}

/**
 * CDP error reason: PDF generation failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class PdfError extends Schema.TaggedError<PdfError>()(
  "effect-libs/browser/CdpError/PdfError",
  {
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return false;
  }
}

/**
 * CDP error reason: Page-context fetch request failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class FetchError extends Schema.TaggedError<FetchError>()(
  "effect-libs/browser/CdpError/FetchError",
  {
    url: Schema.String,
    status: Schema.optional(Schema.Finite),
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return true;
  }
}

/**
 * CDP error reason: Viewport size change failed.
 *
 * @category errors
 * @since 0.1.0
 */
export class ViewportError extends Schema.TaggedError<ViewportError>()(
  "effect-libs/browser/CdpError/ViewportError",
  {
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return false;
  }
}

/**
 * CDP error reason: Content unavailable during navigation.
 *
 * Thrown when `page.content()` or `frame.content` is called while
 * the page/frame is actively navigating.
 *
 * @category errors
 * @since 0.1.0
 */
export class ContentUnavailableError extends Schema.TaggedError<ContentUnavailableError>()(
  "effect-libs/browser/CdpError/ContentUnavailableError",
  {
    description: Schema.String,
  },
) {
  readonly [ReasonTypeId] = ReasonTypeId;
  get isRetryable(): boolean {
    return true;
  }
}

// ── Reason Union ──────────────────────────────────────────────────────────────

/**
 * Union of all CDP error reason types.
 *
 * @category types
 * @since 0.1.0
 */
export type CdpErrorReason =
  | ConnectionError
  | ContextNotSupportedError
  | NavigationError
  | PageTimeoutError
  | CommandError
  | EvaluationError
  | SelectorError
  | ScreenshotError
  | PdfError
  | CookieError
  | StorageError
  | FetchError
  | ViewportError
  | ContentUnavailableError;

/**
 * Schema union for encoding and decoding CDP error reasons.
 *
 * @category schemas
 * @since 0.1.0
 */
export const CdpErrorReason: Schema.Union<
  [
    typeof ConnectionError,
    typeof ContextNotSupportedError,
    typeof NavigationError,
    typeof PageTimeoutError,
    typeof CommandError,
    typeof EvaluationError,
    typeof SelectorError,
    typeof ScreenshotError,
    typeof PdfError,
    typeof CookieError,
    typeof StorageError,
    typeof FetchError,
    typeof ViewportError,
    typeof ContentUnavailableError,
  ]
> = Schema.Union([
  ConnectionError,
  ContextNotSupportedError,
  NavigationError,
  PageTimeoutError,
  CommandError,
  EvaluationError,
  SelectorError,
  ScreenshotError,
  PdfError,
  CookieError,
  StorageError,
  FetchError,
  ViewportError,
  ContentUnavailableError,
]);

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Extracts the short name from a namespaced _tag string.
 *
 * @example
 * shortTag("effect-libs/browser/CdpError/EvaluationError") // "EvaluationError"
 */
const shortTag = (tag: string): string => tag.split("/").pop() ?? tag;

const TypeId = "~effect-libs/browser/CdpError" as const;

/**
 * Top-level CDP service error wrapper.
 *
 * Wraps a structured `reason` for pattern matching. Use `catchTag("CdpError", ...)`
 * to catch all CDP errors, or match on specific reason classes.
 *
 * @category errors
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { CdpError } from "@effect-libs/browser-cdp";
 *
 * // 1. Catch all CDP errors at once — log them and re-fail with the full
 * //    typed error so the receiver sees `CdpError` (not `Error`).
 * program.pipe(
 *   Effect.catchTag("effect-libs/browser/CdpError", (e) =>
 *     Effect.gen(function* () {
 *       yield* Effect.logError(e.message);
 *       return yield* Effect.fail(e);
 *     }),
 *   ),
 * )
 *
 * // 2. Handle one specific reason with `Effect.catchReason` — the handler
 * //    receives the narrowed reason (e.g. `reason.selector`), and any
 * //    reason that isn't matched re-fails with the typed `CdpError`
 * //    (never with `new Error(...)`, which would lose the type).
 * //    Fall back to a page-only session when the provider rejects contexts.
 * program.pipe(
 *   Effect.catchReason(
 *     "effect-libs/browser/CdpError",
 *     "effect-libs/browser/CdpError/ContextNotSupportedError",
 *     (reason) =>
 *       Effect.gen(function* () {
 *         yield* Effect.logWarning(`falling back to withPage: ${reason.description}`);
 *         return yield* cdp.withPage((p) => p.goto("https://example.com"));
 *       }),
 *     (e) => Effect.fail(e),
 *   ),
 * );
 * ```
 */
export class CdpError extends Schema.TaggedError<CdpError>()("effect-libs/browser/CdpError", {
  source: Schema.String,
  method: Schema.String,
  reason: CdpErrorReason,
}) {
  readonly [TypeId] = TypeId;

  /**
   * Exposes the structured reason as the JavaScript error cause.
   */
  override readonly cause = this.reason;

  /**
   * Human-readable message derived from source, method, and reason.
   */
  override get message(): string {
    const tag = shortTag(this.reason._tag);
    const desc = this.reasonDescription;
    return desc
      ? `${this.source}.${this.method}: ${tag} — ${desc}`
      : `${this.source}.${this.method}: ${tag}`;
  }

  /** Extract a human-readable description from the reason. */
  private get reasonDescription(): string | undefined {
    // All CdpErrorReason subclasses have common string fields.
    // Check each reason type for description/selector/url.
    const reason = this.reason;
    if ("description" in reason && P.isString(reason.description)) return reason.description;
    if ("selector" in reason && P.isString(reason.selector)) return reason.selector;
    if ("url" in reason && P.isString(reason.url)) return reason.url;
    return undefined;
  }

  /**
   * Delegates retryability to the underlying reason.
   */
  get isRetryable(): boolean {
    return this.reason.isRetryable;
  }
}

// ── Transport-layer errors ───────────────────────────────────────────────────
//
// Defined in `internal/CdpProtocolError.ts` (the transport layer's own errors,
// produced by `internal/CdpConnection.ts` and the generated `internal/CdpProtocol.ts`).
// Re-exported here so the public surface has one import for every catchable error.

export {
  /**
   * @since 0.1.0
   */
  CdpConnectionError,
  /**
   * @since 0.1.0
   */
  CdpTimeoutError,
  /**
   * @since 0.1.0
   */
  CdpCommandError,
  /**
   * @since 0.1.0
   */
  CdpMessageParseError,
} from "./internal/CdpProtocolError.js";

// ── Tag-based type guards ────────────────────────────────────────────────────
//
// `Schema.TaggedError` does not auto-generate a `.is()` static method
// (verified against `effect-smol/packages/effect/src/Schema.ts`). For value-
// side narrowing (e.g., in `Effect.mapError(cause => ...)` handlers or
// `Effect.try({ catch: e => ... })` blocks), use these one-line guards
// instead of `instanceof X` — they check the `_tag` discriminant via
// `Predicate.isTagged`, work across module / worker / structured-clone
// boundaries, and return proper `u is X` type predicates.

/**
 * Type guard: `u` is a `CdpError` (any reason).
 *
 * @category utilities
 * @since 0.1.0
 */
export const isCdpError = (u: unknown): u is CdpError =>
  P.isTagged("effect-libs/browser/CdpError")(u);

/**
 * Type guard: `u` is a `SelectorError` reason.
 *
 * @category utilities
 * @since 0.1.0
 */
export const isSelectorError = (u: unknown): u is SelectorError =>
  P.isTagged("effect-libs/browser/CdpError/SelectorError")(u);

/**
 * Type guard: `u` is an `EvaluationError` reason.
 *
 * @category utilities
 * @since 0.1.0
 */
export const isEvaluationError = (u: unknown): u is EvaluationError =>
  P.isTagged("effect-libs/browser/CdpError/EvaluationError")(u);
