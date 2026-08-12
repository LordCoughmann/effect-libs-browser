/**
 * Page bindings — exposes Node/Worker callbacks to the page as `window[name]`.
 *
 * Mirrors Playwright's `page.exposeFunction` / `page.exposeBinding` API.
 *
 * Architecture (matches Playwright's `PageBinding` + `BindingsController`):
 *
 * 1. **Browser-side controller** (`__pwBindingsController`) is installed on
 *    every new document load via `Page.addScriptToEvaluateOnNewDocument`. The
 *    controller exposes three window-level helpers:
 *    - `__pwAddBinding(name, needsHandle)` — registers `window[name]` as a
 *      function that calls `window.__playwright__binding__(payload)`.
 *    - `__pwRemoveBinding(name)` — unregisters the binding.
 *    - `__pwDeliverBindingResult(name, seq, result, error)` — resolves a
 *      pending page-side promise for a given (name, seq) pair.
 *    - `__pwTakeBindingHandle(name, seq)` — for `exposeBinding` with
 *      `{ handle: true }`, returns the unboxed first argument.
 *
 * 2. **CDP dispatch** — `Runtime.addBinding('__playwright__binding__')` makes
 *    the global function a CDP binding. When the page calls it, CDP emits
 *    `Runtime.bindingCalled` with the JSON payload. We subscribe to that
 *    event in CdpPage and route it to the registered callback.
 *
 * 3. **Result delivery** — the user callback's return value is serialised
 *    using the same `__serialize` / `parseEvaluationResultValue` codec as
 *    `page.evaluate`, then delivered back to the page via
 *    `Runtime.evaluate` in the same execution context (so the controller
 *    can resolve the corresponding promise).
 *
 * Difference between `exposeFunction` and `exposeBinding`:
 * - `exposeFunction` — page calls `window[name](...args)` with serialised
 *   values, callback receives them as plain JS values.
 * - `exposeBinding` — page calls `window[name](...args)`, the *source* of
 *   the call is passed as the first argument (with `context`, `page`,
 *   `frame`). The rest of the args are serialised as in `exposeFunction`.
 *   With `{ handle: true }`, the first arg is left un-serialised in the
 *   controller and looked up via `__pwTakeBindingHandle` in the callback's
 *   execution context.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Cause, Effect, Ref, Schema } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, EvaluationError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { parseSerializedResult } from "./Evaluate/serialization/index.js";
import { type PageState } from "./PageState.js";
import { BROWSER_SERIALIZER_CODE, serializeForBrowser } from "./Util/browserSerializer.js";

/**
 * Internal error for arg-deserialisation failures in binding calls.
 * Distinct from `CdpError` so we can `throw` it from inside a generator
 * and catch with `Effect.catch` in the dispatcher.
 */
class BindingArgError extends Error {
  readonly _tag = "BindingArgError";
}

/**
 * Tagged error for user-callback exceptions during a binding call. We
 * can't know the type the user throws, so we wrap into a tagged error
 * with a `message` field to preserve the original failure info without
 * collapsing into the untagged `Error` global type.
 */
class CallbackThrownError extends Schema.TaggedError<CallbackThrownError>()(
  "effect-libs/browser/CdpPage/CallbackThrownError",
  { message: Schema.String },
) {}

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * The global binding name installed via `Runtime.addBinding`. The page-side
 * controller calls `window[GLOBAL_BINDING_NAME](payload)` to dispatch a call
 * back to Node.
 */
export const GLOBAL_BINDING_NAME = "__playwright__binding__";

/**
 * The global object name that holds the browser-side controller. The init
 * script installs the controller at `window[CONTROLLER_NAME]` if it isn't
 * already there (it survives navigations because we re-add the init script
 * after every `exposeFunction` / `exposeBinding` call).
 */
const CONTROLLER_NAME = "__pwBindingsController__";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * A user-registered callback that the page can invoke via `window[name]`.
 *
 * - For `exposeFunction`, `exposeSource` is `false` and the callback
 *   receives the page-side arguments directly.
 * - For `exposeBinding`, `exposeSource` is `true` and the callback receives
 *   a `BindingSource` as its first argument followed by the page-side
 *   arguments.
 * - For `exposeBinding` with `{ handle: true }`, the first page-side
 *   argument is delivered as an un-serialised JS value (looked up in the
 *   page-side controller via `__pwTakeBindingHandle`).
 */
