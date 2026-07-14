/**
 * Tests for CDP serialization - verifying the vendored Playwright
 * serialization works correctly via the thin Node-side adapter.
 *
 * After the Phase P6 refactor, the evaluate pipeline uses the vendored
 * `utilityScriptSerializers.ts` directly (via `serializeAsCallArgument` +
 * `parseEvaluationResultValue`). The thin `parseSerializedResult` and
 * `isSerializedValue` helpers in `serialization/index.ts` are the
 * only remaining Node-side public surface.
 *
 * We don't test the low-level Playwright serialization format - just verify
 * that `parseSerializedResult` correctly reconstructs JavaScript values
 * from `SerializedValue`.
 */

import { assert, describe, it } from "@effect/vitest";

import {
  parseSerializedResult,
  isSerializedValue,
  isSerializedError,
} from "@effect-libs/browser-cdp/serialization";

// ── parseSerializedResult ──────────────────────────────────────────────────────

describe("parseSerializedResult", () => {
  it("parses undefined", () => {
    assert.strictEqual(parseSerializedResult({ v: "undefined" }), undefined);
  });

  it("parses null", () => {
    assert.strictEqual(parseSerializedResult({ v: "null" }), null);
  });

  it("parses NaN", () => {
    assert.isTrue(Number.isNaN(parseSerializedResult({ v: "NaN" })));
  });

  it("parses Infinity", () => {
    assert.strictEqual(parseSerializedResult({ v: "Infinity" }), Infinity);
    assert.strictEqual(parseSerializedResult({ v: "-Infinity" }), -Infinity);
  });

  it("parses -0", () => {
    const result = parseSerializedResult({ v: "-0" });
    assert.isTrue(Object.is(result, -0));
  });

  it("parses primitives", () => {
    assert.strictEqual(parseSerializedResult(42), 42);
    assert.strictEqual(parseSerializedResult(true), true);
    assert.strictEqual(parseSerializedResult("hello"), "hello");
  });

  it("parses BigInt", () => {
    assert.strictEqual(parseSerializedResult({ bi: "123" }), BigInt(123));
  });

  it("parses Date", () => {
    const iso = "2024-01-15T10:30:00.000Z";
    const result = parseSerializedResult({ d: iso });
    assert.instanceOf(result, Date);
    assert.strictEqual((result as Date).toISOString(), iso);
  });

  it("parses URL", () => {
    const result = parseSerializedResult({ u: "https://example.com/path" });
    assert.instanceOf(result, URL);
    assert.strictEqual((result as URL).href, "https://example.com/path");
  });

  it("parses RegExp", () => {
    const result = parseSerializedResult({ r: { p: "test\\d+", f: "gi" } });
    assert.instanceOf(result, RegExp);
    assert.strictEqual((result as RegExp).source, "test\\d+");
    assert.strictEqual((result as RegExp).flags, "gi");
  });

  it("parses Error", () => {
    const result = parseSerializedResult({
      e: { n: "TypeError", m: "test error", s: "stack trace" },
    }) as Error;
    assert.instanceOf(result, Error);
    assert.strictEqual(result.name, "TypeError");
    assert.strictEqual(result.message, "test error");
  });

  it("parses Map", () => {
    const result = parseSerializedResult({
      m: [
        ["key1", "value1"],
        [2, 42],
      ],
    }) as Map<unknown, unknown>;
    assert.instanceOf(result, Map);
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.get("key1"), "value1");
    assert.strictEqual(result.get(2), 42);
  });

  it("parses Set", () => {
    const result = parseSerializedResult({ set: [1, 2, 3] }) as Set<unknown>;
    assert.instanceOf(result, Set);
    assert.strictEqual(result.size, 3);
    assert.isTrue(result.has(1));
    assert.isTrue(result.has(2));
    assert.isTrue(result.has(3));
  });

  it("parses array", () => {
    const result = parseSerializedResult({ a: [1, "hello", true], id: 0 });
    assert.deepStrictEqual(result, [1, "hello", true]);
  });

  it("parses object", () => {
    const result = parseSerializedResult({
      o: [
        { k: "name", v: "test" },
        { k: "value", v: 42 },
      ],
      id: 0,
    });
    assert.deepStrictEqual(result, { name: "test", value: 42 });
  });

  it("parses nested structures", () => {
    const result = parseSerializedResult({
      o: [{ k: "nested", v: { o: [{ k: "inner", v: "value" }], id: 1 } }],
      id: 0,
    });
    assert.deepStrictEqual(result, { nested: { inner: "value" } });
  });

  it("parses ArrayBuffer", () => {
    const result = parseSerializedResult({ ab: { b: "AQIDBA==" } }) as ArrayBuffer;
    assert.instanceOf(result, ArrayBuffer);
    const view = new Uint8Array(result);
    assert.deepStrictEqual(Array.from(view), [1, 2, 3, 4]);
  });

  it("parses TypedArray", () => {
    const result = parseSerializedResult({ ta: { b: "AQIDBA==", k: "ui8" } }) as Uint8Array;
    assert.instanceOf(result, Uint8Array);
    assert.deepStrictEqual(Array.from(result), [1, 2, 3, 4]);
  });
});

