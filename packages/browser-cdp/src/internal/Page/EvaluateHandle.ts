/**
 * `evaluateHandle` — JSHandle-like remote object references for CDP.
 *
 * Mirrors Playwright's `evaluateHandle` API. CDP doesn't have a separate
 * `JSHandle` class — the `objectId` returned by `Runtime.evaluate`
 * (without `returnByValue: true`) is the handle.
 *
 * CDP `RemoteObject.objectId` is a stable reference to a remote object.
 * The browser keeps the object alive as long as we hold the `objectId`;
 * calling `Runtime.releaseObject` (or letting the page be destroyed)
 * releases it.
 *
 * ## Design notes
 *
 * We model the handle as `unknown` on the consumer side (it cannot be
 * dereferenced from Node — only passed back to the browser via
 * `Runtime.callFunctionOn`'s `arguments` field, which accepts
 * `{ objectId }` entries). This is exactly what Playwright does, except
 * Playwright returns a `SmartHandle<T>` proxy that lazily resolves
 * via another `Runtime.getProperties` round-trip. We skip that for v1.
 *
 * ## Evaluating with handles
 *
 * When `evaluate(fn, handle)` is called, the handle is passed via
 * CDP's `Runtime.callFunctionOn` `arguments` field. The browser
 * function then receives the dereferenced handle as a positional
 * argument. See {@link serializeArgForCallFunctionOn} for how we
 * mix handles and JSON values in the arg tree.
 *
 * ## Primitive-handle fallback
 *
 * `Runtime.evaluate` without `returnByValue: true` returns no `objectId`
 * for primitive results (numbers, strings, booleans, etc.). To support
 * `evaluateHandle(() => 5)`, we wrap primitive results in a synthetic
 * {@link CdpHandle} that holds the value directly. The synthetic handle
 * has the same `CdpHandle` shape (so consumers don't need to special-case
 * it), but routes `evaluate` / `evaluateHandle` through a Node-side
 * inlining path rather than `Runtime.callFunctionOn`.
 *
 * The discriminator is the `__kind` field: `"object"` for real CDP
 * object handles (with a CDP `objectId`), `"primitive"` for wrapped
 * primitive values (with a synthetic `objectId` for type-guard
 * compatibility and a `__primitiveValue` holding the value).
 */

import type { Protocol } from "devtools-protocol";

import type { CdpConnection } from "../CdpConnection.js";

import { Effect, Predicate, Ref } from "effect";
import * as P from "effect/Predicate";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, EvaluationError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import {
  parseSerializedResult,
  isSerializedValue,
  type SerializedValue,
} from "./Evaluate/serialization/index.js";
import { type PageState } from "./PageState.js";
import { serializeForBrowser } from "./Util/browserSerializer.js";

// ── CdpHandle ──────────────────────────────────────────────────────────────────

/**
 * A JSHandle-like remote object reference for CDP.
 *
 * Handles are opaque from Node's perspective — they wrap a CDP
 * `RemoteObject.objectId` and can only be used as arguments to
 * subsequent browser-side `evaluate` calls. To get the underlying value,
 * pass the handle to `evaluate(fn, handle)` and read the result.
 *
 * Mirrors Playwright's `JSHandle` at parity: lifecycle (`dispose`),
 * evaluation (`evaluate`, `evaluateHandle`), property access
 * (`getProperty`, `getProperties`), JSON projection (`jsonValue`), and
 * element detection (`asElement`).
 *
 * `CdpHandle` is a discriminated union:
 *  - `"object"` — real CDP object handle with a browser-side `objectId`
 *  - `"primitive"` — synthetic handle wrapping a primitive value (no
 *    `objectId` was returned by CDP). See `__primitiveValue`.
 */
export type CdpHandle = CdpObjectHandle | CdpPrimitiveHandle;

export interface CdpObjectHandle {
  readonly __kind: "object";
  /**
   * The CDP `RemoteObject.objectId`. Opaque from Node — pass to
   * browser-side evaluations via the `evaluate(fn, handle)` path.
   */
  readonly objectId: string;

  /**
   * Releases the remote object. After `dispose`, the handle is invalid
   * and any subsequent operation fails with `CdpError`.
   */
  readonly dispose: () => Effect.Effect<void, CdpError>;

  /**
   * Evaluates a function against the handle's value.
   *
   * - The function receives the handle's dereferenced value as its first argument.
   * - Additional args are passed normally (JSON-serialized, no handles).
   * - The result is returned deserialized (same as `page.evaluate`).
   */
  readonly evaluate: <T>(
    pageFunction: string | ((value: unknown, ...args: any[]) => T),
    arg?: unknown,
  ) => Effect.Effect<Awaited<T>, CdpError>;

  /**
   * Evaluates a function against the handle's value and returns a new
   * `CdpHandle` referencing the result.
   *
   * Mirrors Playwright's `jsHandle.evaluateHandle`. If the function
   * returns a primitive, the resulting handle is a {@link CdpPrimitiveHandle}.
   */
  readonly evaluateHandle: <T>(
    pageFunction: string | ((value: unknown, ...args: any[]) => T),
    arg?: unknown,
  ) => Effect.Effect<CdpHandle, CdpError>;

