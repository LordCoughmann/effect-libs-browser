/**
 * Parity tests for `browser-cdp` page.setViewportSize() - aligned with Playwright's browsercontext-viewport.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/library/browsercontext-viewport.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover:
 * - Setting viewport size and verifying via window.innerWidth/innerHeight
 * - Verifying outerWidth/outerHeight
 * - Device emulation via media queries
 *
 * Key differences from upstream:
 *   - `browser-cdp` uses setViewportSize() method
 *   - Tests use page.evaluate() to verify dimensions
 *   - No locator API — use selectors directly
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineViewportTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.setViewportSize parity", () => {
    // ── "should set the proper viewport size" ─────────────────────────────
    // Adapted from upstream: browsercontext-viewport.spec.ts

    test.live("browsercontext-viewport.spec.ts - should set viewport size", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);

            // Set new viewport
            yield* page.setViewportSize({ width: 345, height: 456 });

            // Verify new size
            const newSize = yield* page.evaluate(() => ({
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
            }));
            yield* assertEqual(newSize.innerWidth, 345);
            yield* assertEqual(newSize.innerHeight, 456);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should return correct outerWidth and outerHeight" ────────────────
    // Adapted from upstream: browsercontext-viewport.spec.ts

    test.live("browsercontext-viewport.spec.ts - should affect outerWidth and outerHeight", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setViewportSize({ width: 410, height: 420 });

            const size = yield* page.evaluate(() => ({
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              outerWidth: window.outerWidth,
              outerHeight: window.outerHeight,
            }));

            yield* assertEqual(size.innerWidth, 410);
            yield* assertEqual(size.innerHeight, 420);
            yield* assertTrue(size.outerWidth >= size.innerWidth);
            yield* assertTrue(size.outerHeight >= size.innerHeight);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should emulate device width" ─────────────────────────────────────
    // Adapted from upstream: browsercontext-viewport.spec.ts

    test.live(
      "browsercontext-viewport.spec.ts - should affect screen.width and device media queries",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setViewportSize({ width: 300, height: 300 });

              // screen.width should match viewport width when device emulation is active
              const screenWidth = yield* page.evaluate(() => window.screen.width);
              yield* assertEqual(screenWidth, 300);

              // Media query device-width should match
              const matchesDeviceWidth = yield* page.evaluate(
                () => matchMedia("(device-width: 300px)").matches,
              );
              yield* assertTrue(matchesDeviceWidth);

              // min-device-width: 200px should match
              const matchesMinDeviceWidth = yield* page.evaluate(
                () => matchMedia("(min-device-width: 200px)").matches,
              );
              yield* assertTrue(matchesMinDeviceWidth);

              // min-device-width: 400px should NOT match
              const matchesMinDeviceWidth400 = yield* page.evaluate(
                () => matchMedia("(min-device-width: 400px)").matches,
              );
              yield* assertTrue(!matchesMinDeviceWidth400);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should emulate device height" ────────────────────────────────────
    // Adapted from upstream: browsercontext-viewport.spec.ts

    test.live(
      "browsercontext-viewport.spec.ts - should affect screen.height and device-height media queries",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setViewportSize({ width: 300, height: 300 });

              const screenHeight = yield* page.evaluate(() => window.screen.height);
              yield* assertEqual(screenHeight, 300);

              const matchesDeviceHeight = yield* page.evaluate(
                () => matchMedia("(device-height: 300px)").matches,
              );
              yield* assertTrue(matchesDeviceHeight);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should emulate availWidth and availHeight" ───────────────────────
    // Adapted from upstream: browsercontext-viewport.spec.ts

    test.live(
      "browsercontext-viewport.spec.ts - should affect screen.availWidth and availHeight",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setViewportSize({ width: 500, height: 600 });

              const availWidth = yield* page.evaluate(() => window.screen.availWidth);
              yield* assertEqual(availWidth, 500);

              const availHeight = yield* page.evaluate(() => window.screen.availHeight);
              yield* assertEqual(availHeight, 600);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should change viewport multiple times" ───────────────────────────
    // Verify viewport can be changed multiple times

    test.live("browsercontext-viewport.spec.ts - should change viewport multiple times", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);

            // First change
            yield* page.setViewportSize({ width: 100, height: 200 });
            const size1 = yield* page.evaluate(() => ({
              width: window.innerWidth,
              height: window.innerHeight,
            }));
            yield* assertEqual(size1.width, 100);
            yield* assertEqual(size1.height, 200);

            // Second change
            yield* page.setViewportSize({ width: 500, height: 600 });
            const size2 = yield* page.evaluate(() => ({
              width: window.innerWidth,
              height: window.innerHeight,
            }));
            yield* assertEqual(size2.width, 500);
            yield* assertEqual(size2.height, 600);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
