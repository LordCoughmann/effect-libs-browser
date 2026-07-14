/**
 * Effect HttpClient implementation for CDP page.fetch.
 *
 * Provides a high-level HttpClient interface that wraps the low-level page.fetch()
 * operation, enabling use of standard Effect HTTP combinators like filterStatusOk,
 * retryTransient, and schemaBodyJson.
 */

import type { CdpError } from "../CdpError.js";
import type { FetchOptions, FetchResponse } from "./CdpPage.js";

import { Effect, Predicate } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Fetch function signature matching CdpPageService.fetch.
 */
export type PageFetchFn = (
  url: string,
  options?: FetchOptions,
) => Effect.Effect<FetchResponse, CdpError>;

// ── HttpClient Factory ─────────────────────────────────────────────────────────

/**
 * Creates an HttpClient that uses page.fetch() for HTTP requests.
 *
 * This enables using standard Effect HTTP combinators with browser-context
 * fetch operations that inherit the page's cookies, session storage, and
 * authentication state.
 *
 * @param pageFetch - The fetch function from a CdpPageService instance
 *
 * @example
 * ```typescript
 * const client = makePageHttpClient(page.fetch).pipe(
 *   HttpClient.filterStatusOk,
 *   HttpClient.retryTransient({ schedule: Schedule.exponential(100), times: 3 }),
 * );
 *
 * const result = yield* client.get("/api/data").pipe(
 *   Effect.flatMap(HttpClientResponse.schemaBodyJson(MySchema)),
 * );
 * ```
 */
export const makePageHttpClient = (pageFetch: PageFetchFn): HttpClient.HttpClient =>
  HttpClient.make((request, url, _signal, _fiber) =>
    Effect.gen(function* () {
      // Build headers from request
      const headers: Record<string, string> = {};
      for (const key in request.headers) {
        const value = request.headers[key];
        if (value !== undefined) {
          headers[key] = String(value);
        }
      }

      // Convert body to string if present
      const body: string | undefined = (() => {
        const requestBody = request.body;

        // Handle plain string body (from client.post(url, { body: "..." }))
        if (Predicate.isString(requestBody)) {
          return requestBody;
        }

        // Handle Uint8Array body
        if (requestBody instanceof Uint8Array) {
          return new TextDecoder().decode(requestBody);
        }

        // Handle HttpBody types — check _tag property safely since we don't own the type
        if (Predicate.isObject(requestBody) && Predicate.hasProperty(requestBody, "_tag")) {
          const tag = requestBody._tag;
          if (Predicate.isString(tag) && (tag === "Raw" || tag === "Uint8Array")) {
            if (Predicate.hasProperty(requestBody, "body")) {
              const bodyContent = requestBody.body;
              if (Predicate.isString(bodyContent)) return bodyContent;
              if (bodyContent instanceof Uint8Array) {
                return new TextDecoder().decode(bodyContent);
              }
              return String(bodyContent);
            }
          }
        }

        return undefined;
      })();

      // Execute page.fetch
      const response = yield* pageFetch(url.toString(), {
        method: request.method,
        headers,
        body,
      }).pipe(
        Effect.mapError(
          (error) =>
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                cause: error,
              }),
            }),
        ),
      );

      // Create a web Response object and use HttpClientResponse.fromWeb
      const webResponse = new Response(response.body, {
        status: response.status,
        headers: new globalThis.Headers(response.headers),
      });

      return HttpClientResponse.fromWeb(request, webResponse);
    }),
  );
