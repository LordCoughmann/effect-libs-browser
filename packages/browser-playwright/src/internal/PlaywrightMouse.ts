/**
 * @fileoverview Playwright Mouse — factory pattern.
 *
 * Wraps @cloudflare/playwright Mouse with Effect error handling.
 * Note: @cloudflare/playwright Mouse methods do not support AbortSignal.
 *
 * @since 0.1.0
 */

import type { Mouse } from "@effect-libs/cloudflare-playwright";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      source: "PlaywrightMouse",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright Mouse wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightMouse {
  readonly click: (
    x: number,
    y: number,
    options?: { button?: "left" | "right" | "middle"; clickCount?: number; delay?: number },
  ) => Effect.Effect<void, PlaywrightError>;
  readonly dblclick: (
    x: number,
    y: number,
    options?: { button?: "left" | "right" | "middle"; delay?: number },
  ) => Effect.Effect<void, PlaywrightError>;
  readonly down: (options?: {
    button?: "left" | "right" | "middle";
    clickCount?: number;
  }) => Effect.Effect<void, PlaywrightError>;
  readonly move: (
    x: number,
    y: number,
    options?: { steps?: number },
  ) => Effect.Effect<void, PlaywrightError>;
  readonly up: (options?: {
    button?: "left" | "right" | "middle";
    clickCount?: number;
  }) => Effect.Effect<void, PlaywrightError>;
  readonly wheel: (deltaX: number, deltaY: number) => Effect.Effect<void, PlaywrightError>;
}

/**
 * Factory function to create a PlaywrightMouse from a raw Mouse.
 *
 * @category constructors
 */
export const makeMouse = (mouse: Mouse): PlaywrightMouse => ({
  click: (x, y, options) =>
    Effect.tryPromise({
      try: () => mouse.click(x, y, options),
      catch: wrapError("click"),
    }),
  dblclick: (x, y, options) =>
    Effect.tryPromise({
      try: () => mouse.dblclick(x, y, options),
      catch: wrapError("dblclick"),
    }),
  down: (options) =>
    Effect.tryPromise({
      try: () => mouse.down(options),
      catch: wrapError("down"),
    }),
  move: (x, y, options) =>
    Effect.tryPromise({
      try: () => mouse.move(x, y, options),
      catch: wrapError("move"),
    }),
  up: (options) =>
    Effect.tryPromise({
      try: () => mouse.up(options),
      catch: wrapError("up"),
    }),
  wheel: (deltaX, deltaY) =>
    Effect.tryPromise({
      try: () => mouse.wheel(deltaX, deltaY),
      catch: wrapError("wheel"),
    }),
});
