/**
 * Fetch operation for Playwright Page - performs HTTP requests through the browser context.
 *
 * @since 0.1.0
 */

import type { Page } from "@effect-libs/cloudflare-playwright";

import { Duration, Effect, Predicate, Schema } from "effect";

import {
  getErrorMessage,
  type FetchResponse,
  FetchResult,
  type FetchOptions,
} from "@effect-libs/browser";

import { PlaywrightError, OperationError } from "../PlaywrightError.js";

// Re-export for PlaywrightPage imports
export { FetchResponse, type FetchOptions } from "@effect-libs/browser";

/** Helper to fail with PlaywrightError wrapping OperationError. */
const failFetch = (url: string, description: string) =>
  Effect.fail(
    new PlaywrightError({
      module: "PlaywrightPage",
      method: "fetch",
      reason: new OperationError({
        method: "fetch",
        description: `Fetch failed for ${url}: ${description}`,
      }),
    }),
  );

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
 * @param rawPage - Playwright Page object
 * @param url - URL to fetch
 * @param options - Fetch options (method, headers, body, timeout)
 */
export const fetchPage = (
  rawPage: Page,
  url: string,
  options?: FetchOptions,
): Effect.Effect<FetchResponse, PlaywrightError> =>
  Effect.gen(function* () {
    // Convert at the boundary — public API accepts DurationInput, internals use Duration
    const timeout = Duration.fromInputUnsafe(options?.timeout ?? "30 seconds");
    // Convert to millis at the browser-eval boundary
    const timeoutMs = Duration.toMillis(timeout);

    // Normalize the public body shape to a value the browser's `fetch()` can
    // accept directly. `string` and `Uint8Array` are valid `BodyInit` values;
    // `object` is JSON.stringify'd here so the browser-side code does not need
    // to import `JSON` (or any other host-module helper) at evaluate time.
    // `undefined` / `null` becomes "no body".
    // The `new Uint8Array(...)` constructor call coerces the input's generic
    // `ArrayBufferLike` to `ArrayBuffer`, which is what `BodyInit`'s
    // `BufferSource` constraint requires. We re-narrow the result type
    // explicitly so the inner browser-side `BodyInit` cast matches.
    const preparedBody: string | Uint8Array<ArrayBuffer> | undefined = (() => {
      const body = options?.body;
      if (body === undefined || body === null) return undefined;
      if (Predicate.isString(body)) return body;
      if (body instanceof Uint8Array) return new Uint8Array(body);
      return JSON.stringify(body);
    })();

    // Fetch function to evaluate in the browser context
    const fetchCode = async (params: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string | Uint8Array<ArrayBuffer>;
      timeout: number;
    }) => {
      const { url, method, headers, body, timeout } = params;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // `string` and `Uint8Array<ArrayBuffer>` are both valid `BodyInit`
        // values. The wrapper has already JSON.stringify'd any object body
        // above, so this branch does not need to handle that case.
        const fetchBody: BodyInit | undefined = body;

        const response = await fetch(url, {
          method: method || "GET",
          headers: headers || {},
          body: fetchBody,
          signal: controller.signal,
          mode: "cors",
          credentials: "include",
        });

        clearTimeout(timeoutId);

        // Extract headers as plain object
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        // Get body as text
        const responseBody = await response.text();

        return {
          ok: true,
          data: {
            status: response.status,
            ok: response.ok,
            headers: responseHeaders,
            body: responseBody,
          },
        };
      } catch (error) {
        // Handle timeout
        if (error instanceof Error && error.name === "AbortError") {
          return {
            ok: false,
            error: "TIMEOUT",
            message: "Request timed out",
          };
        }

        // Handle other fetch errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          error: "FETCH_FAILED",
          message: errorMessage,
        };
      }
    };

    // Execute in browser context via page.evaluate
    const result = yield* Effect.tryPromise({
      try: () =>
        rawPage.evaluate(fetchCode, {
          url,
          method: options?.method,
          headers: options?.headers,
          body: preparedBody,
          timeout: timeoutMs,
        }),
      catch: (cause) =>
        new PlaywrightError({
          module: "PlaywrightPage",
          method: "fetch",
          reason: new OperationError({
            method: "fetch",
            description: `Evaluate failed: ${getErrorMessage(cause)}`,
            cause,
          }),
        }),
    });

    // Validate the result using Schema
    const fetchResult = yield* Schema.decodeUnknownEffect(FetchResult)(result).pipe(
      Effect.mapError(
        (issue) =>
          new PlaywrightError({
            module: "PlaywrightPage",
            method: "fetch",
            reason: new OperationError({
              method: "fetch",
              description: `Invalid fetch response structure: ${String(issue)}`,
            }),
          }),
      ),
    );

    // Handle raw JavaScript error (syntax error in evaluated code)
    if (!("ok" in fetchResult)) {
      return yield* failFetch(url, fetchResult.message || "Unknown JavaScript error in fetch code");
    }

    // Handle error case
    if (fetchResult.ok === false) {
      if (fetchResult.error === "TIMEOUT") {
        return yield* failFetch(url, `Request timed out after ${Duration.format(timeout)}`);
      }
      return yield* failFetch(url, fetchResult.message || fetchResult.error);
    }

    // Return the fetch response data
    return fetchResult.data;
  });
