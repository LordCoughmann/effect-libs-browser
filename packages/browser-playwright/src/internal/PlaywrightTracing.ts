/**
 * @fileoverview Playwright Tracing — factory pattern.
 *
 * Wraps @cloudflare/playwright Tracing with Effect error handling.
 *
 * @since 0.1.0
 */

import type { Tracing } from "@effect-libs/cloudflare-playwright";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      source: "PlaywrightTracing",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright Tracing wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightTracing {
  /**
   * Start a new trace.
   */
  readonly start: (
    options?: Parameters<Tracing["start"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;

  /**
   * Start a new trace chunk.
   */
  readonly startChunk: (
    options?: Parameters<Tracing["startChunk"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;

  /**
   * Stop the trace.
   */
  readonly stop: (options?: Parameters<Tracing["stop"]>[0]) => Effect.Effect<void, PlaywrightError>;

  /**
   * Stop the trace chunk.
   */
  readonly stopChunk: (
    options?: Parameters<Tracing["stopChunk"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;

  /**
   * Start a trace group.
   */
  readonly group: (
    name: string,
    options?: {
      location?: { file: string; line?: number; column?: number };
    },
  ) => Effect.Effect<void, PlaywrightError>;

  /**
   * End a trace group.
   */
  readonly groupEnd: () => Effect.Effect<void, PlaywrightError>;
}

/**
 * Factory function to create a PlaywrightTracing from a raw Tracing.
 *
 * @category constructors
 */
export const makeTracing = (tracing: Tracing): PlaywrightTracing => ({
  start: (options) =>
    Effect.tryPromise({
      try: () => tracing.start(options),
      catch: wrapError("start"),
    }),

  startChunk: (options) =>
    Effect.tryPromise({
      try: () => tracing.startChunk(options),
      catch: wrapError("startChunk"),
    }),

  stop: (options) =>
    Effect.tryPromise({
      try: () => tracing.stop(options),
      catch: wrapError("stop"),
    }),

  stopChunk: (options) =>
    Effect.tryPromise({
      try: () => tracing.stopChunk(options),
      catch: wrapError("stopChunk"),
    }),

  group: (name, options) =>
    Effect.tryPromise({
      try: () => tracing.group(name, options),
      catch: wrapError("group"),
    }),

  groupEnd: () =>
    Effect.tryPromise({
      try: () => tracing.groupEnd(),
      catch: wrapError("groupEnd"),
    }),
});
