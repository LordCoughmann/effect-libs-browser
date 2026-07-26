/**
 * Defines the `Playwright` service, which drives `@cloudflare/playwright`.
 *
 * See the {@link Playwright} class below for the consumer-facing
 * documentation (when to use, mental model, example, gotchas).
 */
import type { Browser, BrowserContext, Page } from "@effect-libs/cloudflare-playwright";
import type { Scope } from "effect";

import type {
  BrowserProviderError,
  BrowserProviderService,
  BrowserProviderSession,
  BrowserProviderSessionBase,
} from "@effect-libs/browser";

import type {
  PlaywrightConnectionHandle,
  PlaywrightContextHandle,
  PlaywrightContextScope,
  PlaywrightPage,
  PlaywrightService,
  PlaywrightSessionScope,
  PlaywrightConnectionScope,
} from "./PlaywrightTypes.js";

import playwright from "@effect-libs/cloudflare-playwright";
import { Context, Effect, Layer, Option, Predicate, Redacted, Array as Arr } from "effect";

import { getErrorMessage, UrlString } from "@effect-libs/browser";

import { makeBrowserContext } from "./internal/PlaywrightBrowserContext.js";
import { makePage } from "./internal/PlaywrightPage.js";
import { PlaywrightError, ConnectionError, ContextError } from "./PlaywrightError.js";

// ── Internal Helpers ──────────────────────────────────────────────────────────

type ConnectionSource = { readonly url: string } | { readonly session: BrowserProviderSession };

const resolveConnectionSource = (source: ConnectionSource): string =>
  Predicate.hasProperty(source, "url") ? source.url : Redacted.value(source.session.cdpUrl);

