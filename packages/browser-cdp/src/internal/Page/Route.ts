/**
 * Route interception for CDP pages.
 *
 * Provides Playwright-compatible request interception using CDP's Fetch domain.
 * When a route is registered, `Fetch.enable` is activated to pause matching
 * requests. The handler receives a `RouteHandle` (with continue/abort/fulfill/fallback)
 * and an `InterceptedRequest` (with URL, method, headers, etc.).
 *
 * Adapted from Playwright's `Route` + `RouteHandler` + `RouteImpl` classes:
 *   - client/network.ts (Route, RouteHandler)
 *   - server/network.ts (Route — server-side dispatch)
 *   - server/chromium/crNetworkManager.ts (RouteImpl — CDP Fetch commands)
 *   - utils/isomorphic/urlMatch.ts (globToRegexPattern, urlMatches)
 *
 * Dispatch architecture (matching Playwright):
 *   - Each intercepted request creates a dispatch context with:
 *     - `_futureHandlers`: mutable array of handlers to process
 *     - `_currentHandler`: handler currently executing
 *   - When `fallback()` is called, next handler is shifted from `_futureHandlers`
 *   - When `unroute()` removes a handler during dispatch:
 *     - Remove from `_futureHandlers` (won't be processed)
 *     - If it was `_currentHandler`, trigger `fallback()` to continue
 *
 */

import type { Protocol } from "devtools-protocol";
import type { Scope } from "effect";

import type { CdpError } from "../../CdpError.js";
import type { CdpConnection } from "../CdpConnection.js";
import type { NetworkResponseTracker } from "./NetworkResponseTracker.js";
import type { PageState } from "./PageState.js";
import type { Response } from "./Response.js";

import { Effect, Ref, Stream } from "effect";
import * as Arr from "effect/Array";

