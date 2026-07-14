/**
 * Parity tests for `browser-cdp` page.waitForURL() - aligned with Playwright's page-wait-for-url.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-wait-for-url.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover:
 * - Waiting for URL after JS-triggered navigation
 * - Timeout when URL never matches
 * - waitUntil options (domcontentloaded, load, commit)
 * - History API navigations (pushState, replaceState, back/forward)
 * - URL matching with globs and regex
 *
 * Key differences from upstream:
 *   - `browser-cdp` waitForURL is a thin wrapper around waitForNavigation with required URL pattern
 *   - Fiber-based concurrency instead of Promise.all
 *   - page.url is an Effect property, not a method
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   None — all tests adapted or have equivalent implementations.
 *
 *   domcontentloaded + load simultaneous (requires hanging response + precise timing):
 *     - "should work with both domcontentloaded and load"
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Duration, Effect, Fiber, Result } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { TestServerClient } from "../../../setup/http-server/Client.js";
import { assertContains, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineWaitForURLTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe, beforeEach } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.waitForURL parity", () => {
    // Clear dynamic routes before each test to prevent route poisoning
    beforeEach(() => TestServerClient.clear(httpUrl).pipe(Effect.ignore));

    // ── "should work" ────────────────────────────────────────────────────
    // Upstream: it('should work')

    test.live("page-wait-for-url.spec.ts - should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const waitForUrl = page.waitForURL("**/grid");
            yield* page.evaluate((url: string) => {
              window.location.href = url;
            }, `${httpUrl}/grid`);
            yield* waitForUrl;
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should respect timeout" ─────────────────────────────────────────
    // Upstream: it('should respect timeout')

    test.live("page-wait-for-url.spec.ts - should respect timeout", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const result = yield* Effect.result(
              Effect.gen(function* () {
                const waitForUrl = page.waitForURL("**/frame.html", {
                  timeout: Duration.millis(2500),
                });
                yield* waitForUrl;
              }),
            );
            yield* assertTrue(Result.isFailure(result));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with history.pushState()" ───────────────────────────
    // Upstream: it('should work with history.pushState()')

    test.live("page-wait-for-url.spec.ts - should work with history.pushState()", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`
              <a onclick='javascript:pushState()'>SPA</a>
              <script>
                function pushState() { history.pushState({}, '', 'wow.html') }
              </script>
            `);
            const waitForUrl = page.waitForURL("**/wow.html");
            yield* page.click("a");
            yield* waitForUrl;
            const url = yield* page.url;
            yield* assertContains(url, "/wow.html");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with history.replaceState()" ────────────────────────
    // Upstream: it('should work with history.replaceState()')

    test.live("page-wait-for-url.spec.ts - should work with history.replaceState()", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`
              <a onclick='javascript:replaceState()'>SPA</a>
              <script>
                function replaceState() { history.replaceState({}, '', '/replaced.html') }
              </script>
            `);
            const waitForUrl = page.waitForURL("**/replaced.html");
            yield* page.click("a");
            yield* waitForUrl;
            const url = yield* page.url;
            yield* assertContains(url, "/replaced.html");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with DOM history.back()/history.forward()" ──────────
    // Upstream: it('should work with DOM history.back()/history.forward()')

    test.live(
      "page-wait-for-url.spec.ts - should work with DOM history.back()/history.forward()",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`
              <a id=back onclick='javascript:goBack()'>back</a>
              <a id=forward onclick='javascript:goForward()'>forward</a>
              <script>
                function goBack() { history.back(); }
                function goForward() { history.forward(); }
                history.pushState({}, '', '/first.html');
                history.pushState({}, '', '/second.html');
              </script>
            `);
              const url = yield* page.url;
              yield* assertContains(url, "/second.html");

              // Go back to first.html
              const waitBack = page.waitForURL("**/first.html");
              yield* page.click("a#back");
              yield* waitBack;
              const urlAfterBack = yield* page.url;
              yield* assertContains(urlAfterBack, "/first.html");

              // Go forward to second.html
              const waitForward = page.waitForURL("**/second.html");
              yield* page.click("a#forward");
              yield* waitForward;
              const urlAfterForward = yield* page.url;
              yield* assertContains(urlAfterForward, "/second.html");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with url match for same document navigations" ───────
    // Upstream: it('should work with url match for same document navigations')

    test.live(
      "page-wait-for-url.spec.ts - should work with url match for same document navigations",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // Set up waitForURL with regex before pushing states
              const waitForUrl = page.waitForURL(/third\.html/);
              yield* page.evaluate(() => {
                history.pushState({}, "", "/first.html");
              });
              yield* page.evaluate(() => {
                history.pushState({}, "", "/second.html");
              });
              yield* page.evaluate(() => {
                history.pushState({}, "", "/third.html");
              });
              yield* waitForUrl;
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with both domcontentloaded and load" ──────────────
    // Upstream: it('should work with both domcontentloaded and load')
    // Tests that domcontentloaded fires before load when CSS is still loading.

    test.live("page-wait-for-url.spec.ts - should work with both domcontentloaded and load", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Set up a hanging route for CSS
            yield* TestServerClient.setHangRoute(httpUrl, "/one-style.css");

            // Start navigation to page that loads the CSS
            const navFiber = yield* Effect.forkChild(page.goto(`${httpUrl}/one-style`));

            // Wait for the CSS request to arrive
            yield* TestServerClient.waitForRequest(httpUrl, "/one-style.css");

            // Start waitForURL with domcontentloaded
            const domContentLoadedPromise = page.waitForURL("**/one-style", {
              waitUntil: "domcontentloaded",
            });

            // Start waitForURL with load
            let bothFired = false;
            const bothFiredPromise = Effect.all(
              [page.waitForURL("**/one-style", { waitUntil: "load" }), domContentLoadedPromise],
              { concurrency: "unbounded" },
            ).pipe(Effect.tap(() => Effect.sync(() => (bothFired = true))));

            // Fork the bothFiredPromise
            const bothFiber = yield* Effect.forkChild(bothFiredPromise);

            // Give it a moment
            yield* Effect.sleep("100 millis");

            // domcontentloaded should have resolved, but bothFired should still be false
            // (load is waiting for CSS)
            yield* assertTrue(!bothFired);

            // Release the CSS
            yield* TestServerClient.release(httpUrl, "/one-style.css");

            // Now both should resolve
            yield* Fiber.join(bothFiber);
            yield* Fiber.join(navFiber);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with commit" ───────────────────────────────────────
    // Upstream: it('should work with commit')
    // Tests that commit fires when document starts loading, before resources.

    test.live("page-wait-for-url.spec.ts - should work with commit", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Set up a hanging route for script.js
            yield* TestServerClient.setHangRoute(httpUrl, "/script.js");

            // Set up a route for empty.html that includes the script
            yield* TestServerClient.setRespondRoute(
              httpUrl,
              "/empty.html",
              '<title>Hello</title><script src="script.js"></script>',
              200,
              "text/html",
            );

            // Navigate (will hang on script.js)
            yield* Effect.forkChild(page.goto(`${httpUrl}/empty.html`));

            // Wait for URL with commit — should resolve even though script is hanging
            yield* page.waitForURL("**/empty.html", { waitUntil: "commit" });

            // Title should already be available (document parsed but script still loading)
            const title = yield* page.title;
            yield* assertContains(title, "Hello");

            // Clean up
            yield* TestServerClient.release(httpUrl, "/script.js");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with commit and about:blank" ────────────────────────
    // Upstream: it('should work with commit and about:blank')
    // Tests that waitForURL resolves immediately when already at matching URL with commit.
    // Playwright pages start at about:blank, but our CDP pages connect to existing pages.
    // We navigate to about:blank first, then verify waitForURL resolves immediately.

    test.live("page-wait-for-url.spec.ts - should work with commit and about:blank", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to about:blank first (Playwright pages start here by default)
            yield* page.goto("about:blank");
            // Now waitForURL should resolve immediately since we're already at about:blank
            // and commit has fired during the goto
            yield* page.waitForURL("about:blank", { waitUntil: "commit" });
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work on frame" ────────────────────────────────────────
    // Upstream: it('should work on frame')
    // Uses frame.waitForURL — we use frame.waitForNavigation({ url: ... })
    // which provides equivalent functionality.

    test.live("page-wait-for-url.spec.ts - should work on frame", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/frames/one-frame.html`);
            const frames = yield* page.frames;
            const frame = frames[1];
            // Use waitForNavigation with url option (equivalent to waitForURL)
            const waitForUrl = frame.waitForNavigation({ url: "**/grid.html" });
            yield* frame.evaluate((url: string) => {
              window.location.href = url;
            }, `${httpUrl}/grid.html`);
            yield* waitForUrl;
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with clicking on anchor links" ──────────────────────
    // Upstream: it('should work with clicking on anchor links')

    test.live("page-wait-for-url.spec.ts - should work with clicking on anchor links", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<a href='#foobar'>foobar</a>`);
            const waitForUrl = page.waitForURL("**/*#foobar");
            yield* page.click("a");
            yield* waitForUrl;
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
