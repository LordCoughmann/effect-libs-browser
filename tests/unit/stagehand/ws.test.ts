/**
 * Tests for the WebSocket polyfill for Cloudflare Workers.
 *
 * Tests verify the polyfill correctly maps Node.js ws API to the
 * standard WebSocket API available in Workers runtime.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Import the polyfill - in Workers, globalThis.WebSocket is the native one
import WebSocketPolyfill from "@effect-libs/browser-stagehand/ws";

// ── Test Helpers ───────────────────────────────────────────────────────────────

/**
 * Find and invoke an event handler from the mock's addEventListener calls.
 * Returns undefined if no handler found for the given event type.
 */
function invokeEventHandler(
  mockWsInstance: { addEventListener: ReturnType<typeof vi.fn> },
  eventType: string,
  eventData?: unknown,
): unknown {
  const handler = mockWsInstance.addEventListener.mock.calls.find(
    (call) => call[0] === eventType,
  )?.[1];
  return handler?.(eventData);
}

/**
 * Assert that a handler was not called after being removed.
 */
function assertHandlerNotCalled(
  mockWsInstance: { addEventListener: ReturnType<typeof vi.fn> },
  eventType: string,
  handler: ReturnType<typeof vi.fn>,
): void {
  const registeredHandler = mockWsInstance.addEventListener.mock.calls.find(
    (call) => call[0] === eventType,
  )?.[1];
  registeredHandler?.({ data: "test" });
  expect(handler).not.toHaveBeenCalled();
}

// ── Mock globalThis.WebSocket ──────────────────────────────────────────────────

