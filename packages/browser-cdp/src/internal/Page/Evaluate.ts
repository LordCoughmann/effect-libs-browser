/**
 * JavaScript evaluation in browser context via CDP.
 *
 * Architecture (Phase P6 — collapse to upstream's callFunctionOn pattern):
 * 1. Normalize the expression (handle function shorthands).
 * 2. Build a `Runtime.callFunctionOn` payload that invokes the
 *    `UtilityScript.evaluate` method via the utility script's
 *    `objectId`. Args are passed via `arguments` as real CDP
 *    `CallArgument`s (CDP JSON-serializes them); handles are passed
 *    as `{ objectId }` entries.
 * 3. The utility script (browser-side) decodes each arg via its
 *    inlined `parseEvaluationResultValue` and calls the user function
 *    (substituting `{__cdpHandleRef: i}` placeholders for live handles).
 * 4. The utility script serializes the result via its inlined
 *    `serializeAsCallArgument` and returns a `SerializedValue`.
 * 5. We deserialize the result on the Node side via
 *    `parseSerializedResult` (a thin wrapper around the vendored
 *    `parseEvaluationResultValue`).
 *
 * Mirrors Playwright's `crExecutionContext.ts:evaluateWithArguments` +
 * `utilityScript.ts:evaluate`.
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect, Predicate, Ref } from "effect";
import * as Arr from "effect/Array";
import * as P from "effect/Predicate";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, EvaluationError, isCdpError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import {
  parseSerializedResult,
  isSerializedValue,
  type SerializedValue,
} from "./Evaluate/serialization/index.js";
import { serializeAsCallArgument } from "./Evaluate/serialization/utilityScriptSerializers.js";
import {
  collectHandles,
  isCdpHandle,
  isCdpPrimitiveHandle,
  type CdpHandle,
} from "./EvaluateHandle.js";
import { type PageState } from "./PageState.js";
import {
  buildUtilityCallPayload,
  type UtilityCallArg,
  type UtilityCallArgHandle,
} from "./UtilityCallPayload.js";
import { getOrCreateMainWorldUtilityScript } from "./UtilityScript.js";

// ── Expression Normalization ─────────────────────────────────────────────────

/**
 * Normalizes an evaluation expression, following Playwright's approach:
 *
 * - For functions: validates via `new Function`, handles method shorthands
 *   like `sum(a, b) { return a + b; }` by prepending `function`.
 * - For strings: just trims whitespace.
 * - Wraps function declarations in parens so `eval()` returns the function.
 *
 * Adapted from Playwright's `normalizeEvaluationExpression` in
 * `packages/playwright-core/src/server/javascript.ts`.
 */
