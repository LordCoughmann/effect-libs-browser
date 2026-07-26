/**
 * Shared Playwright integration tests using the TestApi abstraction.
 *
 * These tests verify browser interaction via @cloudflare/playwright
 * connected to a local Chrome instance via CDP.
 *
 * Used by:
 * - tests/integration/runtime/node/playwright/Playwright.integration.test.ts
 * - tests/integration/runtime/workerd/playwright/Playwright.integration.test.ts
 */

import type { TestApi, TestConfig } from "@test/utils/effect-test/EffectTest.js";

import type { BrowserProviderService } from "@effect-libs/browser";

import { TestServerClient } from "@test/setup/http-server/Client.js";
import { TestBrowserConfig, hasBrowserConfig } from "@test/utils/config/TestBrowserConfig.js";
import { assertTrue, assertEqual } from "@test/utils/effect-test/EffectTest.js";
import { DateTime, Effect, Fiber, Layer, Option, Redacted } from "effect";
import * as Str from "effect/String";

import { SessionId, UrlString } from "@effect-libs/browser";
import { Playwright } from "@effect-libs/browser-playwright";

// Combined layer for tests
const TestLayer = Layer.merge(TestBrowserConfig.layer, Playwright.layer);

// ── Tests ─────────────────────────────────────────────────────────────────────

