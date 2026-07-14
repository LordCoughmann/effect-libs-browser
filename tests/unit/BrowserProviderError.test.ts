/**
 * Unit tests for BrowserProviderError.
 *
 * Focuses on:
 * - `isRetryable` property (status code matching logic)
 * - `message` getter (cause.message vs reason fallback)
 * - Error structure and schema
 */

import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { BrowserProviderError } from "@effect-libs/browser";

// ── isRetryable Tests ──────────────────────────────────────────────────────────

describe("BrowserProviderError.isRetryable", () => {
  describe("retryable HTTP status codes", () => {
    it("401 Unauthorized is retryable", () => {
      const error = new BrowserProviderError({
        reason: "Auth failed",
        cause: { status: 401, message: "Unauthorized" },
      });

      assert.isTrue(error.isRetryable);
    });

    it("403 Forbidden is retryable", () => {
      const error = new BrowserProviderError({
        reason: "Forbidden",
        cause: { status: 403, message: "Access denied" },
      });

      assert.isTrue(error.isRetryable);
    });

    it("409 Conflict is retryable", () => {
      const error = new BrowserProviderError({
        reason: "Conflict",
        cause: { status: 409, message: "Resource conflict" },
      });

      assert.isTrue(error.isRetryable);
    });

    it("429 Rate Limit is retryable", () => {
      const error = new BrowserProviderError({
        reason: "Rate limited",
        cause: { status: 429, message: "Too many requests" },
      });

      assert.isTrue(error.isRetryable);
    });

    it("502 Bad Gateway is retryable", () => {
      const error = new BrowserProviderError({
        reason: "Bad gateway",
        cause: { status: 502, message: "Bad Gateway" },
      });

      assert.isTrue(error.isRetryable);
    });

    it("503 Service Unavailable is retryable", () => {
      const error = new BrowserProviderError({
        reason: "Service unavailable",
        cause: { status: 503, message: "Service Unavailable" },
      });

      assert.isTrue(error.isRetryable);
    });

    it("504 Gateway Timeout is retryable", () => {
      const error = new BrowserProviderError({
        reason: "Gateway timeout",
        cause: { status: 504, message: "Gateway Timeout" },
      });

      assert.isTrue(error.isRetryable);
    });
  });

  describe("non-retryable status codes", () => {
    it("400 Bad Request is NOT retryable", () => {
      const error = new BrowserProviderError({
        reason: "Bad request",
        cause: { status: 400, message: "Invalid input" },
      });

      assert.isFalse(error.isRetryable);
    });

    it("404 Not Found is NOT retryable", () => {
      const error = new BrowserProviderError({
        reason: "Not found",
        cause: { status: 404, message: "Session not found" },
      });

      assert.isFalse(error.isRetryable);
    });

    it("500 Internal Server Error is NOT retryable", () => {
      const error = new BrowserProviderError({
        reason: "Server error",
        cause: { status: 500, message: "Internal Server Error" },
      });

      assert.isFalse(error.isRetryable);
    });
  });

  describe("edge cases", () => {
    it("cause without status is NOT retryable", () => {
      const error = new BrowserProviderError({
        reason: "Network error",
        cause: new Error("ECONNREFUSED"),
      });

      assert.isFalse(error.isRetryable);
    });

    it("cause with invalid status (not a number) is NOT retryable", () => {
      const error = new BrowserProviderError({
        reason: "Invalid status",
        cause: { status: "404", message: "Not a number" },
      });

      assert.isFalse(error.isRetryable);
    });

    it("cause with status out of HTTP range (< 100) is NOT retryable", () => {
      const error = new BrowserProviderError({
        reason: "Invalid status",
        cause: { status: -1, message: "Negative status" },
      });

      assert.isFalse(error.isRetryable);
    });

    it("cause with status out of HTTP range (> 599) is NOT retryable", () => {
      const error = new BrowserProviderError({
        reason: "Invalid status",
        cause: { status: 600, message: "Out of range" },
      });

      assert.isFalse(error.isRetryable);
    });

    it("no cause is NOT retryable", () => {
      const error = new BrowserProviderError({
        reason: "Unknown error",
      });

      assert.isFalse(error.isRetryable);
    });

    it("null cause is NOT retryable", () => {
      const error = new BrowserProviderError({
        reason: "Null cause",
        cause: null,
      });

      assert.isFalse(error.isRetryable);
    });

    it("statusCode (alternate key) is also recognized", () => {
      const error = new BrowserProviderError({
        reason: "Rate limited",
        cause: { statusCode: 429, message: "Too many requests" },
      });

      assert.isTrue(error.isRetryable);
    });

    it("status code 99 (below valid range) is NOT retryable", () => {
      const error = new BrowserProviderError({
        reason: "Low status",
        cause: { status: 99, message: "Informational?" },
      });

      assert.isFalse(error.isRetryable);
    });
  });
});