export const normalizeEvaluationExpression = (expression: string, isFunction: boolean): string => {
  expression = expression.trim();

  if (isFunction) {
    try {
      new Function("(" + expression + ")");
    } catch {
      if (expression.startsWith("async ")) {
        expression = "async function " + expression.substring("async ".length);
      } else {
        expression = "function " + expression;
      }
      try {
        new Function("(" + expression + ")");
      } catch {
        throw new Error("Passed function is not well-serializable!");
      }
    }
  }

  if (/^(async)?\s*function(\s|\()/.test(expression)) {
    expression = "(" + expression + ")";
  }

  return expression;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Helper to fail with CdpError wrapping EvaluationError. */
const failEvaluation = (description: string) =>
  Effect.fail(
    new CdpError({
      module: "CdpPage",
      method: "evaluate",
      reason: new EvaluationError({ description }),
    }),
  );

/**
 * Extracts a human-readable error message from CDP exceptionDetails.
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
 * Deserializes the result from a CDP `RemoteObject`. The result is
 * expected to be a `SerializedValue` produced by the utility script's
 * `__utilitySerialize` function.
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
 * Catches connection-level errors from a CDP `Runtime.*` call and
 * translates them into `CdpError` with `EvaluationError` reason.
 */
const catchRuntimeError =
  (method: "Runtime.evaluate" | "Runtime.callFunctionOn") =>
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

// ── Handle-aware arg construction ───────────────────────────────────────────

/**
 * Walks the arg tree and replaces each CdpHandle with a placeholder
 * that survives `serializeAsCallArgument`:
 *
 * - Object handles become `{__cdpHandleRef: i}` markers. The
 *   `handleSerializer` below converts these to `{h: i}` (the vendored
 *   format) before serialization, so the browser-side `__utilityParse`
 *   can decode them via its `handles` parameter.
 * - Primitive handles have their `__primitiveValue` inlined.
 *
 * Throws a CdpError with a property-path description if a function is
 * encountered nested in the arg tree — matches upstream "should throw
 * usable message" tests that check for paths like "a.inner.property".
 */
const inlineHandles = (
  value: unknown,
  collectedHandles: ReadonlyArray<CdpHandle>,
): {
  readonly inlined: unknown;
  readonly objectHandles: ReadonlyArray<CdpHandle>;
} => {
  const objectHandles: CdpHandle[] = [];
  const objectIndexByHandle = new Map<CdpHandle, number>();
  for (const h of collectedHandles) {
    if (!isCdpPrimitiveHandle(h)) {
      objectIndexByHandle.set(h, objectHandles.length);
      objectHandles.push(h);
    }
  }
  const walk = (v: unknown, path: ReadonlyArray<string | number>): unknown => {
    if (Predicate.isFunction(v)) {
      const pathStr = Arr.match(path, {
        onEmpty: () => "",
        onNonEmpty: (p) =>
          ` at path "${p
            .map((x, i) => (P.isNumber(x) ? `[${x}]` : i > 0 ? `.${x}` : x))
            .join("")}"`,
      });
      throw new CdpError({
        module: "CdpPage",
        method: "evaluate",
        reason: new EvaluationError({
          description: `page.evaluate: failed to serialize arg${pathStr}. Functions are not serializable.`,
        }),
      });
    }
    if (isCdpHandle(v)) {
      if (isCdpPrimitiveHandle(v)) return v.__primitiveValue;
      const idx = objectIndexByHandle.get(v);
      if (idx === undefined) return undefined;
      return { __cdpHandleRef: idx };
    }
    if (Array.isArray(v)) return v.map((item, i) => walk(item, [...path, i]));
    // Preserve special prototypes — walking them as plain objects would
    // drop their content (e.g. Date has no enumerable keys).
    if (v instanceof Date) return v;
    if (v instanceof RegExp) return v;
    if (v instanceof URL) return v;
    if (v instanceof Map) return v;
    if (v instanceof Set) return v;
    if (v instanceof Error) return v;
    if (v instanceof ArrayBuffer) return v;
    if (ArrayBuffer.isView(v)) return v;
    if (Predicate.isObject(v)) {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>)) {
        result[key] = walk((v as Record<string, unknown>)[key], [...path, key]);
      }
      return result;
    }
    return v;
  };
  return { inlined: walk(value, []), objectHandles };
};

/**
 * Pre-serializes the arg via the vendored `serializeAsCallArgument`.
 * Used to preserve special types (NaN / ±Infinity / -0 / Date / Map /
 * Set / RegExp / URL / BigInt / TypedArray) through CDP's JSON encoding.
 *
 * Uses a custom handleSerializer that recognizes the
 * `{__cdpHandleRef: i}` markers emitted by `inlineHandles` and
 * converts them to `{h: i}` (the format `serializeAsCallArgument`
 * understands). The browser-side `__utilityParse` then decodes them
 * via its `handles` parameter.
 */
const preSerialize = (arg: unknown): unknown =>
  serializeAsCallArgument(arg, (v) => {
    if (
      Predicate.isObject(v) &&
      !Array.isArray(v) &&
      Object.keys(v as Record<string, unknown>).length === 1 &&
      "__cdpHandleRef" in (v as Record<string, unknown>)
    ) {
      const idx = (v as { __cdpHandleRef: number }).__cdpHandleRef;
      return { h: idx };
    }
    return { fallThrough: v };
  });

// ── Public evaluate paths ───────────────────────────────────────────────────

/**
 * Executes a JavaScript function or expression in the page's main world
 * and returns the deserialized result.
 *
 * Phase P6 path:
 * 1. Collect any handle args.
 * 2. If there are object handles, inject the utility script into the
 *    main world (handles live in the world they were created in).
 *    Otherwise, inject into the utility world.
 * 3. Pre-serialize the arg so special types survive JSON encoding.
 * 4. Pass handles via the `arguments` field as `{objectId}` entries.
 * 5. Call `Runtime.callFunctionOn` and return the deserialized result.
 */
