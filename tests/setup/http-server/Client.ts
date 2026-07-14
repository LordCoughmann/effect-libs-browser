/**
 * Client helpers for tests to control the HTTP server via admin endpoints.
 *
 * @example
 * ```typescript
 * // In a test:
 * const { httpUrl } = config;
 *
 * // Register a hanging route
 * yield* TestServerClient.setHangRoute(httpUrl, "/style.css");
 *
 * // Wait for request + release in parallel with navigation
 * const fiber = yield* Effect.forkChild(
 *   TestServerClient.waitForRequest(httpUrl, "/style.css")
 *     .pipe(Effect.zipRight(TestServerClient.release(httpUrl, "/style.css")))
 * );
 *
 * // Trigger navigation that loads /style.css
 * yield* page.goto(`${httpUrl}/one-style`);
 *
 * // Wait for the hang to be released
 * yield* fiber;
 * ```
 *
 * @module tests/setup/http-server/Client
 */

import { Effect, Schema } from "effect";

/** HTTP port for the test server. Uncommon range to avoid colliding with dev servers on 3000/8000/8080. */
export const HTTP_PORT = 9322;

/** HTTPS port for the test server (HTTP_PORT + 443, mirroring the standard HTTPS-port semantic). */
export const HTTPS_PORT = HTTP_PORT + 443;

/**
 * WebSocket port for the test server's separate WebSocket handler.
 *
 * The WebSocket server is intentionally on a separate port from the HTTP
 * server. The Effect HTTP API's request handler (mounted on the HTTP
 * server) responds to upgrade requests with 200, which conflicts with
 * our 101 response. A separate port gives the WebSocket handler a clean
 * `http.createServer()` with no other listeners.
 */
export const WS_PORT = HTTP_PORT + 1;

/** Cross-origin prefix using 127.0.0.1 (vs localhost) to trigger cross-process navigation. */
export const CROSS_PROCESS_PREFIX = `http://127.0.0.1:${HTTP_PORT}`;

/** HTTPS cross-origin prefix using 127.0.0.1. */
export const HTTPS_CROSS_PROCESS_PREFIX = `https://127.0.0.1:${HTTPS_PORT}`;

// ── Client Error ────────────────────────────────────────────────────────────

class TestServerError extends Schema.TaggedErrorClass<TestServerError>()(
  "tests/setup/TestServerError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `${this.operation} failed`;
  }
}

// ── Client Helpers ──────────────────────────────────────────────────────────

function adminFetch<T = unknown>(
  httpUrl: string,
  endpoint: string,
  payload: unknown,
  operation: string,
) {
  return Effect.tryPromise({
    try: () =>
      fetch(`${httpUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json()) as Promise<T>,
    catch: (cause) => new TestServerError({ operation, cause }),
  });
}

/**
 * Helper functions for tests to control the server via HTTP.
 */
export const TestServerClient = {
  /**
   * Register a hanging route (response won't complete until released).
   * Equivalent to Playwright's `server.setRoute(path, (req, res) => {})`.
   */
  setHangRoute: (httpUrl: string, path: string) =>
    adminFetch(httpUrl, "/__admin/route", { path, action: "hang" }, "setHangRoute"),

  /**
   * Register a delayed route.
   */
  setDelayRoute: (httpUrl: string, path: string, delayMs: number, body?: string) =>
    adminFetch(
      httpUrl,
      "/__admin/route",
      { path, action: "delay", delayMs, body },
      "setDelayRoute",
    ),

  /**
   * Register a custom response route with optional status and content type.
   * Equivalent to Playwright's `server.setRoute(path, (req, res) => { res.writeHead(status); res.end(body) })`.
   */
  setRespondRoute: (
    httpUrl: string,
    path: string,
    body: string,
    status?: number,
    contentType?: string,
  ) =>
    adminFetch(
      httpUrl,
      "/__admin/route",
      { path, action: "respond", body, status, contentType },
      "setRespondRoute",
    ),

  /**
   * Set Content-Security-Policy header for a path.
   * Equivalent to Playwright's `server.setCSP(path, policy)`.
   */
  setCSP: (httpUrl: string, path: string, policy: string) =>
    adminFetch(httpUrl, "/__admin/csp", { path, policy }, "setCSP"),

  /**
   * Register a redirect route (302 redirect to another path).
   * Equivalent to Playwright's `server.setRedirect(from, to)`.
   */
  setRedirectRoute: (httpUrl: string, from: string, to: string) =>
    adminFetch(
      httpUrl,
      "/__admin/route",
      { path: from, action: "redirect", redirectUrl: to },
      "setRedirectRoute",
    ),

  /**
   * Wait for a request to arrive at a path.
   * Equivalent to Playwright's `server.waitForRequest(path)`.
   * Returns the request headers if available.
   */
  waitForRequest: (httpUrl: string, path: string) =>
    adminFetch<{
      success: boolean;
      message?: string;
      headers?: Record<string, string>;
    }>(httpUrl, "/__admin/wait", { path }, "waitForRequest"),

  /**
   * Release a hanging response.
   * Equivalent to Playwright's `res.end()` after `server.setRoute`.
   */
  release: (httpUrl: string, path: string, body?: string) =>
    adminFetch(httpUrl, "/__admin/release", { path, body }, "release"),

  /**
   * Clear all dynamic routes.
   */
  clear: (httpUrl: string) => adminFetch(httpUrl, "/__admin/clear", null, "clear"),
};
