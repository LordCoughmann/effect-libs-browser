/**
 * Defines the `Cdp` service, which drives a browser directly over the Chrome
 * DevTools Protocol with a lightweight, zero-dependency CDP client.
 *
 * **Experimental.** The API surface is stable; awaiting human review for a v1 release.
 * Prefer `Playwright` for production use; use `Cdp` when you need a minimal
 * footprint or raw CDP access.
 *
 * See the {@link Cdp} class below for the consumer-facing documentation
 * (mental model, common tasks, example, gotchas).
 */

import type { Protocol } from "devtools-protocol";
import type { Scope } from "effect";

import type {
  BrowserProviderError,
  BrowserProviderService,
  BrowserProviderSession,
  BrowserProviderSessionBase,
} from "@effect-libs/browser";

import type {
  CdpConnectionHandle,
  CdpContextHandle,
  CdpContextScope,
  CdpService,
  CdpSessionScope,
  CdpConnectionScope,
} from "./CdpTypes.js";
import type { CdpConfigService } from "./internal/CdpConfig.js";
import type { CdpConnectionService } from "./internal/CdpConnection.js";
import type { CdpPageService } from "./internal/CdpPage.js";

import { Context, Duration, Effect, Layer, Option, Predicate, Ref, Redacted } from "effect";
import * as Arr from "effect/Array";

import { getErrorMessage } from "@effect-libs/browser";

import {
  CdpError,
  ConnectionError,
  ContextNotSupportedError,
  EvaluationError,
} from "./CdpError.js";
import { CdpConfig } from "./internal/CdpConfig.js";
import { CdpConnection } from "./internal/CdpConnection.js";
import { CdpPage } from "./internal/CdpPage.js";
import { type EvaluateFn } from "./internal/CdpPage.js";
import {
  type CookieData,
  addCookies as contextAddCookies,
  clearCookies as contextClearCookies,
  getCookies as contextGetCookies,
} from "./internal/Page/Cookies.js";
import { type Geolocation } from "./internal/Page/Geolocation.js";
import {
  type GrantPermissionsOptions,
  type PermissionName,
  toCdpPermissionType,
} from "./internal/Page/Permissions.js";
import {
  type RouteHandlerCallback,
  type RouteOptions,
  type RouteUrlMatch,
} from "./internal/Page/Route.js";
import { type CdpWebSocketRouteHandlerCallback } from "./internal/Page/RouteWebSocket.js";
import { applyGeolocationOverride } from "./internal/Page/SetGeolocation.js";
import { applyOfflineOverride } from "./internal/Page/SetOffline.js";
import { applyUserAgentOverride } from "./internal/Page/SetUserAgent.js";
import {
  type StorageState,
  captureStorageState,
  cookiesToCookieData,
} from "./internal/Page/StorageState.js";
import { urlMatchesEqual } from "./internal/Page/UrlMatch.js";
import { type UserAgentMetadata, type UserAgentOverride } from "./internal/Page/UserAgent.js";

// ── Re-exports ──────────────────────────────────────────────────────────────

export type {
  /**
   * @since 0.1.0
   */
  CdpService,
} from "./CdpTypes.js";

// ── Internal Helpers ──────────────────────────────────────────────────────────

type ConnectionSource = { readonly url: string } | { readonly session: BrowserProviderSession };

const resolveConnectionSource = (source: ConnectionSource): string =>
  Predicate.hasProperty(source, "url") ? source.url : Redacted.value(source.session.cdpUrl);

/**
 * Map low-level CDP errors into CdpError with ConnectionError reason.
 */
const mapCdpError = (module: string, method: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new CdpError({
        module,
        method,
        reason: new ConnectionError({
          description: getErrorMessage(cause),
          cause,
        }),
      }),
  );

/**
 * Determine whether a CDP error message indicates that the browser
 * does not support `Target.createBrowserContext`.
 */
const isContextNotSupportedError = (description: string): boolean =>
  description.includes("Not supported") ||
  description.includes("not supported") ||
  description.includes("Invalid params");

/**
 * Map CDP errors from `Target.createBrowserContext` into CdpError
 * with context-aware reason detection.
 */
const mapContextError = (module: string, method: string) =>
  Effect.mapError((cause: unknown) => {
    const description = getErrorMessage(cause);

    const isNotSupported =
      Predicate.isString(description) && isContextNotSupportedError(description);

    return new CdpError({
      module,
      method,
      reason: isNotSupported
        ? new ContextNotSupportedError({
            description: `Browser does not support isolated contexts: ${description}. Use connection.withPage() instead.`,
          })
        : new ConnectionError({
            description,
            cause,
          }),
    });
  });

/** Context-level timeout settings shared by all pages in a context. */
interface ContextTimeoutSettings {
  readonly defaultTimeout: Ref.Ref<Duration.Duration | undefined>;
  readonly defaultNavigationTimeout: Ref.Ref<Duration.Duration | undefined>;
}

/** Context-level user-agent override shared by all pages in a context. */
interface ContextUserAgentSettings {
  readonly userAgent: Ref.Ref<UserAgentOverride | undefined>;
}

/** Context-level geolocation override shared by all pages in a context. */
interface ContextGeolocationSettings {
  readonly geolocation: Ref.Ref<Geolocation | undefined>;
}

/** Context-level offline override shared by all pages in a context. */
interface ContextOfflineSettings {
  readonly offline: Ref.Ref<boolean>;
}

/** Context-level extra HTTP headers shared by all pages in a context. */
interface ContextHeadersSettings {
  readonly headers: Ref.Ref<Record<string, string> | undefined>;
}

/** A single registered context-level binding (function or binding). */
interface ContextBinding {
  /** The binding name. */
  readonly name: string;
  /** Whether this is `exposeFunction` (false) or `exposeBinding` (true). */
  readonly exposeSource: boolean;
  /** Whether the first arg is left un-serialised (`{ handle: true }`). */
  readonly needsHandle: boolean;
  /** The user callback. */
  readonly callback: (...args: ReadonlyArray<unknown>) => unknown;
}

/** Context-level bindings shared by all pages in a context. */
interface ContextBindingsSettings {
  readonly bindings: Ref.Ref<Map<string, ContextBinding>>;
}

/**
 * A single registered context-level init script.
 *
 * Tracks whether the source was a function (so we can rebuild the
 * expression on each `Page.addScriptToEvaluateOnNewDocument` call) or
 * a pre-built string.
 */
interface ContextInitScript {
  /** Source expression passed to `Page.addScriptToEvaluateOnNewDocument`. */
  readonly source: string;
}

/** Context-level init scripts shared by all pages in a context. */
interface ContextInitScriptsSettings {
  readonly scripts: Ref.Ref<ReadonlyArray<ContextInitScript>>;
}

/** A single registered context-level HTTP route. */
interface ContextRoute {
  readonly url: RouteUrlMatch;
  readonly handler: RouteHandlerCallback;
  readonly options?: RouteOptions;
}