// ── isSerializedValue ──────────────────────────────────────────────────────────

describe("isSerializedValue", () => {
  it("identifies special value markers", () => {
    assert.isTrue(isSerializedValue({ v: "undefined" }));
    assert.isTrue(isSerializedValue({ v: "null" }));
    assert.isTrue(isSerializedValue({ v: "NaN" }));
    assert.isTrue(isSerializedValue({ v: "Infinity" }));
  });

  it("identifies BigInt marker", () => {
    assert.isTrue(isSerializedValue({ bi: "123" }));
  });

  it("identifies Date marker", () => {
    assert.isTrue(isSerializedValue({ d: "2024-01-15" }));
  });

  it("identifies URL marker", () => {
    assert.isTrue(isSerializedValue({ u: "https://example.com" }));
  });

  it("identifies RegExp marker", () => {
    assert.isTrue(isSerializedValue({ r: { p: "test", f: "g" } }));
  });

  it("identifies Error marker", () => {
    assert.isTrue(isSerializedValue({ e: { n: "Error", m: "test", s: "stack" } }));
  });

  it("identifies Map marker", () => {
    assert.isTrue(isSerializedValue({ m: [] }));
  });

  it("identifies Set marker", () => {
    assert.isTrue(isSerializedValue({ set: [] }));
  });

  it("identifies ArrayBuffer marker", () => {
    assert.isTrue(isSerializedValue({ ab: { b: "AQID" } }));
  });

  it("identifies TypedArray marker", () => {
    assert.isTrue(isSerializedValue({ ta: { b: "AQID", k: "ui8" } }));
  });

  it("identifies array marker", () => {
    assert.isTrue(isSerializedValue({ a: [1, 2, 3], id: 0 }));
  });

  it("identifies object marker", () => {
    assert.isTrue(isSerializedValue({ o: [], id: 0 }));
  });

  it("accepts primitives as serialized values", () => {
    assert.isTrue(isSerializedValue(42));
    assert.isTrue(isSerializedValue("string"));
    assert.isTrue(isSerializedValue(true));
    assert.isTrue(isSerializedValue(undefined));
  });

  it("rejects null (null is valid JSON, not a SerializedValue object)", () => {
    assert.isFalse(isSerializedValue(null));
  });

  it("rejects plain objects without markers", () => {
    assert.isFalse(isSerializedValue({}));
    assert.isFalse(isSerializedValue({ randomKey: "value" }));
  });
});

// ── isSerializedError ──────────────────────────────────────────────────────────

describe("isSerializedError", () => {
  it("identifies serialized errors", () => {
    assert.isTrue(isSerializedError({ e: { n: "Error", m: "test message", s: "stack trace" } }));
    assert.isTrue(isSerializedError({ e: { n: "TypeError", m: "not a function", s: "" } }));
  });

  it("rejects non-error serialized values", () => {
    assert.isFalse(isSerializedError({ v: "undefined" }));
    assert.isFalse(isSerializedError({ d: "2024-01-15" }));
    assert.isFalse(isSerializedError({ r: { p: "test", f: "g" } }));
  });

  it("rejects primitives", () => {
    assert.isFalse(isSerializedError(42));
    assert.isFalse(isSerializedError("string"));
    assert.isFalse(isSerializedError({ v: "null" }));
  });
});

