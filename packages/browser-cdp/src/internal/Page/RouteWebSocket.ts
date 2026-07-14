/**
 * WebSocket route interception for CDP pages.
 *
 * Provides Playwright-compatible WebSocket interception. When a route is
 * registered, an init script replaces `globalThis.WebSocket` with a
 * `WebSocketMock` class on every new document. The mock dispatches events
 * back to Node via a CDP binding (`__pwWebSocketBinding`) and exposes a
 * `globalThis.__pwWebSocketDispatch` function for Node to call.
 *
 * Architecture (adapted from Playwright's `webSocketMock.ts` +
 * `webSocketRouteDispatcher.ts`):
 *
 *   1. **Page-side mock** — an init script that:
 *      - Stores the native `WebSocket` constructor
 *      - Replaces `globalThis.WebSocket` with a `WebSocketMock` class
 *      - On `new WebSocket(url)`, the mock sends a binding call
 *        `{type: 'onCreate', id, url}` to the Node side and waits for
 *        instructions (`connect` to a real server, or `ensureOpened` to
 *        pretend the server is there)
 *      - On `send()`, dispatches `{type: 'onMessageFromPage', id, data}`
 *      - On `close()`, dispatches `{type: 'onClosePage', id, ...}`
 *      - On messages from the real server, dispatches
 *        `{type: 'onMessageFromServer', id, data}`
 *      - On real server close, dispatches `{type: 'onCloseServer', id, ...}`
 *
 *   2. **Node-side dispatch** — a route manager that:
 *      - Maintains a list of registered handlers (last-registered-first)
 *      - On first registration: installs the binding (`Runtime.addBinding`)
 *        and adds the init script via `Page.addScriptToEvaluateOnNewDocument`
 *      - On `Runtime.bindingCalled` events with our binding name, looks
 *        up the WebSocket by id and dispatches to the matching handler
 *      - When a handler calls `connectToServer()`, opens a real WebSocket
 *        from Node to the server URL and bridges messages
 *
 *   3. **API surface** — mirrors Playwright's `WebSocketRoute`:
 *      - `url` — the URL the page tried to open
 *      - `connectToServer()` — establish a connection to the real server
 *      - `send(message)` — send a message to the page (from "server")
 *      - `close({code, reason})` — close the page-side socket
 *      - `onPageMessage(handler)` / `onPageClose(handler)` /
 *        `onServerMessage(handler)` / `onServerClose(handler)` — set
 *        handlers for the respective events
 *
 *   4. **Auto-forwarding** — when `connectToServer()` is called, both
 *      directions are auto-forwarded UNLESS the user sets a handler on
 *      that side. This matches Playwright's semantics.
 *
 */

import type { Scope } from "effect";

import type { CdpError } from "../../CdpError.js";
import type { CdpConnection } from "../CdpConnection.js";
import type { PageState } from "./PageState.js";

import { Effect, Match, Predicate, Ref } from "effect";

import {
  CdpError as CdpErrorClass,
  CommandError,
  EvaluationError,
  isCdpError,
} from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { type RouteUrlMatch, urlMatches, urlMatchesEqual } from "./UrlMatch.js";

// ── Public Types ──────────────────────────────────────────────────────────────

/** Re-export the shared URL match pattern. */
export type { RouteUrlMatch };

/**
 * Handler for messages flowing in either direction.
 *
 * - `string` for text messages
 * - `Uint8Array` for binary messages
 */
export type CdpWebSocketMessageHandler = (message: string | Uint8Array) => void;

/**
 * Handler for socket close events in either direction.
 */
export type CdpWebSocketCloseHandler = (
  code: number | undefined,
  reason: string | undefined,
) => void;

/**
 * Handle for a routed WebSocket — given to the route handler.
 *
 * Mirrors Playwright's `WebSocketRoute`:
 *
 * - `url` — the URL the page tried to open
 * - `connectToServer()` — start a real connection to the server. Returns
 *   a "server" route you can use to send messages or set handlers.
 * - `send(message)` — send a message to the page (from "server")
 * - `close({code, reason})` — close the page-side socket
 * - `onPageMessage(handler)` — set handler for messages from the page
 * - `onPageClose(handler)` — set handler for the page closing the socket
 * - `onServerMessage(handler)` — set handler for messages from the server
 * - `onServerClose(handler)` — set handler for the server closing the socket
 *
 * Auto-forwarding:
 *
 * - After `connectToServer()` is called, messages are forwarded in both
 *   directions by default.
 * - Setting `onPageMessage()` stops forwarding of page→server messages.
 * - Setting `onServerMessage()` stops forwarding of server→page messages.
 */
export interface CdpWebSocketRoute {
  /** The URL the page tried to open. */
  readonly url: string;

  /**
   * Establish a real connection to the server. Returns a server-side
   * route that lets you send messages and set handlers.
   *
   * Can only be called once. Throws if the WebSocket is already
   * connected to the server.
   */
  connectToServer(): CdpWebSocketServerRoute;

  /**
   * Send a message to the page (as if from the server).
   */
  send(message: string | Uint8Array): Effect.Effect<void, CdpError>;

  /**
   * Close the page-side WebSocket.
   */
  close(options?: {
    readonly code?: number;
    readonly reason?: string;
  }): Effect.Effect<void, CdpError>;

