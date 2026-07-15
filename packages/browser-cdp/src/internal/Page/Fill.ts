/**
 * Fill element operation via CDP.
 *
 * Follows Playwright's fill implementation from injectedScript.ts:
 * - Validates input types (unsupported types throw)
 * - Special types (date, time, color, range, etc.) use direct value assignment
 * - Regular text inputs use focus + value assignment + event dispatch
 * - Contenteditable elements use textContent assignment
 *
 * Uses Playwright-style retry logic: element find + fill action are combined
 * in a single retry loop via evaluatePage.
 *
 * @see repos/cloudflare-playwright/packages/injected/src/injectedScript.ts:828
 */

import type { Duration } from "effect";

import type { CdpConnection } from "../CdpConnection.js";

import { Effect, Predicate as P } from "effect";

import { CdpError, EvaluationError } from "../../CdpError.js";
import { type PageState } from "./PageState.js";
import { ELEMENT_NOT_FOUND, retryWithElement } from "./RetryWithElement.js";

/**
 * Fills an input element with a value.
 *
 * Validates input types and handles special input types (date, time, color, range, etc.)
 * with proper value validation and event dispatching.
 *
 * Uses the integrated retry approach: the browser code finds the element
 * and executes the fill action in one call. If the element is not found, it returns
 * ELEMENT_NOT_FOUND to signal retry.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the input element
 * @param value - Value to fill
 * @param timeout - Maximum wait time
 */
export const fillElement = Effect.fn("CdpPage.fill")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    value: string,
    timeout: Duration.Duration,
  ) =>
    Effect.gen(function* () {
      // Runtime validation for non-string values (TypeScript prevents at compile time)
      if (!P.isString(value)) {
        return yield* new CdpError({
          source: "CdpPage",
          method: "fill",
          reason: new EvaluationError({
            description: `value: expected string, got ${typeof value}`,
          }),
        });
      }
      return yield* retryWithElement(
        conn,
        state,
        // Browser-side code: find element + execute fill action
        ([sel, val]: [string, string]) => {
          // Input types that use direct value assignment (browser validates)
          // Defined inline so they're available in the browser context
          const inputTypesToSetValue = new Set([
            "color",
            "date",
            "datetime-local",
            "month",
            "range",
            "time",
            "week",
          ]);
          // Input types that accept text input
          const inputTypesToTypeInto = new Set([
            "",
            "email",
            "number",
            "password",
            "search",
            "tel",
            "text",
            "url",
          ]);

          const element = document.querySelector(sel);
          if (!element) return ELEMENT_NOT_FOUND;

          // Handle INPUT elements
          if (element.nodeName.toLowerCase() === "input") {
            const input = element as HTMLInputElement;
            const type = input.type.toLowerCase();

            // Check if this input type can be filled
            if (!inputTypesToTypeInto.has(type) && !inputTypesToSetValue.has(type)) {
              throw new Error(`Input of type "${type}" cannot be filled`);
            }

            // Special validation for number input
            if (type === "number") {
              const trimmed = val.trim();
              if (trimmed && isNaN(Number(trimmed))) {
                throw new Error("Cannot type text into input[type=number]");
              }
            }

            // Normalize color values to lowercase
            if (type === "color") {
              val = val.toLowerCase();
            }

            // Handle special types that use direct value assignment
            if (inputTypesToSetValue.has(type)) {
              val = val.trim();
              input.focus();
              input.value = val;
              // Browser may reject malformed values
              if (input.value !== val) {
                throw new Error("Malformed value");
              }
              input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
              return;
            }

            // Regular text input: focus, select, set value, dispatch events
            input.focus();
            input.select();
            input.value = val;
            input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            return;
          }

          // Handle TEXTAREA elements
          if (element.nodeName.toLowerCase() === "textarea") {
            const textarea = element as HTMLTextAreaElement;
            textarea.focus();
            textarea.select();
            textarea.value = val;
            textarea.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));
            return;
          }

          // Handle contenteditable elements
          if ((element as HTMLElement).isContentEditable) {
            (element as HTMLElement).focus();
            // Select all content for contenteditable
            const selection = window.getSelection();
            if (selection) {
              const range = document.createRange();
              range.selectNodeContents(element);
              selection.removeAllRanges();
              selection.addRange(range);
            }
            (element as HTMLElement).textContent = val;
            element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            return;
          }

          throw new Error("Element is not an <input>, <textarea> or [contenteditable] element");
        },
        [selector, value] as const,
        { timeout },
      );
    }),
);
