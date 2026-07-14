/**
 * WebSocket polyfill for Cloudflare Workers.
 *
 * ## Problem
 *
 * Stagehand v3 imports the Node.js `ws` package internally to talk to CDP
 * endpoints (`import WebSocket from "ws"`). The `ws` package is **not**
 * Workers-compatible — it relies on Node.js `net` and `tls` modules and
 * spawns threads. When Stagehand runs on Cloudflare Workers, the bundler
 * resolves `import "ws"` to the npm `ws` package, which fails to load.
 *
 * ## Solution
 *
 * This module re-exports a Workers-compatible class that implements the
 * small slice of the `ws` API that Stagehand uses (`on`, `once`, `off`,
 * `send`, `close`, `readyState`) on top of the standard `globalThis.WebSocket`
 * that Workers provides natively.
 *
 * Wire it up with a wrangler alias so Stagehand's `import WebSocket from "ws"`
 * resolves to this implementation instead of the npm `ws` package:
 *
 * ```jsonc
 * // wrangler.jsonc
 * {
 *   "alias": {
 *     "ws": "@effect-libs/browser-stagehand/ws"
 *   }
 * }
 * ```
 *
 * The `wrangler.jsonc` alias is the only integration step — there is no
 * Vite, Next.js, or esbuild equivalent because this polyfill targets
 * Workers specifically. Non-Worker runtimes (Node.js, Deno, Bun) should
 * use the upstream `@browserbasehq/stagehand` package, which already
 * resolves `ws` correctly.
 *
 * ## Limitations
 *
 * - **No custom headers.** Workers' native WebSocket constructor does not
 *   accept a `headers` option. CDP endpoints that require header-based
 *   authentication (e.g. `Authorization: Bearer …`) **will not work** on
 *   Workers through this polyfill. CDP endpoints typically accept auth
 *   via URL query parameters (`?apiKey=…` or `?token=…`) instead, and
 *   those work fine. If your CDP endpoint requires header-based auth,
 *   use `browser-cdp` directly via a Node.js / Bun runtime, or proxy
 *   the endpoint through a custom Worker that injects the header at the
 *   TCP layer.
 *
 * - **Text frames only.** This polyfill assumes CDP messages are JSON
 *   strings. CDP protocol uses JSON, so binary frames are not needed.
 *   `Buffer` / `ArrayBuffer` / `ArrayBufferView` arguments to `send()`
 *   are decoded to UTF-8 strings before transmission.
 *
 * - **`readyState` is best-effort.** The polyfill mirrors `ws`'s numeric
 *   constants (`0` CONNECTING, `1` OPEN, `2` CLOSING, `3` CLOSED) but
 *   reads them off the underlying `globalThis.WebSocket`. There is a small
 *   window before the first event fires where `readyState` may be stale.
 *
 * ## Upstream
 *
 * The upstream `ws` package and `@browserbasehq/stagehand` are aware of the
 * Workers incompatibility — they recommend platform-specific shims for
 * edge runtimes. This polyfill is the smallest such shim that satisfies
 * Stagehand v3.
 */

import { Predicate } from "effect";

/**
 * Node.js-style WebSocket wrapper for Cloudflare Workers.
 *
 * Implements the `ws` package API using the standard WebSocket API.
 */
export default class WebSocketPolyfill {
  private _ws: globalThis.WebSocket;
  private _listeners: Map<string, Set<(event: unknown) => void>> = new Map();
  private _onceListeners: Map<string, Set<(event: unknown) => void>> = new Map();
  private _readyState: number = 0; // CONNECTING

  /**
   * Current state of the WebSocket connection.
   * 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
   */
  get readyState(): number {
    return this._ws?.readyState ?? this._readyState;
  }

