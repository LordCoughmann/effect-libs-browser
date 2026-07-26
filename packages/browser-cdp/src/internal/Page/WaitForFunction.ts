/**
 * Wait for function to return truthy value.
 *
 * Polls a function until it returns a truthy value or the timeout is reached.
 * Supports two polling strategies:
 * - Numeric interval (ms): polls via `setTimeout` in the browser
 * - `'raf'`: polls via `requestAnimationFrame` in the browser
 *
 * The polling loop runs entirely in the browser context via a single evaluate
 * call that returns a Promise. This matches Playwright's architecture where
 * the polling loop is injected into the page.
 *
 * Survives navigations by catching evaluation errors (e.g., execution context
 * destroyed during navigation) and retrying.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Duration, Effect, Fiber, Predicate, Schedule, Stream, type Scope } from "effect";

import {
  CdpError,
  EvaluationError,
  isEvaluationError,
  NavigationError,
  PageTimeoutError,
} from "../../CdpError.js";
import { evaluatePage, evaluateFrame } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

/**
 * A function or string to evaluate in the browser context.
 */
type EvaluateFn<T> = string | ((...args: any[]) => T);

/**
 * Polling strategy: numeric interval in ms, or `'raf'` for requestAnimationFrame.
 */
type PollingOption = number | "raf";

// ── Validation ─────────────────────────────────────────────────────────────────

/**
 * Validates the polling option, matching Playwright's validation:
 * - String values: only `'raf'` is accepted
 * - Numeric values: must be positive (> 0)
 *
 * Playwright validates on the client side (frame.ts) for unknown strings
 * and on the server side (frames.ts) for non-positive numbers.
 * We validate both here since we have no client/server split.
 *
 * Throws synchronously like Playwright's assert() calls.
 */
const validatePolling = (polling: PollingOption): Effect.Effect<void, CdpError> => {
  if (Predicate.isString(polling)) {
    if (polling !== "raf") {
      return Effect.fail(
        new CdpError({
          source: "CdpPage",
          method: "waitForFunction",
          reason: new EvaluationError({
            description: `Unknown polling option: ${polling}`,
          }),
        }),
      );
    }
  } else if (Predicate.isNumber(polling)) {
    if (polling <= 0) {
      return Effect.fail(
        new CdpError({
          source: "CdpPage",
          method: "waitForFunction",
          reason: new EvaluationError({
            description: `Cannot poll with non-positive interval: ${polling}`,
          }),
        }),
      );
    }
  }
  return Effect.void;
};

// ── Navigation Recovery ────────────────────────────────────────────────────────

/**
 * CDP error descriptions that indicate a transient navigation state,
 * not a predicate error. These should be retried.
 *
 * Playwright handles these by catching the injected script's abort signal.
 * We catch them at the evaluate level and return false for retry.
 */
const RECOVERABLE_ERROR_PATTERNS = [
  "Page not attached to session",
  "Inspected target navigated or closed",
  "Execution context was destroyed",
];

const isRecoverableEvalReason = (reason: CdpError["reason"]): boolean =>
  isEvaluationError(reason) &&
  RECOVERABLE_ERROR_PATTERNS.some((pattern) => reason.description.includes(pattern));

/**
 * Description produced by the browser-side `__reject(new Error('poll timeout'))`
 * in `buildPollingExpression`'s `timeoutGuard`. When the in-browser polling loop
 * hits the user-configured timeout, it rejects with a plain `Error` whose
 * `message` is `"poll timeout"`; that Error is reconstructed on our side by
 * Chrome's CDP `Runtime.exceptionDetails` as `exception.description` of the
 * form `"Error: poll timeout\n  at <async>\>..."` (Chrome's `Error.toString()`).
 * We match on the `includes("poll timeout")` substring so both the bare form
 * and the stacked form are detected, and so the contract is robust if Chrome
 * ever trims the stack in the future. Keep this single source of truth in
 * sync with the browser-side `__reject(new Error(...))` message in
 * `buildPollingExpression`.
 */
const POLL_TIMEOUT_MARKER = "poll timeout";

const isPollTimeoutEvalReason = (reason: CdpError["reason"]): boolean =>
  isEvaluationError(reason) && reason.description.includes(POLL_TIMEOUT_MARKER);

// ── Browser-side Polling Script Builder ─────────────────────────────────────────