  /**
   * Set a handler for messages from the page to the server.
   * Stops automatic forwarding of page→server messages.
   */
  onPageMessage(handler: CdpWebSocketMessageHandler): void;

  /**
   * Set a handler for the page closing the WebSocket.
   * Stops automatic forwarding of close events to the server.
   */
  onPageClose(handler: CdpWebSocketCloseHandler): void;

  /**
   * Set a handler for messages from the server to the page.
   * Stops automatic forwarding of server→page messages.
   */
  onServerMessage(handler: CdpWebSocketMessageHandler): void;

  /**
   * Set a handler for the server closing the WebSocket.
   * Stops automatic forwarding of close events to the page.
   */
  onServerClose(handler: CdpWebSocketCloseHandler): void;
}

/**
 * Server-side route — only available after `connectToServer()` is called.
 *
 * Mirrors Playwright's "server" WebSocketRoute. The server-side route
 * only has `send`, `onMessage`, and `onClose` — you can't call
 * `connectToServer()` on it (you'd recurse forever).
 */
export interface CdpWebSocketServerRoute {
  /** Send a message to the server. */
  send(message: string | Uint8Array): Effect.Effect<void, CdpError>;
  /** Set a handler for messages from the server. */
  onMessage(handler: CdpWebSocketMessageHandler): void;
  /** Set a handler for the server closing the WebSocket. */
  onClose(handler: CdpWebSocketCloseHandler): void;
}

/**
 * Callback for a WebSocket route.
 *
 * Receives a `CdpWebSocketRoute`. The handler may call `connectToServer()`
 * to forward to the real server, or just `send` / `onPageMessage` to
 * mock the server entirely.
 */
export type CdpWebSocketRouteHandlerCallback = (
  ws: CdpWebSocketRoute,
) => Effect.Effect<void, any, never> | void;

// ── Internal Constants ────────────────────────────────────────────────────────

/**
 * The CDP binding name for WebSocket mock events.
 *
 * Installed via `Runtime.addBinding({name})` on first route registration.
 * Page-side `WebSocketMock` calls `globalThis[WS_BINDING_NAME](payload)`
 * to send events back to Node.
 */
export const WS_BINDING_NAME = "__pwWebSocketBinding__";

/**
 * The global function name the page exposes for Node to call.
 *
 * Set up by the init script. Node calls this via `Runtime.evaluate` to
 * control individual WebSocket mocks (connect, send, close, etc.).
 */
export const WS_DISPATCH_NAME = "__pwWebSocketDispatch";

// ── Page-side Init Script ─────────────────────────────────────────────────────

/**
 * Source of the init script that installs the WebSocket mock on the page.
 *
 * Adapted from Playwright's `webSocketMock.ts`. Replaces
 * `globalThis.WebSocket` with a `WebSocketMock` class. The mock:
 *
 * 1. Generates a unique id per instance
 * 2. Notifies Node via the binding on `new WebSocket(url)`
 * 3. Sends to Node on `send()`, `close()`
 * 4. Forwards real server events to Node when connected
 * 5. Provides a `__pwWebSocketDispatch` function Node calls to control it
 *
 * The original `WebSocket` is saved as `__pwNativeWebSocket` so the mock
 * can still talk to real servers.
 */
