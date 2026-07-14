/**
 * Unit tests for the `Runtime.callFunctionOn` wire-format payload
 * constructed by the new utility-script-based evaluate path (Phase P6).
 *
 * Background: pre-P6, CDP inlined evaluate args as JS expression literals
 * and shipped its own browser-side serializer (`__serialize`). P6 collapses
 * the evaluate pipeline to upstream's pattern: inject a `UtilityScript`
 * singleton, then use `Runtime.callFunctionOn` with the utility's
 * `objectId` and pass args via the `arguments` field as real CDP
 * `CallArgument`s.
 *
 * These tests pin the wire-format contract:
 *  - `functionDeclaration` is the indirect-eval form wrapping a single
 *    `utilityScript.evaluate(...)` call.
 *  - `arguments` layout: [self, isFunction, returnByValue, expression,
 *    argCount, ...args, ...handles].
 *  - `isFunction` / `returnByValue` reflect the call.
 *  - Handle arguments come AFTER value arguments in the `arguments` field.
 *
 * The tests do NOT exercise the browser side (Chrome is required for
 * that — see `tests/integration/shared/cdp/evaluate.ts`). They verify
 * the Node-side payload structure only.
 */

import { assert, describe, it } from "@effect/vitest";

import {
  buildUtilityCallPayload,
  type UtilityCallArg,
  type UtilityCallHandleArg,
} from "../../../packages/browser-cdp/src/internal/Page/UtilityCallPayload.js";

// ── Arguments layout ─────────────────────────────────────────────────────────

describe("buildUtilityCallPayload — arguments layout", () => {
  it("no-arg, no-handle case", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "util-id-1",
      isFunction: true,
      returnByValue: true,
      expression: "() => 1",
      args: [],
      handles: [],
    });

    // arguments layout: [self, isFunction, returnByValue, expression, argCount]
    assert.strictEqual(payload.arguments.length, 5);
    assert.deepStrictEqual(payload.arguments[0], { objectId: "util-id-1" });
    assert.deepStrictEqual(payload.arguments[1], { value: true });
    assert.deepStrictEqual(payload.arguments[2], { value: true });
    assert.deepStrictEqual(payload.arguments[3], { value: "() => 1" });
    assert.deepStrictEqual(payload.arguments[4], { value: 0 });
  });

  it("one-arg, no-handle case: argCount = 1, arg is the last value entry", () => {
    const arg: UtilityCallArg = { kind: "value", value: { foo: 1 } };
    const payload = buildUtilityCallPayload({
      utilityObjectId: "util-id-1",
      isFunction: true,
      returnByValue: true,
      expression: "(x) => x",
      args: [arg],
      handles: [],
    });

    assert.strictEqual(payload.arguments.length, 6);
    assert.deepStrictEqual(payload.arguments[4], { value: 1 });
    // arg[5] is the user's arg (as value)
    assert.deepStrictEqual(payload.arguments[5], { value: { foo: 1 } });
  });

  it("one-arg, one-handle case: handle comes after arg, argCount = 1", () => {
    const arg: UtilityCallArg = { kind: "value", value: 42 };
    const handle: UtilityCallHandleArg = { kind: "handle", objectId: "h-1" };
    const payload = buildUtilityCallPayload({
      utilityObjectId: "util-id-1",
      isFunction: true,
      returnByValue: true,
      expression: "(x, h) => h",
      args: [arg],
      handles: [handle],
    });

    assert.strictEqual(payload.arguments.length, 7);
    assert.deepStrictEqual(payload.arguments[4], { value: 1 });
    // arg at index 5
    assert.deepStrictEqual(payload.arguments[5], { value: 42 });
    // handle at index 6 (after args)
    assert.deepStrictEqual(payload.arguments[6], { objectId: "h-1" });
  });

  it("multiple args + multiple handles: argCount matches args.length, handles after args", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "util-id-1",
      isFunction: true,
      returnByValue: true,
      expression: "() => null",
      args: [
        { kind: "value", value: 1 },
        { kind: "value", value: 2 },
      ],
      handles: [
        { kind: "handle", objectId: "h-1" },
        { kind: "handle", objectId: "h-2" },
        { kind: "handle", objectId: "h-3" },
      ],
    });

    // 5 (header) + 2 (args) + 3 (handles) = 10
    assert.strictEqual(payload.arguments.length, 10);
    assert.deepStrictEqual(payload.arguments[4], { value: 2 });
    // arg positions
    assert.deepStrictEqual(payload.arguments[5], { value: 1 });
    assert.deepStrictEqual(payload.arguments[6], { value: 2 });
    // handle positions
    assert.deepStrictEqual(payload.arguments[7], { objectId: "h-1" });
    assert.deepStrictEqual(payload.arguments[8], { objectId: "h-2" });
    assert.deepStrictEqual(payload.arguments[9], { objectId: "h-3" });
  });
});

// ── Payload options ──────────────────────────────────────────────────────────