const connectOverCDP = (wsEndpoint: string): Effect.Effect<Browser, PlaywrightError> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Connecting to browser via CDP connection pool`);
    return yield* Effect.tryPromise({
      try: () => playwright.chromium.connectOverCDP(wsEndpoint),
      catch: (cause) =>
        new PlaywrightError({
          source: "Playwright",
          method: "connectOverCDP",
          reason: new ConnectionError({
            description: getErrorMessage(cause),
            cause,
          }),
        }),
    });
  });

const createNewContext = (browser: Browser): Effect.Effect<BrowserContext, PlaywrightError> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("Creating new browser context...");
    return yield* Effect.tryPromise({
      try: () => browser.newContext(),
      catch: (cause) =>
        new PlaywrightError({
          source: "Playwright",
          method: "createNewContext",
          reason: new ContextError({
            description: getErrorMessage(cause),
            cause,
          }),
        }),
    });
  });

const createNewPage = (context: BrowserContext): Effect.Effect<Page, PlaywrightError> =>
  Effect.tryPromise({
    try: () => context.newPage(),
    catch: (cause) =>
      new PlaywrightError({
        source: "Playwright",
        method: "createNewPage",
        reason: new ContextError({
          description: getErrorMessage(cause),
          cause,
        }),
      }),
  });

const closeBrowser = (browser: Browser): Effect.Effect<void, PlaywrightError> =>
  // `browser` is non-nullable in the upstream type, so no null-guard
  // here — the upstream `Browser.close()` API never sees a missing
  // reference (see the connect-side which always provides one).
  Effect.tryPromise({
    try: () => browser.close(),
    catch: (cause) =>
      new PlaywrightError({
        source: "Playwright",
        method: "closeBrowser",
        reason: new ConnectionError({
          description: getErrorMessage(cause),
          cause,
        }),
      }),
  });

const closeContext = (context: BrowserContext): Effect.Effect<void, PlaywrightError> =>
  Effect.tryPromise({
    try: () => context.close(),
    catch: (cause) =>
      new PlaywrightError({
        source: "Playwright",
        method: "closeContext",
        reason: new ContextError({
          description: getErrorMessage(cause),
        }),
      }),
  });

const closePage = (page: Page): Effect.Effect<void, PlaywrightError> =>
  Effect.tryPromise({
    try: () => page.close(),
    catch: (cause) =>
      new PlaywrightError({
        source: "Playwright",
        method: "closePage",
        reason: new ContextError({
          description: getErrorMessage(cause),
        }),
      }),
  });

/**
 * Resolve the browser context for a CDP connection.
 *
 * Uses an existing context (e.g. the Steel default context with profile cookies)
 * when available, otherwise creates a new one. Created contexts are cleaned up
 * on scope exit; pre-existing contexts are left alone.
 */
const resolveContext = (
  browser: Browser,
): Effect.Effect<BrowserContext, PlaywrightError, Scope.Scope> =>
  Effect.gen(function* () {
    const contexts = yield* Effect.sync(() => browser.contexts());

    if (Arr.isArrayNonEmpty(contexts)) {
      yield* Effect.logDebug("Reusing existing browser context (cookies preserved)");
      return contexts[0];
    }

    return yield* Effect.acquireRelease(createNewContext(browser), (c) =>
      closeContext(c).pipe(Effect.catch(Effect.logError)),
    );
  });

/**
 * Connect to a CDP endpoint and resolve a page.
 *
 * Uses the browser's existing context when available (preserving Steel profile
 * cookies), falling back to a fresh context. The page is always freshly created
 * in the resolved context so it starts at a known state.
 *
 * Requires Scope from the caller so the browser stays alive.
 * Pre-existing contexts are NOT closed on scope exit — only newly created ones
 * and the page are cleaned up.
 */
const connectWithPage = (
  cdpUrl: string,
): Effect.Effect<
  { readonly browser: Browser; readonly defaultContext: BrowserContext; readonly page: Page },
  PlaywrightError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const browser = yield* Effect.acquireRelease(connectOverCDP(cdpUrl), (b) =>
      closeBrowser(b).pipe(Effect.catch(Effect.logError)),
    );

    const defaultContext = yield* resolveContext(browser);

    const rawPage = yield* Effect.acquireRelease(createNewPage(defaultContext), (p) =>
      closePage(p).pipe(Effect.catch(Effect.logError)),
    );

    return { browser, defaultContext, page: rawPage } as const;
  });

// ── Handle Implementations ────────────────────────────────────────────────────

/**
 * Build a {@link PlaywrightContextHandle} from a raw `BrowserContext`.
 *
 * The handle is now equivalent to {@link PlaywrightBrowserContext} — the
 * standalone factory — so users see a single, uniform context surface
 * regardless of whether they acquired the handle via `connection.withContext(...)`
 * or constructed one themselves. The wider method set (cookies,
 * storageState, setGeolocation, grantPermissions, setOffline, etc.) is
 * available on both paths.
 */
const makeContextHandle = (context: BrowserContext): PlaywrightContextHandle =>
  makeBrowserContext(context);

const makeConnectionHandle = (
  browser: Browser,
  defaultContext: BrowserContext,
): PlaywrightConnectionHandle => ({
  withContext: <A, E, R>(
    fn: (scope: PlaywrightContextScope) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | PlaywrightError, Exclude<R, Scope.Scope>> =>
    Effect.gen(function* () {
      const context = yield* Effect.acquireRelease(createNewContext(browser), (ctx) =>
        closeContext(ctx).pipe(Effect.ignore),
      );

      const rawPage = yield* Effect.acquireRelease(createNewPage(context), (p) =>
        closePage(p).pipe(Effect.ignore),
      );

      const contextHandle = makeContextHandle(context);
      const page = makePage(rawPage);

      return yield* fn({ context: contextHandle, page });
    }).pipe(Effect.scoped),

  withPage: <A, E, R>(
    fn: (page: PlaywrightPage) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | PlaywrightError, Exclude<R, Scope.Scope>> =>
    Effect.gen(function* () {
      const rawPage = yield* Effect.acquireRelease(createNewPage(defaultContext), (p) =>
        closePage(p).pipe(Effect.ignore),
      );

      const page = makePage(rawPage);
      return yield* fn(page);
    }).pipe(Effect.scoped),
});

// ── Service Implementation ────────────────────────────────────────────────────

/**
 * Constructs a `PlaywrightService` whose callbacks and primitives allocate
 * CDP connections and pages bound to an ambient `Scope`.
 */
const make = Effect.sync(() => {
  // ── Primitives (escape hatch — Scope.Scope in R) ─────────────────────────────

  const acquireSession = Effect.fn("Playwright.acquireSession")(
    <T extends BrowserProviderSessionBase, O>(source: {
      provider: BrowserProviderService<T, O>;
      options?: O;
    }): Effect.Effect<
      PlaywrightSessionScope<T & BrowserProviderSession>,
      PlaywrightError | BrowserProviderError,
      Scope.Scope
    > =>
      Effect.gen(function* () {
        const session = yield* Effect.acquireRelease(
          source.provider.createSession(source.options),
          (s: T) => source.provider.releaseSession(s.id).pipe(Effect.catch(Effect.logError)),
        );

        const cdpUrlOption = source.provider.getCdpUrl(session.id);
        const cdpUrl = yield* Option.match(cdpUrlOption, {
          onNone: () =>
            Effect.fail(
              new PlaywrightError({
                source: "Playwright",
                method: "acquireSession",
                reason: new ConnectionError({
                  description: "Provider does not support active CDP network handovers.",
                }),
              }),
            ),
          onSome: (url) => Effect.succeed(Redacted.value(url)), // UNWRAPPED PRIMITIVE STRING
        });

        const sessionWithCdp = { ...session, cdpUrl: Redacted.make(UrlString(cdpUrl)) } as T &
          BrowserProviderSession;

        const { browser, defaultContext, page: rawPage } = yield* connectWithPage(cdpUrl);
        const connection = makeConnectionHandle(browser, defaultContext);
        const page = makePage(rawPage);
        const context = makeContextHandle(defaultContext);

        return { session: sessionWithCdp, connection, context, page };
      }),
  );

  const acquireConnection = Effect.fn("Playwright.acquireConnection")(
    (
      source: ConnectionSource,
    ): Effect.Effect<PlaywrightConnectionScope, PlaywrightError, Scope.Scope> =>
      Effect.gen(function* () {
        const cdpUrl = resolveConnectionSource(source);
        const { browser, defaultContext, page: rawPage } = yield* connectWithPage(cdpUrl);
        const connection = makeConnectionHandle(browser, defaultContext);
        const page = makePage(rawPage);
        const context = makeContextHandle(defaultContext);
        return { connection, context, page };
      }),
  );

  const acquirePage = Effect.fn("Playwright.acquirePage")(
    (source: ConnectionSource): Effect.Effect<PlaywrightPage, PlaywrightError, Scope.Scope> =>
      Effect.gen(function* () {
        const cdpUrl = resolveConnectionSource(source);
        const { page: rawPage } = yield* connectWithPage(cdpUrl);
        return makePage(rawPage);
      }),
  );

  // ── Callback wrappers (sugar over the primitives) ───────────────────────────

  const withSession = Effect.fn("Playwright.withSession")(
    <T extends BrowserProviderSessionBase, O, A, E, R>(
      source: { provider: BrowserProviderService<T, O>; options?: O },
      fn: (scope: PlaywrightSessionScope<T & BrowserProviderSession>) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | PlaywrightError | BrowserProviderError, Exclude<R, Scope.Scope>> =>
      Effect.gen(function* () {
        const sessionScope = yield* acquireSession(source);
        return yield* fn(sessionScope);
      }).pipe(Effect.scoped),
  );

  const withConnection = Effect.fn("Playwright.withConnection")(
    <A, E, R>(
      source: ConnectionSource,
      fn: (scope: PlaywrightConnectionScope) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | PlaywrightError, Exclude<R, Scope.Scope>> =>
      Effect.gen(function* () {
        const connectionScope = yield* acquireConnection(source);
        return yield* fn(connectionScope);
      }).pipe(Effect.scoped),
  );

  const withPage = Effect.fn("Playwright.withPage")(
    <A, E, R>(
      source: ConnectionSource,
      fn: (page: PlaywrightPage) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | PlaywrightError, Exclude<R, Scope.Scope>> =>
      Effect.gen(function* () {
        const page = yield* acquirePage(source);
        return yield* fn(page);
      }).pipe(Effect.scoped),
  );

  return {
    acquireSession,
    acquireConnection,
    acquirePage,
    withSession,
    withConnection,
    withPage,
  } satisfies PlaywrightService;
});

// ── Service Definition ────────────────────────────────────────────────────────

/**
 * Service tag for the Playwright browser service.
 *
 * **When to use**
 *
 * Use when you want the full Playwright API surface (locators, auto-waiting,
 * all page methods) on Cloudflare Workers or other edge runtimes. This is
 * the recommended package for production browser automation. For a smaller
 * footprint or raw CDP access, use `Cdp`. For AI-powered automation, use
 * `Stagehand`.
 *
 * **Mental model**
 *
 * The API mirrors the other drivers, exposing two tracks at every level:
 *
 * - **Callbacks** (`withSession` / `withConnection` / `withPage`) open a
 *   resource, run an inner effect, and close the resource when it completes.
 * - **Primitives** (`acquireSession` / `acquireConnection` / `acquirePage`)
 *   return the resource; close with `Effect.scoped` or a long-lived
 *   `Scope.make()` — useful for pooling across fibers.
 *
 * **Example** (Load a page and read its title)
 *
 * ```typescript
 * import { Playwright } from "@effect-libs/browser-playwright";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const playwright = yield* Playwright;
 *
 *   return yield* playwright.withConnection({ url: "wss://..." }, ({ page }) =>
 *     Effect.gen(function* () {
 *       yield* page.goto("https://example.com");
 *       return yield* page.title;
 *     }),
 *   );
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(Playwright.layer)));
 * ```
 *
 * **Gotchas**
 *
 * - Primitives require `Scope` in their environment; without `Scope`, or if
 *   disposal is skipped, browser resources leak.
 * - This targets the `@cloudflare/playwright` build; Node-only Playwright
 *   features and platform extensions are unavailable in Workers.
 * - The service hands out pages and contexts; interaction helpers — locators,
 *   `evaluate`, navigation — live on the returned `PlaywrightPage`.
 *
 * @see {@link PlaywrightService} for the full service contract
 *
 * @category services
 * @since 0.1.0
 */
export class Playwright extends Context.Service<Playwright, PlaywrightService>()(
  "effect-libs/browser/Playwright",
  { make },
) {
  static readonly layer: Layer.Layer<Playwright, never> = Layer.effect(this, this.make);
}
