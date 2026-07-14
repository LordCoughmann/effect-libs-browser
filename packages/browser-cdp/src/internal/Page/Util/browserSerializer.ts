/**
 * Internal browser-side serializer for paths that don't go through the
 * utility script.
 *
 * Used by:
 * - `Bindings.ts` (the page-side bindings controller, which serializes
 *   arg values before posting them to Node via `Runtime.bindingCalled`)
 * - `EvaluateHandle.ts` (the JSHandle `jsonValue()` and primitive-handle
 *   `evaluate` paths, which use direct `Runtime.evaluate` with JS
 *   expression inlining rather than going through the utility script)
 *
 * The Phase P6 refactor collapsed the main `page.evaluate` pipeline
 * to upstream's `Runtime.callFunctionOn` + `UtilityScript` pattern,
 * which uses `SerializedValue` as the wire format. The utility script
 * handles serialization in the browser (via its inlined
 * `__utilitySerialize`). The paths in this file don't go through the
 * utility script — they either:
 *   (a) live in the page itself (the bindings controller, injected
 *       via `Page.addScriptToEvaluateOnNewDocument`), or
 *   (b) target the handle as `this` (which `Runtime.callFunctionOn`
 *       supports but the utility script doesn't, because the utility
 *       script's `this` IS the utility script).
 *
 * So this file keeps the in-house `__serialize` browser-side serializer
 * and the JS-expression-inlining wrapper around the vendored
 * `serializeAsCallArgument`. Future work could collapse both paths to
 * use the utility script; for now, they're isolated here.
 *
 * This file is NOT exported from the package's public API.
 */
/* eslint-disable effect/prefer-effect-is, effect/prefer-arr-match */
// oxlint-disable-file effect/prefer-effect-is, effect/prefer-arr-match -- vendored from Playwright; keep typeof for parity

// ── In-house JS-Expression-Inlining Serializer ───────────────────────────────

/**
 * Validates that a value (and all nested values) can be serialized.
 * Throws an error if any function is found, matching Playwright's behavior
 * in protocol/serializers.ts where functions cause a serialization error.
 *
 * @param value - The value to validate
 * @param path - Access chain for error messages (e.g. "a.inner.property")
 */
// oxlint-disable-next-line effect/prefer-effect-is -- this file is ported from Playwright vendored code; keep `typeof` checks for parity
const validateSerializable = (value: unknown, path: Array<string | number> = []): void => {
  if (value === null || value === undefined) return;
  if (typeof value === "function") {
    const pathStr =
      path.length > 0
        ? ` at position "${path.map((p, i) => (typeof p === "number" ? `[${p}]` : i > 0 ? `.${p}` : p)).join("")}"`
        : "";
    throw new Error(`Attempting to serialize unexpected value${pathStr}: ${value}`);
  }
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        validateSerializable(value[i], [...path, i]);
      }
    } else {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        let item: unknown;
        try {
          item = (value as Record<string, unknown>)[key];
        } catch {
          // native bindings may throw on property access — skip
          continue;
        }
        validateSerializable(item, [...path, key]);
      }
    }
  }
};

/**
 * Converts a SerializedValue to a JavaScript expression string.
 * This generates JavaScript code that can be evaluated in the browser
 * to recreate the original value.
 *
 * Repeated references (`{ref: id}` markers from `serializeAsCallArgument`)
 * are substituted with the previously-built inline expression. This
 * produces fresh JS literals at each use site (so deep-equal values
 * round-trip correctly), but does NOT preserve live JS object identity —
 * cycles resolve as the in-progress parent's `undefined`. This matches
 * Playwright's deep-equality semantics for the
 * "should accept same nested object multiple times" test.
 */
