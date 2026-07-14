/**
 * Parity tests for `browser-cdp` page.setExtraHTTPHeaders() - aligned with Playwright's page-set-extra-http-headers.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-set-extra-http-headers.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover:
 * - Setting extra headers that are sent with every request
 * - Headers persisting across redirects
 * - Validation of non-string header values
 *
 * Key differences from upstream:
 *   - No browser context API (`browser-cdp` operates at page level only)
 *   - Header value validation happens via CDP protocol, not client-side
 *   - Request header inspection via page.waitForRequest (CDP network events)
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   Browser context API (not applicable to `browser-cdp`):
 *     - "should work with extra headers from browser context" → NOT_PLANNED skip below
 *
 *   Referer handling (Chromium known issue):
 *     - "should not duplicate referer header" → NOT_PLANNED skip below
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Result } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { TestServerClient } from "../../../setup/http-server/Client.js";
import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineExtraHttpHeadersTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe, beforeEach } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.setExtraHTTPHeaders parity", () => {
    // Clear dynamic routes before each test to prevent route poisoning
    beforeEach(() => TestServerClient.clear(httpUrl).pipe(Effect.ignore));

    // ── "should work" ────────────────────────────────────────────────────
    // Upstream: it('should work @smoke')

    test.live("page-set-extra-http-headers.spec.ts - should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate first to establish session
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setExtraHTTPHeaders({ foo: "bar" });
            // Now navigate again — extra headers should be sent
            const request = yield* page.waitForRequest(`${httpUrl}/empty`);
            yield* page.goto(`${httpUrl}/empty`);
            const info = yield* request;
            yield* assertEqual(info.headers["foo"], "bar");
            yield* assertTrue(info.headers["baz"] === undefined);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with redirects" ─────────────────────────────────────
    // Upstream: it('should work with redirects')

    test.live("page-set-extra-http-headers.spec.ts - should work with redirects", () =>
      Effect.gen(function* () {
        // Serve a page that does a JS redirect to /empty
        yield* TestServerClient.setRespondRoute(
          httpUrl,
          "/redirector",
          `<script>window.location.href = "${httpUrl}/empty";</script>`,
          undefined,
          "text/html",
        );
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate first to establish session
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setExtraHTTPHeaders({ foo: "bar" });
            // Now navigate to the redirecting page — headers should persist
            const request = yield* page.waitForRequest(`${httpUrl}/empty`);
            yield* page.goto(`${httpUrl}/redirector`);
            const info = yield* request;
            yield* assertEqual(info.headers["foo"], "bar");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with extra headers from browser context" ───────────
    // Upstream: it('should work with extra headers from browser context')
    // `browser-cdp` operates at page level only — no browser context API.

    test.skip("page-set-extra-http-headers.spec.ts - should work with extra headers from browser context [SKIP: NOT_PLANNED - no browser context API in `browser-cdp`]", () =>
      Effect.void);

    // ── "should throw for non-string header values" ──────────────────────
    // Upstream: it('should throw for non-string header values')
    // CDP protocol will reject non-string values via Network.setExtraHTTPHeaders

    test.live(
      "page-set-extra-http-headers.spec.ts - should throw for non-string header values",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              // Navigate first to establish session
              yield* page.goto(`${httpUrl}/empty`);
              // CDP Network.setExtraHTTPHeaders expects all values to be strings
              // Passing a number should cause an error
              const result = yield* Effect.result(page.setExtraHTTPHeaders({ foo: 1 as any }));
              yield* assertTrue(Result.isFailure(result));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
    // ── "should not duplicate referer header" ────────────────────────────
    // Upstream: it('should not duplicate referer header')
    // Upstream marks this as it.fail(browserName === 'chromium') because Chromium
    // sends both 'referer' and 'Referer' headers. Since our `browser-cdp` targets
    // Chromium exclusively, this behavior is expected and known.

    test.skip("page-set-extra-http-headers.spec.ts - should not duplicate referer header [SKIP: NOT_PLANNED - Chromium sends both referer and Referer headers]", () =>
      Effect.void);
  });
};
