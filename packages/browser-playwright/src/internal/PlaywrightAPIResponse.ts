/**
 * @fileoverview Playwright APIResponse — factory pattern.
 *
 * Wraps the `APIResponse` returned by `APIRequestContext` methods (not the
 * browser page `Response` — that is `PlaywrightResponse`).
 *
 * @since 0.1.0
 */

import type { APIResponse } from "@effect-libs/cloudflare-playwright";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      source: "PlaywrightAPIResponse",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright APIResponse (from APIRequestContext).
 *
 * @category wrappers
 */
export interface PlaywrightAPIResponse {
  readonly body: () => Effect.Effect<Uint8Array, PlaywrightError>;
  readonly dispose: () => Effect.Effect<void, PlaywrightError>;
  readonly headers: () => Record<string, string>;
  readonly headersArray: () => ReadonlyArray<{ readonly name: string; readonly value: string }>;
  readonly json: () => Effect.Effect<unknown, PlaywrightError>;
  readonly ok: () => boolean;
  readonly status: () => number;
  readonly statusText: () => string;
  readonly text: () => Effect.Effect<string, PlaywrightError>;
  readonly url: () => string;
}

/**
 * Factory function to create a PlaywrightAPIResponse from a raw APIResponse.
 *
 * @category constructors
 */
export const makeAPIResponse = (response: APIResponse): PlaywrightAPIResponse => ({
  body: () =>
    Effect.tryPromise({
      try: () => response.body(),
      catch: wrapError("body"),
    }),

  dispose: () =>
    Effect.tryPromise({
      try: () => response.dispose(),
      catch: wrapError("dispose"),
    }),

  headers: () => response.headers(),

  headersArray: () => response.headersArray(),

  json: () =>
    Effect.tryPromise({
      try: () => response.json(),
      catch: wrapError("json"),
    }),

  ok: () => response.ok(),

  status: () => response.status(),

  statusText: () => response.statusText(),

  text: () =>
    Effect.tryPromise({
      try: () => response.text(),
      catch: wrapError("text"),
    }),

  url: () => response.url(),
});
