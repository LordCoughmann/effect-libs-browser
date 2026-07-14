/**
 * Effect-based CDP connection for Chrome DevTools Protocol.
 * Uses Effect v4 primitives for resource safety and type-safe async operations.
 */

import type { Scope } from "effect";

import type { CdpConfigService } from "./CdpConfig.js";
import type { CdpProtocol } from "./CdpProtocol.js";
import type { ProtocolGetVersionResponse } from "./CdpSchema.js";

import {
  Array as Arr,
  Context,
  Deferred,
  Duration,
  Effect,
  Layer,
  PubSub,
  Ref,
  Schema,
  Stream,
} from "effect";

import { CdpConfig } from "./CdpConfig.js";
import {
  CdpCommandError,
  CdpConnectionError,
  CdpTimeoutError,
  CdpMessageParseError,
} from "./CdpProtocolError.js";
import { CdpMessage } from "./CdpSchema.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Union of all error types the CDP connection can produce. */
export type CdpProtocolError = CdpTimeoutError | CdpCommandError | CdpConnectionError;

/**
 * Tracks a pending CDP command awaiting a response.
 * @property deferred - Effect Deferred that will be resolved with the response or error
 * @property method - The CDP method name (for error context)
 */
interface PendingEntry {
  deferred: Deferred.Deferred<CdpMessage, CdpProtocolError>;
  method: string;
}

/**
 * Mutable connection state tracked via Effect Refs.
 * @property ws - The underlying WebSocket connection
 * @property pending - Map of command IDs to their pending Deferreds
 * @property listeners - Set of event listeners to notify on incoming events
 * @property nextId - Counter for generating unique command IDs
 */
interface ConnectionState {
  ws: WebSocket;
  pending: Ref.Ref<Map<number, PendingEntry>>;
  eventBus: PubSub.PubSub<CdpMessage>;
  nextId: Ref.Ref<number>;
}

/**
 * Service interface for communicating with a Chrome DevTools Protocol endpoint.
 *
 * @property cdp - Proxy object for sending CDP commands (e.g., `cdp.Page.navigate()`)
 * @property events - Stream of CDP events (e.g., `Page.loadEventFired`)
 * @property getProtocolVersion - Retrieve the CDP protocol version from the browser
 * @property close - Close the WebSocket connection and clean up resources
 *
 * @example
 * ```typescript
 * import { CdpConnection } from "@effect-libs/browser-cdp";
 * import { Effect } from "effect";
 *
 * // Low-level CDP access
 * const program = Effect.gen(function* () {
 *   const connection = yield* CdpConnection;
 *
 *   // Send CDP commands via the proxy
 *   const result = yield* connection.cdp.Page.navigate({ url: "https://example.com" });
 *   console.log(result);
 *
 *   // Listen to CDP events via Stream
 *   yield* connection.events.pipe(
 *     Stream.filter((e) => e.method === "Page.loadEventFired"),
 *     Stream.take(1),
 *     Stream.runDrain,
 *   );
 * });
 *
 * Effect.runPromise(
 *   program.pipe(Effect.provide(CdpConnection.layer("ws://localhost:9222")))
 * );
 * ```
 */
export interface CdpConnectionService {
  readonly cdp: CdpProtocol;
  readonly events: Stream.Stream<CdpMessage>;
  readonly subscribe: Effect.Effect<PubSub.Subscription<CdpMessage>, never, Scope.Scope>;
  readonly getProtocolVersion: () => Effect.Effect<
    string,
    CdpTimeoutError | CdpCommandError | CdpConnectionError
  >;
  readonly close: () => Effect.Effect<void>;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Regex matching sensitive field patterns to redact from debug logs. */
const SENSITIVE_FIELDS_REGEX = /"(apiKey|token|sessionId)":"[^"]+"/g;

/**
 * Redacts sensitive values from a CDP message JSON string.
 * Used to prevent credentials from leaking into debug console output.
 */
const sanitizeMessage = (msg: string): string => msg.replace(SENSITIVE_FIELDS_REGEX, '"$1":"***"');

/** Checks whether a WebSocket is in an open or connecting state. */
const isWsOpen = (ws: WebSocket): boolean =>
  ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING;

const removePendingEntry = (id: number) => (map: Map<number, PendingEntry>) => {
  const newMap = new Map(map);
  newMap.delete(id);
  return newMap;
};