/**
 * Builds a browser-side expression that polls the predicate until it returns
 * a truthy value or the timeout elapses.
 *
 * CSP-safe architecture (matches Playwright's approach):
 * - Phase 1 (Synchronous): Compile the predicate string into a function object.
 *   This happens during CDP command execution, when allowUnsafeEvalBlockedByCSP
 *   is active. The CSP bypass window only stays open for synchronous execution.
 * - Phase 2 (Asynchronous): Poll by calling the pre-compiled function.
 *   No eval() is called after yielding to the event loop, so CSP is bypassed.
 *
 * The polling loop runs entirely in the browser via a single evaluate() call.
 * - `requestAnimationFrame(next)` for `'raf'` polling
 * - `setTimeout(next, interval)` for numeric polling
 *
 * Returns a Promise that resolves with the truthy value.
 */
const buildPollingExpression = (
  pageFunction: string,
  isFunction: boolean,
  serializedArgs: string,
  polling: PollingOption,
  timeoutMs: number,
): string => {
  // Safe serialization of the predicate source to avoid escaping issues.
  // JSON.stringify handles all quote escaping automatically.
  const encodedSource = JSON.stringify(pageFunction);

  const scheduler = Predicate.isString(polling) // 'raf'
    ? `requestAnimationFrame(__next)`
    : `setTimeout(__next, ${polling})`;

  const timeoutGuard =
    timeoutMs === Infinity
      ? ""
      : `if (Date.now() - __startTime >= ${timeoutMs}) { __reject(new Error('poll timeout')); return; }`;

  // Build the polling expression with synchronous compilation.
  // The eval() happens during CDP execution (CSP bypass active).
  // The async loop only invokes the pre-compiled function (no eval).
  return `(async () => {
    // --- PHASE 1: SYNCHRONOUS COMPILATION ---
    // This runs immediately when the CDP command hits V8.
    // allowUnsafeEvalBlockedByCSP is ACTIVE right here.
    let __compiledFn;
    try {
      if (${isFunction}) {
        // Evaluate the string into a live function object.
        __compiledFn = (0,eval)(${encodedSource});
      } else {
        // Wrap a raw expression string into an executable function.
        __compiledFn = (0,eval)('(function() { return (' + ${encodedSource} + '); })');
      }
    } catch (compileError) {
      return Promise.reject(new Error('Predicate compilation failed: ' + compileError.message));
    }

    // --- PHASE 2: ASYNCHRONOUS POLLING ---
    // The CDP execution context has yielded to the browser event loop.
    // The CSP bypass window is CLOSED. CSP is now strictly enforced.
    // SAFE: We merely INVOKE the pre-compiled function. No eval() occurs.
    return new Promise((__resolve, __reject) => {
      const __startTime = Date.now();
      const __next = () => {
        try {
          // Call the ALREADY COMPILED function. No eval() is invoked here!
          const __result = ${isFunction} ? __compiledFn(${serializedArgs}) : __compiledFn();
          if (__result) { __resolve(__result); return; }
          ${timeoutGuard}
          ${scheduler};
        } catch (e) {
          __reject(e);
        }
      };
      __next();
    });
  })()`;
};

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Waits for a function to return a truthy value.
 *
 * Polls the function using the specified strategy until:
 * - The function returns a truthy value (resolves with the value)
 * - The timeout is reached (rejects with PageTimeoutError)
 * - The predicate throws a non-recoverable error (rejects with EvaluationError)
 *
 * The polling loop runs in the browser context:
 * - Numeric interval: `setTimeout` with the given interval
 * - `'raf'`: `requestAnimationFrame` each frame
 *
 * Survives navigations by catching evaluation errors (execution context
 * destroyed during navigation) and retrying until the timeout expires.
 */
// ── Frame Detachment Detection ──────────────────────────────────────────────────

/**
 * CDP error patterns that indicate frame detachment.
 * These should result in a "Frame was detached" error.
 */
const FRAME_DETACHED_PATTERNS = [
  "Frame was detached",
  "Execution context was destroyed",
  "Cannot find context",
  "target crashed",
];

const isFrameDetachedEvalReason = (reason: CdpError["reason"]): boolean =>
  isEvaluationError(reason) &&
  FRAME_DETACHED_PATTERNS.some((pattern) => reason.description.includes(pattern));