const serializedValueToJsExpression = (value: unknown): string => {
  // Map<id, JS expression> for resolving {ref: id} markers inline.
  // Populated lazily as we encounter {a, id} or {o, id} entries.
  // Shared across the recursive descent so ref lookups can resolve.
  const refs = new Map<number, string>();

  const build = (v: unknown): string => {
    // Handle primitives directly
    if (v === undefined) return "undefined";
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return String(v);

    if (typeof v === "object" && v !== null) {
      // Special values: undefined, null, NaN, Infinity, -Infinity, -0
      if ("v" in v) {
        return (v as { v: string }).v;
      }

      // BigInt
      if ("bi" in v) {
        return `BigInt("${(v as { bi: string }).bi}")`;
      }

      // Date
      if ("d" in v) {
        return `new Date("${(v as { d: string }).d}")`;
      }

      // URL
      if ("u" in v) {
        return `new URL("${(v as { u: string }).u}")`;
      }

      // RegExp
      if ("r" in v) {
        return `/${(v as { r: { p: string; f: string } }).r.p}/${(v as { r: { p: string; f: string } }).r.f}`;
      }

      // Error
      if ("e" in v) {
        const { n, m, s } = (v as { e: { n: string; m: string; s: string } }).e;
        return `(() => { const e = new Error(${JSON.stringify(m)}); e.name = ${JSON.stringify(
          n,
        )}; e.stack = ${JSON.stringify(s)}; return e; })()`;
      }

      // Map
      if ("m" in v) {
        const m = v as { m: Array<[unknown, unknown]> };
        const entries = m.m.map(([k, val]) => `[${build(k)},${build(val)}]`).join(",");
        return `new Map([${entries}])`;
      }

      // Set
      if ("set" in v) {
        const set = v as { set: unknown[] };
        const values = set.set.map((val) => build(val)).join(",");
        return `new Set([${values}])`;
      }

      // Array — emit literal, register for ref substitution
      if ("a" in v) {
        const a = v as { a: unknown[]; id: number };
        const cached = refs.get(a.id);
        if (cached !== undefined) return cached;
        const items = a.a.map((item) => build(item)).join(",");
        const expr = `[${items}]`;
        refs.set(a.id, expr);
        return expr;
      }

      // Object — emit literal, register for ref substitution
      if ("o" in v) {
        const o = v as { o: Array<{ k: string; v: unknown }>; id: number };
        const cached = refs.get(o.id);
        if (cached !== undefined) return cached;
        const entries = o.o.map(({ k, v: val }) => `${JSON.stringify(k)}:${build(val)}`).join(",");
        const expr = `{${entries}}`;
        refs.set(o.id, expr);
        return expr;
      }

      // Repeated reference — substitute with previously-emitted literal.
      // Should be unreachable in practice (`serializeAsCallArgument` always
      // emits the definition first), but handle gracefully.
      if ("ref" in v) {
        return refs.get((v as { ref: number }).ref) ?? "undefined";
      }

      // Handle handle (shouldn't happen in top-level serialization)
      if ("h" in v) {
        return `undefined /* handle:${(v as { h: number }).h} */`;
      }

      // TypedArray
      if ("ta" in v) {
        const { b, k } = (v as { ta: { b: string; k: string } }).ta;
        const ctor: Record<string, string> = {
          i8: "Int8Array",
          ui8: "Uint8Array",
          ui8c: "Uint8ClampedArray",
          i16: "Int16Array",
          ui16: "Uint16Array",
          ui32: "Uint32Array",
          i32: "Int32Array",
          f32: "Float32Array",
          f64: "Float64Array",
          bi64: "BigInt64Array",
          bui64: "BigUint64Array",
        };
        return `new ${ctor[k]}(Uint8Array.from(atob("${b}"), c => c.charCodeAt(0)).buffer)`;
      }

      // ArrayBuffer
      if ("ab" in v) {
        return `Uint8Array.from(atob("${(v as { ab: { b: string } }).ab.b}"), c => c.charCodeAt(0)).buffer`;
      }
    }

    // Fallback
    return "undefined";
  };

  return build(value);
};

/**
 * Serializes a value for passing to browser evaluate.
 * Converts a JavaScript value to a JavaScript expression string that can be
 * evaluated in the browser to recreate the value.
 *
 * Throws an error if the value contains any functions, matching Playwright's
 * client-side serialization behavior.
 *
 * @param value - The value to serialize
 * @returns JavaScript expression string that recreates the value in the browser
 */
export const serializeForBrowser = (value: unknown): string => {
  validateSerializable(value);
  return serializedValueToJsExpression(serializeAsCallArgument(value, (v) => ({ fallThrough: v })));
};

// ── Browser-Side Serializer Code ────────────────────────────────────────────

