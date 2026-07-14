/**
 * @fileoverview Playwright BrowserContext — factory pattern.
 *
 * Wraps @cloudflare/playwright BrowserContext with Effect error handling.
 *
 * @since 0.1.0
 */

// fallow-ignore-file circular-dependencies

import type { BrowserContext, Page, Frame } from "@effect-libs/cloudflare-playwright";
import type { Scope } from "effect";

import type { PlaywrightPage } from "../PlaywrightTypes.js";

import { Effect, Option } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { PlaywrightError, OperationError, ContextError } from "../PlaywrightError.js";
import { makeCDPSession, type PlaywrightCDPSession } from "./PlaywrightCDPSession.js";
import { makePage } from "./PlaywrightPage.js";
import { makeTracing, type PlaywrightTracing } from "./PlaywrightTracing.js";

const wrapError =
  (method: string) =>
  (cause: unknown): PlaywrightError =>
    new PlaywrightError({
      module: "PlaywrightBrowserContext",
      method,
      reason: new OperationError({
        method,
        description: getErrorMessage(cause),
        cause,
      }),
    });

/**
 * Interface for Playwright BrowserContext wrapper.
 *
 * @category wrappers
 */
export interface PlaywrightBrowserContext {
  /**
   * Returns the list of all open pages in the browser context.
   */
  readonly pages: () => Array<Page>;

  /**
   * Opens a new page in the browser context.
   */
  readonly newPage: Effect.Effect<Page, PlaywrightError>;

  /**
   * Closes the browser context.
   */
  readonly close: Effect.Effect<void, PlaywrightError>;

