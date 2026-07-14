/**
 * `browser-cdp` parity tests for page.request (APIRequestContext).
 *
 * Adapted from: repos/cloudflare-playwright/tests/library/browsercontext-fetch.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Key differences from upstream:
 *   - page.request is an HttpClient.HttpClient (Effect HTTP API)
 *   - Use response.json / response.text for body parsing (instance properties)
 *   - Use client.get(url) instead of context.request.get(url)
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   NOT_PLANNED — requires test infrastructure not available:
 *     - DNS override tests (__testHookLookup)
 *     - Proxy tests
 *     - HAR tests
 *     - SSL certificate tests
 *     - ignoreHTTPSErrors option
 *
 *   NOT_PLANNED — requires BrowserContext API (not in `browser-cdp`):
 *     - context.setHTTPCredentials()
 *     - context.storageState()
 *     - context.addCookies()
 *     - context.cookies()
 *
 *   NOT_PLANNED — requires Playwright-specific features:
 *     - failOnStatusCode option
 *     - params option (URLSearchParams)
 *     - multipart/form-data with file uploads
 *     - data option for request body
 *     - form option for URL-encoded forms
 *     - baseURL resolution
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Exit } from "effect";
import { HttpBody } from "effect/unstable/http";

import { getErrorMessage } from "@effect-libs/browser";
import { Cdp, CdpError, ConnectionError } from "@effect-libs/browser-cdp";

import { TestServerClient } from "../../../setup/http-server/Client.js";
import { assertDeepEqual, assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

/**
 * Helper to set cookies via CDP with proper error mapping.
 */
const setCookies = (
  page: CdpPageService,
  cookies: Array<{ name: string; value: string; domain: string; path: string; secure?: boolean }>,
) =>
  page.use((conn, sessionId) =>
    conn.cdp.Network.setCookies({ cookies }, sessionId).pipe(
      Effect.mapError(
        (cause: unknown) =>
          new CdpError({
            module: "test",
            method: "setCookies",
            reason: new ConnectionError({
              description: getErrorMessage(cause),
            }),
          }),
      ),
    ),
  );

/**
 * Helper to clear all cookies via CDP with proper error mapping.
 */
const clearCookies = (page: CdpPageService) =>
  page.use((conn, sessionId) =>
    conn.cdp.Network.clearBrowserCookies({}, sessionId).pipe(
      Effect.mapError(
        (cause: unknown) =>
          new CdpError({
            module: "test",
            method: "clearCookies",
            reason: new ConnectionError({
              description: getErrorMessage(cause),
            }),
          }),
      ),
    ),
  );