import { CdpError as CdpErrorClass, CommandError, EvaluationError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { makeResponse } from "./Response.js";
import { type RouteUrlMatch, urlMatches, urlMatchesEqual } from "./UrlMatch.js";

// Re-export the URL match type from the shared module so existing
// `RouteUrlMatch` imports keep working.
export type { RouteUrlMatch } from "./UrlMatch.js";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Information about an intercepted network request.
 *
 * Mirrors Playwright's `Request` properties available during route handling.
 */
export interface InterceptedRequest {
  /** The URL of the request. */
  readonly url: string;
  /** HTTP method (GET, POST, etc.). */
  readonly method: string;
  /** Request headers (key-value pairs) at interception time. */
  readonly headers: Record<string, string>;
  /**
   * Returns all request headers.
   *
   * In Playwright, this fetches additional headers from the browser that
   * weren't available at interception time. In our CDP implementation,
   * we return the headers captured from Fetch.requestPaused.
   *
   * Returns an Effect to match Playwright's async Promise-based API.
   */
  allHeaders(): Effect.Effect<Record<string, string>, never, never>;

  /**
   * Returns the response for this request, or null if not available.
   *
   * The response is only available after the request has completed
   * (i.e., after the route handler has called continue/fulfill and
   * the response has been received from the server).
   *
   * Returns an Effect that resolves to a Response object or null.
   */
  response(): Effect.Effect<Response | null, never, never>;

  /**
   * Returns the failure info for this request, or null if not failed.
   *
   * The failure info is only available after the request has failed
   * (i.e., after the route handler has called abort(), or the browser
   * cancelled the request due to network error, etc.).
   *
   * Returns an Effect that resolves to failure info or null.
   */
  failure(): Effect.Effect<{ errorText: string } | null, never, never>;

  /** Request payload (POST data), or null if none. */
  readonly postData: string | null;
  /** Resource type (document, stylesheet, script, image, xhr, fetch, etc.). */
  readonly resourceType: string;
  /** Whether this is a navigation request. */
  readonly isNavigationRequest: boolean;

  /**
   * Returns the request that this request was redirected from.
   *
   * When a request redirects (e.g., 301/302), this returns the previous
   * request in the redirect chain. Returns null if this is not a redirect.
   *
   * Returns an Effect to match Playwright's async Promise-based API.
   */
  redirectedFrom(): Effect.Effect<InterceptedRequest | null, never, never>;

  /**
   * Returns the request that this request redirects to.
   *
   * When a request redirects (e.g., 301/302), this returns the next
   * request in the redirect chain. Returns null if this request doesn't redirect.
   *
   * Returns an Effect to match Playwright's async Promise-based API.
   */
  redirectedTo(): Effect.Effect<InterceptedRequest | null, never, never>;
}

/**
 * Options for continuing a request with modifications.
 */
export interface ContinueOverrides {
  /** Override the URL. */
  readonly url?: string;
  /** Override the HTTP method. */
  readonly method?: string;
  /** Override request headers (merged with original). */
  readonly headers?: Record<string, string>;
  /** Override POST data. */
  readonly postData?: string;
}

/**
 * Response to fulfill a request with.
 */
export interface FulfillResponse {
  /** HTTP status code (default: 200). */
  readonly status?: number;
  /** Response headers. */
  readonly headers?: Record<string, string>;
  /** Content-Type header (convenience shortcut). */
  readonly contentType?: string;
  /** Response body as a string. */
  readonly body?: string;
}

/**
 * Options for route registration.
 */
export interface RouteOptions {
  /** Auto-unroute after N matched requests. */
  readonly times?: number;
}

/**
 * Route handler callback — Effect-ified version of Playwright's handler.
 *
 * Receives a `RouteHandle` (for continue/abort/fulfill/fallback)
 * and the `InterceptedRequest` (for inspecting the request).
 *
 * The handler MUST call exactly one of: route.continue(),
 * route.abort(), route.fulfill(), or route.fallback().
 */
export type RouteHandlerCallback = (
  route: RouteHandle,
  request: InterceptedRequest,
) => Effect.Effect<void, any, never>;

// ── Route Handle ───────────────────────────────────────────────────────────────

/**
 * Handle for an intercepted request.
 *
 * Mirrors Playwright's `Route` object. Provides methods to control
 * how the intercepted request is resolved. Exactly one method must
 * be called per interception.
 *
 * - continue() — let the request proceed (with optional overrides)
 * - abort() — block the request with an error
 * - fulfill() — respond with a synthetic response
 * - fallback() — skip this handler, try the next one
 */
export interface RouteHandle {
  /** The intercepted request information. */
  readonly request: InterceptedRequest;

  /**
   * Let the request continue, optionally modifying it.
   *
   * Maps to CDP `Fetch.continueRequest`.
   */
  continue(overrides?: ContinueOverrides): Effect.Effect<void, CdpError>;

  /**
   * Block the request with the given error code.
   *
   * Maps to CDP `Fetch.failRequest`.
   *
   * @param errorCode - One of: aborted, accessdenied, addressunreachable,
   *   blockedbyclient, blockedbyresponse, connectionaborted, connectionclosed,
   *   connectionfailed, connectionrefused, connectionreset, internetdisconnected,
   *   namenotresolved, timedout, failed
   */
  abort(errorCode?: string): Effect.Effect<void, CdpError>;

  /**
   * Respond with a synthetic response.
   *
   * Maps to CDP `Fetch.fulfillRequest`.
   */
  fulfill(response: FulfillResponse): Effect.Effect<void, CdpError>;

  /**
   * Skip this handler and try the next registered handler.
   * If no more handlers, the request continues normally.
   */
  fallback(overrides?: ContinueOverrides): Effect.Effect<void, CdpError>;
}

// ── Internal Types ─────────────────────────────────────────────────────────────

interface RegisteredRoute {
  url: RouteUrlMatch;
  handler: RouteHandlerCallback;
  times: number;
  handledCount: number;
}

interface RouteManager {
  route: (
    url: RouteUrlMatch,
    handler: RouteHandlerCallback,
    options?: RouteOptions,
  ) => Effect.Effect<void, CdpError>;
  unroute: (url: RouteUrlMatch, handler?: RouteHandlerCallback) => Effect.Effect<void, CdpError>;
  unrouteAll: () => Effect.Effect<void, CdpError>;
  /**
   * Ensure `Fetch.enable({ handleAuthRequests: true })` is active on the
   * page session. Called by `page.setHTTPCredentials` so that
   * `Fetch.authRequired` events start flowing even when no `route()`
   * handlers are registered.
   */
  enableFetchForAuth: () => Effect.Effect<void, CdpError>;
}

/**
 * Dispatch context for a single intercepted request.
 *
 * Tracks which handlers have been processed and which are remaining.
 * This is created per-request and allows handlers to be removed during dispatch.
 */
interface DispatchContext {
  /** Handlers that have yet to be processed (mutable, shifted during dispatch). */
  futureHandlers: RegisteredRoute[];
  /** Handler currently being executed (set when handler starts, cleared when done). */
  currentHandler: RegisteredRoute | undefined;
  /** Whether the route has been handled (continue/abort/fulfill called). */
  handled: boolean;
  /** Accumulated overrides from fallback() calls. */
  accumulatedOverrides: ContinueOverrides;
  /** Whether fallback() was called by the current handler. */
  fallbackCalled: boolean;
  /** Whether ANY handler was actually called (for distinguishing no-match vs no-resolve). */
  handlerCalled: boolean;
}

// ── Error Reason Mapping ───────────────────────────────────────────────────────

/**
 * Maps Playwright-style error codes to CDP `Network.ErrorReason` values.
 * Copied from Playwright's `crNetworkManager.ts`.
 */
const errorReasons: Record<string, string> = {
  aborted: "Aborted",
  accessdenied: "AccessDenied",
  addressunreachable: "AddressUnreachable",
  blockedbyclient: "BlockedByClient",
  blockedbyresponse: "BlockedByResponse",
  connectionaborted: "ConnectionAborted",
  connectionclosed: "ConnectionClosed",
  connectionfailed: "ConnectionFailed",
  connectionrefused: "ConnectionRefused",
  connectionreset: "ConnectionReset",
  internetdisconnected: "InternetDisconnected",
  namenotresolved: "NameNotResolved",
  timedout: "TimedOut",
  failed: "Failed",
};

// ── Forbidden Headers ───────────────────────────────────────────────────────────

/**
 * Forbidden request headers according to the Fetch spec.
 * These headers cannot be set or modified programmatically.
 * @see https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header
 */
const FORBIDDEN_HEADER_NAMES = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
]);

/**
 * Checks if a header name is forbidden (cannot be overridden programmatically).
 */
const isForbiddenHeader = (name: string): boolean => {
  const lowerName = name.toLowerCase();
  if (FORBIDDEN_HEADER_NAMES.has(lowerName)) return true;
  if (lowerName.startsWith("proxy-")) return true;
  if (lowerName.startsWith("sec-")) return true;
  return false;
};

/**
 * Decide whether configured HTTP credentials should be supplied for a
 * given request URL. Mirrors Playwright's `_shouldProvideCredentials` in
 * `crNetworkManager.ts`: when an `origin` filter is configured, only
 * requests whose origin matches (case-insensitive on the host) get
 * credentials; other requests fall through to the browser's default
 * auth prompt. When no `origin` is set, credentials apply to every URL.
 */
