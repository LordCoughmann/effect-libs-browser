/**
 * @fileoverview Playwright Keyboard — factory pattern.
 *
 * Wraps @cloudflare/playwright Keyboard with Effect error handling.
 * Note: @cloudflare/playwright Keyboard methods do not support AbortSignal.
 *
 * @since 0.1.0
 */

import type { Keyboard } from "@effect-libs/cloudflare-playwright";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      source: "PlaywrightKeyboard",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright Keyboard wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightKeyboard {
  readonly down: (key: string) => Effect.Effect<void, PlaywrightError>;
  readonly insertText: (text: string) => Effect.Effect<void, PlaywrightError>;
  readonly press: (
    key: string,
    options?: { delay?: number },
  ) => Effect.Effect<void, PlaywrightError>;
  readonly type: (
    text: string,
    options?: { delay?: number },
  ) => Effect.Effect<void, PlaywrightError>;
  readonly up: (key: string) => Effect.Effect<void, PlaywrightError>;
}

/**
 * Factory function to create a PlaywrightKeyboard from a raw Keyboard.
 *
 * @category constructors
 */
export const makeKeyboard = (keyboard: Keyboard): PlaywrightKeyboard => ({
  down: (key) =>
    Effect.tryPromise({
      try: () => keyboard.down(key),
      catch: wrapError("down"),
    }),
  insertText: (text) =>
    Effect.tryPromise({
      try: () => keyboard.insertText(text),
      catch: wrapError("insertText"),
    }),
  press: (key, options) =>
    Effect.tryPromise({
      try: () => keyboard.press(key, options),
      catch: wrapError("press"),
    }),
  type: (text, options) =>
    Effect.tryPromise({
      try: () => keyboard.type(text, options),
      catch: wrapError("type"),
    }),
  up: (key) =>
    Effect.tryPromise({
      try: () => keyboard.up(key),
      catch: wrapError("up"),
    }),
});
