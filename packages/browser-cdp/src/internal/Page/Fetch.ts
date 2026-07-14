/**
 * Fetch operation for CDP Page - performs HTTP requests through the browser context.
 */

import type { CdpConnectionService } from "../CdpConnection.js";

import { Duration, Effect, Schema } from "effect";

import {
  getErrorMessage,
  type FetchResponse,
  FetchResult,
  type FetchOptions,
} from "@effect-libs/browser";

import { CdpError, FetchError } from "../../CdpError.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

// Re-export for CdpPage.ts imports
export { FetchResponse, type FetchOptions } from "@effect-libs/browser";

/** Helper to fail with CdpError wrapping FetchError reason. */
const failFetch = (url: string, description: string, status?: number) =>
  Effect.fail(
    new CdpError({
      module: "CdpPage",
      method: "fetch",
      reason: new FetchError({ url, status, description }),
    }),
  );

/**
 * Performs an HTTP fetch request through the browser context.
 *
 * This method wraps the browser's `fetch()` API with:
 * - Automatic timeout handling via AbortController
 * - Structured error mapping to FetchError reasons
 * - Response serialization (body as text, headers as object)
 *
 * The request executes in the browser's JavaScript context, inheriting
 * the page's cookies, session storage, and other browser state.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param url - URL to fetch
 * @param options - Fetch options (method, headers, body, timeout)
 */
export const fetchPage = Effect.fn("CdpPage.fetch")(
  (
    conn: CdpConnectionService,
    state: PageState,
    url: string,
    options?: FetchOptions,
  ): Effect.Effect<FetchResponse, CdpError> =>
    Effect.gen(function* () {
      // Convert at the boundary — public API accepts DurationInput, internals use Duration
      const timeout = Duration.fromInputUnsafe(options?.timeout ?? "30 seconds");
      // Convert to millis at the browser-eval boundary
      const timeoutMs = Duration.toMillis(timeout);

      // Define as actual function so it's called with args via buildEvaluateExpression
      const fetchCode = async ({
        url,
        method,
        headers,
        body,
        timeout,
      }: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        timeout: number;
      }) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(url, {
            method: method || "GET",
            headers: headers || {},
            body: body,
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
          const errorMessage = getErrorMessage(error);
          return {
            ok: false,
            error: "FETCH_FAILED",
            message: errorMessage,
          };
        }
      };

      const result = yield* evaluatePage(conn, state, fetchCode, {
        url,
        method: options?.method,
        headers: options?.headers,
        body: options?.body,
        timeout: timeoutMs,
      });

      // Validate the result using Schema
      const fetchResult = yield* Schema.decodeUnknownEffect(FetchResult)(result).pipe(
        Effect.mapError(
          (issue) =>
            new CdpError({
              module: "CdpPage",
              method: "fetch",
              reason: new FetchError({
                url,
                description: `Invalid fetch response structure: ${String(issue)}`,
              }),
            }),
        ),
      );

      // Handle raw JavaScript error (syntax error in evaluated code)
      if (!("ok" in fetchResult)) {
        return yield* failFetch(
          url,
          fetchResult.message || "Unknown JavaScript error in fetch code",
        );
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
    }),
);
