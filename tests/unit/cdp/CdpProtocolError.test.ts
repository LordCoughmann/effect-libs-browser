/**
 * Unit tests for CDP transport error types (low-level protocol layer).
 *
 * These are the errors thrown by `CdpConnection`/`CdpProtocol` — collapsed to
 * `ConnectionError` at the service boundary by `mapCdpError`.
 */

import { assert, describe, it } from "@effect/vitest";
import { Duration, Predicate } from "effect";

import {
  CdpConnectionError,
  CdpTimeoutError,
  CdpCommandError,
  CdpMessageParseError,
} from "@effect-libs/browser-cdp";

// ── CdpConnectionError ───────────────────────────────────────────────────────

describe("effect-libs/browser/CdpConnectionError", () => {
  it("creates with reason", () => {
    const error = new CdpConnectionError({ reason: "WebSocket failed" });

    assert.strictEqual(error._tag, "effect-libs/browser/CdpConnectionError");
    assert.strictEqual(error.reason, "WebSocket failed");
    assert.strictEqual(error.message, "WebSocket failed");
  });

  it("creates with cause", () => {
    const cause = new Error("underlying error");
    const error = new CdpConnectionError({ reason: "Connection dropped", cause });

    assert.strictEqual(error.reason, "Connection dropped");
    assert.strictEqual(error.cause, cause);
  });

  it("is a Schema.TaggedError", () => {
    const error = new CdpConnectionError({ reason: "test" });

    // Schema tagged errors have _tag property
    assert.strictEqual(error._tag, "effect-libs/browser/CdpConnectionError");
  });
});

// ── CdpTimeoutError ──────────────────────────────────────────────────────────

describe("effect-libs/browser/CdpTimeoutError", () => {
  it("creates with method and timeout", () => {
    const error = new CdpTimeoutError({
      method: "Page.navigate",
      timeout: Duration.fromInputUnsafe(5000),
    });

    assert.strictEqual(error._tag, "effect-libs/browser/CdpTimeoutError");
    assert.strictEqual(error.method, "Page.navigate");
    assert.strictEqual(Duration.toMillis(error.timeout), 5000);
    assert.strictEqual(error.message, "Timeout after 5s waiting for Page.navigate");
  });

  it("formats message correctly for different methods", () => {
    const error1 = new CdpTimeoutError({
      method: "Runtime.evaluate",
      timeout: Duration.fromInputUnsafe(1000),
    });
    assert.strictEqual(error1.message, "Timeout after 1s waiting for Runtime.evaluate");

    const error2 = new CdpTimeoutError({
      method: "Target.attachToTarget",
      timeout: Duration.fromInputUnsafe(30000),
    });
    assert.strictEqual(error2.message, "Timeout after 30s waiting for Target.attachToTarget");
  });
});

// ── CdpCommandError ───────────────────────────────────────────────────────────

describe("effect-libs/browser/CdpCommandError", () => {
  it("creates with CDP error details", () => {
    const error = new CdpCommandError({
      code: -32000,
      message: "Page not found",
      method: "Page.navigate",
    });

    assert.strictEqual(error._tag, "effect-libs/browser/CdpCommandError");
    assert.strictEqual(error.code, -32000);
    assert.strictEqual(error.message, "Page not found");
    assert.strictEqual(error.method, "Page.navigate");
  });

  it("creates via fromCdpError factory", () => {
    const error = CdpCommandError.fromCdpError("Network.enable", {
      code: -32601,
      message: "Method not found",
    });

    assert.strictEqual(error.code, -32601);
    assert.strictEqual(error.message, "Method not found");
    assert.strictEqual(error.method, "Network.enable");
  });

  it("creates via fromValidationError factory", () => {
    const error = CdpCommandError.fromValidationError(
      "Target.attachToTarget",
      "Missing sessionId in response",
    );

    assert.strictEqual(error.code, -1);
    assert.strictEqual(error.message, "Missing sessionId in response");
    assert.strictEqual(error.method, "Target.attachToTarget");
  });

  it("handles common CDP error codes", () => {
    // -32000: Server error
    const serverError = new CdpCommandError({
      code: -32000,
      message: "Server error",
      method: "test",
    });
    assert.strictEqual(serverError.code, -32000);

    // -32601: Method not found
    const methodError = new CdpCommandError({
      code: -32601,
      message: "Method not found",
      method: "test",
    });
    assert.strictEqual(methodError.code, -32601);

    // -32602: Invalid params
    const paramsError = new CdpCommandError({
      code: -32602,
      message: "Invalid params",
      method: "test",
    });
    assert.strictEqual(paramsError.code, -32602);
  });
});

// ── CdpMessageParseError ──────────────────────────────────────────────────────

describe("effect-libs/browser/CdpMessageParseError", () => {
  it("creates with cause", () => {
    const cause = new SyntaxError("Unexpected token");
    const error = new CdpMessageParseError({ cause });

    assert.strictEqual(error._tag, "effect-libs/browser/CdpMessageParseError");
    assert.strictEqual(error.cause, cause);
    assert.isTrue(error.message.includes("Unexpected token"));
  });

  it("includes optional raw payload in message when provided", () => {
    const cause = new SyntaxError("Unexpected token");
    const error = new CdpMessageParseError({ cause, raw: "not-json{" });

    assert.strictEqual(error.raw, "not-json{");
    assert.isTrue(error.message.includes("Unexpected token"));
  });
});

// ── Error Type Discrimination ────────────────────────────────────────────────

describe("error type discrimination", () => {
  it("can discriminate by _tag", () => {
    const errors = [
      new CdpConnectionError({ reason: "failed" }),
      new CdpTimeoutError({ method: "test", timeout: Duration.fromInputUnsafe(1000) }),
      new CdpCommandError({ code: -1, message: "err", method: "test" }),
    ];

    const tags = errors.map((e) => e._tag);

    assert.deepStrictEqual(tags, [
      "effect-libs/browser/CdpConnectionError",
      "effect-libs/browser/CdpTimeoutError",
      "effect-libs/browser/CdpCommandError",
    ]);
  });

  it("supports Effect match on error types", () => {
    // This pattern is used in Effect error handling
    const error = new CdpTimeoutError({
      method: "Page.navigate",
      timeout: Duration.fromInputUnsafe(5000),
    });

    // The _tag enables pattern matching via Predicate.isTagged
    if (Predicate.isTagged("effect-libs/browser/CdpTimeoutError")(error)) {
      assert.strictEqual(error.method, "Page.navigate");
    } else {
      assert.fail("Should match CdpTimeoutError");
    }
  });
});
