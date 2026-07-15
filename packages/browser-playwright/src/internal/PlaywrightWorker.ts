/**
 * @fileoverview Playwright Worker — factory pattern.
 *
 * Wraps @cloudflare/playwright Worker with Effect error handling.
 *
 * @since 0.1.0
 */

import type { Worker } from "@effect-libs/cloudflare-playwright";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      source: "PlaywrightWorker",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright Worker wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightWorker {
  /**
   * Evaluates a function in the worker context.
   */
  readonly evaluate: <R>(pageFunction: () => R | Promise<R>) => Effect.Effect<R, PlaywrightError>;

  /**
   * Evaluates a function in the worker context and returns a handle.
   */
  readonly evaluateHandle: <R>(
    pageFunction: () => R | Promise<R>,
  ) => Effect.Effect<R, PlaywrightError>;

  /**
   * URL of the worker.
   */
  readonly url: () => string;
}

/**
 * Factory function to create a PlaywrightWorker from a raw Worker.
 *
 * @category constructors
 */
export const makeWorker = (worker: Worker): PlaywrightWorker => ({
  evaluate: <R>(pageFunction: () => R | Promise<R>) =>
    Effect.tryPromise({
      try: () => worker.evaluate(pageFunction),
      catch: wrapError("evaluate"),
    }),

  evaluateHandle: <R>(pageFunction: () => R | Promise<R>) =>
    Effect.tryPromise({
      try: () => worker.evaluateHandle(pageFunction) as Promise<R>,
      catch: wrapError("evaluateHandle"),
    }),

  url: () => worker.url(),
});
