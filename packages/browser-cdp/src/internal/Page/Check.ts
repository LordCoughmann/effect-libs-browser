/**
 * Checkbox/radio check and uncheck via evaluate.
 *
 * Supports both native HTML checkbox/radio inputs and ARIA role elements
 * (checkbox, menuitemcheckbox, option, radio, switch, menuitemradio, treeitem).
 *
 * Uses Playwright-style retry logic: element find + check/uncheck action
 * are combined in a single retry loop via evaluatePage.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Duration, Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, SelectorError } from "../../CdpError.js";
import { type PageState } from "./PageState.js";
import { retryWithElement } from "./RetryWithElement.js";

// ── Error Mapping ─────────────────────────────────────────────────────────────

const mapError = (method: string, selector: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new CdpError({
        module: "CdpPage",
        method,
        reason: new SelectorError({
          selector,
          description: getErrorMessage(cause),
        }),
      }),
  );

// ── Options ───────────────────────────────────────────────────────────────────

export interface CheckOptions {
  readonly trial?: boolean;
  readonly timeout?: Duration.Duration;
}

// ── Shared Browser Code ───────────────────────────────────────────────────────

/**
 * Browser-side code shared by check and uncheck.
 *
 * Args: `[selector, desiredChecked, trial]`
 *   - `desiredChecked`: true for check, false for uncheck
 *   - `trial`: if true, validates but does not modify
 *
 * Validates the element is a native checkbox/radio or has a checkable ARIA role.
 * For native inputs: sets `.checked` and dispatches `input` + `change` events.
 * For ARIA roles: sets `aria-checked` attribute.
 * Idempotent: does nothing if element is already in the desired state.
 */
const checkUncheckBrowserCode = ([sel, desiredChecked, trial]: [string, boolean, boolean]) => {
  // Checkable ARIA roles — inline so they're available in browser context
  const CHECKABLE_ROLES = new Set([
    "checkbox",
    "menuitemcheckbox",
    "option",
    "radio",
    "switch",
    "menuitemradio",
    "treeitem",
  ]);
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) return "__ELEMENT_NOT_FOUND__" as const;

  // Determine if native checkbox/radio
  const input = el as HTMLInputElement;
  const isNativeCheckbox =
    input.tagName === "INPUT" && (input.type === "checkbox" || input.type === "radio");

  // Determine if ARIA role element
  const role = el.getAttribute("role");
  const isAriaRole = role !== null && CHECKABLE_ROLES.has(role);

  if (!isNativeCheckbox && !isAriaRole) {
    throw new Error("Not a checkbox or radio button");
  }

  // Unchecking a native radio is not allowed
  if (!desiredChecked && isNativeCheckbox && input.type === "radio") {
    throw new Error("Cannot uncheck radio button");
  }

  // Trial: validate only, no modification
  if (trial) return undefined;

  if (isNativeCheckbox) {
    // Idempotent: skip if already in desired state
    if (input.checked === desiredChecked) return undefined;
    input.checked = desiredChecked;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    // ARIA role: set aria-checked
    const desired = desiredChecked ? "true" : "false";
    const current = el.getAttribute("aria-checked");
    if (current === desired) return undefined;
    el.setAttribute("aria-checked", desired);
  }
  return undefined;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Checks a checkbox or radio element.
 *
 * For native `<input type="checkbox|radio">`: sets `.checked = true` and
 * dispatches `input` + `change` events.
 * For ARIA role elements: sets `aria-checked="true"`.
 * Idempotent: does nothing if already checked.
 */
export const checkElement = Effect.fn("CdpPage.check")((
  conn: CdpConnection["Service"],
  state: PageState,
  _targetId: string,
  selector: string,
  options?: CheckOptions,
) => {
  const timeout = options?.timeout ?? Duration.seconds(30);
  const trial = options?.trial ?? false;

  return retryWithElement(conn, state, checkUncheckBrowserCode, [selector, true, trial] as const, {
    timeout,
  }).pipe(mapError("check", selector));
});

/**
 * Unchecks a checkbox element.
 *
 * For native `<input type="checkbox">`: sets `.checked = false` and
 * dispatches `input` + `change` events.
 * For ARIA role elements: sets `aria-checked="false"`.
 * Throws if called on a radio button.
 * Idempotent: does nothing if already unchecked.
 */
export const uncheckElement = Effect.fn("CdpPage.uncheck")((
  conn: CdpConnection["Service"],
  state: PageState,
  _targetId: string,
  selector: string,
  options?: CheckOptions,
) => {
  const timeout = options?.timeout ?? Duration.seconds(30);
  const trial = options?.trial ?? false;

  return retryWithElement(conn, state, checkUncheckBrowserCode, [selector, false, trial] as const, {
    timeout,
  }).pipe(mapError("uncheck", selector));
});

/**
 * Sets the checked state of a checkbox or radio element.
 *
 * Convenience method that calls check() or uncheck() based on the boolean parameter.
 */
export const setCheckedElement = Effect.fn("CdpPage.setChecked")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    targetId: string,
    selector: string,
    checked: boolean,
    options?: CheckOptions,
  ) =>
    Effect.gen(function* () {
      if (checked) {
        yield* checkElement(conn, state, targetId, selector, options);
      } else {
        yield* uncheckElement(conn, state, targetId, selector, options);
      }
    }),
);
