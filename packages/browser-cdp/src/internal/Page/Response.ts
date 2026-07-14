/**
 * Response object for navigation and network operations.
 *
 * Wraps CDP `Network.responseReceived` event data with Playwright-style helpers.
 * Returned by `goto()`, `waitForNavigation()`, and `waitForResponse()`.
 *
 */

import type { Protocol } from "devtools-protocol";

import type { CdpError } from "../../CdpError.js";
import type { CdpConnection } from "../CdpConnection.js";
import type { NetworkResponseTracker } from "./NetworkResponseTracker.js";
import type { InterceptedRequest } from "./Route.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError as CdpErrorClass, FetchError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Decode a base64 string to a UTF-8 string without using Node's `Buffer`.
 *
 * `browser-cdp` is documented as zero-dependency and runtime-agnostic
 * (works on workerd without `nodejs_compat`). `Buffer.from(b64, "base64")`
 * is not available on plain workerd, so we use the web-standard `atob` +
 * `TextDecoder` instead. Both APIs are present in every supported runtime.
 *
 * `atob` returns a binary string (one char per byte), so the round-trip
 * through `Uint8Array` + `TextDecoder` is required for UTF-8 fidelity —
 * the previous `Buffer.toString("utf-8")` path decoded multi-byte sequences.
 */
const decodeBase64ToUtf8 = (b64: string): string => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
};

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Response object representing an HTTP response.
 *
 * Mirrors Playwright's `Response` class — provides status, URL, headers,
 * and body access. Created from CDP `Network.responseReceived` events.
 *
 * **Note:** Body methods (`text()`, `json()`) require an additional CDP call
 * (`Network.getResponseBody`) after `Network.loadingFinished` fires.
 * For navigation responses, the body is typically not needed — use
 * `page.content()` to get the rendered HTML instead.
 */
export interface Response {
  /** HTTP status code (e.g., 200, 404, 500) */
  readonly status: number;

  /** HTTP status text (e.g., "OK", "Not Found") */
  readonly statusText: string;

  /** The response URL (may differ from request URL after redirects) */
  readonly url: string;

  /** Response headers (Title-Case per CDP protocol: `Content-Type`, not `content-type`) */
  readonly headers: Record<string, string>;

  /** Resource MIME type (e.g., "text/html", "application/json") */
  readonly mimeType: string;

  /** The CDP request identifier (correlates with requestWillBeSent) */
  readonly requestId: string;

  /** The CDP loader identifier (correlates with Page.navigate result) */
  readonly loaderId: string;

  /** Returns true if status is 200-299 */
  ok(): boolean;

  /**
   * Returns the request that generated this response.
   *
   * For redirect chains, this returns the final request in the chain.
   * Use `request.redirectedFrom()` to walk backward through the redirect chain.
   *
   * Returns an Effect to match Playwright's async Promise-based API.
   */
  request(): Effect.Effect<InterceptedRequest, never, never>;

  /**
   * Returns all response headers.
   *
   * In Playwright, this is async because it might fetch additional headers.
   * In our CDP implementation, we return the headers from Network.responseReceived.
   *
   * Returns an Effect to match Playwright's async Promise-based API.
   */
  allHeaders(): Effect.Effect<Record<string, string>, never, never>;

  /** Returns the response body as text. Requires Network.getResponseBody CDP call. */
  text(): Effect.Effect<string, CdpError>;

  /** Returns the response body parsed as JSON. Requires Network.getResponseBody CDP call. */
  json(): Effect.Effect<unknown, CdpError>;

  /** Returns the response body parsed as JSON with type inference. */
  json<T>(): Effect.Effect<T, CdpError>;
}

// ── Implementation ─────────────────────────────────────────────────────────────

/**
 * Internal response data from CDP Network.responseReceived event.
 */
export interface ResponseData {
  readonly requestId: string;
  readonly loaderId: string;
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly mimeType: string;
  readonly fromDiskCache?: boolean;
  readonly fromServiceWorker?: boolean;
}

/**
 * Factory function that creates a Response object from CDP response data.
 *
 * The returned object has lazy body methods that call `Network.getResponseBody`
 * only when needed. This avoids unnecessary CDP roundtrips for navigation
 * responses where the body is typically not used.
 *
 * @param conn - CDP connection service
 * @param state - Page state (for session ID)
 * @param responseTracker - Network response tracker (for redirect chain)
 * @param data - Response data from Network.responseReceived
 */
