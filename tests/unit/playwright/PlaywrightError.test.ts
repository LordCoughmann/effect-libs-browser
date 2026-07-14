/**
 * Tests for PlaywrightError — structured error model.
 *
 * Follows the same pattern as CdpError.test.ts:
 * - Direct reason construction and property assertion
 * - Parent error delegation (message, cause, isRetryable)
 * - Schema roundtrip for encode/decode
 */

import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  PlaywrightError,
  ConnectionError,
  ContextError,
  OperationError,
  NavigationError,
  type PlaywrightErrorReason,
} from "@effect-libs/browser-playwright";

// ── Reason Test Cases ─────────────────────────────────────────────────────────

type ReasonCase = {
  readonly tag: string;
  readonly isRetryable: boolean;
  readonly make: () => PlaywrightErrorReason;
};

const reasonCases: ReadonlyArray<ReasonCase> = [
  {
    tag: "effect-libs/browser/PlaywrightError/ConnectionError",
    isRetryable: true,
    make: () => new ConnectionError({ description: "WS connect failed", cause: new Error("boom") }),
  },
  {
    tag: "effect-libs/browser/PlaywrightError/ContextError",
    isRetryable: true,
    make: () => new ContextError({ description: "Context creation failed" }),
  },
  {
    tag: "effect-libs/browser/PlaywrightError/OperationError",
    isRetryable: true,
    make: () =>
      new OperationError({ method: "click", description: "Timeout waiting for selector" }),
  },
  {
    tag: "effect-libs/browser/PlaywrightError/NavigationError",
    isRetryable: true,
    make: () =>
      new NavigationError({
        method: "goto",
        url: "https://example.com",
        description: "Navigation timeout",
      }),
  },
];

// ── Reason Tests ──────────────────────────────────────────────────────────────

describe("PlaywrightError reasons", () => {
  it("reason classes expose expected tags and retryability", () => {
    for (const reasonCase of reasonCases) {
      const reason = reasonCase.make();

      assert.strictEqual(reason._tag, reasonCase.tag);
      assert.strictEqual(reason.isRetryable, reasonCase.isRetryable);
    }
  });

  it("ConnectionError carries description and optional cause", () => {
    const withCause = new ConnectionError({
      description: "Connection refused",
      cause: new Error("ECONNREFUSED"),
    });
    const withoutCause = new ConnectionError({ description: "Timeout" });

    assert.strictEqual(withCause.description, "Connection refused");
    assert.instanceOf(withCause.cause, Error);
    assert.strictEqual(withoutCause.description, "Timeout");
    assert.isUndefined(withoutCause.cause);
  });

  it("ContextError carries description and optional cause", () => {
    const reason = new ContextError({ description: "New context failed" });

    assert.strictEqual(reason.description, "New context failed");
    assert.isUndefined(reason.cause);
  });

  it("OperationError carries method and description", () => {
    const reason = new OperationError({
      method: "fill",
      description: "Element not fillable",
      cause: new Error("original"),
    });

    assert.strictEqual(reason.method, "fill");
    assert.strictEqual(reason.description, "Element not fillable");
    assert.instanceOf(reason.cause, Error);
  });

  it("NavigationError carries method, url and description", () => {
    const reason = new NavigationError({
      method: "goto",
      url: "https://example.com",
      description: "Load timed out",
    });

    assert.strictEqual(reason.method, "goto");
    assert.strictEqual(reason.url, "https://example.com");
    assert.strictEqual(reason.description, "Load timed out");
  });
});

// ── Parent Error Delegation ───────────────────────────────────────────────────

describe("PlaywrightError delegation", () => {
  it("delegates message to module.method: reasonTag", () => {
    const reason = new ConnectionError({ description: "WS failed" });
    const error = new PlaywrightError({
      module: "Playwright",
      method: "connect",
      reason,
    });

    assert.strictEqual(
      error.message,
      "[Playwright.connect] effect-libs/browser/PlaywrightError/ConnectionError: WS failed",
    );
  });

  it("delegates cause to reason", () => {
    const reason = new ConnectionError({ description: "boom" });
    const error = new PlaywrightError({ module: "Playwright", method: "test", reason });

    assert.strictEqual(error.cause, reason);
  });

  it("delegates isRetryable to reason", () => {
    for (const reasonCase of reasonCases) {
      const error = new PlaywrightError({
        module: "Playwright",
        method: "test",
        reason: reasonCase.make(),
      });

      assert.strictEqual(error.isRetryable, reasonCase.isRetryable);
    }
  });

  it("exposes module and method fields", () => {
    const error = new PlaywrightError({
      module: "PlaywrightConnectionHandle",
      method: "withContext",
      reason: new ContextError({ description: "failed" }),
    });

    assert.strictEqual(error.module, "PlaywrightConnectionHandle");
    assert.strictEqual(error.method, "withContext");
  });

  it("has correct _tag", () => {
    const error = new PlaywrightError({
      module: "Playwright",
      method: "test",
      reason: new ConnectionError({ description: "failed" }),
    });

    assert.strictEqual(error._tag, "effect-libs/browser/PlaywrightError");
  });
});

// ── Schema Roundtrip ──────────────────────────────────────────────────────────

describe("PlaywrightError schema roundtrip", () => {
  for (const reasonCase of reasonCases) {
    it.effect(
      `schema roundtrip for PlaywrightError wrapping ${reasonCase.tag.split("/").pop()}`,
      () =>
        Effect.gen(function* () {
          const error = new PlaywrightError({
            module: "Playwright",
            method: "test",
            reason: reasonCase.make(),
          });

          const encoded = yield* Schema.encodeEffect(PlaywrightError)(error);
          const decoded = yield* Schema.decodeEffect(PlaywrightError)(encoded);

          assert.strictEqual(decoded._tag, "effect-libs/browser/PlaywrightError");
          assert.strictEqual(decoded.reason._tag, reasonCase.tag);
          assert.strictEqual(decoded.module, "Playwright");
          assert.strictEqual(decoded.method, "test");
          assert.strictEqual(decoded.isRetryable, reasonCase.isRetryable);
          assert.strictEqual(decoded.cause, decoded.reason);
        }),
    );
  }
});
