/**
 * @fileoverview Playwright CDPSession — factory pattern.
 *
 * Wraps @cloudflare/playwright CDPSession with Effect error handling.
 *
 * @since 0.1.0
 */

import type { CDPSession } from "@effect-libs/cloudflare-playwright";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      module: "PlaywrightCDPSession",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright CDPSession wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightCDPSession {
  /**
   * Detaches the CDP session.
   */
  readonly detach: () => Effect.Effect<void, PlaywrightError>;

  /**
   * Sends a CDP command.
   */
  readonly send: <T = unknown>(
    method: string,
    params?: object,
  ) => Effect.Effect<T, PlaywrightError>;
}

/**
 * Factory function to create a PlaywrightCDPSession from a raw CDPSession.
 *
 * @category constructors
 */
export const makeCDPSession = (cdpSession: CDPSession): PlaywrightCDPSession => ({
  detach: () =>
    Effect.tryPromise({
      try: () => cdpSession.detach(),
      catch: wrapError("detach"),
    }),

  send: <T = unknown>(method: string, params?: object) =>
    Effect.tryPromise({
      try: () => cdpSession.send(method as never, params as never) as Promise<T>,
      catch: wrapError("send"),
    }),
});
