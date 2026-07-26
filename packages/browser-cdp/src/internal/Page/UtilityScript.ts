/**
 * Browser-side `UtilityScript` singleton — mirrors upstream Playwright's
 * `packages/injected/src/utilityScript.ts`.
 *
 * The utility script is injected once into the page's utility world
 * (via `InjectedScript`/`Page.addScriptToEvaluateOnNewDocument`),
 * receives a stable `objectId` from CDP, and is then used as the
 * `this` binding for every `Runtime.callFunctionOn` evaluate call.
 *
 * ## Why a singleton (and not inline-per-call)?
 *
 * - **Parse once.** CDP compiles the script the first time it's
 *   injected; subsequent calls reuse the compiled `objectId`.
 * - **Single serialization boundary.** The utility script owns the
 *   browser-side serializer. Without it, every call would need to
 *   re-ship ~70 LOC of `__serialize` as a string.
 * - **Type-stable protocol.** The wire format is fixed:
 *   `argsAndHandles.slice(0, argCount)` are args; the rest are handles.
 *
 * ## Architecture
 *
 * The utility script's `evaluate(isFunction, returnByValue, expression,
 * argCount, ...argsAndHandles)` is invoked by `Evaluate.ts` via
 * `Runtime.callFunctionOn` with the utility's `objectId`. The
 * `isFunction` / `returnByValue` / `expression` / `argCount` come
 * from the call site; the args are CDP `CallArgument`s, and the
 * handles are `objectId` references — both delivered as live JS
 * values in the browser's execution context.
 *
 * Result serialization (Date / Map / Set / etc.) is handled
 * browser-side by `__utilitySerialize` (a hand-rolled JS port of
 * the vendored `serializeAsCallArgument`), and the result comes
 * back as a `SerializedValue` over the wire. The Node side then
 * uses `parseSerializedResult` (a thin wrapper around the vendored
 * `parseEvaluationResultValue`) to reconstruct the JS value.
 *
 * Differences from upstream `UtilityScript`:
 * - We drop the `isUnderTest` / `builtins` machinery (testing-only
 *   scaffolding upstream uses for clock emulation).
 * - We inline `__utilitySerialize` (no separate `isomorphic`
 *   package) — a hand-rolled port of `serializeAsCallArgument`
 *   that handles the same type catalog.
 * - We inline `__utilityParse` (no separate `isomorphic` package) —
 *   a hand-rolled port of `parseEvaluationResultValue`.
 *
 * Adapted from `repos/cloudflare-playwright/packages/injected/src/utilityScript.ts`.
 * Apache 2.0 licensed.
 */

// ── Browser-Side Source ──────────────────────────────────────────────────────

/**
 * The browser-side `UtilityScript` singleton source.
 *
 * Wrapped in an IIFE that:
 * 1. Returns the existing singleton if already installed (re-injection
 *    after navigation is a no-op).
 * 2. Defines a `UtilityScript` class with the `evaluate` method.
 * 3. Stores the instance on `globalThis.__effectUtilityScript` and
 *    returns it.
 *
 * The result of the IIFE is a `RemoteObject` whose `objectId` we cache
 * in `FrameManager` (similar to the existing `__effectInjectedScript`
 * singleton).
 */
import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, EvaluationError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { type FrameManager } from "./FrameManager.js";
import { type PageState } from "./PageState.js";

/**
 * Get or create the utility script's CDP remote object ID for a frame
 * in the **main world** (not the utility world).
 *
 * Phase P6: handle args require the utility script to live in the
 * same JavaScript world as the handles, otherwise CDP rejects the
 * call with "Argument should belong to the same JavaScript world as
 * target object". We inject a second singleton into the main world
 * so `page.evaluate(fn, handle)` works.
 */
export const getOrCreateMainWorldUtilityScript = (
  conn: CdpConnection["Service"],
  state: PageState,
  frameManager: FrameManager,
  frameId: string,
  contextId: number,
): Effect.Effect<string, CdpError> =>
  Effect.gen(function* () {
    const existingId = yield* frameManager.getMainWorldUtilityScriptObjectId(frameId);
    if (existingId !== null) return existingId;

    const sessionId = yield* ensureSession(state);

    const result = yield* conn.cdp.Runtime.evaluate(
      {
        expression: UTILITY_SCRIPT_SOURCE,
        contextId,
        returnByValue: false,
        awaitPromise: false,
        userGesture: true,
      },
      sessionId,
    ).pipe(
      Effect.mapError((cause) => {
        const msg = getErrorMessage(cause);
        return new CdpError({
          source: "CdpPage",
          method: "injectMainWorldUtilityScript",
          reason: new EvaluationError({
            description: `Failed to inject main-world utility script: ${msg}`,
          }),
        });
      }),
    );

    if (result.exceptionDetails) {
      return yield* new CdpError({
        source: "CdpPage",
        method: "injectMainWorldUtilityScript",
        reason: new EvaluationError({
          description: `Main-world utility script threw: ${
            result.exceptionDetails.exception?.description ??
            result.exceptionDetails.text ??
            "unknown error"
          }`,
        }),
      });
    }

    const objectId = result.result?.objectId;
    if (!objectId) {
      return yield* new CdpError({
        source: "CdpPage",
        method: "injectMainWorldUtilityScript",
        reason: new EvaluationError({
          description:
            "Main-world utility script did not return a remote object (missing objectId)",
        }),
      });
    }

    yield* frameManager.setMainWorldUtilityScriptObjectId(frameId, objectId);

    return objectId;
  });

