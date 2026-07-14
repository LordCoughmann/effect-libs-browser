// oxlint-disable effect/avoid-any — mock WebSocket objects require casts for test types

/**
 * Unit tests for CDP Connection async patterns (Phase 3 refactoring).
 *
 * Tests the Effect.callback + Effect.timeout patterns that replaced
 * manual Deferred + setTimeout:
 *
 * - waitForConnection: WebSocket open/error/timeout paths + interrupt cleanup
 * - runUntracked: fire-and-forget error logging (tested indirectly)
 *
 * These tests mock the global WebSocket constructor to verify behavior
 * without real network connections.
 */

import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Fiber, Layer, Queue, Stream } from "effect";

import { CdpConfig } from "../../../packages/browser-cdp/src/internal/CdpConfig.js";
import { CdpConnection } from "../../../packages/browser-cdp/src/internal/CdpConnection.js";

// ── Mock WebSocket ────────────────────────────────────────────────────────────

const WS_OPEN = 1;
const WS_CONNECTING = 0;
const WS_CLOSED = 3;

/** Tracked addEventListener/removeEventListener call */
interface ListenerRecord {
  readonly type: string;
  readonly once?: boolean;
}

interface MockWs {
  readyState: number;
  onopen: (() => void) | null;
  onerror: ((e: Event) => void) | null;
  onclose: ((e: CloseEvent) => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: string, handler: (e?: Event) => void, opts?: { once?: boolean }) => void;
  removeEventListener: (type: string, handler: (e?: Event) => void) => void;
  simulateOpen: () => void;
  simulateError: (evt?: Event) => void;
  simulateClose: (code?: number) => void;
  simulateMessage: (data: unknown) => void;
  /** addEventListener calls (waitForConnection uses this) */
  added: ListenerRecord[];
  /** removeEventListener calls (interrupt cleanup) */
  removed: ListenerRecord[];
}

function createMockWs(): MockWs {
  const listenerMap = new Map<string, Set<(e?: Event) => void>>();
  const added: ListenerRecord[] = [];
  const removed: ListenerRecord[] = [];

  let _onopen: (() => void) | null = null;
  let _onerror: ((e: Event) => void) | null = null;
  let _onclose: ((e: CloseEvent) => void) | null = null;
  let _onmessage: ((e: MessageEvent) => void) | null = null;

  const ws = {
    readyState: WS_CONNECTING as number,
    get onopen() {
      return _onopen;
    },
    set onopen(fn: (() => void) | null) {
      _onopen = fn;
    },
    get onerror() {
      return _onerror;
    },
    set onerror(fn: ((e: Event) => void) | null) {
      _onerror = fn;
    },
    get onclose() {
      return _onclose;
    },
    set onclose(fn: ((e: CloseEvent) => void) | null) {
      _onclose = fn;
    },
    get onmessage() {
      return _onmessage;
    },
    set onmessage(fn: ((e: MessageEvent) => void) | null) {
      _onmessage = fn;
    },
    added,
    removed,
  } as unknown as MockWs;

  (ws as MockWs).send = () => {};
  (ws as MockWs).close = () => {
    ws.readyState = WS_CLOSED;
  };

  (ws as MockWs).addEventListener = (type, handler, opts) => {
    if (!listenerMap.has(type)) listenerMap.set(type, new Set());
    listenerMap.get(type)!.add(handler);
    added.push({ type, once: opts?.once });
  };

  (ws as MockWs).removeEventListener = (type, handler) => {
    listenerMap.get(type)?.delete(handler);
    removed.push({ type });
  };

  (ws as MockWs).simulateOpen = () => {
    ws.readyState = WS_OPEN;
    for (const h of listenerMap.get("open") ?? []) h();
    _onopen?.();
  };

  (ws as MockWs).simulateError = (evt?: Event) => {
    const event = evt ?? new Event("error");
    for (const h of listenerMap.get("error") ?? []) h(event);
    _onerror?.(event);
  };

  (ws as MockWs).simulateClose = (code = 1000) => {
    ws.readyState = WS_CLOSED;
    const event = new CloseEvent("close", { code });
    for (const h of listenerMap.get("close") ?? []) h(event);
    _onclose?.(event);
  };

  (ws as MockWs).simulateMessage = (data: unknown) => {
    const event = { data: JSON.stringify(data) } as MessageEvent;
    for (const h of listenerMap.get("message") ?? []) h(event);
    _onmessage?.(event);
  };

  return ws;
}

