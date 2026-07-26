/**
 * Wait for network request/response events.
 *
 * Provides a convenient API for capturing XHR/fetch requests and responses
 * during page interactions. Uses CDP Network domain events under the hood.
 *
 */

import type { Protocol } from "devtools-protocol";

import type { CdpConnection } from "../CdpConnection.js";

import { Duration, Effect, Exit, Option, Predicate, Ref, Scope, Stream } from "effect";

import { CdpError, PageTimeoutError } from "../../CdpError.js";
import { attachToTarget } from "./AttachToTarget.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Information about a captured network request.
 */
export interface RequestInfo {
  /** Unique request identifier assigned by the network agent. */
  readonly requestId: string;
  /** The URL of the request. */
  readonly url: string;
  /** HTTP method. */
  readonly method: string;
  /** Request headers (key-value pairs). */
  readonly headers: Record<string, string>;
  /** Request payload (POST data), if any. */
  readonly postData?: string;
  /** The type of the resource. */
  readonly resourceType?: string;
}

/**
 * Information about a captured network response.
 */
export interface ResponseInfo {
  /** Unique request identifier (matches the corresponding request). */
  readonly requestId: string;
  /** The URL of the response. */
  readonly url: string;
  /** HTTP status code. */
  readonly status: number;
  /** HTTP status text. */
  readonly statusText: string;
  /** Response headers (key-value pairs). */
  readonly headers: Record<string, string>;
  /** Resource MIME type. */
  readonly mimeType?: string;
}

/**
 * Information about a failed request.
 */
export interface RequestFailedInfo {
  /** Unique request identifier. */
  readonly requestId: string;
  /** The URL that failed. */
  readonly url: string;
  /** Resource type (e.g., "Stylesheet", "Image", "Document"). */
  readonly resourceType: string;
  /** Human-readable error text (e.g., "net::ERR_BLOCKED_BY_CLIENT"). */
  readonly errorText: string;
  /** True if loading was canceled. */
  readonly canceled: boolean;
}

/**
 * A URL string, regex, or predicate function to match against.
 *
 * - `string` — matches if the URL equals the string
 * - `RegExp` — matches if the URL tests positive
 * - `(info) => boolean` — predicate receives the full request/response info,
 *   allowing matching on method, headers, etc. (matches Playwright's pattern)
 */
export type RequestUrlOrPredicate = string | RegExp | ((info: RequestInfo) => boolean);

/**
 * A URL string, regex, or predicate function to match against.
 *
 * - `string` — matches if the URL equals the string
 * - `RegExp` — matches if the URL tests positive
 * - `(info) => boolean` — predicate receives the full response info,
 *   allowing matching on status, headers, etc. (matches Playwright's pattern)
 */
export type ResponseUrlOrPredicate = string | RegExp | ((info: ResponseInfo) => boolean);

/**
 * A URL string, regex, or predicate function to match failed requests.
 *
 * - `string` — matches if the URL equals the string
 * - `RegExp` — matches if the URL tests positive
 * - `(info) => boolean` — predicate receives the full failure info,
 *   allowing matching on resourceType, errorText, etc.
 */
export type RequestFailedUrlOrPredicate = string | RegExp | ((info: RequestFailedInfo) => boolean);

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Extracts request info from a `Network.requestWillBeSent` event params.
 * Trusts the CDP protocol shape — no runtime validation needed.
 */
const extractRequestInfo = (params: Protocol.Network.RequestWillBeSentEvent): RequestInfo => ({
  requestId: params.requestId,
  url: params.request.url,
  method: params.request.method,
  headers: params.request.headers as Record<string, string>,
  postData: params.request.postData,
  resourceType: params.type,
});

/**
 * Extracts response info from a `Network.responseReceived` event params.
 * Trusts the CDP protocol shape — no runtime validation needed.
 */
const extractResponseInfo = (params: Protocol.Network.ResponseReceivedEvent): ResponseInfo => ({
  requestId: params.requestId,
  url: params.response.url,
  status: params.response.status,
  statusText: params.response.statusText,
  headers: params.response.headers as Record<string, string>,
  mimeType: params.response.mimeType,
});

/**
 * Tests whether a request matches the given URL or predicate.
 */
const requestMatches = (urlOrPredicate: RequestUrlOrPredicate, info: RequestInfo): boolean => {
  if (Predicate.isString(urlOrPredicate)) return info.url === urlOrPredicate;
  if (urlOrPredicate instanceof RegExp) return urlOrPredicate.test(info.url);
  return urlOrPredicate(info);
};