/** Context-level HTTP routes shared by all pages in a context. */
interface ContextRoutesSettings {
  readonly routes: Ref.Ref<ReadonlyArray<ContextRoute>>;
}

/** A single registered context-level WebSocket route. */
interface ContextWebSocketRoute {
  readonly url: RouteUrlMatch;
  readonly handler: CdpWebSocketRouteHandlerCallback;
}

/** Context-level WebSocket routes shared by all pages in a context. */
interface ContextWebSocketRoutesSettings {
  readonly routes: Ref.Ref<ReadonlyArray<ContextWebSocketRoute>>;
}

/**
 * Context-level HTTP auth credentials shared by all pages in a context.
 *
 * CDP's auth-challenge flow goes through `Fetch.authRequired` events which
 * are session-scoped. We store the credentials at the context level and
 * respond to auth challenges on every page.
 */
interface ContextCredentialsSettings {
  readonly credentials: Ref.Ref<
    { readonly username: string; readonly password: string; readonly origin?: string } | undefined
  >;
}

/**
 * Track all pages created in this context so context-level methods can
 * fancast to existing pages.
 */
interface ContextPagesList {
  readonly pages: Ref.Ref<ReadonlyArray<CdpPageService>>;
}

/** Create empty context timeout settings for default context. */
const makeEmptyTimeoutSettings: Effect.Effect<ContextTimeoutSettings, never, never> = Effect.gen(
  function* () {
    return {
      defaultTimeout: yield* Ref.make<Duration.Duration | undefined>(undefined),
      defaultNavigationTimeout: yield* Ref.make<Duration.Duration | undefined>(undefined),
    };
  },
);

/** Create empty context user-agent settings for default context. */
const makeEmptyUserAgentSettings: Effect.Effect<ContextUserAgentSettings, never, never> =
  Effect.gen(function* () {
    return {
      userAgent: yield* Ref.make<UserAgentOverride | undefined>(undefined),
    };
  });

/** Create empty context geolocation settings for default context. */
const makeEmptyGeolocationSettings: Effect.Effect<ContextGeolocationSettings, never, never> =
  Effect.gen(function* () {
    return {
      geolocation: yield* Ref.make<Geolocation | undefined>(undefined),
    };
  });

/** Create empty context offline settings for default context. */
const makeEmptyOfflineSettings: Effect.Effect<ContextOfflineSettings, never, never> = Effect.gen(
  function* () {
    return {
      offline: yield* Ref.make<boolean>(false),
    };
  },
);

/** Create empty context-level extra headers settings. */
const makeEmptyHeadersSettings: Effect.Effect<ContextHeadersSettings, never, never> = Effect.gen(
  function* () {
    return {
      headers: yield* Ref.make<Record<string, string> | undefined>(undefined),
    };
  },
);

/** Create empty context-level bindings settings. */
const makeEmptyBindingsSettings: Effect.Effect<ContextBindingsSettings, never, never> = Effect.gen(
  function* () {
    return {
      bindings: yield* Ref.make<Map<string, ContextBinding>>(new Map()),
    };
  },
);

/** Create empty context-level init scripts settings. */
const makeEmptyInitScriptsSettings: Effect.Effect<ContextInitScriptsSettings, never, never> =
  Effect.gen(function* () {
    return {
      scripts: yield* Ref.make<ReadonlyArray<ContextInitScript>>([]),
    };
  });

/** Create empty context-level HTTP routes settings. */
const makeEmptyRoutesSettings: Effect.Effect<ContextRoutesSettings, never, never> = Effect.gen(
  function* () {
    return {
      routes: yield* Ref.make<ReadonlyArray<ContextRoute>>([]),
    };
  },
);

/** Create empty context-level WebSocket routes settings. */
const makeEmptyWebSocketRoutesSettings: Effect.Effect<
  ContextWebSocketRoutesSettings,
  never,
  never
> = Effect.gen(function* () {
  return {
    routes: yield* Ref.make<ReadonlyArray<ContextWebSocketRoute>>([]),
  };
});

/** Create empty context-level HTTP credentials settings. */
const makeEmptyCredentialsSettings: Effect.Effect<ContextCredentialsSettings, never, never> =
  Effect.gen(function* () {
    return {
      credentials: yield* Ref.make<
        | { readonly username: string; readonly password: string; readonly origin?: string }
        | undefined
      >(undefined),
    };
  });

/** Create empty context-level pages list. */
const makeEmptyPagesList: Effect.Effect<ContextPagesList, never, never> = Effect.gen(function* () {
  return {
    pages: yield* Ref.make<ReadonlyArray<CdpPageService>>([]),
  };
});

/** Bundle of every context-level setting used by `makeContextHandle`. */
interface ContextSettingsBundle {
  readonly timeoutSettings: ContextTimeoutSettings;
  readonly userAgentSettings: ContextUserAgentSettings;
  readonly geolocationSettings: ContextGeolocationSettings;
  readonly offlineSettings: ContextOfflineSettings;
  readonly headersSettings: ContextHeadersSettings;
  readonly bindingsSettings: ContextBindingsSettings;
  readonly initScriptsSettings: ContextInitScriptsSettings;
  readonly routesSettings: ContextRoutesSettings;
  readonly webSocketRoutesSettings: ContextWebSocketRoutesSettings;
  readonly credentialsSettings: ContextCredentialsSettings;
  readonly pagesList: ContextPagesList;
}

/** Create all empty context-level settings for a context in one go. */
const makeEmptyContextSettings: Effect.Effect<ContextSettingsBundle, never, never> = Effect.gen(
  function* () {
    return {
      timeoutSettings: yield* makeEmptyTimeoutSettings,
      userAgentSettings: yield* makeEmptyUserAgentSettings,
      geolocationSettings: yield* makeEmptyGeolocationSettings,
      offlineSettings: yield* makeEmptyOfflineSettings,
      headersSettings: yield* makeEmptyHeadersSettings,
      bindingsSettings: yield* makeEmptyBindingsSettings,
      initScriptsSettings: yield* makeEmptyInitScriptsSettings,
      routesSettings: yield* makeEmptyRoutesSettings,
      webSocketRoutesSettings: yield* makeEmptyWebSocketRoutesSettings,
      credentialsSettings: yield* makeEmptyCredentialsSettings,
      pagesList: yield* makeEmptyPagesList,
    };
  },
);

/**
 * Apply the context-level user agent override (if any) to a page session.
 *
 * Reads the override from `userAgentSettings` and, when set, calls
 * `Emulation.setUserAgentOverride` on the provided session. Errors are logged
 * but not propagated — a misconfigured override should not break page
 * creation.
 */
const applyContextUserAgentIfSet = (
  conn: CdpConnectionService,
  sessionId: string,
  userAgentSettings: ContextUserAgentSettings,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const override = yield* Ref.get(userAgentSettings.userAgent);
    if (override) {
      yield* applyUserAgentOverride(conn, sessionId, override).pipe(
        Effect.catch((cause) =>
          Effect.logError(`Failed to apply context user agent: ${getErrorMessage(cause)}`),
        ),
      );
    }
  });