export const UTILITY_SCRIPT_SOURCE = `
(function() {
  if (globalThis.__effectUtilityScript) return globalThis.__effectUtilityScript;

  // ── Browser-Side Serializer (port of serializeAsCallArgument) ─────
  // Hand-rolled JS port of the vendored utilityScriptSerializers.ts
  // serializeAsCallArgument. Handles the same type catalog.
  var __utilitySerialize = function(value, visited) {
    visited = visited || new Map();
    if (value && typeof value === 'object') {
      if (typeof globalThis.Window === 'function' && value instanceof globalThis.Window)
        return 'ref: <Window>';
      if (typeof globalThis.Document === 'function' && value instanceof globalThis.Document)
        return 'ref: <Document>';
      if (typeof globalThis.Node === 'function' && value instanceof globalThis.Node)
        return 'ref: <Node>';
    }
    if (typeof value === 'symbol') return { v: 'undefined' };
    if (Object.is(value, undefined)) return { v: 'undefined' };
    if (Object.is(value, null)) return { v: 'null' };
    if (Object.is(value, NaN)) return { v: 'NaN' };
    if (Object.is(value, Infinity)) return { v: 'Infinity' };
    if (Object.is(value, -Infinity)) return { v: '-Infinity' };
    if (Object.is(value, -0)) return { v: '-0' };
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return value;
    if (typeof value === 'bigint') return { bi: value.toString() };

    if (value instanceof Error) {
      var stack;
      if (value.stack && value.stack.startsWith(value.name + ': ' + value.message)) {
        stack = value.stack;
      } else {
        stack = value.name + ': ' + value.message + '\\n' + (value.stack || '');
      }
      return { e: { n: value.name, m: value.message, s: stack } };
    }
    if (value instanceof Date) return { d: value.toJSON() };
    if (value instanceof URL) return { u: value.toJSON() };
    if (value instanceof RegExp) return { r: { p: value.source, f: value.flags } };
    if (value instanceof Map) {
      var entries = [];
      value.forEach(function(val, key) {
        entries.push([__utilitySerialize(key, visited), __utilitySerialize(val, visited)]);
      });
      return { m: entries };
    }
    if (value instanceof Set) {
      var vals = [];
      value.forEach(function(val) { vals.push(__utilitySerialize(val, visited)); });
      return { set: vals };
    }

    var typedArrayConstructors = {
      i8: Int8Array, ui8: Uint8Array, ui8c: Uint8ClampedArray,
      i16: Int16Array, ui16: Uint16Array, i32: Int32Array, ui32: Uint32Array,
      f32: Float32Array, f64: Float64Array, bi64: BigInt64Array, bui64: BigUint64Array
    };
    for (var tk in typedArrayConstructors) {
      if (value instanceof typedArrayConstructors[tk]) {
        var binary = '';
        var bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        for (var bi = 0; bi < bytes.length; bi++) binary += String.fromCharCode(bytes[bi]);
        return { ta: { b: btoa(binary), k: tk } };
      }
    }
    if (value instanceof ArrayBuffer) {
      var binary = '';
      var bytes = new Uint8Array(value);
      for (var bi = 0; bi < bytes.length; bi++) binary += String.fromCharCode(bytes[bi]);
      return { ab: { b: btoa(binary) } };
    }

    var id = visited.get(value);
    if (id) return { ref: id };
    if (Array.isArray(value)) {
      var arrId = visited.size + 1;
      visited.set(value, arrId);
      var a = [];
      for (var i = 0; i < value.length; i++) a.push(__utilitySerialize(value[i], visited));
      return { a: a, id: arrId };
    }
    if (typeof value === 'object') {
      var objId = visited.size + 1;
      visited.set(value, objId);
      var o = [];
      for (var name of Object.keys(value)) {
        var item;
        try { item = value[name]; } catch (e) { continue; }
        o.push({ k: name, v: __utilitySerialize(item, visited) });
      }
      return { o: o, id: objId };
    }
    if (typeof value === 'function') return { s: value.toString() };
    return { v: 'undefined' };
  };

  // ── Browser-Side Deserializer (port of parseEvaluationResultValue) ─
  // Decodes SerializedValue → JS value. Includes ref resolution and
  // handle lookup (we don't use handles, but the parameter is kept
  // for parity with upstream).
  var __utilityParse = function(value, handles, refs) {
    refs = refs || new Map();
    if (Object.is(value, undefined)) return undefined;
    if (typeof value === 'object' && value !== null) {
      if ('ref' in value) return refs.get(value.ref);
      if ('v' in value) {
        if (value.v === 'undefined') return undefined;
        if (value.v === 'null') return null;
        if (value.v === 'NaN') return NaN;
        if (value.v === 'Infinity') return Infinity;
        if (value.v === '-Infinity') return -Infinity;
        if (value.v === '-0') return -0;
        return undefined;
      }
      if ('d' in value) return new Date(value.d);
      if ('u' in value) return new URL(value.u);
      if ('bi' in value) return BigInt(value.bi);
      if ('e' in value) {
        var err = new Error(value.e.m);
        err.name = value.e.n;
        err.stack = value.e.s;
        return err;
      }
      if ('r' in value) return new RegExp(value.r.p, value.r.f);
      if ('m' in value) {
        var m = new Map();
        for (var i = 0; i < value.m.length; i++) {
          m.set(__utilityParse(value.m[i][0], handles, refs),
                __utilityParse(value.m[i][1], handles, refs));
        }
        return m;
      }
      if ('set' in value) {
        var s = new Set();
        for (var i = 0; i < value.set.length; i++) {
          s.add(__utilityParse(value.set[i], handles, refs));
        }
        return s;
      }
      if ('a' in value) {
        var arr = [];
        refs.set(value.id, arr);
        for (var i = 0; i < value.a.length; i++) {
          arr.push(__utilityParse(value.a[i], handles, refs));
        }
        return arr;
      }
      if ('o' in value) {
        var obj = {};
        refs.set(value.id, obj);
        for (var i = 0; i < value.o.length; i++) {
          var k = value.o[i].k;
          if (k === '__proto__') continue;
          obj[k] = __utilityParse(value.o[i].v, handles, refs);
        }
        return obj;
      }
      if ('h' in value) return handles[value.h];
      if ('ta' in value) {
        var taCtors = {
          i8: Int8Array, ui8: Uint8Array, ui8c: Uint8ClampedArray,
          i16: Int16Array, ui16: Uint16Array, i32: Int32Array, ui32: Uint32Array,
          f32: Float32Array, f64: Float64Array, bi64: BigInt64Array, bui64: BigUint64Array
        };
        var binary = atob(value.ta.b);
        var bytes = new Uint8Array(binary.length);
        for (var bi = 0; bi < binary.length; bi++) bytes[bi] = binary.charCodeAt(bi);
        return new taCtors[value.ta.k](bytes.buffer);
      }
      if ('ab' in value) {
        var binary = atob(value.ab.b);
        var bytes = new Uint8Array(binary.length);
        for (var bi = 0; bi < binary.length; bi++) bytes[bi] = binary.charCodeAt(bi);
        return bytes.buffer;
      }
    }
    return value;
  };

  // ── Promise-Aware JSON Serialization ───────────────────────────────
  // Mirrors upstream's \`_promiseAwareJsonValueNoThrow\`. Serializes a
  // value to JSON-safe form, awaiting Promises so the result can be
  // returnByValue'd.
  var __safeSerialize = function(value) {
    try {
      if (value && typeof value === 'object' && typeof value.then === 'function') {
        return (async function() {
          // Native Promise — wrapped so the browser/CDP recognizes it.
          var promiseValue = await value;
          return __utilitySerialize(promiseValue, new Map());
        })();
      }
      return __utilitySerialize(value, new Map());
    } catch (e) {
      return { v: 'undefined' };
    }
  };

  // ── UtilityScript Class ────────────────────────────────────────────
  function UtilityScript() {
    this.global = globalThis;
  }

  UtilityScript.prototype.evaluate = function(isFunction, returnByValue, expression, argCount, ...argsAndHandles) {
    var argValues = argsAndHandles.slice(0, argCount);
    var handles = argsAndHandles.slice(argCount);
    var parameters = [];
    for (var i = 0; i < argValues.length; i++) {
      parameters[i] = __utilityParse(argValues[i], handles, new Map());
    }

    var result = this.global.eval(expression);
    if (isFunction === true) {
      result = result.apply(null, parameters);
    } else if (isFunction === false) {
      result = result;
    } else {
      // auto-detect
      if (typeof result === 'function') {
        result = result.apply(null, parameters);
      }
    }
    if (returnByValue) {
      return __safeSerialize(result);
    }
    return result;
  };

  UtilityScript.prototype.jsonValue = function(returnByValue, value) {
    if (value === undefined) return undefined;
    return __utilitySerialize(value, new Map());
  };

  var instance = new UtilityScript();
  globalThis.__effectUtilityScript = instance;
  return instance;
})();
`;

// ── Singleton Name ───────────────────────────────────────────────────────────

/**
 * The global name used by the browser-side utility script to expose
 * itself. Used by `InjectedScript` for bootstrap checks and by tests.
 */
// fallow-ignore-next-line unused-export
export const UTILITY_SCRIPT_GLOBAL_NAME = "__effectUtilityScript";
