/**
 * Unit tests for WaitForNetworkIdle detector.
 *
 * Tests the pure logic of network idle detection using SubscriptionRef.
 * Focuses on:
 * - Pure functions: isNetworkCompletionEvent, getRequestId
 * - State management: handleEvent, getCount
 * - Detector factory: makeNetworkIdleDetector
 *
 * Timing-sensitive debounce tests are deferred to integration coverage.
 */

import { assert, describe, it } from "@effect/vitest";
import { Effect, SubscriptionRef } from "effect";

import {
  makeNetworkIdleDetector,
  isNetworkCompletionEvent,
  getRequestId,
} from "@effect-libs/browser-cdp/WaitForNetworkIdle";

// ── isNetworkCompletionEvent ──────────────────────────────────────────────────

describe("isNetworkCompletionEvent", () => {
  it("returns true for Network.loadingFinished", () => {
    assert.isTrue(isNetworkCompletionEvent("Network.loadingFinished"));
  });

  it("returns true for Network.loadingFailed", () => {
    assert.isTrue(isNetworkCompletionEvent("Network.loadingFailed"));
  });

  it("returns false for Network.requestWillBeSent", () => {
    assert.isFalse(isNetworkCompletionEvent("Network.requestWillBeSent"));
  });

  it("returns false for undefined", () => {
    assert.isFalse(isNetworkCompletionEvent(undefined));
  });

  it("returns false for other methods", () => {
    assert.isFalse(isNetworkCompletionEvent("Page.loadEventFired"));
    assert.isFalse(isNetworkCompletionEvent("Runtime.evaluate"));
    assert.isFalse(isNetworkCompletionEvent("Network.requestWillBeSent"));
  });
});

// ── getRequestId ──────────────────────────────────────────────────────────────

describe("getRequestId", () => {
  it("extracts requestId from params object", () => {
    const params = { requestId: "req-123", request: { url: "https://example.com" } };
    assert.strictEqual(getRequestId(params), "req-123");
  });

  it("returns undefined for object without requestId", () => {
    const params = { request: { url: "https://example.com" } };
    assert.strictEqual(getRequestId(params), undefined);
  });

  it("returns undefined for non-object params", () => {
    assert.strictEqual(getRequestId(null), undefined);
    assert.strictEqual(getRequestId("string"), undefined);
    assert.strictEqual(getRequestId(42), undefined);
    assert.strictEqual(getRequestId(undefined), undefined);
  });

  it("handles nested requestId", () => {
    const params = { requestId: "100.1", frameId: "main" };
    assert.strictEqual(getRequestId(params), "100.1");
  });
});

// ── NetworkIdleDetector ───────────────────────────────────────────────────────

describe("NetworkIdleDetector", () => {
  describe("handleEvent", () => {
    it.effect("adds request on requestStarted", () =>
      Effect.gen(function* () {
        const detector = yield* makeNetworkIdleDetector;

        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "req-1" });
        const count = yield* detector.getCount;

        assert.strictEqual(count, 1);
      }),
    );

    it.effect("removes request on requestFinished", () =>
      Effect.gen(function* () {
        const detector = yield* makeNetworkIdleDetector;

        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "req-1" });
        yield* detector.handleEvent({ _tag: "requestFinished", requestId: "req-1" });
        const count = yield* detector.getCount;

        assert.strictEqual(count, 0);
      }),
    );

    it.effect("handles multiple concurrent requests", () =>
      Effect.gen(function* () {
        const detector = yield* makeNetworkIdleDetector;

        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "req-1" });
        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "req-2" });
        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "req-3" });

        const count1 = yield* detector.getCount;
        assert.strictEqual(count1, 3);

        yield* detector.handleEvent({ _tag: "requestFinished", requestId: "req-2" });
        const count2 = yield* detector.getCount;
        assert.strictEqual(count2, 2);

        yield* detector.handleEvent({ _tag: "requestFinished", requestId: "req-1" });
        yield* detector.handleEvent({ _tag: "requestFinished", requestId: "req-3" });
        const count3 = yield* detector.getCount;
        assert.strictEqual(count3, 0);
      }),
    );

    it.effect("ignores duplicate requestFinished", () =>
      Effect.gen(function* () {
        const detector = yield* makeNetworkIdleDetector;

        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "req-1" });
        yield* detector.handleEvent({ _tag: "requestFinished", requestId: "req-1" });
        // Second finish for same request — should be idempotent
        yield* detector.handleEvent({ _tag: "requestFinished", requestId: "req-1" });

        const count = yield* detector.getCount;
        assert.strictEqual(count, 0);
      }),
    );

    it.effect("finishing unknown requestId does nothing", () =>
      Effect.gen(function* () {
        const detector = yield* makeNetworkIdleDetector;

        // Finishing a request that was never started
        yield* detector.handleEvent({ _tag: "requestFinished", requestId: "unknown" });

        const count = yield* detector.getCount;
        assert.strictEqual(count, 0);
      }),
    );

    it.effect("starting same requestId twice only counts once", () =>
      Effect.gen(function* () {
        const detector = yield* makeNetworkIdleDetector;

        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "req-1" });
        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "req-1" });

        const count = yield* detector.getCount;
        assert.strictEqual(count, 1);
      }),
    );
  });

  describe("getCount", () => {
    it.effect("returns 0 initially", () =>
      Effect.gen(function* () {
        const detector = yield* makeNetworkIdleDetector;
        const count = yield* detector.getCount;

        assert.strictEqual(count, 0);
      }),
    );

    it.effect("reflects current pending count", () =>
      Effect.gen(function* () {
        const detector = yield* makeNetworkIdleDetector;

        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "a" });
        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "b" });
        yield* detector.handleEvent({ _tag: "requestFinished", requestId: "a" });

        const count = yield* detector.getCount;
        assert.strictEqual(count, 1);
      }),
    );
  });

  describe("pendingRequests SubscriptionRef", () => {
    it.effect("exposes the Set for inspection", () =>
      Effect.gen(function* () {
        const detector = yield* makeNetworkIdleDetector;

        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "req-1" });

        const pending = yield* SubscriptionRef.get(detector.pendingRequests);

        assert.isTrue(pending.has("req-1"));
        assert.strictEqual(pending.size, 1);
      }),
    );

    it.effect("set is empty initially", () =>
      Effect.gen(function* () {
        const detector = yield* makeNetworkIdleDetector;

        const pending = yield* SubscriptionRef.get(detector.pendingRequests);

        assert.strictEqual(pending.size, 0);
      }),
    );

    it.effect("set reflects finished state", () =>
      Effect.gen(function* () {
        const detector = yield* makeNetworkIdleDetector;

        yield* detector.handleEvent({ _tag: "requestStarted", requestId: "req-1" });
        yield* detector.handleEvent({ _tag: "requestFinished", requestId: "req-1" });

        const pending = yield* SubscriptionRef.get(detector.pendingRequests);

        assert.strictEqual(pending.size, 0);
      }),
    );
  });
});
