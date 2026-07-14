/**
 * Wire-format payload for the new utility-script-based evaluate path.
 *
 * Phase P6 replaces CDP's in-house `__serialize` pipeline with upstream
 * Playwright's pattern: inject a `UtilityScript` singleton into the
 * page's utility world, then use `Runtime.callFunctionOn` with the
 * utility's `objectId` and pass args via the `arguments` field as real
 * CDP `CallArgument`s.
 *
 * This module is a pure helper that builds the `Runtime.callFunctionOn`
 * payload from a higher-level description (isFunction / returnByValue /
 * expression / args / handles). It is intentionally synchronous and
 * side-effect free so it can be unit-tested without Chrome.
 *
 * Arguments layout (matches upstream `crExecutionContext.ts:59`):
 *   [0]   { objectId: utilityObjectId }   // self
 *   [1]   { value: isFunction }            // boolean | undefined
 *   [2]   { value: returnByValue }         // boolean
 *   [3]   { value: expression }            // string
 *   [4]   { value: argCount }              // number (count of value args)
 *   [5+]  { value: ...args }               // value args (each as a CDP CallArgument)
 *   [N+]  { objectId: ...handles }        // handles, after value args
 *
 * The utility script (in the browser) receives the args and handles as
 * a single flat list, then slices the first `argCount` items as args
 * and the rest as handles. This matches upstream's `UtilityScript.evaluate`
 * signature.
 */

import type { Protocol } from "devtools-protocol";

// ── Public input types ───────────────────────────────────────────────────────

/**
 * A value argument to pass to the user's function. Sent as
 * `{ value: v }` in the `arguments` field — CDP JSON-serializes it.
 *
 * Use this for plain JSON values, primitives, and any value the user
 * can pass to `page.evaluate(fn, arg)`.
 */
export interface UtilityCallArgValue {
  readonly kind: "value";
  readonly value: unknown;
}

/**
 * A handle argument to pass to the user's function. Sent as
 * `{ objectId: h.objectId }` in the `arguments` field — CDP delivers
 * the handle as a live JS value in the browser's execution context.
 */
export interface UtilityCallArgHandle {
  readonly kind: "handle";
  readonly objectId: string;
}

export type UtilityCallArg = UtilityCallArgValue | UtilityCallArgHandle;

/**
 * Convenience alias for handle-typed args (kept for backward compat
 * with test fixtures that read more clearly with this name).
 */
export type UtilityCallHandleArg = UtilityCallArgHandle;

export interface BuildUtilityCallPayloadOptions {
  /**
   * The CDP `objectId` of the injected `UtilityScript` singleton.
   * `this` for the `Runtime.callFunctionOn` call.
   */
  readonly utilityObjectId: string;

  /**
   * Whether `expression` is a function source (true), a string
   * expression (false), or auto-detect (undefined). Matches
   * upstream `UtilityScript.evaluate`'s `isFunction` param.
   */
  readonly isFunction: boolean | undefined;

  /**
   * Whether to return the result by value (deserialized JS value) or
   * as a handle (CDP `objectId`). Defaults to `true` (matches upstream
   * Playwright — evaluate results come back as values, not handles).
   */
  readonly returnByValue?: boolean;

  /**
   * The JavaScript source to evaluate. Either a function body
   * (`(x) => x.foo`) or a plain expression (`window.location.href`).
   */
  readonly expression: string;

  /**
   * Value arguments to pass to the user function. These are sent as
   * `{ value: ... }` in the `arguments` field. Handles go in `handles`
   * below.
   */
  readonly args: ReadonlyArray<UtilityCallArg>;

  /**
   * Handle arguments to pass to the user function. These are sent as
   * `{ objectId: ... }` in the `arguments` field, AFTER the value
   * arguments.
   */
  readonly handles: ReadonlyArray<UtilityCallArgHandle>;

  /**
   * Optional CDP `executionContextId` to target a specific world
   * (main world vs utility world). Omit to use the call's default
   * (main world when not specified).
   */
  readonly executionContextId?: number;
}

