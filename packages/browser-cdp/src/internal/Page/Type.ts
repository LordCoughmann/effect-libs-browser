/**
 * Type text into element operation via CDP.
 *
 * Types text character by character using proper US keyboard layout key events.
 * Printable ASCII characters dispatch keyDown/keyUp with correct code, key, and keyCode.
 * Non-ASCII characters (emoji, CJK, etc.) use Input.insertText for IME-style insertion.
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Duration, Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, SelectorError } from "../../CdpError.js";
import { sleep } from "../sleep.js";
import { ensureSession } from "./EnsureSession.js";
import { isPrintableASCII, resolveKeyDescription } from "./KeyboardLayout.js";
import { type PageState } from "./PageState.js";
import { ELEMENT_NOT_FOUND, retryWithElement } from "./RetryWithElement.js";

/**
 * Types text into an element character by character.
 *
 * Simulates real keyboard input with optional delay between characters.
 * Printable ASCII characters (e.g., "a", "!", "1") dispatch as keyDown/keyUp
 * with proper code, key, and keyCode from the US keyboard layout.
 * Non-ASCII characters (emoji, CJK, etc.) use Input.insertText.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param text - Text to type
 * @param options - Typing options (delay between chars)
 */
export const typeIntoElement = Effect.fn("CdpPage.type")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    text: string,
    options?: { delay?: number; timeout?: Duration.Duration },
  ) =>
    Effect.gen(function* () {
      const delay = options?.delay ?? 0;
      const timeout = options?.timeout ?? Duration.seconds(30);

      // Focus element using retry approach (find + focus in single call)
      yield* retryWithElement(
        conn,
        state,
        (sel: string) => {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!el) return ELEMENT_NOT_FOUND;
          el.focus();
        },
        selector,
        { timeout },
      );

      const sessionId = yield* ensureSession(state);

      const mapInteractionError = Effect.mapError(
        (cause: unknown) =>
          new CdpError({
            module: "CdpPage",
            method: "type",
            reason: new SelectorError({
              selector,
              description: `Type failed: ${getErrorMessage(cause)}`,
            }),
          }),
      );

      // Type each character sequentially with optional delay
      yield* Effect.forEach(
        text,
        (char) =>
          Effect.gen(function* () {
            const desc = resolveKeyDescription(char);

            if (desc && desc.text && isPrintableASCII(char)) {
              // Printable ASCII character — dispatch as keyDown/keyUp with full properties
              yield* conn.cdp.Input.dispatchKeyEvent(
                {
                  type: "keyDown",
                  key: desc.key,
                  code: desc.code,
                  text: desc.text,
                  windowsVirtualKeyCode: desc.keyCodeWithoutLocation,
                  unmodifiedText: desc.text,
                },
                sessionId,
              ).pipe(mapInteractionError);

              yield* conn.cdp.Input.dispatchKeyEvent(
                {
                  type: "keyUp",
                  key: desc.key,
                  code: desc.code,
                  windowsVirtualKeyCode: desc.keyCodeWithoutLocation,
                },
                sessionId,
              ).pipe(mapInteractionError);
            } else {
              // Non-ASCII or unmapped character — use insertText (IME-style)
              yield* conn.cdp.Input.insertText({ text: char }, sessionId).pipe(mapInteractionError);
            }

            if (delay > 0) {
              yield* sleep(delay);
            }
          }),
        { concurrency: 1 },
      );
    }),
);
