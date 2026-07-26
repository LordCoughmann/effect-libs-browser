/**
 * Tests for CdpError — new structured error model.
 *
 * Follows the Effect SqlError testing pattern:
 * - Direct reason construction and property assertion
 * - Parent error delegation (message, cause, isRetryable)
 * - Type discrimination by reason _tag
 * - Schema roundtrip for encode/decode
 *
 * @see repos/effect-smol/packages/effect/test/unstable/sql/SqlError.test.ts
 */

import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect, Schema } from "effect";

import {
  CdpError,
  ConnectionError,
  ContextNotSupportedError,
  NavigationError,
  PageTimeoutError,
  CommandError,
  EvaluationError,
  SelectorError,
  ScreenshotError,
  PdfError,
  CookieError,
  StorageError,
  FetchError,
  type CdpErrorReason,
} from "@effect-libs/browser-cdp";

// ── Reason Test Cases ─────────────────────────────────────────────────────────

type ReasonCase = {
  readonly tag: string;
  readonly isRetryable: boolean;
  readonly make: () => CdpErrorReason;
};

const reasonCases: ReadonlyArray<ReasonCase> = [
  {
    tag: "effect-libs/browser/CdpError/ConnectionError",
    isRetryable: true,
    make: () => new ConnectionError({ description: "WS failed", cause: new Error("boom") }),
  },
  {
    tag: "effect-libs/browser/CdpError/ContextNotSupportedError",
    isRetryable: false,
    make: () => new ContextNotSupportedError({ description: "not supported" }),
  },
  {
    tag: "effect-libs/browser/CdpError/NavigationError",
    isRetryable: true,
    make: () => new NavigationError({ url: "https://example.com", description: "timeout" }),
  },
  {
    tag: "effect-libs/browser/CdpError/PageTimeoutError",
    isRetryable: true,
    make: () => new PageTimeoutError({ timeout: Duration.fromInputUnsafe(5000) }),
  },
  {
    tag: "effect-libs/browser/CdpError/CommandError",
    isRetryable: false,
    make: () => new CommandError({ method: "Runtime.evaluate", description: "bad call" }),
  },
  {
    tag: "effect-libs/browser/CdpError/EvaluationError",
    isRetryable: false,
    make: () => new EvaluationError({ description: "script threw" }),
  },
  {
    tag: "effect-libs/browser/CdpError/SelectorError",
    isRetryable: false,
    make: () => new SelectorError({ selector: "#missing", description: "not found" }),
  },
  {
    tag: "effect-libs/browser/CdpError/ScreenshotError",
    isRetryable: false,
    make: () => new ScreenshotError({ description: "viewport too large" }),
  },
  {
    tag: "effect-libs/browser/CdpError/PdfError",
    isRetryable: false,
    make: () => new PdfError({ description: "stream read failed" }),
  },
  {
    tag: "effect-libs/browser/CdpError/CookieError",
    isRetryable: false,
    make: () => new CookieError({ description: "invalid domain" }),
  },
  {
    tag: "effect-libs/browser/CdpError/StorageError",
    isRetryable: false,
    make: () => new StorageError({ description: "quota exceeded" }),
  },
  {
    tag: "effect-libs/browser/CdpError/FetchError",
    isRetryable: true,
    make: () => new FetchError({ url: "https://api.test", description: "CORS blocked" }),
  },
];

// ── Reason Tests ──────────────────────────────────────────────────────────────

describe("CdpError reasons", () => {
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
  });

  it("NavigationError carries url and description", () => {
    const reason = new NavigationError({
      url: "https://example.com",
      description: "Load timed out",
    });

    assert.strictEqual(reason.url, "https://example.com");
    assert.strictEqual(reason.description, "Load timed out");
  });

  it("PageTimeoutError carries selector and timeout", () => {
    const reason = new PageTimeoutError({
      selector: "#btn",
      timeout: Duration.fromInputUnsafe(3000),
    });

    assert.strictEqual(reason.selector, "#btn");
    assert.strictEqual(Duration.toMillis(reason.timeout), 3000);

    const withoutSelector = new PageTimeoutError({ timeout: Duration.fromInputUnsafe(1000) });
    assert.strictEqual(withoutSelector.selector, undefined);
  });

  it("CommandError carries method and description", () => {
    const reason = new CommandError({
      method: "DOM.querySelector",
      description: "Invalid selector",
    });

    assert.strictEqual(reason.method, "DOM.querySelector");
    assert.strictEqual(reason.description, "Invalid selector");
  });

  it("SelectorError carries selector and description", () => {
    const reason = new SelectorError({
      selector: "div >> span",
      description: "Malformed selector",
    });

    assert.strictEqual(reason.selector, "div >> span");
    assert.strictEqual(reason.description, "Malformed selector");
  });

  it("FetchError carries url and description", () => {
    const reason = new FetchError({
      url: "https://api.test/data",
      description: "Network failure",
    });

    assert.strictEqual(reason.url, "https://api.test/data");
    assert.strictEqual(reason.description, "Network failure");
  });
});

// ── Parent Error Delegation ───────────────────────────────────────────────────

describe("CdpError delegation", () => {
  it("delegates message to module.method: reasonTag — description", () => {
    const reason = new ConnectionError({ description: "WS failed" });
    const error = new CdpError({
      source: "Cdp",
      method: "connect",
      reason,
    });

    assert.strictEqual(error.message, "Cdp.connect: ConnectionError — WS failed");
  });

  it("delegates cause to reason", () => {
    const reason = new ConnectionError({ description: "boom" });
    const error = new CdpError({ source: "Cdp", method: "test", reason });

    assert.strictEqual(error.cause, reason);
  });

  it("delegates isRetryable to reason", () => {
    for (const reasonCase of reasonCases) {
      const error = new CdpError({
        source: "Cdp",
        method: "test",
        reason: reasonCase.make(),
      });

      assert.strictEqual(error.isRetryable, reasonCase.isRetryable);
    }
  });

  it("exposes module and method fields", () => {
    const error = new CdpError({
      source: "CdpConnectionHandle",
      method: "withContext",
      reason: new ConnectionError({ description: "failed" }),
    });

    assert.strictEqual(error.source, "CdpConnectionHandle");
    assert.strictEqual(error.method, "withContext");
  });

  it("has correct _tag", () => {
    const error = new CdpError({
      source: "Cdp",
      method: "test",
      reason: new ConnectionError({ description: "failed" }),
    });

    assert.strictEqual(error._tag, "effect-libs/browser/CdpError");
  });
});

// ── Schema Roundtrip ──────────────────────────────────────────────────────────

describe("CdpError schema roundtrip", () => {
  for (const reasonCase of reasonCases) {
    it.effect(`schema roundtrip for CdpError wrapping ${reasonCase.tag.split("/").pop()}`, () =>
      Effect.gen(function* () {
        const error = new CdpError({
          source: "Cdp",
          method: "test",
          reason: reasonCase.make(),
        });

        const encoded = yield* Schema.encodeEffect(CdpError)(error);
        const decoded = yield* Schema.decodeEffect(CdpError)(encoded);

        assert.strictEqual(decoded._tag, "effect-libs/browser/CdpError");
        assert.strictEqual(decoded.reason._tag, reasonCase.tag);
        assert.strictEqual(decoded.source, "Cdp");
        assert.strictEqual(decoded.method, "test");
        assert.strictEqual(decoded.isRetryable, reasonCase.isRetryable);
        assert.strictEqual(decoded.cause, decoded.reason);
      }),
    );
  }
});