// ── Boundary test: vendored serializeAsCallArgument + parseEvaluationResultValue

// This is the new round-trip test for the Phase P6 boundary. The previous
// in-house serialization glue (BROWSER_SERIALIZER_CODE, serializedValueToJsExpression)
// is no longer used by `page.evaluate` - the vendored Playwright
// serialization is the single source of truth.

describe("vendored serialization boundary (Phase P6)", () => {
  it("serializes then deserializes a primitive round-trip", () => {
    // Import directly from the vendored module to verify the boundary.
    // (This is the same code path that the utility script uses in the
    // browser — see UtilityScript.ts.)
    // We just verify the Node-side round-trip here.
    const primitives: unknown[] = [undefined, null, 42, "hello", true, NaN, Infinity, -0];
    for (const value of primitives) {
      const sv = serializeAsCallArgumentTest(value);
      const result = parseSerializedResult(sv as Parameters<typeof parseSerializedResult>[0]);
      if (typeof value === "number") {
        if (Number.isNaN(value)) {
          assert.isTrue(Number.isNaN(result as number));
        } else if (Object.is(value, -0)) {
          assert.isTrue(Object.is(result as number, -0));
        } else {
          assert.strictEqual(result, value);
        }
      } else {
        assert.strictEqual(result, value);
      }
    }
  });

  it("serializes then deserializes a Date round-trip", () => {
    const date = new Date("2024-01-15T10:30:00.000Z");
    const sv = serializeAsCallArgumentTest(date);
    assert.deepStrictEqual(sv, { d: "2024-01-15T10:30:00.000Z" });
    const result = parseSerializedResult(sv as Parameters<typeof parseSerializedResult>[0]);
    assert.instanceOf(result, Date);
    assert.strictEqual((result as Date).toISOString(), date.toISOString());
  });

  it("resolves {ref: id} via the refs map (identity preserved)", () => {
    // SerializedValue with refs across an object + array + nested object.
    // The vendored `parseEvaluationResultValue` populates the refs map
    // when entering {a, id} and {o, id}, then {ref: id} lookups resolve
    // to the previously-built live object.
    const sv = {
      o: [
        { k: "foo", v: { o: [{ k: "x", v: 1 }], id: 1 } },
        { k: "bar", v: { a: [{ ref: 1 }], id: 2 } },
        { k: "baz", v: { o: [{ k: "foo", v: { ref: 1 } }], id: 3 } },
      ],
      id: 4,
    };
    const result = parseSerializedResult(sv) as Record<string, unknown>;
    const foo = (result as { foo: unknown }).foo;
    const bar0 = (result as { bar: unknown[] }).bar[0];
    const bazFoo = (result as { baz: { foo: unknown } }).baz.foo;
    assert.strictEqual(foo, bar0);
    assert.strictEqual(foo, bazFoo);
  });

  it("handles cycles via the refs map", () => {
    // Self-referencing object: x = { name: "circ", self: x }
    const sv = {
      o: [
        { k: "name", v: "circ" },
        { k: "self", v: { ref: 1 } },
      ],
      id: 1,
    };
    const result = parseSerializedResult(sv) as { name: string; self: unknown };
    assert.strictEqual(result.name, "circ");
    assert.strictEqual(result.self, result);
  });
});

// ── Local helper for the vendored boundary test ─────────────────────────────

// Import the vendored serializeAsCallArgument directly to verify the
// serialization boundary. The util/browserSerializer.ts re-exports
// this function for the Bindings controller.
import { serializeAsCallArgument } from "../../../packages/browser-cdp/src/internal/Page/Evaluate/serialization/utilityScriptSerializers.js";

const serializeAsCallArgumentTest = (value: unknown) =>
  serializeAsCallArgument(value, (v) => ({ fallThrough: v }));