  /**
   * Adds a script which would be evaluated in one of the following scenarios:
   * - Whenever a page is created in the browser context or is navigated.
   * - Whenever a child frame is attached or navigated.
   */
  readonly addInitScript: (
    script: Parameters<BrowserContext["addInitScript"]>[0],
    arg?: Parameters<BrowserContext["addInitScript"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;

  /**
   * Returns the browser that the context belongs to.
   */
  readonly browser: () => Option.Option<
    BrowserContext["browser"] extends () => (infer B) | null ? B : never
  >;

  /**
   * Tracing — produce a Chrome DevTools Performance panel trace for the
   * context. Wraps the upstream `BrowserContext.tracing` namespace so
   * each method returns an `Effect<…, PlaywrightError>`.
   *
   * @see {@link BrowserContext.tracing}
   */
  readonly tracing: PlaywrightTracing;

  /**
   * Create a new raw CDP session against a page or frame in this context.
   * Useful for advanced protocol calls the wrapper does not expose.
   *
   * @see {@link BrowserContext.newCDPSession}
   */
  readonly newCDPSession: (
    target: Page | Frame,
  ) => Effect.Effect<PlaywrightCDPSession, PlaywrightError>;

  /**
   * Clears the cookies from the browser context.
   */
  readonly clearCookies: (options?: {
    name?: string | RegExp;
    domain?: string | RegExp;
    path?: string | RegExp;
  }) => Effect.Effect<void, PlaywrightError>;

  /**
   * Clears the permissions from the browser context.
   */
  readonly clearPermissions: Effect.Effect<void, PlaywrightError>;

  /**
   * Returns the cookies for the browser context.
   */
  readonly cookies: (
    urls?: string | string[],
  ) => Effect.Effect<Awaited<ReturnType<BrowserContext["cookies"]>>, PlaywrightError>;

  /**
   * Adds cookies to the browser context.
   */
  readonly addCookies: (
    cookies: Parameters<BrowserContext["addCookies"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;

  /**
   * Grants permissions to the browser context.
   */
  readonly grantPermissions: (
    permissions: Parameters<BrowserContext["grantPermissions"]>[0],
    options?: Parameters<BrowserContext["grantPermissions"]>[1],
  ) => Effect.Effect<void, PlaywrightError>;

  /**
   * Sets the extra HTTP headers for the browser context.
   */
  readonly setExtraHTTPHeaders: (
    headers: Parameters<BrowserContext["setExtraHTTPHeaders"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;

  /**
   * Sets the geolocation for the browser context.
   */
  readonly setGeolocation: (
    geolocation: Parameters<BrowserContext["setGeolocation"]>[0],
  ) => Effect.Effect<void, PlaywrightError>;

  /**
   * Sets the offline state for the browser context.
   */
  readonly setOffline: (offline: boolean) => Effect.Effect<void, PlaywrightError>;

  /**
   * Sets the default navigation timeout for the browser context.
   */
  readonly setDefaultNavigationTimeout: (timeout: number) => void;

  /**
   * Sets the default timeout for the browser context.
   */
  readonly setDefaultTimeout: (timeout: number) => void;

  /**
   * Returns the storage state of the browser context.
   */
  readonly storageState: (
    options?: Parameters<BrowserContext["storageState"]>[0],
  ) => Effect.Effect<Awaited<ReturnType<BrowserContext["storageState"]>>, PlaywrightError>;

  /**
   * Spawn a new page in this context. The page is cleaned up automatically
   * when the callback returns.
   *
   * Use for multi-tab workflows on the same context — pages in the same
   * context share cookies and localStorage. Mirrors the
   * {@link PlaywrightConnectionHandle.withPage} shape, so a `PlaywrightBrowserContext`
   * and a `PlaywrightContextHandle` (the context returned from
   * `connection.withContext(...)`) expose the same method set.
   *
   * @param fn - Callback receiving a bare {@link PlaywrightPage}.
   *
   * @see {@link PlaywrightPage} for the page methods
   *
   * @example
   * ```typescript
   * yield* browserContext.withPage((page) =>
   *   Effect.gen(function* () {
   *     yield* page.goto("https://example.com");
   *   }),
   * );
   * ```
   */
  readonly withPage: <A, E, R>(
    fn: (page: PlaywrightPage) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PlaywrightError, Exclude<R, Scope.Scope>>;

  /**
   * Generic escape hatch — execute any Promise-returning function on the raw BrowserContext.
   */
  readonly use: <T>(
    f: (context: BrowserContext, signal: AbortSignal) => Promise<T>,
  ) => Effect.Effect<T, PlaywrightError>;
}

/**
 * Factory function to create a PlaywrightBrowserContext from a raw BrowserContext.
 *
 * @category constructors
 */
export const makeBrowserContext = (context: BrowserContext): PlaywrightBrowserContext => {
  const use = <T>(
    f: (context: BrowserContext, signal: AbortSignal) => Promise<T>,
  ): Effect.Effect<T, PlaywrightError> =>
    Effect.tryPromise({
      try: (signal) => f(context, signal),
      catch: wrapError("use"),
    });

  const createNewPage = (): Effect.Effect<Page, PlaywrightError> =>
    Effect.tryPromise({
      try: () => context.newPage(),
      catch: (cause) =>
        new PlaywrightError({
          module: "PlaywrightBrowserContext",
          method: "withPage",
          reason: new ContextError({
            description: getErrorMessage(cause),
            cause,
          }),
        }),
    });

  const closePage = (page: Page): Effect.Effect<void, PlaywrightError> =>
    Effect.tryPromise({
      try: () => page.close(),
      catch: (cause) =>
        new PlaywrightError({
          module: "PlaywrightBrowserContext",
          method: "withPage",
          reason: new ContextError({
            description: getErrorMessage(cause),
            cause,
          }),
        }),
    });

  const withPage: PlaywrightBrowserContext["withPage"] = <A, E, R>(
    fn: (page: PlaywrightPage) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | PlaywrightError, Exclude<R, Scope.Scope>> =>
    Effect.gen(function* () {
      const rawPage = yield* Effect.acquireRelease(createNewPage(), (p) =>
        closePage(p).pipe(Effect.ignore),
      );
      const page = makePage(rawPage);
      return yield* fn(page);
    }).pipe(Effect.scoped);

  return {
    pages: () => context.pages(),
    newPage: use((c) => c.newPage()),
    close: use((c) => c.close()),
    addInitScript: (script, arg) => use((c) => c.addInitScript(script, arg)),
    browser: () =>
      Option.fromNullOr(context.browser()).pipe(
        Option.map(
          (b) => b as BrowserContext["browser"] extends () => (infer B) | null ? B : never,
        ),
      ),
    tracing: makeTracing(context.tracing),
    newCDPSession: (target) =>
      Effect.tryPromise({
        try: () => context.newCDPSession(target),
        catch: (cause) =>
          new PlaywrightError({
            module: "PlaywrightBrowserContext",
            method: "newCDPSession",
            reason: new OperationError({
              method: "newCDPSession",
              description: getErrorMessage(cause),
              cause,
            }),
          }),
      }).pipe(Effect.map(makeCDPSession)),
    clearCookies: (options) => use((c) => c.clearCookies(options)),
    clearPermissions: use((c) => c.clearPermissions()),
    cookies: (urls) => use((c) => c.cookies(urls)),
    addCookies: (cookies) => use((c) => c.addCookies(cookies)),
    grantPermissions: (permissions, options) =>
      use((c) => c.grantPermissions(permissions, options)),
    setExtraHTTPHeaders: (headers) => use((c) => c.setExtraHTTPHeaders(headers)),
    setGeolocation: (geolocation) => use((c) => c.setGeolocation(geolocation)),
    setOffline: (offline) => use((c) => c.setOffline(offline)),
    setDefaultNavigationTimeout: (timeout) => context.setDefaultNavigationTimeout(timeout),
    setDefaultTimeout: (timeout) => context.setDefaultTimeout(timeout),
    storageState: (options) => use((c) => c.storageState(options)),
    withPage,
    use,
  };
};
