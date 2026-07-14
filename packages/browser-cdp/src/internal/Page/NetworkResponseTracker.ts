/**
 * Network response tracking for navigation and request correlation.
 *
 * Listens for CDP Network domain events to correlate:
 * - `Network.requestWillBeSent` (captures loaderId → requestId mapping)
 * - `Network.responseReceived` (captures response data by requestId)
 * - `Network.loadingFailed` (captures request failure data)
 *
 * This enables `goto()` and `waitForNavigation()` to return Response objects
 * by correlating the `loaderId` from `Page.navigate` with the response data.
 *
 * Also tracks request failures for failure() method on requests.
 *
 */

import type { Protocol } from "devtools-protocol";
import type { Scope } from "effect";

import type { CdpConnection } from "../CdpConnection.js";

import { Deferred, Effect, Ref, Stream } from "effect";

import { extractResponseData, type ResponseData } from "./Response.js";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Information about a failed request.
 */
export interface RequestFailure {
  /** The request identifier (Network domain's requestId). */
  readonly requestId: string;
  /** The URL that failed. */
  readonly url: string;
  /** Human-readable error text (e.g., "net::ERR_BLOCKED_BY_CLIENT"). */
  readonly errorText: string;
  /** Resource type (e.g., "Stylesheet", "Image", "Document"). */
  readonly resourceType: string;
  /** True if loading was canceled. */
  readonly canceled: boolean;
}

/**
 * Tracks network requests and responses for a page.
 *
 * Used internally by `goto()` and `waitForNavigation()` to return Response
 * objects. The tracker correlates CDP events by loaderId (for navigation)
 * and requestId (for response lookup).
 *
 * Also tracks request failures for the failure() method on requests.
 *
 * Uses Playwright-style synthetic request IDs for redirect chain tracking.
 * CDP reuses the same requestId for the entire redirect chain, which makes
 * it impossible to track individual requests in the chain. We generate
 * unique synthetic IDs for each requestWillBeSent event and link them
 * to form the redirect chain.
 */
export interface NetworkResponseTracker {
  /**
   * Wait for the response to a navigation request identified by loaderId.
   *
   * When `Page.navigate` returns a loaderId, this method waits for the
   * corresponding `Network.responseReceived` event for the main document.
   *
   * @param loaderId - The loaderId from `Page.navigate` result
   * @param url - The expected URL (for timeout error messages)
   * @param timeout - Maximum wait time
   * @returns The response data for the navigation, or undefined if no response
   *          (e.g., navigation to about:blank or same-document navigation)
   */
  readonly waitForNavigationResponse: (
    loaderId: string,
    url: string,
  ) => Effect.Effect<ResponseData | undefined>;

  /**
   * Get the response data for a request by requestId.
   *
   * Returns undefined if no response has been received yet for this request.
   * Useful for `waitForResponse()` implementation.
   *
   * @param requestId - The CDP request identifier
   */
  readonly getResponse: (requestId: string) => Effect.Effect<ResponseData | undefined>;

  /**
   * Get the failure data for a request by requestId.
   *
   * Returns undefined if the request hasn't failed.
   *
   * @param requestId - The CDP request identifier (Network domain)
   */
  readonly getFailure: (requestId: string) => Effect.Effect<RequestFailure | undefined>;

  /**
   * Get the previous URL in the redirect chain for a request.
   *
   * When a request is the target of a redirect (3xx response), this returns
   * the URL that redirected to this request. Returns undefined if this is not
   * a redirect target.
   *
   * @param requestId - The CDP request identifier (Network domain)
   * @deprecated Use getSyntheticRequest instead for robust redirect chain handling
   */
  readonly getRedirectedFromUrl: (requestId: string) => Effect.Effect<string | undefined>;

  /**
   * Get the previous URL in the redirect chain by URL lookup.
   *
   * When a URL is the target of a redirect (3xx response), this returns
   * the URL that redirected to this URL. Returns undefined if this URL is
   * not a redirect target.
   *
   * @param url - The URL to look up
   * @deprecated Use getSyntheticRequest instead for robust redirect chain handling
   */
  readonly getRedirectedFromUrlByUrl: (url: string) => Effect.Effect<string | undefined>;

  /**
   * Get the next URL in the redirect chain for a request.
   *
   * When a request results in a redirect (3xx response), this returns
   * the URL that this request redirects to. Returns undefined if this request
   * doesn't redirect.
   *
   * @param url - The URL to look up
   * @deprecated Use getSyntheticRequest instead for robust redirect chain handling
   */
  readonly getRedirectedToUrl: (url: string) => Effect.Effect<string | undefined>;

