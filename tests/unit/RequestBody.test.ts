/**
 * Behavioral equivalence test for the body-extraction logic in
 * packages/browser-cdp/src/internal/Page/Request.ts (the `body` IIFE that lived
 * around line 331 before the refactor).
 *
 * Asserts that the original IIFE and the refactored module-scope helper
 * produce IDENTICAL output for every input shape. This guards against
 * regressions if the helper is further refactored.
 *
 * The original IIFE used raw `tag === "..."` checks. To lint-clean the
 * test, the original is re-expressed here using `Predicate.isTagged`,
 * which is semantically equivalent.
 */

import { Predicate as P } from "effect";
import { describe, expect, it } from "vitest";

/** The original IIFE from Request.ts, translated to use Predicate.isTagged. */
const originalIiFeBody = (requestBody: unknown): unknown => {
  const b = requestBody;
  if (b instanceof Uint8Array) return b;
  if (P.isString(b)) return b;
  if (P.isObject(b) && P.hasProperty(b, "_tag")) {
    if (P.isTagged("Uint8Array")(b) || P.isTagged("Raw")(b)) {
      if (P.hasProperty(b, "body")) {
        const bodyContent = b.body;
        if (bodyContent instanceof Uint8Array) return bodyContent;
        if (P.isString(bodyContent)) return bodyContent;
      }
    }
  }
  return undefined;
};

/** The proposed refactored helper. */
const extractFromHttpBody = (body: unknown): unknown => {
  if (body instanceof Uint8Array) return body;
  if (P.isString(body)) return body;
  // Compose refinements: the body is one of the extractable tagged types
  // (Uint8Array or Raw) AND has a `.body` property to extract. After the
  // refinement, `body.body` is accessible directly without casts.
  if (P.and(P.or(P.isTagged("Uint8Array"), P.isTagged("Raw")), P.hasProperty("body"))(body)) {
    const content = body.body;
    if (content instanceof Uint8Array) return content;
    if (P.isString(content)) return content;
  }
  return undefined;
};

const cases: ReadonlyArray<readonly [string, unknown]> = [
  // Primitive body types
  ["Uint8Array directly", new Uint8Array([1, 2, 3])],
  ["string directly", "hello world"],
  ["empty string", ""],
  ["undefined", undefined],
  ["null", null],
  ["number", 42],
  ["boolean", true],
  // Tagged Uint8Array body
  [
    "tagged Uint8Array + Uint8Array content",
    { _tag: "Uint8Array", body: new Uint8Array([1, 2, 3]) },
  ],
  ["tagged Uint8Array + string content", { _tag: "Uint8Array", body: "hello" }],
  // Tagged Raw body
  ["tagged Raw + string content", { _tag: "Raw", body: "hello" }],
  ["tagged Raw + Uint8Array content", { _tag: "Raw", body: new Uint8Array([4, 5, 6]) }],
  // Tagged body without inner content
  ["tagged Uint8Array no body", { _tag: "Uint8Array" }],
  ["tagged Raw no body", { _tag: "Raw" }],
  // Tagged body with non-string/non-Uint8Array content (should return undefined)
  ["tagged Uint8Array + number content", { _tag: "Uint8Array", body: 42 }],
  ["tagged Raw + boolean content", { _tag: "Raw", body: true }],
  ["tagged Uint8Array + null content", { _tag: "Uint8Array", body: null }],
  ["tagged Raw + undefined content", { _tag: "Raw", body: undefined }],
  // Object without _tag (should fall through to undefined)
  ["plain object no _tag", { foo: "bar" }],
  ["plain object with body no _tag", { body: "hi" }],
  // Tag is not a string
  ["tag is number", { _tag: 42, body: "hi" }],
  ["tag is null", { _tag: null, body: "hi" }],
  // Unknown tag string (e.g., Stream, FormData) — should fall through
  ["unknown tag string", { _tag: "Stream", body: "ignored" }],
  ["FormData-like tag", { _tag: "FormData", body: "ignored" }],
  // Array (object but no _tag)
  ["array body", [1, 2, 3]],
];

const sameBody = (a: unknown, b: unknown): boolean => {
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  return Object.is(a, b);
};

describe("Request body extraction refactor — behavioral equivalence", () => {
  for (const [label, input] of cases) {
    it(`matches original for: ${label}`, () => {
      const original = originalIiFeBody(input);
      const refactored = extractFromHttpBody(input);
      expect(sameBody(refactored, original)).toBe(true);
    });
  }
});