/**
 * Patches globalThis.WebSocket with a mock.
 * Returns the mock instance directly.
 */
function patchWebSocket(): { ws: MockWs; restore: () => void } {
  const orig = globalThis.WebSocket;
  const ws = createMockWs();

  // Use defineProperty to set statics without `as any`
  const MockWsClass = class {
    constructor() {
      return ws;
    }
    static readonly OPEN = WS_OPEN;
    static readonly CONNECTING = WS_CONNECTING;
  };

  Object.defineProperty(globalThis, "WebSocket", {
    value: MockWsClass,
    writable: true,
    configurable: true,
  });

  return {
    ws,
    restore: () => {
      Object.defineProperty(globalThis, "WebSocket", {
        value: orig,
        writable: true,
        configurable: true,
      });
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract _tag strings from a failed Exit's Cause reasons */
function errorTags<E>(exit: Exit.Exit<unknown, E>): string[] {
  if (Exit.isFailure(exit)) {
    return exit.cause.reasons
      .filter(Cause.isFailReason)
      .map((r) => ((r.error as Record<string, unknown>)._tag as string) ?? "unknown");
  }
  return [];
}

/** Build composed test layers */
function testLayers(opts: Partial<{ connectTimeoutMs: number; commandTimeoutMs: number }> = {}) {
  const configLayer = CdpConfig.layerCustom({
    connectTimeoutMs: opts.connectTimeoutMs ?? 500,
    commandTimeoutMs: opts.commandTimeoutMs ?? 2_000,
    debug: false,
  });
  // Use layerNoDeps so the custom configLayer is actually used
  return Layer.provide(CdpConnection.layerNoDeps("ws://test"), configLayer);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CdpConnection - waitForConnection", () => {
  it("succeeds when WebSocket opens", async () => {
    const { ws, restore } = patchWebSocket();
    try {
      setTimeout(() => ws.simulateOpen(), 10);

      const conn = await Effect.runPromise(
        Effect.gen(function* () {
          return yield* CdpConnection;
        }).pipe(Effect.provide(testLayers())),
      );

      assert.isNotNull(conn);
      assert.isFunction(conn.cdp.Page.navigate);
      // conn.close is an Effect<void>, not a function
    } finally {
      restore();
    }
  });

  it("fails with CdpConnectionError on timeout", async () => {
    const { restore } = patchWebSocket();
    try {
      // Never open - should timeout after connectTimeoutMs
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          return yield* CdpConnection;
        }).pipe(Effect.provide(testLayers({ connectTimeoutMs: 100 }))),
      );

      assert.isTrue(Exit.isFailure(exit));
      const tags = errorTags(exit);
      assert.isTrue(
        tags.includes("effect-libs/browser/CdpConnectionError"),
        `Expected CdpConnectionError, got ${tags.join(", ")}`,
      );
    } finally {
      restore();
    }
  });

  it("fails with CdpConnectionError on WebSocket error event", async () => {
    const { ws, restore } = patchWebSocket();
    try {
      setTimeout(() => ws.simulateError(), 10);

      const exit = await Effect.runPromise(
        Effect.exit(
          Effect.gen(function* () {
            return yield* CdpConnection;
          }).pipe(Effect.provide(testLayers({ connectTimeoutMs: 5_000 }))),
        ),
      );

      assert.isTrue(Exit.isFailure(exit));
      const tags = errorTags(exit);
      assert.isTrue(
        tags.includes("effect-libs/browser/CdpConnectionError"),
        `Expected CdpConnectionError, got ${tags.join(", ")}`,
      );
    } finally {
      restore();
    }
  });

  it("registers listeners with { once: true } for auto-cleanup on fire", async () => {
    const { ws, restore } = patchWebSocket();
    try {
      setTimeout(() => ws.simulateOpen(), 10);

      await Effect.runPromise(
        Effect.gen(function* () {
          return yield* CdpConnection;
        }).pipe(Effect.provide(testLayers())),
      );

      // waitForConnection uses addEventListener with { once: true } so
      // listeners auto-remove after firing — no manual cleanup needed
      // on the happy path. The Effect.callback return cleanup only runs
      // on interrupt.
      const openListeners = ws.added.filter((r) => r.type === "open");
      assert.isTrue(
        openListeners.length >= 1,
        `Expected open listener registration, got ${openListeners.length}`,
      );
      // Verify { once: true } was passed
      const hasOnce = openListeners.some((l) => l.once === true);
      assert.isTrue(hasOnce, "Expected { once: true } on open listener");
    } finally {
      restore();
    }
  });

  it("cleans up event listeners on fiber interrupt", async () => {
    const { ws, restore } = patchWebSocket();
    try {
      const fiber = Effect.runFork(
        Effect.gen(function* () {
          return yield* CdpConnection;
        }).pipe(Effect.provide(testLayers({ connectTimeoutMs: 30_000 }))),
      );

      // Wait for Effect.callback to register its listeners
      await new Promise((r) => setTimeout(r, 100));

      await Effect.runPromise(Fiber.interrupt(fiber));

      const openOrErrorRemoved = ws.removed.filter((r) => r.type === "open" || r.type === "error");
      assert.isTrue(
        openOrErrorRemoved.length >= 1,
        `Expected listener cleanup on interrupt, got ${openOrErrorRemoved.length} removals`,
      );
    } finally {
      restore();
    }
  });
});

