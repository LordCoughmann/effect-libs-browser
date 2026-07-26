/**
 * Type-level definitions for the Playwright service: scope bundles, handles,
 * and the service contract itself.
 *
 * All exports are types only; no runtime code lives in this file. The
 * implementation is in `Playwright.ts` (service factory) and the
 * `internal/` subfolder (page, locator, fetch wrappers).
 *
 * @category models
 * @since 0.1.0
 */

import type { Effect, Scope } from "effect";

import type {
  BrowserProviderError,
  BrowserProviderService,
  BrowserProviderSession,
  BrowserProviderSessionBase,
} from "@effect-libs/browser";

import type { PlaywrightBrowserContext } from "./internal/PlaywrightBrowserContext.js";
import type { PlaywrightPageExtensions } from "./internal/PlaywrightExtensions.js";
import type {
  PlaywrightPage as BasePlaywrightPage,
  PlaywrightLocator,
  PlaywrightFrameLocator,
} from "./internal/PlaywrightMethods.js";
import type { PlaywrightError } from "./PlaywrightError.js";

// Re-export the method wrapper interfaces for convenience
/**
 * Effect-friendly locator wrapper returned by `page.locator(...)`. Mirrors the
 * upstream `Locator` API with a uniform Effect-based error channel.
 *
 * @see [Playwright `Locator` reference](https://playwright.dev/docs/api/class-locator) for the upstream API
 *
 * @category models
 * @since 0.1.0
 */
export type {
  /**
   * @category models
   * @since 0.1.0
   */
  PlaywrightLocator,
  /**
   * @category models
   * @since 0.1.0
   */
  PlaywrightFrameLocator,
};
/**
 * Effect-friendly methods layered on top of the upstream Playwright page:
 * cookie helpers, network interception, fetch helpers, and other
 * Effect-native ergonomics composed into the consumer-facing page type.
 *
 * @see {@link PlaywrightPage} for the composed type that scope callbacks actually receive
 *
 * @category models
 * @since 0.1.0
 */
export type {
  /**
   * @category models
   * @since 0.1.0
   */
  PlaywrightPageExtensions,
} from "./internal/PlaywrightExtensions.js";

// Re-export fetch types for consumers
/**
 * Response and options types for the Effect-friendly `page.fetch(...)` helper
 * exposed via {@link PlaywrightPageExtensions}.
 *
 * @see {@link PlaywrightPage} for the consumer-facing page type
 *
 * @category models
 * @since 0.1.0
 */
export type {
  /**
   * @category models
   * @since 0.1.0
   */
  FetchResponse,
  /**
   * @category models
   * @since 0.1.0
   */
  FetchOptions,
} from "./internal/PlaywrightFetch.js";
/**
 * The page type that scope callbacks receive: the upstream `Page` from
 * `@cloudflare/playwright` extended with this library's Effect-friendly
 * helpers (cookies, network interception, fetch wrappers).
 *
 * The `page` field of every scope bundle (`PlaywrightSessionScope`,
 * `PlaywrightConnectionScope`, `PlaywrightContextScope`) is a
 * `PlaywrightPage`; consumers should hover on that field to see the full
 * method surface.
 *
 * @see {@link PlaywrightPageExtensions} for the Effect-friendly methods added on top of the upstream page
 * @see [Playwright `Page` reference](https://playwright.dev/docs/api/class-page) for the upstream API surface
 *
 * @category models
 * @since 0.1.0
 */
export type PlaywrightPage = BasePlaywrightPage & PlaywrightPageExtensions;

// ── Scopes ────────────────────────────────────────────────────────────────────

/**
 * The outermost scope bundle. Fields are passed to the
 * {@link PlaywrightService.withSession} callback and returned by
 * {@link PlaywrightService.acquireSession}.
 *
 * @see {@link PlaywrightService.withSession} for the callback entry point
 *
 * @category models
 * @since 0.1.0
 */
export interface PlaywrightSessionScope<S extends BrowserProviderSession = BrowserProviderSession> {
  /**
   * The remote browser instance for this scope — a single isolated
   * browser on the provider's infrastructure, with its own cookies,
   * localStorage, and state.
   *
   * See {@link BrowserProviderSession} for the per-field shape.
   *
   * Provider features and limits (timeouts, live view, recording,
   * billing) vary by provider — see your provider's documentation.
   *
   * Cleaned up automatically when the callback returns.
   */
  readonly session: S;
  /**
   * The connection handle. See {@link PlaywrightConnectionHandle}.
   *
   * Cleaned up automatically when the callback returns.
   */
  readonly connection: PlaywrightConnectionHandle;
  /**
   * The context handle. See {@link PlaywrightContextHandle}.
   *
   * Cleaned up automatically when the callback returns.
   */
  readonly context: PlaywrightContextHandle;
  /**
   * The default Playwright page — the provider session's first browser tab when
   * one already exists, or a newly created tab when the session has no pages.
   * Use it to navigate, click, read content, and capture state. See
   * [Playwright's `Page` reference](https://playwright.dev/docs/api/class-page)
   * for the full API.
   *
   * Cleaned up automatically when the session ends; a pre-existing provider
   * page is left open until the provider releases the session.
   */
  readonly page: PlaywrightPage;
}

