/**
 * Parity tests for `browser-cdp` page.reload/goBack/goForward — aligned with Playwright's page-history.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-history.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover:
 * - page.goBack() / page.goForward() navigation through browser history
 * - page.goBack() with HistoryAPI (pushState)
 * - page.reload() clearing page state, redirects, cross-process, hash
 *
 * Key differences from upstream:
 *   - Our goBack/goForward return void (not Response|null). Tests verify via
 *     page.url instead of inspecting the response object.
 *   - Our reload returns Option<Option<Response>>. Tests verify via page.url.
 *   - `browser-cdp` does not preserve the hash fragment in page.url, so hash tests
 *     verify the path portion only.
 *
 * Gap map (upstream tests → classification):
 *
 *   Live tests (this file):
 *     - "page.goBack should work" (smoke)
 *     - "page.goBack should work with HistoryAPI"
 *     - "goBack/goForward should work with bfcache-able pages"
 *     - "page.reload should work"
 *     - "page.reload should work with data url"
 *     - "page.reload should work with same origin redirect"
 *     - "page.reload should work with cross-origin redirect"
 *     - "page.reload should work on a page with a hash"
 *     - "page.reload should work on a page with a hash at the end"
 *
 *   NOT_PLANNED (requires APIs/infra not in `browser-cdp`):
 *     - "page.goBack should work for file urls" — file:// assets + waitForEvent('console')
 *     - "page.reload during renderer-initiated navigation" — text= selector + complex timing
 *     - "page.reload should not resolve with same-document navigation" — complex timing
 *     - "page.goBack during renderer-initiated navigation" — text= selector + complex timing
 *     - "page.goForward during renderer-initiated navigation" — text= selector + complex timing
 *     - "regression test for issue 20791" — onConsole + iframe console
 *     - "should reload proper page" — popup + locator
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Option } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { CROSS_PROCESS_PREFIX, TestServerClient } from "../../../setup/http-server/Client.js";
import { assertContains, assertEqual } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineHistoryTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe, beforeEach } = api;
  const { wsUrl, httpUrl } = config;

  describe("page-history.spec.ts parity", () => {
    // Clear dynamic routes before each test to prevent route poisoning
    beforeEach(() => TestServerClient.clear(httpUrl).pipe(Effect.ignore));

    // ── "page.goBack should work" @smoke ───────────────────────────────
    // Upstream: goBack returns null when no history, then navigates.
    // Our goBack returns void — we verify via page.url.

    test.live("page-history.spec.ts - page.goBack should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // goBack with no history — does nothing (URL unchanged)
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.goto(`${httpUrl}/grid`);
            yield* assertContains(yield* page.url, "/grid");

            // goBack → should be at /empty
            yield* page.goBack();
            yield* assertContains(yield* page.url, "/empty");

            // goForward → should be at /grid
            yield* page.goForward();
            yield* assertContains(yield* page.url, "/grid");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "page.goBack should work with HistoryAPI" ──────────────────────
    // Upstream: uses history.pushState, then goBack/goForward

    test.live("page-history.spec.ts - page.goBack should work with HistoryAPI", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.evaluate(() => {
              history.pushState({}, "", "/first.html");
              history.pushState({}, "", "/second.html");
            });
            yield* assertContains(yield* page.url, "/second.html");

            yield* page.goBack();
            yield* assertContains(yield* page.url, "/first.html");
            yield* page.goBack();
            yield* assertContains(yield* page.url, "/empty");
            yield* page.goForward();
            yield* assertContains(yield* page.url, "/first.html");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "goBack/goForward should work with bfcache-able pages" ──────────
    // Upstream: navigate to bfcached page, click link, goBack/goForward.
    // Adapted: navigate directly via goto (click-triggered navigation has
    // timing issues with our click impl which doesn't auto-wait for nav).
    // The core behavior under test is goBack/goForward across history.

    test.live("page-history.spec.ts - goBack/goForward should work with bfcache-able pages", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/grid`);
            yield* page.goto(`${httpUrl}/empty`);
            yield* assertContains(yield* page.url, "/empty");

            // goBack → should be at /grid
            yield* page.goBack();
            yield* assertContains(yield* page.url, "/grid");

            // goForward → should be at /empty
            yield* page.goForward();
            yield* assertContains(yield* page.url, "/empty");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "page.reload should work" ──────────────────────────────────────
    // Upstream: set window var, reload, verify cleared

    test.live("page-history.spec.ts - page.reload should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.evaluate(() => {
              (window as any)["_foo"] = 10;
            });
            yield* page.reload();
            const foo = yield* page.evaluate(() => (window as any)["_foo"]);
            yield* assertEqual(foo, undefined);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "page.reload should work with data url" ─────────────────────────
    // Upstream: reload data: URL returns null (no network response)

    test.live("page-history.spec.ts - page.reload should work with data url", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto("data:text/html,hello");
            const content1 = yield* page.content;
            yield* assertContains(content1, "hello");
            // Reload of data: URL returns Option.none() (internal URL)
            const responseOption = yield* page.reload();
            yield* assertEqual(Option.isNone(responseOption), true);
            const content2 = yield* page.content;
            yield* assertContains(content2, "hello");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "page.reload should work with same origin redirect" ──────────────

    test.live("page-history.spec.ts - page.reload should work with same origin redirect", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Set redirect: /empty → /grid (same origin)
            yield* TestServerClient.setRedirectRoute(httpUrl, "/empty", `${httpUrl}/grid`);
            yield* page.reload();
            yield* assertContains(yield* page.url, "/grid");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "page.reload should work with cross-origin redirect" ─────────────
    // Upstream: redirects to CROSS_PROCESS_PREFIX (127.0.0.1 vs localhost)

    test.live("page-history.spec.ts - page.reload should work with cross-origin redirect", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Set redirect to cross-process origin
            yield* TestServerClient.setRedirectRoute(
              httpUrl,
              "/empty",
              `${CROSS_PROCESS_PREFIX}/grid`,
            );
            yield* page.reload();
            // Verify cross-process URL
            yield* assertContains(yield* page.url, "127.0.0.1");
            yield* assertContains(yield* page.url, "/grid");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "page.reload should work on a page with a hash" ──────────────────
    // Note: `browser-cdp` does not preserve the hash fragment in page.url, so we
    // verify the path portion and that reload completes without error.

    test.live("page-history.spec.ts - page.reload should work on a page with a hash", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty#hash`);
            yield* page.reload();
            // Hash is not preserved in page.url by `browser-cdp`; verify path
            yield* assertContains(yield* page.url, "/empty");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "page.reload should work on a page with a hash at the end" ───────

    test.live(
      "page-history.spec.ts - page.reload should work on a page with a hash at the end",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty#`);
              yield* page.reload();
              yield* assertContains(yield* page.url, "/empty");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── NOT_PLANNED skip markers ─────────────────────────────────────────

    test.skip("page-history.spec.ts - page.goBack should work for file urls [SKIP: NOT_PLANNED - requires file:// asset handling and waitForEvent('console')]", () =>
      Effect.void);

    test.skip("page-history.spec.ts - page.reload during renderer-initiated navigation [SKIP: NOT_PLANNED - requires text= selector and complex navigation interruption timing]", () =>
      Effect.void);

    test.skip("page-history.spec.ts - page.reload should not resolve with same-document navigation [SKIP: NOT_PLANNED - requires complex server stalling and pushState timing]", () =>
      Effect.void);

    test.skip("page-history.spec.ts - page.goBack during renderer-initiated navigation [SKIP: NOT_PLANNED - requires text= selector and complex navigation interruption timing]", () =>
      Effect.void);

    test.skip("page-history.spec.ts - page.goForward during renderer-initiated navigation [SKIP: NOT_PLANNED - requires text= selector and complex navigation interruption timing]", () =>
      Effect.void);

    test.skip("page-history.spec.ts - regression test for issue 20791 [SKIP: NOT_PLANNED - requires onConsole event and iframe console access]", () =>
      Effect.void);

    test.skip("page-history.spec.ts - should reload proper page [SKIP: NOT_PLANNED - requires popup support and Locator API]", () =>
      Effect.void);
  });
};
