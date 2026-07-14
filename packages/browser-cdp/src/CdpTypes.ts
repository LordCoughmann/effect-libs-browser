/**
 * CDP service interfaces — scopes, handles, and service definition.
 *
 * Type-only file. No runtime code. All implementation lives in `Cdp.ts`.
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

import type { CdpError } from "./CdpError.js";
import type {
  CdpPageService,
  CdpWebSocketRouteHandlerCallback,
  EvaluateFn,
  RouteHandlerCallback,
  RouteOptions,
  RouteUrlMatch,
} from "./internal/CdpPage.js";
import type { CdpCookie } from "./internal/CdpSchema.js";
import type { CookieData } from "./internal/Page/Cookies.js";
// Re-import the public-facing types from their canonical home so the JSDoc
// references on `storageState` / `addStorageState` resolve.
import type { Geolocation } from "./internal/Page/Geolocation.js";
import type { GrantPermissionsOptions, PermissionName } from "./internal/Page/Permissions.js";
import type { StorageState } from "./internal/Page/StorageState.js";
import type { UserAgentMetadata } from "./internal/Page/UserAgent.js";

// ── Scopes ────────────────────────────────────────────────────────────────────
// Bundles handed to `withX` callbacks / returned by `acquireX` primitives.

/**
 * Scope callback for {@link CdpService.withSession} / return value of
 * {@link CdpService.acquireSession}.
 *
 * The outermost scope. The provider allocates a fresh browser and all resources
 * are released when the callback completes.
 *
 * **When to use:**
 * - One-off scraping jobs
 * - Each request needs a clean browser slate
 * - No need to persist cookies or login state
 * - Single-operation automation
 *
 * **Reachable from here:**
 * - `connection.withContext(...)`: isolated browser context (separate cookies)
 * - `connection.withPage(...)`: new tab in the default context (shared cookies)
 * - `page.goto`, `page.click`, etc.: page operations
 *
 * @example
 * ```typescript
 * import { Cdp } from "@effect-libs/browser-cdp";
 * import { BrowserProvider } from "@effect-libs/browser";
 * import { Effect } from "effect";
 *
 * const scrapeProduct = (url: string) =>
 *   Effect.gen(function* () {
 *     const cdp = yield* Cdp;
 *     const provider = yield* BrowserProvider;
 *
 *     return yield* cdp.withSession({ provider }, ({ page }) =>
 *       Effect.gen(function* () {
 *         yield* page.goto(url);
 *         return yield* page.evaluate(() => document.title);
 *       }),
 *     );
 *   });
 * ```
 *
 * @see [Scoping guide](../../docs/guides/scoping.md) for choosing between session/connection/context/page scope.
 */
export interface CdpSessionScope<S extends BrowserProviderSession = BrowserProviderSession> {
  /**
   * The provider session: holds `id`, `cdpUrl`, `createdAt`, and `liveViewUrl`.
   * Use `session.id` to reference this session in provider API calls.
   *
   * @see {@link BrowserProviderSession} for the session shape.
   */
  readonly session: S;
  /**
   * The connection handle: creates additional contexts and pages.
   *
   * - `connection.withContext((page) => ...)`: isolated browser context (separate cookies)
   * - `connection.withPage((page) => ...)`: new tab in the default context (shared cookies)
   *
   * @see {@link CdpConnectionHandle} for all available methods.
   */
  readonly connection: CdpConnectionHandle;
  /**
   * The default context: manages cookies and storage for the default page.
   *
   * - `context.cookies()`, `context.addCookies()`, `context.clearCookies()`
   * - `context.setUserAgent()`, `context.setGeolocation()`
   * - `context.setOffline()`
   * - `context.grantPermissions()`, `context.clearPermissions()`
   * - `context.storageState()`, `context.addStorageState()`
   *
   * @see {@link CdpContextHandle} for all available methods.
   */
  readonly context: CdpContextHandle;
  /**
   * The default page: a fresh browser tab in the default context.
   *
   * Automatically closed when the scope callback completes.
   *
   * @see {@link CdpPageService} for all available methods.
   */
  readonly page: CdpPageService;
}