describe("CdpConnection - command handling", () => {
  it("sends command and receives response", async () => {
    const { ws, restore } = patchWebSocket();
    try {
      setTimeout(() => ws.simulateOpen(), 10);

      const program = Effect.gen(function* () {
        const conn = yield* CdpConnection;

        setTimeout(() => {
          ws.simulateMessage({ id: 0, result: { protocolVersion: "1.3" } });
        }, 50);

        return yield* conn.getProtocolVersion();
      }).pipe(Effect.provide(testLayers()));

      const version = await Effect.runPromise(program);
      assert.strictEqual(version, "1.3");
    } finally {
      restore();
    }
  });

  it("returns CdpTimeoutError when command times out", async () => {
    const { ws, restore } = patchWebSocket();
    try {
      setTimeout(() => ws.simulateOpen(), 10);

      const program = Effect.gen(function* () {
        const conn = yield* CdpConnection;
        // Never respond
        return yield* Effect.exit(conn.getProtocolVersion());
      }).pipe(Effect.provide(testLayers({ connectTimeoutMs: 2_000, commandTimeoutMs: 100 })));

      const exit = await Effect.runPromise(program);
      assert.isTrue(Exit.isFailure(exit));
      const tags = errorTags(exit);
      assert.isTrue(
        tags.includes("effect-libs/browser/CdpTimeoutError"),
        `Expected CdpTimeoutError, got ${tags.join(", ")}`,
      );
    } finally {
      restore();
    }
  });

  it("returns CdpCommandError when CDP responds with error", async () => {
    const { ws, restore } = patchWebSocket();
    try {
      setTimeout(() => ws.simulateOpen(), 10);

      const program = Effect.gen(function* () {
        const conn = yield* CdpConnection;

        setTimeout(() => {
          ws.simulateMessage({
            id: 0,
            error: { code: -32000, message: "Not found" },
          });
        }, 50);

        return yield* Effect.exit(conn.getProtocolVersion());
      }).pipe(Effect.provide(testLayers()));

      const exit = await Effect.runPromise(program);
      assert.isTrue(Exit.isFailure(exit));
      const tags = errorTags(exit);
      assert.isTrue(
        tags.includes("effect-libs/browser/CdpCommandError"),
        `Expected CdpCommandError, got ${tags.join(", ")}`,
      );
    } finally {
      restore();
    }
  });

  it("dispatches events to events stream", async () => {
    const { ws, restore } = patchWebSocket();
    try {
      setTimeout(() => ws.simulateOpen(), 10);

      const program = Effect.gen(function* () {
        const conn = yield* CdpConnection;

        // Use a Queue to collect events from the stream
        const queue = yield* Queue.bounded<Record<string, unknown>>(10);

        // Fork stream consumer that pipes events into the queue
        const fiber = yield* Effect.forkScoped(
          conn.events.pipe(
            Stream.tap((msg) => Queue.offer(queue, msg as Record<string, unknown>)),
            Stream.runDrain,
          ),
        );

        // Wait for the stream subscription to be established
        yield* Effect.sleep(10);

        // Simulate an event message (no id)
        ws.simulateMessage({
          method: "Network.requestWillBeSent",
          params: { requestId: "req-1" },
        });

        // Give the async publish fiber time to run
        yield* Effect.sleep(100);

        // Collect what we received
        const events = yield* Queue.takeAll(queue);
        yield* Fiber.interrupt(fiber);
        return events;
      }).pipe(Effect.scoped, Effect.provide(testLayers()));

      const messages = await Effect.runPromise(program);
      assert.isArray(messages);
      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0].method, "Network.requestWillBeSent");
    } finally {
      restore();
    }
  });

  it("fails pending commands when WebSocket closes unexpectedly", async () => {
    const { ws, restore } = patchWebSocket();
    try {
      setTimeout(() => ws.simulateOpen(), 10);

      const program = Effect.gen(function* () {
        const conn = yield* CdpConnection;

        // Close after connection is established
        setTimeout(() => {
          ws.simulateClose(1006);
        }, 100);

        // Send command — will be pending when close fires
        return yield* Effect.exit(conn.getProtocolVersion());
      }).pipe(Effect.provide(testLayers({ connectTimeoutMs: 2_000, commandTimeoutMs: 5_000 })));

      const exit = await Effect.runPromise(program);
      assert.isTrue(Exit.isFailure(exit));
      const tags = errorTags(exit);
      const hasExpected =
        tags.includes("effect-libs/browser/CdpConnectionError") ||
        tags.includes("effect-libs/browser/CdpTimeoutError");
      assert.isTrue(
        hasExpected,
        `Expected CdpConnectionError or CdpTimeoutError, got ${tags.join(", ")}`,
      );
    } finally {
      restore();
    }
  });
});