// ── Message Handling ───────────────────────────────────────────────────────────

/**
 * Resolves a pending Deferred with either the CDP response or a CdpCommandError.
 * Called when a command response arrives from the WebSocket.
 */
const completeDeferred = (
  entry: PendingEntry,
  msg: CdpMessage,
): Effect.Effect<void, never, never> => {
  if (msg.error) {
    return Deferred.fail(
      entry.deferred,
      new CdpCommandError({
        code: msg.error.code,
        message: msg.error.message,
        method: entry.method,
      }),
    );
  }
  return Deferred.succeed(entry.deferred, msg);
};

const handleCommandResponse = (
  pending: Ref.Ref<Map<number, PendingEntry>>,
  msg: CdpMessage & { id: number },
): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    const entry = yield* Ref.modify(pending, (map) => {
      const entry = map.get(msg.id);
      return [entry, removePendingEntry(msg.id)(map)];
    });

    if (!entry) return;

    yield* completeDeferred(entry, msg);
  });

const handleIncomingMessage = (state: ConnectionState, msg: CdpMessage) =>
  Effect.gen(function* () {
    if (msg.id !== undefined) {
      yield* handleCommandResponse(state.pending, msg as CdpMessage & { id: number });
      return;
    }

    yield* PubSub.publish(state.eventBus, msg);
  });

// ── WebSocket Event Handlers ───────────────────────────────────────────────────

/**
 * Fails all pending command Deferreds with a connection error.
 * Called when the WebSocket closes unexpectedly or encounters an error.
 */
const failAllPending = (
  pending: Ref.Ref<Map<number, PendingEntry>>,
  error: CdpConnectionError,
): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    const map = yield* Ref.get(pending);
    const effects = Arr.fromIterable(map.values()).map((entry) =>
      Deferred.fail(entry.deferred, error),
    );
    yield* Effect.all(effects, { concurrency: 1, discard: true });
  });

const createConnectionError = (reason: string, cause?: unknown): CdpConnectionError =>
  new CdpConnectionError({ reason, cause });

/**
 * Runs an Effect in a forked fiber with a catch-all error handler.
 * Used for fire-and-forget effects in WebSocket event callbacks
 * where errors should be logged but not propagated.
 */
const runUntracked = <E>(effect: Effect.Effect<void, E, never>) =>
  Effect.runFork(
    effect.pipe(
      Effect.catchCause((cause) =>
        Effect.logError("[cdp] Unhandled error in WebSocket callback", { cause }),
      ),
    ),
  );

const setupWsOnError =
  (pending: Ref.Ref<Map<number, PendingEntry>>, eventBus: PubSub.PubSub<CdpMessage>) =>
  (event: Event) => {
    runUntracked(
      Effect.gen(function* () {
        yield* failAllPending(pending, createConnectionError("WebSocket error", event));
        yield* PubSub.shutdown(eventBus);
      }),
    );
  };

const setupWsOnClose =
  (pending: Ref.Ref<Map<number, PendingEntry>>, eventBus: PubSub.PubSub<CdpMessage>) =>
  (event: CloseEvent) => {
    runUntracked(
      Effect.gen(function* () {
        yield* failAllPending(
          pending,
          createConnectionError(`WebSocket closed: code=${event.code}`, event),
        );
        yield* PubSub.shutdown(eventBus);
      }),
    );
  };

const setupWsOnMessage = (state: ConnectionState, debug: boolean) => (event: MessageEvent) => {
  const data = event.data as string;

  if (debug) {
    Effect.runFork(Effect.logDebug(`[cdp] ← ${sanitizeMessage(data)}`));
  }

  // Parse and validate using Effect primitives
  const parseAndHandle = Effect.gen(function* () {
    // Use Schema for JSON parsing (Effect-aware API)
    const rawData = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(data).pipe(
      Effect.mapError(
        (issue) =>
          new CdpMessageParseError({
            cause: new Error(`JSON parse failed: ${String(issue)}`),
            raw: data.slice(0, 200),
          }),
      ),
    );

    const msgResult = yield* Schema.decodeUnknownEffect(CdpMessage)(rawData).pipe(
      Effect.mapError(
        (issue) =>
          new CdpMessageParseError({
            cause: new Error(`Schema validation failed: ${String(issue)}`),
            raw: data.slice(0, 200),
          }),
      ),
    );

    return yield* handleIncomingMessage(state, msgResult);
  });

  runUntracked(parseAndHandle);
};