const shouldProvideCredentials = (
  requestUrl: string,
  credentials: {
    readonly username: string;
    readonly password: string;
    readonly origin?: string;
  },
): boolean => {
  if (!credentials.origin) return true;
  try {
    const requestOrigin = new URL(requestUrl).origin.toLowerCase();
    return requestOrigin === credentials.origin.toLowerCase();
  } catch {
    // Unparseable URL — fall back to the browser prompt rather than
    // risking credential leakage on a malformed origin.
    return false;
  }
};

/**
 * Merges header arrays, with later arrays taking precedence.
 */
const mergeHeaderArrays = (
  headerArrays: Array<Array<{ name: string; value: string }>>,
): Array<{ name: string; value: string }> => {
  const result: Array<{ name: string; value: string }> = [];
  const seen = new Set<string>();

  // Process arrays in reverse order so earlier ones take precedence for duplicate names
  for (let i = headerArrays.length - 1; i >= 0; i--) {
    for (const header of headerArrays[i] ?? []) {
      const lowerName = header.name.toLowerCase();
      if (!seen.has(lowerName)) {
        seen.add(lowerName);
        result.unshift(header);
      }
    }
  }

  return result;
};

/**
 * Applies header overrides while preserving forbidden headers from the original.
 * Forbidden headers (like cookie, host, origin) cannot be overridden programmatically.
 *
 * Behavior matches Playwright:
 * - Non-forbidden headers from overrides completely replace original non-forbidden headers
 * - Forbidden headers from original are always preserved (cannot be removed or changed)
 */
const applyHeadersOverrides = (
  originalHeaders: Record<string, string>,
  overrideHeaders: Record<string, string> | undefined,
): Array<{ name: string; value: string }> => {
  if (!overrideHeaders) {
    return Object.entries(originalHeaders).map(([name, value]) => ({ name, value }));
  }

  // Keep forbidden headers from original (they cannot be overridden)
  const forbiddenHeaders = Object.entries(originalHeaders)
    .filter(([name]) => isForbiddenHeader(name))
    .map(([name, value]) => ({ name, value }));

  // Only allow non-forbidden headers from overrides
  // These completely replace original non-forbidden headers
  const allowedOverrides = Object.entries(overrideHeaders)
    .filter(([name]) => !isForbiddenHeader(name))
    .map(([name, value]) => ({ name, value }));

  // Merge: overrides first, then forbidden headers from original
  // Forbidden headers from original take precedence for duplicate names
  return mergeHeaderArrays([allowedOverrides, forbiddenHeaders]);
};

// ── URL Matching ────────────────────────────────────────────────────────────────
//
// URL match helpers (globToRegexPattern, urlMatches, urlMatchesEqual) live
// in `./UrlMatch.ts` so they can be shared with `RouteWebSocket.ts`.

// ── Route Handle Factory ───────────────────────────────────────────────────────

/**
 * Typed assertion for CDP Fetch.requestPaused event params.
 * Avoids `as unknown as` by asserting through a single cast.
 */
const toPausedEvent = (params: unknown): Protocol.Fetch.RequestPausedEvent =>
  (params ?? {}) as Protocol.Fetch.RequestPausedEvent;

/**
 * Creates a RouteHandle for an intercepted request.
 *
 * Uses a factory function with closure-captured state instead of a class,
 * avoiding `this` aliasing issues in generator functions.
 *
 * Tracks two flags:
 * - `resolved` — prevents double-calling (continue/abort/fulfill/fallback)
 * - `handled` — whether the request was actually intercepted (true for
 *   continue/abort/fulfill, false for fallback)
 */
