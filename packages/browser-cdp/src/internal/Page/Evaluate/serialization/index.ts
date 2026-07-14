/**
 * Serialization adapter for CDP page.evaluate() arguments and results.
 *
 * Uses Playwright's vendored serialization logic (Apache 2.0 license)
 * for robust handling of JavaScript values that JSON.stringify() cannot
 * handle correctly.
 *
 * The Phase P6 refactor collapsed the evaluate pipeline to upstream's
 * `Runtime.callFunctionOn` + `UtilityScript` pattern, which uses
 * `SerializedValue` as the wire format. This file is the thin
 * Node-side adapter around the vendored `utilityScriptSerializers.ts`.
 *
 * The remaining in-house `__serialize` browser code (for the bindings
 * controller and the JSHandle `jsonValue()` path) lives in
 * `Bindings/browserSerializer.ts` and the `EvaluateHandle.ts` file
 * respectively. Both keep their JS-expression-inlining approach because
 * they don't go through the utility script.
 */

// ── Re-export from Playwright serialization ────────────────────────────────────

export { type SerializedValue } from "./utilityScriptSerializers.js";

// ── Type Imports ────────────────────────────────────────────────────────────────

import type { SerializedValue } from "./utilityScriptSerializers.js";

import { parseEvaluationResultValue } from "./utilityScriptSerializers.js";

/**
 * Parses a serialized value from the browser back to its proper JavaScript type.
 * Adapter that wraps Playwright's parseEvaluationResultValue.
 *
 * @param value - The serialized value from the browser
 * @returns The deserialized JavaScript value
 */
export const parseSerializedResult = (value: SerializedValue): unknown => {
  return parseEvaluationResultValue(value, [], new Map());
};

/**
 * Type guard to check if a value is in SerializedValue format.
 * Used to determine if we need to deserialize or if it's a plain value.
 *
 * Note: Playwright's SerializedValue format can be:
 * - A primitive (undefined, boolean, number, string)
 * - An object with a single key (v, bi, d, u, r, e, m, set, ref, h, ta, ab)
 * - An object with 'a' + 'id' keys (array serialization)
 * - An object with 'o' + 'id' keys (object serialization)
 */
export const isSerializedValue = (value: unknown): value is SerializedValue => {
  if (value === undefined) return true;
  if (value === null) return false; // null is valid JSON, not a SerializedValue object
  if (typeof value !== "object") return true; // primitives are valid SerializedValues

  const keys = Object.keys(value as object);
  const keyCount = keys.length;

  // Single-key formats
  if (keyCount === 1) {
    const key = keys[0];
    return (
      key === "v" ||
      key === "bi" ||
      key === "d" ||
      key === "u" ||
      key === "r" ||
      key === "e" ||
      key === "m" ||
      key === "set" ||
      key === "ref" ||
      key === "h" ||
      key === "ta" ||
      key === "ab"
    );
  }

  // Two-key formats: { a: [...], id: number } or { o: [...], id: number }
  if (keyCount === 2) {
    const hasId = keys.includes("id");
    const hasA = keys.includes("a");
    const hasO = keys.includes("o");
    return hasId && (hasA || hasO);
  }

  return false;
};

/**
 * Checks if a serialized value is an error.
 */
export const isSerializedError = (
  value: SerializedValue,
): value is { e: { n: string; m: string; s: string } } => {
  return typeof value === "object" && value !== null && "e" in value;
};