/**
 * Scope callback for {@link CdpService.withConnection} / return value of
 * {@link CdpService.acquireConnection}.
 *
 * A connection provides a CDP WebSocket to a browser without managing the
 * session lifecycle, for connecting to an existing browser and reusing its
 * authentication state, cookies, and localStorage from a previous login.
 *
 * **When to use:**
 * - Human-in-the-loop: an operator completed login, now automation runs
 * - Reuse a session across multiple operations
 * - Provider session created elsewhere
 * - Need `connection.withContext` or `connection.withPage` for nested operations
 *
 * **Reachable from here:**
 * - `connection.withContext(...)`: isolated browser context (separate cookies)
 * - `connection.withPage(...)`: new tab in the default context (shared cookies)
 * - `page.goto`, `page.click`, etc.: page operations
 *
 * @example
 * ```typescript
 * import { Cdp } from "@effect-libs/browser-cdp";
 * import { Effect } from "effect";
 *
 * // Operator logged in via live view; connect to the same session
 * const data = yield* cdp.withConnection({ url: cdpUrl }, ({ page }) =>
 *   Effect.gen(function* () {
 *     // Authenticated; navigate to the protected page
 *     yield* page.goto("https://saas.example.com/dashboard");
 *     return yield* page.evaluate(() => document.title);
 *   }),
 * );
 * ```
 *
 * @see [Scoping guide](../../docs/guides/scoping.md) for choosing between session/connection/context/page scope.
 */
export interface CdpConnectionScope {
  /**
   * The connection handle: creates additional contexts and pages.
   *
   * - `connection.withContext((page) => ...)`: isolated browser context (separate cookies)
   * - `connection.withPage((page) => ...)`: new tab in the default context (shared cookies)
   *
   * @see {@link CdpConnectionHandle} for all available methods.
   */
  readonly connection: CdpConnectionHandle;
  /**
   * The default context: manages cookies and storage for the default page.
   *
   * - `context.cookies()`, `context.addCookies()`, `context.clearCookies()`
   * - `context.setUserAgent()`, `context.setGeolocation()`
   * - `context.setOffline()`
   * - `context.grantPermissions()`, `context.clearPermissions()`
   * - `context.storageState()`, `context.addStorageState()`
   *
   * @see {@link CdpContextHandle} for all available methods.
   */
  readonly context: CdpContextHandle;
  /**
   * The default page: a fresh browser tab in the default context.
   *
   * Automatically closed when the scope callback completes.
   *
   * @see {@link CdpPageService} for all available methods.
   */
  readonly page: CdpPageService;
}

/**
 * Scope callback for {@link CdpConnectionHandle.withContext}.
 *
 * A browser context is an isolated sandbox within a connection. Each context
 * has its own cookies, localStorage, and cache, fully separate from other
 * contexts.
 *
 * **When to use:**
 * - Multi-tenant: check prices from different accounts
 * - Parallel test scenarios with no state leakage
 * - Isolate different users' data within one session
 *
 * **Reachable from here:**
 * - `context.withPage(...)`: new page in this isolated context (shared cookies)
 * - `context.cookies()`, `context.addCookies()`, `context.clearCookies()`
 * - `context.setUserAgent()`, `context.setGeolocation()`
 * - `context.setOffline()`
 * - `context.grantPermissions()`, `context.clearPermissions()`
 * - `context.storageState()`, `context.addStorageState()`
 * - `page.goto`, `page.click`, etc.: page operations
 *
 * @example
 * ```typescript
 * import { Cdp } from "@effect-libs/browser-cdp";
 * import { Effect } from "effect";
 *
 * // Two accounts, one session, isolated contexts
 * const personalPrice = yield* connection.withContext(({ page }) =>
 *   Effect.gen(function* () {
 *     yield* page.goto("https://shop.example.com/login");
 *     yield* page.goto("https://shop.example.com/product/123");
 *     return yield* page.evaluate(() => document.querySelector(".price")?.textContent);
 *   }),
 * ); // Context closed; personal cookies released
 *
 * const businessPrice = yield* connection.withContext(({ page }) =>
 *   Effect.gen(function* () {
 *     // Fresh state; no leakage from the personal context
 *     yield* page.goto("https://shop.example.com/login");
 *   }),
 * );
 * ```
 *
 * @see [Scoping guide](../../docs/guides/scoping.md) for choosing between session/connection/context/page scope.
 */
export interface CdpContextScope {
  /**
   * The context handle: creates additional pages within this isolated context.
   *
   * Pages created via `context.withPage(...)` share cookies and storage with
   * each other but are isolated from pages in other contexts.
   *
   * @see {@link CdpContextHandle} for all available methods.
   */
  readonly context: CdpContextHandle;
  /**
   * The default page: a fresh browser tab in this isolated context.
   *
   * Automatically closed when the scope callback completes.
   *
   * @see {@link CdpPageService} for all available methods.
   */
  readonly page: CdpPageService;
}