describe("buildUtilityCallPayload — options", () => {
  it("isFunction = true", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "() => 1",
      args: [],
      handles: [],
    });
    assert.deepStrictEqual(payload.arguments[1], { value: true });
  });

  it("isFunction = false (string expression)", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: false,
      returnByValue: true,
      expression: "1 + 2",
      args: [],
      handles: [],
    });
    assert.deepStrictEqual(payload.arguments[1], { value: false });
  });

  it("isFunction = undefined (auto-detect)", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: undefined,
      returnByValue: true,
      expression: "1 + 2",
      args: [],
      handles: [],
    });
    assert.deepStrictEqual(payload.arguments[1], { value: undefined });
  });

  it("returnByValue = true", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "() => 1",
      args: [],
      handles: [],
    });
    assert.deepStrictEqual(payload.arguments[2], { value: true });
  });

  it("returnByValue = false (return handle)", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: false,
      expression: "() => 1",
      args: [],
      handles: [],
    });
    assert.deepStrictEqual(payload.arguments[2], { value: false });
  });

  it("returnByValue defaults to true", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      expression: "() => 1",
      args: [],
      handles: [],
    });
    assert.deepStrictEqual(payload.arguments[2], { value: true });
  });
});

// ── CallArgument shape ───────────────────────────────────────────────────────

describe("buildUtilityCallPayload — CallArgument shape", () => {
  it("value arg with primitive number", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "(x) => x",
      args: [{ kind: "value", value: 42 }],
      handles: [],
    });
    assert.deepStrictEqual(payload.arguments[5], { value: 42 });
  });

  it("value arg with object", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "(x) => x",
      args: [{ kind: "value", value: { a: 1, b: "two" } }],
      handles: [],
    });
    assert.deepStrictEqual(payload.arguments[5], { value: { a: 1, b: "two" } });
  });

  it("value arg with null", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "(x) => x",
      args: [{ kind: "value", value: null }],
      handles: [],
    });
    assert.deepStrictEqual(payload.arguments[5], { value: null });
  });

  it("value arg with undefined", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "(x) => x",
      args: [{ kind: "value", value: undefined }],
      handles: [],
    });
    assert.deepStrictEqual(payload.arguments[5], { value: undefined });
  });
});

// ── functionDeclaration shape ────────────────────────────────────────────────

describe("buildUtilityCallPayload — functionDeclaration", () => {
  it("wraps the call in an indirect-eval form", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "(x) => x",
      args: [],
      handles: [],
    });
    // The function declaration is an arrow function that calls
    // utilityScript.evaluate(...). Verify the shape.
    assert.isTrue(payload.functionDeclaration.includes("utilityScript"));
    assert.isTrue(payload.functionDeclaration.includes(".evaluate("));
  });

  it("the user expression is passed via the arguments field, not inlined in the function body", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "SOME_RANDOM_USER_EXPRESSION_XYZ",
      args: [],
      handles: [],
    });
    // The user expression must NOT appear in the function declaration —
    // it's passed as a `value` entry in arguments[3]. The function
    // declaration is constant across all calls.
    assert.isFalse(payload.functionDeclaration.includes("SOME_RANDOM_USER_EXPRESSION_XYZ"));
    // The expression IS in the arguments field at position 3.
    assert.deepStrictEqual(payload.arguments[3], { value: "SOME_RANDOM_USER_EXPRESSION_XYZ" });
  });
});

// ── returnByValue / awaitPromise defaults ─────────────────────────────────────

describe("buildUtilityCallPayload — returnByValue / awaitPromise", () => {
  it("sets returnByValue = true on the payload", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "() => 1",
      args: [],
      handles: [],
    });
    assert.strictEqual(payload.returnByValue, true);
  });

  it("sets returnByValue = false on the payload", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: false,
      expression: "() => 1",
      args: [],
      handles: [],
    });
    assert.strictEqual(payload.returnByValue, false);
  });

  it("sets awaitPromise = true on the payload", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "() => 1",
      args: [],
      handles: [],
    });
    assert.strictEqual(payload.awaitPromise, true);
  });

  it("sets userGesture = true on the payload (matches upstream)", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "() => 1",
      args: [],
      handles: [],
    });
    assert.strictEqual(payload.userGesture, true);
  });
});

// ── executionContextId / frameId passthrough ─────────────────────────────────

describe("buildUtilityCallPayload — executionContextId passthrough", () => {
  it("passes through executionContextId when provided", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "() => 1",
      args: [],
      handles: [],
      executionContextId: 42,
    });
    assert.strictEqual(payload.executionContextId, 42);
  });

  it("omits executionContextId when not provided", () => {
    const payload = buildUtilityCallPayload({
      utilityObjectId: "u",
      isFunction: true,
      returnByValue: true,
      expression: "() => 1",
      args: [],
      handles: [],
    });
    assert.isUndefined(payload.executionContextId);
  });
});