describe("WebSocketPolyfill", () => {
  // The instance that the mock constructor returns
  let mockWsInstance: {
    readyState: number;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockWsInstance = {
      readyState: 0,
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    // Create a mock class constructor
    const MockWebSocket = vi.fn(function (this: typeof mockWsInstance) {
      Object.assign(this, mockWsInstance);
      return this;
    });

    // Stub globalThis.WebSocket with the mock constructor
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ── Constructor Tests ────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("creates WebSocket with URL", () => {
      new WebSocketPolyfill("wss://example.com/socket");

      expect(globalThis.WebSocket).toHaveBeenCalledWith("wss://example.com/socket");
    });

    it("warns when headers are provided (not supported in Workers)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      new WebSocketPolyfill("wss://example.com/socket", {
        headers: { Authorization: "Bearer token" },
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Custom headers are not supported"),
      );

      warnSpy.mockRestore();
    });

    it("does not warn when headers are empty", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      new WebSocketPolyfill("wss://example.com/socket", { headers: {} });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("does not warn when options are omitted", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      new WebSocketPolyfill("wss://example.com/socket");

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // ── Event Listener Tests ─────────────────────────────────────────────────────

  describe("event listeners", () => {
    it("registers open listener with on()", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");
      const handler = vi.fn();

      ws.on("open", handler);

      // Simulate open event
      const openHandler = mockWsInstance.addEventListener.mock.calls.find(
        (call) => call[0] === "open",
      )?.[1];
      openHandler?.();

      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it("registers message listener with on()", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");
      const handler = vi.fn();

      ws.on("message", handler);

      // Simulate message event
      const messageHandler = mockWsInstance.addEventListener.mock.calls.find(
        (call) => call[0] === "message",
      )?.[1];
      messageHandler?.({ data: '{"type":"test"}' });

      expect(handler).toHaveBeenCalledWith('{"type":"test"}');
    });

    it("registers close listener with on()", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");
      const handler = vi.fn();

      ws.on("close", handler);

      // Simulate close event
      const closeHandler = mockWsInstance.addEventListener.mock.calls.find(
        (call) => call[0] === "close",
      )?.[1];
      closeHandler?.({ code: 1000, reason: "Normal", wasClean: true });

      expect(handler).toHaveBeenCalledWith({
        code: 1000,
        reason: "Normal",
        wasClean: true,
      });
    });

    it("registers error listener with on()", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");
      const handler = vi.fn();

      ws.on("error", handler);

      // Simulate error event
      const errorHandler = mockWsInstance.addEventListener.mock.calls.find(
        (call) => call[0] === "error",
      )?.[1];
      errorHandler?.();

      expect(handler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ── Once Listener Tests ──────────────────────────────────────────────────────

  describe("once listeners", () => {
    it("once() registers handler that fires only once", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");
      const handler = vi.fn();

      ws.once("message", handler);

      // Get the message handler from addEventListener
      const messageHandler = mockWsInstance.addEventListener.mock.calls.find(
        (call) => call[0] === "message",
      )?.[1];

      // Fire twice
      messageHandler?.({ data: "first" });
      messageHandler?.({ data: "second" });

      // Should only be called once
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("first");
    });
  });

  // ── off() Tests ──────────────────────────────────────────────────────────────

  describe("off()", () => {
    it("removes listener registered with on()", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");
      const handler = vi.fn();

      ws.on("message", handler);
      ws.off("message", handler);

      assertHandlerNotCalled(mockWsInstance, "message", handler);
    });
  });

  // ── send() Tests ─────────────────────────────────────────────────────────────

  describe("send()", () => {
    it("sends string data", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");

      ws.send('{"type":"test"}');

      expect(mockWsInstance.send).toHaveBeenCalledWith('{"type":"test"}');
    });

    it("converts ArrayBuffer to string", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");
      const encoder = new TextEncoder();
      const buffer = encoder.encode('{"type":"test"}');

      ws.send(buffer.buffer);

      expect(mockWsInstance.send).toHaveBeenCalledWith('{"type":"test"}');
    });

    it("converts TypedArray to string", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");
      const encoder = new TextEncoder();
      const data = encoder.encode('{"type":"test"}');

      ws.send(data);

      expect(mockWsInstance.send).toHaveBeenCalledWith('{"type":"test"}');
    });
  });

  // ── close() Tests ────────────────────────────────────────────────────────────

  describe("close()", () => {
    it("closes with default code 1000", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");

      ws.close();

      expect(mockWsInstance.close).toHaveBeenCalledWith(1000, "");
    });

    it("closes with custom code and reason", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");

      ws.close(1001, "Going Away");

      expect(mockWsInstance.close).toHaveBeenCalledWith(1001, "Going Away");
    });
  });

  // ── readyState Tests ─────────────────────────────────────────────────────────

  describe("readyState", () => {
    it("returns CONNECTING (0) initially", () => {
      mockWsInstance.readyState = 0;
      const ws = new WebSocketPolyfill("wss://example.com/socket");

      expect(ws.readyState).toBe(0);
    });

    it("readyState delegates to underlying WebSocket", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");

      // The polyfill reads readyState from the underlying WebSocket
      // In real usage, the WebSocket's readyState changes as connection progresses
      // For this test, we just verify the getter works
      expect(typeof ws.readyState).toBe("number");
      expect(ws.readyState).toBeGreaterThanOrEqual(0);
      expect(ws.readyState).toBeLessThanOrEqual(3);
    });
  });

  // ── addEventListener/removeEventListener Tests ───────────────────────────────

  describe("addEventListener/removeEventListener", () => {
    it("addEventListener is alias for on()", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");
      const handler = vi.fn();

      ws.addEventListener("message", handler);

      invokeEventHandler(mockWsInstance, "message", { data: "test" });

      expect(handler).toHaveBeenCalledWith("test");
    });

    it("removeEventListener is alias for off()", () => {
      const ws = new WebSocketPolyfill("wss://example.com/socket");
      const handler = vi.fn();

      ws.addEventListener("message", handler);
      ws.removeEventListener("message", handler);

      assertHandlerNotCalled(mockWsInstance, "message", handler);
    });
  });
});