/**
 * Apply the context-level geolocation override (if any) to a page session.
 *
 * Reads the override from `geolocationSettings` and, when set, calls
 * `Emulation.setGeolocationOverride` on the provided session. Errors are
 * logged but not propagated — a misconfigured override should not break page
 * creation.
 */
const applyContextGeolocationIfSet = (
  conn: CdpConnectionService,
  sessionId: string,
  geolocationSettings: ContextGeolocationSettings,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const override = yield* Ref.get(geolocationSettings.geolocation);
    yield* applyGeolocationOverride(conn, sessionId, override).pipe(
      Effect.catch((cause) =>
        Effect.logError(`Failed to apply context geolocation: ${getErrorMessage(cause)}`),
      ),
    );
  });

/**
 * Apply the context-level offline override (if any) to a page session.
 *
 * Reads the override from `offlineSettings` and applies it via
 * `Network.emulateNetworkConditions`. Errors are logged but not propagated
 * — a misconfigured override should not break page creation.
 */
const applyContextOfflineIfSet = (
  conn: CdpConnectionService,
  sessionId: string,
  offlineSettings: ContextOfflineSettings,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const offline = yield* Ref.get(offlineSettings.offline);
    yield* applyOfflineOverride(conn, sessionId, offline).pipe(
      Effect.catch((cause) =>
        Effect.logError(`Failed to apply context offline: ${getErrorMessage(cause)}`),
      ),
    );
  });

/**
 * Apply the context-level extra HTTP headers to a new page.
 *
 * Calls the page's `setExtraHTTPHeaders` with the context-level headers
 * (when set). Errors are logged but not propagated.
 */
const applyContextHeadersToPage = (
  page: CdpPageService,
  settings: ContextSettingsBundle,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const headers = yield* Ref.get(settings.headersSettings.headers);
    if (!headers) return;
    yield* page
      .setExtraHTTPHeaders(headers)
      .pipe(
        Effect.catch((cause) =>
          Effect.logError(
            `Failed to apply context extra HTTP headers to page: ${getErrorMessage(cause)}`,
          ),
        ),
      );
  });

/**
 * Apply the context-level bindings to a new page.
 *
 * Calls the page's `exposeFunction` / `exposeBinding` for each registered
 * context-level binding. Errors are logged but not propagated.
 */
const applyContextBindingsToPage = (
  page: CdpPageService,
  settings: ContextSettingsBundle,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const bindings = yield* Ref.get(settings.bindingsSettings.bindings);
    yield* Arr.match(Array.from(bindings.values()), {
      onEmpty: () => Effect.void,
      onNonEmpty: (values) =>
        Effect.forEach(
          values,
          (binding) =>
            Effect.gen(function* () {
              if (binding.exposeSource) {
                yield* page.exposeBinding(
                  binding.name,
                  binding.callback as (...args: ReadonlyArray<unknown>) => unknown,
                  { handle: binding.needsHandle },
                );
              } else {
                yield* page.exposeFunction(
                  binding.name,
                  binding.callback as (...args: ReadonlyArray<unknown>) => unknown,
                );
              }
            }).pipe(
              Effect.catch((cause) =>
                Effect.logError(
                  `Failed to apply context binding ${binding.name}: ${getErrorMessage(cause)}`,
                ),
              ),
            ),
          { concurrency: 1, discard: true },
        ),
    });
  });

/**
 * Apply the context-level init scripts to a new page.
 *
 * Calls the page's `addInitScript` for each registered context-level
 * init script. Errors are logged but not propagated.
 */
const applyContextInitScriptsToPage = (
  page: CdpPageService,
  settings: ContextSettingsBundle,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const scripts = yield* Ref.get(settings.initScriptsSettings.scripts);
    yield* Arr.match(scripts, {
      onEmpty: () => Effect.void,
      onNonEmpty: (s) =>
        Effect.forEach(
          s,
          (script) =>
            page
              .addInitScript(script.source)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(`Failed to apply context init script: ${getErrorMessage(cause)}`),
                ),
              ),
          { concurrency: 1, discard: true },
        ),
    });
  });

/**
 * Apply the context-level HTTP routes to a new page.
 *
 * Calls the page's `route` for each registered context-level route.
 * Errors are logged but not propagated.
 */
const applyContextRoutesToPage = (
  page: CdpPageService,
  settings: ContextSettingsBundle,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const routes = yield* Ref.get(settings.routesSettings.routes);
    yield* Arr.match(routes, {
      onEmpty: () => Effect.void,
      onNonEmpty: (rs) =>
        Effect.forEach(
          rs,
          (route) =>
            page
              .route(route.url, route.handler, route.options)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(
                    `Failed to apply context route to page: ${getErrorMessage(cause)}`,
                  ),
                ),
              ),
          { concurrency: 1, discard: true },
        ),
    });
  });

/**
 * Apply the context-level WebSocket routes to a new page.
 *
 * Calls the page's `routeWebSocket` for each registered context-level
 * WebSocket route. Errors are logged but not propagated.
 */
const applyContextWebSocketRoutesToPage = (
  page: CdpPageService,
  settings: ContextSettingsBundle,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const routes = yield* Ref.get(settings.webSocketRoutesSettings.routes);
    yield* Arr.match(routes, {
      onEmpty: () => Effect.void,
      onNonEmpty: (rs) =>
        Effect.forEach(
          rs,
          (route) =>
            page
              .routeWebSocket(route.url, route.handler)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(
                    `Failed to apply context WebSocket route to page: ${getErrorMessage(cause)}`,
                  ),
                ),
              ),
          { concurrency: 1, discard: true },
        ),
    });
  });

/**
 * Apply the context-level HTTP credentials to a new page.
 *
 * Calls the page's `setHTTPCredentials` with the context-level credentials.
 * The page-level Route manager wires the credentials to `Fetch.authRequired`
 * responses. Passes `undefined` through when no credentials are configured
 * so the page's default (browser auth prompt) is restored. Errors are
 * logged but not propagated.
 */
const applyContextCredentialsToPage = (
  page: CdpPageService,
  settings: ContextSettingsBundle,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const credentials = yield* Ref.get(settings.credentialsSettings.credentials);
    yield* page
      .setHTTPCredentials(credentials)
      .pipe(
        Effect.catch((cause) =>
          Effect.logError(
            `Failed to apply context HTTP credentials to page: ${getErrorMessage(cause)}`,
          ),
        ),
      );
  });

/**
 * Create a new page target via CDP Target.createTarget.
 */