// ── Event Race Condition Tests ─────────────────────────────────────────────────
//
// These tests verify the "subscribe before async" rule documented in
// docs/contributing/cdp/navigation-concurrency.md.
//
// PubSub.dropping only delivers events to current subscribers.
// If an event is published between an async command and a forkChild(stream),
// the event is lost. This is the root cause of the WaitForNetworkIdle bug.

describe("CdpConnection - event race conditions", () => {
  it("event published BEFORE stream subscription is lost", async () => {
    // This test demonstrates the bug pattern: if an event arrives before
    // the stream consumer subscribes, PubSub.dropping silently drops it.
    const { ws, restore } = patchWebSocket();
    try {
      setTimeout(() => ws.simulateOpen(), 10);

      const program = Effect.gen(function* () {
        const conn = yield* CdpConnection;

        // Wait for connection to be fully established
        yield* Effect.sleep(50);

        // Publish an event BEFORE subscribing to the stream
        ws.simulateMessage({
          method: "Page.frameNavigated",
          params: { frame: { id: "main" } },
        });

        // Delay to ensure the event is processed into the PubSub
        yield* Effect.sleep(50);

        // Now subscribe — the event is already gone
        // Use take(1) with a timeout so we don't hang if the event is lost
        const result = yield* conn.events.pipe(
          Stream.filter((e) => e.method === "Page.frameNavigated"),
          Stream.take(1),
          Stream.runDrain,
          Effect.timeout(300),
          Effect.exit,
        );

        // If the event was received, Exit succeeds; if lost (timeout), Exit fails
        return result;
      }).pipe(Effect.provide(testLayers()));

      const result = await Effect.runPromise(program);
      // The event was published before the subscription existed,
      // so PubSub.dropping silently dropped it — timeout fires.
      assert.isTrue(Exit.isFailure(result));
    } finally {
      restore();
    }
  });

  it("event published AFTER stream subscription is received", async () => {
    // This test verifies the correct pattern: fork the stream consumer first,
    // then trigger the event.
    const { ws, restore } = patchWebSocket();
    try {
      setTimeout(() => ws.simulateOpen(), 10);

      const program = Effect.gen(function* () {
        const conn = yield* CdpConnection;

        // Fork the stream consumer FIRST
        const queue = yield* Queue.bounded<string>(10);
        const fiber = yield* Effect.forkScoped(
          conn.events.pipe(
            Stream.filter((e) => e.method === "Page.frameNavigated"),
            Stream.tap((msg) => Queue.offer(queue, msg.method!)),
            Stream.take(1),
            Stream.runDrain,
          ),
        );

        // Let the stream subscription establish
        yield* Effect.sleep(10);

        // NOW publish the event
        ws.simulateMessage({
          method: "Page.frameNavigated",
          params: { frame: { id: "main" } },
        });

        yield* Effect.sleep(100);
        const events = yield* Queue.takeAll(queue);
        yield* Fiber.interrupt(fiber);
        return events;
      }).pipe(Effect.scoped, Effect.provide(testLayers()));

      const messages = await Effect.runPromise(program);
      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0], "Page.frameNavigated");
    } finally {
      restore();
    }
  });

  it("async command between fork and event does not lose events", async () => {
    // This test verifies the pattern used in waitForNavigationPage:
    // 1. Fork stream consumer
    // 2. Run async command (e.g., Network.enable)
    // 3. Events from a separate trigger are received
    const { ws, restore } = patchWebSocket();
    try {
      setTimeout(() => ws.simulateOpen(), 10);

      const program = Effect.gen(function* () {
        const conn = yield* CdpConnection;

        // Fork the stream consumer FIRST
        const queue = yield* Queue.bounded<string>(10);
        const fiber = yield* Effect.forkScoped(
          conn.events.pipe(
            Stream.filter((e) => e.method === "Page.frameNavigated"),
            Stream.tap((msg) => Queue.offer(queue, msg.method!)),
            Stream.take(1),
            Stream.runDrain,
          ),
        );

        // Let the stream subscription establish
        yield* Effect.sleep(10);

        // Simulate the "async command then event" pattern:
        // The async command (e.g., Network.enable) gets a response...
        ws.simulateMessage({ id: 0, result: {} });
        // ...and the event arrives right after (e.g., from Page.navigate)
        ws.simulateMessage({
          method: "Page.frameNavigated",
          params: { frame: { id: "main" } },
        });

        yield* Effect.sleep(200);
        const events = yield* Queue.takeAll(queue);
        yield* Fiber.interrupt(fiber);
        return events;
      }).pipe(Effect.scoped, Effect.provide(testLayers()));

      const messages = await Effect.runPromise(program);
      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0], "Page.frameNavigated");
    } finally {
      restore();
    }
  });
});