  /**
   * Check if a request is a redirect target.
   *
   * When a request is the target of a redirect (i.e., the browser followed
   * a 3xx response to get here), this returns true.
   *
   * This is used by the route interception layer to auto-continue redirect
   * targets, matching Playwright's behavior where only the initial request
   * in a redirect chain is intercepted.
   *
   * @param requestId - The CDP request identifier (Network domain)
   */
  readonly isRedirectTarget: (requestId: string) => Effect.Effect<boolean>;

  /**
   * Get the synthetic request ID for a URL.
   *
   * Returns the synthetic ID for the most recent request to this URL.
   * Used to look up redirect chain information.
   *
   * @param url - The URL to look up
   */
  readonly getSyntheticIdByUrl: (url: string) => Effect.Effect<string | undefined>;

  /**
   * Get the URL for a synthetic request ID.
   *
   * @param syntheticId - The synthetic request ID
   */
  readonly getUrlBySyntheticId: (syntheticId: string) => Effect.Effect<string | undefined>;

  /**
   * Get the previous synthetic ID in the redirect chain.
   *
   * When a request is the target of a redirect (3xx response), this returns
   * the synthetic ID of the request that redirected to this one.
   *
   * @param syntheticId - The synthetic request ID
   */
  readonly getPreviousSyntheticId: (syntheticId: string) => Effect.Effect<string | undefined>;

  /**
   * Get the next synthetic ID in the redirect chain.
   *
   * When a request results in a redirect (3xx response), this returns
   * the synthetic ID of the request that this one redirects to.
   *
   * @param syntheticId - The synthetic request ID
   */
  readonly getNextSyntheticId: (syntheticId: string) => Effect.Effect<string | undefined>;
}

/**
 * State for tracking in-flight navigation responses.
 */