const buildWebSocketMockSource = (): string => {
  return `(() => {
  if (globalThis.__pwWebSocketMockInstalled) return;
  globalThis.__pwWebSocketMockInstalled = true;

  var BINDING_NAME = ${JSON.stringify(WS_BINDING_NAME)};
  var DISPATCH_NAME = ${JSON.stringify(WS_DISPATCH_NAME)};
  var NativeWebSocket = globalThis.WebSocket;
  globalThis.__pwNativeWebSocket = NativeWebSocket;

  function generateId() {
    var bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    var hex = '0123456789abcdef';
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var v = bytes[i];
      out += hex[(v >> 4) & 0xf] + hex[v & 0xf];
    }
    return out;
  }

  function bufferToData(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return { data: globalThis.btoa(s), isBase64: true };
  }

  function stringToBuffer(s) {
    s = globalThis.atob(s);
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b.buffer;
  }

  function messageToData(message, cb) {
    if (message instanceof globalThis.Blob) {
      message.arrayBuffer().then(function(buf) {
        cb(bufferToData(new Uint8Array(buf)));
      });
      return;
    }
    if (typeof message === 'string') {
      cb({ data: message, isBase64: false });
      return;
    }
    if (ArrayBuffer.isView(message)) {
      cb(bufferToData(new Uint8Array(message.buffer, message.byteOffset, message.byteLength)));
      return;
    }
    cb(bufferToData(new Uint8Array(message)));
  }

  function dataToMessage(data, binaryType) {
    if (!data.isBase64) return data.data;
    var buffer = stringToBuffer(data.data);
    return binaryType === 'arraybuffer' ? buffer : new Blob([buffer]);
  }

  var binding = function(payload) {
    globalThis[BINDING_NAME](JSON.stringify(payload));
  };

  var idToWebSocket = new Map();
  globalThis[DISPATCH_NAME] = function(request) {
    var ws = idToWebSocket.get(request.id);
    if (request.type === 'connect') ws._apiConnect();
    if (request.type === 'passthrough') ws._apiPassThrough();
    if (request.type === 'ensureOpened') ws._apiEnsureOpened();
    if (request.type === 'sendToPage') ws._apiSendToPage(dataToMessage(request.data, ws.binaryType));
    if (request.type === 'sendToServer') ws._apiSendToServer(dataToMessage(request.data, ws.binaryType));
    if (request.type === 'closePage') ws._apiClosePage(request.code, request.reason, request.wasClean);
    if (request.type === 'closeServer') ws._apiCloseServer(request.code, request.reason, request.wasClean);
  };

  // ES6 class-based mock. The previous prototype-based version
  // (function WebSocketMock + Object.create(EventTarget.prototype)) caused
  // "TypeError: Illegal invocation" on the new operator because Chrome's
  // V8 treats functions vs classes differently for the [[Construct]] slot.
  // ES6 class syntax is the safer pattern.
  class WebSocketMock extends EventTarget {
    constructor(url, protocols) {
      super();
      this.CONNECTING = 0;
      this.OPEN = 1;
      this.CLOSING = 2;
      this.CLOSED = 3;
      this.bufferedAmount = 0;
      this.extensions = '';
      this.protocol = '';
      this.readyState = 0;
      this.binaryType = 'blob';
      this._oncloseListener = null;
      this._onerrorListener = null;
      this._onmessageListener = null;
      this._onopenListener = null;
      this.url = new URL(url, globalThis.window ? globalThis.window.document.baseURI : undefined).href.replace(/^http/, 'ws');
      this._origin = URL.parse(this.url)?.origin ?? '';
      this._protocols = protocols;
      this._id = generateId();
      this._ws = undefined;
      this._passthrough = false;
      this._wsBufferedMessages = [];
      idToWebSocket.set(this._id, this);
      binding({ type: 'onCreate', id: this._id, url: this.url });
    }

    get onclose() { return this._oncloseListener; }
    set onclose(listener) {
      if (this._oncloseListener) this.removeEventListener('close', this._oncloseListener);
      this._oncloseListener = listener;
      if (this._oncloseListener) this.addEventListener('close', this._oncloseListener);
    }
    get onerror() { return this._onerrorListener; }
    set onerror(listener) {
      if (this._onerrorListener) this.removeEventListener('error', this._onerrorListener);
      this._onerrorListener = listener;
      if (this._onerrorListener) this.addEventListener('error', this._onerrorListener);
    }
    get onopen() { return this._onopenListener; }
    set onopen(listener) {
      if (this._onopenListener) this.removeEventListener('open', this._onopenListener);
      this._onopenListener = listener;
      if (this._onopenListener) this.addEventListener('open', this._onopenListener);
    }
    get onmessage() { return this._onmessageListener; }
    set onmessage(listener) {
      if (this._onmessageListener) this.removeEventListener('message', this._onmessageListener);
      this._onmessageListener = listener;
      if (this._onmessageListener) this.addEventListener('message', this._onmessageListener);
    }

    send(message) {
      if (this.readyState === this.CONNECTING)
        throw new DOMException("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.");
      if (this.readyState !== this.OPEN)
        throw new DOMException("WebSocket is already in CLOSING or CLOSED state.");
      if (this._passthrough) {
        if (this._ws) this._apiSendToServer(message);
      } else {
        const _this = this;
        messageToData(message, function(data) {
          binding({ type: 'onMessageFromPage', id: _this._id, data: data });
        });
      }
    }

    close(code, reason) {
      if (code !== undefined && code !== 1000 && (code < 3000 || code > 4999))
        throw new DOMException("Failed to execute 'close' on 'WebSocket': The close code must be either 1000, or between 3000 and 4999. " + code + " is neither.");
      if (this.readyState === this.OPEN || this.readyState === this.CONNECTING)
        this.readyState = this.CLOSING;
      if (this._passthrough) this._apiCloseServer(code, reason, true);
      else binding({ type: 'onClosePage', id: this._id, code: code, reason: reason, wasClean: true });
    }

    _apiEnsureOpened() {
      if (!this._ws) this._ensureOpened();
    }

    _apiSendToPage(message) {
      this._ensureOpened();
      if (this.readyState !== this.OPEN)
        throw new DOMException("WebSocket is already in CLOSING or CLOSED state.");
      this.dispatchEvent(new MessageEvent('message', { data: message, origin: this._origin, cancelable: true }));
    }

    _apiSendToServer(message) {
      if (!this._ws) throw new Error('Cannot send a message before connecting to the server');
      if (this._ws.readyState === this.CONNECTING) this._wsBufferedMessages.push(message);
      else this._ws.send(message);
    }

    _apiConnect() {
      if (this._ws) throw new Error('Can only connect to the server once');
      this._ws = new NativeWebSocket(this.url, this._protocols);
      this._ws.binaryType = this.binaryType;
      const _this = this;
      this._ws.onopen = function() {
        for (let i = 0; i < _this._wsBufferedMessages.length; i++) _this._ws.send(_this._wsBufferedMessages[i]);
        _this._wsBufferedMessages = [];
        _this._ensureOpened();
      };
      this._ws.onclose = function(event) {
        _this._onWSClose(event.code, event.reason, event.wasClean);
      };
      this._ws.onmessage = function(event) {
        if (_this._passthrough) {
          _this._apiSendToPage(event.data);
        } else {
          messageToData(event.data, function(data) {
            binding({ type: 'onMessageFromServer', id: _this._id, data: data });
          });
        }
      };
      this._ws.onerror = function() {
        const event = new Event('error', { cancelable: true });
        _this.dispatchEvent(event);
      };
    }

    _apiPassThrough() {
      this._passthrough = true;
      this._apiConnect();
    }

    _apiCloseServer(code, reason, wasClean) {
      if (!this._ws) { this._onWSClose(code, reason, wasClean); return; }
      if (this._ws.readyState === this.CONNECTING || this._ws.readyState === this.OPEN)
        this._ws.close(code, reason);
    }

    _apiClosePage(code, reason, wasClean) {
      if (this.readyState === this.CLOSED) return;
      this.readyState = this.CLOSED;
      this.dispatchEvent(new CloseEvent('close', { code: code, reason: reason, wasClean: wasClean, cancelable: true }));
      this._maybeCleanup();
      if (this._passthrough) this._apiCloseServer(code, reason, wasClean);
      else binding({ type: 'onClosePage', id: this._id, code: code, reason: reason, wasClean: wasClean });
    }

    _ensureOpened() {
      if (this.readyState !== this.CONNECTING) return;
      this.extensions = (this._ws && this._ws.extensions) || '';
      if (this._ws) this.protocol = this._ws.protocol;
      else if (Array.isArray(this._protocols)) this.protocol = this._protocols[0] || '';
      else this.protocol = this._protocols || '';
      this.readyState = this.OPEN;
      this.dispatchEvent(new Event('open', { cancelable: true }));
    }

    _onWSClose(code, reason, wasClean) {
      if (this._passthrough) {
        this._apiClosePage(code, reason, wasClean);
      } else {
        binding({ type: 'onCloseServer', id: this._id, code: code, reason: reason, wasClean: wasClean });
      }
      if (this._ws) {
        this._ws.onopen = null;
        this._ws.onclose = null;
        this._ws.onmessage = null;
        this._ws.onerror = null;
        this._ws = undefined;
        this._wsBufferedMessages = [];
      }
      this._maybeCleanup();
    }

    _maybeCleanup() {
      if (this.readyState === this.CLOSED && !this._ws) idToWebSocket.delete(this._id);
    }
  }

  // Replace globalThis.WebSocket with our mock
  globalThis.WebSocket = WebSocketMock;
})();`;
};