const makeRouteHandle = (
  requestId: string,
  request: InterceptedRequest,
  conn: CdpConnection["Service"],
  sid: string,
  dispatchContext: DispatchContext,
  onHandled: (handled: boolean) => Effect.Effect<void>,
): RouteHandle & { readonly isHandled: boolean } => {
  let resolved = false;

  const checkNotResolved = (): Effect.Effect<void, CdpError> => {
    if (resolved) {
      return Effect.fail(
        new CdpErrorClass({
          module: "CdpPage",
          method: "Route",
          reason: new EvaluationError({ description: "Route is already handled!" }),
        }),
      );
    }
    resolved = true;
    return Effect.void;
  };

  const tolerateCancelled = <E>(effect: Effect.Effect<void, E, never>) =>
    effect.pipe(Effect.ignoreCause);

  const mapCdpError =
    (method: string) =>
    <A, R>(effect: Effect.Effect<A, unknown, R>): Effect.Effect<A, CdpError, R> =>
      effect.pipe(
        Effect.mapError(
          (cause) =>
            new CdpErrorClass({
              module: "CdpPage",
              method: `route.${method}`,
              reason: new CommandError({ method: `Fetch.${method}`, description: String(cause) }),
            }),
        ),
      );

  return {
    request,

    get isHandled() {
      return dispatchContext.handled;
    },

    continue(overrides?: ContinueOverrides): Effect.Effect<void, CdpError> {
      return Effect.gen(function* () {
        yield* checkNotResolved();
        dispatchContext.handled = true;

        const params: Protocol.Fetch.ContinueRequestRequest = {
          requestId,
        };
        if (overrides?.url) params.url = overrides.url;
        if (overrides?.method) params.method = overrides.method;
        if (overrides?.headers) {
          // Apply header overrides while filtering out forbidden headers (cookie, host, origin, etc.)
          // Forbidden headers cannot be overridden programmatically per browser spec.
          const mergedHeaders = applyHeadersOverrides(request.headers, overrides.headers);
          params.headers = mergedHeaders;
        }
        if (overrides?.postData) {
          params.postData = btoa(overrides.postData);
        }

        yield* conn.cdp.Fetch.continueRequest(params, sid).pipe(
          tolerateCancelled,
          mapCdpError("continue"),
        );
        yield* onHandled(true);
      });
    },

    abort(errorCode: string = "failed"): Effect.Effect<void, CdpError> {
      return Effect.gen(function* () {
        yield* checkNotResolved();
        dispatchContext.handled = true;

        const errorReason = errorReasons[errorCode];
        if (!errorReason) {
          return yield* new CdpErrorClass({
            module: "CdpPage",
            method: "route.abort",
            reason: new CommandError({
              method: "Fetch.failRequest",
              description: `Unknown error code: ${errorCode}`,
            }),
          });
        }

        yield* conn.cdp.Fetch.failRequest(
          { requestId, errorReason: errorReason as Protocol.Network.ErrorReason },
          sid,
        ).pipe(tolerateCancelled, mapCdpError("abort"));
        yield* onHandled(true);
      });
    },

    fulfill(response: FulfillResponse): Effect.Effect<void, CdpError> {
      return Effect.gen(function* () {
        yield* checkNotResolved();
        dispatchContext.handled = true;

        const status = response.status ?? 200;
        const body = response.body ?? "";
        const bodyBase64 = btoa(body);

        // Build headers array for CDP Fetch.fulfillRequest
        const headers: Array<{ name: string; value: string }> = [];
        if (response.headers) {
          for (const [name, value] of Object.entries(response.headers)) {
            headers.push({ name: name.toLowerCase(), value: String(value) });
          }
        }
        if (response.contentType) {
          const idx = headers.findIndex((h) => h.name === "content-type");
          if (idx !== -1) headers.splice(idx, 1);
          headers.push({ name: "content-type", value: response.contentType });
        }
        if (body !== "" && !headers.some((h) => h.name === "content-length")) {
          headers.push({ name: "content-length", value: String(body.length) });
        }
        if (!headers.some((h) => h.name === "access-control-allow-origin")) {
          headers.push({ name: "access-control-allow-origin", value: "*" });
        }

        yield* conn.cdp.Fetch.fulfillRequest(
          {
            requestId,
            responseCode: status,
            responsePhrase: statusText(status),
            responseHeaders: headers,
            body: bodyBase64,
          },
          sid,
        ).pipe(tolerateCancelled, mapCdpError("fulfill"));
        yield* onHandled(true);
      });
    },

    fallback(overrides?: ContinueOverrides): Effect.Effect<void, CdpError> {
      return Effect.gen(function* () {
        yield* checkNotResolved();
        // Mark that fallback was explicitly called
        dispatchContext.fallbackCalled = true;
        // handled stays false — dispatch will try next handler
        // Accumulate overrides for next handler
        if (overrides) {
          dispatchContext.accumulatedOverrides = {
            url: overrides.url ?? dispatchContext.accumulatedOverrides.url,
            method: overrides.method ?? dispatchContext.accumulatedOverrides.method,
            headers: overrides.headers ?? dispatchContext.accumulatedOverrides.headers,
            postData: overrides.postData ?? dispatchContext.accumulatedOverrides.postData,
          };
        }
        dispatchContext.currentHandler = undefined;
        yield* onHandled(false);
      });
    },
  };
};

/**
 * Returns standard HTTP status text for common status codes.
 */
function statusText(code: number): string {
  const map: Record<number, string> = {
    200: "OK",
    201: "Created",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    304: "Not Modified",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    500: "Internal Server Error",
  };
  return map[code] ?? "OK";
}

// ── Route Manager Factory ───────────────────────────────────────────────────────

/**
 * Extracts intercepted request info from a `Fetch.requestPaused` event.
 */
/**
 * Extracts intercepted request info from a `Fetch.requestPaused` event.
 *
 * @param params - CDP Fetch.requestPaused event params
 * @param responseTracker - Network response tracker for getting response data
 * @param connection - CDP connection for creating Response objects
 * @param state - Page state for session ID
 */