// Note: the page level has no scope-bundle type. A page is the only resource at
// its level, so `acquirePage` returns {@link CdpPageService} directly and the
// `withPage` / `connection.withPage` / `context.withPage` callbacks receive a
// bare `page`, never wrapped in a bundle.

// ── Handles ───────────────────────────────────────────────────────────────────

/**
 * Connection handle for a CDP browser connection.
 *
 * Provided in {@link CdpService.withSession} / {@link CdpService.withConnection}
 * scope callbacks (and {@link CdpService.acquireSession} /
 * {@link CdpService.acquireConnection} scope bundles).
 *
 * @example
 * ```typescript
 * yield* cdp.withConnection({ url: cdpUrl }, ({ connection, page }) =>
 *   Effect.gen(function* () {
 *     // Open more tabs with shared cookies
 *     yield* connection.withPage((page) =>
 *       Effect.gen(function* () {
 *         yield* page.goto("https://example.com/search?page=2");
 *       }),
 *     );
 *     // Isolated identity with fresh cookies
 *     yield* connection.withContext((page) =>
 *       Effect.gen(function* () {
 *         yield* page.goto("https://example.com/login");
 *       }),
 *     );
 *   }),
 * );
 * ```
 *
 * @see [Scoping guide](../../docs/guides/scoping.md) for connection vs context vs page usage.
 */