/**
 * The connection-scope bundle. Fields are passed to the
 * {@link PlaywrightService.withConnection} callback and returned by
 * {@link PlaywrightService.acquireConnection}.
 *
 * **Note on the default page lifetime:** the `page` in this bundle is
 * the *default* page created when the connection was acquired — it's
 * the same page that `connection.withPage(...)` would return if you
 * called it inside this scope. It is closed when the scope exits.
 *
 * If you open additional tabs inside the callback (via
 * `connection.withPage((page) => ...)`), those tabs are also kept
 * alive until the scope exits; only the scope boundary closes them.
 * In other words, there's no "the default page outlives the others"
 * distinction — all pages share the connection's lifetime.
 *
 * @see {@link PlaywrightService.withConnection} for the callback entry point
 * @see {@link PlaywrightSessionScope} for the outer scope (with `session`)
 *
 * @category models
 * @since 0.1.0
 */
export interface PlaywrightConnectionScope {
  /**
   * The connection handle. See {@link PlaywrightConnectionHandle}.
   *
   * Cleaned up automatically when the callback returns.
   */
  readonly connection: PlaywrightConnectionHandle;
  /**
   * The context handle. See {@link PlaywrightContextHandle}.
   *
   * Cleaned up automatically when the callback returns.
   */
  readonly context: PlaywrightContextHandle;
  /**
   * The default Playwright page — the first tab created when the
   * connection was acquired. It shares its lifetime with the
   * connection: it's closed when this scope exits, alongside any
   * additional tabs opened via `connection.withPage(...)`. Use
   * `connection.withPage(...)` for additional tabs; don't assume
   * the default page will outlive them.
   *
   * See [Playwright's `Page` reference](https://playwright.dev/docs/api/class-page)
   * for the full API.
   *
   * Cleaned up automatically when the callback returns.
   */
  readonly page: PlaywrightPage;
}

/**
 * The context-scope bundle. Fields are passed to the
 * {@link PlaywrightConnectionHandle.withContext} callback.
 *
 * @see {@link PlaywrightConnectionHandle.withContext} for the entry point
 *
 * @category models
 * @since 0.1.0
 */
export interface PlaywrightContextScope {
  /**
   * The context handle. See {@link PlaywrightContextHandle}.
   *
   * Cleaned up automatically when the callback returns.
   */
  readonly context: PlaywrightContextHandle;
  /**
   * The default Playwright page — a browser tab scoped to this isolated
   * context. Use it to navigate, click, read content, and capture
   * state. See [Playwright's `Page`
   * reference](https://playwright.dev/docs/api/class-page) for the full
   * API.
   *
   * Cleaned up automatically when the callback returns.
   */
  readonly page: PlaywrightPage;
}

// Note: the page level has no scope-bundle type. A page is the only resource at
// its level, so `acquirePage` returns {@link PlaywrightPage} directly and the
// `withPage` / `connection.withPage` / `context.withPage` callbacks receive a
// bare `page`, never wrapped in a bundle.

// ── Handles ───────────────────────────────────────────────────────────────────

/**
 * Connection handle, provided in the scope bundles returned by
 * {@link PlaywrightService.withSession},
 * {@link PlaywrightService.withConnection},
 * {@link PlaywrightService.acquireSession}, and
 * {@link PlaywrightService.acquireConnection}.
 *
 * @see {@link PlaywrightService.withConnection} for how this handle reaches the caller
 *
 * @category models
 * @since 0.1.0
 */