const extractPausedRequest = (
  params: Protocol.Fetch.RequestPausedEvent,
  responseTracker: NetworkResponseTracker,
  connection: CdpConnection["Service"],
  state: PageState,
): InterceptedRequest => {
  const headers = params.request.headers;
  const networkId = params.networkId;
  const requestUrl = params.request.url;

  // Helper to create a synthetic InterceptedRequest for a synthetic ID in the redirect chain
  // Uses Playwright-style synthetic IDs for robust redirect chain navigation
  const makeSyntheticRequest = (
    syntheticId: string,
  ): Effect.Effect<InterceptedRequest, never, never> =>
    Effect.gen(function* () {
      const url = (yield* responseTracker.getUrlBySyntheticId(syntheticId)) ?? "";
      return {
        url,
        method: params.request.method,
        headers,
        postData: params.request.postData ?? null,
        resourceType: (params.resourceType ?? "Other").toLowerCase(),
        isNavigationRequest: params.resourceType === "Document",
        allHeaders: () => Effect.succeed(headers),
        response: () => Effect.succeed(null),
        failure: () => Effect.succeed(null),
        redirectedFrom: () =>
          Effect.gen(function* () {
            const previousSyntheticId = yield* responseTracker.getPreviousSyntheticId(syntheticId);
            if (!previousSyntheticId) return null;
            return yield* makeSyntheticRequest(previousSyntheticId);
          }),
        redirectedTo: () =>
          Effect.gen(function* () {
            const nextSyntheticId = yield* responseTracker.getNextSyntheticId(syntheticId);
            if (!nextSyntheticId) return null;
            return yield* makeSyntheticRequest(nextSyntheticId);
          }),
      };
    });

  return {
    url: requestUrl,
    method: params.request.method,
    headers,
    postData: params.request.postData ?? null,
    resourceType: (params.resourceType ?? "Other").toLowerCase(),
    isNavigationRequest:
      params.request.url === params.networkId || params.resourceType === "Document",
    allHeaders: () => Effect.succeed(headers),
    response: () =>
      Effect.gen(function* () {
        // networkId is the requestId in Network domain
        // If there's no networkId, we can't get a response
        if (!networkId) {
          return null;
        }
        const responseData = yield* responseTracker.getResponse(networkId);
        if (!responseData) {
          return null;
        }
        // Create Response object from the response data
        return makeResponse(connection, state, responseTracker, responseData);
      }),
    failure: () =>
      Effect.gen(function* () {
        // networkId is the requestId in Network domain
        // If there's no networkId, we can't get failure info
        if (!networkId) {
          return null;
        }
        const failureData = yield* responseTracker.getFailure(networkId);
        if (!failureData) {
          return null;
        }
        return { errorText: failureData.errorText };
      }),
    redirectedFrom: () =>
      Effect.gen(function* () {
        // Look up the synthetic ID for this request's URL
        const syntheticId = yield* responseTracker.getSyntheticIdByUrl(requestUrl);
        if (!syntheticId) {
          return null;
        }
        const previousSyntheticId = yield* responseTracker.getPreviousSyntheticId(syntheticId);
        if (!previousSyntheticId) {
          return null;
        }
        return yield* makeSyntheticRequest(previousSyntheticId);
      }),
    redirectedTo: () =>
      Effect.gen(function* () {
        // Look up the synthetic ID for this request's URL
        const syntheticId = yield* responseTracker.getSyntheticIdByUrl(requestUrl);
        if (!syntheticId) {
          return null;
        }
        const nextSyntheticId = yield* responseTracker.getNextSyntheticId(syntheticId);
        if (!nextSyntheticId) {
          return null;
        }
        return yield* makeSyntheticRequest(nextSyntheticId);
      }),
  };
};

/**
 * Applies overrides to an InterceptedRequest, creating a new request object.
 */
const applyOverridesToRequest = (
  request: InterceptedRequest,
  overrides: ContinueOverrides | undefined,
): InterceptedRequest => {
  if (!overrides) return request;
  return {
    ...request,
    url: overrides.url ?? request.url,
    method: overrides.method ?? request.method,
    headers: overrides.headers ?? request.headers,
    postData: overrides.postData ?? request.postData,
  };
};

/**
 * Creates a RouteManager that handles request interception for a page.
 *
 * The manager:
 * 1. Maintains a list of registered route handlers (last-registered-first)
 * 2. Enables `Fetch.enable` when the first route is registered
 * 3. Listens for `Fetch.requestPaused` events and dispatches to matching handlers
 * 4. Disables `Fetch` when all routes are removed
 *
 * Dispatch follows Playwright's pattern:
 * - Create a dispatch context per intercepted request
 * - `_futureHandlers` is a mutable array shifted during dispatch
 * - `_currentHandler` tracks the handler being executed
 * - When handler calls `fallback()`, next handler is shifted
 * - When `unroute()` removes a handler, it's removed from `_futureHandlers`
 *
 * @param connection - CDP connection service
 * @param state - Mutable page state
 */
