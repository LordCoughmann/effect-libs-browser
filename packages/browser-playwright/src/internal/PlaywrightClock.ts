/**
 * @fileoverview Playwright Clock — factory pattern.
 *
 * Wraps @cloudflare/playwright Clock with Effect error handling.
 *
 * @since 0.1.0
 */

import type { Clock } from "@effect-libs/cloudflare-playwright";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      source: "PlaywrightClock",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright Clock wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightClock {
  readonly fastForward: (ticks: number | string) => Effect.Effect<void, PlaywrightError>;
  readonly install: (options?: {
    time?: number | string | Date;
  }) => Effect.Effect<void, PlaywrightError>;
  readonly pauseAt: (time: number | string | Date) => Effect.Effect<void, PlaywrightError>;
  readonly resume: Effect.Effect<void, PlaywrightError>;
  readonly runFor: (ticks: number | string) => Effect.Effect<void, PlaywrightError>;
  readonly setFixedTime: (time: number | string | Date) => Effect.Effect<void, PlaywrightError>;
  readonly setSystemTime: (time: number | string | Date) => Effect.Effect<void, PlaywrightError>;
}

/**
 * Factory function to create a PlaywrightClock from a raw Clock.
 *
 * @category constructors
 */
export const makeClock = (clock: Clock): PlaywrightClock => ({
  fastForward: (ticks) =>
    Effect.tryPromise({
      try: () => clock.fastForward(ticks),
      catch: wrapError("fastForward"),
    }),
  install: (options) =>
    Effect.tryPromise({
      try: () => clock.install(options),
      catch: wrapError("install"),
    }),
  pauseAt: (time) =>
    Effect.tryPromise({
      try: () => clock.pauseAt(time),
      catch: wrapError("pauseAt"),
    }),
  resume: Effect.tryPromise({
    try: () => clock.resume(),
    catch: wrapError("resume"),
  }),
  runFor: (ticks) =>
    Effect.tryPromise({
      try: () => clock.runFor(ticks),
      catch: wrapError("runFor"),
    }),
  setFixedTime: (time) =>
    Effect.tryPromise({
      try: () => clock.setFixedTime(time),
      catch: wrapError("setFixedTime"),
    }),
  setSystemTime: (time) =>
    Effect.tryPromise({
      try: () => clock.setSystemTime(time),
      catch: wrapError("setSystemTime"),
    }),
});