// ── Route Manager ─────────────────────────────────────────────────────────────

interface RegisteredRouteWebSocket {
  url: RouteUrlMatch;
  handler: CdpWebSocketRouteHandlerCallback;
}

/**
 * Internal state of a single routed WebSocket on the Node side.
 *
 * Tracks the live mock state, user-set handlers, and the real-server
 * connection (if `connectToServer()` was called).
 */
export interface WebSocketRouteState {
  /** Unique id of the WebSocket mock on the page side. */
  readonly id: string;
  /** The URL the page tried to open. */
  readonly url: string;
  /** User's CdpWebSocketRoute handle (set when handler is called). */
  route: CdpWebSocketRoute | null;
  /** True if `connectToServer()` was called. */
  connected: boolean;
  /** True if `closePage` was sent — prevents further operations. */
  closed: boolean;
  // User-set handlers
  onPageMessage: CdpWebSocketMessageHandler | null;
  onPageClose: CdpWebSocketCloseHandler | null;
  onServerMessage: CdpWebSocketMessageHandler | null;
  onServerClose: CdpWebSocketCloseHandler | null;
  // Server-side handlers (set via connectToServer().onMessage/onClose)
  onServerMessageFromServer: CdpWebSocketMessageHandler | null;
  onServerCloseFromServer: CdpWebSocketCloseHandler | null;
}

export interface RouteWebSocketManager {
  readonly routeWebSocket: (
    url: RouteUrlMatch,
    handler: CdpWebSocketRouteHandlerCallback,
  ) => Effect.Effect<void, CdpError>;
  readonly unrouteWebSocket: (
    url: RouteUrlMatch,
    handler?: CdpWebSocketRouteHandlerCallback,
  ) => Effect.Effect<void, CdpError>;
  readonly unrouteAllWebSocket: () => Effect.Effect<void, CdpError>;
  /**
   * Dispatch a `Runtime.bindingCalled` event for our WebSocket binding.
   * Called from the CdpPage event stream.
   */
  readonly dispatch: (
    executionContextId: number,
    payload: string,
  ) => Effect.Effect<void, never, never>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Encodes a message (string or Uint8Array) into the `{data, isBase64}` wire
 * format used by the binding.
 */
const encodeMessage = (message: string | Uint8Array): { data: string; isBase64: boolean } => {
  if (Predicate.isString(message)) {
    return { data: message, isBase64: false };
  }
  // Binary — base64-encode
  let bytes: Uint8Array;
  if (message instanceof Uint8Array) {
    bytes = message;
  } else {
    const view = message as ArrayBufferView;
    bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return { data: btoa(s), isBase64: true };
};

/**
 * Decodes a `{data, isBase64}` wire payload into either a string or a
 * `Uint8Array`. The user's handler can then choose how to consume it.
 */
const decodeMessage = (data: { data: string; isBase64: boolean }): string | Uint8Array => {
  if (!data.isBase64) return data.data;
  const s = atob(data.data);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    bytes[i] = s.charCodeAt(i);
  }
  return bytes;
};

/**
 * Sends a `__pwWebSocketDispatch` request to the page for a given WebSocket
 * id. Used for `connect`, `passthrough`, `ensureOpened`, `sendToPage`,
 * `sendToServer`, `closePage`, `closeServer`.
 */
const dispatchToPage = (
  conn: CdpConnection["Service"],
  sessionId: string,
  request: Record<string, unknown>,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    yield* conn.cdp.Runtime.evaluate(
      {
        expression: `globalThis[${JSON.stringify(WS_DISPATCH_NAME)}](${JSON.stringify(request)});`,
      },
      sessionId,
    ).pipe(
      Effect.mapError(
        (e) =>
          new CdpErrorClass({
            module: "CdpPage",
            method: "RouteWebSocket",
            reason: new CommandError({ method: "Runtime.evaluate", description: String(e) }),
          }),
      ),
    );
  });