/**
 * Creates a signal that resolves when the target frame is detached.
 *
 * Subscribes to CDP `Page.frameDetached` events for the given frame ID.
 * Used to race against long-running CDP calls (like waitForFunction's
 * browser-side polling loop) to detect frame detachment immediately
 * instead of waiting for the call to timeout.
 *
 * Pattern mirrors `createNavigationSignal` in InjectedScript.ts.
 *
 * ## Footgun: Must be forked OUTSIDE retry loops
 * Do NOT call this inside `Effect.repeat` or any retry loop. Each call
 * creates a new PubSub subscription that only receives events after
 * subscription time. If the frame detaches before the subscription is
 * created (e.g. during a prior retry iteration), the event is lost and
 * the signal never resolves. Fork ONCE before the loop and race against
 * `Fiber.join(detachmentFiber)` inside each iteration.
 *
 * @param conn - CDP connection
 * @param frameId - Frame ID to watch for detachment
 * @returns An Effect that resolves when the frame is detached
 */
const createDetachmentSignal = (
  conn: CdpConnection["Service"],
  frameId: string,
): Effect.Effect<void, never, Scope.Scope> =>
  conn.subscribe.pipe(
    Effect.flatMap((subscription) =>
      Stream.fromSubscription(subscription).pipe(
        Stream.filter(
          (msg) =>
            msg.method === "Page.frameDetached" &&
            (msg.params as { frameId?: string })?.frameId === frameId,
        ),
        Stream.take(1),
        Stream.runHead,
      ),
    ),
    Effect.asVoid,
  );

/**
 * Waits for a function to return a truthy value in a page context.
 *
 * Polls the function using the specified strategy until:
 * - The function returns a truthy value (resolves with the value)
 * - The timeout is reached (rejects with PageTimeoutError)
 * - The predicate throws a non-recoverable error (rejects with EvaluationError)
 *
 * The polling loop runs in the browser context:
 * - Numeric interval: `setTimeout` with the given interval
 * - `'raf'`: `requestAnimationFrame` each frame
 *
 * Survives navigations by catching evaluation errors (execution context
 * destroyed during navigation) and retrying until the timeout expires.
 */
export const waitForFunctionPage = Effect.fn("CdpPage.waitForFunction")(function <T, Arg = void>(
  conn: CdpConnection["Service"],
  state: PageState,
  pageFunction: EvaluateFn<T>,
  arg?: Arg,
  options?: {
    timeout?: Duration.Duration;
    polling?: number | "raf";
  },
) {
  return Effect.gen(function* () {
    const timeout = options?.timeout ?? Duration.seconds(30);
    const polling: PollingOption = (options?.polling as PollingOption) ?? 100;

    // Validate polling option before any async work.
    yield* validatePolling(polling);

    const timeoutMs = Duration.toMillis(timeout);
    const isFunction = Predicate.isFunction(pageFunction);
    const fnString = isFunction ? pageFunction.toString() : pageFunction;
    const serializedArgs = arg !== undefined ? JSON.stringify(arg) : "";

    // Build the browser-side polling expression with synchronous compilation.
    // The predicate is compiled during CDP execution (CSP bypass active),
    // then the async polling loop only calls the pre-compiled function.
    const pollingExpr = buildPollingExpression(
      fnString,
      isFunction,
      serializedArgs,
      polling,
      timeoutMs,
    );

    // Schedule for retrying on navigation recovery.
    const navRetrySchedule = Schedule.spaced(Duration.millis(100)).pipe(
      Schedule.setInputType<Awaited<T>>(),
      Schedule.passthrough,
      Schedule.while(({ input }) => !input),
    );

    // Evaluate the polling expression in the main world.
    // We cast the result because the polling expression is a string,
    // so evaluatePage can't infer the return type from the function signature.
    return yield* (
      evaluatePage(conn, state, pollingExpr) as Effect.Effect<Awaited<T>, CdpError>
    ).pipe(
      Effect.map((result) => result as Awaited<T>),
      // Catch browser-side "poll timeout" first: the in-browser polling loop's
      // timeoutGuard rejects with a plain Error before the outer Effect.timeout
      // fires, and on runtimes where the CDP delivery outpaces the fiber
      // scheduler (bun, in our testing) that EvaluationError propagates
      // instead of the outer TimeoutError. Map it to the same PageTimeoutError
      // the outer catchTag would produce so callers see a single, stable
      // timeout contract regardless of which side wins the race.
      //
      // Then catch navigation-recovery errors ("Page not attached to session"
      // etc.) and return false so the schedule retries. Other errors propagate.
      Effect.catchReason(
        "effect-libs/browser/CdpError",
        "effect-libs/browser/CdpError/EvaluationError",
        (reason) =>
          isPollTimeoutEvalReason(reason)
            ? Effect.fail(
                new CdpError({
                  source: "CdpPage",
                  method: "waitForFunction",
                  reason: new PageTimeoutError({ timeout }),
                }),
              )
            : isRecoverableEvalReason(reason)
              ? Effect.succeed(false as Awaited<T>)
              : Effect.fail(new CdpError({ source: "CdpPage", method: "waitForFunction", reason })),
      ),

      // Retry on falsy results (navigation recovery returns false).
      Effect.repeat(navRetrySchedule),

      // Outer timeout as safety net — browser-side timeout handles most cases.
      Effect.timeout(timeout),

      // Map timeout to our typed PageTimeoutError
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(
          new CdpError({
            source: "CdpPage",
            method: "waitForFunction",
            reason: new PageTimeoutError({ timeout }),
          }),
        ),
      ),
    );
  });
});

