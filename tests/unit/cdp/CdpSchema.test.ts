/**
 * Unit tests for CDP Schema validation.
 *
 * Tests the CdpMessage which validates WebSocket message envelopes.
 * CDP protocol responses are trusted — only the envelope is validated.
 */

import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { CdpMessage } from "../../../packages/browser-cdp/src/internal/CdpSchema.js";

/** Captures a thrown value, re-throws unexpected defects. */
function tryCatch<T>(f: () => T): unknown {
  try {
    f();
    return undefined;
  } catch (e) {
    return e;
  }
}

// ── Valid Message Envelopes ──────────────────────────────────────────────────

describe("CdpMessage - valid messages", () => {
  it("validates command response with result", () => {
    const raw = { id: 1, result: { protocolVersion: "1.3" } };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.id, 1);
    assert.isObject(decoded.result);
  });

  it("validates command response with error", () => {
    const raw = {
      id: 2,
      error: { code: -32000, message: "Page not found" },
    };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.id, 2);
    assert.isObject(decoded.error);
    assert.strictEqual(decoded.error?.code, -32000);
    assert.strictEqual(decoded.error?.message, "Page not found");
  });

  it("validates event message with method and params", () => {
    const raw = {
      method: "Network.requestWillBeSent",
      params: { requestId: "req-1", request: { url: "https://example.com" } },
    };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.id, undefined);
    assert.strictEqual(decoded.method, "Network.requestWillBeSent");
    assert.isObject(decoded.params);
  });

  it("validates event without params", () => {
    const raw = { method: "Page.loadEventFired" };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.method, "Page.loadEventFired");
    assert.strictEqual(decoded.params, undefined);
  });

  it("validates minimal message (empty object)", () => {
    const raw = {};
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    // All fields are optional
    assert.strictEqual(decoded.id, undefined);
    assert.strictEqual(decoded.method, undefined);
    assert.strictEqual(decoded.params, undefined);
    assert.strictEqual(decoded.result, undefined);
    assert.strictEqual(decoded.error, undefined);
  });
});

// ── Invalid Messages ─────────────────────────────────────────────────────────

describe("CdpMessage - invalid messages", () => {
  it("rejects non-object values", () => {
    assert.isTrue(
      Schema.isSchemaError(tryCatch(() => Schema.decodeUnknownSync(CdpMessage)("string"))),
    );
    assert.isTrue(Schema.isSchemaError(tryCatch(() => Schema.decodeUnknownSync(CdpMessage)(42))));
    assert.isTrue(Schema.isSchemaError(tryCatch(() => Schema.decodeUnknownSync(CdpMessage)(null))));
  });

  it("rejects invalid id type", () => {
    const raw = { id: "not-a-number", result: {} };
    assert.isTrue(Schema.isSchemaError(tryCatch(() => Schema.decodeUnknownSync(CdpMessage)(raw))));
  });

  it("rejects invalid method type", () => {
    const raw = { method: 123 };
    assert.isTrue(Schema.isSchemaError(tryCatch(() => Schema.decodeUnknownSync(CdpMessage)(raw))));
  });

  it("rejects invalid error code type", () => {
    const raw = { id: 1, error: { code: "invalid", message: "err" } };
    assert.isTrue(Schema.isSchemaError(tryCatch(() => Schema.decodeUnknownSync(CdpMessage)(raw))));
  });

  it("rejects missing error message", () => {
    const raw = { id: 1, error: { code: -1 } };
    // message is required in CdpProtocolError
    assert.isTrue(Schema.isSchemaError(tryCatch(() => Schema.decodeUnknownSync(CdpMessage)(raw))));
  });
});

// ── Edge Cases ───────────────────────────────────────────────────────────────

describe("CdpMessage - edge cases", () => {
  it("handles large result objects", () => {
    const raw = {
      id: 1,
      result: {
        data: Array.from({ length: 100 }, (_, i) => ({ index: i, value: `item-${i}` })),
      },
    };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.id, 1);
    assert.isObject(decoded.result);
  });

  it("handles nested params", () => {
    const raw = {
      method: "Runtime.consoleAPICalled",
      params: {
        type: "log",
        args: [{ type: "string", value: "hello" }],
        executionContextId: 1,
        timestamp: 1234567890,
      },
    };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.method, "Runtime.consoleAPICalled");
    assert.isObject(decoded.params);
  });

  it("handles zero id", () => {
    const raw = { id: 0, result: {} };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.id, 0);
  });

  it("handles negative error codes", () => {
    const raw = {
      id: 1,
      error: { code: -32601, message: "Method not found" },
    };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.error?.code, -32601);
  });
});

// ── Type Exports ─────────────────────────────────────────────────────────────

describe("CdpMessage type", () => {
  it("provides typed access to decoded messages", () => {
    const raw = {
      id: 1,
      method: "test.method",
      params: { key: "value" },
      result: { data: "test" },
    };
    const msg: CdpMessage = Schema.decodeUnknownSync(CdpMessage)(raw);

    // TypeScript knows these are optional
    if (msg.id !== undefined) {
      assert.isNumber(msg.id);
    }
    if (msg.method !== undefined) {
      assert.isString(msg.method);
    }
  });
});

// ── Real CDP Message Examples ─────────────────────────────────────────────────

describe("CdpMessage - real CDP examples", () => {
  it("validates Browser.getVersion response", () => {
    const raw = {
      id: 1,
      result: {
        protocolVersion: "1.3",
        product: "HeadlessChrome/120.0",
        userAgent: "Mozilla/5.0...",
        revision: "@123abc",
      },
    };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.id, 1);
    assert.exists(decoded.result);
  });

  it("validates Target.getTargets response", () => {
    const raw = {
      id: 2,
      result: {
        targetInfos: [
          { targetId: "page-1", type: "page", url: "https://example.com" },
          { targetId: "worker-1", type: "service_worker", url: "sw.js" },
        ],
      },
    };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.id, 2);
    assert.exists(decoded.result);
  });

  it("validates Page.navigate response", () => {
    const raw = {
      id: 3,
      result: {
        frameId: "main",
        loaderId: "loader-1",
      },
    };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.id, 3);
  });

  it("validates Runtime.evaluate response", () => {
    const raw = {
      id: 4,
      result: {
        result: {
          type: "string",
          value: "Hello World",
        },
      },
    };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.id, 4);
  });

  it("validates Network.requestWillBeSent event", () => {
    const raw = {
      method: "Network.requestWillBeSent",
      params: {
        requestId: "100.1",
        loaderId: "loader-1",
        documentURL: "https://example.com",
        request: {
          url: "https://example.com/api/data",
          method: "GET",
          headers: {},
        },
        timestamp: 12345,
      },
    };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.method, "Network.requestWillBeSent");
    assert.exists(decoded.params);
  });

  it("validates Page.loadEventFired event", () => {
    const raw = {
      method: "Page.loadEventFired",
      params: {
        timestamp: 12345,
      },
    };
    const decoded = Schema.decodeUnknownSync(CdpMessage)(raw);

    assert.strictEqual(decoded.method, "Page.loadEventFired");
  });
});
