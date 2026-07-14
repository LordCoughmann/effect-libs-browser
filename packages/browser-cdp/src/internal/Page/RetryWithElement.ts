/**
 * Retry helper for element operations.
 *
 * Implements Playwright-style retry logic where the element find + action
 * are combined in a single retry loop. If the action fails due to element
 * disconnection, the whole operation is retried.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Duration, Effect, Predicate } from "effect";

import { CdpError, PageTimeoutError } from "../../CdpError.js";
import { sleep } from "../sleep.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

/**
 * Special return value signaling element not found - triggers retry.
 * Browser-side code returns this when element is not found.
 */
export const ELEMENT_NOT_FOUND = "__ELEMENT_NOT_FOUND__" as const;

/**
 * Special return value signaling element disconnected - triggers retry.
 * Browser-side code returns this when element was found but disconnected during action.
 */
export const ELEMENT_DISCONNECTED = "__ELEMENT_DISCONNECTED__" as const;

type ElementRetrySignal = typeof ELEMENT_NOT_FOUND | typeof ELEMENT_DISCONNECTED;

/**
 * Options for retryWithElement.
 */
export interface RetryWithElementOptions {
  /** Maximum wait time */
  timeout?: Duration.Duration;
}

/**
 * Execute an action on an element with automatic retry.
 *
 * This combines element finding and action execution in a single evaluatePage call.
 * If the element is not found or becomes disconnected during the action,
 * the operation is retried automatically.
 *
 * The browserCode function should:
 * 1. Query for the element (using provided helper)
 * 2. Execute the action
 * 3. Return ELEMENT_NOT_FOUND if element not found
 * 4. Return ELEMENT_DISCONNECTED if element disconnected during action
 * 5. Return the result on success
 *
 * **Timeout semantics (matches Playwright's `retryWithProgressAndTimeouts`):**
 * the total wall-clock time is bounded by `timeout` regardless of how long
 * individual `evaluatePage` calls take. Each iteration:
 *  1. Checks the wall-clock deadline BEFORE invoking `evaluatePage`.
 *  2. Wraps `evaluatePage` in `Effect.timeout(remainingMs)` so a hung
 *     CDP call cannot blow past the deadline.
 *  3. Maps `TimeoutError` to the `ELEMENT_NOT_FOUND` retry signal via
 *     `Effect.catchTag`; `CdpError` falls through the error channel
 *     unchanged and propagates to the caller.
 *  4. Returns the value on success, sleeps with a bounded delay, and
 *     loops. Fails with `PageTimeoutError` once the deadline is hit.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param browserCode - Browser-side code that finds element and executes action
 * @param options - Retry options
 * @returns The result of the action
 */
export const retryWithElement = Effect.fn("CdpPage.retryWithElement")(function <A>(
  conn: CdpConnection["Service"],
  state: PageState,
  browserCode: (...args: any[]) => A | ElementRetrySignal,
  args: unknown,
  options?: RetryWithElementOptions,
) {
  const timeout = options?.timeout ?? Duration.seconds(30);
  const timeoutMs = Duration.toMillis(timeout);
  const selector = Predicate.isString(args) ? args : Array.isArray(args) ? args[0] : "unknown";

  // Polling delays matching Playwright's retryWithProgressAndTimeouts.
  const startTime = Date.now();
  const delays = [0, 20, 50, 100, 100, 500] as const;
  let delayIndex = 0;

  const failTimeout = (): Effect.Effect<never, CdpError> =>
    Effect.fail(
      new CdpError({
        module: "CdpPage",
        method: "retryWithElement",
        reason: new PageTimeoutError({
          selector,
          timeout,
          state: "attached",
        }),
      }),
    );

  return Effect.gen(function* () {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Hard deadline check before each iteration.
      const elapsed = Date.now() - startTime;
      const remainingMs = timeoutMs - elapsed;
      if (remainingMs <= 0) {
        return yield* failTimeout();
      }

      // Bound `evaluatePage` by the remaining budget. The success channel
      // is `A | ElementRetrySignal`. Per-iteration outcomes:
      //   - `A` (real value) → return
      //   - `ELEMENT_NOT_FOUND` / `ELEMENT_DISCONNECTED` → retry
      //   - `TimeoutError` → mapped to `ELEMENT_NOT_FOUND` → retry
      //   - `CdpError` → propagates through the error channel naturally
      //     (no manual `instanceof` / `Cause` / `as` discrimination).
      const result = yield* evaluatePage<A | ElementRetrySignal>(
        conn,
        state,
        browserCode,
        args,
      ).pipe(
        Effect.timeout(`${remainingMs} millis`),
        Effect.catchTag("TimeoutError", () =>
          Effect.succeed<A | ElementRetrySignal>(ELEMENT_NOT_FOUND),
        ),
      );

      if (result !== ELEMENT_NOT_FOUND && result !== ELEMENT_DISCONNECTED) {
        return result;
      }
      // ELEMENT_NOT_FOUND / ELEMENT_DISCONNECTED / TimeoutError → fall through to retry.

      // Retry path: bounded sleep so we don't oversleep the deadline.
      const delay = delays[Math.min(delayIndex, delays.length - 1)] ?? 0;
      delayIndex++;
      const sleepRemaining = timeoutMs - (Date.now() - startTime);
      if (sleepRemaining <= 0) {
        return yield* failTimeout();
      }
      if (delay > 0) {
        yield* sleep(Math.min(delay, sleepRemaining));
      }
    }
  });
});

