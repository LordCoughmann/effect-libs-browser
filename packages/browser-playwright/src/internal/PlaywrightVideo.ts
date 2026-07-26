/**
 * @fileoverview Playwright Video — factory pattern.
 *
 * Wraps @cloudflare/playwright Video with Effect error handling.
 *
 * @since 0.1.0
 */

import type { Video } from "@effect-libs/cloudflare-playwright";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      source: "PlaywrightVideo",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright Video wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightVideo {
  /**
   * Deletes the video file. Will wait for the video to finish if necessary.
   */
  readonly delete: () => Effect.Effect<void, PlaywrightError>;

  /**
   * Returns the file system path this video will be recorded to.
   * The video is guaranteed to be written to the filesystem upon closing the browser context.
   */
  readonly path: () => Effect.Effect<string, PlaywrightError>;

  /**
   * Saves the video to a user-specified path.
   * It is safe to call this method while the video is still in progress,
   * or after the page has closed.
   */
  readonly saveAs: (path: string) => Effect.Effect<void, PlaywrightError>;
}

/**
 * Factory function to create a PlaywrightVideo from a raw Video.
 *
 * @category constructors
 */
export const makeVideo = (video: Video): PlaywrightVideo => ({
  delete: () =>
    Effect.tryPromise({
      try: () => video.delete(),
      catch: wrapError("delete"),
    }),

  path: () =>
    Effect.tryPromise({
      try: () => video.path(),
      catch: wrapError("path"),
    }),

  saveAs: (path) =>
    Effect.tryPromise({
      try: () => video.saveAs(path),
      catch: wrapError("saveAs"),
    }),
});
