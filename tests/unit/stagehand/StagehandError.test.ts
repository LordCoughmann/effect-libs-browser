/**
 * Tests for StagehandError — structured error model.
 *
 * Follows the same pattern as CdpError.test.ts:
 * - Direct reason construction and property assertion
 * - Parent error delegation (message, cause, isRetryable)
 * - Schema roundtrip for encode/decode
 */

import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  StagehandError,
  ConnectionError,
  OperationError,
  AgentError,
  type StagehandErrorReason,
} from "@effect-libs/browser-stagehand";

// ── Reason Test Cases ─────────────────────────────────────────────────────────

type ReasonCase = {
  readonly tag: string;
  readonly isRetryable: boolean;
  readonly make: () => StagehandErrorReason;
};

const reasonCases: ReadonlyArray<ReasonCase> = [
  {
    tag: "effect-libs/browser/StagehandError/ConnectionError",
    isRetryable: true,
    make: () =>
      new ConnectionError({ description: "Stagehand init failed", cause: new Error("boom") }),
  },
  {
    tag: "effect-libs/browser/StagehandError/OperationError",
    isRetryable: true,
    make: () => new OperationError({ action: "act", description: "Action timed out" }),
  },
  {
    tag: "effect-libs/browser/StagehandError/AgentError",
    isRetryable: true,
    make: () => new AgentError({ description: "LLM API error", cause: new Error("rate limit") }),
  },
];

// ── Reason Tests ──────────────────────────────────────────────────────────────

describe("StagehandError reasons", () => {
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

  it("OperationError carries action and description", () => {
    const reason = new OperationError({
      action: "extract",
      description: "Schema mismatch",
      cause: new Error("validation failed"),
    });

    assert.strictEqual(reason.action, "extract");
    assert.strictEqual(reason.description, "Schema mismatch");
    assert.instanceOf(reason.cause, Error);
  });

  it("AgentError carries description and optional cause", () => {
    const reason = new AgentError({
      description: "OpenAI API rate limit",
      cause: new Error("429 Too Many Requests"),
    });

    assert.strictEqual(reason.description, "OpenAI API rate limit");
    assert.instanceOf(reason.cause, Error);
  });

  it("OperationError without cause", () => {
    const reason = new OperationError({
      action: "act",
      description: "Element not found",
    });

    assert.strictEqual(reason.action, "act");
    assert.strictEqual(reason.description, "Element not found");
    assert.isUndefined(reason.cause);
  });
});

// ── Parent Error Delegation ───────────────────────────────────────────────────

describe("StagehandError delegation", () => {
  it("delegates message to module.method: reasonTag — description", () => {
    const reason = new ConnectionError({ description: "WS failed" });
    const error = new StagehandError({
      source: "Stagehand",
      method: "withConnection",
      reason,
    });

    assert.strictEqual(
      error.message,
      "Stagehand.withConnection: effect-libs/browser/StagehandError/ConnectionError — WS failed",
    );
  });

  it("includes description for OperationError", () => {
    const reason = new OperationError({ action: "act", description: "Action timed out" });
    const error = new StagehandError({ source: "Stagehand", method: "act", reason });

    assert.strictEqual(
      error.message,
      "Stagehand.act: effect-libs/browser/StagehandError/OperationError — Action timed out",
    );
  });

  it("includes description for AgentError", () => {
    const reason = new AgentError({ description: "LLM API error" });
    const error = new StagehandError({ source: "Stagehand", method: "observe", reason });

    assert.strictEqual(
      error.message,
      "Stagehand.observe: effect-libs/browser/StagehandError/AgentError — LLM API error",
    );
  });

  it("delegates cause to reason", () => {
    const reason = new ConnectionError({ description: "boom" });
    const error = new StagehandError({ source: "Stagehand", method: "test", reason });

    assert.strictEqual(error.cause, reason);
  });

  it("delegates isRetryable to reason", () => {
    for (const reasonCase of reasonCases) {
      const error = new StagehandError({
        source: "Stagehand",
        method: "test",
        reason: reasonCase.make(),
      });

      assert.strictEqual(error.isRetryable, reasonCase.isRetryable);
    }
  });

  it("exposes module and method fields", () => {
    const error = new StagehandError({
      source: "StagehandInstance",
      method: "use",
      reason: new OperationError({ action: "act", description: "failed" }),
    });

    assert.strictEqual(error.source, "StagehandInstance");
    assert.strictEqual(error.method, "use");
  });

  it("has correct _tag", () => {
    const error = new StagehandError({
      source: "Stagehand",
      method: "test",
      reason: new ConnectionError({ description: "failed" }),
    });

    assert.strictEqual(error._tag, "effect-libs/browser/StagehandError");
  });
});

// ── Schema Roundtrip ──────────────────────────────────────────────────────────

describe("StagehandError schema roundtrip", () => {
  for (const reasonCase of reasonCases) {
    it.effect(
      `schema roundtrip for StagehandError wrapping ${reasonCase.tag.split("/").pop()}`,
      () =>
        Effect.gen(function* () {
          const error = new StagehandError({
            source: "Stagehand",
            method: "test",
            reason: reasonCase.make(),
          });

          const encoded = yield* Schema.encodeEffect(StagehandError)(error);
          const decoded = yield* Schema.decodeEffect(StagehandError)(encoded);

          assert.strictEqual(decoded._tag, "effect-libs/browser/StagehandError");
          assert.strictEqual(decoded.reason._tag, reasonCase.tag);
          assert.strictEqual(decoded.source, "Stagehand");
          assert.strictEqual(decoded.method, "test");
          assert.strictEqual(decoded.isRetryable, reasonCase.isRetryable);
          assert.strictEqual(decoded.cause, decoded.reason);
        }),
    );
  }
});