export const defineRequestTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe, beforeEach } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.request", () => {
    // Clear dynamic routes before each test to prevent route poisoning
    beforeEach(() => TestServerClient.clear(httpUrl).pipe(Effect.ignore));

    // ── P1: Basic GET request ──────────────────────────────────────────────
    // Upstream: it('get should work @smoke', async ({ context, server, mode }) => {
    //   const response = await context.request.get(server.PREFIX + '/simple.json');
    //   expect(response.url()).toBe(server.PREFIX + '/simple.json');
    //   expect(response.status()).toBe(200);
    //   expect(response.statusText()).toBe('OK');
    //   expect(response.ok()).toBeTruthy();
    //   expect(response.headers()['content-type']).toBe('application/json; charset=utf-8');
    //   expect(await response.text()).toBe('{"foo": "bar"}\n');
    // });

    test.live("browsercontext-fetch.spec.ts - get should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            const response = yield* page.request.get(`${httpUrl}/simple.json`);
            yield* assertEqual(response.status, 200);
            const text = yield* response.text;
            yield* assertEqual(text, '{"foo": "bar"}\n');
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P1: POST with body ─────────────────────────────────────────────────
    // Upstream: it('post should support post data', async ({ context, server }) => {
    //   const [request, response] = await Promise.all([
    //     server.waitForRequest('/simple.json'),
    //     context.request.post(`${server.PREFIX}/simple.json`, { data: 'My request' })
    //   ]);
    //   expect(request.method).toBe('POST');
    //   expect((await request.postBody).toString()).toBe('My request');
    //   expect(response.status()).toBe(200);
    // });

    test.live("browsercontext-fetch.spec.ts - post should support post data", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            // Set up server to capture request
            yield* TestServerClient.setRespondRoute(httpUrl, "/test", "OK");

            // Start waiting for the request
            const waitForReq = TestServerClient.waitForRequest(httpUrl, "/test");

            // Make the POST request with body
            const [serverReq, response] = yield* Effect.all(
              [
                waitForReq,
                page.request.post(`${httpUrl}/test`, { body: HttpBody.text("My request") }),
              ],
              { concurrency: 2 },
            );

            // Verify the request was received
            yield* assertTrue(serverReq.success);
            yield* assertEqual(response.status, 200);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P1: Custom headers ─────────────────────────────────────────────────
    // Upstream: it('should allow to override default headers', async ({ context, server, page }) => {
    //   const [request] = await Promise.all([
    //     server.waitForRequest('/empty.html'),
    //     context.request.get(server.EMPTY_PAGE, {
    //       headers: { 'User-Agent': 'Playwright', 'Accept': 'text/html', 'Accept-Encoding': 'br' }
    //     })
    //   ]);
    //   expect(request.headers['accept']).toBe('text/html');
    //   expect(request.headers['user-agent']).toBe('Playwright');
    //   expect(request.headers['accept-encoding']).toBe('br');
    // });

    test.live("browsercontext-fetch.spec.ts - should allow to override default headers", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            // Start waiting for the request
            const waitForReq = TestServerClient.waitForRequest(httpUrl, "/simple.json");

            // Make the request with custom headers
            const [serverReq, response] = yield* Effect.all(
              [
                waitForReq,
                page.request.get(`${httpUrl}/simple.json`, {
                  headers: {
                    "User-Agent": "Playwright",
                    Accept: "text/html",
                    "Accept-Encoding": "br",
                  },
                }),
              ],
              { concurrency: 2 },
            );

            // Verify the headers were sent
            yield* assertTrue(serverReq.success);
            yield* assertEqual(serverReq.headers?.accept, "text/html");
            yield* assertEqual(serverReq.headers?.["user-agent"], "Playwright");
            yield* assertEqual(serverReq.headers?.["accept-encoding"], "br");
            yield* assertEqual(response.status, 200);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P0: Cookie syncing - get cookies, send with request ────────────────
    // Upstream: it('should add session cookies to request', async ({ context, server }) => {
    //   await context.addCookies([{
    //     name: 'username', value: 'John Doe', domain: '.my.playwright.dev', path: '/',
    //     expires: -1, httpOnly: false, secure: false, sameSite: 'Lax',
    //   }]);
    //   const [req] = await Promise.all([
    //     server.waitForRequest('/simple.json'),
    //     context.request.get(`http://www.my.playwright.dev:${server.PORT}/simple.json`, { __testHookLookup } as any),
    //   ]);
    //   expect(req.headers.cookie).toEqual('username=John Doe');
    // });
    //
    // NOTE: We can't test DNS override (__testHookLookup), so we test with localhost.
    // Instead of context.addCookies, we use CDP Network.setCookies via page.use.

    test.live("browsercontext-fetch.spec.ts - should add cookies to request", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            // Clear any cookies from previous tests (test isolation)
            yield* clearCookies(page);

            // Set a cookie via CDP
            yield* setCookies(page, [
              {
                name: "session",
                value: "test123",
                domain: "localhost",
                path: "/",
              },
            ]);

            // Start waiting for the request
            const waitForReq = TestServerClient.waitForRequest(httpUrl, "/simple.json");

            // Make the request - cookie should be sent
            const [serverReq, response] = yield* Effect.all(
              [waitForReq, page.request.get(`${httpUrl}/simple.json`)],
              { concurrency: 2 },
            );

            // Verify cookie was sent
            yield* assertTrue(serverReq.success);
            yield* assertEqual(serverReq.headers?.cookie, "session=test123");
            yield* assertEqual(response.status, 200);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P0: Set-Cookie response - parse and sync back ──────────────────────
    // Upstream: it('should add cookies from Set-Cookie header', async ({ context, page, server }) => {
    //   server.setRoute('/setcookie.html', (req, res) => {
    //     res.setHeader('Set-Cookie', ['session=value', 'foo=bar; max-age=3600']);
    //     res.end();
    //   });
    //   await context.request.get(server.PREFIX + '/setcookie.html');
    //   const cookies = await context.cookies();
    //   expect(new Set(cookies.map(c => ({ name: c.name, value: c.value })))).toEqual(new Set([
    //     { name: 'session', value: 'value' },
    //     { name: 'foo', value: 'bar' },
    //   ]));
    // });
    //
    // NOTE: TestServerClient doesn't support Set-Cookie headers directly,
    // so we test the round-trip by setting cookies via CDP and verifying
    // they are sent with subsequent requests.

    test.live("browsercontext-fetch.spec.ts - should send cookies from browser context", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            // Set cookies via CDP (simulating Set-Cookie from a response)
            yield* setCookies(page, [
              { name: "session", value: "value", domain: "localhost", path: "/" },
              { name: "foo", value: "bar", domain: "localhost", path: "/" },
            ]);

            // Verify cookies are sent with subsequent request
            yield* TestServerClient.setRespondRoute(httpUrl, "/test", "OK");
            const waitForReq = TestServerClient.waitForRequest(httpUrl, "/test");
            const [serverReq] = yield* Effect.all(
              [waitForReq, page.request.get(`${httpUrl}/test`)],
              { concurrency: 2 },
            );

            // Both cookies should be sent
            yield* assertTrue(serverReq.success);
            const cookieHeader = serverReq.headers?.cookie ?? "";
            yield* assertTrue(cookieHeader.includes("session=value"));
            yield* assertTrue(cookieHeader.includes("foo=bar"));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P2: Cookie path matching ───────────────────────────────────────────
    // Test that cookies are only sent to matching paths

    test.live("browsercontext-fetch.spec.ts - should filter cookies by path", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            // Set cookies with different paths
            yield* setCookies(page, [
              { name: "root", value: "1", domain: "localhost", path: "/" },
              { name: "api", value: "2", domain: "localhost", path: "/api" },
              { name: "other", value: "3", domain: "localhost", path: "/other" },
            ]);

            // Request to /api should only get root and api cookies
            yield* TestServerClient.setRespondRoute(httpUrl, "/api/data", "OK");
            const waitForReq = TestServerClient.waitForRequest(httpUrl, "/api/data");

            const [serverReq] = yield* Effect.all(
              [waitForReq, page.request.get(`${httpUrl}/api/data`)],
              { concurrency: 2 },
            );

            yield* assertTrue(serverReq.success);
            const cookieHeader = serverReq.headers?.cookie ?? "";
            yield* assertTrue(cookieHeader.includes("root=1"));
            yield* assertTrue(cookieHeader.includes("api=2"));
            yield* assertTrue(!cookieHeader.includes("other=3"));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P2: Secure cookies - only sent to HTTPS ─────────────────────────────
    // Upstream: secure cookies are only sent over HTTPS
    // NOTE: We test the opposite - secure cookies should NOT be sent over HTTP

    test.live("browsercontext-fetch.spec.ts - should not send secure cookies over http", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            // Set a secure cookie
            yield* setCookies(page, [
              { name: "secure", value: "secret", domain: "localhost", path: "/", secure: true },
              { name: "insecure", value: "public", domain: "localhost", path: "/", secure: false },
            ]);

            // Request over HTTP (not HTTPS)
            yield* TestServerClient.setRespondRoute(httpUrl, "/test", "OK");
            const waitForReq = TestServerClient.waitForRequest(httpUrl, "/test");
            const [serverReq] = yield* Effect.all(
              [waitForReq, page.request.get(`${httpUrl}/test`)],
              { concurrency: 2 },
            );

            // Only insecure cookie should be sent
            yield* assertTrue(serverReq.success);
            const cookieHeader = serverReq.headers?.cookie ?? "";
            yield* assertTrue(!cookieHeader.includes("secure=secret"));
            yield* assertTrue(cookieHeader.includes("insecure=public"));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Should follow redirects ────────────────────────────────────────────
    // Upstream: it('should follow redirects', async ({ context, server }) => {
    //   server.setRedirect('/redirect1', '/redirect2');
    //   server.setRedirect('/redirect2', '/simple.json');
    //   ...
    // });

    test.live("browsercontext-fetch.spec.ts - should follow redirects", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            // Set up redirect chain
            yield* TestServerClient.setRedirectRoute(httpUrl, "/redirect1", "/redirect2");
            yield* TestServerClient.setRedirectRoute(httpUrl, "/redirect2", "/simple.json");

            // Make request to first redirect
            const response = yield* page.request.get(`${httpUrl}/redirect1`);

            // Should end up at final destination
            yield* assertEqual(response.status, 200);
            const text = yield* response.text;
            yield* assertEqual(text, '{"foo": "bar"}\n');

            yield* TestServerClient.clear(httpUrl);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P3: Network error handling ─────────────────────────────────────────
    // Upstream: it('should throw on network error', async ({ context, server }) => {
    //   server.setRoute('/test', (req, res) => { req.socket.destroy(); });
    //   const error = await context.request.get(server.PREFIX + '/test').catch(e => e);
    //   expect(error.message).toContain('apiRequestContext.get: socket hang up');
    // });
    //
    // NOTE: We can't easily test socket destruction with TestServerClient,
    // so we test with a non-existent host instead.

    test.live("browsercontext-fetch.spec.ts - should throw on network error", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            // Request to a non-routable IP should fail
            const exit = yield* page.request
              .get("http://10.255.255.1/test")
              .pipe(Effect.timeout("5 seconds"), Effect.exit);

            // Should be a failure (either timeout or network error)
            yield* assertTrue(Exit.isFailure(exit));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Response body methods ──────────────────────────────────────────────
    // Test various response body parsing methods

    test.live("browsercontext-fetch.spec.ts - should parse json response", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            const response = yield* page.request.get(`${httpUrl}/simple.json`);
            yield* assertEqual(response.status, 200);

            const json = yield* response.json;
            yield* assertDeepEqual(json, { foo: "bar" });
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Different HTTP methods ─────────────────────────────────────────────

    test.live("browsercontext-fetch.spec.ts - delete should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            yield* TestServerClient.setRespondRoute(httpUrl, "/test", "OK");

            const waitForReq = TestServerClient.waitForRequest(httpUrl, "/test");
            const [serverReq, response] = yield* Effect.all(
              [waitForReq, page.request.del(`${httpUrl}/test`)],
              { concurrency: 2 },
            );

            yield* assertTrue(serverReq.success);
            yield* assertEqual(response.status, 200);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("browsercontext-fetch.spec.ts - put should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            yield* TestServerClient.setRespondRoute(httpUrl, "/test", "OK");

            const waitForReq = TestServerClient.waitForRequest(httpUrl, "/test");
            const [serverReq, response] = yield* Effect.all(
              [waitForReq, page.request.put(`${httpUrl}/test`, { body: HttpBody.text("data") })],
              { concurrency: 2 },
            );

            yield* assertTrue(serverReq.success);
            yield* assertEqual(response.status, 200);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("browsercontext-fetch.spec.ts - patch should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            yield* TestServerClient.setRespondRoute(httpUrl, "/test", "OK");

            const waitForReq = TestServerClient.waitForRequest(httpUrl, "/test");
            const [serverReq, response] = yield* Effect.all(
              [waitForReq, page.request.patch(`${httpUrl}/test`, { body: HttpBody.text("data") })],
              { concurrency: 2 },
            );

            yield* assertTrue(serverReq.success);
            yield* assertEqual(response.status, 200);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("browsercontext-fetch.spec.ts - head should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);

            const response = yield* page.request.head(`${httpUrl}/simple.json`);
            yield* assertEqual(response.status, 200);
            // HEAD response should have empty body
            const text = yield* response.text;
            yield* assertEqual(text, "");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