  /**
   * Returns a JSON-serializable representation of the handle's value,
   * **bypassing `toJSON`**.
   *
   * Mirrors Playwright's `jsHandle.jsonValue()`. Uses our browser-side
   * serializer (`__serialize` from `BROWSER_SERIALIZER_CODE`) which
   * walks the object and converts each value to a `SerializedValue`,
   * then parses it back to a native JS value on the Node side.
   *
   * Behaviour matches upstream Playwright for: plain objects, arrays,
   * primitives, NaN, ±Infinity, ±0, Dates (as Date objects, NOT
   * stringified), URLs, RegExp, Maps, Sets, Error, typed arrays,
   * ArrayBuffer, bigints, functions (returned as `{ s: source }`),
   * circular refs (returned as `undefined`).
   */
  readonly jsonValue: () => Effect.Effect<unknown, CdpError>;

  /**
   * Returns a map of **own and inherited** property names to `CdpHandle`
   * instances for the property values.
   *
   * Mirrors Playwright's `jsHandle.getProperties()`. Includes prototype
   * chain (uses `Runtime.getProperties` with `ownProperties: false`).
   * Properties whose value is a primitive (no `objectId`) are wrapped in
   * a {@link CdpPrimitiveHandle} so consumers don't need to special-case
   * them.
   */
  readonly getProperties: () => Effect.Effect<ReadonlyMap<string, CdpHandle>, CdpError>;

  /**
   * Gets a property of the handle as a new `CdpHandle`.
   *
   * The property is resolved via `Runtime.getProperties`. Returns a
   * {@link CdpPrimitiveHandle} for primitive-valued properties.
   */
  readonly getProperty: (name: string) => Effect.Effect<CdpHandle, CdpError>;

  /**
   * Returns the same handle if it references a DOM `Node` (including
   * `Text`, `Element`, etc.), or `null` otherwise.
   *
   * Mirrors Playwright's `jsHandle.asElement()`. `browser-cdp` is locator-only —
   * we return the handle (not an `ElementHandle`).
   *
   * Implemented via `Runtime.callFunctionOn` with a function that
   * checks `this instanceof Node`.
   */
  readonly asElement: () => Effect.Effect<CdpHandle | null, CdpError>;
}

/**
 * Synthetic handle wrapping a primitive value (number, string, boolean,
 * etc.) when `Runtime.evaluate` returns no `objectId` for the result.
 *
 * Use `handle.jsonValue()` to read the wrapped value, or pass the handle
 * to `page.evaluate(fn, handle)` to consume it in a function evaluation
 * (the value is inlined as a literal in the function declaration).
 *
 * Operations that require a real object reference (e.g. `getProperty`,
 * `getProperties`, `asElement`) fail with `EvaluationError`.
 */
export interface CdpPrimitiveHandle {
  readonly __kind: "primitive";
  /**
   * Synthetic ID for type-guard compatibility. Has the form
   * `"__cdp_primitive_<random>"` and is **not** a valid CDP `objectId`.
   * Callers must not pass it to `Runtime.releaseObject` or
   * `Runtime.callFunctionOn`.
   */
  readonly objectId: string;

  /**
   * The wrapped primitive value.
   */
  readonly __primitiveValue: unknown;

  /**
   * Releases the handle. No-op for primitive handles (no remote object
   * to release) but provided for API symmetry with object handles.
   */
  readonly dispose: () => Effect.Effect<void, CdpError>;

  /**
   * Evaluates `fn(primitiveValue, arg)` in the browser. The primitive
   * value is inlined as a literal in the function declaration.
   */
  readonly evaluate: <T>(
    pageFunction: string | ((value: unknown, ...args: any[]) => T),
    arg?: unknown,
  ) => Effect.Effect<Awaited<T>, CdpError>;

  /**
   * Evaluates `fn(primitiveValue, arg)` in the browser and returns a
   * `CdpHandle` for the result. The result handle is a real
   * {@link CdpObjectHandle} for object/array/function results, or a
   * {@link CdpPrimitiveHandle} for primitive results.
   */
  readonly evaluateHandle: <T>(
    pageFunction: string | ((value: unknown, ...args: any[]) => T),
    arg?: unknown,
  ) => Effect.Effect<CdpHandle, CdpError>;

  /**
   * Returns the wrapped primitive value. Mirrors Playwright's
   * `jsHandle.jsonValue()`.
   */
  readonly jsonValue: () => Effect.Effect<unknown, CdpError>;

  /**
   * Always returns an empty map — primitives have no properties.
   */
  readonly getProperties: () => Effect.Effect<ReadonlyMap<string, CdpHandle>, CdpError>;

  /**
   * Always fails with `EvaluationError` — primitives have no properties.
   */
  readonly getProperty: (name: string) => Effect.Effect<CdpHandle, CdpError>;