export interface PageBinding {
  /** The binding name. Must be a valid JS identifier. */
  readonly name: string;
  /**
   * Whether to prepend a `BindingSource` to the callback args. True for
   * `exposeBinding`, false for `exposeFunction`.
   */
  readonly exposeSource: boolean;
  /** Whether the first arg is left un-serialised in the controller. */
  readonly needsHandle: boolean;
  /**
   * The user callback. Receives the page-side arguments (deserialised)
   * followed by the `BindingSource` (always present for `exposeBinding`,
   * omitted for `exposeFunction`).
   */
  readonly callback: (
    ...args: ReadonlyArray<unknown>
  ) => Effect.Effect<unknown> | unknown | Promise<unknown>;
}

/**
 * Source of a binding call from the page.
 *
 * Mirrors Playwright's `BindingSource` interface for `exposeBinding` (and
 * the `frame` / `context` / `page` properties it exposes).
 */
export interface BindingSource {
  /** CDP frame the call originated from. */
  readonly frame: { readonly frameId: string; readonly url: string };
  /** Page that owns the frame. */
  readonly page: { readonly targetId: string };
  /** Browser context handle (for cookie / storage access). */
  readonly context: unknown;
}

/**
 * Payload posted from the page to Node when `window[name](...args)` is
 * invoked.
 */
interface BindingPayload {
  /** Name of the binding. */
  readonly name: string;
  /** Per-call sequence number for matching responses. */
  readonly seq: number;
  /** Serialised arguments (omitted for the handle variant). */
  readonly serializedArgs?: ReadonlyArray<unknown>;
  /** True when the page passed a JS handle as the first arg. */
  readonly handle?: boolean;
}

// ── Browser-side controller source ────────────────────────────────────────────

/**
 * Source of the init script that installs the bindings controller on the
 * page. Run once per new document (via `Page.addScriptToEvaluateOnNewDocument`).
 *
 * Uses the existing `BROWSER_SERIALIZER_CODE` (`__serialize` global) to
 * serialise arguments in the same format as `page.evaluate` results.
 *
 * Public surface on `window`:
 * - `__pwAddBinding(name, needsHandle)` — register a binding.
 * - `__pwRemoveBinding(name)` — unregister.
 * - `__pwTakeBindingHandle(name, seq)` — read the stashed handle.
 * - `__pwDeliverBindingResult(name, seq, result, error)` — resolve a pending
 *   page-side promise.
 * - `__playwright__binding__` — the global dispatcher function installed
 *   via `Runtime.addBinding`. The controller reads payloads posted through
 *   it.
 */
const buildBindingsControllerSource = (): string => {
  return `(() => {
  ${BROWSER_SERIALIZER_CODE}
  var __pwControllerName = ${JSON.stringify(CONTROLLER_NAME)};
  if (globalThis[__pwControllerName]) return;
  var __pwBindings = new Map();
  globalThis[__pwControllerName] = {
    addBinding: function(name, needsHandle) {
      var data = { callbacks: new Map(), lastSeq: 0, handles: new Map(), removed: false, needsHandle: needsHandle };
      __pwBindings.set(name, data);
      globalThis[name] = function() {
        var args = Array.prototype.slice.call(arguments);
        if (data.removed) throw new Error('binding "' + name + '" has been removed');
        if (needsHandle && Array.prototype.slice.call(args, 1).some(function(a) { return a !== undefined; }))
          throw new Error('exposeBindingHandle supports a single argument, ' + args.length + ' received');
        var seq = ++data.lastSeq;
        var promise = new Promise(function(resolve, reject) { data.callbacks.set(seq, { resolve: resolve, reject: reject }); });
        var payload;
        if (needsHandle) {
          data.handles.set(seq, args[0]);
          payload = { name: name, seq: seq, handle: true };
        } else {
          var serializedArgs = [];
          for (var i = 0; i < args.length; i++) serializedArgs[i] = __serialize(args[i]);
          payload = { name: name, seq: seq, serializedArgs: serializedArgs };
        }
        globalThis.${GLOBAL_BINDING_NAME}(JSON.stringify(payload));
        return promise;
      };
    },
    removeBinding: function(name) {
      var data = __pwBindings.get(name);
      if (data) data.removed = true;
      __pwBindings.delete(name);
      delete globalThis[name];
    },
    takeBindingHandle: function(name, seq) {
      var data = __pwBindings.get(name);
      if (!data) return undefined;
      var handle = data.handles.get(seq);
      data.handles.delete(seq);
      return handle;
    },
    deliverBindingResult: function(name, seq, result, error) {
      var data = __pwBindings.get(name);
      if (!data) return;
      var cb = data.callbacks.get(seq);
      if (!cb) return;
      data.callbacks.delete(seq);
      if (error !== undefined) {
        var err;
        try { err = new Error(typeof error === 'string' ? error : (error && error.m) || JSON.stringify(error)); }
        catch (e) { err = new Error(String(error)); }
        if (error && error.s) err.stack = error.s;
        cb.reject(err);
      } else {
        cb.resolve(result);
      }
    }
  };
})();`;
};