/**
 * Tests whether a response matches the given URL or predicate.
 */
const responseMatches = (urlOrPredicate: ResponseUrlOrPredicate, info: ResponseInfo): boolean => {
  if (Predicate.isString(urlOrPredicate)) return info.url === urlOrPredicate;
  if (urlOrPredicate instanceof RegExp) return urlOrPredicate.test(info.url);
  return urlOrPredicate(info);
};

/**
 * Extracts failure info from a `Network.loadingFailed` event params.
 * Also needs the URL from a prior `requestWillBeSent` event.
 */
const extractRequestFailedInfo = (
  params: Protocol.Network.LoadingFailedEvent,
  url: string,
): RequestFailedInfo => ({
  requestId: params.requestId,
  url,
  resourceType: params.type,
  errorText: params.errorText,
  canceled: params.canceled ?? false,
});

/**
 * Tests whether a failed request matches the given URL or predicate.
 */
const requestFailedMatches = (
  urlOrPredicate: RequestFailedUrlOrPredicate,
  info: RequestFailedInfo,
): boolean => {
  if (Predicate.isString(urlOrPredicate)) return info.url === urlOrPredicate;
  if (urlOrPredicate instanceof RegExp) return urlOrPredicate.test(info.url);
  return urlOrPredicate(info);
};

/**
 * Ensures the Network domain is enabled so CDP emits request/response events.
 * Attaches to the target if no session exists yet.
 */
const ensureNetworkEnabled = (
  conn: CdpConnection["Service"],
  state: PageState,
  targetId: string,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    const currentSid = yield* Ref.get(state.sessionId);
    if (!currentSid) {
      yield* attachToTarget(conn, state, targetId);
    }
    const sessionId = yield* ensureSession(state);
    yield* conn.cdp.Network.enable({}, sessionId).pipe(Effect.ignore);
  });

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Waits for a network request matching the given URL or predicate.
 *
 * Uses the prepare-then-await pattern: call first to subscribe to events
 * synchronously, then trigger the action that causes the request, then await.
 *
 * ```typescript
 * const request = yield* page.waitForRequest("/api/data");
 * yield* page.click("button.load-data");
 * const info = yield* request;
 * console.log(info.url);
 * ```
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param targetId - The CDP target identifier for the page
 * @param urlOrPredicate - URL string, regex, or predicate function receiving `RequestInfo`
 * @param options - Options
 *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
 * @returns A nested Effect — outer allocates subscription, inner awaits the request
 */
export const waitForRequestPage = (
  conn: CdpConnection["Service"],
  state: PageState,
  targetId: string,
  urlOrPredicate: RequestUrlOrPredicate,
  options?: { timeout?: Duration.Duration },
) =>
  Effect.gen(function* () {
    const manualScope = yield* Scope.make();
    const sub = yield* conn.subscribe.pipe(Scope.provide(manualScope));

    // Enable Network domain so CDP emits request events
    yield* ensureNetworkEnabled(conn, state, targetId);

    const timeout = options?.timeout ?? Duration.seconds(30);

    const timeoutError = new CdpError({
      source: "CdpPage",
      method: "waitForRequest",
      reason: new PageTimeoutError({ timeout }),
    });

    return Stream.fromSubscription(sub).pipe(
      Stream.filter((e) => e.method === "Network.requestWillBeSent"),
      Stream.map((e) =>
        // oxlint-disable-next-line effect/avoid-any — CDP event params are untyped JSON, cast is inherent
        extractRequestInfo(e.params as unknown as Protocol.Network.RequestWillBeSentEvent),
      ),
      Stream.filter((info) => requestMatches(urlOrPredicate, info)),
      Stream.take(1),
      Stream.runHead,
      Effect.map(Option.getOrThrowWith(() => timeoutError)),
      Effect.timeout(timeout),
      Effect.mapError(() => timeoutError),
      Effect.ensuring(Scope.close(manualScope, Exit.void)),
    );
  });

