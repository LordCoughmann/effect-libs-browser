/**
 * Extension interfaces for methods beyond the Playwright Page API.
 *
 * These are custom methods that don't exist in Playwright's native API
 * but are useful for scraping and automation workflows. Composed into
 * PlaywrightPage via intersection type in PlaywrightTypes.ts.
 *
 * @since 0.1.0
 */

import type { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";

import type { PlaywrightError } from "../PlaywrightError.js";
import type { FetchResponse, FetchOptions } from "./PlaywrightFetch.js";

/**
 * Extension methods for PlaywrightPage beyond Playwright's Page API.
 */
export interface PlaywrightPageExtensions {
  /**
   * Performs an HTTP fetch request through the browser context.
   *
   * This method wraps the browser's `fetch()` API with:
   * - Automatic timeout handling via AbortController
   * - Structured error mapping to OperationError
   * - Response serialization (body as text, headers as object)
   *
   * The request executes in the browser's JavaScript context, inheriting
   * the page's cookies, session storage, and other browser state.
   *
   * @param url - URL to fetch
   * @param options - Fetch options (method, headers, body, timeout)
   */
  readonly fetch: (
    url: string,
    options?: FetchOptions,
  ) => Effect.Effect<FetchResponse, PlaywrightError>;

  /**
   * High-level HttpClient for browser-context requests.
   *
   * This is an Effect HttpClient that uses the browser's fetch internally,
   * allowing you to use the standard HttpClient API with browser cookies.
   *
   * Use for schema validation, middleware, retry policies, and other
   * Effect HTTP patterns.
   *
   * @example
   * ```typescript
   * const client = page.httpClient.pipe(
   *   HttpClient.filterStatusOk,
   *   HttpClient.retryTransient({ schedule: Schedule.exponential(100), times: 3 }),
   * );
   *
   * const result = yield* client.get("/api/data").pipe(
   *   Effect.flatMap(HttpClientResponse.schemaBodyJson(MySchema)),
   * );
   * ```
   */
  readonly httpClient: HttpClient.HttpClient;
}