// ── Route WebSocket Manager Factory ───────────────────────────────────────────

/**
 * Creates a `RouteWebSocketManager` for a page.
 *
 * The manager:
 * 1. Maintains a list of registered handlers (last-registered-first)
 * 2. On first registration, installs the `WS_BINDING_NAME` binding and
 *    adds the WebSocket mock init script
 * 3. On `Runtime.bindingCalled` events, dispatches to the matching route
 * 4. Provides `routeWebSocket` / `unrouteWebSocket` / `unrouteAllWebSocket`
 *
 * @param connection - CDP connection service
 * @param state - Mutable page state
 */
export const makeRouteWebSocketManager = (
  connection: CdpConnection["Service"],
  state: PageState,
): Effect.Effect<RouteWebSocketManager, never, Scope.Scope> =>
  Effect.gen(function* () {
    const routes = yield* Ref.make<ReadonlyArray<RegisteredRouteWebSocket>>([]);
    const installed = yield* Ref.make(false);
    // Active WebSockets on this page, keyed by mock id (page side)
    const activeSockets = yield* Ref.make<Map<string, WebSocketRouteState>>(new Map());

    // Install binding + init script. Idempotent.
    const ensureInstalled = Effect.gen(function* () {
      const isInstalled = yield* Ref.get(installed);
      if (isInstalled) return;

      const sessionId = yield* ensureSession(state);

      // Install the CDP binding. We use a separate binding from
      // GLOBAL_BINDING_NAME because the payload format is different
      // (discriminated union of events) and the dispatch is fire-and-forget
      // (no return value).
      yield* connection.cdp.Runtime.addBinding({ name: WS_BINDING_NAME }, sessionId).pipe(
        Effect.ignore,
      );

      const mockSource = buildWebSocketMockSource();
      // Add the init script for future documents.
      yield* connection.cdp.Page.addScriptToEvaluateOnNewDocument(
        { source: mockSource },
        sessionId,
      ).pipe(Effect.ignore);

      // Also evaluate in the current document so the mock is available
      // immediately (e.g. for tests that create a WebSocket right after
      // calling routeWebSocket without navigating).
      yield* connection.cdp.Runtime.evaluate(
        { expression: `(() => { ${mockSource}; })();` },
        sessionId,
      ).pipe(Effect.ignore);

      yield* Ref.set(installed, true);
    });

    // Disposes all active sockets (e.g. on page close / unrouteAll).
    // The page-side mock owns the real WebSocket connections, so
    // there's nothing to close on the Node side.
    const disposeAllActive = Effect.gen(function* () {
      yield* Ref.set(activeSockets, new Map());
    });

    return {
      routeWebSocket: (url: RouteUrlMatch, handler: CdpWebSocketRouteHandlerCallback) =>
        Effect.gen(function* () {
          yield* ensureInstalled;
          // Prepend — last-registered-first (matches `route()` semantics)
          yield* Ref.update(routes, (rs) => [{ url, handler }, ...rs]);
        }),

      unrouteWebSocket: (url: RouteUrlMatch, handler?: CdpWebSocketRouteHandlerCallback) =>
        Effect.gen(function* () {
          yield* Ref.update(routes, (rs) =>
            rs.filter((r) => !(urlMatchesEqual(r.url, url) && (!handler || r.handler === handler))),
          );
        }),

      unrouteAllWebSocket: () =>
        Effect.gen(function* () {
          yield* Ref.set(routes, []);
          yield* disposeAllActive;
        }),

      dispatch: (executionContextId: number, payload: string) =>
        handleWebSocketBindingCall(
          connection,
          state,
          Ref.get(routes),
          Ref.get(activeSockets),
          (update) =>
            Ref.update(activeSockets, (m): Map<string, WebSocketRouteState> => {
              return update(m) as Map<string, WebSocketRouteState>;
            }),
          executionContextId,
          payload,
        ),
    } satisfies RouteWebSocketManager;
  });

// ── Dispatch (called from CdpPage.ts event stream) ────────────────────────────

/**
 * The parsed payload from a `Runtime.bindingCalled` event for our
 * WebSocket binding.
 *
 * Discriminated union — each `type` corresponds to one event the mock can
 * send back to Node.
 */