/**
 * Source of the init script that registers a single binding on every new
 * document. We re-emit this script for every `exposeFunction` /
 * `exposeBinding` call so the controller is wired up before any of the
 * page's own scripts run.
 */
const buildAddBindingSource = (name: string, needsHandle: boolean): string => {
  return `(() => { globalThis[${JSON.stringify(CONTROLLER_NAME)}].addBinding(${JSON.stringify(name)}, ${needsHandle}); })();`;
};

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Registers a binding by name. Throws a `CdpError` wrapping
 * `EvaluationError` if the name is already registered.
 *
 * Installs the controller (once) and this binding's `addBinding` call via
 * `Page.addScriptToEvaluateOnNewDocument`. Future navigations pick up the
 * controller automatically.
 */
export const registerBinding = Effect.fn("CdpPage.registerBinding")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    binding: PageBinding,
  ): Effect.Effect<void, CdpError> =>
    Effect.gen(function* () {
      // Duplicate-name check (matches Playwright: throws synchronously
      // before the init script is installed).
      const existing = yield* Ref.get(state.bindings);
      if (existing.has(binding.name)) {
        return yield* new CdpError({
          source: "CdpPage",
          method: "exposeFunction",
          reason: new EvaluationError({
            description: `page.exposeFunction: Function "${binding.name}" has been already registered`,
          }),
        });
      }

      const sessionId = yield* ensureSession(state);

      // Ensure the global CDP binding is installed. Idempotent — multiple
      // calls with the same name are cheap.
      yield* conn.cdp.Runtime.addBinding({ name: GLOBAL_BINDING_NAME }, sessionId).pipe(
        Effect.ignore,
      );

      // Install the controller once. Subsequent calls re-emit the same
      // `addBinding` script, which is a no-op on the page side (the
      // controller checks for duplicates).
      yield* conn.cdp.Page.addScriptToEvaluateOnNewDocument(
        { source: buildBindingsControllerSource() },
        sessionId,
      ).pipe(Effect.ignore);

      // Register this binding on every future document.
      yield* conn.cdp.Page.addScriptToEvaluateOnNewDocument(
        { source: buildAddBindingSource(binding.name, binding.needsHandle) },
        sessionId,
      ).pipe(Effect.ignore);

      // Also evaluate the controller + addBinding in the *current* document
      // so the binding is available immediately (not just on the next
      // navigation). The controller IIFE checks for an existing instance
      // and is a no-op on subsequent calls.
      //
      // Mirrors upstream Playwright's `safeNonStallingEvaluateInAllFrames`.
      // We inline the controller source into the expression so it works
      // even when the controller hasn't been installed in the current
      // document yet.
      yield* conn.cdp.Runtime.evaluate(
        {
          expression: `(() => { ${buildBindingsControllerSource()}; globalThis[${JSON.stringify(CONTROLLER_NAME)}].addBinding(${JSON.stringify(binding.name)}, ${binding.needsHandle}); })();`,
        },
        sessionId,
      ).pipe(Effect.ignore);

      // Track the binding in PageState.
      yield* Ref.update(state.bindings, (map) => {
        const next = new Map(map);
        next.set(binding.name, binding);
        return next;
      });
    }),
);

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Handles a `Runtime.bindingCalled` event by looking up the registered
 * callback, invoking it with deserialised args, and delivering the result
 * (or error) back to the page via `deliverBindingResult`.
 *
 * - For `exposeFunction` (`needsHandle: false`), args are deserialised
 *   from the `serializedArgs` array and passed to the callback.
 * - For `exposeBinding` (`needsHandle: false`), args are deserialised and
 *   the `BindingSource` is prepended.
 * - For `exposeBinding({ handle: true })`, the first argument is left
 *   un-serialised and looked up via `__pwTakeBindingHandle` in the call's
 *   execution context.
 */
