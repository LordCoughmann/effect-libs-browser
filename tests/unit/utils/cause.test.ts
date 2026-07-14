/**
 * Unit tests for cause extraction utilities.
 *
 * Tests safe property extraction from unknown error causes.
 * Only `getCauseMessage` is exported from the package.
 */

import { assert, describe, it } from "@effect/vitest";
import { Option } from "effect";

import { getCauseMessage, getErrorMessage } from "@effect-libs/browser";

// ── getCauseMessage ───────────────────────────────────────────────────────────

describe("getCauseMessage", () => {
  it("extracts string message from object", () => {
    const cause = { message: "Network timeout" };
    assert.strictEqual(
      Option.getOrElse(getCauseMessage(cause), () => undefined),
      "Network timeout",
    );
  });

  it("extracts message from Error instance", () => {
    const cause = new Error("Something went wrong");
    assert.strictEqual(
      Option.getOrElse(getCauseMessage(cause), () => undefined),
      "Something went wrong",
    );
  });

  it("returns undefined for non-string message", () => {
    const cause = { message: 42 };
    assert.strictEqual(
      Option.getOrElse(getCauseMessage(cause), () => undefined),
      undefined,
    );
  });

  it("returns undefined for missing message", () => {
    const cause = { status: 500 };
    assert.strictEqual(
      Option.getOrElse(getCauseMessage(cause), () => undefined),
      undefined,
    );
  });

  it("returns undefined for null", () => {
    assert.strictEqual(
      Option.getOrElse(getCauseMessage(null), () => undefined),
      undefined,
    );
  });

  it("returns undefined for undefined", () => {
    assert.strictEqual(
      Option.getOrElse(getCauseMessage(undefined), () => undefined),
      undefined,
    );
  });

  it("returns undefined for string primitive", () => {
    assert.strictEqual(
      Option.getOrElse(getCauseMessage("error message"), () => undefined),
      undefined,
    );
  });

  it("returns undefined for number", () => {
    assert.strictEqual(
      Option.getOrElse(getCauseMessage(42), () => undefined),
      undefined,
    );
  });

  it("returns undefined for boolean", () => {
    assert.strictEqual(
      Option.getOrElse(getCauseMessage(true), () => undefined),
      undefined,
    );
  });
});

// ── getErrorMessage ─────────────────────────────────────────────────────────────

describe("getErrorMessage", () => {
  it("extracts message from Error instance", () => {
    assert.strictEqual(getErrorMessage(new Error("Something went wrong")), "Something went wrong");
  });

  it("extracts string message from object", () => {
    assert.strictEqual(getErrorMessage({ message: "Network timeout" }), "Network timeout");
  });

  it("returns String(cause) for non-string message", () => {
    assert.strictEqual(getErrorMessage({ message: 42 }), "[object Object]");
  });

  it("returns String(cause) for missing message", () => {
    assert.strictEqual(getErrorMessage({ status: 500 }), "[object Object]");
  });

  it("returns 'null' for null", () => {
    assert.strictEqual(getErrorMessage(null), "null");
  });

  it("returns 'undefined' for undefined", () => {
    assert.strictEqual(getErrorMessage(undefined), "undefined");
  });

  it("returns string primitive as-is", () => {
    assert.strictEqual(getErrorMessage("error message"), "error message");
  });

  it("returns number as string", () => {
    assert.strictEqual(getErrorMessage(42), "42");
  });

  it("returns boolean as string", () => {
    assert.strictEqual(getErrorMessage(true), "true");
  });
});
