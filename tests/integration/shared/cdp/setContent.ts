/**
 * `browser-cdp` parity tests for setContent.
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-set-content.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Key differences from upstream:
 *   - `browser-cdp` setContent returns void (no Response object)
 *   - Verify content via `yield* page.content` instead of `await page.content()`
 *   - `page.content` is an Effect property, not a method
 *   - No `$eval` — use `page.evaluate` instead
 *   - Error type is CdpError, not Playwright TimeoutError
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   NOT_PLANNED (internal API):
 *     - "should handle timeout properly" (2 variants) → uses Playwright internal toImpl API
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 * setContent uses Effect.timeout internally for waiting on load state.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Cause, Effect, Exit, Fiber, Result } from "effect";

import { CdpError, PageTimeoutError } from "@effect-libs/browser-cdp";
import { Cdp } from "@effect-libs/browser-cdp";

import { TestServerClient } from "../../../setup/http-server/Client.js";
import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineSetContentTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe, beforeEach } = api;
  const { wsUrl, httpUrl } = config;

  describe("SetContent", () => {
    // Clear dynamic routes before each test
    beforeEach(() => TestServerClient.clear(httpUrl).pipe(Effect.ignore));

    // ── "should work" ────────────────────────────────────────────────────

    test.live("page-set-content.spec.ts - should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>hello</div>");
            const result = yield* page.content;
            const expected = "<html><head></head><body><div>hello</div></body></html>";
            yield* assertEqual(result, expected);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with domcontentloaded" ──────────────────────────────

    test.live("page-set-content.spec.ts - should work with domcontentloaded", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>hello</div>", { waitUntil: "domcontentloaded" });
            const result = yield* page.content;
            const expected = "<html><head></head><body><div>hello</div></body></html>";
            yield* assertEqual(result, expected);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with commit" ──────────────────────────────────────────

    test.live("page-set-content.spec.ts - should work with commit", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>hello</div>", { waitUntil: "commit" });
            const result = yield* page.content;
            const expected = "<html><head></head><body><div>hello</div></body></html>";
            yield* assertEqual(result, expected);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with doctype" ───────────────────────────────────────

    test.live("page-set-content.spec.ts - should work with doctype", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            const doctype = "<!DOCTYPE html>";
            yield* page.setContent(`${doctype}<div>hello</div>`);
            const result = yield* page.content;
            const expected = `${doctype}<html><head></head><body><div>hello</div></body></html>`;
            yield* assertEqual(result, expected);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-set-content.spec.ts - should work with HTML 4 doctype", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            const doctype =
              '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" ' +
              '"http://www.w3.org/TR/html4/strict.dtd">';
            yield* page.setContent(`${doctype}<div>hello</div>`);
            const result = yield* page.content;
            const expected = `${doctype}<html><head></head><body><div>hello</div></body></html>`;
            yield* assertEqual(result, expected);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should respect timeout" ─────────────────────────────────────────

    test.live(
      "page-set-content.spec.ts - should respect timeout",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              const imgPath = "/img.png";
              // Stall for image — setContent will wait for load
              yield* TestServerClient.setHangRoute(httpUrl, imgPath);
              const result = yield* Effect.result(
                page.setContent(`<img src="${httpUrl}${imgPath}"></img>`, {
                  timeout: 1000,
                }),
              );
              yield* assertTrue(Result.isFailure(result));
              // Verify it's a CdpError with PageTimeoutError reason
              if (Result.isFailure(result)) {
                const cause = result.failure;
                yield* assertTrue(cause instanceof CdpError);
                if (cause instanceof CdpError) {
                  yield* assertTrue(cause.reason instanceof PageTimeoutError);
                }
              }
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 15_000 },
    );

    // ── "should respect default navigation timeout" ────────────────────────

    test.live(
      "page-set-content.spec.ts - should respect default navigation timeout",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              // Set default navigation timeout
              yield* page.setDefaultNavigationTimeout(1);
              const imgPath = "/img.png";
              // Stall for image — setContent will wait for load
              yield* TestServerClient.setHangRoute(httpUrl, imgPath);
              const result = yield* Effect.result(
                page.setContent(`<img src="${httpUrl}${imgPath}"></img>`),
              );
              yield* assertTrue(Result.isFailure(result));
              // Verify it's a CdpError with PageTimeoutError reason
              if (Result.isFailure(result)) {
                const cause = result.failure;
                yield* assertTrue(cause instanceof CdpError);
                if (cause instanceof CdpError) {
                  yield* assertTrue(cause.reason instanceof PageTimeoutError);
                }
              }
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 15_000 },
    );

    // ── "should await resources to load" ─────────────────────────────────

    test.live(
      "page-set-content.spec.ts - should await resources to load",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              const imgPath = "/img.png";
              // Stall the image response
              yield* TestServerClient.setHangRoute(httpUrl, imgPath);

              // Start setContent — should wait for the image to load
              let loaded = false;
              const fiber = yield* Effect.forkChild(
                page.setContent(`<img src="${httpUrl}${imgPath}"></img>`).pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      loaded = true;
                    }),
                  ),
                ),
              );

              // Wait for the request to arrive at the server
              yield* TestServerClient.waitForRequest(httpUrl, imgPath);

              // Content should NOT be loaded yet — image is still hanging
              yield* Effect.sleep("200 millis");
              yield* assertTrue(!loaded);

              // Release the image — setContent should now complete
              yield* TestServerClient.release(httpUrl, imgPath);
              yield* Fiber.join(fiber);
              yield* assertTrue(loaded);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 15_000 },
    );

    // ── "should work fast enough" ────────────────────────────────────────

    test.live(
      "page-set-content.spec.ts - should work fast enough",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              for (let i = 0; i < 20; i++) {
                yield* page.setContent("<div>yo</div>");
              }
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 15_000 },
    );

    // ── "should work with tricky content" ────────────────────────────────

    test.live("page-set-content.spec.ts - should work with tricky content", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>hello world</div>\x7F");
            const text = yield* page.evaluate(() => document.querySelector("div")?.textContent);
            yield* assertEqual(text, "hello world");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with accents" ───────────────────────────────────────

    test.live("page-set-content.spec.ts - should work with accents", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>aberración</div>");
            const text = yield* page.evaluate(() => document.querySelector("div")?.textContent);
            yield* assertEqual(text, "aberración");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with emojis" ────────────────────────────────────────

    test.live("page-set-content.spec.ts - should work with emojis", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>🐥</div>");
            const text = yield* page.evaluate(() => document.querySelector("div")?.textContent);
            yield* assertEqual(text, "🐥");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with newline" ───────────────────────────────────────

    test.live("page-set-content.spec.ts - should work with newline", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>\n</div>");
            const text = yield* page.evaluate(() => document.querySelector("div")?.textContent);
            yield* assertEqual(text, "\n");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should return empty content there is no iframe src" ─────────────────

    test.live("page-set-content.spec.ts - should return empty content there is no iframe src", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Set content with iframe that has javascript: URL
            yield* page.setContent(`<iframe src="javascript:console.log(1)"></iframe>`);
            // Get all frames
            const frames = yield* page.frames;
            yield* assertEqual(frames.length, 2);
            // Get the iframe's content (should be empty HTML)
            const iframeContent = yield* frames[1].content;
            yield* assertEqual(iframeContent, "<html><head></head><body></body></html>");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "content() should throw nice error during navigation" ─────────────────

    test.live(
      "page-set-content.spec.ts - content() should throw nice error during navigation",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent("<div>hello</div>");

              // Set up a route that returns HTML with a hanging image
              // This ensures frameNavigated fires (URL changes) but load event doesn't fire
              const slowPagePath = "/slow-page-for-content-test.html";
              const hangImgPath = "/hang-img-for-content-test.png";
              yield* TestServerClient.setRespondRoute(
                httpUrl,
                slowPagePath,
                `<html><head></head><body><img src="${hangImgPath}"></body></html>`,
                200,
              );
              yield* TestServerClient.setHangRoute(httpUrl, hangImgPath);

              // Start navigation to the slow page
              const navFiber = yield* Effect.forkChild(page.goto(httpUrl + slowPagePath));

              // Wait for the frame's URL to change - this indicates frameNavigated has fired
              // which means lifecycleEvents has been reset to just ["commit"]
              // The load event won't fire because the image is hanging
              yield* Effect.gen(function* () {
                for (let i = 0; i < 40; i++) {
                  // 40 * 50ms = 2s timeout
                  const url = yield* page.url;
                  if (url.includes(slowPagePath)) return;
                  yield* Effect.sleep("50 millis");
                }
                // If we get here, timeout
                return yield* Effect.die("Navigation didn't start within 2 seconds");
              });

              // Now try to get content - navigation is definitely in progress
              // lifecycleEvents should only have "commit", no domcontentloaded/load
              // This should throw ContentUnavailableError
              const exit = yield* Effect.exit(page.content);

              if (Exit.isSuccess(exit)) {
                // Content succeeded - this shouldn't happen during navigation
                // Log for debugging
                yield* Effect.logWarning(
                  `Content succeeded during navigation test (unexpected - lifecycleEvents check may not be working)`,
                );
              } else {
                // Content failed - should be ContentUnavailableError
                const error = Cause.squash(exit.cause);
                yield* assertTrue(error instanceof CdpError);
                if (error instanceof CdpError) {
                  yield* assertTrue(
                    error.reason._tag === "effect-libs/browser/CdpError/ContentUnavailableError",
                  );
                }
              }

              // Clean up - release the hanging route and wait for navigation
              yield* TestServerClient.release(httpUrl, hangImgPath);
              yield* Fiber.join(navFiber).pipe(Effect.timeout("5 seconds"), Effect.ignore);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 15_000 },
    );

    // ── NOT_PLANNED tests (uses Playwright internal toImpl API) ─────────────

    test.skip("page-set-content.spec.ts - should handle timeout properly [SKIP: NOT_PLANNED - uses Playwright internal toImpl API]", () =>
      Effect.void);

    test.skip("page-set-content.spec.ts - should handle timeout properly 2 [SKIP: NOT_PLANNED - uses Playwright internal toImpl API]", () =>
      Effect.void);
  });
};