const createTarget = (
  connection: CdpConnectionService,
  browserContextId?: string,
): Effect.Effect<string, CdpError> =>
  Effect.gen(function* () {
    const params: Protocol.Target.CreateTargetRequest = { url: "about:blank" };
    if (browserContextId) {
      params.browserContextId = browserContextId;
    }

    const result = yield* connection.cdp.Target.createTarget(params).pipe(
      mapCdpError("Cdp", "createTarget"),
    );

    const targetId = result.targetId;
    if (!targetId) {
      return yield* new CdpError({
        module: "Cdp",
        method: "createTarget",
        reason: new ConnectionError({
          description: "Target.createTarget returned no targetId",
        }),
      });
    }

    yield* Effect.logDebug(`Created new page target: ${targetId}`);
    return targetId;
  });

/**
 * Create a CdpPageService for a target, providing connection and config layers.
 *
 * Returns an Effect that requires Scope — the page's event stream consumer
 * lives in the caller's scope so it stays alive as long as the page is used.
 *
 * @param contextHandle - Optional context handle. When provided, the page's
 *   `context` accessor returns this handle (mirrors Playwright's
 *   `page.context()` getter as an Effect). When omitted (e.g., for
 *   short-lived restore pages), `page.context` fails with a clear error.
 */
const makePage = (
  targetId: string,
  connection: CdpConnectionService,
  config: CdpConfigService,
  timeoutSettings?: ContextTimeoutSettings,
  contextHandle?: CdpContextHandle,
): Effect.Effect<CdpPageService, never, Scope.Scope> =>
  CdpPage.make(targetId, timeoutSettings, contextHandle).pipe(
    Effect.provideService(CdpConnection, connection),
    Effect.provideService(CdpConfig, config),
  );

/**
 * Build a session-id getter that resolves lazily to the page's current
 * session ID. The getter is captured by {@link makeContextHandle} which
 * needs it for cookie/storage operations.
 *
 * Breaks the chicken-and-egg between `CdpContextHandle` (which needs the
 * page's session) and `CdpPageService` (which needs the handle for
 * `page.context`). The ref is empty when the handle is constructed; the
 * caller sets it after creating the page.
 */
const makeSessionGetterFromRef =
  (pageRef: Ref.Ref<Option.Option<CdpPageService>>): (() => Effect.Effect<string, CdpError>) =>
  () =>
    Effect.flatMap(Ref.get(pageRef), (opt) =>
      Option.match(opt, {
        onNone: () =>
          Effect.fail(
            new CdpError({
              module: "Cdp",
              method: "makeContextHandle",
              reason: new EvaluationError({
                description: "Page reference not set",
              }),
            }),
          ),
        onSome: (page) => page.use((_, sid) => Effect.succeed(sid)),
      }),
    );

/**
 * Connect to a CDP endpoint.
 *
 * Returns the connection. The caller is responsible for creating a page
 * (and any context handle) — this separation lets callers structure
 * page+handle creation to break the chicken-and-egg dependency between
 * `CdpPageService.context` and `CdpContextHandle.getSessionId`.
 *
 * Requires Scope from the caller so the connection stays alive.
 * Released via `Effect.acquireRelease` against the caller's scope.
 */
const connect = (cdpUrl: string, config: CdpConfigService) =>
  Effect.acquireRelease(
    CdpConnection.make(cdpUrl).pipe(
      Effect.provide(Layer.succeed(CdpConfig, config)),
      mapCdpError("Cdp", "connect"),
    ),
    (conn) => conn.close().pipe(Effect.orDie),
  );

// ── Handle Implementations ────────────────────────────────────────────────────

/**
 * Parse a URL string and return its origin, or `undefined` for unparseable
 * URLs.
 */
const parseOrigin = (urlString: string): string | undefined => {
  try {
    return new URL(urlString).origin;
  } catch {
    return undefined;
  }
};

/**
 * Create a CdpContextHandle — the public context-level API.
 *
 * Cookies are scoped to the *context*, not the page, in Playwright; this
 * handle exposes them at the context level. Page-level cookies (see
 * {@link CdpPageService}) delegate to the same underlying CDP calls.
 */

