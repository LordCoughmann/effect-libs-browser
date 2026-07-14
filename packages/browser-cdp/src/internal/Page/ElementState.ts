/**
 * Element state query operations for CDP page.
 *
 * Evaluate wrappers for checking element state: checked, disabled, editable, enabled.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IMPORTANT — DO NOT extract a shared `extractElementStrict<T>` helper here.
 * ────────────────────────────────────────────────────────────────────────────
 * Each method passes an inline arrow to `evaluatePage`. The arrow is
 * `.toString()`'d and shipped to the browser via `Runtime.callFunctionOn`
 * + `UtilityScript.evaluate` (see ADR-0004). The arrow body is executed in
 * the browser's execution context, where two constraints apply:
 *
 *   1. **No imports are reachable.** Vite's SSR-mode bundler on the workerd
 *      runtime rewrites any imported identifier to `__vite_ssr_import_0__`,
 *      which throws `ReferenceError` at browser-eval time. Use only native
 *      JS — `typeof passed === "string"`, `Array.isArray`, `instanceof`,
 *      DOM property access — inside the arrow body. Do not reference any
 *      import from `"effect"`, `@effect-libs/browser`, or anywhere else.
 *
 *   2. **No closure variables are reachable.** `Function.prototype.toString()`
 *      serializes only the function's source, not its lexical environment.
 *      So a closure-captured parameter like `(el) => check(el)` becomes a
 *      free variable in the browser and throws `ReferenceError`. Inline the
 *      property access (`return el.checked`) directly inside the arrow.
 *
 * The duplication across methods — each one repeats the wait + evaluatePage
 * scaffold around a tiny different body — is the cost of having serializable
 * browser-side code. A previous extraction attempt (`extractElementStrict<T>`
 * in commit `b897201`) violated both rules and broke 45 workerd integration
 * tests. It was reverted; do not re-extract.
 *
 * See `docs/contributing/cdp/decisions/0006-ssr-import-constraint.md` for
 * the full rule, a worked example, and the lint override that goes with it.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { CdpError } from "../../CdpError.js";
import type { CdpConnection } from "../CdpConnection.js";

import { Duration, Effect } from "effect";

import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";
import { waitForSelectorElement } from "./WaitForSelector.js";

/**
 * Checks if an element is checked.
 *
 * Uses `element.checked` for input elements. Throws if the element is not found.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param timeout - Maximum wait time for element to appear
 */
export const isCheckedElement = Effect.fn("CdpPage.isChecked")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ): Effect.Effect<boolean, CdpError> =>
    Effect.gen(function* () {
      yield* waitForSelectorElement(conn, state, selector, { timeout, state: "attached" });
      return yield* evaluatePage(
        conn,
        state,
        // Inline arrow body — see file header. Property access inlined
        // directly; no closure vars, no imports.
        (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error(`Element not found: ${sel}`);
          return (el as HTMLInputElement).checked;
        },
        selector,
      );
    }),
);

/**
 * Checks if an element is disabled.
 *
 * Uses `element.disabled` for form elements and `aria-disabled` for others.
 * Throws if the element is not found.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param timeout - Maximum wait time for element to appear
 */
export const isDisabledElement = Effect.fn("CdpPage.isDisabled")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ): Effect.Effect<boolean, CdpError> =>
    Effect.gen(function* () {
      yield* waitForSelectorElement(conn, state, selector, { timeout, state: "attached" });
      return yield* evaluatePage(
        conn,
        state,
        // Inline arrow body — see file header.
        (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error(`Element not found: ${sel}`);
          if ("disabled" in el) return (el as HTMLInputElement).disabled;
          return el.getAttribute("aria-disabled") === "true";
        },
        selector,
      );
    }),
);

/**
 * Checks if an element is editable.
 *
 * An element is editable if it is enabled and not readonly.
 * Throws if the element is not found.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param timeout - Maximum wait time for element to appear
 */
export const isEditableElement = Effect.fn("CdpPage.isEditable")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ): Effect.Effect<boolean, CdpError> =>
    Effect.gen(function* () {
      yield* waitForSelectorElement(conn, state, selector, { timeout, state: "attached" });
      return yield* evaluatePage(
        conn,
        state,
        // Inline arrow body — see file header.
        (sel: string) => {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!el) throw new Error(`Element not found: ${sel}`);
          // Mirrors upstream Playwright's `editable` element state check
          // (see `injected/src/injectedScript.ts` `state === 'editable'`):
          //   1. contentEditable always wins (returns true).
          //   2. For native form controls (INPUT/TEXTAREA/SELECT): `disabled`
          //      or `readOnly` property makes it non-editable.
          //   3. For ARIA textbox roles (button, combobox, grid, gridcell,
          //      listbox, radiogroup, slider, spinbutton, textbox,
          //      columnheader, rowheader, searchbox, switch, treegrid):
          //      `aria-readonly="true"` makes it non-editable.
          // Reference:
          //   repos/cloudflare-playwright/packages/injected/src/roleUtils.ts
          //   (getReadonly + kAriaReadonlyRoles).
          if (el.isContentEditable) return true;
          const tagName = el.tagName;
          if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
            const disabled = (el as HTMLInputElement).disabled;
            // SELECT elements don't have a `readOnly` property; only INPUT
            // and TEXTAREA do. For SELECT, the readonly check is a no-op.
            const readOnly =
              tagName === "SELECT"
                ? false
                : (el as HTMLInputElement | HTMLTextAreaElement).readOnly;
            return !disabled && !readOnly;
          }
          // ARIA textbox roles: honor aria-readonly.
          // (We don't implement the full role-resolution algorithm; if the
          // element doesn't have an explicit role, role-derived readonly
          // doesn't apply.)
          const role = el.getAttribute("role");
          if (
            role === "textbox" ||
            role === "searchbox" ||
            role === "combobox" ||
            role === "listbox" ||
            role === "spinbutton" ||
            role === "slider" ||
            role === "switch"
          ) {
            return el.getAttribute("aria-readonly") !== "true";
          }
          // Unknown element type — treat as not editable.
          return false;
        },
        selector,
      );
    }),
);

/**
 * Checks if an element is enabled.
 *
 * The inverse of `isDisabled`. An element is enabled if it is not disabled.
 * Throws if the element is not found.
 *
 * Composes `isDisabledElement` rather than going through `evaluatePage`
 * itself — no arrow body, so no SSR concerns. The duplication-vs-helper
 * rule in this file's header applies only to the methods that pass arrow
 * bodies to `evaluatePage`.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param timeout - Maximum wait time for element to appear
 */
export const isEnabledElement = Effect.fn("CdpPage.isEnabled")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ): Effect.Effect<boolean, CdpError> =>
    Effect.gen(function* () {
      const disabled = yield* isDisabledElement(conn, state, selector, timeout);
      return !disabled;
    }),
);