interface NavigationWaiter {
  readonly deferred: Deferred.Deferred<ResponseData | undefined>;
  readonly url: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Extract requestWillBeSent params from CDP message.
 * Single cast point avoids repeated `as unknown as` throughout the code.
 */
const toRequestParams = (params: unknown): Protocol.Network.RequestWillBeSentEvent =>
  params as Protocol.Network.RequestWillBeSentEvent;

/**
 * Extract responseReceived params from CDP message.
 * Single cast point avoids repeated `as unknown as` throughout the code.
 */
const toResponseParams = (params: unknown): Protocol.Network.ResponseReceivedEvent =>
  params as Protocol.Network.ResponseReceivedEvent;

/**
 * Extract loadingFailed params from CDP message.
 * Single cast point avoids repeated `as unknown as` throughout the code.
 */
const toLoadingFailedParams = (params: unknown): Protocol.Network.LoadingFailedEvent =>
  params as Protocol.Network.LoadingFailedEvent;

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Creates a NetworkResponseTracker for a page.
 *
 * The tracker subscribes to CDP Network events and maintains:
 * - A map of loaderId → requestId (from requestWillBeSent for Document resources)
 * - A map of requestId → ResponseData (from responseReceived)
 * - A map of loaderId → Deferred (for waiting navigation responses)
 * - A map of requestId → URL (for failure reporting)
 * - A map of requestId → RequestFailure (from loadingFailed)
 *
 * The subscription runs in the background for the lifetime of the page scope.
 *
 * @param conn - CDP connection service
 * @param sessionIdRef - Ref holding the current session ID
 */
export const makeNetworkResponseTracker = (
  conn: CdpConnection["Service"],
  _sessionIdRef: Ref.Ref<string | null>,
): Effect.Effect<NetworkResponseTracker, never, Scope.Scope> =>
  Effect.gen(function* () {
    // Synthetic request ID counter (Playwright-style unique IDs)
    // Each requestWillBeSent gets a unique synthetic ID, even within redirect chains
    let syntheticIdCounter = 0;

    // loaderId → requestId (for Document/Script resources — navigation tracking)
    const loaderToRequest = yield* Ref.make(new Map<string, string>());
    // requestId → ResponseData
    const responses = yield* Ref.make(new Map<string, ResponseData>());
    // loaderId → Deferred (navigation waiters)
    const navigationWaiters = yield* Ref.make(new Map<string, NavigationWaiter>());
    // requestId → URL (for failure reporting)
    const requestUrls = yield* Ref.make(new Map<string, string>());
    // requestId → RequestFailure
    const failures = yield* Ref.make(new Map<string, RequestFailure>());

    // ── Synthetic ID tracking (Playwright-style) ──
    // URL → synthetic ID (most recent synthetic ID for each URL)
    const urlToSyntheticId = yield* Ref.make(new Map<string, string>());
    // synthetic ID → URL
    const syntheticIdToUrl = yield* Ref.make(new Map<string, string>());
    // synthetic ID → previous synthetic ID (redirect chain backwards)
    const syntheticIdToPreviousId = yield* Ref.make(new Map<string, string>());
    // synthetic ID → next synthetic ID (redirect chain forwards)
    const syntheticIdToNextId = yield* Ref.make(new Map<string, string>());

    // ── Legacy tracking (deprecated, kept for backward compatibility) ──
    // requestId → previous URL in redirect chain
    const redirectFromUrls = yield* Ref.make(new Map<string, string>());
    // URL → previous URL in redirect chain
    const redirectFromUrlsByUrl = yield* Ref.make(new Map<string, string>());
    // URL → next URL in redirect chain
    const redirectToUrls = yield* Ref.make(new Map<string, string>());

    // Subscribe to CDP events
    const subscription = yield* conn.subscribe;

    // Process Network events
    const processEvents = Stream.fromSubscription(subscription).pipe(
      Stream.tap((msg) =>
        Effect.gen(function* () {
          // Handle Network.requestWillBeSent — capture loaderId → requestId mapping and URL
          if (msg.method === "Network.requestWillBeSent") {
            const params = toRequestParams(msg.params);
            const requestId = params.requestId;
            const loaderId = params.loaderId;
            const resourceType = params.type;
            const url = params.request.url;

            // Store URL for failure reporting
            yield* Ref.update(requestUrls, (map) => {
              const next = new Map(map);
              next.set(requestId, url);
              return next;
            });

            // Generate a synthetic ID for this request (Playwright-style)
            // Each requestWillBeSent gets a unique synthetic ID
            const syntheticId = `req-${syntheticIdCounter++}`;

            // Store URL → synthetic ID mapping
            yield* Ref.update(urlToSyntheticId, (map) => {
              const next = new Map(map);
              next.set(url, syntheticId);
              return next;
            });

            // Store synthetic ID → URL mapping
            yield* Ref.update(syntheticIdToUrl, (map) => {
              const next = new Map(map);
              next.set(syntheticId, url);
              return next;
            });

            // Track redirect chain if this is a redirect
            // NOTE: CDP reuses requestId for redirect chains, so we use synthetic IDs
            if (params.redirectResponse) {
              const previousUrl = params.redirectResponse.url;

              // Look up the previous URL's synthetic ID
              const previousSyntheticId = yield* Ref.get(urlToSyntheticId).pipe(
                Effect.map((map) => map.get(previousUrl)),
              );

              if (previousSyntheticId) {
                // Link: previousSyntheticId → syntheticId (forward direction)
                yield* Ref.update(syntheticIdToNextId, (map) => {
                  const next = new Map(map);
                  next.set(previousSyntheticId, syntheticId);
                  return next;
                });

                // Link: syntheticId → previousSyntheticId (backward direction)
                yield* Ref.update(syntheticIdToPreviousId, (map) => {
                  const next = new Map(map);
                  next.set(syntheticId, previousSyntheticId);
                  return next;
                });
              }

              // Legacy tracking (deprecated, kept for backward compatibility)
              yield* Ref.update(redirectFromUrls, (map) => {
                const next = new Map(map);
                next.set(requestId, previousUrl);
                return next;
              });
              yield* Ref.update(redirectToUrls, (map) => {
                const next = new Map(map);
                next.set(previousUrl, url);
                return next;
              });
              yield* Ref.update(redirectFromUrlsByUrl, (map) => {
                const next = new Map(map);
                next.set(url, previousUrl);
                return next;
              });
            }

            // Only track Document resources (main navigation) and subframe navigations
            // Other resource types (Image, Stylesheet, etc.) don't have loaderId
            if (resourceType === "Document" || resourceType === "Script") {
              yield* Ref.update(loaderToRequest, (map) => {
                const next = new Map(map);
                next.set(loaderId, requestId);
                return next;
              });
            }
          }

          // Handle Network.responseReceived — store response data
          if (msg.method === "Network.responseReceived") {
            const params = toResponseParams(msg.params);
            const data = extractResponseData(params);
            const requestId = params.requestId;
            const loaderId = params.loaderId;

            // Store response by requestId
            yield* Ref.update(responses, (map) => {
              const next = new Map(map);
              next.set(requestId, data);
              return next;
            });

            // Check if any navigation waiter is waiting for this loaderId
            const waiter = yield* Ref.get(navigationWaiters).pipe(
              Effect.map((map) => map.get(loaderId)),
            );
            if (waiter) {
              yield* Deferred.succeed(waiter.deferred, data);
              // Remove the waiter
              yield* Ref.update(navigationWaiters, (map) => {
                const next = new Map(map);
                next.delete(loaderId);
                return next;
              });
            }
          }

          // Handle Network.loadingFailed — store failure data
          if (msg.method === "Network.loadingFailed") {
            const params = toLoadingFailedParams(msg.params);
            const requestId = params.requestId;
            const errorText = params.errorText;
            const resourceType = params.type;
            const canceled = params.canceled ?? false;

            // Get URL for this request
            const url = yield* Ref.get(requestUrls).pipe(
              Effect.map((map) => map.get(requestId) ?? "unknown"),
            );

            const failure: RequestFailure = {
              requestId,
              url,
              errorText,
              resourceType,
              canceled,
            };

            // Store failure by requestId
            yield* Ref.update(failures, (map) => {
              const next = new Map(map);
              next.set(requestId, failure);
              return next;
            });
          }
        }),
      ),
      Stream.runDrain,
      Effect.ignoreCause, // Silently end on scope close
    );

    // Fork the event processor in the current scope
    yield* Effect.forkScoped(processEvents);

    // ── Public API ─────────────────────────────────────────────────────────────

    const waitForNavigationResponse = (
      loaderId: string,
      url: string,
    ): Effect.Effect<ResponseData | undefined> =>
      Effect.gen(function* () {
        // Check if we already have a response for this loaderId
        const requestId = yield* Ref.get(loaderToRequest).pipe(
          Effect.map((map) => map.get(loaderId)),
        );

        if (requestId) {
          const existingResponse = yield* Ref.get(responses).pipe(
            Effect.map((map) => map.get(requestId)),
          );
          if (existingResponse) {
            return existingResponse;
          }
        }

        // Create a deferred for this navigation
        const deferred = yield* Deferred.make<ResponseData | undefined>();

        // Register the waiter
        yield* Ref.update(navigationWaiters, (map) => {
          const next = new Map(map);
          next.set(loaderId, { deferred, url });
          return next;
        });

        // Wait for the response (no timeout here — caller handles timeout)
        const result = yield* Deferred.await(deferred);

        return result;
      });

    const getResponse = (requestId: string): Effect.Effect<ResponseData | undefined> =>
      Ref.get(responses).pipe(Effect.map((map) => map.get(requestId)));

    const getFailure = (requestId: string): Effect.Effect<RequestFailure | undefined> =>
      Ref.get(failures).pipe(Effect.map((map) => map.get(requestId)));

    const getRedirectedFromUrl = (requestId: string): Effect.Effect<string | undefined> =>
      Ref.get(redirectFromUrls).pipe(Effect.map((map) => map.get(requestId)));

    const getRedirectedFromUrlByUrl = (url: string): Effect.Effect<string | undefined> =>
      Ref.get(redirectFromUrlsByUrl).pipe(Effect.map((map) => map.get(url)));

    const getRedirectedToUrl = (url: string): Effect.Effect<string | undefined> =>
      Ref.get(redirectToUrls).pipe(Effect.map((map) => map.get(url)));

    const isRedirectTarget = (requestId: string): Effect.Effect<boolean> =>
      Ref.get(redirectFromUrls).pipe(Effect.map((map) => map.has(requestId)));

    // ── Synthetic ID-based methods (Playwright-style) ──

    const getSyntheticIdByUrl = (url: string): Effect.Effect<string | undefined> =>
      Ref.get(urlToSyntheticId).pipe(Effect.map((map) => map.get(url)));

    const getUrlBySyntheticId = (syntheticId: string): Effect.Effect<string | undefined> =>
      Ref.get(syntheticIdToUrl).pipe(Effect.map((map) => map.get(syntheticId)));

    const getPreviousSyntheticId = (syntheticId: string): Effect.Effect<string | undefined> =>
      Ref.get(syntheticIdToPreviousId).pipe(Effect.map((map) => map.get(syntheticId)));

    const getNextSyntheticId = (syntheticId: string): Effect.Effect<string | undefined> =>
      Ref.get(syntheticIdToNextId).pipe(Effect.map((map) => map.get(syntheticId)));

    return {
      waitForNavigationResponse,
      getResponse,
      getFailure,
      getRedirectedFromUrl,
      getRedirectedFromUrlByUrl,
      getRedirectedToUrl,
      isRedirectTarget,
      getSyntheticIdByUrl,
      getUrlBySyntheticId,
      getPreviousSyntheticId,
      getNextSyntheticId,
    };
  });