const makeContextHandle = (
  contextId: string | undefined,
  connection: CdpConnectionService,
  config: CdpConfigService,
  getSessionId: () => Effect.Effect<string, CdpError>,
  settings: ContextSettingsBundle,
): CdpContextHandle => {
  // Forward-reference the handle so `withPage` can pass it to the new page.
  // The handle is set before any user code calls it, so this is safe.
  let handle!: CdpContextHandle;
  handle = {
    withPage: <A, E, R>(
      fn: (page: CdpPageService) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | CdpError, Exclude<R, Scope.Scope>> =>
      Effect.gen(function* () {
        const targetId = yield* createTarget(connection, contextId);

        // Close the page target when scope exits
        yield* Effect.acquireRelease(Effect.void, () =>
          connection.cdp.Target.closeTarget({ targetId }).pipe(Effect.ignore),
        );

        const page = yield* makePage(
          targetId,
          connection,
          config,
          settings.timeoutSettings,
          handle,
        );

        // Register the page in the context's pages list.
        yield* Ref.update(settings.pagesList.pages, (pages) => [...pages, page]);

        // Apply any context-level overrides to the new page session.
        // Each helper reads from the context settings and applies the
        // corresponding per-session CDP call. Errors are logged but not
        // propagated.
        const sid = yield* page.use((_, s) => Effect.succeed(s));
        yield* applyContextUserAgentIfSet(connection, sid, settings.userAgentSettings);
        yield* applyContextGeolocationIfSet(connection, sid, settings.geolocationSettings);
        yield* applyContextOfflineIfSet(connection, sid, settings.offlineSettings);

        // Fancast all context-level page-side state to the new page.
        // This applies the same state (headers, routes, bindings, init
        // scripts, WebSocket routes) as if the user had called the
        // context-level methods *after* creating the page.
        yield* applyContextHeadersToPage(page, settings);
        yield* applyContextBindingsToPage(page, settings);
        yield* applyContextInitScriptsToPage(page, settings);
        yield* applyContextRoutesToPage(page, settings);
        yield* applyContextWebSocketRoutesToPage(page, settings);
        yield* applyContextCredentialsToPage(page, settings);

        return yield* fn(page);
      }).pipe(Effect.scoped),

    cookies: (urls?: string | string[]) =>
      Effect.gen(function* () {
        const sessionId = yield* getSessionId();
        return yield* contextGetCookies(connection, sessionId, urls);
      }),

    addCookies: (cookies: CookieData[]) =>
      Effect.gen(function* () {
        const sessionId = yield* getSessionId();
        yield* contextAddCookies(connection, sessionId, cookies);
      }),

    clearCookies: (options?) =>
      Effect.gen(function* () {
        const sessionId = yield* getSessionId();
        yield* contextClearCookies(connection, sessionId, options);
      }),

    setUserAgent: (
      userAgent: string,
      options?: { readonly userAgentMetadata?: UserAgentMetadata },
    ) =>
      Effect.gen(function* () {
        // Store the override so future pages created in this context receive it
        yield* Ref.set(
          settings.userAgentSettings.userAgent,
          options?.userAgentMetadata !== undefined
            ? { userAgent, userAgentMetadata: options.userAgentMetadata }
            : { userAgent },
        );
        // Apply to the default page session (if any session is active)
        const sessionId = yield* getSessionId();
        yield* applyUserAgentOverride(
          connection,
          sessionId,
          options?.userAgentMetadata !== undefined
            ? { userAgent, userAgentMetadata: options.userAgentMetadata }
            : { userAgent },
        );
      }),

    setGeolocation: (geolocation: Geolocation | undefined) =>
      Effect.gen(function* () {
        // Store the override so future pages created in this context receive it
        yield* Ref.set(settings.geolocationSettings.geolocation, geolocation);
        // Apply to the default page session (if any session is active)
        const sessionId = yield* getSessionId();
        yield* applyGeolocationOverride(connection, sessionId, geolocation);
      }),

    setOffline: (offline: boolean) =>
      Effect.gen(function* () {
        // Store the override so future pages created in this context receive it
        yield* Ref.set(settings.offlineSettings.offline, offline);
        // Apply to the default page session (if any session is active)
        const sessionId = yield* getSessionId();
        yield* applyOfflineOverride(connection, sessionId, offline);
      }),

    grantPermissions: (
      permissions: ReadonlyArray<PermissionName>,
      options?: GrantPermissionsOptions,
    ) =>
      Effect.gen(function* () {
        // Map web platform permission names to CDP PermissionType strings
        // (the public API uses kebab-case, the wire format is camelCase).
        // Each name may produce one or more CDP types (e.g. `local-network-access`).
        // First, validate every name before mapping — fail fast on the first
        // unknown permission rather than partially applying.
        const mapped = yield* Effect.forEach(
          permissions,
          (name) =>
            Effect.gen(function* () {
              const cdpType = toCdpPermissionType(name);
              if (cdpType === undefined) {
                return yield* new CdpError({
                  module: "CdpContextHandle",
                  method: "grantPermissions",
                  reason: new ConnectionError({
                    description: `Unknown permission: ${name}`,
                  }),
                });
              }
              return Array.isArray(cdpType) ? cdpType : [cdpType];
            }),
          { concurrency: 1 },
        );
        const cdpPermissions = mapped.flat();
        const params: Parameters<typeof connection.cdp.Browser.grantPermissions>[0] = {
          permissions: cdpPermissions,
        };
        if (contextId !== undefined) {
          params.browserContextId = contextId;
        }
        if (options?.origin !== undefined) {
          params.origin = options.origin;
        }
        yield* connection.cdp.Browser.grantPermissions(params).pipe(
          mapCdpError("CdpContextHandle", "grantPermissions"),
        );
      }),

    clearPermissions: () =>
      Effect.gen(function* () {
        const params: Parameters<typeof connection.cdp.Browser.resetPermissions>[0] = {};
        if (contextId !== undefined) {
          params.browserContextId = contextId;
        }
        yield* connection.cdp.Browser.resetPermissions(params).pipe(
          mapCdpError("CdpContextHandle", "clearPermissions"),
        );
      }),

    storageState: () =>
      Effect.gen(function* () {
        const sessionId = yield* getSessionId();
        return yield* captureStorageState(connection, sessionId, contextId, (sid) =>
          contextGetCookies(connection, sid),
        );
      }),

    addStorageState: (state: StorageState): Effect.Effect<void, CdpError, never> =>
      Effect.scoped(
        Effect.gen(function* () {
          // Cookies: Network.setCookies is per-session. To ensure cookies persist
          // to the browser context, we open a fresh page per cookie origin and
          // set cookies via that page's session. This mirrors Playwright's
          // behavior and ensures cookies are visible to all subsequent pages.
          const cookieData = [...cookiesToCookieData(state.cookies)];

          // Group cookies by origin
          const cookiesByOrigin = new Map<string, CookieData[]>();
          for (const c of cookieData) {
            let origin: string | undefined;
            if (c.url) {
              origin = parseOrigin(c.url);
            }
            if (!origin && c.domain) {
              origin = `${c.secure ? "https" : "http"}://${c.domain}`;
            }
            if (!origin) continue;
            const existing = cookiesByOrigin.get(origin) ?? [];
            existing.push(c);
            cookiesByOrigin.set(origin, existing);
          }

          // For each unique cookie origin, open a fresh page and set cookies.
          // We navigate to `${origin}/` which is the cookie's origin; if that
          // fails (e.g. no server listening, or browser-level network errors),
          // we silently skip and rely on Network.setCookies to apply the
          // cookie via domain+path.
          yield* Effect.forEach(
            Array.from(cookiesByOrigin.entries()),
            ([origin, cookies]) =>
              Effect.gen(function* () {
                const restoreTargetId = yield* createTarget(connection, contextId);
                yield* Effect.acquireRelease(Effect.void, () =>
                  connection.cdp.Target.closeTarget({ targetId: restoreTargetId }).pipe(
                    Effect.ignore,
                  ),
                );
                const restorePage = yield* makePage(
                  restoreTargetId,
                  connection,
                  config,
                  settings.timeoutSettings,
                );

                // Navigate to the origin. Swallow navigation errors so a failed
                // nav (e.g. unresolvable host) doesn't abort the whole restore.
                // The cookie is set via Network.setCookies regardless.
                yield* restorePage
                  .goto(`${origin}/`, { timeout: 5000 })
                  .pipe(Effect.catch(() => Effect.void));

                const sid = yield* restorePage.use((_, s) => Effect.succeed(s));
                yield* applyContextUserAgentIfSet(connection, sid, settings.userAgentSettings);
                yield* applyContextGeolocationIfSet(connection, sid, settings.geolocationSettings);
                yield* applyContextOfflineIfSet(connection, sid, settings.offlineSettings);
                yield* contextAddCookies(connection, sid, cookies);
              }),
            { concurrency: 1, discard: true },
          );

          // localStorage: for each origin, open a fresh page in this context and
          // write the entries via page.evaluate. The page is scoped so it closes
          // automatically once localStorage is set.
          yield* Effect.forEach(
            state.origins,
            (origin) =>
              Effect.gen(function* () {
                const targetId = yield* createTarget(connection, contextId);
                yield* Effect.acquireRelease(Effect.void, () =>
                  connection.cdp.Target.closeTarget({ targetId }).pipe(Effect.ignore),
                );

                // Page must navigate to the origin before localStorage can be set
                const restorePage = yield* makePage(
                  targetId,
                  connection,
                  config,
                  settings.timeoutSettings,
                );
                yield* restorePage.goto(origin.origin);

                // Apply context-level user agent override to the restore page too
                const sid = yield* restorePage.use((_, s) => Effect.succeed(s));
                yield* applyContextUserAgentIfSet(connection, sid, settings.userAgentSettings);
                yield* applyContextGeolocationIfSet(connection, sid, settings.geolocationSettings);
                yield* applyContextOfflineIfSet(connection, sid, settings.offlineSettings);

                // Write each entry. Errors are silently swallowed — partial state
                // is better than no state on a restore.
                yield* Effect.forEach(
                  origin.localStorage,
                  ({ name, value }) =>
                    restorePage
                      .evaluate(
                        `(args) => { localStorage.setItem(args.name, args.value); return true; }`,
                        { name, value },
                      )
                      .pipe(Effect.catch(() => Effect.void)),
                  { concurrency: 1, discard: true },
                );
              }),
            { concurrency: 1, discard: true },
          );
        }),
      ),

    setDefaultTimeout: (timeout: number | undefined) =>
      Ref.set(
        settings.timeoutSettings.defaultTimeout,
        timeout !== undefined ? Duration.millis(timeout) : undefined,
      ),

    setDefaultNavigationTimeout: (timeout: number | undefined) =>
      Ref.set(
        settings.timeoutSettings.defaultNavigationTimeout,
        timeout !== undefined ? Duration.millis(timeout) : undefined,
      ),

    // ─── Phase P4: Context-level routing ─────────────────────────────────────

    route: (url: RouteUrlMatch, handler: RouteHandlerCallback, options?: RouteOptions) =>
      Effect.gen(function* () {
        // 1. Add to context routes so future pages receive it
        yield* Ref.update(settings.routesSettings.routes, (rs) => [
          { url, handler, options },
          ...rs,
        ]);
        // 2. Apply to every existing page in the context
        const pages = yield* Ref.get(settings.pagesList.pages);
        yield* Effect.forEach(
          pages,
          (page) =>
            page
              .route(url, handler, options)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(
                    `Failed to apply context route to existing page: ${getErrorMessage(cause)}`,
                  ),
                ),
              ),
          { concurrency: 1, discard: true },
        );
      }),

    unroute: (url: RouteUrlMatch, handler?: RouteHandlerCallback) =>
      Effect.gen(function* () {
        // 1. Remove from context routes
        yield* Ref.update(settings.routesSettings.routes, (rs) =>
          rs.filter((r) => !(urlMatchesEqual(r.url, url) && (!handler || r.handler === handler))),
        );
        // 2. Remove from every existing page in the context
        const pages = yield* Ref.get(settings.pagesList.pages);
        yield* Effect.forEach(
          pages,
          (page) =>
            page
              .unroute(url, handler)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(
                    `Failed to remove context route from existing page: ${getErrorMessage(cause)}`,
                  ),
                ),
              ),
          { concurrency: 1, discard: true },
        );
      }),

    unrouteAll: () =>
      Effect.gen(function* () {
        // 1. Clear context routes
        yield* Ref.set(settings.routesSettings.routes, []);
        // 2. Clear on every existing page
        const pages = yield* Ref.get(settings.pagesList.pages);
        yield* Effect.forEach(
          pages,
          (page) =>
            page
              .unrouteAll()
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(
                    `Failed to clear routes on existing page: ${getErrorMessage(cause)}`,
                  ),
                ),
              ),
          { concurrency: 1, discard: true },
        );
      }),

    routeWebSocket: (url: RouteUrlMatch, handler: CdpWebSocketRouteHandlerCallback) =>
      Effect.gen(function* () {
        // 1. Add to context WebSocket routes so future pages receive it
        yield* Ref.update(settings.webSocketRoutesSettings.routes, (rs) => [
          { url, handler },
          ...rs,
        ]);
        // 2. Apply to every existing page
        const pages = yield* Ref.get(settings.pagesList.pages);
        yield* Effect.forEach(
          pages,
          (page) =>
            page
              .routeWebSocket(url, handler)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(
                    `Failed to apply context WebSocket route to existing page: ${getErrorMessage(cause)}`,
                  ),
                ),
              ),
          { concurrency: 1, discard: true },
        );
      }),

    // ─── Phase P4: Context-level HTTP setup ─────────────────────────────────

    setExtraHTTPHeaders: (headers: Record<string, string>) =>
      Effect.gen(function* () {
        // 1. Store at context level for future pages
        yield* Ref.set(settings.headersSettings.headers, headers);
        // 2. Apply to every existing page
        const pages = yield* Ref.get(settings.pagesList.pages);
        yield* Effect.forEach(
          pages,
          (page) =>
            page
              .setExtraHTTPHeaders(headers)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(
                    `Failed to apply context extra HTTP headers to existing page: ${getErrorMessage(cause)}`,
                  ),
                ),
              ),
          { concurrency: 1, discard: true },
        );
      }),

    setHTTPCredentials: (
      httpCredentials:
        | { readonly username: string; readonly password: string; readonly origin?: string }
        | undefined,
    ) =>
      Effect.gen(function* () {
        // 1. Store at context level for future pages (consumed by
        //    `applyContextCredentialsToPage` during `withPage`).
        yield* Ref.set(settings.credentialsSettings.credentials, httpCredentials);
        // 2. Apply to every existing page — each page's Route manager
        //    consults its own credentials Ref on every `Fetch.authRequired`
        //    event, so the new credentials take effect immediately.
        const pages = yield* Ref.get(settings.pagesList.pages);
        yield* Effect.forEach(
          pages,
          (page) =>
            page
              .setHTTPCredentials(httpCredentials)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(
                    `Failed to apply context HTTP credentials to existing page: ${getErrorMessage(cause)}`,
                  ),
                ),
              ),
          { concurrency: 1, discard: true },
        );
      }),

    // ─── Phase P4: Context-level function exposure ──────────────────────────

    exposeFunction: <Args extends ReadonlyArray<unknown> = ReadonlyArray<unknown>, R = unknown>(
      name: string,
      callback: (...args: Args) => R | Promise<R> | Effect.Effect<R, never, never>,
    ) =>
      Effect.gen(function* () {
        const binding: ContextBinding = {
          name,
          exposeSource: false,
          needsHandle: false,
          callback: callback as (...args: ReadonlyArray<unknown>) => unknown,
        };
        // 1. Store at context level for future pages
        yield* Ref.update(settings.bindingsSettings.bindings, (map) => {
          const next = new Map(map);
          next.set(name, binding);
          return next;
        });
        // 2. Apply to every existing page
        const pages = yield* Ref.get(settings.pagesList.pages);
        yield* Effect.forEach(
          pages,
          (page) =>
            page
              .exposeFunction(name, callback)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(
                    `Failed to apply context exposeFunction to existing page: ${getErrorMessage(cause)}`,
                  ),
                ),
              ),
          { concurrency: 1, discard: true },
        );
      }),

    exposeBinding: <Args extends ReadonlyArray<unknown> = ReadonlyArray<unknown>, R = unknown>(
      name: string,
      callback: (
        ...args: readonly [unknown, ...Args]
      ) => R | Promise<R> | Effect.Effect<R, never, never>,
      options?: { readonly handle?: boolean },
    ) =>
      Effect.gen(function* () {
        const binding: ContextBinding = {
          name,
          exposeSource: true,
          needsHandle: options?.handle === true,
          callback: callback as (...args: ReadonlyArray<unknown>) => unknown,
        };
        // 1. Store at context level for future pages
        yield* Ref.update(settings.bindingsSettings.bindings, (map) => {
          const next = new Map(map);
          next.set(name, binding);
          return next;
        });
        // 2. Apply to every existing page
        const pages = yield* Ref.get(settings.pagesList.pages);
        yield* Effect.forEach(
          pages,
          (page) =>
            page
              .exposeBinding(name, callback, options)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(
                    `Failed to apply context exposeBinding to existing page: ${getErrorMessage(cause)}`,
                  ),
                ),
              ),
          { concurrency: 1, discard: true },
        );
      }),

    // ─── Phase P4: Context-level init scripts ───────────────────────────────

    addInitScript: (script: EvaluateFn<unknown>) =>
      Effect.gen(function* () {
        const source = Predicate.isFunction(script)
          ? `(() => { (${script.toString()})(); })();`
          : `(() => { ${script} })();`;
        // 1. Store at context level for future pages
        yield* Ref.update(settings.initScriptsSettings.scripts, (scripts) => [
          ...scripts,
          { source },
        ]);
        // 2. Apply to every existing page
        const pages = yield* Ref.get(settings.pagesList.pages);
        yield* Effect.forEach(
          pages,
          (page) =>
            page
              .addInitScript(script)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logError(
                    `Failed to apply context addInitScript to existing page: ${getErrorMessage(cause)}`,
                  ),
                ),
              ),
          { concurrency: 1, discard: true },
        );
      }),
  };
  return handle;
};