  /**
   * Always returns `null` — primitives are not DOM nodes.
   */
  readonly asElement: () => Effect.Effect<CdpHandle | null, CdpError>;
}

/**
 * Type guard: returns true if `v` is a `CdpHandle` (either kind).
 *
 * Used by `evaluate` to detect handle arguments and route them through
 * `Runtime.callFunctionOn` instead of `Runtime.evaluate`.
 */
export const isCdpHandle = (v: unknown): v is CdpHandle =>
  Predicate.isObject(v) &&
  P.isString((v as { objectId?: unknown }).objectId) &&
  P.isFunction((v as { dispose?: unknown }).dispose);

/**
 * Type guard: returns true if `h` is a `CdpPrimitiveHandle`.
 */
export const isCdpPrimitiveHandle = (h: CdpHandle): h is CdpPrimitiveHandle =>
  h.__kind === "primitive";

// ── Handle Arg Helpers ──────────────────────────────────────────────────────────

/**
 * Sentinel marker used to record a handle position during arg
 * serialization. The browser-side resolution helper walks the JSON value
 * tree and substitutes these markers with the actual handle references
 * passed via `Runtime.callFunctionOn`'s `arguments` field.
 */
interface HandleRef {
  readonly __cdpHandleRef: number;
}

/**
 * Walks the arg tree and collects all CdpHandle references.
 *
 * Returns handles in depth-first traversal order. This order is used
 * to assign sequential indices for the `__cdpHandleRef` placeholder.
 */
export const collectHandles = (value: unknown): ReadonlyArray<CdpHandle> => {
  const out: CdpHandle[] = [];
  const walk = (v: unknown): void => {
    if (isCdpHandle(v)) {
      out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (Predicate.isObject(v)) {
      for (const key of Object.keys(v as Record<string, unknown>)) {
        walk((v as Record<string, unknown>)[key]);
      }
    }
  };
  walk(value);
  return out;
};

/**
 * Returns true if the arg tree contains any CdpHandle references.
 * Faster than `collectHandles` since it short-circuits on first match.
 */
export const argContainsHandle = (value: unknown): boolean => {
  if (isCdpHandle(value)) return true;
  if (Array.isArray(value)) {
    for (const item of value) if (argContainsHandle(item)) return true;
    return false;
  }
  if (Predicate.isObject(value)) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (argContainsHandle((value as Record<string, unknown>)[key])) return true;
    }
  }
  return false;
};

/**
 * Replaces each object CdpHandle in the arg tree with a
 * `{ __cdpHandleRef: i }` placeholder, where `i` is the handle's index
 * in the **object-handle-only** sublist of `handles`. Primitive
 * CdpHandles are inlined as their wrapped value (no placeholder needed
 * — the value can be JSON-serialized directly).
 *
 * Object handles must be passed via `Runtime.callFunctionOn`'s
 * `arguments` field in the same depth-first order so the indices line
 * up. Primitive handles are NOT passed via `arguments` — their values
 * are inlined into the serialized arg tree instead.
 *
 * Superseded by Phase P6: the new utility-script path passes args via
 * `Runtime.callFunctionOn` `arguments` directly (no JS-expression
 * inlining, no `{__cdpHandleRef: i}` placeholder indirection). The
 * helper below is retained for tests / parity with the pre-P6
 * handle-aware serializer, but is no longer used by `Evaluate.ts`.
 */
// fallow-ignore-next-line unused-export
export const _retained_replaceHandlesWithRefs = (
  value: unknown,
  handles: ReadonlyArray<CdpHandle>,
): unknown => {
  // Build the object-handle-only sublist. The placeholder index is the
  // handle's position in this sublist (matching the position in the
  // `arguments` field on the call site).
  const objectHandles: CdpHandle[] = [];
  for (const h of handles) {
    if (!isCdpPrimitiveHandle(h)) objectHandles.push(h);
  }
  const findIndex = (h: CdpHandle): number => {
    if (isCdpPrimitiveHandle(h)) {
      throw new Error(`Internal error: primitive handle has no index`);
    }
    const idx = objectHandles.indexOf(h);
    if (idx < 0) {
      throw new Error(`Internal error: handle not in collected list`);
    }
    return idx;
  };
  const walk = (v: unknown): unknown => {
    if (isCdpHandle(v)) {
      if (isCdpPrimitiveHandle(v)) {
        // Inline the wrapped value — no placeholder needed.
        return v.__primitiveValue;
      }
      return { __cdpHandleRef: findIndex(v) } satisfies HandleRef;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (Predicate.isObject(v)) {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>)) {
        result[key] = walk((v as Record<string, unknown>)[key]);
      }
      return result;
    }
    return v;
  };
  return walk(value);
};

/**
 * Returns the object-handle sublist of `handles` (preserves order).
 * Used by the `evaluate` call site to build the `arguments` field for
 * `Runtime.callFunctionOn`.
 *
 * Superseded by Phase P6: the utility-script path uses
 * `buildArgsAndHandles` in `Evaluate.ts` instead. Retained for tests
 * and removed in commit 4.
 */
