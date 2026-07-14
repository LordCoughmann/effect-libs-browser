/**
 * @fileoverview Playwright Touchscreen — factory pattern.
 *
 * Wraps @cloudflare/playwright Touchscreen with Effect error handling.
 * Note: @cloudflare/playwright Touchscreen methods do not support AbortSignal.
 *
 * @since 0.1.0
 */

import type { Touchscreen } from "@effect-libs/cloudflare-playwright";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

const wrapError = (cause: unknown): PlaywrightError =>
  new PlaywrightError({
    module: "PlaywrightTouchscreen",
    method: "tap",
    reason: new OperationError({
      method: "tap",
      description: getErrorMessage(cause),
      cause,
    }),
  });

/**
 * Interface for Playwright Touchscreen wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightTouchscreen {
  readonly tap: (x: number, y: number) => Effect.Effect<void, PlaywrightError>;
}

/**
 * Factory function to create a PlaywrightTouchscreen from a raw Touchscreen.
 *
 * @category constructors
 */
export const makeTouchscreen = (touchscreen: Touchscreen): PlaywrightTouchscreen => ({
  tap: (x, y) =>
    Effect.tryPromise({
      try: () => touchscreen.tap(x, y),
      catch: wrapError,
    }),
});