const makeConnectionHandle = (
  connection: CdpConnectionService,
  config: CdpConfigService,
): CdpConnectionHandle => ({
  withContext: <A, E, R>(
    fn: (scope: CdpContextScope) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | CdpError, Exclude<R, Scope.Scope>> =>
    Effect.gen(function* () {
      const ctxResult = yield* connection.cdp.Target.createBrowserContext({
        disposeOnDetach: true,
      }).pipe(mapContextError("CdpConnectionHandle", "withContext"));

      const contextId = ctxResult.browserContextId;
      if (!contextId) {
        return yield* new CdpError({
          module: "CdpConnectionHandle",
          method: "withContext",
          reason: new ConnectionError({
            description: "Target.createBrowserContext returned no browserContextId",
          }),
        });
      }

      // Register cleanup for the browser context in the current scope
      yield* Effect.acquireRelease(Effect.succeed(contextId), (id) =>
        connection.cdp.Target.disposeBrowserContext({ browserContextId: id }).pipe(Effect.ignore),
      );

      // Create timeout settings for this context (shared by all pages in the context)
      const settings = yield* makeEmptyContextSettings;

      // Create a page ref so the context handle can resolve the session
      // lazily once the page is created. Breaks the chicken-and-egg
      // between CdpContextHandle (needs page session) and CdpPageService
      // (needs context handle for page.context).
      const pageRef = yield* Ref.make<Option.Option<CdpPageService>>(Option.none());
      const contextHandle = makeContextHandle(
        contextId,
        connection,
        config,
        makeSessionGetterFromRef(pageRef),
        settings,
      );

      const targetId = yield* createTarget(connection, contextId);

      // Close the page target when scope exits
      yield* Effect.acquireRelease(Effect.void, () =>
        connection.cdp.Target.closeTarget({ targetId }).pipe(Effect.ignore),
      );

      const page = yield* makePage(
        targetId,
        connection,
        config,
        settings.timeoutSettings,
        contextHandle,
      );
      yield* Ref.set(pageRef, Option.some(page));
      // Register the default page in the context's pages list (so
      // context-level methods can fancast to it).
      yield* Ref.update(settings.pagesList.pages, (pages) => [...pages, page]);

      return yield* fn({ context: contextHandle, page });
    }).pipe(Effect.scoped),

  withPage: <A, E, R>(
    fn: (page: CdpPageService) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | CdpError, Exclude<R, Scope.Scope>> =>
    Effect.gen(function* () {
      const targetId = yield* createTarget(connection);

      // Close the page target when scope exits
      yield* Effect.acquireRelease(Effect.void, () =>
        connection.cdp.Target.closeTarget({ targetId }).pipe(Effect.ignore),
      );

      // Build a default context handle so `page.context` returns a handle
      // (mirrors `connection.withConnection` semantics — every page is in
      // some context, even if it's the default one).
      const pageRef = yield* Ref.make<Option.Option<CdpPageService>>(Option.none());
      const settings = yield* makeEmptyContextSettings;
      const contextHandle = makeContextHandle(
        undefined,
        connection,
        config,
        makeSessionGetterFromRef(pageRef),
        settings,
      );

      const page = yield* makePage(
        targetId,
        connection,
        config,
        settings.timeoutSettings,
        contextHandle,
      );
      yield* Ref.set(pageRef, Option.some(page));
      // Register the default page in the context's pages list.
      yield* Ref.update(settings.pagesList.pages, (pages) => [...pages, page]);
      return yield* fn(page);
    }).pipe(Effect.scoped),
});

// ── Service Implementation ────────────────────────────────────────────────────

/**
 * Constructs a `CdpService` that opens raw CDP connections and page targets
 * bound to an ambient `Scope`.
 */
const make = Effect.gen(function* () {
  const config = yield* CdpConfig;

  // ── Primitives (escape hatch — Scope.Scope in R) ─────────────────────────────

  const acquireSession = Effect.fn("Cdp.acquireSession")(
    <T extends BrowserProviderSessionBase, O>(source: {
      provider: BrowserProviderService<T, O>;
      options?: O;
    }): Effect.Effect<
      CdpSessionScope<T & BrowserProviderSession>,
      CdpError | BrowserProviderError,
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
              new CdpError({
                module: "Cdp",
                method: "acquireSession",
                reason: new ConnectionError({
                  description:
                    "Provider does not support CDP connections. See BrowserProvider docs for compatible providers.",
                }),
              }),
            ),
          onSome: (url) => Effect.succeed(url),
        });

        const sessionWithCdp = { ...session, cdpUrl } as T & BrowserProviderSession;

        // Create timeout settings for the default context
        const settings = yield* makeEmptyContextSettings;

        const connection = yield* connect(Redacted.value(cdpUrl), config);
        const handle = makeConnectionHandle(connection, config);

        const pageRef = yield* Ref.make<Option.Option<CdpPageService>>(Option.none());
        const context = makeContextHandle(
          undefined,
          connection,
          config,
          makeSessionGetterFromRef(pageRef),
          settings,
        );

        const targetId = yield* createTarget(connection);
        yield* Effect.acquireRelease(Effect.void, () =>
          connection.cdp.Target.closeTarget({ targetId }).pipe(Effect.ignore),
        );
        const page = yield* makePage(
          targetId,
          connection,
          config,
          settings.timeoutSettings,
          context,
        );
        yield* Ref.set(pageRef, Option.some(page));
        // Register the default page in the context's pages list.
        yield* Ref.update(settings.pagesList.pages, (pages) => [...pages, page]);

        return { session: sessionWithCdp, connection: handle, context, page };
      }),
  );

  const acquireConnection = Effect.fn("Cdp.acquireConnection")(
    (source: ConnectionSource): Effect.Effect<CdpConnectionScope, CdpError, Scope.Scope> =>
      Effect.gen(function* () {
        const cdpUrl = resolveConnectionSource(source);

        // Create timeout settings for the default context
        const settings = yield* makeEmptyContextSettings;

        const connection = yield* connect(cdpUrl, config);
        const handle = makeConnectionHandle(connection, config);

        // Create a page ref so the context handle can resolve the session
        // lazily once the page is created. Breaks the chicken-and-egg
        // between CdpContextHandle (needs page session) and CdpPageService
        // (needs context handle for page.context).
        const pageRef = yield* Ref.make<Option.Option<CdpPageService>>(Option.none());
        const context = makeContextHandle(
          undefined,
          connection,
          config,
          makeSessionGetterFromRef(pageRef),
          settings,
        );

        // Create the default page in the default context. Pass the context
        // handle so page.context returns it.
        const targetId = yield* createTarget(connection);
        yield* Effect.acquireRelease(Effect.void, () =>
          connection.cdp.Target.closeTarget({ targetId }).pipe(Effect.ignore),
        );
        const page = yield* makePage(
          targetId,
          connection,
          config,
          settings.timeoutSettings,
          context,
        );
        yield* Ref.set(pageRef, Option.some(page));
        // Register the default page in the context's pages list.
        yield* Ref.update(settings.pagesList.pages, (pages) => [...pages, page]);

        return { connection: handle, context, page };
      }),
  );

  const acquirePage = Effect.fn("Cdp.acquirePage")(
    (source: ConnectionSource): Effect.Effect<CdpPageService, CdpError, Scope.Scope> =>
      Effect.gen(function* () {
        const cdpUrl = resolveConnectionSource(source);
        const connection = yield* Effect.acquireRelease(
          CdpConnection.make(cdpUrl).pipe(
            Effect.provide(Layer.succeed(CdpConfig, config)),
            mapCdpError("Cdp", "acquirePage"),
          ),
          (conn) => conn.close().pipe(Effect.orDie),
        );
        const targetId = yield* createTarget(connection);

        // Close the page target when scope exits
        yield* Effect.acquireRelease(Effect.void, () =>
          connection.cdp.Target.closeTarget({ targetId }).pipe(Effect.ignore),
        );

        // Build a default context handle so the page's `context` accessor
        // returns a handle (mirrors `withConnection`/`withSession` semantics
        // — every page is in some context, even if it's the default one).
        const pageRef = yield* Ref.make<Option.Option<CdpPageService>>(Option.none());
        const settings = yield* makeEmptyContextSettings;
        const context = makeContextHandle(
          undefined,
          connection,
          config,
          makeSessionGetterFromRef(pageRef),
          settings,
        );

        const page = yield* makePage(
          targetId,
          connection,
          config,
          settings.timeoutSettings,
          context,
        );
        yield* Ref.set(pageRef, Option.some(page));
        // Register the default page in the context's pages list.
        yield* Ref.update(settings.pagesList.pages, (pages) => [...pages, page]);

        return page;
      }),
  );

  // ── Callback wrappers (sugar over the primitives) ───────────────────────────

  const withSession = Effect.fn("Cdp.withSession")(
    <T extends BrowserProviderSessionBase, O, A, E, R>(
      source: { provider: BrowserProviderService<T, O>; options?: O },
      fn: (scope: CdpSessionScope<T & BrowserProviderSession>) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | CdpError | BrowserProviderError, Exclude<R, Scope.Scope>> =>
      Effect.gen(function* () {
        const sessionScope = yield* acquireSession(source);
        return yield* fn(sessionScope);
      }).pipe(Effect.scoped),
  );

  const withConnection = Effect.fn("Cdp.withConnection")(
    <A, E, R>(
      source: ConnectionSource,
      fn: (scope: CdpConnectionScope) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | CdpError, Exclude<R, Scope.Scope>> =>
      Effect.gen(function* () {
        const connectionScope = yield* acquireConnection(source);
        return yield* fn(connectionScope);
      }).pipe(Effect.scoped),
  );

  const withPage = Effect.fn("Cdp.withPage")(
    <A, E, R>(
      source: ConnectionSource,
      fn: (page: CdpPageService) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | CdpError, Exclude<R, Scope.Scope>> =>
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
  } satisfies CdpService;
});

// ── Service Definition ────────────────────────────────────────────────────────

/**
 * Service tag for the Cdp browser service.
 *
 * **When to use**
 *
 * Use when you need a minimal-footprint browser service with no upstream
 * dependencies, or when you need raw CDP access. The package is experimental;
 * its API surface is stable and awaiting human review for v1. Prefer
 * `browser-playwright` for most production use cases. For AI-powered
 * automation, use `browser-stagehand`.
 *
 * **Mental model**
 *
 * The API mirrors the other drivers, exposing two tracks at every level:
 *
 * - **Callbacks** (`withSession` / `withConnection` / `withPage`) open a
 *   resource, run an inner effect, and close the resource when it completes.
 * - **Primitives** (`acquireSession` / `acquireConnection` / `acquirePage`)
 *   return the resource bound to the caller's ambient `Scope`, so it can
 *   outlive a single block.
 *
 * **Common tasks**
 *
 * - Open a CDP connection and evaluate JavaScript on a page with `withPage`.
 * - Spawn isolated browser contexts off one connection with
 *   `connection.withContext`.
 * - Read and set cookies through the context handle.
 *
 * **Example** (Evaluate an expression on a page)
 *
 * ```typescript
 * import { Cdp } from "@effect-libs/browser-cdp";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const cdp = yield* Cdp;
 *
 *   return yield* cdp.withConnection({ url: "wss://..." }, ({ page }) =>
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
 * **Gotchas**
 *
 * - Page-level methods (`page.click`, `page.locator`, `page.getByRole`, ...)
 *   mirror upstream Playwright's `Page` API with full auto-wait and
 *   actionability checks — not a separate "convenience" surface. For raw CDP
 *   commands outside the Playwright surface, use
 *   `page.use((cdp, sessionId) => ...)`.
 * - Isolated contexts rely on `Target.createBrowserContext`, which some
 *   browsers reject — the error surfaces as `ContextNotSupportedError` and
 *   points to `withPage` instead.
 * - Primitives require `Scope` in their environment; without an ambient scope,
 *   or if disposal is skipped, connections and page targets can leak.
 *
 * @see {@link CdpService} for the full service contract
 *
 * @category services
 * @since 0.1.0
 */
export class Cdp extends Context.Service<Cdp, CdpService>()("effect-libs/browser/Cdp", { make }) {
  static readonly layerNoDeps: Layer.Layer<Cdp, never, CdpConfig> = Layer.effect(this, this.make);
  static readonly layer: Layer.Layer<Cdp> = this.layerNoDeps.pipe(Layer.provide(CdpConfig.layer));
}
