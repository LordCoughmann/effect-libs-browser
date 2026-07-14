/**
 * `browser-cdp` parity tests for waitForLoadState.
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-wait-for-load-state.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Key differences from upstream:
 *   - `browser-cdp` doesn't have popup support (no page.waitForEvent('popup'))
 *   - `page.url` / `page.title` are Effect properties, not methods
 *   - Fiber-based concurrency instead of Promise.all
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   Requires popup/newPage support (not implemented):
 *     - "should work with pages that have loaded before being connected to"
 *     - "should wait for load state of empty url popup"
 *     - "should wait for load state of about:blank popup"
 *     - "should wait for load state of about:blank popup with noopener"
 *     - "should wait for load state of popup with network url"
 *     - "should wait for load state of popup with network url and noopener"
 *     - "should work with clicking target=_blank"
 *     - "should wait for load state of newPage"
 *     - "should resolve after popup load"
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 * waitForLoadState uses Effect.timeout internally, so all tests involving
 * load state waiting require real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Cause, Effect, Exit, Fiber, Option } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { TestServerClient } from "../../../setup/http-server/Client.js";
import { assertContains, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineWaitForLoadStateTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe, beforeEach } = api;
  const { wsUrl, httpUrl } = config;

  describe("WaitForLoadState", () => {
    // Clear dynamic routes before each test to prevent route poisoning
    beforeEach(() => TestServerClient.clear(httpUrl).pipe(Effect.ignore));
    // ── "should pick up ongoing navigation" ──────────────────────────────
    // Upstream: goto with waitUntil: domcontentloaded, then waitForLoadState
    // should wait for the pending CSS to finish (load event)

    test.live("page-wait-for-load-state.spec.ts - should pick up ongoing navigation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Hang the CSS file so the page stays at domcontentloaded
            yield* TestServerClient.setHangRoute(httpUrl, "/one-style.css");

            // Navigate with domcontentloaded — this will resolve before load
            // because CSS is hanging
            yield* Effect.forkChild(
              page.goto(`${httpUrl}/one-style`, { waitUntil: "domcontentloaded" }),
            );

            // Wait for the CSS request to arrive
            yield* TestServerClient.waitForRequest(httpUrl, "/one-style.css");

            // Now call waitForLoadState (default: "load") — it should NOT
            // resolve immediately because CSS is still pending
            const loadFiber = yield* Effect.forkChild(page.waitForLoadState("load"));

            // Release the CSS — load should now complete
            yield* TestServerClient.release(httpUrl, "/one-style.css");

            yield* Fiber.join(loadFiber);

            yield* TestServerClient.clear(httpUrl);
          }),
        );
      }).pipe(
        Effect.provide(Cdp.layer),
        Effect.ensuring(TestServerClient.clear(httpUrl).pipe(Effect.ignore)),
      ),
    );

    // ── "should respect timeout" ─────────────────────────────────────────
    // Upstream: waitForLoadState('load', { timeout: 1 }) should timeout

    test.live("page-wait-for-load-state.spec.ts - should respect timeout", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Hang CSS so load never fires
            yield* TestServerClient.setHangRoute(httpUrl, "/one-style.css");

            // Navigate with domcontentloaded — resolves before load
            yield* page.goto(`${httpUrl}/one-style`, { waitUntil: "domcontentloaded" });

            // waitForLoadState('load') should timeout quickly
            const exit = yield* page
              .waitForLoadState("load", { timeout: "100 millis" })
              .pipe(Effect.exit);

            yield* assertTrue(Exit.isFailure(exit));

            yield* TestServerClient.release(httpUrl, "/one-style.css");
            yield* TestServerClient.clear(httpUrl);
          }),
        );
      }).pipe(
        Effect.provide(Cdp.layer),
        Effect.ensuring(
          TestServerClient.release(httpUrl, "/one-style.css").pipe(
            Effect.andThen(TestServerClient.clear(httpUrl)),
            Effect.ignore,
          ),
        ),
      ),
    );

    // ── "should resolve immediately if loaded" ───────────────────────────
    // Upstream: goto waits for load by default, then waitForLoadState()
    // should resolve immediately

    test.live("page-wait-for-load-state.spec.ts - should resolve immediately if loaded", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // goto waits for load by default
            yield* page.goto(`${httpUrl}/one-style`);

            // This should resolve immediately (load already reached)
            yield* page.waitForLoadState();
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should resolve immediately if load state matches" ───────────────
    // Upstream: goto with domcontentloaded, then waitForLoadState('domcontentloaded')
    // should resolve immediately

    test.live(
      "page-wait-for-load-state.spec.ts - should resolve immediately if load state matches",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);

              // Navigate to one-style with domcontentloaded (CSS hangs = load not reached)
              yield* TestServerClient.setHangRoute(httpUrl, "/one-style.css");
              yield* page.goto(`${httpUrl}/one-style`, { waitUntil: "domcontentloaded" });

              // domcontentloaded was already reached — should resolve immediately
              yield* page.waitForLoadState("domcontentloaded");

              yield* TestServerClient.release(httpUrl, "/one-style.css");
              yield* TestServerClient.clear(httpUrl);
            }),
          );
        }).pipe(
          Effect.provide(Cdp.layer),
          Effect.ensuring(
            TestServerClient.release(httpUrl, "/one-style.css").pipe(
              Effect.andThen(TestServerClient.clear(httpUrl)),
              Effect.ignore,
            ),
          ),
        ),
    );

    // ── "should work with javascript: iframe" ────────────────────────────
    // Upstream: setContent with javascript:false iframe, then wait for all states

    test.live("page-wait-for-load-state.spec.ts - should work with javascript: iframe", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<iframe src="javascript:false"></iframe>`, {
              waitUntil: "commit",
            });
            yield* page.waitForLoadState("domcontentloaded");
            yield* page.waitForLoadState("load");
            yield* page.waitForLoadState("networkidle");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with broken data-url iframe" ────────────────────────
    // Upstream: setContent with data:text/html iframe, then wait for all states

    test.live("page-wait-for-load-state.spec.ts - should work with broken data-url iframe", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<iframe src="data:text/html"></iframe>`, {
              waitUntil: "commit",
            });
            yield* page.waitForLoadState("domcontentloaded");
            yield* page.waitForLoadState("load");
            yield* page.waitForLoadState("networkidle");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with broken blob-url iframe" ────────────────────────
    // Upstream: setContent with blob: iframe, then wait for all states

    test.live("page-wait-for-load-state.spec.ts - should work with broken blob-url iframe", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<iframe src="blob:"></iframe>`, {
              waitUntil: "commit",
            });
            yield* page.waitForLoadState("domcontentloaded");
            yield* page.waitForLoadState("load");
            yield* page.waitForLoadState("networkidle");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should throw for bad state" ────────────────────────────────────
    // Upstream: waitForLoadState('bad') should throw with descriptive error.
    // TypeScript catches this at compile time via the WaitUntil union type,
    // but we also validate runtime error messaging for dynamic usage.

    test.live(
      "page-wait-for-load-state.spec.ts - should throw for bad state",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/one-style`);

              // Cast to any to bypass TypeScript's union type check
              const exit = yield* (page.waitForLoadState as any)("bad").pipe(Effect.exit);

              yield* assertTrue(Exit.isFailure(exit));
              if (Exit.isFailure(exit)) {
                const failure = Cause.findErrorOption(exit.cause);
                if (Option.isSome(failure)) {
                  // CdpError has a `reason` property which is the CommandError
                  // CommandError has a `description` field with the error message
                  const error = failure.value as any;
                  const description = error.reason?.description ?? "";
                  yield* assertContains(
                    description,
                    "state: expected one of (load|domcontentloaded|networkidle|commit)",
                  );
                }
              }
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)) as Effect.Effect<void, any, never>,
    );

    // ── frame.goto basic test ────────────────────────────────────────────
    // Verify that frame.goto works correctly before testing the more complex
    // waitForLoadState interaction with route interception.

    test.live("page-wait-for-load-state.spec.ts - frame.goto navigates child frame", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/frames/one-frame.html`);
            const frames = yield* page.frames;
            yield* assertTrue(frames.length === 2);
            const frame = frames[1];
            const initialUrl = yield* frame.url;
            yield* assertTrue(initialUrl.includes("frame.html"));

            yield* frame.goto(`${httpUrl}/empty.html`);

            const newUrl = yield* frame.url;
            yield* assertContains(newUrl, "/empty.html");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work for frame" ──────────────────────────────────────────
    // Upstream: navigate frame to one-style.html, stall CSS via route,
    // verify waitForLoadState waits for CSS to finish before resolving.
    //
    // Adapted from Playwright's test which uses frame.goto().
    // frame.goto() sends Page.navigate with frameId via CDP, which properly
    // registers the navigation before returning, avoiding the race condition
    // that would occur with page.evaluate(iframe.src = url).
    //
    // NOTE: We use TestServerClient.setHangRoute instead of page.route to
    // stall CSS because our Fetch-based route interception only applies to
    // the main page session, not child frame sessions.

    test.live(
      "page-wait-for-load-state.spec.ts - should work for frame",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/frames/one-frame.html`);
              const frames = yield* page.frames;
              const frame = frames[1];

              // Hang CSS at the server level so load never completes
              yield* TestServerClient.setHangRoute(httpUrl, "/one-style.css");

              yield* frame.goto(`${httpUrl}/one-style`, {
                waitUntil: "domcontentloaded",
              });

              let resolved = false;
              const loadFiber = yield* Effect.forkChild(
                Effect.gen(function* () {
                  yield* frame.waitForLoadState();
                  resolved = true;
                }),
              );

              // give the promise a chance to resolve (it shouldn't)
              yield* page.evaluate(() => 1);
              yield* assertTrue(!resolved);

              // Release the CSS — load should complete
              yield* TestServerClient.release(httpUrl, "/one-style.css");

              yield* Fiber.join(loadFiber);
              yield* assertTrue(resolved);
            }),
          );
        }).pipe(
          Effect.provide(Cdp.layer),
          Effect.ensuring(
            TestServerClient.release(httpUrl, "/one-style.css").pipe(
              Effect.andThen(TestServerClient.clear(httpUrl)),
              Effect.ignore,
            ),
          ),
        ) as Effect.Effect<void, any, never>,
    );

    // ── NOT_PLANNED: popup/newPage tests ────────────────────────────────────
    // `browser-cdp` does not support popup detection (no page.waitForEvent('popup'))
    // or newPage creation. These tests require browser context event APIs
    // that are outside `browser-cdp`'s scope.

    test.skip("page-wait-for-load-state.spec.ts - should work with pages that have loaded before being connected to [SKIP: NOT_PLANNED - popup support not in `browser-cdp`]", () =>
      Effect.void);

    test.skip("page-wait-for-load-state.spec.ts - should wait for load state of empty url popup [SKIP: NOT_PLANNED - popup support not in `browser-cdp`]", () =>
      Effect.void);

    test.skip("page-wait-for-load-state.spec.ts - should wait for load state of about:blank popup [SKIP: NOT_PLANNED - popup support not in `browser-cdp`]", () =>
      Effect.void);

    test.skip("page-wait-for-load-state.spec.ts - should wait for load state of about:blank popup with noopener [SKIP: NOT_PLANNED - popup support not in `browser-cdp`]", () =>
      Effect.void);

    test.skip("page-wait-for-load-state.spec.ts - should wait for load state of popup with network url [SKIP: NOT_PLANNED - popup support not in `browser-cdp`]", () =>
      Effect.void);

    test.skip("page-wait-for-load-state.spec.ts - should wait for load state of popup with network url and noopener [SKIP: NOT_PLANNED - popup support not in `browser-cdp`]", () =>
      Effect.void);

    test.skip("page-wait-for-load-state.spec.ts - should work with clicking target=_blank [SKIP: NOT_PLANNED - popup support not in `browser-cdp`]", () =>
      Effect.void);

    test.skip("page-wait-for-load-state.spec.ts - should wait for load state of newPage [SKIP: NOT_PLANNED - popup/newPage support not in `browser-cdp`]", () =>
      Effect.void);

    test.skip("page-wait-for-load-state.spec.ts - should resolve after popup load [SKIP: NOT_PLANNED - popup support not in `browser-cdp`]", () =>
      Effect.void);
  });
};