export interface PlaywrightConnectionHandle {
  /**
   * Spawn an isolated browser context with a default page. The context
   * and page are cleaned up automatically when the callback returns.
   *
   * Use for multi-tenant or state-isolated workflows — separate
   * cookies, localStorage, and cache from other contexts on the same
   * connection.
   *
   * The callback receives a {@link PlaywrightContextScope} (a `context`
   * handle and a `page`). See [Playwright's `BrowserContext`
   * reference](https://playwright.dev/docs/api/class-browsercontext)
   * for the underlying API.
   *
   * @param fn - Callback receiving a {@link PlaywrightContextScope}.
   *
   * @see {@link PlaywrightContextScope} for the scope fields (hover each field for details)
   *
   * @example
   * ```typescript
   * yield* connection.withContext(({ context, page }) =>
   *   Effect.gen(function* () {
   *     // ... use isolated cookies / localStorage ...
   *   }),
   * );
   * ```
   */
  readonly withContext: <A, E, R>(
    fn: (scope: PlaywrightContextScope) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PlaywrightError, Exclude<R, Scope.Scope>>;

  /**
   * Spawn a new tab in the default context. The page is cleaned up
   * automatically when the callback returns.
   *
   * Use for multi-tab workflows on the same connection — pages in the
   * same context share cookies and localStorage.
   *
   * The callback receives a bare {@link PlaywrightPage}. See
   * [Playwright's `Page` reference](https://playwright.dev/docs/api/class-page)
   * for the page methods.
   *
   * @param fn - Callback receiving a bare {@link PlaywrightPage}.
   *
   * @see {@link PlaywrightPage} for the page methods
   *
   * @example
   * ```typescript
   * yield* connection.withPage((page) =>
   *   Effect.gen(function* () {
   *     yield* page.goto("https://example.com");
   *   }),
   * );
   * ```
   */
  readonly withPage: <A, E, R>(
    fn: (page: PlaywrightPage) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PlaywrightError, Exclude<R, Scope.Scope>>;
}

/**
 * Context handle for an isolated browser context, created by
 * {@link PlaywrightConnectionHandle.withContext} and provided in the
 * corresponding scope bundle.
 *
 * `PlaywrightContextHandle` is the same shape as {@link PlaywrightBrowserContext}
 * — the standalone factory. The wrapper exposes a single, uniform context
 * type across both paths so users do not have to learn a narrower API
 * surface for the handle returned from `withContext` versus the broader
 * factory. Every method (cookies, storageState, setGeolocation,
 * grantPermissions, setOffline, setDefaultTimeout, etc.) is reachable
 * from a context handle.
 *
 * @see {@link PlaywrightConnectionHandle.withContext} for how this handle is created
 * @see {@link PlaywrightBrowserContext} for the full method set
 *
 * @category models
 * @since 0.1.0
 */
export type PlaywrightContextHandle = PlaywrightBrowserContext;

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Service contract for `browser-playwright`. See {@link Playwright} for
 * the consumer-facing entry point and {@link PlaywrightPage} for the page
 * type the scope callbacks receive.
 *
 * @see {@link Playwright} for the service tag and layer
 * @see {@link PlaywrightSessionScope} for the outermost scope bundle
 * @see {@link PlaywrightConnectionScope} for the connection-scope bundle
 * @see {@link PlaywrightPage} for the consumer-facing page type
 *
 * @category services
 * @since 0.1.0
 */
export interface PlaywrightService {
  /**
   * Creates a fresh browser session. The session, connection, context,
   * and page are cleaned up automatically when the callback returns.
   *
   * Use for one-off scraping jobs, per-request clean slates, or any
   * automation that doesn't need to persist cookies or login state. For
   * human-in-the-loop flows — where an operator logged in elsewhere — use
   * {@link withConnection} instead.
   *
   * The callback receives `{ session, connection, context, page }`. See
   * [Playwright's `Browser` reference](https://playwright.dev/docs/api/class-browser)
   * for the underlying browser/session API.
   *
   * @param source - Provider service and optional session options.
   * @param fn - Callback receiving a {@link PlaywrightSessionScope}.
   *
   * @see {@link PlaywrightSessionScope} for the scope fields (hover each field for details)
   *
   * @example
   * ```typescript
   * const stories = yield* playwright.withSession({ provider }, ({ page, session }) =>
   * Effect.gen(function* () {
   * yield* page.goto("https://news.ycombinator.com");
   * const id = session.id; // provider-specific session identifier
   * // ...
   * }),
   * );
   * ```
   */
  readonly withSession: <T extends BrowserProviderSessionBase, O, A, E, R>(
    source: { readonly provider: BrowserProviderService<T, O>; readonly options?: O },
    fn: (scope: PlaywrightSessionScope<T & BrowserProviderSession>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PlaywrightError | BrowserProviderError, Exclude<R, Scope.Scope>>;

  /**
   * Connects to an existing browser. The connection, context, and page
   * are cleaned up automatically when the callback returns.
   *
   * Use to reuse an existing browser's authentication state, cookies, or
   * localStorage — for example, a session created elsewhere, or a
   * human-in-the-loop flow where an operator logged in via live view.
   *
   * The callback receives `{ connection, context, page }`. See
   * [Playwright's `BrowserContext` reference](https://playwright.dev/docs/api/class-browsercontext)
   * for the underlying API.
   *
   * @param source - `{ url }` (CDP WebSocket URL) or `{ session }` (existing provider session).
   * @param fn - Callback receiving a {@link PlaywrightConnectionScope}.
   *
   * @see {@link PlaywrightConnectionScope} for the scope fields (hover each field for details)
   *
   * @example
   * ```typescript
   * const title = yield* playwright.withConnection({ url: cdpUrl }, ({ page }) =>
   * Effect.gen(function* () {
   * yield* page.goto("https://example.com");
   * return yield* page.title;
   * }),
   * );
   * ```
   */
  readonly withConnection: <A, E, R>(
    source: { readonly url: string } | { readonly session: BrowserProviderSession },
    fn: (scope: PlaywrightConnectionScope) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PlaywrightError, Exclude<R, Scope.Scope>>;

  /**
   * Creates a fresh page. The page is cleaned up automatically when the
   * callback returns.
   *
   * Use for the simplest case — open a page against an existing
   * connection. The callback receives a bare `page` — with no connection or
   * context exposed. See [Playwright's `Page`
   * reference](https://playwright.dev/docs/api/class-page) for the page
   * methods.
   *
   * @param source - `{ url }` (CDP WebSocket URL) or `{ session }` (existing provider session).
   * @param fn - Callback receiving a bare {@link PlaywrightPage}.
   *
   * @see {@link PlaywrightPage} for the page methods
   *
   * @example
   * ```typescript
   * // A page-returning function slots straight in as the callback
   * const getTitle = (page: PlaywrightPage) => page.title;
   * yield* playwright.withPage({ url: cdpUrl }, getTitle);
   * ```
   */
  readonly withPage: <A, E, R>(
    source: { readonly url: string } | { readonly session: BrowserProviderSession },
    fn: (page: PlaywrightPage) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PlaywrightError, Exclude<R, Scope.Scope>>;

  /**
   * Creates a fresh browser session in the caller's scope. The primitive
   * form of {@link withSession}: no callback, so the session can outlive
   * a single operation.
   *
   * Use for pooling, fan-out, or long-lived workers. The session,
   * connection, context, and page are cleaned up when the scope ends.
   * Close with `Effect.scoped` or a long-lived `Scope.make()`.
   *
   * @param source - Provider service and optional session options.
   *
   * @see {@link PlaywrightSessionScope} for the return type
   *
   * @example
   * ```typescript
   * const { session, page } = yield* playwright
   * .acquireSession({ provider })
   * .pipe(Effect.scoped);
   * ```
   */
  readonly acquireSession: <T extends BrowserProviderSessionBase, O>(source: {
    readonly provider: BrowserProviderService<T, O>;
    readonly options?: O;
  }) => Effect.Effect<
    PlaywrightSessionScope<T & BrowserProviderSession>,
    PlaywrightError | BrowserProviderError,
    Scope.Scope
  >;

  /**
   * Connects to an existing browser in the caller's scope. The primitive
   * form of {@link withConnection}: no callback, so the connection can
   * stay alive across operations.
   *
   * Use to fan out pages, interleave other work, or keep the connection
   * alive across requests. The connection, context, and page are cleaned
   * up when the scope ends.
   *
   * @param source - `{ url }` (CDP WebSocket URL) or `{ session }` (existing provider session).
   *
   * @see {@link PlaywrightConnectionScope} for the return type
   *
   * @example
   * ```typescript
   * const { connection, page } = yield* playwright
   * .acquireConnection({ url: cdpUrl })
   * .pipe(Effect.scoped);
   * ```
   */
  readonly acquireConnection: (
    source: { readonly url: string } | { readonly session: BrowserProviderSession },
  ) => Effect.Effect<PlaywrightConnectionScope, PlaywrightError, Scope.Scope>;

  /**
   * Creates a fresh page in the caller's scope. The primitive form of
   * {@link withPage}: no callback, so the page can stay alive across
   * operations.
   *
   * The page is cleaned up when the scope ends.
   *
   * @param source - `{ url }` (CDP WebSocket URL) or `{ session }` (existing provider session).
   *
   * @see {@link PlaywrightPage} for the page methods
   *
   * @example
   * ```typescript
   * const page = yield* playwright.acquirePage({ url: cdpUrl }).pipe(Effect.scoped);
   * yield* page.goto("https://example.com");
   * ```
   */
  readonly acquirePage: (
    source: { readonly url: string } | { readonly session: BrowserProviderSession },
  ) => Effect.Effect<PlaywrightPage, PlaywrightError, Scope.Scope>;
}
