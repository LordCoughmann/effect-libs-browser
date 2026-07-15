/**
 * @fileoverview Playwright Frame — factory pattern.
 *
 * Wraps @cloudflare/playwright Frame with Effect error handling.
 *
 * @since 0.1.0
 */

// fallow-ignore-file circular-dependencies

import type { Frame } from "@effect-libs/cloudflare-playwright";

import type { PlaywrightFrameLocator, PlaywrightLocator } from "../PlaywrightTypes.js";

import { Effect, Option } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";
import { makeFrameLocatorObj, makeLocator } from "./PlaywrightLocator.js";
import { makePage } from "./PlaywrightPage.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      source: "PlaywrightFrame",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright Frame wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightFrame {
  // ── Navigation ──
  readonly goto: (
    url: string,
    options?: Parameters<Frame["goto"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  readonly waitForURL: (
    url: Parameters<Frame["waitForURL"]>[0],
    options?: Parameters<Frame["waitForURL"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  readonly waitForLoadState: (
    state?: Parameters<Frame["waitForLoadState"]>[0],
    options?: Parameters<Frame["waitForLoadState"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;

  // ── Evaluation ──
  readonly evaluate: <R>(pageFunction: () => R | Promise<R>) => Effect.Effect<R, PlaywrightError>;

  // ── Frame Info ──
  readonly title: () => Effect.Effect<string, PlaywrightError>;
  /**
   * Synchronous getter (returns `string` directly, not an Effect).
   *
   * Upstream Playwright's `Frame.url()` is sync; the wrapper
   * mirrors this rather than wrapping it in `Effect.try`. Most
   * other methods on `PlaywrightFrame` are Effects — this is an
   * intentional DX choice, not a wrapper bug.
   */
  readonly url: () => string;
  /**
   * Synchronous getter (returns `string` directly, not an Effect).
   *
   * Upstream Playwright's `Frame.name()` is sync; the wrapper
   * mirrors this rather than wrapping it in `Effect.try`. See
   * `url` for the rationale.
   */
  readonly name: () => string;
  readonly content: () => Effect.Effect<string, PlaywrightError>;
  readonly setContent: (
    html: string,
    options?: Parameters<Frame["setContent"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;
  readonly isDetached: () => boolean;

  // ── Frame Hierarchy ──
  readonly parentFrame: () => Option.Option<PlaywrightFrame>;
  readonly childFrames: () => ReadonlyArray<PlaywrightFrame>;

  // ── Locators ──
  readonly locator: (
    selector: string,
    options?: Parameters<Frame["locator"]>[1],
  ) => PlaywrightLocator;
  readonly getByRole: (
    role: Parameters<Frame["getByRole"]>[0],
    options?: Parameters<Frame["getByRole"]>[1],
  ) => PlaywrightLocator;
  readonly getByText: (
    text: Parameters<Frame["getByText"]>[0],
    options?: Parameters<Frame["getByText"]>[1],
  ) => PlaywrightLocator;
  readonly getByLabel: (
    label: Parameters<Frame["getByLabel"]>[0],
    options?: Parameters<Frame["getByLabel"]>[1],
  ) => PlaywrightLocator;
  readonly getByTestId: (testId: Parameters<Frame["getByTestId"]>[0]) => PlaywrightLocator;
  readonly getByPlaceholder: (
    text: Parameters<Frame["getByPlaceholder"]>[0],
    options?: Parameters<Frame["getByPlaceholder"]>[1],
  ) => PlaywrightLocator;
  readonly getByAltText: (
    text: Parameters<Frame["getByAltText"]>[0],
    options?: Parameters<Frame["getByAltText"]>[1],
  ) => PlaywrightLocator;
  readonly getByTitle: (
    text: Parameters<Frame["getByTitle"]>[0],
    options?: Parameters<Frame["getByTitle"]>[1],
  ) => PlaywrightLocator;

  // ── Waiting ──
  readonly waitForTimeout: (timeout: number) => Effect.Effect<void, PlaywrightError>;

  // ── Frames ──
  /**
   * When working with iframes, create a frame locator that enters the
   * iframe and allows selecting elements inside it. Returns a lazy
   * `PlaywrightFrameLocator` builder.
   *
   * @see {@link Frame.frameLocator}
   */
  readonly frameLocator: (selector: string) => PlaywrightFrameLocator;

  // ── Escape Hatch ──
  readonly use: <T>(
    f: (frame: Frame, signal: AbortSignal) => Promise<T>,
  ) => Effect.Effect<T, PlaywrightError>;
}

/**
 * Factory function to create a PlaywrightFrame from a raw Frame.
 *
 * @category constructors
 */
export const makeFrame = (frame: Frame): PlaywrightFrame => ({
  // ── Navigation ──
  goto: (url, options) =>
    Effect.tryPromise({
      try: (signal) =>
        frame
          .goto(url, { ...options, signal } as Parameters<Frame["goto"]>[1])
          .then(() => undefined),
      catch: wrapError("goto"),
    }),

  waitForURL: (url, options) =>
    Effect.tryPromise({
      try: (signal) =>
        frame.waitForURL(url, { ...options, signal } as Parameters<Frame["waitForURL"]>[1]),
      catch: wrapError("waitForURL"),
    }),

  waitForLoadState: (state, options) =>
    Effect.tryPromise({
      try: (signal) =>
        frame.waitForLoadState(state, { ...options, signal } as Parameters<
          Frame["waitForLoadState"]
        >[1]),
      catch: wrapError("waitForLoadState"),
    }),

  // ── Evaluation ──
  evaluate: <R>(pageFunction: () => R | Promise<R>) =>
    Effect.tryPromise({
      try: () => frame.evaluate(pageFunction),
      catch: wrapError("evaluate"),
    }),

  // ── Frame Info ──
  title: () =>
    Effect.tryPromise({
      try: () => frame.title(),
      catch: wrapError("title"),
    }),

  url: () => frame.url(),

  name: () => frame.name(),

  content: () =>
    Effect.tryPromise({
      try: () => frame.content(),
      catch: wrapError("content"),
    }),

  setContent: (html, options) =>
    Effect.tryPromise({
      try: (signal) =>
        frame.setContent(html, { ...options, signal } as Parameters<Frame["setContent"]>[1]),
      catch: wrapError("setContent"),
    }),

  isDetached: () => frame.isDetached(),

  // ── Frame Hierarchy ──
  parentFrame: () => Option.fromNullOr(frame.parentFrame()).pipe(Option.map(makeFrame)),

  childFrames: () => frame.childFrames().map(makeFrame),

  // ── Locators ──
  locator: (selector, options) => makeLocator(frame.locator(selector, options), makePage),

  getByRole: (role, options) => makeLocator(frame.getByRole(role, options), makePage),

  getByText: (text, options) => makeLocator(frame.getByText(text, options), makePage),

  getByLabel: (label, options) => makeLocator(frame.getByLabel(label, options), makePage),

  getByTestId: (testId) => makeLocator(frame.getByTestId(testId), makePage),

  getByPlaceholder: (text, options) => makeLocator(frame.getByPlaceholder(text, options), makePage),

  getByAltText: (text, options) => makeLocator(frame.getByAltText(text, options), makePage),

  getByTitle: (text, options) => makeLocator(frame.getByTitle(text, options), makePage),

  // ── Frames ──
  // Lazy iframe-traversing locator — see {@link Frame.frameLocator}
  frameLocator: (selector: string) =>
    makeFrameLocatorObj(frame.frameLocator(selector), (r) => makeLocator(r, makePage)),

  // ── Waiting ──
  waitForTimeout: (timeout) =>
    Effect.tryPromise({
      try: () => frame.waitForTimeout(timeout),
      catch: wrapError("waitForTimeout"),
    }),

  // ── Escape Hatch ──
  use: <T>(f: (frame: Frame, signal: AbortSignal) => Promise<T>) =>
    Effect.tryPromise({
      try: (signal) => f(frame, signal),
      catch: wrapError("use"),
    }),
});