export const evaluatePage = <T>(
  conn: CdpConnection["Service"],
  state: PageState,
  pageFunction: string | ((...args: any[]) => T),
  arg?: unknown,
  _executionContextId?: number,
): Effect.Effect<Awaited<T>, CdpError> =>
  Effect.gen(function* () {
    const sessionId = yield* ensureSession(state);

    const frameId = yield* Ref.get(state.mainFrameId);
    const frameManager = yield* Ref.get(state.frameManager);

    const collectedHandles = collectHandles(arg);
    const hasHandles = collectedHandles.some((h) => !isCdpPrimitiveHandle(h));

    const utilityObjectId = hasHandles
      ? yield* Effect.gen(function* () {
          yield* frameManager.waitForExecutionContext(frameId, "main");
          const mainContextId = yield* frameManager.getMainContextId(frameId);
          if (mainContextId === null) {
            return yield* failEvaluation("evaluate: main world execution context not available");
          }
          return yield* getOrCreateMainWorldUtilityScript(
            conn,
            state,
            frameManager,
            frameId,
            mainContextId,
          );
        })
      : yield* Effect.gen(function* () {
          // Use the main world utility script. The utility script's
          // `eval(expression)` runs in the main world, so `window` in
          // the user's function refers to the main page's window.
          yield* frameManager.waitForExecutionContext(frameId, "main");
          const mainContextId = yield* frameManager.getMainContextId(frameId);
          if (mainContextId === null) {
            return yield* failEvaluation("evaluate: main world execution context not available");
          }
          return yield* getOrCreateMainWorldUtilityScript(
            conn,
            state,
            frameManager,
            frameId,
            mainContextId,
          );
        });

    const isFunction = Predicate.isFunction(pageFunction);
    const expression = isFunction ? pageFunction.toString() : (pageFunction as string);
    const normalized = normalizeEvaluationExpression(expression, isFunction);

    // Build args + handles. `inlineHandles` may throw a CdpError for
    // nested function args — wrap in `Effect.try` so it propagates
    // through the generator.
    const inlinedResult = yield* Effect.try({
      try: () => inlineHandles(arg, collectedHandles),
      catch: (e) =>
        isCdpError(e)
          ? e
          : new CdpError({
              module: "CdpPage",
              method: "evaluate",
              reason: new EvaluationError({ description: getErrorMessage(e) }),
            }),
    });
    const args: UtilityCallArg[] = [];
    const handles: UtilityCallArgHandle[] = [];
    args.push({ kind: "value", value: preSerialize(inlinedResult.inlined) });
    for (const h of inlinedResult.objectHandles) {
      handles.push({ kind: "handle", objectId: h.objectId });
    }

    const payload = buildUtilityCallPayload({
      utilityObjectId,
      isFunction,
      returnByValue: true,
      expression: normalized,
      args,
      handles,
    });

    const callResult = yield* catchRuntimeError("Runtime.callFunctionOn")(
      conn.cdp.Runtime.callFunctionOn(
        {
          functionDeclaration: payload.functionDeclaration,
          objectId: payload.objectId,
          arguments: [...payload.arguments],
          returnByValue: payload.returnByValue,
          awaitPromise: payload.awaitPromise,
          userGesture: payload.userGesture,
        },
        sessionId,
      ),
    );

    if (callResult.exceptionDetails) {
      return yield* failEvaluation(extractExceptionText(callResult.exceptionDetails));
    }
    const remoteObj = callResult.result;
    if (!remoteObj) {
      return yield* failEvaluation("evaluate: missing result");
    }
    return yield* deserializeResult<Awaited<T>>(remoteObj);
  });

/**
 * Evaluates a JavaScript function in the browser's utility world context.
 *
 * Uses `Runtime.callFunctionOn` against the utility script. The
 * `contextId` is the utility world context ID.
 */