// ── message Getter Tests ──────────────────────────────────────────────────────

describe("BrowserProviderError.message", () => {
  it("returns cause.message when cause is Error", () => {
    const error = new BrowserProviderError({
      reason: "Test reason",
      cause: new Error("Original error message"),
    });

    assert.strictEqual(error.message, "Original error message");
  });

  it("returns cause.message when cause has message property", () => {
    const error = new BrowserProviderError({
      reason: "Test reason",
      cause: { message: "Custom message object", status: 500 },
    });

    assert.strictEqual(error.message, "Custom message object");
  });

  it("returns reason when cause has no message", () => {
    const error = new BrowserProviderError({
      reason: "Fallback reason",
      cause: { status: 404 },
    });

    assert.strictEqual(error.message, "Fallback reason");
  });

  it("returns reason when cause is null", () => {
    const error = new BrowserProviderError({
      reason: "Null cause reason",
      cause: null,
    });

    assert.strictEqual(error.message, "Null cause reason");
  });

  it("returns reason when cause is undefined", () => {
    const error = new BrowserProviderError({
      reason: "No cause reason",
    });

    assert.strictEqual(error.message, "No cause reason");
  });

  it("returns reason when cause is string", () => {
    const error = new BrowserProviderError({
      reason: "String cause reason",
      cause: "Some string cause",
    });

    // String doesn't have a message property as an object key
    assert.strictEqual(error.message, "String cause reason");
  });
});

// ── Error Structure Tests ──────────────────────────────────────────────────────

describe("BrowserProviderError structure", () => {
  it("has correct _tag", () => {
    const error = new BrowserProviderError({
      reason: "Test",
      cause: new Error("boom"),
    });

    assert.strictEqual(error._tag, "effect-libs/browser/BrowserProviderError");
  });

  it("exposes reason field", () => {
    const error = new BrowserProviderError({
      reason: "Something went wrong",
      cause: new Error("underlying"),
    });

    assert.strictEqual(error.reason, "Something went wrong");
  });

  it("exposes cause field", () => {
    const cause = new Error("underlying error");
    const error = new BrowserProviderError({
      reason: "Test",
      cause,
    });

    assert.strictEqual(error.cause, cause);
  });

  it("works with Error cause", () => {
    const cause = new Error("Network timeout");
    const error = new BrowserProviderError({
      reason: "Provider request failed",
      cause,
    });

    assert.instanceOf(error.cause, Error);
    assert.strictEqual(error.message, "Network timeout");
  });

  it("works with object cause", () => {
    const cause = { status: 500, message: "Internal Server Error" };
    const error = new BrowserProviderError({
      reason: "HTTP error",
      cause,
    });

    assert.isObject(error.cause);
    assert.strictEqual(error.message, "Internal Server Error");
  });
});

// ── Schema Roundtrip ──────────────────────────────────────────────────────────

describe("BrowserProviderError schema roundtrip", () => {
  it.effect("roundtrips with Error cause", () =>
    Effect.gen(function* () {
      const error = new BrowserProviderError({
        reason: "Test reason",
        cause: new Error("Test cause"),
      });

      const encoded = yield* Schema.encodeEffect(BrowserProviderError)(error);
      const decoded = yield* Schema.decodeEffect(BrowserProviderError)(encoded);

      assert.strictEqual(decoded._tag, "effect-libs/browser/BrowserProviderError");
      assert.strictEqual(decoded.reason, "Test reason");
    }),
  );

  it.effect("roundtrips with object cause", () =>
    Effect.gen(function* () {
      const error = new BrowserProviderError({
        reason: "HTTP error",
        cause: { status: 429, message: "Rate limited" },
      });

      const encoded = yield* Schema.encodeEffect(BrowserProviderError)(error);
      const decoded = yield* Schema.decodeEffect(BrowserProviderError)(encoded);

      assert.strictEqual(decoded._tag, "effect-libs/browser/BrowserProviderError");
      assert.strictEqual(decoded.reason, "HTTP error");
    }),
  );

  it.effect("roundtrips without cause", () =>
    Effect.gen(function* () {
      const error = new BrowserProviderError({
        reason: "Unknown error",
      });

      const encoded = yield* Schema.encodeEffect(BrowserProviderError)(error);
      const decoded = yield* Schema.decodeEffect(BrowserProviderError)(encoded);

      assert.strictEqual(decoded._tag, "effect-libs/browser/BrowserProviderError");
      assert.strictEqual(decoded.reason, "Unknown error");
      assert.isUndefined(decoded.cause);
    }),
  );
});