export interface CdpConnectionHandle {
  /**
   * Create a new isolated browser context with a default page.
   *
   * Each context has its own cookies, localStorage, and cache, fully separate
   * from other contexts. Use for multi-tenant scenarios or parallel tests with
   * no state leakage.
   *
   * @param fn - Callback receiving a {@link CdpContextScope} with `context` handle and `page`.
   *
   * @example
   * ```typescript
   * // Isolated context for each account
   * yield* connection.withContext((page) =>
   *   Effect.gen(function* () {
   *     yield* page.goto("https://shop.example.com/login");
   *   }),
   * );
   * ```
   */
  readonly withContext: <A, E, R>(
    fn: (scope: CdpContextScope) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | CdpError, Exclude<R, Scope.Scope>>;

  /**
   * Create a new page in the default context.
   *
   * Pages share cookies and storage with other pages in the same context. Use
   * for multi-tab workflows where tabs need the same site state.
   *
   * @param fn - Callback receiving a bare {@link CdpPageService}.
   *
   * @example
   * ```typescript
   * // Multiple tabs with shared login
   * yield* connection.withPage((page) =>
   *   Effect.gen(function* () {
   *     yield* page.goto("https://example.com/search?page=2");
   *   }),
   * );
   * ```
   */
  readonly withPage: <A, E, R>(
    fn: (page: CdpPageService) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | CdpError, Exclude<R, Scope.Scope>>;
}

/**
 * Context handle for an isolated CDP browser context.
 *
 * Created by {@link CdpConnectionHandle.withContext}. Pages within a
 * context share cookies and storage; different contexts are isolated from each
 * other.
 *
 * @example
 * ```typescript
 * yield* connection.withContext(({ context, page }) =>
 *   Effect.gen(function* () {
 *     // Default page in this context
 *     yield* page.goto("https://example.com");
 *
 *     // More pages in the same context, with shared cookies
 *     yield* context.withPage((page) =>
 *       Effect.gen(function* () {
 *         yield* page.goto("https://example.com/other");
 *       }),
 *     );
 *   }),
 * );
 * ```
 *
 * @see [Scoping guide](../../docs/guides/scoping.md) for connection vs context vs page usage.
 */
export interface CdpContextHandle {
  /**
   * Create a new page in this context.
   *
   * The page shares cookies and storage with other pages in the same context.
   * Different contexts are isolated, with no cookie leakage between them.
   *
   * @param fn - Callback receiving a bare {@link CdpPageService}.
   *
   * @example
   * ```typescript
   * yield* context.withPage((page) =>
   *   Effect.gen(function* () {
   *     yield* page.goto("https://example.com");
   *   }),
   * );
   * ```
   */
  readonly withPage: <A, E, R>(
    fn: (page: CdpPageService) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | CdpError, Exclude<R, Scope.Scope>>;

  /** Read cookies for this context, optionally filtered to `urls`. */
  readonly cookies: (urls?: string | string[]) => Effect.Effect<CdpCookie[], CdpError>;

  /** Add cookies to this context. */
  readonly addCookies: (cookies: CookieData[]) => Effect.Effect<void, CdpError>;

  /** Clear cookies in this context, optionally filtered by name/domain/path. */
  readonly clearCookies: (options?: {
    name?: string;
    domain?: string;
    path?: string;
  }) => Effect.Effect<void, CdpError>;

  /**
   * Override the user agent for every page in this context.
   *
   * Uses CDP `Emulation.setUserAgentOverride`. The override applies to all
   * pages created in this context, including the default page returned from
   * `withContext` and any subsequent pages opened via `withPage`.
   *
   * Common use cases:
   * - **Scraping:** rotate user agents for fingerprinting evasion.
   * - **Agents:** match a specific browser fingerprint (combine with
   *   `userAgentMetadata` to also send matching `Sec-CH-UA-*` client hints).
   *
   * Calling this on the default context affects every page opened via
   * `withPage` (which all share the default context). Calling this on an
   * isolated context affects only that context's pages.
   *
   * @param userAgent - The user-agent string to send in the `User-Agent`
   *   header and surface on `navigator.userAgent`.
   * @param options - Optional Client Hints metadata. When provided, the
   *   browser also sends matching `Sec-CH-UA-*` request headers.
   *
   * @see {@link https://wicg.github.io/ua-client-hints/} for the
   *   User-Agent Client Hints spec.
   */
  readonly setUserAgent: (
    userAgent: string,
    options?: { readonly userAgentMetadata?: UserAgentMetadata },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Override the geolocation for every page in this context.
   *
   * Uses CDP `Emulation.setGeolocationOverride`. The override applies to all
   * pages created in this context, including the default page returned from
   * `withContext` and any subsequent pages opened via `withPage`. After this
   * is set, `navigator.geolocation.getCurrentPosition` resolves with the
   * given coordinates on every page in the context.
   *
   * Common use cases:
   * - **Scraping:** "near me" / local-business sites (Yelp, Google Maps,
   *   store locators) need a realistic geolocation or get blocked / served
   *   fake data.
   * - **Agents:** location-aware pages (food delivery, ride-share) require
   *   the override to behave correctly.
   *
   * Pass `undefined` to clear the override; the browser will then report
   * position unavailable from `navigator.geolocation`. Mirrors Playwright's
   * `BrowserContext.setGeolocation(undefined)` semantics.
   *
   * @param geolocation - Geolocation coordinates, or `undefined` to clear
   *   any existing override.
   *
   * @example
   * ```typescript
   * // Set coords
   * yield* context.setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
   *
   * // Clear
   * yield* context.setGeolocation(undefined);
   * ```
   *
   * @see {@link https://wicg.github.io/geolocation-api/} for the underlying
   *   Geolocation API spec.
   */
  readonly setGeolocation: (geolocation: Geolocation | undefined) => Effect.Effect<void, CdpError>;

  /**
   * Toggle the network offline state for every page in this context.
   *
   * Uses CDP `Network.emulateNetworkConditions`. When `offline` is `true`,
   * in-flight and new network requests on every page in the context fail
   * with `net::ERR_INTERNET_DISCONNECTED`. When `offline` is `false`,
   * normal connectivity is restored.
   *
   * Common use cases:
   * - **Agents:** test "what happens when the network drops" — a standard
   *   resilience pattern in agent test suites.
   *
   * Calling this on the default context affects every page opened via
   * `withPage` (which all share the default context). Calling this on an
   * isolated context affects only that context's pages.
   *
   * @param offline - `true` to make requests fail with
   *   `net::ERR_INTERNET_DISCONNECTED`; `false` to restore connectivity.
   *
   * @example
   * ```typescript
   * yield* context.setOffline(true);
   * // ... in-flight and new requests will fail ...
   * yield* context.setOffline(false);
   * ```
   */
  readonly setOffline: (offline: boolean) => Effect.Effect<void, CdpError>;

  /**
   * Grant the given permissions to every origin in this context.
   *
   * Uses CDP `Browser.grantPermissions`. After this is called, the named
   * permissions are auto-granted for every page in the context — calls like
   * `navigator.geolocation.getCurrentPosition` no longer wait for a user
   * prompt.
   *
   * Common use cases:
   * - **Scraping:** set up a context once (e.g. grant `"geolocation"`,
   *   `"notifications"`) so all subsequent pages in the context skip the
   *   permission UI.
   * - **Agents:** many agent flows need clipboard, geolocation, or
   *   notifications — granting them at the context level prevents prompts
   *   from blocking automation.
   *
   * @param permissions - Names of permissions to grant. See
   *   {@link PermissionName} for the supported list. Pass the Web Platform
   *   permission names from `navigator.permissions`.
   * @param options - Optional scoping options. Use `origin` to restrict
   *   the grant to a single origin (e.g. `"https://example.com"`). When
   *   omitted, all origins are granted.
   *
   * @see {@link clearPermissions} to remove grants.
   * @see {@link https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-grantPermissions}
   *   for the underlying CDP call.
   */
  readonly grantPermissions: (
    permissions: ReadonlyArray<PermissionName>,
    options?: GrantPermissionsOptions,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Reset all permission management for all origins in this context.
   *
   * Uses CDP `Browser.resetPermissions`. After this is called, every
   * permission in the context returns to the browser default (typically
   * `"prompt"`), so a subsequent request to use a permission (e.g.
   * `navigator.geolocation.getCurrentPosition`) shows the permission UI
   * again.
   *
   * Mirrors Playwright's `BrowserContext.clearPermissions()` semantics.
   *
   * @see {@link grantPermissions} to set grants.
   */
  readonly clearPermissions: () => Effect.Effect<void, CdpError>;

  /**
   * Snapshot the context's persisted state — cookies and per-origin
   * `localStorage` — for serialization to disk.
   *
   * Mirrors Playwright's `BrowserContext.storageState()`. The result is
   * JSON-serializable; round-trip with {@link addStorageState}.
   *
   * Note: `sessionStorage` is intentionally NOT included (Playwright also
   * excludes it — `sessionStorage` is per-tab and not persistable across
   * browser restarts).
   *
   * @example
   * ```typescript
   * const state = yield* context.storageState();
   * yield* Effect.sync(() => fs.writeFileSync("state.json", JSON.stringify(state)));
   * ```
   */
  readonly storageState: () => Effect.Effect<StorageState, CdpError>;

  /**
   * Restore cookies and `localStorage` from a previously captured
   * {@link StorageState}.
   *
   * Mirrors Playwright's `BrowserContext.addStorageState(state)`. Cookies are
   * added to the context; for each origin with `localStorage` entries, a
   * fresh page is opened to that origin and the entries are written before
   * any user-controlled scripts run.
   *
   * Useful for replaying authenticated sessions captured by
   * {@link storageState} on a new browser/context.
   *
   * @example
   * ```typescript
   * const state = JSON.parse(fs.readFileSync("state.json", "utf8"));
   * yield* context.addStorageState(state);
   * ```
   */
  readonly addStorageState: (state: StorageState) => Effect.Effect<void, CdpError>;

  /** Set the default timeout for page operations. */
  readonly setDefaultTimeout: (timeout: number | undefined) => Effect.Effect<void>;

  /** Set the default timeout for navigation operations. */
  readonly setDefaultNavigationTimeout: (timeout: number | undefined) => Effect.Effect<void>;

  /**
   * Registers a route handler for matching URLs on every page in this context.
   *
   * Mirrors Playwright's `BrowserContext.route(url, handler, options?)`. The
   * route is applied to:
   * - Every page that currently exists in the context, and
   * - Every page created in the future via {@link withPage}.
   *
   * CDP `Fetch.enable` is per-session, so this fan-outs the call to each
   * page's existing route manager. The same URL/handler/options apply
   * uniformly.
   *
   * @param url - URL matching pattern: glob string, RegExp, or predicate.
   * @param handler - Callback receiving a `RouteHandle` and `InterceptedRequest`.
   * @param options - Options
   *   - `times`: Auto-unroute after N matches.
   *
   * @see {@link page.route} for the page-level version.
   */
  readonly route: (
    url: RouteUrlMatch,
    handler: RouteHandlerCallback,
    options?: RouteOptions,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Removes a route handler from every page in this context.
   *
   * Mirrors Playwright's `BrowserContext.unroute(url, handler?)`. If
   * `handler` is provided, only removes handlers with both matching URL
   * and the exact same handler function reference. If omitted, removes
   * all handlers matching the URL pattern.
   *
   * @param url - URL matching pattern (must match the one used in {@link route}).
   * @param handler - Optional specific handler to remove.
   */
  readonly unroute: (
    url: RouteUrlMatch,
    handler?: RouteHandlerCallback,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Removes all route handlers from every page in this context.
   *
   * Mirrors Playwright's `BrowserContext.unrouteAll()`. Disables `Fetch`
   * interception on each page once the route list is empty.
   */
  readonly unrouteAll: () => Effect.Effect<void, CdpError>;

  /**
   * Routes WebSocket connections matching `url` on every page in this
   * context to `handler`.
   *
   * Mirrors Playwright's `BrowserContext.routeWebSocket(url, handler)`.
   * Like {@link route}, this fancasts to every existing and future page.
   *
   * @param url - URL matching pattern: glob string, RegExp, or predicate.
   * @param handler - Callback receiving a `CdpWebSocketRoute`.
   *
   * @see {@link page.routeWebSocket} for the page-level version.
   */
  readonly routeWebSocket: (
    url: RouteUrlMatch,
    handler: CdpWebSocketRouteHandlerCallback,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Sets extra HTTP headers that will be sent with every request on every
   * page in this context.
   *
   * Mirrors Playwright's `BrowserContext.setExtraHTTPHeaders(headers)`.
   * Uses CDP `Network.setExtraHTTPHeaders` on each page's session. The
   * override applies to:
   * - Every page that currently exists in the context, and
   * - Every page created in the future via {@link withPage}.
   *
   * @param headers - Record of header name-value pairs.
   *
   * @see {@link page.setExtraHTTPHeaders} for the page-level version.
   */
  readonly setExtraHTTPHeaders: (headers: Record<string, string>) => Effect.Effect<void, CdpError>;

  /**
   * Sets HTTP authentication credentials for every page in this context.
   *
   * Mirrors Playwright's `BrowserContext.setHTTPCredentials(creds)`. Pass
   * `undefined` to clear the credentials. The credentials are stored at
   * the context level and used to respond to `Fetch.authRequired` events
   * on every page in the context (and on every page created in the
   * future via `context.withPage`).
   *
   * @param httpCredentials - HTTP credentials (`{ username, password, origin? }`),
   *   or `undefined` to clear any existing credentials.
   *
   * @see {@link page.setHTTPCredentials} — per-page override. Falls back
   *   to context-level credentials when unset.
   */
  readonly setHTTPCredentials: (
    httpCredentials:
      | { readonly username: string; readonly password: string; readonly origin?: string }
      | undefined,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Exposes a Node/Worker function to every page in this context as
   * `window[name](...args)`.
   *
   * Mirrors Playwright's `BrowserContext.exposeFunction(name, callback)`.
   * The function is installed via `Page.addScriptToEvaluateOnNewDocument`
   * and the corresponding `Runtime.addBinding` on every page's session.
   *
   * Pages created in the future via {@link withPage} also receive the
   * binding.
   *
   * @param name - Function name to expose on the page.
   * @param callback - User callback invoked with the page-side args.
   *
   * @see {@link page.exposeFunction} for the page-level version.
   */
  readonly exposeFunction: <
    Args extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
    R = unknown,
  >(
    name: string,
    callback: (...args: Args) => R | Promise<R> | Effect.Effect<R, never, never>,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Exposes a binding that includes a `BindingSource` as the first arg
   * to every page in this context.
   *
   * Mirrors Playwright's `BrowserContext.exposeBinding(name, callback, options?)`.
   * Like {@link exposeFunction}, this fancasts to every existing and
   * future page in the context.
   *
   * @param name - Binding name to expose on the page.
   * @param callback - User callback invoked with `(source, ...args)`.
   * @param options - `{ handle: true }` to receive an un-serialised first arg.
   *
   * @see {@link page.exposeBinding} for the page-level version.
   */
  readonly exposeBinding: <
    Args extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
    R = unknown,
  >(
    name: string,
    callback: (
      ...args: readonly [unknown, ...Args]
    ) => R | Promise<R> | Effect.Effect<R, never, never>,
    options?: { readonly handle?: boolean },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Adds a script to be evaluated on every page in this context.
   *
   * Mirrors Playwright's `BrowserContext.addInitScript(script, arg?)`.
   * The script is installed via `Page.addScriptToEvaluateOnNewDocument`
   * on every page in the context, and on every page created in the
   * future via {@link withPage}.
   *
   * @param script - A function to evaluate, or a string expression.
   *
   * @see {@link page.addInitScript} for the page-level version.
   */
  readonly addInitScript: (script: EvaluateFn<unknown>) => Effect.Effect<void, CdpError>;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * High-level CDP browser service.
 *
 * Provides scoped resource management for CDP browser sessions, connections,
 * contexts, and pages. Uses the lightweight CDP client — zero
 * `@cloudflare/playwright` dependency.
 *
 * Each level comes in two forms:
 * - **Callback** (`withSession` / `withConnection` / `withPage`): the library
 *   owns the scope; resources close when the callback returns.
 * - **Primitive** (`acquireSession` / `acquireConnection` / `acquirePage`): the
 *   caller owns the scope (`Effect.scoped`, or a long-lived `Scope.make()` for
 *   pooling) so the resource can outlive a single callback.
 *
 * @example
 * ```typescript
 * import { Cdp } from "@effect-libs/browser-cdp";
 * import { BrowserProvider } from "@effect-libs/browser";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const cdp = yield* Cdp;
 *   const provider = yield* BrowserProvider;
 *
 *   const title = yield* cdp.withSession({ provider }, ({ page }) =>
 *     Effect.gen(function* () {
 *       yield* page.goto("https://example.com");
 *       return yield* page.evaluate(() => document.title);
 *     }),
 *   );
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(Cdp.layer)));
 * ```
 *
 * @see [`browser-cdp`](../../docs/modules/cdp/index.md) for full API reference and usage examples.
 * @see [Scoping guide](../../docs/guides/scoping.md) for choosing between session/connection/context/page scope.
 * @see [Advanced scoping](../../docs/guides/advanced-scoping.md) for the acquireX primitives and pooling.
 */
export interface CdpService {
  /**
   * Creates a fresh browser session that automatically closes when the callback
   * returns. The callback receives the full resource stack (`session`,
   * `connection`, `context`, `page`).
   *
   * @param source - `{ provider, options? }`: provider service and optional session options.
   * @param fn - Callback receiving a {@link CdpSessionScope} with `session`, `connection`, `context`, and `page`.
   *
   * @see [Scoping guide](../../docs/guides/scoping.md) for session scope usage and trade-offs.
   */
  readonly withSession: <T extends BrowserProviderSessionBase, O, A, E, R>(
    source: { readonly provider: BrowserProviderService<T, O>; readonly options?: O },
    fn: (scope: CdpSessionScope<T & BrowserProviderSession>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | CdpError | BrowserProviderError, Exclude<R, Scope.Scope>>;

  /**
   * Connects to an existing browser; the connection automatically closes when
   * the callback returns. The callback receives `{ connection, context, page }`,
   * where `connection` can spawn additional contexts and pages.
   *
   * @param source - `{ url }` (CDP WebSocket URL) or `{ session }` (existing provider session).
   * @param fn - Callback receiving a {@link CdpConnectionScope} with `connection`, `context`, and `page`.
   *
   * @see [Scoping guide](../../docs/guides/scoping.md) for connection scope usage and trade-offs.
   */
  readonly withConnection: <A, E, R>(
    source: { readonly url: string } | { readonly session: BrowserProviderSession },
    fn: (scope: CdpConnectionScope) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | CdpError, Exclude<R, Scope.Scope>>;

  /**
   * Creates a fresh page that automatically closes when the callback returns.
   * The connection handle is not exposed; the callback receives a bare `page`.
   *
   * @param source - `{ url }` (CDP WebSocket URL) or `{ session }` (existing provider session).
   * @param fn - Callback receiving a bare {@link CdpPageService}.
   *
   * @example
   * ```typescript
   * // A page-returning function slots straight in as the callback
   * const getTitle = (page: CdpPageService) =>
   *   Effect.gen(function* () {
   *     yield* page.goto("https://example.com");
   *     return yield* page.evaluate(() => document.title);
   *   });
   * yield* cdp.withPage({ url: cdpUrl }, getTitle);
   * ```
   *
   * @see [Scoping guide](../../docs/guides/scoping.md) for choosing between connection and page scope.
   */
  readonly withPage: <A, E, R>(
    source: { readonly url: string } | { readonly session: BrowserProviderSession },
    fn: (page: CdpPageService) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | CdpError, Exclude<R, Scope.Scope>>;

  /**
   * Creates a fresh browser session in the caller's scope. The primitive form
   * of {@link withSession}: no callback, so the session can outlive a single
   * operation. Requires `Scope.Scope`.
   *
   * Use for pooling, fan-out, or long-lived workers. Close with `Effect.scoped`
   * or a long-lived `Scope.make()`.
   *
   * @param source - `{ provider, options? }`: provider service and optional session options.
   *
   * @example
   * ```typescript
   * const { session, page } = yield* cdp
   *   .acquireSession({ provider })
   *   .pipe(Effect.scoped);
   * ```
   *
   * @see [Advanced scoping](../../docs/guides/advanced-scoping.md) for pooling and long-lived-connection patterns.
   */
  readonly acquireSession: <T extends BrowserProviderSessionBase, O>(source: {
    readonly provider: BrowserProviderService<T, O>;
    readonly options?: O;
  }) => Effect.Effect<
    CdpSessionScope<T & BrowserProviderSession>,
    CdpError | BrowserProviderError,
    Scope.Scope
  >;

  /**
   * Connects to an existing browser in the caller's scope. The primitive form
   * of {@link withConnection}: no callback, so the connection can stay alive
   * across operations. Requires `Scope.Scope`.
   *
   * Use to fan out pages, interleave other work, or keep the connection alive
   * across requests.
   *
   * @param source - `{ url }` (CDP WebSocket URL) or `{ session }` (existing provider session).
   *
   * @example
   * ```typescript
   * const { connection, page } = yield* cdp
   *   .acquireConnection({ url: cdpUrl })
   *   .pipe(Effect.scoped);
   * ```
   *
   * @see [Advanced scoping](../../docs/guides/advanced-scoping.md) for pooling and long-lived-connection patterns.
   */
  readonly acquireConnection: (
    source: { readonly url: string } | { readonly session: BrowserProviderSession },
  ) => Effect.Effect<CdpConnectionScope, CdpError, Scope.Scope>;

  /**
   * Creates a fresh page in the caller's scope. The primitive form of
   * {@link withPage}: no callback. Requires `Scope.Scope`.
   *
   * @param source - `{ url }` (CDP WebSocket URL) or `{ session }` (existing provider session).
   *
   * @example
   * ```typescript
   * const page = yield* cdp.acquirePage({ url: cdpUrl }).pipe(Effect.scoped);
   * yield* page.goto("https://example.com");
   * ```
   *
   * @see [Advanced scoping](../../docs/guides/advanced-scoping.md) for pooling and long-lived-connection patterns.
   */
  readonly acquirePage: (
    source: { readonly url: string } | { readonly session: BrowserProviderSession },
  ) => Effect.Effect<CdpPageService, CdpError, Scope.Scope>;
}

// ── Re-exported internal types ────────────────────────────────────────────────

export type {
  /**
   * @since 0.1.0
   */
  CdpPageService,
  /**
   * @since 0.1.0
   */
  CdpFrame,
  /**
   * @since 0.1.0
   */
  ScreenshotOptions,
  /**
   * @since 0.1.0
   */
  PdfOptions,
  /**
   * @since 0.1.0
   */
  FetchOptions,
  /**
   * @since 0.1.0
   */
  FetchResponse,
  /**
   * @since 0.1.0
   */
  EvaluateFn,
  /**
   * @since 0.1.0
   */
  CookieData,
  /**
   * @since 0.1.0
   */
  CdpCookie,
  /**
   * @since 0.1.0
   */
  RequestInfo,
  /**
   * @since 0.1.0
   */
  ResponseInfo,
  /**
   * @since 0.1.0
   */
  RequestFailedInfo,
  /**
   * @since 0.1.0
   */
  Response,
  /**
   * @since 0.1.0
   */
  RequestUrlOrPredicate,
  /**
   * @since 0.1.0
   */
  ResponseUrlOrPredicate,
  /**
   * @since 0.1.0
   */
  RequestFailedUrlOrPredicate,
  /**
   * @since 0.1.0
   */
  ConsoleMessage,
  /**
   * @since 0.1.0
   */
  RouteUrlMatch,
  /**
   * @since 0.1.0
   */
  RouteHandlerCallback,
  /**
   * @since 0.1.0
   */
  RouteOptions,
  /**
   * @since 0.1.0
   */
  CdpWebSocketRouteHandlerCallback,
  /**
   * @since 0.1.0
   */
  RouteHandle,
  /**
   * @since 0.1.0
   */
  InterceptedRequest,
  /**
   * @since 0.1.0
   */
  ContinueOverrides,
  /**
   * @since 0.1.0
   */
  FulfillResponse,
  /**
   * @since 0.1.0
   */
  ViewportSize,
  /**
   * @since 0.1.0
   */
  UserAgentBrandVersion,
  /**
   * @since 0.1.0
   */
  UserAgentMetadata,
  /**
   * @since 0.1.0
   */
  UserAgentOverride,
  /**
   * @since 0.1.0
   */
  Geolocation,
  /**
   * @since 0.1.0
   */
  GrantPermissionsOptions,
  /**
   * @since 0.1.0
   */
  PermissionName,
  /**
   * @since 0.1.0
   */
  OriginState,
  /**
   * @since 0.1.0
   */
  StorageState,
} from "./internal/CdpPage.js";

export type {
  /**
   * @since 0.1.0
   */
  CdpConnectionService,
} from "./internal/CdpConnection.js";