// fallow-ignore-next-line unused-export
export const _retained_objectHandlesOf = (
  handles: ReadonlyArray<CdpHandle>,
): ReadonlyArray<CdpHandle> => handles.filter((h) => !isCdpPrimitiveHandle(h));

// ── Browser-Side Handle Resolution ─────────────────────────────────────────────

/**
 * Code injected into the browser before the user function runs.
 * Resolves `{ __cdpHandleRef: i }` placeholders in an arg value to the
 * corresponding handle (passed via CDP `arguments[i + 1]`).
 *
 * We slot handles at positions `[1..N]` (position 0 is the deserialized
 * arg tree) so the indices line up with the browser's `arguments` array.
 */
const HANDLE_RESOLVER_CODE = `
var __cdpResolveHandles = function(value, handles) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    var out = new Array(value.length);
    for (var i = 0; i < value.length; i++) out[i] = __cdpResolveHandles(value[i], handles);
    return out;
  }
  if (typeof value === 'object') {
    if (typeof value.__cdpHandleRef === 'number') {
      return handles[value.__cdpHandleRef];
    }
    var r = {};
    for (var k in value) r[k] = __cdpResolveHandles(value[k], handles);
    return r;
  }
  return value;
};
`;

/**
 * Browser-side serializer injected into the function body for
 * `jsonValue`. Converts the handle's dereferenced value to a
 * `SerializedValue` (a plain JSON tree), bypassing the object's own
 * `toJSON` (because the serializer walks `Object.keys` and never calls
 * `JSON.stringify` on the value).
 */
const HANDLE_SERIALIZER_CODE = `
function __cdpHandleSerialize(v) {
  var seen = new Set();
  return __cdpSerializeInner(v, seen);
}
function __cdpSerializeInner(v, seen) {
  if (v === undefined) return { v: 'undefined' };
  if (v === null) return { v: 'null' };
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { v: 'NaN' };
    if (!Number.isFinite(v)) return { v: v > 0 ? 'Infinity' : '-Infinity' };
    if (Object.is(v, -0)) return { v: '-0' };
    return v;
  }
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v;
  if (typeof v === 'bigint') return { bi: v.toString() };

  if (typeof v === 'object') {
    if (seen.has(v)) return { v: 'undefined' };
    seen.add(v);
  }

  if (v instanceof Date) return { d: v.toISOString() };
  if (v instanceof URL) return { u: v.toString() };
  if (v instanceof RegExp) return { r: { p: v.source, f: v.flags } };
  if (v instanceof Error) {
    var stack;
    if (v.stack && v.stack.startsWith(v.name + ': ' + v.message)) {
      stack = v.stack;
    } else {
      stack = v.name + ': ' + v.message + '\\n' + (v.stack || '');
    }
    return { e: { n: v.name, m: v.message, s: stack } };
  }

  // Map
  if (v instanceof Map) {
    var entries = [];
    v.forEach(function(val, key) {
      entries.push([__cdpSerializeInner(key, seen), __cdpSerializeInner(val, seen)]);
    });
    return { m: entries };
  }

  // Set
  if (v instanceof Set) {
    var vals = [];
    v.forEach(function(val) { vals.push(__cdpSerializeInner(val, seen)); });
    return { set: vals };
  }

  if (Array.isArray(v)) {
    return { a: v.map(function(item) { return __cdpSerializeInner(item, seen); }), id: 0 };
  }

  if (typeof v === 'object') {
    if (typeof Window === 'function' && v instanceof Window) return 'ref: <Window>';
    if (typeof Document === 'function' && v instanceof Document) return 'ref: <Document>';
    if (typeof Node === 'function' && v instanceof Node) return 'ref: <Node>';

    var o = [];
    for (var name in v) {
      if (!Object.prototype.hasOwnProperty.call(v, name)) continue;
      var item;
      try { item = v[name]; } catch (err) { continue; }
      o.push({ k: name, v: __cdpSerializeInner(item, seen) });
    }
    return { o: o, id: 0 };
  }

  if (typeof v === 'function') {
    return { s: v.toString() };
  }

  return { v: 'undefined' };
}
`;

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Helper to fail with CdpError wrapping EvaluationError. */
const failEvaluation = (description: string) =>
  Effect.fail(
    new CdpError({
      source: "CdpPage",
      method: "evaluateHandle",
      reason: new EvaluationError({ description }),
    }),
  );

/**
 * Extracts a human-readable error message from CDP exceptionDetails.
 * Mirrors the same helper in `Evaluate.ts`.
 */
const extractExceptionText = (details: {
  text: string;
  exception?: { description?: string; value?: unknown };
}): string => {
  if (details.exception) {
    if (details.exception.description) return details.exception.description;
    if (details.exception.value !== undefined) return String(details.exception.value);
  }
  return details.text;
};