  /**
   * Create a new WebSocket connection.
   *
   * @param url - WebSocket URL to connect to
   * @param options - Optional configuration (headers not supported in Workers)
   */
  constructor(url: string, options?: { headers?: Record<string, string> }) {
    // Workers WebSocket doesn't support custom headers
    // CDP endpoints typically use URL params for auth
    // oxlint-disable-next-line effect/prefer-arr-match — warning check, Arr.match would be more verbose
    if (options?.headers && Object.keys(options.headers).length > 0) {
      console.warn(
        "[WebSocketPolyfill] Custom headers are not supported in Cloudflare Workers. " +
          "Use URL parameters for authentication instead.",
      );
    }

    this._ws = new globalThis.WebSocket(url);

    // Wire up standard WebSocket events to Node.js-style callbacks
    this._ws.addEventListener("open", () => {
      this._readyState = 1; // OPEN
      this._emit("open", undefined);
    });

    this._ws.addEventListener("message", (event: MessageEvent) => {
      // CDP messages are always JSON strings
      const data = event.data as string;
      this._emit("message", data);
    });

    this._ws.addEventListener("close", (event: CloseEvent) => {
      this._readyState = 3; // CLOSED
      this._emit("close", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    });

    this._ws.addEventListener("error", () => {
      this._emit("error", new Error("WebSocket error"));
    });
  }

  /**
   * Register an event listener.
   *
   * @param event - Event name ("open", "message", "close", "error")
   * @param handler - Callback function
   */
  on(event: string, handler: (data: unknown) => void): void {
    let listeners = this._listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this._listeners.set(event, listeners);
    }
    listeners.add(handler);
  }

  /**
   * Register a one-time event listener.
   *
   * @param event - Event name ("open", "message", "close", "error")
   * @param handler - Callback function (called once, then removed)
   */
  once(event: string, handler: (data: unknown) => void): void {
    let onceListeners = this._onceListeners.get(event);
    if (!onceListeners) {
      onceListeners = new Set();
      this._onceListeners.set(event, onceListeners);
    }
    onceListeners.add(handler);
  }

  /**
   * Remove an event listener.
   *
   * @param event - Event name ("open", "message", "close", "error")
   * @param handler - Callback function to remove
   */
  off(event: string, handler: (data: unknown) => void): void {
    this._listeners.get(event)?.delete(handler);
    this._onceListeners.get(event)?.delete(handler);
  }

  /**
   * Send data over the WebSocket connection.
   *
   * @param data - Data to send (string for CDP JSON messages)
   */
  send(data: string | Buffer | ArrayBuffer | ArrayBufferView): void {
    if (Predicate.isString(data)) {
      this._ws.send(data);
    } else if (ArrayBuffer.isView(data)) {
      // Handle TypedArrays (Uint8Array, etc.)
      const decoder = new TextDecoder();
      this._ws.send(decoder.decode(data));
    } else if (data instanceof ArrayBuffer) {
      // Handle raw ArrayBuffer
      const decoder = new TextDecoder();
      this._ws.send(decoder.decode(data));
    } else {
      this._ws.send(String(data));
    }
  }

  /**
   * Close the WebSocket connection.
   *
   * @param code - Optional close code (default: 1000)
   * @param reason - Optional close reason
   */
  close(code?: number, reason?: string): void {
    this._readyState = 2; // CLOSING
    this._ws.close(code ?? 1000, reason ?? "");
  }

  /**
   * Emit an event to all registered listeners.
   */
  private _emit(event: string, data: unknown): void {
    // Call regular listeners
    for (const handler of this._listeners.get(event) ?? []) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[WebSocketPolyfill] Error in "${event}" handler:`, err);
      }
    }

    // Call one-time listeners and remove them
    const onceHandlers = this._onceListeners.get(event);
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[WebSocketPolyfill] Error in "${event}" once handler:`, err);
        }
      }
      onceHandlers.clear();
    }
  }

  /**
   * Add event listener (addEventListener style - for compatibility).
   */
  addEventListener(event: string, handler: (data: unknown) => void): void {
    this.on(event, handler);
  }

  /**
   * Remove event listener (addEventListener style - for compatibility).
   */
  removeEventListener(event: string, handler: (data: unknown) => void): void {
    this.off(event, handler);
  }
}

// Also export as named export for flexibility
export { WebSocketPolyfill as WebSocket };

// Re-export WebSocket class as default matches `ws` package API
// Stagehand does: import WebSocket from "ws"
