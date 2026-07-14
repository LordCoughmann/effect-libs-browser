/**
 * Parity tests for `browser-cdp` page.emulateMedia.
 *
 * Mirrors Playwright's `page.emulateMedia({ colorScheme?, reducedMotion?, ... })`.
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 *
 * Behavior verified:
 * - emulate type (screen / print / null) toggles matchMedia('screen'|'print')
 * - colorScheme "dark" makes matchMedia('(prefers-color-scheme: dark)') match
 * - reducedMotion "reduce" makes matchMedia('(prefers-reduced-motion: reduce)') match
 * - forcedColors "active" / "none" / "null" toggles matchMedia('(forced-colors: ...))')
 * - colorScheme / reducedMotion / forcedColors accept "null" to clear emulation
 * - bad media argument throws CdpError
 * - bad colorScheme argument throws CdpError
 * - colorScheme/emulation survives across navigation
 * - emulateMedia actually changes computed CSS colors
 * - reducedMotion + forcedColors persist after page reload
 *
 * NOTE: `contrast` is NOT supported by `browser-cdp`'s `Emulation.setEmulatedMedia` for
 * the `prefers-contrast` feature in a way Playwright exposes. Marked
 * `[SKIP: NOT_PLANNED - prefers-contrast not supported]`.
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Fiber, Result } from "effect";

import { Cdp, CdpError } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineEmulateMediaTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.emulateMedia", () => {
    // ── P8: emulate type (screen / print / null) ──────────────────────────

    test.live("page-emulate-media.spec.ts - should emulate type", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>test</div>");

            // Defaults: screen matches, print does not.
            const initialScreen = yield* page.evaluate(() => matchMedia("screen").matches);
            const initialPrint = yield* page.evaluate(() => matchMedia("print").matches);
            yield* assertEqual(initialScreen, true);
            yield* assertEqual(initialPrint, false);

            // Switch to print.
            yield* page.emulateMedia({ media: "print" });
            const afterPrintScreen = yield* page.evaluate(() => matchMedia("screen").matches);
            const afterPrintPrint = yield* page.evaluate(() => matchMedia("print").matches);
            yield* assertEqual(afterPrintScreen, false);
            yield* assertEqual(afterPrintPrint, true);

            // Clear emulation (null = clear).
            yield* page.emulateMedia({ media: "null" });
            const clearedScreen = yield* page.evaluate(() => matchMedia("screen").matches);
            const clearedPrint = yield* page.evaluate(() => matchMedia("print").matches);
            yield* assertEqual(clearedScreen, true);
            yield* assertEqual(clearedPrint, false);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: throw on bad media argument ──────────────────────────────────

    test.live("page-emulate-media.spec.ts - should throw in case of bad media argument", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>test</div>");
            const result = yield* Effect.result(
              // Cast to bypass type-check — emulateMedia must reject the bad
              // value at runtime, not compile time.
              page.emulateMedia({ media: "bad" as unknown as "screen" }),
            );
            if (Result.isSuccess(result)) {
              return yield* Effect.fail("Expected emulateMedia to fail with bad media argument");
            }
            yield* assertTrue(result.failure instanceof CdpError);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: emulate colorScheme ───────────────────────────────────────────

    test.live("page-emulate-media.spec.ts - should emulate colorScheme should work @smoke", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>test</div>");

            // Default: no emulation
            const before = yield* page.evaluate(
              () => matchMedia("(prefers-color-scheme: dark)").matches,
            );
            yield* assertEqual(before, false);

            yield* page.emulateMedia({ colorScheme: "dark" });
            const after = yield* page.evaluate(
              () => matchMedia("(prefers-color-scheme: dark)").matches,
            );
            yield* assertEqual(after, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: emulate reduced motion ────────────────────────────────────────

    test.live("page-emulate-media.spec.ts - should emulate reduced motion", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>test</div>");

            yield* page.emulateMedia({ reducedMotion: "reduce" });
            const matches = yield* page.evaluate(
              () => matchMedia("(prefers-reduced-motion: reduce)").matches,
            );
            yield* assertEqual(matches, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: default to light ──────────────────────────────────────────────

    test.live("page-emulate-media.spec.ts - should default to light", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>test</div>");

            // Set dark
            yield* page.emulateMedia({ colorScheme: "dark" });
            const isDark = yield* page.evaluate(
              () => matchMedia("(prefers-color-scheme: dark)").matches,
            );
            yield* assertEqual(isDark, true);

            // Clear emulation
            yield* page.emulateMedia({ colorScheme: "null" });
            const isLight = yield* page.evaluate(
              () => matchMedia("(prefers-color-scheme: light)").matches,
            );
            const isStillDark = yield* page.evaluate(
              () => matchMedia("(prefers-color-scheme: dark)").matches,
            );
            // After clear: should match "no-preference" which is neither light nor dark
            // (the default state for Chrome is light, so light should match)
            yield* assertEqual(isLight, true);
            yield* assertEqual(isStillDark, false);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: throw on bad colorScheme argument ─────────────────────────────

    test.live("page-emulate-media.spec.ts - should throw in case of bad colorScheme argument", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>test</div>");
            const result = yield* Effect.result(
              page.emulateMedia({
                colorScheme: "bad" as unknown as "light",
              }),
            );
            if (Result.isSuccess(result)) {
              return yield* Effect.fail(
                "Expected emulateMedia to fail with bad colorScheme argument",
              );
            }
            yield* assertTrue(result.failure instanceof CdpError);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: work during navigation ────────────────────────────────────────

    test.live("page-emulate-media.spec.ts - should work during navigation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.emulateMedia({ colorScheme: "light" });
            // Navigate while toggling colorScheme. The final state
            // (dark, since i=8 is even and 8 & 1 = 0 → dark) should be
            // visible after navigation.
            const nav = yield* Effect.forkChild(page.goto(`${httpUrl}/empty`));
            for (let i = 0; i < 9; i++) {
              yield* Effect.all(
                [
                  page.emulateMedia({ colorScheme: i % 2 === 0 ? "dark" : "light" }),
                  Effect.sleep("1 millis"),
                ],
                { concurrency: 1 },
              );
            }
            yield* Fiber.join(nav);

            const isDark = yield* page.evaluate(
              () => matchMedia("(prefers-color-scheme: dark)").matches,
            );
            yield* assertEqual(isDark, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: change the actual colors in CSS ───────────────────────────────

    test.live("page-emulate-media.spec.ts - should change the actual colors in css", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`
              <style>
                @media (prefers-color-scheme: dark) {
                  div { background: black; color: white; }
                }
                @media (prefers-color-scheme: light) {
                  div { background: white; color: black; }
                }
              </style>
              <div id="t">Hello</div>
            `);

            yield* page.emulateMedia({ colorScheme: "light" });
            const lightBg = yield* page.evaluate(
              () => getComputedStyle(document.getElementById("t")!).backgroundColor,
            );
            yield* assertEqual(lightBg, "rgb(255, 255, 255)");

            yield* page.emulateMedia({ colorScheme: "dark" });
            const darkBg = yield* page.evaluate(
              () => getComputedStyle(document.getElementById("t")!).backgroundColor,
            );
            yield* assertEqual(darkBg, "rgb(0, 0, 0)");

            yield* page.emulateMedia({ colorScheme: "light" });
            const lightBgAgain = yield* page.evaluate(
              () => getComputedStyle(document.getElementById("t")!).backgroundColor,
            );
            yield* assertEqual(lightBgAgain, "rgb(255, 255, 255)");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: keep reduced motion and color emulation after reload ──────────

    test.live(
      "page-emulate-media.spec.ts - should keep reduced motion and color emulation after reload",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              // Set emulation before navigation.
              yield* page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });

              // Navigate to a fresh page.
              yield* page.goto(`${httpUrl}/empty`);

              // The emulation should persist.
              const reducedMotion = yield* page.evaluate(
                () => matchMedia("(prefers-reduced-motion: reduce)").matches,
              );
              const forcedColors = yield* page.evaluate(
                () => matchMedia("(forced-colors: active)").matches,
              );
              yield* assertEqual(reducedMotion, true);
              yield* assertEqual(forcedColors, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: emulate forcedColors ──────────────────────────────────────────

    test.live("page-emulate-media.spec.ts - should emulate forcedColors", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>test</div>");

            // Default: forced-colors none matches.
            const initialNone = yield* page.evaluate(
              () => matchMedia("(forced-colors: none)").matches,
            );
            yield* assertEqual(initialNone, true);

            // Activate forced colors.
            yield* page.emulateMedia({ forcedColors: "active" });
            const activeNone = yield* page.evaluate(
              () => matchMedia("(forced-colors: none)").matches,
            );
            const activeActive = yield* page.evaluate(
              () => matchMedia("(forced-colors: active)").matches,
            );
            yield* assertEqual(activeNone, false);
            yield* assertEqual(activeActive, true);

            // Clear emulation.
            yield* page.emulateMedia({ forcedColors: "null" });
            const clearedNone = yield* page.evaluate(
              () => matchMedia("(forced-colors: none)").matches,
            );
            yield* assertEqual(clearedNone, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: emulate contrast [NOT_PLANNED] ────────────────────────────────

    test.live(
      "page-emulate-media.spec.ts - should emulate contrast [SKIP: NOT_PLANNED - prefers-contrast not supported by `browser-cdp` emulateMedia]",
      () => Effect.void,
    );
  });
};