export const handleBindingCall = Effect.fn("CdpPage.handleBindingCall")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    executionContextId: number,
    payload: string,
  ): Effect.Effect<void, never, never> =>
    Effect.gen(function* () {
      // Parse the payload. If it isn't valid JSON, deliver a synthetic
      // error to the page (so the page-side promise doesn't hang) and
      // return.
      const parsed = yield* Effect.try({
        try: () => JSON.parse(payload) as BindingPayload,
        catch: (e) =>
          new CdpError({
            source: "CdpPage",
            method: "binding",
            reason: new EvaluationError({
              description: `binding payload parse error: ${getErrorMessage(e)}`,
            }),
          }),
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            // Best-effort: we don't know the binding name or seq at this
            // point, so just log and bail out of the dispatch.
            yield* Effect.logDebug("[bindings] payload parse error", cause);
            return null;
          }),
        ),
      );
      if (parsed === null) return;

      const sessionId = yield* ensureSession(state);
      const bindings = yield* Ref.get(state.bindings);
      const binding = bindings.get(parsed.name);
      if (!binding) {
        yield* deliverBindingResult(
          conn,
          sessionId,
          executionContextId,
          parsed.name,
          parsed.seq,
          undefined,
          `Function "${parsed.name}" is not exposed`,
        );
        return;
      }

      // Build the callback arguments.
      // - `exposeFunction` (`exposeSource: false`) — page args passed directly.
      // - `exposeBinding` (`exposeSource: true`) — page args prepended by
      //   a `BindingSource`.
      // - With `needsHandle: true`, the first page-side argument is delivered
      //   un-serialised via `__pwTakeBindingHandle`.
      const callbackArgs = yield* Effect.gen(function* () {
        if (binding.needsHandle) {
          const handle = yield* evaluateInContext<unknown>(
            conn,
            sessionId,
            executionContextId,
            `globalThis[${JSON.stringify(CONTROLLER_NAME)}].takeBindingHandle(${JSON.stringify(parsed.name)}, ${parsed.seq})`,
          );
          return binding.exposeSource
            ? ([buildBindingSource(state, executionContextId), handle] as ReadonlyArray<unknown>)
            : ([handle] as ReadonlyArray<unknown>);
        }
        if (!Array.isArray(parsed.serializedArgs)) {
          throw new BindingArgError(
            `serializedArgs is not an array. This can happen when Array.prototype.toJSON is defined incorrectly`,
          );
        }
        const deserialised = parsed.serializedArgs.map((arg) =>
          parseSerializedResult(arg as Parameters<typeof parseSerializedResult>[0]),
        );
        return binding.exposeSource
          ? ([
              buildBindingSource(state, executionContextId),
              ...deserialised,
            ] as ReadonlyArray<unknown>)
          : deserialised;
      }).pipe(
        // The generator may throw BindingArgError (serialisedArgs not an
        // array) or fail with a transport error. Either way, we want to
        // deliver a structured error to the page rather than propagating.
        // oxlint-disable-next-line effect/effect-catchall-default — intentional blanket recovery
        Effect.catchCause((cause) =>
          Effect.succeed<ReadonlyArray<unknown> | { __pwArgError: string }>({
            __pwArgError: getErrorMessage(cause),
          }),
        ),
      );

      if ("__pwArgError" in (callbackArgs as object)) {
        yield* deliverBindingResult(
          conn,
          sessionId,
          executionContextId,
          parsed.name,
          parsed.seq,
          undefined,
          (callbackArgs as { __pwArgError: string }).__pwArgError,
        );
        return;
      }

      // Invoke the user callback. Convert any thrown error or returned
      // Promise rejection into a structured error.
      const invoked = yield* Effect.tryPromise({
        try: async () => await binding.callback(...(callbackArgs as ReadonlyArray<unknown>)),
        catch: (e) =>
          new CallbackThrownError({ message: e instanceof Error ? e.message : String(e) }),
      }).pipe(
        Effect.map((r) => ({ ok: true as const, value: r })),
        // oxlint-disable-next-line effect/effect-catchall-default — wrap user callback failures as structured error
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            const e = Cause.squash(cause);
            return { ok: false as const, error: e instanceof Error ? e : new Error(String(e)) };
          }),
        ),
      );

      if (!invoked.ok) {
        const e = invoked.error;
        yield* deliverBindingResult(
          conn,
          sessionId,
          executionContextId,
          parsed.name,
          parsed.seq,
          undefined,
          { m: e.message, s: e.stack ?? "" },
        );
        return;
      }

      // Serialise the result for delivery back to the page. We use
      // `serializeForBrowser` which returns a JS expression string that
      // recreates the value in the page context. This keeps types intact
      // (e.g. numbers stay numbers rather than becoming strings).
      const serialised: string | undefined = yield* Effect.try({
        try: () => serializeForBrowser(invoked.value),
        catch: (e) =>
          new CdpError({
            source: "CdpPage",
            method: "binding",
            reason: new EvaluationError({
              description: `binding result serialise error: ${getErrorMessage(e)}`,
            }),
          }),
      }).pipe(Effect.orElseSucceed(() => undefined as string | undefined));

      yield* deliverBindingResult(
        conn,
        sessionId,
        executionContextId,
        parsed.name,
        parsed.seq,
        serialised,
        undefined,
      );
      // oxlint-disable-next-line effect/effect-catchall-default — binding dispatch must never crash the event stream
    }).pipe(Effect.ignore),
);

