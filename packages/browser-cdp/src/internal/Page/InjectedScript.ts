/**
 * Persistent injected script for the utility world.
 *
 * Injects a singleton object into the utility world's global scope and
 * caches its CDP `objectId` (a string). Methods on this object can then
 * be called via `Runtime.callFunctionOn` using the `objectId`, avoiding
 * the cost of re-parsing and re-compiling the script on every action.
 *
 * This mirrors Playwright's `InjectedScript` pattern:
 * - `injectedScriptSource` is the bundled helper code
 * - The object is created once per utility context (lazily on first use)
 * - The `objectId` is stored in FrameManager and reset on navigation
 *
 * Benefits over inline `evaluateUtilityWorld`:
 * - Parse once, call many times (performance)
 * - Clean failure on navigation: `objectId` becomes invalid, CDP returns
 *   a clear error ("Could not find object") instead of hanging
 * - Enables retry loops (Playwright's `_retryAction` pattern)
 *
 */

import type { Duration } from "effect";

import type { CdpConnection } from "../CdpConnection.js";

import { Effect, Ref, Stream, type Scope } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, EvaluationError, isCdpError, SelectorError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { type FrameManager } from "./FrameManager.js";
import { type PageState } from "./PageState.js";
import { waitForSelectorElement } from "./WaitForSelector.js";

// ── Browser-side injected script source ────────────────────────────────────────

/**
 * The injected script that runs in the utility world.
 *
 * This is a self-contained IIFE that creates a global singleton object
 * with helper methods for DOM operations. It's stored on `globalThis`
 * so it survives across multiple `Runtime.callFunctionOn` calls within
 * the same execution context.
 *
 * Methods mirror Playwright's `InjectedScript` selectively — we only
 * include methods we need, not the full Playwright injected script.
 *
 * The script uses `globalThis.__effectInjectedScript` as the key, so
 * we can check for its existence before re-creating on context restore.
 */
const INJECTED_SCRIPT_SOURCE = `
(function() {
  if (globalThis.__effectInjectedScript) return globalThis.__effectInjectedScript;

  const script = {
    /**
     * Shadow DOM piercing querySelector.
     * Traverses shadow roots to find elements that would otherwise be
     * hidden from the main document's querySelector.
     */
    querySelectorDeep(selector, root) {
      root = root || document;
      try {
        var el = root.querySelector(selector);
        if (el) return el;
      } catch (e) {}
      var elements = root.querySelectorAll('*');
      for (var i = 0; i < elements.length; i++) {
        if (elements[i].shadowRoot) {
          var found = script.querySelectorDeep(selector, elements[i].shadowRoot);
          if (found) return found;
        }
      }
      return null;
    },

    /**
     * Retarget element following label association.
     * If the element is inside a <label>, follow to the label's control.
     * Mirrors Playwright's retarget(node, 'follow-label').
     */
    retargetFollowLabel(node) {
      var element = node && node.nodeType === Node.ELEMENT_NODE ? node : (node ? node.parentElement : null);
      if (!element) return null;
      if (!element.matches('input, textarea, select') && !element.isContentEditable) {
        // Not a form element — check if inside a label
        if (!element.matches('a, input, textarea, button, select, [role=link], [role=button], [role=checkbox], [role=radio]') &&
            !element.isContentEditable) {
          var enclosingLabel = element.closest('label');
          if (enclosingLabel && enclosingLabel.control) {
            element = enclosingLabel.control;
          }
        }
      }
      return element;
    },

    /**
     * Check if an element is enabled (not disabled).
     * Mirrors Playwright's getAriaDisabled check.
     */
    isEnabled(element) {
      if (!element || !element.isConnected) return false;
      // Check aria-disabled first
      if (element.getAttribute('aria-disabled') === 'true') return false;
      // Check native disabled
      if (element.disabled) return false;
      // Check fieldset ancestor
      var fieldset = element.closest('fieldset');
      if (fieldset && fieldset.disabled) {
        // Legend children of disabled fieldsets are NOT disabled
        var legend = fieldset.querySelector('legend');
        if (legend && legend.contains(element)) return true;
        return false;
      }
      return true;
    },

    /**
     * Select options in a <select> element.
     *
     * Follows Playwright's injectedScript.selectOptions pattern:
     * - Retarget via follow-label
     * - Iterate options, match against value specs
     * - For non-multiple: first match only
     * - Clear selection, then set selected on matches
     * - Dispatch input (composed:true) and change events
     *
     * Returns the array of selected option values, or an error string.
     */
    selectOptions(selector, values) {
      var element = script.querySelectorDeep(selector);
      if (!element) return { error: 'notfound' };

      // Retarget for label association
      element = script.retargetFollowLabel(element);
      if (!element) return { error: 'notconnected' };
      if (element.nodeName.toLowerCase() !== 'select') {
        return { error: 'notselect', message: 'Element is not a <select> element' };
      }

      var select = element;
      var options = Array.prototype.slice.call(select.options);
      var selectedOptions = [];
      var remaining = values.slice();

      for (var index = 0; index < options.length; index++) {
        var option = options[index];

        var matches = function(spec) {
          if (typeof spec === 'string') {
            // valueOrLabel: match by value or option.label (IDL attribute)
            return option.value === spec || option.label === spec;
          }
          if (typeof spec === 'object' && spec !== null) {
            var result = true;
            if (spec.value !== undefined) result = result && option.value === spec.value;
            if (spec.label !== undefined) result = result && option.label === spec.label;
            if (spec.index !== undefined) result = result && spec.index === index;
            return result;
          }
          return false;
        };

        if (!remaining.some(matches)) continue;

        // Check if option is enabled
        if (!script.isEnabled(option)) {
          return { error: 'optionnotenabled' };
        }

        selectedOptions.push(option);
        if (select.multiple) {
          // Remove matched specs
          for (var i = remaining.length - 1; i >= 0; i--) {
            if (matches(remaining[i])) remaining.splice(i, 1);
          }
        } else {
          // Non-multiple: first match only
          remaining = [];
          break;
        }
      }

      if (remaining.length) {
        return { error: 'optionsnotfound' };
      }

      // Clear selection then set selected on matches
      select.value = undefined;
      selectedOptions.forEach(function(opt) { opt.selected = true; });

      // Dispatch events synchronously like Playwright.
      // composed:true on input to cross shadow DOM boundaries.
      select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));

      return { values: selectedOptions.map(function(opt) { return opt.value; }) };
    },
  };

  globalThis.__effectInjectedScript = script;
  return script;
})();
`;

