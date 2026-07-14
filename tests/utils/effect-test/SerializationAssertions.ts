/**
 * Serialization-aware assertions for CDP evaluate parity tests.
 *
 * These assertions handle JavaScript values that JSON.stringify cannot represent:
 * NaN, -0, Infinity, Date, RegExp, URL, Error, Map, Set, TypedArray, ArrayBuffer, BigInt.
 *
 * Built on top of EffectTest's AssertionError so failures integrate with the
 * existing test runner infrastructure.
 */

import { Effect } from "effect";

import { AssertionError } from "./EffectTest.js";

// ── Structural Equality ──────────────────────────────────────────────────────

/**
 * Object.is-aware deep comparison for JavaScript values.
 *
 * Handles: NaN, -0, Infinity, -Infinity, Date, RegExp, URL, Error,
 * Map, Set, TypedArray, ArrayBuffer, BigInt, circular refs (as undefined).
 */
const structuralEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp)
    return a.source === b.source && a.flags === b.flags;
  if (a instanceof URL && b instanceof URL) return a.toString() === b.toString();
  if (a instanceof Error && b instanceof Error) return a.name === b.name && a.message === b.message;

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k) || !structuralEqual(v, b.get(k))) return false;
    }
    return true;
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    const aVals = Array.from(a.values());
    const bVals = Array.from(b.values());
    return aVals.every((v, i) => structuralEqual(v, bVals[i]));
  }

  if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
    if (a.byteLength !== b.byteLength) return false;
    const aView = new Uint8Array(a);
    const bView = new Uint8Array(b);
    return aView.every((v, i) => v === bView[i]);
  }

  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    if (a.constructor !== b.constructor) return false;
    if (a.byteLength !== b.byteLength) return false;
    const aView = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const bView = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    return aView.every((v, i) => v === bView[i]);
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => structuralEqual(v, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => structuralEqual((a as any)[k], (b as any)[k]));
  }

  return false;
};

/**
 * Format a value for assertion error messages.
 */
const formatValue = (v: unknown): string => {
  if (v === undefined) return "undefined";
  if (typeof v === "bigint") return `${v}n`;
  if (v instanceof Date) return `Date(${v.toISOString()})`;
  if (v instanceof RegExp) return v.toString();
  if (v instanceof URL) return `URL(${v.toString()})`;
  if (v instanceof Map) return `Map(${JSON.stringify(Object.fromEntries(v))})`;
  if (v instanceof Set) return `Set(${JSON.stringify(Array.from(v))})`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

// ── Exported Assertions ──────────────────────────────────────────────────────

/**
 * Assert structural equality using Object.is-aware deep comparison.
 *
 * Unlike assertDeepEqual (JSON.stringify), this correctly handles
 * NaN, -0, Infinity, Date, RegExp, URL, Map, Set, TypedArray, etc.
 */
export const assertStructuralEqual = <T>(
  actual: T,
  expected: T,
  label?: string,
): Effect.Effect<void, AssertionError> =>
  structuralEqual(actual, expected)
    ? Effect.void
    : Effect.fail(
        new AssertionError(
          `${label ? label + ": " : ""}Expected ${formatValue(expected)}, got ${formatValue(actual)}`,
        ),
      );

/**
 * Assert using Object.is semantics (handles NaN, -0 correctly).
 */
export const assertIs = <T>(
  actual: T,
  expected: T,
  label?: string,
): Effect.Effect<void, AssertionError> =>
  Object.is(actual, expected)
    ? Effect.void
    : Effect.fail(
        new AssertionError(
          `${label ? label + ": " : ""}Expected ${formatValue(expected)}, got ${formatValue(actual)}`,
        ),
      );

/**
 * Assert that a value is an instance of the given class.
 */
export const assertInstanceOf = <T>(
  actual: unknown,
  expectedType: abstract new (...args: any[]) => T,
  label?: string,
): Effect.Effect<T, AssertionError> =>
  actual instanceof expectedType
    ? Effect.succeed(actual)
    : Effect.fail(
        new AssertionError(
          `${label ? label + ": " : ""}expected instance of ${expectedType.name}, got ${
            actual === null ? "null" : typeof actual
          }`,
        ),
      );

/**
 * Assert that a string contains a substring.
 */
export const assertStringContains = (
  haystack: string,
  needle: string,
  label?: string,
): Effect.Effect<void, AssertionError> =>
  haystack.includes(needle)
    ? Effect.void
    : Effect.fail(
        new AssertionError(`${label ? label + ": " : ""}expected string to contain "${needle}"`),
      );

/**
 * Assert that an object has a specific key.
 */
export const assertHasKey = (
  obj: object,
  key: string,
  label?: string,
): Effect.Effect<void, AssertionError> =>
  key in obj
    ? Effect.void
    : Effect.fail(
        new AssertionError(`${label ? label + ": " : ""}expected object to have key "${key}"`),
      );