/**
 * Waits for a network response matching the given URL or predicate.
 *
 * Uses the prepare-then-await pattern: call first to subscribe to events
 * synchronously, then trigger the action that causes the response, then await.
 *
 * ```typescript
 * const response = yield* page.waitForResponse("/api/data");
 * yield* page.click("button.load-data");
 * const info = yield* response;
 * console.log(info.status, info.url);
 * ```
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param targetId - The CDP target identifier for the page
 * @param urlOrPredicate - URL string, regex, or predicate function receiving `ResponseInfo`
 * @param options - Options
 *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
 * @returns A nested Effect — outer allocates subscription, inner awaits the response
 */
export const waitForResponsePage = (
  conn: CdpConnection["Service"],
  state: PageState,
  targetId: string,
  urlOrPredicate: ResponseUrlOrPredicate,
  options?: { timeout?: Duration.Duration },
) =>
  Effect.gen(function* () {
    const manualScope = yield* Scope.make();
    const sub = yield* conn.subscribe.pipe(Scope.provide(manualScope));

    // Enable Network domain so CDP emits response events
    yield* ensureNetworkEnabled(conn, state, targetId);

    const timeout = options?.timeout ?? Duration.seconds(30);

    const timeoutError = new CdpError({
      source: "CdpPage",
      method: "waitForResponse",
      reason: new PageTimeoutError({ timeout }),
    });

    return Stream.fromSubscription(sub).pipe(
      Stream.filter((e) => e.method === "Network.responseReceived"),
      Stream.map((e) =>
        // oxlint-disable-next-line effect/avoid-any — CDP event params are untyped JSON, cast is inherent
        extractResponseInfo(e.params as unknown as Protocol.Network.ResponseReceivedEvent),
      ),
      Stream.filter((info) => responseMatches(urlOrPredicate, info)),
      Stream.take(1),
      Stream.runHead,
      Effect.map(Option.getOrThrowWith(() => timeoutError)),
      Effect.timeout(timeout),
      Effect.mapError(() => timeoutError),
      Effect.ensuring(Scope.close(manualScope, Exit.void)),
    );
  });

/**
 * Waits for a network request failure matching the given URL or predicate.
 *
 * Uses the prepare-then-await pattern: call first to subscribe to events
 * synchronously, then trigger the action that causes the failure, then await.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param targetId - The CDP target identifier for the page
 * @param urlOrPredicate - URL string, regex, or predicate function
 * @param options - Options with timeout (default: 30 seconds)
 * @returns A nested Effect - outer allocates subscription, inner awaits the failure
 */
export const waitForRequestFailed = (
  conn: CdpConnection["Service"],
  state: PageState,
  targetId: string,
  urlOrPredicate: RequestFailedUrlOrPredicate,
  options?: { timeout?: Duration.Duration },
) =>
  Effect.gen(function* () {
    const manualScope = yield* Scope.make();
    const sub = yield* conn.subscribe.pipe(Scope.provide(manualScope));

    // Enable Network domain so CDP emits request events
    yield* ensureNetworkEnabled(conn, state, targetId);

    const timeout = options?.timeout ?? Duration.seconds(30);

    const timeoutError = new CdpError({
      source: "CdpPage",
      method: "waitForRequestFailed",
      reason: new PageTimeoutError({ timeout }),
    });

    // Track URLs from requestWillBeSent events
    const urlMap = new Map<string, string>();

    return Stream.fromSubscription(sub).pipe(
      Stream.tap((e) =>
        Effect.sync(() => {
          // Track URLs from requestWillBeSent events
          if (e.method === "Network.requestWillBeSent") {
            // oxlint-disable-next-line effect/avoid-any — CDP event params are untyped JSON, cast is inherent
            const params = e.params as unknown as Protocol.Network.RequestWillBeSentEvent;
            urlMap.set(params.requestId, params.request.url);
          }
        }),
      ),
      Stream.filter((e) => e.method === "Network.loadingFailed"),
      Stream.map((e) => {
        // oxlint-disable-next-line effect/avoid-any — CDP event params are untyped JSON, cast is inherent
        const params = e.params as unknown as Protocol.Network.LoadingFailedEvent;
        const url = urlMap.get(params.requestId) ?? "unknown";
        return extractRequestFailedInfo(params, url);
      }),
      Stream.filter((info) => requestFailedMatches(urlOrPredicate, info)),
      Stream.take(1),
      Stream.runHead,
      Effect.map(Option.getOrThrowWith(() => timeoutError)),
      Effect.timeout(timeout),
      Effect.mapError(() => timeoutError),
      Effect.ensuring(Scope.close(manualScope, Exit.void)),
    );
  });
