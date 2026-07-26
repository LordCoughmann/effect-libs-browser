/**
 * @fileoverview Playwright APIRequestContext — factory pattern.
 *
 * Wraps `APIRequestContext`, Playwright's standalone HTTP client for API testing.
 * Shares cookie/storage state with browser contexts when created from one.
 *
 * @since 0.1.0
 */

import type { APIRequestContext } from "@effect-libs/cloudflare-playwright";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";
import { makeAPIResponse, type PlaywrightAPIResponse } from "./PlaywrightAPIResponse.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      source: "PlaywrightAPIRequestContext",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright APIRequestContext wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightAPIRequestContext {
  readonly delete: (
    url: string,
    options?: Parameters<APIRequestContext["delete"]>[1],
  ) => Effect.Effect<PlaywrightAPIResponse, PlaywrightError>;
  readonly get: (
    url: string,
    options?: Parameters<APIRequestContext["get"]>[1],
  ) => Effect.Effect<PlaywrightAPIResponse, PlaywrightError>;
  readonly head: (
    url: string,
    options?: Parameters<APIRequestContext["head"]>[1],
  ) => Effect.Effect<PlaywrightAPIResponse, PlaywrightError>;
  readonly patch: (
    url: string,
    options?: Parameters<APIRequestContext["patch"]>[1],
  ) => Effect.Effect<PlaywrightAPIResponse, PlaywrightError>;
  readonly post: (
    url: string,
    options?: Parameters<APIRequestContext["post"]>[1],
  ) => Effect.Effect<PlaywrightAPIResponse, PlaywrightError>;
  readonly put: (
    url: string,
    options?: Parameters<APIRequestContext["put"]>[1],
  ) => Effect.Effect<PlaywrightAPIResponse, PlaywrightError>;
  readonly fetch: (
    url: string,
    options?: Parameters<APIRequestContext["fetch"]>[1],
  ) => Effect.Effect<PlaywrightAPIResponse, PlaywrightError>;
  readonly storageState: (
    options?: Parameters<APIRequestContext["storageState"]>[0],
  ) => Effect.Effect<Awaited<ReturnType<APIRequestContext["storageState"]>>, PlaywrightError>;
  readonly dispose: (
    options?: Parameters<APIRequestContext["dispose"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;
}

/**
 * Factory function to create a PlaywrightAPIRequestContext from a raw APIRequestContext.
 *
 * @category constructors
 */
export const makeAPIRequestContext = (ctx: APIRequestContext): PlaywrightAPIRequestContext => ({
  delete: (url, options) =>
    Effect.tryPromise({
      try: () => ctx.delete(url, options),
      catch: wrapError("delete"),
    }).pipe(Effect.map(makeAPIResponse)),

  get: (url, options) =>
    Effect.tryPromise({
      try: () => ctx.get(url, options),
      catch: wrapError("get"),
    }).pipe(Effect.map(makeAPIResponse)),

  head: (url, options) =>
    Effect.tryPromise({
      try: () => ctx.head(url, options),
      catch: wrapError("head"),
    }).pipe(Effect.map(makeAPIResponse)),

  patch: (url, options) =>
    Effect.tryPromise({
      try: () => ctx.patch(url, options),
      catch: wrapError("patch"),
    }).pipe(Effect.map(makeAPIResponse)),

  post: (url, options) =>
    Effect.tryPromise({
      try: () => ctx.post(url, options),
      catch: wrapError("post"),
    }).pipe(Effect.map(makeAPIResponse)),

  put: (url, options) =>
    Effect.tryPromise({
      try: () => ctx.put(url, options),
      catch: wrapError("put"),
    }).pipe(Effect.map(makeAPIResponse)),

  fetch: (url, options) =>
    Effect.tryPromise({
      try: () => ctx.fetch(url, options),
      catch: wrapError("fetch"),
    }).pipe(Effect.map(makeAPIResponse)),

  storageState: (options) =>
    Effect.tryPromise({
      try: () => ctx.storageState(options),
      catch: wrapError("storageState"),
    }),

  dispose: (options) =>
    Effect.tryPromise({
      try: () => ctx.dispose(options),
      catch: wrapError("dispose"),
    }),
});