/**
 * Retry delay schedule matching Playwright's polling intervals.
 */
export const RetryDelays = [0, 20, 50, 100, 100, 500] as const;

/**
 * Retry loop for CDP-based element operations.
 *
 * Wraps a CDP operation that returns `null` when the element is not found.
 * If `null` is returned, the operation is retried until timeout.
 *
 * Use this for operations that use CDP DOM API (DOM.querySelector, etc.)
 * instead of evaluatePage.
 *
 * **Timeout semantics (matches Playwright's `retryWithProgressAndTimeouts`):**
 * The total wall-clock time is bounded by `timeout` regardless of how long
 * individual `operation` calls take. A deadline is computed at start; each
 * iteration checks the deadline BEFORE invoking `operation`, and the
 * operation itself is wrapped in `Effect.timeout` so a hung CDP call
 * cannot blow past the deadline. `TimeoutError` is mapped to `null`
 * (the same retry signal as "element not found") via `Effect.catchTag`;
 * `CdpError` falls through the error channel unchanged. When the deadline
 * is hit, the loop fails with a `PageTimeoutError`.
 *
 * @param operation - The CDP operation Effect. Returns `null` to signal retry.
 * @param selector - CSS selector for error messages
 * @param timeout - Maximum wait time (wall-clock deadline)
 * @param methodName - Method name for error messages (default: "retryElementLoop")
 */
export function retryElementLoop<A>(
  operation: Effect.Effect<A | null, CdpError>,
  selector: string,
  timeout: Duration.Duration = Duration.seconds(30),
  methodName = "retryElementLoop",
): Effect.Effect<A, CdpError> {
  return Effect.gen(function* () {
    const startTime = Date.now();
    const timeoutMs = Duration.toMillis(timeout);
    let delayIndex = 0;

    const failTimeout = (): Effect.Effect<never, CdpError> =>
      Effect.fail(
        new CdpError({
          module: "CdpPage",
          method: methodName,
          reason: new PageTimeoutError({
            selector,
            timeout,
            state: "attached",
          }),
        }),
      );

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Hard deadline check BEFORE invoking `operation`. Under load,
      // individual CDP calls can take seconds; if `elapsed` already
      // exceeds `timeoutMs`, fail immediately rather than incurring
      // another long operation. Mirrors Playwright's
      // `retryWithProgressAndTimeouts` pattern (which does the same
      // kind of pre-check via its `progress.race(...)` calls).
      const elapsed = Date.now() - startTime;
      const remainingMs = timeoutMs - elapsed;
      if (remainingMs <= 0) {
        return yield* failTimeout();
      }

      // Bound the operation by the remaining budget. `null` is the
      // "retry" signal; `TimeoutError` is mapped to `null` via
      // `Effect.catchTag` so a hung call also retries (until the
      // deadline fires). `CdpError` propagates through the error
      // channel unchanged.
      const result = yield* operation.pipe(
        Effect.timeout(`${remainingMs} millis`),
        Effect.catchTag("TimeoutError", () => Effect.succeed<A | null>(null)),
      );
      if (result !== null) {
        return result;
      }
      // null / TimeoutError → fall through to retry.

      // Retry path: bounded sleep so we don't oversleep the deadline.
      const delay = RetryDelays[Math.min(delayIndex, RetryDelays.length - 1)];
      delayIndex++;
      const sleepRemaining = timeoutMs - (Date.now() - startTime);
      if (sleepRemaining <= 0) {
        // Deadline hit during the timed-out operation or the sleep.
        return yield* failTimeout();
      }
      if (delay > 0) {
        yield* sleep(Math.min(delay, sleepRemaining));
      }
    }
  });
}