/**
 * The `Runtime.callFunctionOn` payload built by
 * {@link buildUtilityCallPayload}.
 *
 * This is the shape the `Runtime.callFunctionOn` CDP method expects,
 * minus the `sessionId` (which is supplied by the caller).
 */
export interface UtilityCallPayload {
  /**
   * The function source. Always the indirect-eval form
   * `(utilityScript, ...args) => utilityScript.evaluate(...)` —
   * upstream's pattern, allowing CDP to bind `utilityScript` as `this`.
   */
  readonly functionDeclaration: string;

  /**
   * The CDP `objectId` to bind `this` to (the utility script).
   * Omit when the utility script lives in the main world and the
   * function doesn't need `this` binding.
   */
  readonly objectId: string;

  /**
   * The arguments array. See {@link BuildUtilityCallPayloadOptions}.
   */
  readonly arguments: ReadonlyArray<Protocol.Runtime.CallArgument>;

  /**
   * Pass-through to `Runtime.callFunctionOn.returnByValue`. Mirrors
   * the `returnByValue` input option.
   */
  readonly returnByValue: boolean;

  /**
   * Always `true` — we want CDP to await promise results.
   */
  readonly awaitPromise: true;

  /**
   * Always `true` — matches upstream Playwright; allows
   * `page.evaluate(() => alert('hi'))` to work in scrapers.
   */
  readonly userGesture: true;

  /**
   * Optional CDP `executionContextId` for utility world targeting.
   * Omit when evaluating in the default (main) world.
   */
  readonly executionContextId?: number;
}

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Builds the `Runtime.callFunctionOn` payload for the new
 * utility-script-based evaluate path.
 *
 * Pure function: no I/O, no side effects. Testable in isolation.
 */
export const buildUtilityCallPayload = (
  options: BuildUtilityCallPayloadOptions,
): UtilityCallPayload => {
  const {
    utilityObjectId,
    isFunction,
    returnByValue: returnByValueOpt,
    expression,
    args,
    handles,
    executionContextId,
  } = options;
  const returnByValue = returnByValueOpt ?? true;

  // Build the arguments array. Layout matches upstream:
  //   [self, isFunction, returnByValue, expression, argCount, ...args, ...handles]
  const callArguments: Array<Protocol.Runtime.CallArgument> = [
    { objectId: utilityObjectId },
    { value: isFunction },
    { value: returnByValue },
    { value: expression },
    { value: args.length },
  ];

  for (const arg of args) {
    if (arg.kind === "value") {
      callArguments.push({ value: arg.value });
    } else {
      // Value-typed arg that carries an objectId — treat as a handle.
      // (We split into separate `args` and `handles` arrays for clarity
      // at the call site, but a "handle" arg is also valid here. We
      // just emit it as `{ objectId }`.)
      callArguments.push({ objectId: arg.objectId });
    }
  }

  for (const h of handles) {
    callArguments.push({ objectId: h.objectId });
  }

  // The function declaration is an arrow function that calls
  // `utilityScript.evaluate(...)`. The CDP runtime binds the first
  // argument (the `utilityScript` self reference) and any additional
  // value/handle args via the function's parameters.
  //
  // Note: we don't need to declare the parameters explicitly — CDP
  // passes args positionally via the function's `arguments` object.
  // The utility script reads them via `argsAndHandles` slice.
  const functionDeclaration = `(utilityScript, isFunction, returnByValue, expression, argCount, ...argsAndHandles) => {
    return utilityScript.evaluate(isFunction, returnByValue, expression, argCount, ...argsAndHandles);
  }`;

  const payload: UtilityCallPayload = {
    functionDeclaration,
    objectId: utilityObjectId,
    arguments: callArguments,
    returnByValue,
    awaitPromise: true,
    userGesture: true,
    ...(executionContextId !== undefined ? { executionContextId } : {}),
  };

  return payload;
};
