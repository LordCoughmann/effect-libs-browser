/**
 * Element focus operation for CDP page.
 *
 * Uses Playwright-style retry logic: element find + action are combined
 * in a single retry loop. If the element is not found or becomes disconnected,
 * the operation is retried automatically.
 *
 */

import type { CdpError } from "../../CdpError.js";
import type { CdpConnection } from "../CdpConnection.js";

import { Duration, Effect } from "effect";

import { type PageState } from "./PageState.js";
import { ELEMENT_NOT_FOUND, retryWithElement } from "./RetryWithElement.js";

/**
 * Focuses an element matching the selector.
 *
 * Uses `element.focus()` to set focus. Throws if the element is not found.
 *
 * This uses the integrated retry approach: the browser code finds the element
 * and executes the action in one call. If the element is not found, it returns
 * ELEMENT_NOT_FOUND to signal retry.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param timeout - Maximum wait time for element to appear
 */
export const focusElement = Effect.fn("CdpPage.focus")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ): Effect.Effect<void, CdpError> =>
    retryWithElement(
      conn,
      state,
      // Browser-side code: find element + execute action
      (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return ELEMENT_NOT_FOUND;
        (el as HTMLElement).focus();
      },
      selector,
      { timeout },
    ),
);

/**
 * Blurs (removes focus from) an element matching the selector.
 *
 * Uses `element.blur()` to remove focus. Throws if the element is not found.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param timeout - Maximum wait time for element to appear
 */
export const blurElement = Effect.fn("CdpPage.blur")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    timeout: Duration.Duration = Duration.seconds(30),
  ): Effect.Effect<void, CdpError> =>
    retryWithElement(
      conn,
      state,
      // Browser-side code: find element + execute action
      (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return ELEMENT_NOT_FOUND;
        (el as HTMLElement).blur();
      },
      selector,
      { timeout },
    ),
);