export const makeRouteManager = (
  connection: CdpConnection["Service"],
  state: PageState,
  responseTracker: NetworkResponseTracker,
): Effect.Effect<RouteManager, never, Scope.Scope> =>
  Effect.gen(function* () {
    const routes = yield* Ref.make<Array<RegisteredRoute>>([]);
    const fetchEnabled = yield* Ref.make(false);
    // Routes currently in-flight (being dispatched)
    const routesInFlight = yield* Ref.make<Set<DispatchContext>>(new Set());
    // Request IDs we've already provided credentials for. Tracked per-page so
    // a retry after CancelAuth gets `Default` and shows the browser prompt.
    // Adapted from Playwright's `_attemptedAuthentications` set in
    // repos/cloudflare-playwright/.../crNetworkManager.ts:218-235.
    const attemptedAuthentications = yield* Ref.make<Set<string>>(new Set());

    /**
     * Enables `Fetch` on the page session. Once enabled, both `requestPaused`
     * (for route handlers) and `authRequired` (for credential responses) fire.
     *
     * Fetch stays enabled for the page lifetime — matching Playwright's pattern
     * (per-page session enable). On session end the domain goes away implicitly.
     */
    const ensureFetchEnabled = Effect.gen(function* () {
      const enabled = yield* Ref.get(fetchEnabled);
      if (!enabled) {
        const sessionId = yield* ensureSession(state);
        yield* connection.cdp.Fetch.enable(
          { handleAuthRequests: true, patterns: [{ urlPattern: "*" }] },
          sessionId,
        ).pipe(
          Effect.mapError(
            (cause) =>
              new CdpErrorClass({
                module: "CdpPage",
                method: "route",
                reason: new CommandError({ method: "Fetch.enable", description: String(cause) }),
              }),
          ),
        );
        yield* Ref.set(fetchEnabled, true);
      }
    });

    // ── Auth-challenge response ────────────────────────────────────────────
    //
    // Mirrors the Playwright Chromium NetworkManager's `_onAuthRequired` handler:
    //
    //   - if we've already responded once for this requestId → CancelAuth
    //     (cancel the retry, let the browser surface the failure)
    //   - if credentials are configured AND origin matches (or no origin filter)
    //     → ProvideCredentials with username/password
    //   - otherwise → Default (let the browser show its own auth prompt)
    //
    // The credentials are read fresh from `state.credentials` on every event,
    // so `page.setHTTPCredentials(undefined)` is honored immediately.
    const handleAuthRequired = (
      requestId: string,
      requestUrl: string,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const sessionId = yield* Ref.get(state.sessionId);
        if (!sessionId) return;
        const credentials = yield* Ref.get(state.credentials);

        // Track this requestId so retries cancel.
        const alreadyAttempted = yield* Ref.modify(attemptedAuthentications, (set) => {
          const had = set.has(requestId);
          return [had, new Set(set).add(requestId)] as const;
        });

        let response: "Default" | "CancelAuth" | "ProvideCredentials";
        let username: string | undefined;
        let password: string | undefined;

        if (alreadyAttempted) {
          // Already responded once for this requestId — cancel the retry.
          response = "CancelAuth";
        } else if (credentials && shouldProvideCredentials(requestUrl, credentials)) {
          response = "ProvideCredentials";
          username = credentials.username;
          password = credentials.password;
        } else {
          // No credentials, no origin match, or no origin filter → browser prompt.
          response = "Default";
        }

        yield* connection.cdp.Fetch.continueWithAuth(
          {
            requestId,
            authChallengeResponse: {
              response,
              ...(username !== undefined && { username }),
              ...(password !== undefined && { password }),
            },
          },
          sessionId,
        ).pipe(Effect.ignore);
      });

    const disableFetch = Effect.gen(function* () {
      const enabled = yield* Ref.get(fetchEnabled);
      if (enabled) {
        const sessionId = yield* ensureSession(state);
        yield* connection.cdp.Fetch.disable({}, sessionId).pipe(Effect.ignore);
        yield* Ref.set(fetchEnabled, false);
      }
    });

    /**
     * Disable `Fetch` only if no routes AND no credentials are configured.
     *
     * Once `setHTTPCredentials` has armed Fetch for auth challenges,
     * `unrouteAll` shouldn't tear the domain down (otherwise subsequent
     * `Fetch.authRequired` events would never fire). Conversely, if both
     * routes and credentials have been cleared, Fetch is safe to disable.
     */
    const maybeDisableFetch = Effect.gen(function* () {
      const remaining = yield* Ref.get(routes);
      const credentials = yield* Ref.get(state.credentials);
      yield* Arr.match(remaining, {
        onEmpty: () =>
          Effect.gen(function* () {
            // No routes — only disable if credentials are also unset.
            if (credentials === undefined) yield* disableFetch;
          }),
        onNonEmpty: () => Effect.void,
      });
    });

    /**
     * Remove a handler from all in-flight dispatch contexts.
     * Called when `unroute()` removes a handler while dispatch is ongoing.
     */
    const removeHandlerFromInFlight = (
      handlerToRemove: RegisteredRoute,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const currentInFlight = yield* Ref.get(routesInFlight);
        for (const ctx of currentInFlight) {
          // Remove from future handlers
          ctx.futureHandlers = ctx.futureHandlers.filter((h) => h !== handlerToRemove);
          // If it's the current handler, clear it (dispatch will continue on fallback)
          if (ctx.currentHandler === handlerToRemove) {
            ctx.currentHandler = undefined;
          }
        }
      });

    /**
     * Decide whether a handler should be skipped during dispatch.
     *
     * Two reasons to skip:
     *  1. The handler's URL match doesn't match the (override-modified) request URL.
     *  2. The handler has been called the configured number of `times` and is expired.
     */
    const shouldSkipHandler = (
      requestForHandler: InterceptedRequest,
      registered: RegisteredRoute,
    ): boolean =>
      !urlMatches(requestForHandler.url, registered.url) ||
      (registered.times > 0 && registered.handledCount >= registered.times);

    /**
     * Remove an expired handler from the routes registry. The handler is expired
     * when `times` is set and `handledCount` has reached it. No-op for unlimited
     * (`times === 0`) handlers or handlers that still have calls remaining.
     */
    const removeHandlerIfExpired = (
      registered: RegisteredRoute,
    ): Effect.Effect<void, never, never> =>
      registered.times > 0 && registered.handledCount >= registered.times
        ? Ref.update(routes, (rs) => rs.filter((r) => r !== registered))
        : Effect.void;

    /**
     * Build a `Fetch.continueRequest` params object that applies all accumulated
     * overrides (url, method, headers, postData) on top of the original request.
     *
     * Headers are merged (overrides win) and `postData` is base64-encoded for the
     * CDP transport.
     */
    const buildContinueRequestWithOverrides = (
      requestId: string,
      originalRequest: InterceptedRequest,
      overrides: ContinueOverrides,
    ): Protocol.Fetch.ContinueRequestRequest => {
      const params: Protocol.Fetch.ContinueRequestRequest = { requestId };
      if (overrides.url) params.url = overrides.url;
      if (overrides.method) params.method = overrides.method;
      if (overrides.headers) {
        params.headers = applyHeadersOverrides(originalRequest.headers, overrides.headers);
      }
      if (overrides.postData) {
        params.postData = btoa(overrides.postData);
      }
      return params;
    };

    /**
     * Decide what to do once the handler dispatch loop has exited.
     *
     * Three terminal cases:
     *  - `ctx.handled`: a handler called `continue/abort/fulfill` — request is
     *    already resolved, nothing to do.
     *  - `!ctx.handlerCalled`: no handlers matched — continue the request
     *    normally.
     *  - `ctx.fallbackCalled`: every matched handler called `fallback()` —
     *    continue with the accumulated overrides merged in.
     *  - Otherwise (handler called but didn't resolve): leave the request paused
     *    for the route handle to resume externally.
     */
    const resolveAfterDispatch = (
      ctx: DispatchContext,
      requestId: string,
      interceptedRequest: InterceptedRequest,
      sessionId: string,
    ): Effect.Effect<void, never, never> => {
      if (ctx.handled) return Effect.void;
      if (!ctx.handlerCalled) {
        return connection.cdp.Fetch.continueRequest({ requestId }, sessionId).pipe(Effect.ignore);
      }
      if (ctx.fallbackCalled) {
        return connection.cdp.Fetch.continueRequest(
          buildContinueRequestWithOverrides(
            requestId,
            interceptedRequest,
            ctx.accumulatedOverrides,
          ),
          sessionId,
        ).pipe(Effect.ignore);
      }
      // handler called but didn't resolve - request stays paused
      return Effect.void;
    };

    /**
     * Remove a dispatch context from the in-flight set once the request has
     * terminated (handled, continued, or paused-externally).
     */
    const removeFromInFlight = (ctx: DispatchContext): Effect.Effect<void, never, never> =>
      Ref.update(routesInFlight, (set) => {
        const newSet = new Set(set);
        newSet.delete(ctx);
        return newSet;
      });

    /**
     * Dispatch route handlers for an intercepted request.
     *
     * Follows Playwright's pattern:
     * - Shift handlers from `_futureHandlers` one at a time
     * - Set `_currentHandler` when calling a handler
     * If handler calls `fallback()`, `_currentHandler` is cleared and loop continues
     * - If handler calls `continue/abort/fulfill`, `_handled` is set and loop stops
     *
     * The dispatch loop runs synchronously - each handler is called and we wait
     * for it to resolve (either handled or fallback).
     */
    const dispatchRoute = (
      ctx: DispatchContext,
      requestId: string,
      interceptedRequest: InterceptedRequest,
      sessionId: string,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        // Continue dispatching until handled or no more handlers
        // eslint-disable-next-line effect/prefer-arr-match -- while loop condition, not branching
        while (!ctx.handled && Arr.isReadonlyArrayNonEmpty(ctx.futureHandlers)) {
          const registered = ctx.futureHandlers.shift();
          if (!registered) break;

          // Apply accumulated overrides to create the request for this handler
          const requestForHandler = applyOverridesToRequest(
            interceptedRequest,
            ctx.accumulatedOverrides,
          );

          // Skip handlers that don't match the (override-modified) URL or are expired
          if (shouldSkipHandler(requestForHandler, registered)) continue;

          // Set current handler (so unroute can detect if it's being removed)
          ctx.currentHandler = registered;
          // Reset fallbackCalled before calling handler
          ctx.fallbackCalled = false;
          // Mark that a handler is being called (for post-loop logic)
          ctx.handlerCalled = true;

          // Increment handled count
          registered.handledCount++;

          // Remove from routes Ref if expired
          yield* removeHandlerIfExpired(registered);

          // Create route handle
          const routeHandle = makeRouteHandle(
            requestId,
            requestForHandler,
            connection,
            sessionId,
            ctx,
            (handled) =>
              Effect.gen(function* () {
                // If handled and no more routes, disable fetch (but only if
                // no credentials are armed — see maybeDisableFetch).
                if (handled) {
                  yield* maybeDisableFetch.pipe(Effect.ignore);
                }
              }),
          );

          // Call handler (swallow errors)
          yield* Effect.ignoreCause(registered.handler(routeHandle, requestForHandler));

          // Clear current handler after handler completes
          ctx.currentHandler = undefined;

          // If handled, stop dispatch
          if (ctx.handled) {
            break;
          }

          // If handler didn't call any resolution method (continue/abort/fulfill/fallback),
          // the request stays paused - break out of the loop.
          // The route handle can be used externally to resume later.
          if (!ctx.fallbackCalled) {
            // Request stays paused - handler intentionally didn't resolve
            break;
          }

          // If fallback was called, loop continues to next handler
          // The accumulated overrides are updated by the fallback() method
        }

        // Post-loop: dispatch the correct terminal action based on ctx state.
        yield* resolveAfterDispatch(ctx, requestId, interceptedRequest, sessionId);

        // Remove from in-flight
        yield* removeFromInFlight(ctx);
      });

    // Fork a background fiber that listens for Fetch.requestPaused events
    // and dispatches them to matching route handlers.
    const listener = connection.events.pipe(
      Stream.filter((msg) => msg.method === "Fetch.requestPaused"),
      Stream.tap((msg) =>
        Effect.gen(function* () {
          const params = toPausedEvent(msg.params);
          const sessionId = yield* Ref.get(state.sessionId);
          if (!sessionId) {
            // No session — continue the request
            yield* connection.cdp.Fetch.continueRequest(
              { requestId: params.requestId },
              params.requestId, // fallback
            ).pipe(Effect.ignore);
            return;
          }

          // Auto-fulfill CORS preflight OPTIONS requests (Playwright pattern)
          // CORS preflight requests are generated by the network stack,
          // not by page JavaScript. We accept all of them.
          const initiator = (msg.params as Record<string, unknown> | undefined)?.initiator as
            | Record<string, unknown>
            | undefined;
          if (params.request.method === "OPTIONS" && initiator?.type === "preflight") {
            const requestHeaders = params.request.headers;
            const responseHeaders: Array<{ name: string; value: string }> = [
              { name: "access-control-allow-origin", value: requestHeaders["origin"] ?? "*" },
              {
                name: "access-control-allow-methods",
                value:
                  requestHeaders["access-control-request-method"] ??
                  "GET, POST, PUT, DELETE, OPTIONS",
              },
              {
                name: "access-control-allow-headers",
                value: requestHeaders["access-control-request-headers"] ?? "*",
              },
              { name: "access-control-max-age", value: "86400" },
            ];
            yield* connection.cdp.Fetch.fulfillRequest(
              {
                requestId: params.requestId,
                responseCode: 204,
                responsePhrase: "No Content",
                responseHeaders: responseHeaders,
                body: "",
              },
              sessionId,
            ).pipe(Effect.ignore);
            return;
          }

          // Auto-continue redirect targets (Playwright pattern)
          // Playwright only intercepts the initial request in a redirect chain.
          // CDP fires Fetch.requestPaused for each request in the chain.
          // We detect redirect targets via Network.requestWillBeSent's redirectResponse field
          // (tracked in NetworkResponseTracker) and auto-continue them.
          if (params.networkId) {
            const isRedirect = yield* responseTracker.isRedirectTarget(params.networkId);
            if (isRedirect) {
              yield* connection.cdp.Fetch.continueRequest(
                { requestId: params.requestId },
                sessionId,
              ).pipe(Effect.ignore);
              return;
            }
          }

          const interceptedRequest = extractPausedRequest(
            params,
            responseTracker,
            connection,
            state,
          );

          // Skip favicon requests - they do not need route handling
          // Playwright aborts favicon requests, we just continue them
          // Note: favicon resourceType varies, so we check URL directly
          const requestUrl = params.request.url.toLowerCase();
          const isFavicon = requestUrl.includes("favicon") || requestUrl.endsWith(".ico");
          if (isFavicon) {
            yield* connection.cdp.Fetch.continueRequest(
              { requestId: params.requestId },
              sessionId,
            ).pipe(Effect.ignore);
            return;
          }

          const currentRoutes = yield* Ref.get(routes);

          // Create dispatch context for this request
          const ctx: DispatchContext = {
            futureHandlers: [...currentRoutes],
            currentHandler: undefined,
            handled: false,
            accumulatedOverrides: {},
            fallbackCalled: false,
            handlerCalled: false,
          };

          // Add to in-flight
          yield* Ref.update(routesInFlight, (set) => new Set(set).add(ctx));

          // Dispatch
          yield* dispatchRoute(ctx, params.requestId, interceptedRequest, sessionId);
        }),
      ),
      Stream.runDrain,
      Effect.catchCause((cause) => Effect.logDebug("[cdp] route interception stream ended", cause)),
    );

    // ── Auth-challenge listener ──────────────────────────────────────────────
    //
    // Forked as its own daemon so the auth-response logic stays independent
    // of (and outlives any race with) the requestPaused listener. The two
    // listeners share the page session's `Fetch.enable` enablement but
    // handle disjoint CDP events.
    const authListener = connection.events.pipe(
      Stream.filter((msg) => msg.method === "Fetch.authRequired"),
      Stream.tap((msg) => {
        const params = msg.params as { requestId?: string; request?: { url?: string } } | undefined;
        const requestId = params?.requestId;
        const requestUrl = params?.request?.url;
        if (!requestId || !requestUrl) return Effect.void;
        return handleAuthRequired(requestId, requestUrl);
      }),
      Stream.runDrain,
      Effect.catchCause((cause) => Effect.logDebug("[cdp] auth challenge stream ended", cause)),
    );

    // Fork as a scoped daemon — cleaned up when page scope closes
    yield* Effect.forkScoped(listener);
    yield* Effect.forkScoped(authListener);

    return {
      route: (url: RouteUrlMatch, handler: RouteHandlerCallback, options?: RouteOptions) =>
        Effect.gen(function* () {
          yield* ensureFetchEnabled;
          const entry: RegisteredRoute = {
            url,
            handler,
            times: options?.times ?? 0, // 0 means unlimited
            handledCount: 0,
          };
          // Prepend — last registered is checked first (Playwright convention)
          yield* Ref.update(routes, (rs) => [entry, ...rs]);
        }),

      unroute: (url: RouteUrlMatch, handler?: RouteHandlerCallback) =>
        Effect.gen(function* () {
          // Find matching handlers to remove
          const currentRoutes = yield* Ref.get(routes);
          const toRemove = currentRoutes.filter(
            (r) => urlMatchesEqual(r.url, url) && (!handler || r.handler === handler),
          );

          // Remove from routes Ref
          yield* Ref.update(routes, (rs) =>
            rs.filter((r) => !(urlMatchesEqual(r.url, url) && (!handler || r.handler === handler))),
          );

          // Remove from all in-flight dispatch contexts
          yield* Effect.forEach(toRemove, removeHandlerFromInFlight, { concurrency: 1 });

          // Disable fetch if no routes remaining (and no credentials configured)
          yield* maybeDisableFetch;
        }),

      unrouteAll: () =>
        Effect.gen(function* () {
          // Get all current routes
          const currentRoutes = yield* Ref.get(routes);

          yield* Arr.match(currentRoutes, {
            onEmpty: () => Effect.void,
            onNonEmpty: (routesToRemove) =>
              Effect.gen(function* () {
                // Remove all from in-flight dispatch contexts
                yield* Effect.forEach(routesToRemove, removeHandlerFromInFlight, {
                  concurrency: 1,
                });

                // Clear all routes
                yield* Ref.set(routes, []);

                // Disable fetch (only if no credentials are armed)
                yield* maybeDisableFetch;
              }),
          });
        }),

      enableFetchForAuth: () => ensureFetchEnabled,
    } satisfies RouteManager;
  });