const setupEventHandlers = (
  ws: WebSocket,
  state: ConnectionState,
  debug: boolean,
): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    ws.onopen = () => {
      if (debug) Effect.runFork(Effect.logDebug("[cdp] connected"));
    };

    ws.onerror = setupWsOnError(state.pending, state.eventBus);
    ws.onclose = setupWsOnClose(state.pending, state.eventBus);
    ws.onmessage = setupWsOnMessage(state, debug);
  });

// ── Connection Lifecycle ───────────────────────────────────────────────────────

/**
 * Waits for the WebSocket to transition to OPEN state.
 * Uses Effect.callback for proper interrupt handling - listeners are cleaned up
 * when the fiber is interrupted.
 *
 * Fails with a CdpConnectionError if the connection timeout elapses
 * or the WebSocket emits an error event.
 *
 * @param ws - The WebSocket connection to wait for
 * @param timeout - Maximum time to wait for the connection to open
 */
const waitForConnection = (
  ws: WebSocket,
  timeout: number,
): Effect.Effect<void, CdpConnectionError, never> =>
  Effect.callback<void, CdpConnectionError>((resume, _signal) => {
    const onOpen = () => resume(Effect.void);
    const onError = (e: Event) =>
      resume(Effect.fail(createConnectionError("Connection failed", e)));

    ws.addEventListener("open", onOpen, { once: true });
    ws.addEventListener("error", onError, { once: true });

    // Cleanup on interrupt - remove listeners (no-op if already removed by { once: true })
    return Effect.sync(() => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
    });
  }).pipe(
    Effect.timeout(timeout),
    Effect.mapError(() => createConnectionError("Connection timeout")),
  );

const closeWebSocket = (ws: WebSocket): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    if (isWsOpen(ws)) {
      ws.close();
    }
  });

// ── CDP Command Operations ─────────────────────────────────────────────────────

/**
 * Sends a CDP command and awaits its response.
 *
 * Generates a unique command ID, sends the command via the WebSocket,
 * and waits for the response with a configurable timeout. If the timeout
 * elapses, fails with a CdpTimeoutError.
 *
 * @param state - Connection state holding the WebSocket and pending map
 * @param config - Configuration for timeouts and debug logging
 * @param method - Full CDP method name (e.g., "Page.navigate")
 * @param params - Method-specific parameters
 * @param sessionId - Optional CDP session ID for targeting a specific page
 */
const sendCdpCommand = Effect.fn("sendCdpCommand")(function* (
  state: ConnectionState,
  config: CdpConfigService,
  method: string,
  params: Record<string, unknown> = {},
  sessionId?: string,
) {
  const id = yield* Ref.modify(state.nextId, (n) => [n, n + 1]);
  const deferred = yield* Deferred.make<CdpMessage, CdpProtocolError>();

  yield* Ref.update(state.pending, (map) => new Map(map).set(id, { deferred, method }));

  const msg = { id, method, params, ...(sessionId && { sessionId }) };
  const json = yield* Schema.encodeUnknownEffect(Schema.UnknownFromJsonString)(msg).pipe(
    Effect.orDie,
  );

  if (config.debug) {
    yield* Effect.logDebug(`[cdp] → ${sanitizeMessage(json)}`);
  }

  // Wrap send + await in ensuring so the pending entry is cleaned up
  // even if ws.send() throws (e.g., socket already closed).
  return yield* Effect.sync(() => state.ws.send(json)).pipe(
    Effect.andThen(Deferred.await(deferred)),
    Effect.timeout(config.commandTimeoutMs),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(
        new CdpTimeoutError({ method, timeout: Duration.fromInputUnsafe(config.commandTimeoutMs) }),
      ),
    ),
    Effect.ensuring(Ref.update(state.pending, removePendingEntry(id))),
  );
});

// ── Service Factory Functions ─────────────────────────────────────────────────

/**
 * Creates a Proxy-based CDP command interface.
 *
 * The proxy allows calling CDP methods using dot notation:
 * `cdp.Page.navigate({ url })` → sends "Page.navigate" command.
 * This avoids hardcoding every CDP domain and method.
 *
 * @param state - Connection state for sending commands
 * @param config - Configuration for timeouts and debug logging
 */