export const makeResponse = (
  conn: CdpConnection["Service"],
  state: PageState,
  responseTracker: NetworkResponseTracker,
  data: ResponseData,
): Response => {
  /**
   * Fetch the response body via CDP Network.getResponseBody.
   * Returns base64-encoded body decoded to string.
   */
  const fetchBody = (): Effect.Effect<string, CdpError> =>
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);
      const result = yield* conn.cdp.Network.getResponseBody(
        { requestId: data.requestId },
        sessionId,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new CdpErrorClass({
              module: "CdpPage",
              method: "Response.text",
              reason: new FetchError({
                url: data.url,
                description: getErrorMessage(cause),
              }),
            }),
        ),
      );
      // CDP returns body as base64 when base64Encoded: true, otherwise plain string
      if (result.base64Encoded) {
        // Decode base64 to a UTF-8 string. We can't use `Buffer.from(..., "base64")`
        // here because that requires `nodejs_compat` in workerd; `browser-cdp`
        // is documented as zero-dep. `atob` + TextDecoder works in every
        // supported runtime (workerd, browser, Node, Deno, Bun).
        return decodeBase64ToUtf8(result.body);
      }
      return result.body;
    });

  return {
    status: data.status,
    statusText: data.statusText,
    url: data.url,
    headers: data.headers,
    mimeType: data.mimeType,
    requestId: data.requestId,
    loaderId: data.loaderId,

    ok(): boolean {
      return data.status >= 200 && data.status <= 299;
    },

    allHeaders(): Effect.Effect<Record<string, string>, never, never> {
      return Effect.succeed(data.headers);
    },

    text(): Effect.Effect<string, CdpError> {
      return fetchBody();
    },

    json<T>(): Effect.Effect<T, CdpError> {
      return fetchBody().pipe(
        Effect.flatMap((body) =>
          Effect.try({
            try: () => JSON.parse(body) as T,
            catch: (cause) =>
              new CdpErrorClass({
                module: "CdpPage",
                method: "Response.json",
                reason: new FetchError({
                  url: data.url,
                  description: getErrorMessage(cause),
                }),
              }),
          }),
        ),
      );
    },

    request(): Effect.Effect<InterceptedRequest, never, never> {
      // Create a synthetic InterceptedRequest for this response's request
      // Uses Playwright-style synthetic IDs for redirect chain navigation.
      // Each request in the chain gets a unique synthetic ID, even though
      // CDP reuses requestId for the entire chain.
      const makeSyntheticRequest = (
        syntheticId: string,
      ): Effect.Effect<InterceptedRequest, never, never> =>
        Effect.gen(function* () {
          const url = (yield* responseTracker.getUrlBySyntheticId(syntheticId)) ?? "";
          return {
            url,
            method: "GET", // Default, actual method not stored in ResponseData
            headers: {},
            postData: null,
            resourceType: data.mimeType.includes("html") ? "Document" : "Other",
            isNavigationRequest: data.mimeType.includes("html"),
            allHeaders: () => Effect.succeed({}),
            response: () => Effect.succeed(null),
            failure: () => Effect.succeed(null),
            redirectedFrom: () =>
              Effect.gen(function* () {
                const previousSyntheticId =
                  yield* responseTracker.getPreviousSyntheticId(syntheticId);
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

      // Look up the synthetic ID for this response's URL
      return Effect.gen(function* () {
        const syntheticId = yield* responseTracker.getSyntheticIdByUrl(data.url);
        if (!syntheticId) {
          // No synthetic ID found (shouldn't happen for normal requests)
          // Return a basic request with no redirect chain
          return {
            url: data.url,
            method: "GET",
            headers: {},
            postData: null,
            resourceType: data.mimeType.includes("html") ? "Document" : "Other",
            isNavigationRequest: data.mimeType.includes("html"),
            allHeaders: () => Effect.succeed({}),
            response: () => Effect.succeed(null),
            failure: () => Effect.succeed(null),
            redirectedFrom: () => Effect.succeed(null),
            redirectedTo: () => Effect.succeed(null),
          };
        }
        return yield* makeSyntheticRequest(syntheticId);
      });
    },
  };
};

/**
 * Extract response data from a CDP Network.responseReceived event.
 *
 * Trusts the CDP protocol shape — no runtime validation needed.
 * The response object contains all HTTP metadata plus CDP-specific fields.
 */
export const extractResponseData = (
  params: Protocol.Network.ResponseReceivedEvent,
): ResponseData => {
  const response = params.response;
  return {
    requestId: params.requestId,
    loaderId: params.loaderId,
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers as Record<string, string>,
    mimeType: response.mimeType,
    fromDiskCache: response.fromDiskCache,
    fromServiceWorker: response.fromServiceWorker,
  };
};
