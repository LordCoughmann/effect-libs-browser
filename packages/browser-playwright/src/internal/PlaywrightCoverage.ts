/**
 * @fileoverview Playwright Coverage — factory pattern.
 *
 * Wraps @cloudflare/playwright Coverage with Effect error handling.
 *
 * @since 0.1.0
 */

import type { Coverage } from "@effect-libs/cloudflare-playwright";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      module: "PlaywrightCoverage",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright Coverage wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightCoverage {
  /**
   * Start CSS coverage.
   */
  readonly startCSSCoverage: (
    options?: Parameters<Coverage["startCSSCoverage"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;

  /**
   * Stop CSS coverage and return coverage data.
   */
  readonly stopCSSCoverage: () => Effect.Effect<
    Awaited<ReturnType<Coverage["stopCSSCoverage"]>>,
    PlaywrightError
  >;

  /**
   * Start JS coverage.
   */
  readonly startJSCoverage: (
    options?: Parameters<Coverage["startJSCoverage"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;

  /**
   * Stop JS coverage and return coverage data.
   */
  readonly stopJSCoverage: () => Effect.Effect<
    Awaited<ReturnType<Coverage["stopJSCoverage"]>>,
    PlaywrightError
  >;
}

/**
 * Factory function to create a PlaywrightCoverage from a raw Coverage.
 *
 * @category constructors
 */
export const makeCoverage = (coverage: Coverage): PlaywrightCoverage => ({
  startCSSCoverage: (options) =>
    Effect.tryPromise({
      try: () => coverage.startCSSCoverage(options),
      catch: wrapError("startCSSCoverage"),
    }),

  stopCSSCoverage: () =>
    Effect.tryPromise({
      try: () => coverage.stopCSSCoverage(),
      catch: wrapError("stopCSSCoverage"),
    }),

  startJSCoverage: (options) =>
    Effect.tryPromise({
      try: () => coverage.startJSCoverage(options),
      catch: wrapError("startJSCoverage"),
    }),

  stopJSCoverage: () =>
    Effect.tryPromise({
      try: () => coverage.stopJSCoverage(),
      catch: wrapError("stopJSCoverage"),
    }),
});
