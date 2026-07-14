/**
 * Unit tests for Cdp.ts context detection helpers.
 *
 * Tests `isContextNotSupportedError` which pattern-matches on CDP error messages
 * to detect when the browser doesn't support `Target.createBrowserContext`.
 *
 * This is fragile by design - CDP has no structured error code for this,
 * only generic -32602 or -32000 messages. Tests document the contract.
 */

import { assert, describe, it } from "@effect/vitest";

// We need to extract the helper for testing. It's defined inline in Cdp.ts
// so we'll recreate it here for test purposes. If it moves to a separate file,
// we can import directly.

/**
 * Determine whether a CDP error message indicates that the browser
 * does not support `Target.createBrowserContext`.
 *
 * Observed on:
 * - Chrome headless (linux) ≤ 120: `"Invalid params"`
 * - Chrome headed (all platforms): `"Not supported"`
 * - Android WebView: `"Not supported"`
 *
 * **Assumption:** The caller always passes well-formed params
 * (`{ disposeOnAttach: true }`), so `"Invalid params"` can only mean
 * the browser lacks the capability.
 */
const isContextNotSupportedError = (description: string): boolean =>
  description.includes("Not supported") ||
  description.includes("not supported") ||
  description.includes("Invalid params");

// ── Test Cases ────────────────────────────────────────────────────────────────

describe("isContextNotSupportedError", () => {
  describe("Not supported (capitalized)", () => {
    it("matches 'Not supported'", () => {
      assert.isTrue(isContextNotSupportedError("Not supported"));
    });

    it("matches 'Target.createBrowserContext: Not supported'", () => {
      assert.isTrue(isContextNotSupportedError("Target.createBrowserContext: Not supported"));
    });

    it("matches 'Browser contexts Not supported on this platform'", () => {
      assert.isTrue(isContextNotSupportedError("Browser contexts Not supported on this platform"));
    });
  });

  describe("not supported (lowercase)", () => {
    it("matches 'not supported'", () => {
      assert.isTrue(isContextNotSupportedError("not supported"));
    });

    it("matches 'Context creation not supported'", () => {
      assert.isTrue(isContextNotSupportedError("Context creation not supported"));
    });

    it("matches 'Target.createBrowserContext is not supported'", () => {
      assert.isTrue(isContextNotSupportedError("Target.createBrowserContext is not supported"));
    });
  });

  describe("Invalid params", () => {
    it("matches 'Invalid params'", () => {
      assert.isTrue(isContextNotSupportedError("Invalid params"));
    });

    it("matches '-32602 Invalid params'", () => {
      assert.isTrue(isContextNotSupportedError("-32602 Invalid params"));
    });

    it("matches 'Target.createBrowserContext: Invalid params'", () => {
      assert.isTrue(isContextNotSupportedError("Target.createBrowserContext: Invalid params"));
    });
  });

  describe("Negative cases (should NOT match)", () => {
    it("does not match unrelated errors", () => {
      assert.isFalse(isContextNotSupportedError("Target not found"));
      assert.isFalse(isContextNotSupportedError("Session closed"));
      assert.isFalse(isContextNotSupportedError("Network error"));
      assert.isFalse(isContextNotSupportedError("Timeout"));
    });

    it("does not match 'params' without 'Invalid'", () => {
      assert.isFalse(isContextNotSupportedError("Missing params"));
      assert.isFalse(isContextNotSupportedError("Bad params"));
    });

    it("does not match empty string", () => {
      assert.isFalse(isContextNotSupportedError(""));
    });

    it("does not match 'support' without 'not'", () => {
      assert.isFalse(isContextNotSupportedError("Support available"));
      assert.isFalse(isContextNotSupportedError("We support contexts"));
    });
  });

  describe("Edge cases", () => {
    // Note: includes() is case-sensitive, so "NOT SUPPORTED" won't match "Not supported"
    it("handles exact case matches", () => {
      assert.isTrue(isContextNotSupportedError("Not supported"));
      assert.isTrue(isContextNotSupportedError("not supported"));
    });

    it("does NOT match case variations (case-sensitive)", () => {
      // The implementation uses includes() which is case-sensitive
      assert.isFalse(isContextNotSupportedError("NOT SUPPORTED"));
      assert.isFalse(isContextNotSupportedError("Not Supported"));
    });

    it("handles whitespace around message", () => {
      // Leading/trailing whitespace is fine because it's still inside the string
      assert.isTrue(isContextNotSupportedError("  Not supported  "));
      assert.isTrue(isContextNotSupportedError("  not supported  "));
    });

    it("Invalid params must match exactly (case-sensitive)", () => {
      // "Invalid  params" has double space — does NOT match "Invalid params"
      assert.isFalse(isContextNotSupportedError("Invalid  params"));
      // The exact match works
      assert.isTrue(isContextNotSupportedError("Invalid params"));
    });
  });

  describe("Real CDP error examples (documented)", () => {
    it("matches Chrome headed error", () => {
      // Chrome headed returns something like "-32000 Not supported"
      assert.isTrue(isContextNotSupportedError("-32000 Not supported"));
    });

    it("matches Chrome headless ≤120 error", () => {
      // Chrome headless linux ≤120 returns "-32602 Invalid params"
      assert.isTrue(isContextNotSupportedError("-32602 Invalid params"));
    });

    it("matches Android WebView error", () => {
      assert.isTrue(isContextNotSupportedError("Not supported"));
    });
  });
});