/**
 * JavaScript code to inject into the browser for serializing results.
 *
 * This is a browser-compatible version of Playwright's serialization logic.
 * The `__serialize` function converts JavaScript values to the SerializedValue
 * format that can be safely JSON-stringified and parsed back on the Node side.
 *
 * Id tracking: arrays and plain objects are assigned unique ids (`id: N`)
 * the first time they are encountered. Subsequent visits emit `{ref: N}`
 * so the deserializer can re-resolve the same live object.
 *
 * Cycles are also handled: the id is allocated BEFORE recursing into
 * members, so a self-reference inside an object emits `{ref: own_id}`
 * which the deserializer resolves back to the in-progress parent.
 */
export const BROWSER_SERIALIZER_CODE = `
function __serialize(v) {
  return __innerSerialize(v, new Map(), { id: 1 });
}

function __innerSerialize(v, visited, counter) {
  // Primitives
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

  // Id tracking for arrays and plain objects — emit {ref: id} for repeats.
  // counter is an object (not a number) so the id increments propagate
  // through the recursive calls.
  if (typeof v === 'object' && v !== null) {
    const existingId = visited.get(v);
    if (existingId !== undefined) return { ref: existingId };
  }

  // Special objects (no id tracking — repeated references are serialized fresh)
  if (v instanceof Date) return { d: v.toISOString() };
  if (v instanceof URL) return { u: v.toString() };
  if (v instanceof RegExp) return { r: { p: v.source, f: v.flags } };
  if (v instanceof Error) {
    let stack;
    if (v.stack && v.stack.startsWith(v.name + ': ' + v.message)) {
      stack = v.stack;
    } else {
      stack = v.name + ': ' + v.message + '\\n' + (v.stack || '');
    }
    return { e: { n: v.name, m: v.message, s: stack } };
  }

  // TypedArrays
  const typedArrayTypes = {
    i8: Int8Array, ui8: Uint8Array, ui8c: Uint8ClampedArray,
    i16: Int16Array, ui16: Uint16Array, i32: Int32Array, ui32: Uint32Array,
    f32: Float32Array, f64: Float64Array, bi64: BigInt64Array, bui64: BigUint64Array
  };
  for (const [k, ctor] of Object.entries(typedArrayTypes)) {
    if (v instanceof ctor) {
      const binary = Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
        .map(b => String.fromCharCode(b)).join('');
      return { ta: { b: btoa(binary), k } };
    }
  }

  // ArrayBuffer
  if (v instanceof ArrayBuffer) {
    const binary = Array.from(new Uint8Array(v)).map(b => String.fromCharCode(b)).join('');
    return { ab: { b: btoa(binary) } };
  }

  // Map
  if (v instanceof Map) {
    return { m: Array.from(v.entries()).map(([k, val]) => [__innerSerialize(k, visited, counter), __innerSerialize(val, visited, counter)]) };
  }

  // Set
  if (v instanceof Set) {
    return { set: Array.from(v.values()).map(val => __innerSerialize(val, visited, counter)) };
  }

  // Array — allocate id BEFORE recursing so cycles emit {ref: own_id}
  if (Array.isArray(v)) {
    const id = counter.id++;
    visited.set(v, id);
    const a = v.map(item => __innerSerialize(item, visited, counter));
    return { a, id };
  }

  // Plain object
  if (typeof v === 'object') {
    if (typeof Window === 'function' && v instanceof Window) return 'ref: <Window>';
    if (typeof Document === 'function' && v instanceof Document) return 'ref: <Document>';
    if (typeof Node === 'function' && v instanceof Node) return 'ref: <Node>';

    const id = counter.id++;
    visited.set(v, id);
    const o = [];
    for (const name of Object.keys(v)) {
      let item;
      try { item = v[name]; } catch (e) { continue; }
      o.push({ k: name, v: __innerSerialize(item, visited, counter) });
    }
    return { o, id };
  }

  // Function
  if (typeof v === 'function') return { s: v.toString() };

  // Fallback
  return { v: 'undefined' };
}
`;

// ── Re-export from vendored utility script serializers ──────────────────────

import { serializeAsCallArgument } from "../Evaluate/serialization/utilityScriptSerializers.js";
