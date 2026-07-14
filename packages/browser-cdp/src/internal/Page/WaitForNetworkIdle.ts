/**
 * Network idle detection using SubscriptionRef and Stream combinators.
 *
 * This module provides a reactive approach to detecting when network activity
 * has settled (no in-flight requests for a specified duration).
 *
 */

import { Data, Effect, Predicate, Stream, SubscriptionRef } from "effect";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Network event types that affect request tracking.
 * These correspond to CDP Network domain events.
 */
export type NetworkEvent = Data.TaggedEnum<{
  requestStarted: { readonly requestId: string };
  requestFinished: { readonly requestId: string };
}>;

/**
 * Constructors and matchers for NetworkEvent variants.
 */
export const NetworkEvent = Data.taggedEnum<NetworkEvent>();

/**
 * Detector for network idle state using SubscriptionRef.
 *
 * Uses SubscriptionRef to track in-flight requests and provides:
 * - Reactive updates via the changes stream
 * - Efficient idle detection with Stream.debounce
 * - No polling overhead
 */
export interface NetworkIdleDetector {
  /** The SubscriptionRef holding the current set of in-flight request IDs */
  readonly pendingRequests: SubscriptionRef.SubscriptionRef<Set<string>>;

  /** Handle a network event (request started or finished) */
  readonly handleEvent: (event: NetworkEvent) => Effect.Effect<void>;

  /** Wait for network to become idle with specified stability window */
  readonly waitForIdle: (idleTimeMs?: number) => Effect.Effect<void>;

  /** Wait for network to be idle without requiring initial requests */
  readonly waitForIdleNoInitial: (idleTimeMs?: number) => Effect.Effect<void>;

  /** Get the current count of in-flight requests */
  readonly getCount: Effect.Effect<number>;
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Creates a NetworkIdleDetector for tracking network activity.
 *
 * The detector uses SubscriptionRef for efficient reactive updates:
 * - Changes are published to subscribers immediately
 * - waitForIdle uses Stream.debounce for the stability window
 * - No polling overhead - event-driven
 *
 * @example
 * ```ts
 * const detector = yield* makeNetworkIdleDetector()
 *
 * // Fork wait for idle
 * yield* Effect.forkChild(detector.waitForIdle(500))
 *
 * // Handle network events
 * yield* detector.handleEvent(NetworkEvent.requestStarted({ requestId: "1" }))
 * yield* detector.handleEvent(NetworkEvent.requestFinished({ requestId: "1" }))
 * ```
 */
export const makeNetworkIdleDetector = Effect.gen(function* () {
  // Track in-flight requests with SubscriptionRef for reactive updates
  const pendingRequests = yield* SubscriptionRef.make(new Set<string>());

  /**
   * Handle a network event by updating the pending requests set.
   * The change is published to subscribers via SubscriptionRef.changes.
   */
  const handleEvent = (event: NetworkEvent): Effect.Effect<void> =>
    SubscriptionRef.update(pendingRequests, (set) => {
      const next = new Set(set);
      if (NetworkEvent.$is("requestStarted")(event)) {
        next.add(event.requestId);
      } else {
        next.delete(event.requestId);
      }
      return next;
    });

  /**
   * Stream of request count changes.
   * Emits the current count immediately, then on each change.
   */
  const countChanges = SubscriptionRef.changes(pendingRequests).pipe(Stream.map((set) => set.size));

  /**
   * Wait for network idle with proper timing for navigation scenarios:
   *
   * 1. dropWhile(count === 0) - Wait for at least one request to start
   *    (important when waitForIdle is forked before navigation)
   * 2. filter(count === 0) - Wait for all requests to complete
   * 3. debounce(idleTimeMs) - Ensure stability window
   *    (automatically restarts if new requests appear)
   *
   * This matches the behavior of the original polling-based implementation
   * but is more efficient and reacts immediately to events.
   */
  const waitForIdle = (idleTimeMs = 500): Effect.Effect<void> =>
    countChanges.pipe(
      // Phase 1: Wait for at least one request (skip initial 0)
      Stream.dropWhile((count) => count === 0),
      // Phase 2: Wait for all requests to complete
      Stream.filter((count) => count === 0),
      // Phase 3 & 4: Debounce for stability (auto-restarts on new requests)
      Stream.debounce(idleTimeMs),
      // Take first idle event
      Stream.take(1),
      // Drain to wait for completion
      Stream.runDrain,
    );

  /**
   * Wait for network idle without requiring initial requests.
   *
   * Use this when you want to wait for the network to be quiet,
   * and it might already be idle at the start.
   */
  const waitForIdleNoInitial = (idleTimeMs = 500): Effect.Effect<void> =>
    countChanges.pipe(
      // Wait for idle (count === 0)
      Stream.filter((count) => count === 0),
      // Debounce for stability
      Stream.debounce(idleTimeMs),
      // Take first idle
      Stream.take(1),
      // Drain to wait
      Stream.runDrain,
    );

  /** Get the current count of in-flight requests */
  const getCount = SubscriptionRef.get(pendingRequests).pipe(Effect.map((set) => set.size));

  return {
    pendingRequests,
    handleEvent,
    waitForIdle,
    waitForIdleNoInitial,
    getCount,
  } as const satisfies NetworkIdleDetector;
});

// ── CDP Integration Helpers ────────────────────────────────────────────────────

/**
 * Type guard for CDP methods that signal a network request has finished.
 */
export const isNetworkCompletionEvent = (
  method: string | undefined,
): method is "Network.loadingFinished" | "Network.loadingFailed" =>
  method === "Network.loadingFinished" || method === "Network.loadingFailed";

/**
 * Extracts the network request ID from a CDP message, if present.
 */
export const getRequestId = (params: unknown): string | undefined => {
  if (Predicate.isObject(params) && Predicate.hasProperty(params, "requestId")) {
    const requestId = params.requestId;
    return Predicate.isString(requestId) ? requestId : undefined;
  }
  return undefined;
};