export type WsBindingPayload =
  | { type: "onCreate"; id: string; url: string }
  | { type: "onMessageFromPage"; id: string; data: { data: string; isBase64: boolean } }
  | {
      type: "onClosePage";
      id: string;
      code: number | undefined;
      reason: string | undefined;
      wasClean: boolean;
    }
  | { type: "onMessageFromServer"; id: string; data: { data: string; isBase64: boolean } }
  | {
      type: "onCloseServer";
      id: string;
      code: number | undefined;
      reason: string | undefined;
      wasClean: boolean;
    };

/**
 * Dispatch a `Runtime.bindingCalled` event for `WS_BINDING_NAME`.
 *
 * Called from `CdpPage.ts` (or a dedicated event-stream subscriber) when
 * a binding event for our WebSocket binding is received. Looks up the
 * matching handler, calls it (for `onCreate`), or routes the event to the
 * active route state (for `onMessageFromPage` / `onClosePage` /
 * `onMessageFromServer` / `onCloseServer`).
 *
 * If no route matches the WebSocket URL, sends `{type: 'passthrough', id}`
 * to the page so the mock acts as a transparent proxy to the real server.
 *
 * @param connection - CDP connection service
 * @param state - Page state
 * @param getRoutes - Effect to read the current route list
 * @param getActiveSockets - Effect to read the active sockets map
 * @param updateActiveSockets - Effect to update the active sockets map
 * @param executionContextId - The execution context that posted the event
 * @param payload - JSON-stringified payload
 */