/**
 * Waits for a function to return a truthy value in a frame context.
 *
 * Same behavior as `waitForFunctionPage` but:
 * - Targets a specific frame's execution context
 * - Detects frame detachment and throws "Frame was detached" error
 *
 * @param conn - CDP connection
 * @param state - Page state
 * @param frameId - The frame to evaluate in
 * @param contextId - The execution context ID for the frame
 * @param pageFunction - Function or expression to poll
 * @param arg - Optional argument to pass
 * @param options - polling and timeout options
 *
 * ## Footguns & Pitfalls
 *
 * ### Ghost Subscription (CRITICAL)
 * The detachment signal subscription MUST be forked OUTSIDE the retry loop.
 * Creating subscriptions inside `Effect.repeat` causes "ghost subscriptions" —
 * each retry allocates a new PubSub subscription that misses CDP events that
 * already fired. The fix: fork once before the loop, race against Fiber.join
 * inside each iteration. If the event already fired, Fiber.join resolves
 * instantly and wins the race.
 *
 * ### Effect v4: forkChild, not fork
 * Use `Effect.forkChild` (v4), NOT `Effect.fork` (v3). The v4 linter will
 * catch this, but it's easy to miss when copying patterns from examples.
 *
 * ### Timeout race: browser-side guard vs outer Effect.timeout
 * `buildPollingExpression` injects a browser-side `timeoutGuard` that rejects
 * with `new Error('poll timeout')` at `Date.now() - __startTime >= timeoutMs`,
 * AND the public API wraps the whole retry loop in `Effect.timeout(timeout)`.
 * Both fire at ~the same wall-clock instant, so on runtimes where the CDP
 * delivery outpaces the fiber scheduler (we observed this on bun) the
 * browser-side reject reaches `evaluatePage` as an `EvaluationError` BEFORE
 * the outer `Effect.timeout` produces its `TimeoutError`. The
 * `Effect.catchTag("TimeoutError", ...)` then does NOT match — the
 * `EvaluationError` propagates and tests see the wrong error.
 *
 * Fix: `isPollTimeoutEvalReason` maps that specific `EvaluationError`
 * description to a `PageTimeoutError` inside `Effect.catchReason(..., EvaluationError, ...)`,
 * mirroring the `WaitForSelector` pattern for `"Timeout waiting for selector"`.
 * The outer `Effect.timeout`/`catchTag` remains as a safety net for the rare
 * case where the browser-side guard is never reached (e.g. the entire retry
 * loop is blocked on a navigation-recovery `Effect.repeat` that never returns).
 * Keep `POLL_TIMEOUT_MARKER` and the browser-side `__reject(new Error(...))`
 * message in sync.
 *
 * ### Error extraction in tests
 * `CdpError.reason` can be `NavigationError` (has `.description`),
 * `EvaluationError` (has `.description`), or other types. Test helpers like
 * `getErrorMsg` must handle ALL reason types — not just `EvaluationError`.
 * Otherwise the test checks `reason._tag` (e.g. "NavigationError") which
 * won't contain the expected substring (e.g. "detached").
 */