/**
 * Deserializes the result from a CDP `RemoteObject`. Same semantics as
 * `Evaluate.ts#deserializeResult`.
 */
const deserializeResult = <T>(remoteObj: {
  value?: unknown;
  objectId?: string;
  type: string;
}): Effect.Effect<T, CdpError> => {
  const value = remoteObj.value;
  if (value === undefined || value === null) {
    if (remoteObj.type === "undefined") return Effect.succeed(undefined as T);
    if (value === null) return Effect.succeed(null as T);
    return Effect.succeed(undefined as T);
  }
  if (isSerializedValue(value as SerializedValue)) {
    return Effect.succeed(parseSerializedResult(value as SerializedValue) as T);
  }
  return Effect.succeed(value as T);
};

/**
 * Catches and translates connection-level errors from CDP calls. Same
 * pattern as `Evaluate.ts`.
 */
const catchCallError =
  (method: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, CdpError, R> =>
    effect.pipe(
      Effect.catch((cause) => {
        const msg = getErrorMessage(cause);
        if (
          msg.includes("context") ||
          msg.includes("Execution context") ||
          msg.includes("Cannot find context") ||
          msg.includes("Session closed") ||
          msg.includes("navigated") ||
          msg.includes("Inspected target")
        ) {
          return failEvaluation(
            `Execution context was destroyed, most likely because of a navigation: ${msg}`,
          );
        }
        return failEvaluation(`CDP ${method} failed: ${msg}`);
      }),
    );

// ── Object-Handle Factory ──────────────────────────────────────────────────────

/**
 * Counter for generating unique synthetic primitive-handle IDs.
 */
let primitiveHandleCounter = 0;

/**
 * Builds a {@link CdpPrimitiveHandle} wrapping a primitive value. Used
 * by `evaluateHandlePage` when CDP returns a primitive result (no
 * `objectId`).
 *
 * `conn` and `sessionId` are needed for the `evaluate` and
 * `evaluateHandle` methods (which re-run the function in the browser
 * with the primitive value inlined as a literal). `jsonValue` returns
 * the value directly with no CDP round-trip. Operations that require a
 * real object reference (`getProperty`, `getProperties`, `asElement`)
 * either return an empty map / null, or fail with `EvaluationError`.
 */
export const makePrimitiveHandle = (
  conn: CdpConnection["Service"],
  sessionId: string,
  value: unknown,
): CdpPrimitiveHandle => {
  primitiveHandleCounter += 1;
  return {
    __kind: "primitive",
    objectId: `__cdp_primitive_${primitiveHandleCounter}_${Date.now()}`,
    __primitiveValue: value,
    dispose: () => Effect.void,
    evaluate: <T>(pageFunction: string | ((value: unknown, ...args: any[]) => T), arg?: unknown) =>
      Effect.gen(function* () {
        const isFunction = Predicate.isFunction(pageFunction);
        const fnSource = isFunction ? pageFunction.toString() : pageFunction;
        // Build an expression that inlines the primitive value as a
        // literal and invokes the user's function. Using
        // `Runtime.evaluate` (not `callFunctionOn`) since there's no
        // remote object to bind `this` to.
        const argLiteral = arg !== undefined ? serializeForBrowser(arg) : "undefined";
        const expression = isFunction
          ? `(() => { const __fn = (${fnSource}); return __fn(${JSON.stringify(value)}, ${argLiteral}); })()`
          : `(() => (0, eval)(${JSON.stringify(fnSource.trim())}))()`;
        const evaluateResult = yield* catchCallError("Runtime.evaluate")(
          conn.cdp.Runtime.evaluate(
            {
              expression,
              returnByValue: true,
              awaitPromise: true,
              allowUnsafeEvalBlockedByCSP: true,
            },
            sessionId,
          ),
        );
        if (evaluateResult.exceptionDetails) {
          return yield* failEvaluation(extractExceptionText(evaluateResult.exceptionDetails));
        }
        const remoteObj = evaluateResult.result;
        if (!remoteObj) {
          return yield* failEvaluation("handle.evaluate: missing result");
        }
        return yield* deserializeResult<Awaited<T>>(remoteObj);
      }),
    evaluateHandle: <T>(
      pageFunction: string | ((value: unknown, ...args: any[]) => T),
      arg?: unknown,
    ) =>
      Effect.gen(function* () {
        const isFunction = Predicate.isFunction(pageFunction);
        const fnSource = isFunction ? pageFunction.toString() : pageFunction;
        const argLiteral = arg !== undefined ? serializeForBrowser(arg) : "undefined";
        // Same as `evaluate` but with `returnByValue: false` so we can
        // wrap the result as a handle. The inlined value is the
        // primitive; the function returns the actual result object.
        const expression = isFunction
          ? `(() => { const __fn = (${fnSource}); return __fn(${JSON.stringify(value)}, ${argLiteral}); })()`
          : `(() => (0, eval)(${JSON.stringify(fnSource.trim())}))()`;
        const evaluateResult = yield* catchCallError("Runtime.evaluate")(
          conn.cdp.Runtime.evaluate(
            {
              expression,
              returnByValue: false,
              awaitPromise: true,
              allowUnsafeEvalBlockedByCSP: true,
            },
            sessionId,
          ),
        );
        if (evaluateResult.exceptionDetails) {
          return yield* failEvaluation(extractExceptionText(evaluateResult.exceptionDetails));
        }
        const remoteObj = evaluateResult.result;
        if (!remoteObj) {
          return yield* failEvaluation("handle.evaluateHandle: missing result");
        }
        if (remoteObj.objectId) {
          return makeCdpHandle(conn, sessionId, remoteObj.objectId);
        }
        return makePrimitiveHandle(conn, sessionId, remoteObj.value);
      }),
    jsonValue: () => Effect.succeed(value),
    getProperties: () => Effect.succeed(new Map() as ReadonlyMap<string, CdpHandle>),
    getProperty: (_name: string) =>
      failEvaluation("Primitive handles have no properties — use jsonValue() to read the value"),
    asElement: () => Effect.succeed(null),
  };
};

/**
 * Builds a {@link CdpObjectHandle} bound to a CDP object. Used
 * internally by `evaluateHandlePage` and by `getProperty` /
 * `getProperties`.
 */
export const makeCdpHandle = (
  conn: CdpConnection["Service"],
  sessionId: string,
  objectId: string,
): CdpObjectHandle => {
  // Closure-shared helpers for the handle's methods.
  const release = (): Effect.Effect<void, CdpError> =>
    conn.cdp.Runtime.releaseObject({ objectId }, sessionId).pipe(
      Effect.catch((cause) =>
        failEvaluation(`Failed to release handle ${objectId}: ${getErrorMessage(cause)}`),
      ),
      Effect.as(undefined),
    );

  /**
   * Build a `Runtime.callFunctionOn` declaration that runs `pageFunction`
   * with `this` bound to the handle's value and `__arg` as the second
   * argument. Returns a new object/primitive handle for the result.
   *
   * `returnByValue` controls whether to inline-evaluate the result
   * (`true` for `evaluate`) or return a handle (`false` for
   * `evaluateHandle`).
   */
  const buildObjectCallDeclaration = (
    pageFunction: string | ((value: unknown, ...args: any[]) => unknown),
    arg: unknown,
  ): { functionDeclaration: string; argEntries: Array<Protocol.Runtime.CallArgument> } => {
    const fnSource = Predicate.isFunction(pageFunction) ? pageFunction.toString() : pageFunction;
    const callExpr = Predicate.isFunction(pageFunction)
      ? `(${fnSource}).call(this, __handle, __arg)`
      : `(0, eval)(${JSON.stringify(fnSource)})`;

    const functionDeclaration = `function() {
${HANDLE_RESOLVER_CODE}
var __handle = this;
var __arg = arguments[0];
return ${callExpr};
}`;

    const argEntries: Array<Protocol.Runtime.CallArgument> = [];
    if (arg !== undefined) {
      argEntries.push({ value: serializeForBrowser(arg) });
    }
    return { functionDeclaration, argEntries };
  };

  /**
   * Wraps the result of a `Runtime.callFunctionOn` call as a `CdpHandle`
   * (object or primitive). Used by `evaluateHandle` on the handle.
   */
  const wrapCallResult = (
    remoteObj: { value?: unknown; objectId?: string; type: string } | undefined,
  ): CdpHandle => {
    if (!remoteObj) {
      // Should not happen — callFunctionOn always returns a result.
      return makePrimitiveHandle(conn, sessionId, undefined);
    }
    if (remoteObj.objectId) {
      return makeCdpHandle(conn, sessionId, remoteObj.objectId);
    }
    return makePrimitiveHandle(conn, sessionId, remoteObj.value);
  };

  return {
    __kind: "object",
    objectId,
    dispose: release,
    evaluate: <T>(pageFunction: string | ((value: unknown, ...args: any[]) => T), arg?: unknown) =>
      Effect.gen(function* () {
        const { functionDeclaration, argEntries } = buildObjectCallDeclaration(pageFunction, arg);
        const callResult = yield* catchCallError("Runtime.callFunctionOn")(
          conn.cdp.Runtime.callFunctionOn(
            {
              functionDeclaration,
              objectId,
              arguments: argEntries,
              returnByValue: true,
              awaitPromise: true,
            },
            sessionId,
          ),
        );
        if (callResult.exceptionDetails) {
          return yield* failEvaluation(extractExceptionText(callResult.exceptionDetails));
        }
        const remoteObj = callResult.result;
        if (!remoteObj) {
          return yield* failEvaluation("handle.evaluate: missing result");
        }
        return yield* deserializeResult<Awaited<T>>(remoteObj);
      }),
    evaluateHandle: <T>(
      pageFunction: string | ((value: unknown, ...args: any[]) => T),
      arg?: unknown,
    ) =>
      Effect.gen(function* () {
        const { functionDeclaration, argEntries } = buildObjectCallDeclaration(pageFunction, arg);
        const callResult = yield* catchCallError("Runtime.callFunctionOn")(
          conn.cdp.Runtime.callFunctionOn(
            {
              functionDeclaration,
              objectId,
              arguments: argEntries,
              returnByValue: false,
              awaitPromise: true,
            },
            sessionId,
          ),
        );
        if (callResult.exceptionDetails) {
          return yield* failEvaluation(extractExceptionText(callResult.exceptionDetails));
        }
        return wrapCallResult(callResult.result);
      }),
    jsonValue: () =>
      Effect.gen(function* () {
        const functionDeclaration = `function() {
${HANDLE_SERIALIZER_CODE}
return __cdpHandleSerialize(this);
}`;
        const callResult = yield* catchCallError("Runtime.callFunctionOn")(
          conn.cdp.Runtime.callFunctionOn(
            {
              functionDeclaration,
              objectId,
              arguments: [],
              returnByValue: true,
              awaitPromise: true,
            },
            sessionId,
          ),
        );
        if (callResult.exceptionDetails) {
          return yield* failEvaluation(extractExceptionText(callResult.exceptionDetails));
        }
        const remoteObj = callResult.result;
        if (!remoteObj) {
          return yield* failEvaluation("handle.jsonValue: missing result");
        }
        return yield* deserializeResult<unknown>(remoteObj);
      }),
    getProperties: () =>
      Effect.gen(function* () {
        // Use ownProperties: false so we include prototype chain, matching
        // upstream Playwright's behaviour (see
        // `jshandle-properties.spec.ts - should return even non-own properties`).
        const propsResult = yield* catchCallError("Runtime.getProperties")(
          conn.cdp.Runtime.getProperties(
            { objectId, ownProperties: false, generatePreview: false },
            sessionId,
          ),
        );
        if (propsResult.exceptionDetails) {
          return yield* failEvaluation(extractExceptionText(propsResult.exceptionDetails));
        }
        const out = new Map<string, CdpHandle>();
        for (const prop of propsResult.result) {
          if (!prop.value) continue;
          if (prop.value.objectId) {
            out.set(prop.name, makeCdpHandle(conn, sessionId, prop.value.objectId));
          } else {
            // Primitive-valued property — return a primitive handle
            // holding the raw value.
            out.set(prop.name, makePrimitiveHandle(conn, sessionId, prop.value.value));
          }
        }
        return out;
      }),
    getProperty: (name: string) =>
      Effect.gen(function* () {
        const propsResult = yield* catchCallError("Runtime.getProperties")(
          conn.cdp.Runtime.getProperties(
            { objectId, ownProperties: true, generatePreview: false },
            sessionId,
          ),
        );
        if (propsResult.exceptionDetails) {
          return yield* failEvaluation(extractExceptionText(propsResult.exceptionDetails));
        }
        const prop = propsResult.result.find(
          (p: Protocol.Runtime.PropertyDescriptor) => p.name === name,
        );
        if (!prop || !prop.value) {
          return yield* failEvaluation(`Handle has no property "${name}"`);
        }
        if (prop.value.objectId) {
          return makeCdpHandle(conn, sessionId, prop.value.objectId);
        }
        // Primitive property — return a primitive handle with the value.
        return makePrimitiveHandle(conn, sessionId, prop.value.value);
      }),
    asElement: () =>
      Effect.gen(function* () {
        // Use `Runtime.callFunctionOn` to check `this instanceof Node`.
        // If true, the result is a real DOM node and we return the same
        // handle (since `browser-cdp` is locator-only — there's no ElementHandle).
        // If false, we return null.
        const functionDeclaration = `function() {
  if (typeof Node === 'function' && this instanceof Node) {
    return true;
  }
  return false;
}`;
        const callResult = yield* catchCallError("Runtime.callFunctionOn")(
          conn.cdp.Runtime.callFunctionOn(
            {
              functionDeclaration,
              objectId,
              arguments: [],
              returnByValue: true,
              awaitPromise: true,
            },
            sessionId,
          ),
        );
        if (callResult.exceptionDetails) {
          return yield* failEvaluation(extractExceptionText(callResult.exceptionDetails));
        }
        const isNode = callResult.result?.value === true;
        return isNode ? (makeCdpHandle(conn, sessionId, objectId) as CdpHandle) : null;
      }),
  };
};

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Executes a JavaScript function or expression in the page's main world
 * and returns a `CdpHandle` referencing the result.
 *
 * Uses `Runtime.evaluate` without `returnByValue: true` so the result
 * is returned as a `RemoteObject` with an `objectId` — the handle.
 *
 * Mirrors Playwright's `page.evaluateHandle`. If the result is a
 * primitive (no `objectId`), a {@link CdpPrimitiveHandle} is returned
 * so the user can still call `jsonValue()` or pass the handle to a
 * subsequent `evaluate` (where the value is inlined as a literal).
 */
export const evaluateHandlePage = (
  conn: CdpConnection["Service"],
  state: PageState,
  pageFunction: string | ((...args: any[]) => unknown),
  arg?: unknown,
): Effect.Effect<CdpHandle, CdpError> =>
  Effect.gen(function* () {
    const sessionId = yield* ensureSession(state);

    // Serialize arg if provided. Handles are not supported here — `evaluateHandle`
    // is the producer, not the consumer. Use `page.evaluate(fn, handle)` to
    // consume a handle.
    const serializedArgs = yield* Effect.try({
      try: () => (arg !== undefined ? serializeForBrowser(arg) : ""),
      catch: (e) =>
        new CdpError({
          source: "CdpPage",
          method: "evaluateHandle",
          reason: new EvaluationError({ description: getErrorMessage(e) }),
        }),
    });
    const isFunction = Predicate.isFunction(pageFunction);

    // Build the evaluation expression. Same shape as `evaluatePage` but
    // the result is left as a RemoteObject (no `returnByValue`).
    const fnSource = isFunction ? pageFunction.toString() : pageFunction;
    const expression = isFunction
      ? `(() => { const __fn = (${fnSource}); return __fn(${serializedArgs}); })()`
      : `(() => (0, eval)(${JSON.stringify(fnSource.trim())}))()`;

    const evaluateResult = yield* catchCallError("Runtime.evaluate")(
      conn.cdp.Runtime.evaluate(
        {
          expression,
          returnByValue: false,
          awaitPromise: true,
          allowUnsafeEvalBlockedByCSP: true,
        },
        sessionId,
      ),
    );

    if (evaluateResult.exceptionDetails) {
      return yield* failEvaluation(extractExceptionText(evaluateResult.exceptionDetails));
    }
    const remoteObj = evaluateResult.result;
    if (!remoteObj) {
      return yield* failEvaluation("evaluateHandle: missing result");
    }
    if (remoteObj.objectId) {
      return makeCdpHandle(conn, sessionId, remoteObj.objectId);
    }
    // Primitive result — wrap in a primitive handle so the user can
    // still call `jsonValue()` or pass the handle to `evaluate(fn, h)`.
    return makePrimitiveHandle(conn, sessionId, remoteObj.value);
  });

/**
 * Frame-scoped version of {@link evaluateHandlePage}.
 *
 * Runs `pageFunction` in the frame's main world and returns a
 * `CdpHandle` referencing the result. Mirrors Playwright's
 * `frame.evaluateHandle(pageFunction, arg?)`.
 *
 * `frameId` must be a known CDP frame ID. `contextId` is the frame's
 * main world execution context.
 *
 * Implementation: uses `Runtime.evaluate` with `contextId` and
 * `returnByValue: false`. This matches the wire-format pattern of
 * `evaluateHandlePage` — utility-script injection is not needed since
 * `evaluateHandleFrame` does not consume handle args.
 */
export const evaluateHandleFrame = (
  conn: CdpConnection["Service"],
  state: PageState,
  contextId: number,
  frameId: string,
  pageFunction: string | ((...args: any[]) => unknown),
  arg?: unknown,
): Effect.Effect<CdpHandle, CdpError> =>
  Effect.gen(function* () {
    const sessionId = yield* ensureSession(state);

    // Verify the frame is still attached before evaluating.
    const frameManager = yield* Ref.get(state.frameManager);
    if (frameManager.isFrameDetached(frameId)) {
      return yield* failEvaluation(`evaluateHandleFrame: frame ${frameId} is detached`);
    }

    // Serialize arg if provided.
    const serializedArgs = yield* Effect.try({
      try: () => (arg !== undefined ? serializeForBrowser(arg) : ""),
      catch: (e) =>
        new CdpError({
          source: "CdpPage",
          method: "evaluateHandle",
          reason: new EvaluationError({ description: getErrorMessage(e) }),
        }),
    });
    const isFunction = Predicate.isFunction(pageFunction);
    const fnSource = isFunction ? pageFunction.toString() : pageFunction;
    const expression = isFunction
      ? `(() => { const __fn = (${fnSource}); return __fn(${serializedArgs}); })()`
      : `(() => (0, eval)(${JSON.stringify(fnSource.trim())}))()`;

    const evaluateResult = yield* catchCallError("Runtime.evaluate")(
      conn.cdp.Runtime.evaluate(
        {
          expression,
          contextId,
          returnByValue: false,
          awaitPromise: true,
          allowUnsafeEvalBlockedByCSP: true,
        },
        sessionId,
      ),
    );

    if (evaluateResult.exceptionDetails) {
      return yield* failEvaluation(extractExceptionText(evaluateResult.exceptionDetails));
    }
    const remoteObj = evaluateResult.result;
    if (!remoteObj) {
      return yield* failEvaluation("evaluateHandleFrame: missing result");
    }
    if (remoteObj.objectId) {
      return makeCdpHandle(conn, sessionId, remoteObj.objectId);
    }
    return makePrimitiveHandle(conn, sessionId, remoteObj.value);
  });