export const handleWebSocketBindingCall = (
  connection: CdpConnection["Service"],
  state: PageState,
  getRoutes: Effect.Effect<ReadonlyArray<RegisteredRouteWebSocket>, never, never>,
  getActiveSockets: Effect.Effect<ReadonlyMap<string, WebSocketRouteState>, never, never>,
  updateActiveSockets: (
    update: (
      m: ReadonlyMap<string, WebSocketRouteState>,
    ) => ReadonlyMap<string, WebSocketRouteState>,
  ) => Effect.Effect<void, never, never>,
  _executionContextId: number,
  payload: string,
): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    // Parse the payload. If invalid, just log and drop — we don't have
    // a way to surface this back to the page (it's a fire-and-forget
    // binding).
    const parsed: WsBindingPayload | null = yield* Effect.try({
      try: () => JSON.parse(payload) as WsBindingPayload,
      catch: () => null as WsBindingPayload | null,
    }).pipe(
      Effect.catch((e) => {
        // JSON parse failure — discard the payload. We don't surface
        // errors to the page because the binding is fire-and-forget.
        if (e === null) return Effect.succeed<WsBindingPayload | null>(null);
        return Effect.succeed<WsBindingPayload | null>(null);
      }),
    );
    if (!parsed) return;

    const sessionId = yield* ensureSession(state).pipe(
      // oxlint-disable-next-line effect/effect-catchall-default — page is closed; fall back to empty session id
      Effect.catch((_e) => Effect.succeed("")),
    );

    // ── Per-payload handlers ──────────────────────────────────
    //
    // Each handler is a self-contained sub-state-machine for one
    // discriminated-union variant. They're closure-scoped (rather than
    // module-scope) because they need access to sessionId, connection,
    // getRoutes, getActiveSockets, and updateActiveSockets — captured
    // from this Effect.gen scope. Extracting them keeps the switch
    // dispatch table readable and lets each handler be reasoned about
    // independently.

    /**
     * Handle `onCreate`: a new WebSocket mock was instantiated on the
     * page. If a route matches, create the user-facing handle, call the
     * handler, and ensure the mock is opened. If no route matches, tell
     * the mock to passthrough to the real server.
     */
    const handleOnCreate = (
      payload: Extract<WsBindingPayload, { type: "onCreate" }>,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const allRoutes = yield* getRoutes;
        const matched = allRoutes.find((r) => urlMatches(payload.url, r.url));
        if (!matched) {
          // No route — tell the mock to passthrough (connect to real server)
          yield* dispatchToPage(connection, sessionId, {
            type: "passthrough",
            id: payload.id,
          }).pipe(Effect.ignore);
          // Track this socket so we can clean it up
          yield* updateActiveSockets((m) => {
            const next = new Map(m);
            next.set(payload.id, {
              id: payload.id,
              url: payload.url,
              route: null,
              connected: true,
              closed: false,
              onPageMessage: null,
              onPageClose: null,
              onServerMessage: null,
              onServerClose: null,
              onServerMessageFromServer: null,
              onServerCloseFromServer: null,
            });
            return next;
          });
          return;
        }

        // Build the user-facing route handle
        const route = makeWebSocketRouteHandle(
          connection,
          sessionId,
          payload.id,
          payload.url,
          updateActiveSockets,
        );
        const routeState: WebSocketRouteState = {
          id: payload.id,
          url: payload.url,
          route,
          connected: false,
          closed: false,
          onPageMessage: null,
          onPageClose: null,
          onServerMessage: null,
          onServerClose: null,
          onServerMessageFromServer: null,
          onServerCloseFromServer: null,
        };
        yield* updateActiveSockets((m) => {
          const next = new Map(m);
          next.set(payload.id, routeState);
          return next;
        });

        // Call the user's handler. If it returns an Effect, run it.
        // If it returns void (or undefined), skip. Errors are swallowed
        // (matches Playwright's behavior).
        yield* Effect.ignoreCause(
          Effect.gen(function* () {
            const result = matched.handler(route);
            // The handler's return type is `Effect.Effect<void, any, never> | void`.
            // If the handler returned an Effect, run it; otherwise no-op.
            if (result !== undefined) {
              yield* result as Effect.Effect<void, any, never>;
            }
          }),
        );
        // After the handler returns, if connectToServer wasn't called,
        // ensure the mock is opened (Playwright semantics).
        yield* Effect.gen(function* () {
          const sockets = yield* getActiveSockets;
          const state = sockets.get(payload.id);
          if (state && !state.connected && !state.closed) {
            yield* dispatchToPage(connection, sessionId, {
              type: "ensureOpened",
              id: payload.id,
            }).pipe(Effect.ignore);
          }
        });
      });

    /**
     * Handle `onMessageFromPage`: the page sent a message. Either call the
     * user-registered onPageMessage handler, or default-forward to the
     * real server if `connectToServer()` was called.
     */
    const handleOnMessageFromPage = (
      payload: Extract<WsBindingPayload, { type: "onMessageFromPage" }>,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const sockets = yield* getActiveSockets;
        const state = sockets.get(payload.id);
        if (!state) return;
        if (state.onPageMessage) {
          state.onPageMessage(decodeMessage(payload.data));
          return;
        }
        // Default: forward to the real server (the page's mock owns
        // the real WS; we tell it to send the message via the
        // sendToServer dispatch). This only happens if the user
        // called connectToServer().
        if (state.connected) {
          yield* dispatchToPage(connection, sessionId, {
            type: "sendToServer",
            id: payload.id,
            data: payload.data,
          }).pipe(Effect.ignore);
        }
      });

    /**
     * Handle `onClosePage`: the page closed the WebSocket. Mark the route
     * state closed, fire the user's onPageClose handler (if any), then
     * default-forward the close to the real server if connected.
     */
    const handleOnClosePage = (
      payload: Extract<WsBindingPayload, { type: "onClosePage" }>,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const sockets = yield* getActiveSockets;
        const state = sockets.get(payload.id);
        if (!state) return;
        if (state.closed) return;
        state.closed = true;
        if (state.onPageClose) {
          state.onPageClose(payload.code, payload.reason);
        }
        // Default: forward close to the real server (the page's mock
        // owns the real WS).
        if (state.connected) {
          yield* dispatchToPage(connection, sessionId, {
            type: "closeServer",
            id: payload.id,
            code: payload.code,
            reason: payload.reason,
            wasClean: payload.wasClean,
          }).pipe(Effect.ignore);
        }
        // Cleanup
        yield* updateActiveSockets((m) => {
          const next = new Map(m);
          next.delete(payload.id);
          return next;
        });
      });

    /**
     * Handle `onMessageFromServer`: the real server sent a message. Three
     * priority levels — first-class server-route handler > user-facing
     * onServerMessage > default forward to page.
     */
    const handleOnMessageFromServer = (
      payload: Extract<WsBindingPayload, { type: "onMessageFromServer" }>,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const sockets = yield* getActiveSockets;
        const state = sockets.get(payload.id);
        if (!state) return;
        // First-class handler on the server-side route (set via
        // connectToServer().onMessage)
        if (state.onServerMessageFromServer) {
          state.onServerMessageFromServer(decodeMessage(payload.data));
          return;
        }
        // User's onServerMessage handler
        if (state.onServerMessage) {
          state.onServerMessage(decodeMessage(payload.data));
          return;
        }
        // Default: forward to page
        yield* dispatchToPage(connection, sessionId, {
          type: "sendToPage",
          id: payload.id,
          data: payload.data,
        }).pipe(Effect.ignore);
      });

    /**
     * Handle `onCloseServer`: the real server closed the connection. Same
     * priority as onMessageFromServer — first-class handler > user-facing
     * onServerClose > default forward close to page.
     */
    const handleOnCloseServer = (
      payload: Extract<WsBindingPayload, { type: "onCloseServer" }>,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const sockets = yield* getActiveSockets;
        const state = sockets.get(payload.id);
        if (!state) return;
        // First-class handler on the server-side route
        if (state.onServerCloseFromServer) {
          state.onServerCloseFromServer(payload.code, payload.reason);
        }
        // User's onServerClose handler
        if (state.onServerClose) {
          state.onServerClose(payload.code, payload.reason);
        }
        // Default: forward close to page
        yield* dispatchToPage(connection, sessionId, {
          type: "closePage",
          id: payload.id,
          code: payload.code,
          reason: payload.reason,
          wasClean: payload.wasClean,
        }).pipe(Effect.ignore);
      });

    // Dispatch table for the discriminated union — each case delegates to
    // its dedicated closure-scoped handler above. The fallow complexity
    // of this function is now close to the irreducible cost of the union
    // (one branch per union member) instead of the union of all branch
    // bodies' complexities. `Match.exhaustive` enforces that every union
    // variant is handled — adding a new `WsBindingPayload` variant will
    // be a compile error here. We use `Match.when({ type: ... }, ...)`
    // (not `Match.tag`) because `Match.tag` matches on `_tag`, not on
    // our `type` discriminant.
    yield* Match.value(parsed).pipe(
      Match.when({ type: "onCreate" }, (p) => handleOnCreate(p)),
      Match.when({ type: "onMessageFromPage" }, (p) => handleOnMessageFromPage(p)),
      Match.when({ type: "onClosePage" }, (p) => handleOnClosePage(p)),
      Match.when({ type: "onMessageFromServer" }, (p) => handleOnMessageFromServer(p)),
      Match.when({ type: "onCloseServer" }, (p) => handleOnCloseServer(p)),
      Match.exhaustive,
    );
  }).pipe(Effect.ignore);