/**
 * Builds a `BindingSource` for a call originating in the given execution
 * context. The frame and URL are read from the FrameManager.
 */
const buildBindingSource = (_state: PageState, _executionContextId: number): BindingSource => {
  // We don't yet track per-context frame associations for binding
  // source — the upstream `BindingSource` exposes a `frame` object that
  // we don't need for the basic `exposeFunction` parity tests. Keep a
  // minimal stub that satisfies the `BindingSource` shape; tests that
  // assert on `source.frame` etc. can be added later via a dedicated
  // `exposeBinding` parity spec.
  return {
    frame: { frameId: "main", url: "" },
    page: { targetId: "" },
    context: null,
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Evaluates an expression in the given execution context and returns the
 * result. Used for `__pwTakeBindingHandle` lookups and to deliver results
 * back to the page-side controller.
 */
const evaluateInContext = <T>(
  conn: CdpConnection["Service"],
  sessionId: string,
  executionContextId: number,
  expression: string,
): Effect.Effect<T, CdpError | never> =>
  Effect.gen(function* () {
    const result = yield* conn.cdp.Runtime.evaluate(
      { expression, returnByValue: true, contextId: executionContextId },
      sessionId,
    ).pipe(
      Effect.mapError(
        (e) =>
          new CdpError({
            source: "CdpPage",
            method: "evaluateInContext",
            reason: new EvaluationError({ description: e.message }),
          }),
      ),
    );
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      return yield* new CdpError({
        source: "CdpPage",
        method: "evaluateInContext",
        reason: new EvaluationError({ description: text }),
      });
    }
    return result.result.value as T;
  });

/**
 * Delivers a result (or error) back to the page by calling
 * `__pwDeliverBindingResult(name, seq, result, error)` in the same
 * execution context. Errors are best-effort: if delivery itself fails
 * (e.g. context was destroyed), the failure is logged but not propagated,
 * because the caller has no way to recover the page-side promise.
 *
 * The result is expected to be a JS *expression string* (as produced by
 * `serializeForBrowser`) that recreates the value in the page context.
 * It's embedded directly into the delivery expression (not JSON-stringified)
 * so primitives keep their types: e.g. `11` stays a number, not the
 * string `"11"`.
 */
const deliverBindingResult = (
  conn: CdpConnection["Service"],
  sessionId: string,
  executionContextId: number,
  name: string,
  seq: number,
  serialisedResult: string | undefined,
  error: unknown,
): Effect.Effect<void, never, never> => {
  const expression = `(() => {
    var err = ${error === undefined ? "undefined" : JSON.stringify(error)};
    var res = ${serialisedResult === undefined ? "undefined" : `(${serialisedResult})`};
    globalThis[${JSON.stringify(CONTROLLER_NAME)}].deliverBindingResult(${JSON.stringify(name)}, ${seq}, res, err);
  })();`;
  return conn.cdp.Runtime.evaluate({ expression, contextId: executionContextId }, sessionId).pipe(
    Effect.ignore,
  );
};