export const evaluateUtilityWorld = <T>(
  conn: CdpConnection["Service"],
  state: PageState,
  contextId: number,
  pageFunction: string | ((...args: any[]) => T),
  arg?: unknown,
): Effect.Effect<Awaited<T>, CdpError> =>
  Effect.gen(function* () {
    const sessionId = yield* ensureSession(state);

    const frameId = yield* Ref.get(state.mainFrameId);
    const frameManager = yield* Ref.get(state.frameManager);
    // Use the main world utility script for the same reason as
    // `evaluatePage` — `this.global.eval` runs in the main world so
    // `window` in the user's function refers to the main page's window.
    // For utility-world evaluations (e.g. `page.title`, `page.content`),
    // we still use the main world because upstream's UtilityScript
    // pattern evaluates via `this.global.eval` regardless of the
    // intended execution context. TODO: support a separate utility
    // world utility script for true utility-world isolation.
    const utilityObjectId = yield* getOrCreateMainWorldUtilityScript(
      conn,
      state,
      frameManager,
      frameId,
      contextId,
    );

    const isFunction = Predicate.isFunction(pageFunction);
    const expression = isFunction ? pageFunction.toString() : (pageFunction as string);
    const normalized = normalizeEvaluationExpression(expression, isFunction);

    const collectedHandles = collectHandles(arg);
    const inlinedResult = yield* Effect.try({
      try: () => inlineHandles(arg, collectedHandles),
      catch: (e) =>
        isCdpError(e)
          ? e
          : new CdpError({
              module: "CdpPage",
              method: "evaluate",
              reason: new EvaluationError({ description: getErrorMessage(e) }),
            }),
    });
    const args: UtilityCallArg[] = [];
    const handles: UtilityCallArgHandle[] = [];
    args.push({ kind: "value", value: preSerialize(inlinedResult.inlined) });
    for (const h of inlinedResult.objectHandles) {
      handles.push({ kind: "handle", objectId: h.objectId });
    }

    const payload = buildUtilityCallPayload({
      utilityObjectId,
      isFunction,
      returnByValue: true,
      expression: normalized,
      args,
      handles,
    });

    const callResult = yield* catchRuntimeError("Runtime.callFunctionOn")(
      conn.cdp.Runtime.callFunctionOn(
        {
          functionDeclaration: payload.functionDeclaration,
          objectId: payload.objectId,
          arguments: [...payload.arguments],
          returnByValue: payload.returnByValue,
          awaitPromise: payload.awaitPromise,
          userGesture: payload.userGesture,
        },
        sessionId,
      ),
    );

    if (callResult.exceptionDetails) {
      return yield* failEvaluation(extractExceptionText(callResult.exceptionDetails));
    }
    const remoteObj = callResult.result;
    if (!remoteObj) {
      return yield* failEvaluation("evaluate utility world: missing result");
    }
    return yield* deserializeResult<Awaited<T>>(remoteObj);
  });

/**
 * Evaluates a JavaScript function in a specific frame's main world context.
 *
 * Injects the utility script into the frame's main world (using the
 * caller's `contextId` as the injection context). The `frameId` is used
 * to cache the utility script's objectId so subsequent calls don't
 * re-inject per-frame.
 */
export const evaluateFrame = <T>(
  conn: CdpConnection["Service"],
  state: PageState,
  contextId: number,
  frameId: string,
  pageFunction: string | ((...args: any[]) => T),
  arg?: unknown,
): Effect.Effect<Awaited<T>, CdpError> =>
  Effect.gen(function* () {
    const sessionId = yield* ensureSession(state);

    const frameManager = yield* Ref.get(state.frameManager);
    const utilityObjectId = yield* getOrCreateMainWorldUtilityScript(
      conn,
      state,
      frameManager,
      frameId,
      contextId,
    );

    const isFunction = Predicate.isFunction(pageFunction);
    const expression = isFunction ? pageFunction.toString() : (pageFunction as string);
    const normalized = normalizeEvaluationExpression(expression, isFunction);

    const collectedHandles = collectHandles(arg);
    const inlinedResult = yield* Effect.try({
      try: () => inlineHandles(arg, collectedHandles),
      catch: (e) =>
        isCdpError(e)
          ? e
          : new CdpError({
              module: "CdpPage",
              method: "evaluate",
              reason: new EvaluationError({ description: getErrorMessage(e) }),
            }),
    });
    const args: UtilityCallArg[] = [];
    const handles: UtilityCallArgHandle[] = [];
    args.push({ kind: "value", value: preSerialize(inlinedResult.inlined) });
    for (const h of inlinedResult.objectHandles) {
      handles.push({ kind: "handle", objectId: h.objectId });
    }

    const payload = buildUtilityCallPayload({
      utilityObjectId,
      isFunction,
      returnByValue: true,
      expression: normalized,
      args,
      handles,
    });

    const callResult = yield* catchRuntimeError("Runtime.callFunctionOn")(
      conn.cdp.Runtime.callFunctionOn(
        {
          functionDeclaration: payload.functionDeclaration,
          objectId: payload.objectId,
          arguments: [...payload.arguments],
          returnByValue: payload.returnByValue,
          awaitPromise: payload.awaitPromise,
          userGesture: payload.userGesture,
        },
        sessionId,
      ),
    );

    if (callResult.exceptionDetails) {
      return yield* failEvaluation(extractExceptionText(callResult.exceptionDetails));
    }
    const remoteObj = callResult.result;
    if (!remoteObj) {
      return yield* failEvaluation("evaluate frame: missing result");
    }
    return yield* deserializeResult<Awaited<T>>(remoteObj);
  });