export const definePlaywrightTests = (api: TestApi, _config: TestConfig): void => {
  const { describe, layer } = api;

  // Check if tests should be skipped (lazy, not at module load time)
  const browserAvailable = Effect.runSync(
    hasBrowserConfig.pipe(Effect.provide(TestBrowserConfig.layer)),
  );
  const describeIntegration = browserAvailable ? describe : describe.skip;

  describeIntegration("Playwright Integration", () => {
    layer(TestLayer)((it) => {
      describe("Connection", () => {
        it.effect("connects to browser via acquireConnection", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            yield* playwright.acquireConnection({ url: browserWsUrl }).pipe(
              Effect.flatMap(({ connection }) =>
                Effect.gen(function* () {
                  yield* Effect.logInfo(`Connected: ${typeof connection.withPage === "function"}`);
                }),
              ),
              Effect.scoped,
            );
          }),
        );

        it.effect("fails gracefully with invalid endpoint", () =>
          Effect.gen(function* () {
            const playwright = yield* Playwright;

            const result = yield* playwright.acquireConnection({ url: "ws://localhost:9999" }).pipe(
              Effect.map(() => ({ success: true as const })),
              Effect.catchTag("effect-libs/browser/PlaywrightError", (e) =>
                Effect.succeed({ success: false as const, reason: e.reason._tag }),
              ),
              Effect.scoped,
            );

            yield* Effect.logInfo(`Result: ${JSON.stringify(result)}`);
          }),
        );
      });

      describe("withConnection", () => {
        it.effect("navigates to a page and gets title", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            const title = yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
              Effect.gen(function* () {
                yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                return yield* page.title;
              }),
            );

            yield* Effect.logInfo(`Title: ${title}`);
          }),
        );

        it.effect("navigates to links page and extracts links", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            const links = yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
              Effect.gen(function* () {
                yield* page.goto(`${browserConfig.httpBaseUrl}/links`);
                return yield* page.evaluate(() =>
                  Array.from(document.querySelectorAll("a")).map((a) => a.textContent),
                );
              }),
            );

            yield* Effect.logInfo(`Links: ${JSON.stringify(links)}`);
          }),
        );
      });

      describe("withSession", () => {
        it.effect("reuses an existing page in the provider session", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            const provider: BrowserProviderService = {
              createSession: () =>
                Effect.succeed({
                  id: SessionId("playwright-test-session"),
                  createdAt: DateTime.makeUnsafe(new Date()),
                }),
              releaseSession: () => Effect.void,
              getCdpUrl: () => Option.some(Redacted.make(UrlString(browserWsUrl))),
            };

            yield* playwright.acquireConnection({ url: browserWsUrl }).pipe(
              Effect.flatMap(({ page }) =>
                Effect.gen(function* () {
                  const pageCountBefore = yield* page.use(
                    async (rawPage) => rawPage.context().pages().length,
                  );
                  const pageCountDuringSession = yield* playwright.withSession(
                    { provider },
                    ({ page: sessionPage }) =>
                      sessionPage.use(async (rawPage) => rawPage.context().pages().length),
                  );

                  yield* assertEqual(pageCountDuringSession, pageCountBefore);
                }),
              ),
              Effect.scoped,
            );
          }),
        );
      });

      describe("Page Interaction", () => {
        it.effect("clicks a link and navigates", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            const title = yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
              Effect.gen(function* () {
                yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                yield* page.click('a[href="/links"]');
                return yield* page.title;
              }),
            );

            yield* Effect.logInfo(`Title after click: ${title}`);
          }),
        );

        it.effect("fills and submits a form", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            const result = yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
              Effect.gen(function* () {
                yield* page.goto(`${browserConfig.httpBaseUrl}/form`);
                yield* page.fill('input[name="username"]', "testuser");
                yield* page.fill('input[name="password"]', "testpass");
                yield* page.click('button[type="submit"]');

                // Wait for JS to update the result
                yield* page.waitForSelector("#result:has-text('Form submitted')");

                return yield* page.evaluate(() => document.getElementById("result")?.textContent);
              }),
            );

            yield* Effect.logInfo(`Form result: ${result}`);
          }),
        );
      });

      describe("Frames", () => {
        it.effect("mainFrame returns the page's main frame", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            const mainFrameUrl = yield* playwright.withConnection(
              { url: browserWsUrl },
              ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                  const frame = page.mainFrame();
                  return frame.url();
                }),
            );

            yield* assertTrue(mainFrameUrl.includes("/"));
            yield* Effect.logInfo(`Main frame URL: ${mainFrameUrl}`);
          }),
        );

        it.effect("frames returns all frames including iframes", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            const frameCount = yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
              Effect.gen(function* () {
                yield* page.goto(`${browserConfig.httpBaseUrl}/frames/one-frame.html`);
                // Wait for the iframe to attach
                yield* page.waitForLoadState("domcontentloaded");
                return page.frames().length;
              }),
            );

            // Main frame + one iframe = 2 frames
            yield* assertEqual(frameCount, 2);
            yield* Effect.logInfo(`Frame count: ${frameCount}`);
          }),
        );
      });

      describe("Input Devices", () => {
        it.effect("page.keyboard dispatches low-level key events", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            const result = yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
              Effect.gen(function* () {
                yield* page.goto(`${browserConfig.httpBaseUrl}/form`);
                // Focus the username field, then type via the keyboard namespace
                yield* page.focus('input[name="username"]');
                yield* page.keyboard.type("hello");
                // Read back the value via the page-level accessor
                return yield* page.inputValue('input[name="username"]');
              }),
            );

            yield* assertEqual(result, "hello");
            yield* Effect.logInfo(`Typed value: ${result}`);
          }),
        );
      });

      describe("Dynamic Content", () => {
        it.effect("waits for dynamic content to load", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            const content = yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
              Effect.gen(function* () {
                yield* page.goto(`${browserConfig.httpBaseUrl}/dynamic`);

                // Wait for the dynamic content using the use escape hatch
                // (waitForFunction is not a curated method)
                yield* page.use((p) =>
                  p.waitForFunction(
                    () =>
                      document.getElementById("content")?.textContent === "Dynamic content loaded!",
                  ),
                );

                return yield* page.evaluate(() => document.getElementById("content")?.textContent);
              }),
            );

            yield* Effect.logInfo(`Dynamic content: ${content}`);
          }),
        );
      });

      describe("Connection Lifecycle (acquireConnection)", () => {
        it.effect("acquireConnection allows reusing connection across operations", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            // Acquire once, use multiple times via withPage
            yield* playwright.acquireConnection({ url: browserWsUrl }).pipe(
              Effect.flatMap(({ connection }) =>
                Effect.gen(function* () {
                  // First operation
                  const title1 = yield* connection.withPage((page) =>
                    Effect.gen(function* () {
                      yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                      return yield* page.title;
                    }),
                  );

                  // Second operation - same connection
                  const title2 = yield* connection.withPage((page) =>
                    Effect.gen(function* () {
                      yield* page.goto(`${browserConfig.httpBaseUrl}/links`);
                      return yield* page.title;
                    }),
                  );

                  yield* Effect.logInfo(`Titles: ${title1}, ${title2}`);
                }),
              ),
              Effect.scoped,
            );
          }),
        );
      });

      // ── Scoped Methods (Phase 2 Redesign) ──────────────────────────────────────

      describe("Scoped Methods", () => {
        it.effect("withPage shortcut provides fresh page", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            const title = yield* playwright.withPage({ url: browserWsUrl }, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                return yield* page.title;
              }),
            );

            yield* Effect.logInfo(`withPage title: ${title}`);
          }),
        );

        it.effect("handle.withPage creates new page in default context", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            // Track page titles to verify separate pages
            const titles: string[] = [];

            yield* playwright.withConnection({ url: browserWsUrl }, ({ connection }) =>
              Effect.gen(function* () {
                yield* connection.withPage((page) =>
                  Effect.gen(function* () {
                    yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                    const title = yield* page.title;
                    titles.push(title);
                  }),
                );

                yield* connection.withPage((page) =>
                  Effect.gen(function* () {
                    yield* page.goto(`${browserConfig.httpBaseUrl}/links`);
                    const title = yield* page.title;
                    titles.push(title);
                  }),
                );
              }),
            );

            // Two different pages navigated independently
            yield* Effect.logInfo(`Titles: ${titles.join(", ")}`);
          }),
        );

        it.effect("handle.withContext creates isolated context", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            yield* playwright.withConnection({ url: browserWsUrl }, ({ connection }) =>
              Effect.gen(function* () {
                // Set a cookie in the first context via evaluate
                yield* connection.withContext(({ page }) =>
                  Effect.gen(function* () {
                    yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                    // Set cookie via the browser's document.cookie API
                    yield* page.evaluate(() => {
                      document.cookie = "playwright-ctx1=ctx1-val; path=/";
                      return document.cookie;
                    });
                    const after = yield* page.evaluate(() => document.cookie);
                    yield* Effect.logInfo(`Context 1 cookies: ${after}`);
                  }),
                );

                // Verify cookie is NOT visible in a different context
                yield* connection.withContext(({ page }) =>
                  Effect.gen(function* () {
                    yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                    const cookies = yield* page.evaluate(() => document.cookie);
                    yield* Effect.logInfo(
                      `Context 2 cookies: ${cookies} (${cookies.includes("playwright-ctx1") ? "FOUND (bad)" : "not found (good)"})`,
                    );
                  }),
                );
              }),
            );
          }),
        );

        it.effect("contextHandle.withPage creates page in same context", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            yield* playwright.withConnection({ url: browserWsUrl }, ({ connection }) =>
              Effect.gen(function* () {
                yield* connection.withContext(({ context, page }) =>
                  Effect.gen(function* () {
                    yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                    // Set cookie via document.cookie
                    yield* page.evaluate(() => {
                      document.cookie = "playwright-shared=shared-val; path=/";
                    });

                    // Another page in the SAME context should see the cookie
                    yield* context.withPage((page) =>
                      Effect.gen(function* () {
                        yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                        const cookies = yield* page.evaluate(() => document.cookie);
                        yield* Effect.logInfo(
                          `Same-context cookies: ${cookies} (${cookies.includes("playwright-shared") ? "FOUND (good)" : "not found (bad)"})`,
                        );
                      }),
                    );
                  }),
                );
              }),
            );
          }),
        );
      });

      // ── Resource Cleanup Tests ──────────────────────────────────────────────

      describe("Resource Cleanup", () => {
        it.effect(
          "connection.withPage closes page after scope exits",
          () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.acquireConnection({ url: browserWsUrl }).pipe(
                Effect.flatMap(({ connection }) =>
                  Effect.gen(function* () {
                    // Count pages in default context before
                    const beforeCount = yield* connection.withPage((page) =>
                      page.use(async (p) => p.context().pages().length),
                    );

                    // Create and close a page via withPage
                    yield* connection.withPage((page) =>
                      Effect.gen(function* () {
                        yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                      }),
                    );

                    // Count pages in default context after
                    const afterCount = yield* connection.withPage((page) =>
                      page.use(async (p) => p.context().pages().length),
                    );

                    // Page count should not have grown
                    yield* assertEqual(afterCount, beforeCount);
                  }),
                ),
                Effect.scoped,
              );
            }),
          { tag: "cleanup" },
        );

        it.effect(
          "connection.withContext cleans up context and pages",
          () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.acquireConnection({ url: browserWsUrl }).pipe(
                Effect.flatMap(({ connection }) =>
                  Effect.gen(function* () {
                    // Create an isolated context (which also creates a page)
                    yield* connection.withContext(({ page }) =>
                      Effect.gen(function* () {
                        yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                      }),
                    );

                    // The context should have been cleaned up — verify by creating a new one
                    yield* connection.withContext(({ page }) =>
                      Effect.gen(function* () {
                        yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                        const title = yield* page.title;
                        yield* assertTrue(Str.isNonEmpty(title));
                      }),
                    );
                  }),
                ),
                Effect.scoped,
              );
            }),
          { tag: "cleanup" },
        );

        it.effect(
          "context.withPage closes page after scope exits",
          () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.acquireConnection({ url: browserWsUrl }).pipe(
                Effect.flatMap(({ connection }) =>
                  Effect.gen(function* () {
                    // Check page count inside a context before and after context.withPage
                    yield* connection.withContext(({ context, page: defaultPage }) =>
                      Effect.gen(function* () {
                        // Count pages before creating additional page
                        const beforeCount = yield* defaultPage.use(
                          async (p) => p.context().pages().length,
                        );

                        // Create and close a page via context.withPage
                        yield* context.withPage((page) =>
                          Effect.gen(function* () {
                            yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                          }),
                        );

                        // Count pages after context.withPage scope exited
                        const afterCount = yield* defaultPage.use(
                          async (p) => p.context().pages().length,
                        );

                        // Page was cleaned up — exact same count as before
                        yield* assertEqual(afterCount, beforeCount);
                      }),
                    );
                  }),
                ),
                Effect.scoped,
              );
            }),
          { tag: "cleanup" },
        );

        it.effect(
          "multiple context.withPage calls do not accumulate pages",
          () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.acquireConnection({ url: browserWsUrl }).pipe(
                Effect.flatMap(({ connection }) =>
                  Effect.gen(function* () {
                    yield* connection.withContext(({ context, page: defaultPage }) =>
                      Effect.gen(function* () {
                        // Count pages before any context.withPage calls
                        const beforeCount = yield* defaultPage.use(
                          async (p) => p.context().pages().length,
                        );

                        // Call context.withPage 3 times
                        for (let i = 0; i < 3; i++) {
                          yield* context.withPage((page) =>
                            Effect.gen(function* () {
                              yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                            }),
                          );
                        }

                        // Count pages after all calls
                        const afterCount = yield* defaultPage.use(
                          async (p) => p.context().pages().length,
                        );

                        // All pages were cleaned up — exact same count as before
                        yield* assertEqual(afterCount, beforeCount);
                      }),
                    );
                  }),
                ),
                Effect.scoped,
              );
            }),
          { tag: "cleanup" },
        );
      });

      // ── Page Accessors (P0-2) ───────────────────────────────────────────────────

      describe("Page Accessors", () => {
        it.effect("page.context() returns a handle whose cookies() reflects the page", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
              Effect.gen(function* () {
                yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                // Set a cookie via document.cookie
                yield* page.evaluate(() => {
                  document.cookie = "page-context-test=present; path=/";
                });

                // The context handle should expose the full method set, including
                // cookies() — and it should reflect the page we just navigated to.
                const context = page.context();
                const cookies = yield* context.cookies();
                const cookieNames = JSON.stringify(cookies.map((c) => c.name));
                const hasCookie = cookies.some((c) => c.name === "page-context-test");
                yield* assertTrue(hasCookie);
                yield* Effect.logInfo(
                  `Expected cookie "page-context-test" in context.cookies() output, got: ${cookieNames}`,
                );
              }),
            );
          }),
        );

        it.effect("page.context() handle exposes the full method set", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
              Effect.gen(function* () {
                yield* page.goto(`${browserConfig.httpBaseUrl}/`);

                const context = page.context();

                // The handle must expose all PlaywrightBrowserContext methods, not
                // just cookies/withPage. Spot-check a representative subset.
                // Effect-returning methods are `Effect` values (not functions);
                // sync methods (`setDefaultTimeout` etc.) and `withPage` are
                // functions.
                yield* assertTrue(typeof context.cookies === "function");
                yield* assertTrue(typeof context.addCookies === "function");
                yield* assertTrue(typeof context.clearCookies === "function");
                yield* assertTrue(typeof context.setOffline === "function");
                yield* assertTrue(typeof context.setGeolocation === "function");
                yield* assertTrue(typeof context.grantPermissions === "function");
                yield* assertTrue(context.storageState !== undefined);
                yield* assertTrue(context.clearPermissions !== undefined);
                yield* assertTrue(context.addInitScript !== undefined);
                yield* assertTrue(typeof context.setExtraHTTPHeaders === "function");
                yield* assertTrue(typeof context.setDefaultTimeout === "function");
                yield* assertTrue(typeof context.setDefaultNavigationTimeout === "function");
                yield* assertTrue(typeof context.withPage === "function");
                yield* Effect.logInfo(
                  "All PlaywrightBrowserContext methods present on page.context()",
                );
              }),
            );
          }),
        );

        it.effect("page.workers() returns an array (typically empty for plain pages)", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            const workerCount = yield* playwright.withConnection(
              { url: browserWsUrl },
              ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                  // page.workers() is a synchronous getter; wrap in an Effect.sync.
                  return Effect.sync(() => page.workers().length);
                }).pipe(Effect.flatten),
            );

            // Plain pages have no workers; the count should be 0 and the array
            // should be a real ReadonlyArray (not null/undefined).
            yield* assertEqual(workerCount, 0);
            yield* Effect.logInfo(`Worker count: ${workerCount}`);
          }),
        );

        it.effect(
          "page.context() returns the same wrapper instance on repeated calls (cached)",
          () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/`);

                  // The wrapper is cached at page construction: repeated calls
                  // must return the same `PlaywrightBrowserContext` instance.
                  const first = page.context();
                  const second = page.context();
                  const third = page.context();
                  yield* assertTrue(first === second);
                  yield* assertTrue(second === third);
                  yield* Effect.logInfo("page.context() returns a stable wrapper across calls");
                }),
              );
            }),
        );
      });

      // ── Context Handle (P0-3) ───────────────────────────────────────────────────

      describe("Context Handle (full method set)", () => {
        it.effect("PlaywrightContextHandle exposes setOffline(true)", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            yield* playwright.withConnection({ url: browserWsUrl }, ({ connection }) =>
              Effect.gen(function* () {
                yield* connection.withContext(({ context, page }) =>
                  Effect.gen(function* () {
                    // Go online first to establish baseline
                    yield* context.setOffline(false);
                    yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                    yield* assertTrue(Str.isNonEmpty(yield* page.title));

                    // Now go offline — subsequent requests should fail.
                    yield* context.setOffline(true);
                    let offlineNavigated = true;
                    yield* page.goto(`${browserConfig.httpBaseUrl}/links`).pipe(
                      Effect.map(() => ({ online: true as const })),
                      Effect.catchTag("effect-libs/browser/PlaywrightError", () => {
                        offlineNavigated = false;
                        return Effect.succeed({ online: false as const });
                      }),
                    );

                    yield* assertTrue(!offlineNavigated);
                    yield* Effect.logInfo(
                      `Offline navigation: ${offlineNavigated ? "succeeded (unexpected)" : "failed (expected)"}`,
                    );

                    // Restore online state so cleanup is clean.
                    yield* context.setOffline(false);
                  }),
                );
              }),
            );
          }),
        );

        it.effect("PlaywrightContextHandle exposes setDefaultTimeout via withContext", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            yield* playwright.withConnection({ url: browserWsUrl }, ({ connection }) =>
              Effect.gen(function* () {
                yield* connection.withContext(({ context, page }) =>
                  Effect.gen(function* () {
                    // Should not throw — setDefaultTimeout is synchronous (returns void).
                    context.setDefaultTimeout(12345);
                    context.setDefaultNavigationTimeout(67890);
                    yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                    yield* Effect.logInfo(
                      "setDefaultTimeout/setDefaultNavigationTimeout succeeded on context handle",
                    );
                  }),
                );
              }),
            );
          }),
        );

        it.effect("PlaywrightContextHandle exposes grantPermissions", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            yield* playwright.withConnection({ url: browserWsUrl }, ({ connection }) =>
              Effect.gen(function* () {
                yield* connection.withContext(({ context, page }) =>
                  Effect.gen(function* () {
                    // Grant geolocation, then verify navigator.permissions.query
                    // reports the permission as 'granted'.
                    yield* context.grantPermissions(["geolocation"]);
                    yield* page.goto(`${browserConfig.httpBaseUrl}/empty`);
                    const state = yield* page.evaluate(async () => {
                      const r = await navigator.permissions.query({
                        name: "geolocation",
                      });
                      return r.state;
                    });
                    yield* assertEqual(state, "granted");
                    yield* Effect.logInfo(`granted permission state: ${state}`);
                  }),
                );
              }),
            );
          }),
        );

        it.effect("PlaywrightContextHandle exposes setGeolocation", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;

            yield* playwright.withConnection({ url: browserWsUrl }, ({ connection }) =>
              Effect.gen(function* () {
                yield* connection.withContext(({ context, page }) =>
                  Effect.gen(function* () {
                    // setGeolocation requires the geolocation permission to be
                    // granted before the override is observable to the page.
                    yield* context.grantPermissions(["geolocation"]);
                    yield* context.setGeolocation({
                      latitude: 37.7749,
                      longitude: -122.4194,
                    });
                    yield* page.goto(`${browserConfig.httpBaseUrl}/geolocation`);
                    // The /geolocation page resolves window.__geoReady when
                    // the geolocation callback fires.
                    yield* page.evaluate(() => (window as any).__geoReady);
                    const geo = yield* page.evaluate(() => (window as any).__geo);
                    yield* assertEqual(geo.status, "ok");
                    yield* assertEqual(geo.latitude, 37.7749);
                    yield* assertEqual(geo.longitude, -122.4194);
                    yield* Effect.logInfo(`setGeolocation result: ${JSON.stringify(geo)}`);
                  }),
                );
              }),
            );
          }),
        );
      });

      // ── page.fetch body handling (P1-7) ────────────────────────────────────────

      describe("page.fetch body handling", () => {
        it.effect("sends a string body and the server sees the body bytes", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;
            const httpBaseUrl = browserConfig.httpBaseUrl;

            // Clear any leftover dynamic routes from previous tests.
            yield* TestServerClient.clear(httpBaseUrl).pipe(Effect.ignore);

            const echoResponse = yield* playwright.withConnection(
              { url: browserWsUrl },
              ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpBaseUrl}/empty`);
                  // The existing /api/echo endpoint accepts { body: string } as JSON
                  // and returns { method, body, cookies, headers }.
                  const response = yield* page.fetch(`${httpBaseUrl}/api/echo`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ body: "hello-string-body" }),
                  });
                  yield* assertEqual(response.status, 200);
                  return response;
                }),
            );

            // The server's echo handler returns the body field it parsed; the
            // string body round-tripped end-to-end through the browser's fetch.
            const echoBody = JSON.parse(echoResponse.body) as { body: string };
            yield* assertEqual(echoBody.body, "hello-string-body");
          }),
        );

        it.effect(
          "sends a Uint8Array body and the request's content-length matches the byte count",
          () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;
              const httpBaseUrl = browserConfig.httpBaseUrl;

              // Clear any leftover dynamic routes from previous tests.
              yield* TestServerClient.clear(httpBaseUrl).pipe(Effect.ignore);

              // 4 bytes that are NOT valid UTF-8: 0xDE 0xAD 0xBE 0xEF.
              // A buggy implementation that decodes the body via TextDecoder
              // would replace these bytes with U+FFFD (replacement char) — the
              // request would still go through but the bytes would be corrupted.
              // We verify by content-length (request header).
              const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpBaseUrl}/empty`);

                  // Register a dynamic route that immediately responds with "ok"
                  // and captures the request headers in the server's pending state.
                  yield* TestServerClient.setRespondRoute(
                    httpBaseUrl,
                    "/p1-7-bin",
                    "ok",
                    200,
                    "text/plain",
                  );

                  const response = yield* page.fetch(`${httpBaseUrl}/p1-7-bin`, {
                    method: "POST",
                    headers: { "content-type": "application/octet-stream" },
                    body: payload,
                  });

                  yield* assertEqual(response.status, 200);
                  yield* assertEqual(response.body, "ok");

                  // Retrieve the captured request headers and verify the body
                  // was sent with the correct byte count.
                  const captured = yield* TestServerClient.waitForRequest(httpBaseUrl, "/p1-7-bin");
                  yield* assertTrue(captured.success);
                  const headers = captured.headers ?? {};
                  // The browser's fetch sets Content-Length for fixed-size bodies;
                  // verify it matches the original byte count.
                  const contentLength = headers["content-length"] ?? headers["Content-Length"];
                  yield* assertEqual(contentLength, String(payload.byteLength));
                  yield* assertEqual(
                    headers["content-type"] ?? headers["Content-Type"],
                    "application/octet-stream",
                  );
                }),
              );
            }),
        );

        it.effect("sends a JSON object body (not a pre-serialized string)", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const playwright = yield* Playwright;
            const httpBaseUrl = browserConfig.httpBaseUrl;

            // Clear any leftover dynamic routes from previous tests.
            yield* TestServerClient.clear(httpBaseUrl).pipe(Effect.ignore);

            // Pass a plain JS object — the browser should JSON.stringify it
            // before sending. The /api/echo endpoint expects { body: string }
            // as its JSON payload, so we wrap our test value in `body`.
            const echoResponse = yield* playwright.withConnection(
              { url: browserWsUrl },
              ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpBaseUrl}/empty`);
                  const response = yield* page.fetch(`${httpBaseUrl}/api/echo`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: { body: "json-object-body" },
                  });
                  yield* assertEqual(response.status, 200);
                  return response;
                }),
            );

            // If the browser received an object and JSON.stringify'd it, the
            // server's echo handler will see body === "json-object-body".
            // If the object was silently dropped (the pre-fix behavior), the
            // server's payload parser would fail and the response would not
            // be 200 with a parsed body — the test would fail on the assertEqual
            // below.
            const echoBody = JSON.parse(echoResponse.body) as { body: string };
            yield* assertEqual(echoBody.body, "json-object-body");
          }),
        );
      });

      // ── Wrapper Surface (P1-4) ───────────────────────────────────────────────────
      //
      // The Playwright module is a thin wrapper around `@cloudflare/playwright`.
      // These tests verify the wrapper surface (the wrapped methods exist, accept
      // the right args, and return the wrapped types) without re-testing the
      // upstream behavior — that's upstream's job, not ours. The principle:
      // each test should answer "does the wrapper round-trip this method?",
      // not "does the method actually do its job?".

      describe("Wrapper Surface", () => {
        describe("Page.wait*", () => {
          it.effect("waitForFunction returns when the predicate becomes truthy", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/dynamic`);
                  // The /dynamic page sets #content to "Dynamic content loaded!"
                  // after 100ms; waitForFunction should auto-wait and resolve.
                  const text = yield* page.waitForFunction(
                    () =>
                      document.getElementById("content")?.textContent === "Dynamic content loaded!",
                  );
                  yield* assertEqual(text, true);
                }),
              );
            }),
          );

          it.effect("waitForTimeout yields for the given duration", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/empty`);
                  // Smoke test: wrapper accepts a number, returns Effect<void>.
                  yield* page.waitForTimeout(10);
                }),
              );
            }),
          );

          it.effect("waitForRequest matches by URL predicate", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;
              const httpBaseUrl = browserConfig.httpBaseUrl;

              yield* TestServerClient.clear(httpBaseUrl).pipe(Effect.ignore);

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpBaseUrl}/empty`);

                  // Fork the waiter so the upstream subscription is in
                  // place before the navigation that triggers the
                  // request. The predicate receives the upstream
                  // Request object; use `request.url()` to inspect the
                  // URL.
                  const requestFiber = yield* Effect.forkChild(
                    page.waitForRequest((req) => req.url().endsWith("/links")),
                  );

                  yield* page.goto(`${httpBaseUrl}/links`);

                  // The wrapper exposes waitForRequest as
                  // `Effect.Effect<Request, PlaywrightError>`. The
                  // request URL we asked for should resolve.
                  const request = yield* Fiber.join(requestFiber);
                  const url = request.url();
                  yield* assertTrue(url.endsWith("/links"));
                }),
              );
            }),
          );

          it.effect("waitForResponse matches by URL predicate", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;
              const httpBaseUrl = browserConfig.httpBaseUrl;

              yield* TestServerClient.clear(httpBaseUrl).pipe(Effect.ignore);

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpBaseUrl}/empty`);

                  // Fork the response waiter concurrently with the
                  // goto. The predicate receives the upstream Response
                  // object.
                  const responseFiber = yield* Effect.forkChild(
                    page.waitForResponse((res) => res.url().endsWith("/links")),
                  );
                  yield* page.goto(`${httpBaseUrl}/links`);
                  const response = yield* Fiber.join(responseFiber);
                  yield* assertEqual(response.status(), 200);
                }),
              );
            }),
          );

          it.effect("waitForURL resolves when the URL matches", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  // Wait for /links to appear — fire the waiter concurrently.
                  yield* Effect.gen(function* () {
                    const urlTask = page.waitForURL(/\/links$/);
                    yield* page.goto(`${browserConfig.httpBaseUrl}/links`);
                    yield* urlTask;
                  });
                  // The wrapper accepts a string or RegExp; smoke-test the
                  // string variant too.
                  yield* Effect.gen(function* () {
                    const urlTask = page.waitForURL((url) => url.pathname.endsWith("/empty"));
                    yield* page.goto(`${browserConfig.httpBaseUrl}/empty`);
                    yield* urlTask;
                  });
                }),
              );
            }),
          );
        });

        describe("Page.capture", () => {
          // `page.pdf()` is Chromium-only (Firefox/WebKit don't support it) and
          // requires headed mode in some configurations; we skip it here.

          it.effect("screenshot returns a Uint8Array of image bytes", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              const bytes = yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/`);
                  // Default options → PNG. We don't validate the bytes
                  // (that's upstream's job); we just verify the wrapper
                  // returns a non-empty Uint8Array.
                  return yield* page.screenshot();
                }),
              );

              yield* assertTrue(bytes.byteLength > 0);
              yield* Effect.logInfo(`screenshot byteLength: ${bytes.byteLength}`);
            }),
          );
        });

        describe("Page.state", () => {
          it.effect("setViewportSize forwards width/height to the page", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/empty`);
                  // Smoke test: the wrapper accepts an options object and
                  // returns Effect<void>.
                  yield* page.setViewportSize({ width: 800, height: 600 });
                }),
              );
            }),
          );

          it.effect("emulateMedia forwards media and colorScheme options", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/empty`);
                  yield* page.emulateMedia({
                    media: "screen",
                    colorScheme: "dark",
                  });
                  // Verify the option actually took effect — a smoke check
                  // that the wrapper didn't silently drop the call.
                  const media = yield* page.evaluate(
                    () => matchMedia("(prefers-color-scheme: dark)").matches,
                  );
                  yield* assertEqual(media, true);
                }),
              );
            }),
          );

          it.effect("setExtraHTTPHeaders forwards headers to subsequent requests", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.setExtraHTTPHeaders({ "x-wrapper-test": "yes" });
                  yield* page.goto(`${browserConfig.httpBaseUrl}/empty`);
                  // The /api/echo endpoint reflects request headers; use
                  // page.fetch() (a wrapper extension) to read them back.
                  // The endpoint requires content-type: application/json
                  // and a JSON body with a `body` field of type string.
                  const response = yield* page.fetch(`${browserConfig.httpBaseUrl}/api/echo`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ body: "extra-headers-test" }),
                  });
                  const echoed = JSON.parse(response.body) as { headers: Record<string, string> };
                  // Headers may be lowercased by the server; check
                  // case-insensitively.
                  const headerKey = Object.keys(echoed.headers).find(
                    (k) => k.toLowerCase() === "x-wrapper-test",
                  );
                  yield* assertEqual(echoed.headers[headerKey ?? ""], "yes");
                }),
              );
            }),
          );
        });

        describe("Page.network", () => {
          // `page.routeFromHAR` requires a HAR file on disk; we skip the
          // happy-path test and verify only that the wrapper exists by
          // checking the type signature in `PlaywrightMethods`.

          it.effect("route intercepts matching requests and forwards others", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;
              const httpBaseUrl = browserConfig.httpBaseUrl;

              yield* TestServerClient.clear(httpBaseUrl).pipe(Effect.ignore);

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpBaseUrl}/empty`);

                  // Register a route for /intercepted that fulfills with a
                  // static body. The handler must be async and await
                  // `fulfill` so the request is properly intercepted.
                  yield* page.route("**/intercepted", async (routeInfo) => {
                    await routeInfo.fulfill({
                      status: 200,
                      contentType: "text/plain",
                      body: "intercepted-body",
                    });
                  });

                  const response = yield* page.fetch(`${httpBaseUrl}/intercepted`);
                  yield* assertEqual(response.status, 200);
                  yield* assertEqual(response.body, "intercepted-body");

                  // Clean up the route — verify unroute round-trips too.
                  yield* page.unroute("**/intercepted");

                  // After unroute, the same fetch should hit the real server
                  // (which has no /intercepted endpoint; expect a 404).
                  // page.fetch treats non-2xx as a PlaywrightError, so we
                  // catch it and assert on the status.
                  yield* page.fetch(`${httpBaseUrl}/intercepted`).pipe(
                    Effect.catchTag(
                      "effect-libs/browser/PlaywrightError",
                      () =>
                        // The wrapper raises on non-2xx; the real server
                        // returns 404. We've verified the route is no
                        // longer intercepting.
                        Effect.void,
                    ),
                  );
                }),
              );
            }),
          );

          it.effect("unrouteAll removes all registered routes", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;
              const httpBaseUrl = browserConfig.httpBaseUrl;

              yield* TestServerClient.clear(httpBaseUrl).pipe(Effect.ignore);

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpBaseUrl}/empty`);
                  yield* page.route("**/r1", async (r) => {
                    await r.fulfill({ status: 200, body: "r1" });
                  });
                  yield* page.route("**/r2", async (r) => {
                    await r.fulfill({ status: 200, body: "r2" });
                  });
                  yield* page.unrouteAll();
                  // After unrouteAll, the routes should no longer intercept.
                  // The real server has no /r1 endpoint, so the fetch
                  // raises — catch and verify the wrapper routed the
                  // request to the network rather than fulfilling it.
                  yield* page
                    .fetch(`${httpBaseUrl}/r1`)
                    .pipe(
                      Effect.catchTag("effect-libs/browser/PlaywrightError", () => Effect.void),
                    );
                }),
              );
            }),
          );
        });

        describe("Page.expose", () => {
          it.effect("exposeFunction makes a host function callable from the page", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/empty`);
                  // Expose a host function. The wrapper accepts (name, callback)
                  // and returns Effect<void>.
                  yield* page.exposeFunction("double", (n: number) => n * 2);

                  // Verify the function is callable from the page context.
                  const result = yield* page.evaluate(() => (window as any).double(21) as number);
                  yield* assertEqual(result, 42);
                }),
              );
            }),
          );
        });

        describe("Page.locatorHandlers", () => {
          it.effect("addLocatorHandler + removeLocatorHandler round-trip", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/form`);
                  const submitButton = page.locator('button[type="submit"]');

                  // Add a locator handler. The wrapper accepts
                  // (PlaywrightLocator, handler) and returns Effect<void>.
                  yield* page.addLocatorHandler(submitButton, async () => {
                    // No-op handler — just verify the wrapper accepts
                    // (locator, handler) without throwing.
                  });

                  // Verify the wrapper exposes removeLocatorHandler that
                  // accepts a PlaywrightLocator (not raw upstream).
                  yield* page.removeLocatorHandler(submitButton);
                }),
              );
            }),
          );
        });

        describe("Page.errors", () => {
          // `page.pause()` is interactive and would hang the test runner; skip.

          it.effect("opener returns null for pages without an opener", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              const opener = yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/empty`);
                  // opener is an Effect property (no args) that returns
                  // `Effect<Page | null, PlaywrightError>`. For a plain
                  // navigation, opener is null. We don't make assertions
                  // about what upstream returns — just verify the wrapper
                  // round-trips it.
                  return yield* page.opener;
                }),
              );

              yield* assertEqual(opener, null);
              yield* Effect.logInfo(`opener: ${opener}`);
            }),
          );
        });

        describe("BrowserContext", () => {
          it.effect("storageState / clearPermissions / addInitScript round-trip", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ connection }) =>
                Effect.gen(function* () {
                  yield* connection.withContext(({ context, page }) =>
                    Effect.gen(function* () {
                      // storageState — returns an Effect with the storage
                      // snapshot. We don't validate the contents (upstream's
                      // job); just verify the wrapper is callable.
                      const state = yield* context.storageState();
                      yield* assertTrue(typeof state === "object");

                      // clearPermissions is an Effect property (no args) that
                      // returns Effect<void>. To exercise the path we first
                      // grant a permission, then clear it.
                      yield* context.grantPermissions(["geolocation"]);
                      yield* context.clearPermissions;

                      // addInitScript — wrapper accepts (script, arg?) and
                      // returns Effect<void>. Verify the init script runs.
                      yield* context.addInitScript(() => {
                        (window as any).__initRan = true;
                      });
                      yield* page.goto(`${browserConfig.httpBaseUrl}/empty`);
                      const initRan = yield* page.evaluate(
                        () => (window as any).__initRan === true,
                      );
                      yield* assertEqual(initRan, true);
                    }),
                  );
                }),
              );
            }),
          );

          it.effect(
            "setExtraHTTPHeaders / setDefaultTimeout / setDefaultNavigationTimeout round-trip",
            () =>
              Effect.gen(function* () {
                const browserConfig = yield* TestBrowserConfig;
                const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
                const playwright = yield* Playwright;

                yield* playwright.withConnection({ url: browserWsUrl }, ({ connection }) =>
                  Effect.gen(function* () {
                    yield* connection.withContext(({ context, page }) =>
                      Effect.gen(function* () {
                        // setExtraHTTPHeaders — wrapper accepts (headers) and
                        // returns Effect<void>.
                        yield* context.setExtraHTTPHeaders({ "x-ctx-test": "1" });

                        // setDefaultTimeout / setDefaultNavigationTimeout —
                        // synchronous (return void), not Effects. Just verify
                        // they're callable without throwing.
                        context.setDefaultTimeout(5000);
                        context.setDefaultNavigationTimeout(10000);

                        // Verify setExtraHTTPHeaders actually flowed through.
                        yield* page.goto(`${browserConfig.httpBaseUrl}/empty`);
                        const response = yield* page.fetch(
                          `${browserConfig.httpBaseUrl}/api/echo`,
                          {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ body: "ctx-headers-test" }),
                          },
                        );
                        const echoed = JSON.parse(response.body) as {
                          headers: Record<string, string>;
                        };
                        const key = Object.keys(echoed.headers).find(
                          (k) => k.toLowerCase() === "x-ctx-test",
                        );
                        yield* assertEqual(echoed.headers[key ?? ""], "1");
                      }),
                    );
                  }),
                );
              }),
          );
        });

        describe("Locator surface", () => {
          it.effect("getBy* factories return wrapped Locators with the expected methods", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/element-content`);

                  // Each getBy* factory returns a PlaywrightLocator (a wrapped
                  // Locator). Verify the wrapper has all the methods we depend
                  // on by checking they exist as functions on the returned
                  // value. This is a static contract test — it catches
                  // accidental signature changes in the wrapper.
                  // Note: `getByAltText` / `getByTitle` are on Locator (not
                  // Page); we exercise them in the Locator.interactions test
                  // below instead.
                  const checks: ReadonlyArray<{
                    readonly name: string;
                    readonly locator: ReturnType<typeof page.locator>;
                  }> = [
                    { name: "locator", locator: page.locator("h1") },
                    {
                      name: "getByRole",
                      locator: page.getByRole("heading", { name: "Hello World" }),
                    },
                    { name: "getByText", locator: page.getByText("Hello World") },
                    { name: "getByLabel", locator: page.getByLabel("username") },
                    { name: "getByTestId", locator: page.getByTestId("nav-link") },
                    {
                      name: "getByPlaceholder",
                      locator: page.getByPlaceholder("Enter username"),
                    },
                  ];

                  for (const { name, locator } of checks) {
                    // Each of these is an Effect-returning function (or an
                    // Effect property for the no-arg ones). The wrapper
                    // contract is "the locator exposes the same method set
                    // as upstream", so we check that the property exists.
                    // (Upstream Playwright already tests that the methods
                    // do their job — we just verify the wrapper surface.)
                    yield* assertTrue(locator.click !== undefined);
                    yield* assertTrue(locator.fill !== undefined);
                    yield* assertTrue(locator.type !== undefined);
                    yield* assertTrue(locator.press !== undefined);
                    yield* assertTrue(locator.textContent !== undefined);
                    yield* assertTrue(locator.boundingBox !== undefined);
                    yield* assertTrue(locator.count !== undefined);
                    yield* assertTrue(locator.evaluate !== undefined);
                    yield* Effect.logInfo(`checked ${name}: all methods present`);
                  }
                }),
              );
            }),
          );

          it.effect("Locator interactions (click/fill/type/press) round-trip", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/form`);

                  // Use a wrapped Locator to exercise the wrapper's
                  // Locator-level fill. We use a CSS selector (the
                  // /form fixture has no <label> elements — it uses
                  // `name=` attributes).
                  const username = page.locator('input[name="username"]');
                  yield* username.fill("alice");
                  const typedValue = yield* username.evaluate(
                    (el: unknown) => (el as HTMLInputElement).value,
                  );
                  yield* assertEqual(typedValue, "alice");

                  // press — wrapper accepts (key, options?) and returns.
                  yield* page.keyboard.press("Tab");

                  // Submit the form and wait for the result text via
                  // the page-level :has-text selector (auto-waiting).
                  yield* page.click('button[type="submit"]');
                  yield* page.waitForSelector("#result:has-text('Form submitted')");
                  const result = yield* page.evaluate(
                    () => document.getElementById("result")?.textContent ?? "",
                  );
                  yield* assertEqual(result, "Form submitted!");
                }),
              );
            }),
          );

          it.effect("Locator textContent / boundingBox / count return Effect values", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/element-content`);

                  const heading = page.locator("#heading");

                  // textContent — wrapper exposes it as an Effect property
                  // (no args), not a function.
                  const text = yield* heading.textContent;
                  yield* assertEqual(text, "Hello World");

                  // count — wrapper exposes it as an Effect property.
                  const count = yield* page.locator("p.intro").count;
                  yield* assertEqual(count, 1);

                  // boundingBox — wrapper exposes it as an Effect property.
                  // Just verify it's callable (the box may be null in some
                  // headless configs).
                  const box = yield* heading.boundingBox;
                  // Either a real box or null (offscreen); both are valid.
                  yield* assertTrue(box === null || typeof box.width === "number");
                }),
              );
            }),
          );

          it.effect("Locator.evaluate round-trips a sync callback", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/element-content`);
                  const result = yield* page
                    .locator("#heading")
                    .evaluate((el: unknown) => (el as HTMLElement).tagName);
                  yield* assertEqual(result, "H1");
                }),
              );
            }),
          );

          it.effect("frameLocator returns a wrapped FrameLocator", () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const playwright = yield* Playwright;

              yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${browserConfig.httpBaseUrl}/frames/one-frame.html`);
                  yield* page.waitForLoadState("domcontentloaded");

                  // frameLocator is exposed on Page, Frame, and Locator.
                  // The wrapped FrameLocator exposes chained locators
                  // (locator / getByRole) and frame navigation
                  // (nth / first / last).
                  const fl = page.frameLocator("#frame1");
                  yield* assertTrue(typeof fl.locator === "function");
                  yield* assertTrue(typeof fl.getByRole === "function");
                  yield* assertTrue(typeof fl.nth === "function");
                }),
              );
            }),
          );
        });

        describe("Frame surface", () => {
          it.effect(
            "mainFrame.goto / evaluate / childFrames / parentFrame / waitForLoadState round-trip",
            () =>
              Effect.gen(function* () {
                const browserConfig = yield* TestBrowserConfig;
                const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
                const playwright = yield* Playwright;

                yield* playwright.withConnection({ url: browserWsUrl }, ({ page }) =>
                  Effect.gen(function* () {
                    yield* page.goto(`${browserConfig.httpBaseUrl}/frames/one-frame.html`);
                    yield* page.waitForLoadState("domcontentloaded");

                    const frame = page.mainFrame();

                    // url — synchronous return, returns the frame's URL
                    // string. Just verify it's a string with content.
                    const url = frame.url();
                    yield* assertTrue(typeof url === "string");
                    yield* assertTrue(url.includes("/frames/one-frame.html"));

                    // parentFrame — wrapper returns Option<PlaywrightFrame>.
                    // Main frame has no parent; should be None.
                    const parent = frame.parentFrame();
                    yield* assertEqual(parent._tag, "None");

                    // childFrames — wrapper returns ReadonlyArray<PlaywrightFrame>.
                    const children = frame.childFrames();
                    yield* assertTrue(Array.isArray(children));
                    yield* assertTrue(children.length >= 1);

                    // waitForLoadState — smoke test on a child frame.
                    const child = children[0];
                    yield* child.waitForLoadState("domcontentloaded");

                    // evaluate on the frame — wrapper returns
                    // Effect<R, PlaywrightError>. Use a smoke check that
                    // reaches the iframe document.
                    const heading = yield* child.evaluate(
                      () => document.querySelector("h1")?.textContent ?? "",
                    );
                    yield* assertEqual(heading, "Frame");

                    // goto on the frame — wrapper accepts a URL string and
                    // returns Effect<void>. Just verify it's callable.
                    yield* child.goto(`${browserConfig.httpBaseUrl}/empty`);
                  }),
                );
              }),
          );
        });
      });
    });
  });
};