// ── Route Handle Factory ──────────────────────────────────────────────────────

/**
 * Builds a `CdpWebSocketRoute` for a given WebSocket mock id.
 *
 * The handle exposes user-facing methods (`connectToServer`, `send`,
 * `close`, `on*`) and bridges them to the page via `dispatchToPage`.
 */
const makeWebSocketRouteHandle = (
  connection: CdpConnection["Service"],
  sessionId: string,
  id: string,
  url: string,
  updateActive: (
    update: (
      m: ReadonlyMap<string, WebSocketRouteState>,
    ) => ReadonlyMap<string, WebSocketRouteState>,
  ) => Effect.Effect<void, never, never>,
): CdpWebSocketRoute => {
  let serverRoute: CdpWebSocketServerRoute | null = null;

  const updateState = (
    fn: (s: WebSocketRouteState) => WebSocketRouteState,
  ): Effect.Effect<WebSocketRouteState | null, never, never> =>
    Effect.gen(function* () {
      let updated: WebSocketRouteState | null = null;
      yield* updateActive((m) => {
        const next = new Map(m);
        const existing = next.get(id);
        if (!existing) return m;
        const u = fn(existing);
        next.set(id, u);
        updated = u;
        return next;
      });
      return updated;
    });

  return {
    url,

    connectToServer(): CdpWebSocketServerRoute {
      // Run the state updates inside an Effect so we can use Effect.fail
      // to surface errors as CdpError. We use Effect.runSync because
      // connectToServer is a sync API.
      const result = Effect.runSync(
        Effect.gen(function* () {
          const state = yield* updateState((s) => s);
          if (!state) {
            return yield* new CdpErrorClass({
              module: "CdpPage",
              method: "routeWebSocket.connectToServer",
              reason: new EvaluationError({
                description: "WebSocket route has been disposed",
              }),
            });
          }
          if (state.connected) {
            return yield* new CdpErrorClass({
              module: "CdpPage",
              method: "routeWebSocket.connectToServer",
              reason: new EvaluationError({
                description: "Already connected to the server",
              }),
            });
          }
          yield* updateState((s) => ({ ...s, connected: true }));
          return state;
        }),
      );
      if (isCdpError(result)) throw result;

      // Tell the page-side mock to connect to the real server. The page
      // owns the real WebSocket from this point on — we just relay
      // events through the binding. This matches Playwright's design
      // (the mock's _ws is the single source of truth for the real
      // server connection).
      void Effect.runPromise(dispatchToPage(connection, sessionId, { type: "connect", id }));

      // Build the server-side route. `send` dispatches to the page;
      // the page's mock then calls `this._ws.send(message)` on the
      // real WebSocket. `onMessage` / `onClose` register handlers
      // that the dispatcher calls when the page's mock relays
      // `onMessageFromServer` / `onCloseServer` events.
      serverRoute = {
        send(message: string | Uint8Array): Effect.Effect<void, CdpError> {
          return dispatchToPage(connection, sessionId, {
            type: "sendToServer",
            id,
            data: encodeMessage(message),
          });
        },
        onMessage(handler: CdpWebSocketMessageHandler): void {
          void Effect.runPromise(
            updateState((s) => ({ ...s, onServerMessageFromServer: handler })),
          );
        },
        onClose(handler: CdpWebSocketCloseHandler): void {
          void Effect.runPromise(updateState((s) => ({ ...s, onServerCloseFromServer: handler })));
        },
      };

      return serverRoute;
    },

    send(message: string | Uint8Array): Effect.Effect<void, CdpError> {
      return dispatchToPage(connection, sessionId, {
        type: "sendToPage",
        id,
        data: encodeMessage(message),
      });
    },

    close(options?: { code?: number; reason?: string }): Effect.Effect<void, CdpError> {
      return dispatchToPage(connection, sessionId, {
        type: "closePage",
        id,
        code: options?.code,
        reason: options?.reason,
        wasClean: true,
      });
    },

    onPageMessage(handler: CdpWebSocketMessageHandler): void {
      void Effect.runPromise(updateState((s) => ({ ...s, onPageMessage: handler })));
    },

    onPageClose(handler: CdpWebSocketCloseHandler): void {
      void Effect.runPromise(updateState((s) => ({ ...s, onPageClose: handler })));
    },

    onServerMessage(handler: CdpWebSocketMessageHandler): void {
      void Effect.runPromise(updateState((s) => ({ ...s, onServerMessage: handler })));
    },

    onServerClose(handler: CdpWebSocketCloseHandler): void {
      void Effect.runPromise(updateState((s) => ({ ...s, onServerClose: handler })));
    },
  };
};