export const waitForFunctionFrame = Effect.fn("CdpFrame.waitForFunction")(function <T, Arg = void>(
  conn: CdpConnection["Service"],
  state: PageState,
  frameId: string,
  contextId: number,
  pageFunction: EvaluateFn<T>,
  arg?: Arg,
  options?: {
    timeout?: Duration.Duration;
    polling?: number | "raf";
  },
) {
  return Effect.gen(function* () {
    const timeout = options?.timeout ?? Duration.seconds(30);
    const polling: PollingOption = (options?.polling as PollingOption) ?? 100;

    // Validate polling option before any async work.
    yield* validatePolling(polling);

    const timeoutMs = Duration.toMillis(timeout);
    const isFunction = Predicate.isFunction(pageFunction);
    const fnString = isFunction ? pageFunction.toString() : pageFunction;
    const serializedArgs = arg !== undefined ? JSON.stringify(arg) : "";

    // Build the browser-side polling expression with synchronous compilation.
    const pollingExpr = buildPollingExpression(
      fnString,
      isFunction,
      serializedArgs,
      polling,
      timeoutMs,
    );

    // Create error for frame detachment
    const makeDetachedError = () =>
      new CdpError({
        source: "CdpFrame",
        method: "waitForFunction",
        reason: new NavigationError({
          url: "frame",
          description: `Frame ${frameId} was detached`,
        }),
      });

    // ─── KEY FIX: Subscribe to detachment BEFORE entering the retry loop ───
    // The subscription must outlive individual retry iterations. Otherwise, when
    // the loop retries after an evaluation failure, a brand-new subscription is
    // allocated that MISSES the Page.frameDetached event which already fired.
    //
    // By forking the signal once here, the background fiber catches the event
    // and completes. On subsequent retries, Fiber.join returns "detached"
    // instantly, winning the success-biased Effect.race and short-circuiting
    // the loop instead of spinning until the outer timeout.
    const detachmentFiber = yield* Effect.forkChild(
      createDetachmentSignal(conn, frameId).pipe(
        Effect.scoped, // provide the Scope internally for the subscription
        Effect.map(() => "detached" as const),
      ),
    );

    // Inner effect: race evaluate against the forked detachment fiber
    const evaluateWithDetachmentRace = Effect.gen(function* () {
      // Race the evaluate call against the detached fiber.
      // If the frame detaches mid-evaluation, detachmentFiber completes and wins.
      // If it already detached in a prior iteration, Fiber.join resolves instantly.
      const evalEffect = (
        evaluateFrame(conn, state, contextId, frameId, pollingExpr) as Effect.Effect<
          Awaited<T>,
          CdpError
        >
      ).pipe(Effect.map((result) => ({ type: "result" as const, value: result as Awaited<T> })));

      const raceResult = yield* Effect.race(evalEffect, Fiber.join(detachmentFiber));

      if (raceResult === "detached") {
        return yield* makeDetachedError();
      }

      return raceResult.value;
    }).pipe(
      // Check for frame detachment and recoverable evaluation errors from evaluate.
      // Other errors propagate unchanged.
      Effect.catchReasons("effect-libs/browser/CdpError", {
        // Frame detachment (navigation) — throw the specific detached error.
        "effect-libs/browser/CdpError/NavigationError": () => Effect.fail(makeDetachedError()),
        "effect-libs/browser/CdpError/EvaluationError": (reason) => {
          // EvaluationError describing frame detachment — throw specific error.
          if (isFrameDetachedEvalReason(reason)) {
            return Effect.fail(makeDetachedError());
          }
          // Browser-side "poll timeout" — map to PageTimeoutError so callers see
          // a single, stable timeout contract regardless of whether the inner
          // browser-side guard or the outer Effect.timeout wins the race. See
          // waitForFunctionPage for the full rationale and POLL_TIMEOUT_MARKER.
          if (isPollTimeoutEvalReason(reason)) {
            return Effect.fail(
              new CdpError({
                source: "CdpFrame",
                method: "waitForFunction",
                reason: new PageTimeoutError({ timeout }),
              }),
            );
          }
          // Navigation recovery — return false for retry.
          if (isRecoverableEvalReason(reason)) {
            return Effect.succeed(false as Awaited<T>);
          }
          return Effect.fail(
            new CdpError({ source: "CdpFrame", method: "waitForFunction", reason }),
          );
        },
      }),
    );

    // Schedule for retrying on navigation recovery.
    const navRetrySchedule = Schedule.spaced(Duration.millis(100)).pipe(
      Schedule.setInputType<Awaited<T>>(),
      Schedule.passthrough,
      Schedule.while(({ input }) => !input),
    );

    // Run with retry and timeout. The detachmentFiber (forked above, outside
    // the loop) is a child fiber: it is automatically interrupted when this
    // Effect.gen completes or fails, closing the subscription scope cleanly.
    return yield* evaluateWithDetachmentRace.pipe(
      // Retry on falsy results (navigation recovery returns false).
      Effect.repeat(navRetrySchedule),

      // Outer timeout as safety net.
      Effect.timeout(timeout),

      // Map timeout to our typed PageTimeoutError.
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(
          new CdpError({
            source: "CdpFrame",
            method: "waitForFunction",
            reason: new PageTimeoutError({ timeout }),
          }),
        ),
      ),
    );
  });
});