const createCdpProxy = (state: ConnectionState, config: CdpConfigService): CdpProtocol =>
  // Cast: the Proxy dynamically builds domain.method → sendCdpCommand mappings.
  // Internally it's untyped (string-based lookup), but the CdpProtocol type
  // gives callers full autocomplete and return-type safety.
  new Proxy({} as CdpProtocol, {
    get: (_target, domain: string) =>
      new Proxy(
        {},
        {
          get: (_obj, method: string) => (params?: unknown, sessionId?: string) =>
            sendCdpCommand(
              state,
              config,
              `${domain}.${method}`,
              params as Record<string, unknown>,
              sessionId,
            ).pipe(
              // eslint-disable-next-line effect/avoid-any
              Effect.map((msg): any => msg.result),
            ),
        },
      ),
  });

const createGetProtocolVersion = (
  state: ConnectionState,
  config: CdpConfigService,
): CdpConnectionService["getProtocolVersion"] =>
  Effect.fn("CdpConnection.getProtocolVersion")(function* () {
    const msg = yield* sendCdpCommand(state, config, "Protocol.getVersion", {});
    // Trust CDP response shape — use Protocol type directly
    // oxlint-disable-next-line effect/avoid-any — CDP response is untyped JSON, cast is inherent
    const response = msg.result as unknown as ProtocolGetVersionResponse;
    if (!response.protocolVersion) {
      return yield* CdpCommandError.fromValidationError(
        "Protocol.getVersion",
        "Missing protocolVersion in response",
      );
    }
    return response.protocolVersion;
  });

// ── Service Implementation ────────────────────────────────────────────────────

/**
 * Factory function that creates a CDP connection to a WebSocket endpoint.
 *
 * Acquires a WebSocket with automatic cleanup on scope exit, sets up
 * event handlers for message routing, and waits for the connection to open.
 *
 * @param wsEndpoint - Full WebSocket URL (e.g., "wss://endpoint?apiKey=...&sessionId=...")
 */
export const make = (wsEndpoint: string) =>
  Effect.gen(function* () {
    const config = yield* CdpConfig;

    const pending = yield* Ref.make(new Map<number, PendingEntry>());
    const eventBus = yield* PubSub.dropping<CdpMessage>(config.eventBufferSize);
    const nextId = yield* Ref.make(0);

    yield* Effect.logDebug(`[cdp] WebSocket: ${wsEndpoint.replace(/apiKey=[^&]+/, "apiKey=***")}`);

    const ws = yield* Effect.acquireRelease(
      Effect.sync(() => new WebSocket(wsEndpoint)),
      closeWebSocket,
    );

    const state: ConnectionState = { ws, pending, eventBus, nextId };

    yield* setupEventHandlers(ws, state, config.debug);
    yield* waitForConnection(ws, config.connectTimeoutMs);

    return {
      cdp: createCdpProxy(state, config),
      events: Stream.fromPubSub(eventBus),
      subscribe: PubSub.subscribe(eventBus),
      getProtocolVersion: createGetProtocolVersion(state, config),
      close: () =>
        Effect.gen(function* () {
          yield* PubSub.shutdown(eventBus);
          yield* closeWebSocket(ws);
        }),
    } as const;
  });

/**
 * CDP Connection service tag.
 *
 * Use `CdpConnection.layer(wsEndpoint)` to create a layer for a specific
 * WebSocket endpoint, then provide it via `Effect.provide` to make the
 * service available.
 */
export class CdpConnection extends Context.Service<CdpConnection, CdpConnectionService>()(
  "effect-libs/browser/CdpConnection",
  {
    make,
  },
) {
  /**
   * Raw layer with CdpConfig dependency in the R channel.
   * Use this when you want to provide your own CdpConfig implementation.
   *
   * @param wsEndpoint - WebSocket URL to connect to
   * @returns An Effect Layer that produces a `CdpConnection` service, requires `CdpConfig`
   */
  static readonly layerNoDeps = (wsEndpoint: string) =>
    Layer.effect(CdpConnection, make(wsEndpoint));

  /**
   * Fully composed layer with CdpConfig provided.
   *
   * @param wsEndpoint - WebSocket URL to connect to
   * @returns An Effect Layer that produces a `CdpConnection` service
   */
  static readonly layer = (wsEndpoint: string) =>
    this.layerNoDeps(wsEndpoint).pipe(Layer.provide(CdpConfig.layer));
}
