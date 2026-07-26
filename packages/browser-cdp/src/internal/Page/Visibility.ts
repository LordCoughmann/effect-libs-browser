/**
 * Element visibility checks via evaluate.
 *
 * Checks if an element is hidden or visible using DOM properties.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, SelectorError } from "../../CdpError.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

/** Map errors to SelectorError for visibility operations. */
const mapError = (method: string, selector: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new CdpError({
        source: "CdpPage",
        method,
        reason: new SelectorError({
          selector,
          description: getErrorMessage(cause),
        }),
      }),
  );

/**
 * Checks if an element is hidden.
 *
 * An element is considered hidden if:
 * - It has `display: none`
 * - It has `visibility: hidden` or `visibility: collapse`
 * - It has zero width or height
 * - It is not in the DOM
 * - It is inside a collapsed `<details>` element
 *
 * Matches Playwright's behavior for `isHidden()`.
 *
 * Note: Per Playwright behavior, elements with `opacity: 0` are considered VISIBLE
 * (they take up space and can be interacted with).
 */
export const isHiddenElement = Effect.fn("CdpPage.isHidden")(
  (conn: CdpConnection["Service"], state: PageState, selector: string) =>
    Effect.gen(function* () {
      const result = yield* evaluatePage(
        conn,
        state,
        (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return true; // No element = hidden (matches Playwright)

          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();

          // Basic visibility checks
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            rect.width === 0 ||
            rect.height === 0
          ) {
            return true;
          }

          // Check if inside collapsed <details>
          // An element inside a closed <details> is hidden
          let parent = el.parentElement;
          while (parent) {
            if (parent.tagName === "DETAILS" && !parent.hasAttribute("open")) {
              return true;
            }
            parent = parent.parentElement;
          }

          return false;
        },
        selector,
      ).pipe(mapError("isHidden", selector));

      return result;
    }),
);

/**
 * Checks if an element is visible.
 *
 * The inverse of `isHidden()`. An element is visible if:
 * - It exists in the DOM
 * - It is not `display: none`
 * - It has non-zero dimensions
 * - It has `visibility: visible`
 * - It is not inside a collapsed `<details>` element
 *
 * Matches Playwright's behavior for `isVisible()`.
 *
 * Note: Per Playwright behavior, elements with `opacity: 0` are considered VISIBLE.
 */
export const isVisibleElement = Effect.fn("CdpPage.isVisible")(
  (conn: CdpConnection["Service"], state: PageState, selector: string) =>
    Effect.gen(function* () {
      const hidden = yield* isHiddenElement(conn, state, selector);
      return !hidden;
    }),
);