// ── Injected Script ObjectId Management ────────────────────────────────────────

/**
 * Get or create the injected script's CDP remote object ID for a frame.
 *
 * Lazily injects the script into the utility world on first call, then
 * caches the `objectId` (a string like `"{-8589934592}"`) in FrameManager.
 * On subsequent calls, returns the cached ID directly.
 *
 * The cached ID is invalidated on navigation (see `onExecutionContextsCleared`).
 *
 * @param conn - CDP connection service
 * @param state - Page state
 * @param frameManager - Frame manager (stores cached objectIds)
 * @param frameId - Frame to get/create the injected script for
 * @param contextId - Utility world execution context ID for the frame
 * @returns The CDP remote object ID of the injected script
 */
export const getOrCreateInjectedScript = (
  conn: CdpConnection["Service"],
  state: PageState,
  frameManager: FrameManager,
  frameId: string,
  contextId: number,
): Effect.Effect<string, CdpError> =>
  Effect.gen(function* () {
    // Check if we already have a cached objectId
    const existingId = yield* frameManager.getInjectedScriptObjectId(frameId);
    if (existingId !== null) return existingId;

    const sessionId = yield* ensureSession(state);

    // Inject the script into the utility world via Runtime.evaluate.
    // returnByValue: false so we get a RemoteObject with objectId.
    const result = yield* conn.cdp.Runtime.evaluate(
      {
        expression: INJECTED_SCRIPT_SOURCE,
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
          module: "CdpPage",
          method: "injectScript",
          reason: new EvaluationError({
            description: `Failed to inject script: ${msg}`,
          }),
        });
      }),
    );

    if (result.exceptionDetails) {
      return yield* new CdpError({
        module: "CdpPage",
        method: "injectScript",
        reason: new EvaluationError({
          description: `Injected script threw: ${
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
        module: "CdpPage",
        method: "injectScript",
        reason: new EvaluationError({
          description: "Injected script did not return a remote object (missing objectId)",
        }),
      });
    }

    // Cache the objectId in FrameManager
    yield* frameManager.setInjectedScriptObjectId(frameId, objectId);

    return objectId;
  });

// ── Call Injected Script Method ────────────────────────────────────────────────

/** Error result from the injected script's selectOptions method. */
interface SelectOptionError {
  readonly error: string;
  readonly message?: string;
}

/** Success result from the injected script's selectOptions method. */
interface SelectOptionSuccess {
  readonly values: ReadonlyArray<string>;
}

/** Result from the injected script's selectOptions method. */
type SelectOptionResult = SelectOptionError | SelectOptionSuccess;

// ── Navigation Signal for Interruptible CDP Calls ───────────────────────────────

/**
 * Symbol returned when a CDP call is interrupted by navigation.
 * This indicates the action triggered a navigation and the execution
 * context was destroyed before the CDP call could return a result.
 */
export const NavigationInterrupt = Symbol.for("NavigationInterrupt");
export type NavigationInterrupt = typeof NavigationInterrupt;

/**
 * Creates a signal that resolves when navigation happens for the given frame.
 *
 * Used to race CDP calls against navigation detection, allowing graceful
 * handling when an action triggers navigation and destroys the execution context.
 *
 * @param conn - CDP connection service
 * @param frameId - Frame ID to watch for navigation
 * @returns An Effect that resolves when navigation happens for the frame
 */
const createNavigationSignal = (
  conn: CdpConnection["Service"],
  frameId: string,
): Effect.Effect<void, never, Scope.Scope> =>
  conn.subscribe.pipe(
    Effect.flatMap((subscription) =>
      Stream.fromSubscription(subscription).pipe(
        Stream.filter(
          (msg) =>
            msg.method === "Page.frameNavigated" &&
            (msg.params as { frame?: { id?: string } })?.frame?.id === frameId,
        ),
        Stream.take(1),
        Stream.runHead,
      ),
    ),
    Effect.asVoid,
  );

/**
 * Call a method on the injected script object.
 *
 * Uses `Runtime.callFunctionOn` with the injected script's `objectId`
 * as the `this` binding. The function declaration receives the script
 * object as `this` and can call its methods directly.
 *
 * If navigation happens during the call (destroying the execution context),
 * this function will gracefully handle it by returning NavigationInterrupt
 * instead of hanging or throwing.
 *
 * @param conn - CDP connection service
 * @param state - Page state
 * @param scriptObjectId - CDP remote object ID of the injected script
 * @param methodCall - JavaScript expression that calls a method on `this`
 *   e.g. `"return this.selectOptions(selector, values)"`
 * @param args - Arguments to pass to the function (serialized)
 * @returns The deserialized result, or NavigationInterrupt if interrupted by navigation
 */
export const callInjectedScript = <T>(
  conn: CdpConnection["Service"],
  state: PageState,
  scriptObjectId: string,
  methodCall: string,
  args?: Record<string, unknown>,
): Effect.Effect<T | NavigationInterrupt, CdpError> =>
  Effect.gen(function* () {
    const sessionId = yield* ensureSession(state);

    // Get the frame ID to watch for navigation
    const frameId = yield* Ref.get(state.mainFrameId);

    // Build the function that calls a method on the injected script.
    // `this` is bound to the script object via `objectId` parameter.
    const argsParam = args ? JSON.stringify(args) : "{}";
    const functionDeclaration = `function() {
      var __args = ${argsParam};
      ${methodCall};
    }`;

    // Create navigation signal (scoped - subscription cleaned up after race)
    // Uses Effect.scoped to provide the Scope internally
    const navigationSignal = createNavigationSignal(conn, frameId).pipe(Effect.scoped);

    // Race the CDP call against navigation detection
    // If navigation wins, return NavigationInterrupt (graceful handling)
    // If CDP call wins, return the result or handle errors
    const raceResult = yield* Effect.race(
      conn.cdp.Runtime.callFunctionOn(
        {
          functionDeclaration,
          objectId: scriptObjectId,
          returnByValue: true,
          awaitPromise: true,
          userGesture: true,
        },
        sessionId,
      ).pipe(
        Effect.map((result) => ({ type: "cdp", result }) as const),
        Effect.catch((cause) => {
          const msg = getErrorMessage(cause);
          // If context was destroyed, treat as navigation interrupt
          if (
            msg.includes("context") ||
            msg.includes("Execution context") ||
            msg.includes("Cannot find context") ||
            msg.includes("Session closed") ||
            msg.includes("navigated") ||
            msg.includes("Inspected target") ||
            msg.includes("Could not find object")
          ) {
            return Effect.succeed({ type: "navigation" } as const);
          }
          return Effect.fail(
            new CdpError({
              module: "CdpPage",
              method: "callInjectedScript",
              reason: new EvaluationError({
                description: `CDP Runtime.callFunctionOn failed: ${msg}`,
              }),
            }),
          );
        }),
      ),
      navigationSignal.pipe(Effect.map(() => ({ type: "navigation" }) as const)),
    );

    // Handle race result
    if (raceResult.type === "navigation") {
      return NavigationInterrupt;
    }

    // CDP call won the race - check for exceptions
    const callResult = raceResult.result;

    if (callResult.exceptionDetails) {
      const details = callResult.exceptionDetails;
      const text = details.exception?.description ?? details.text ?? "unknown error";
      return yield* new CdpError({
        module: "CdpPage",
        method: "callInjectedScript",
        reason: new EvaluationError({ description: text }),
      });
    }

    const remoteObj = callResult.result;
    if (!remoteObj || remoteObj.value === undefined) {
      return yield* new CdpError({
        module: "CdpPage",
        method: "callInjectedScript",
        reason: new EvaluationError({ description: "Missing result from injected script call" }),
      });
    }

    return remoteObj.value as T;
  });

// ── selectOption via Injected Script ───────────────────────────────────────────

/**
 * Selects options in a `<select>` element using the persistent injected script.
 *
 * This is the new implementation that uses `callInjectedScript` instead of
 * inlining the full selectOption logic in `evaluateUtilityWorld`. Benefits:
 * - The injected script is parsed once and reused across calls
 * - Navigation causes a clean "Could not find object" error (retriable)
 *   instead of a potential hang
 * - Label matching uses `option.label` (IDL attribute) like Playwright
 * - Returns proper error codes for option-not-found and option-not-enabled
 *
 * @param conn - CDP connection service
 * @param state - Page state
 * @param frameManager - Frame manager (for injected script objectId)
 * @param frameId - Frame ID of the target frame
 * @param selector - CSS selector for the <select> element
 * @param values - Option specifications to select
 * @param timeout - Timeout for waitForSelector
 * @param utilityContextId - Utility world execution context ID
 */
export const selectOptionViaInjectedScript = Effect.fn("CdpPage.selectOption")(
  <T extends string | { value?: string; label?: string; index?: number }>(
    conn: CdpConnection["Service"],
    state: PageState,
    frameManager: FrameManager,
    frameId: string,
    selector: string,
    values: T | T[] | null,
    timeout: Duration.Duration,
    utilityContextId: number,
  ) =>
    Effect.gen(function* () {
      // Wait for element to appear (main world)
      yield* waitForSelectorElement(conn, state, selector, {
        timeout,
        state: "attached",
      });

      // Playwright: null means unselect all (same as empty array)
      const valueArray = values === null ? [] : Array.isArray(values) ? values : [values];

      // Get or create the injected script's objectId
      const scriptObjectId = yield* getOrCreateInjectedScript(
        conn,
        state,
        frameManager,
        frameId,
        utilityContextId,
      );

      // Call selectOptions on the injected script
      const result = yield* callInjectedScript<SelectOptionResult>(
        conn,
        state,
        scriptObjectId,
        `return this.selectOptions(__args.selector, __args.values)`,
        { selector, values: valueArray },
      ).pipe(
        Effect.mapError((cause) => {
          const desc =
            isCdpError(cause) && "description" in cause.reason
              ? cause.reason.description
              : getErrorMessage(cause);
          return new CdpError({
            module: "CdpPage",
            method: "selectOption",
            reason: new SelectorError({ selector, description: desc }),
          });
        }),
      );

      // Handle navigation interrupt - selection was made but result unavailable
      if (result === NavigationInterrupt) {
        return [] as ReadonlyArray<string>;
      }

      // Handle error results from the injected script.
      // Note: Playwright retries 'optionsnotfound' and 'optionnotenabled' until
      // timeout via _retryAction. Without a retry loop, we return an empty array
      // for 'optionsnotfound' to avoid breaking the existing test that expects
      // a non-throwing empty result (matches old behavior). When we add the
      // retry loop, this should throw and rely on the loop to retry/timeout.
      if ("error" in result) {
        if (result.error === "optionsnotfound") {
          return [] as ReadonlyArray<string>;
        }
        const errorMessages: Record<string, string> = {
          notfound: `No element found for selector: ${selector}`,
          notconnected: "Element is not connected to the document",
          notselect: result.message ?? "Element is not a <select> element",
          optionnotenabled: "Option being selected is not enabled",
        };
        return yield* new CdpError({
          module: "CdpPage",
          method: "selectOption",
          reason: new SelectorError({
            selector,
            description: errorMessages[result.error] ?? result.error,
          }),
        });
      }

      return result.values;
    }),
);
