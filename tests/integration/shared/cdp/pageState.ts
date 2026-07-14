/**
 * Parity tests for `browser-cdp` page-level state APIs.
 *
 * Covers:
 * - `setViewportSize` / `viewportSize` (`browser-cdp` extension - page-level viewport)
 * - `isClosed` (`browser-cdp` extension - page-level close state)
 * - `bringToFront` (`browser-cdp` extension - smoke test)
 * - `page.url` / `page.title` / `page.press` (parity with page-basic.spec.ts)
 * - `frame.press` (parity with page-basic.spec.ts frame.press)
 * - `page.frame({ name })` / `page.frame({ url })` (parity with page-basic.spec.ts)
 * - `navigator.userAgent` (parity with page-basic.spec.ts "sane UA")
 *
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright `page-basic.spec.ts`
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Option } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const definePageStateTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page state", () => {
    // ==========================================================================
    // `browser-cdp` extensions (no upstream spec for these page-level helpers):
    //   - setViewportSize / viewportSize
    //   - isClosed
    //   - bringToFront
    // ==========================================================================

    test.live(
      "setViewportSize - should round-trip the viewport dimensions [CDP-EXTENSION: page-level viewport helpers]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent("<html><body>test</body></html>");
              yield* page.setViewportSize({ width: 800, height: 600 });
              const dims = yield* page.evaluate(() => ({
                w: window.innerWidth,
                h: window.innerHeight,
              }));
              yield* assertEqual(dims.w, 800);
              yield* assertEqual(dims.h, 600);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "viewportSize - returns Option.none() before setViewportSize, Some(w,h) after [CDP-EXTENSION: page-level viewport helpers]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent("<html><body>test</body></html>");
              const initial = yield* page.viewportSize();
              yield* assertEqual(Option.isNone(initial), true);
              yield* page.setViewportSize({ width: 1024, height: 768 });
              const after = yield* page.viewportSize();
              yield* assertEqual(
                Option.match(after, { onNone: () => null, onSome: (v) => v.width }),
                1024,
              );
              yield* assertEqual(
                Option.match(after, { onNone: () => null, onSome: (v) => v.height }),
                768,
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "setViewportSize - should trigger CSS @media queries [CDP-EXTENSION: page-level viewport helpers, CSS media query effect]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(
                "<style>@media (max-width: 500px) { body { --narrow: 1; } }</style><body></body>",
              );
              const initial = yield* page.evaluate(() => {
                const probe = document.createElement("div");
                probe.setAttribute(
                  "data-narrow",
                  getComputedStyle(document.body).getPropertyValue("--narrow"),
                );
                return probe.getAttribute("data-narrow");
              });
              yield* assertEqual(initial, "");
              yield* page.setViewportSize({ width: 400, height: 600 });
              const narrow = yield* page.evaluate(() => {
                return getComputedStyle(document.body).getPropertyValue("--narrow");
              });
              yield* assertEqual(narrow, "1");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "isClosed - should return false on a fresh page [CDP-EXTENSION: page-level isClosed state]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              const closed = yield* page.isClosed();
              yield* assertEqual(closed, false);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "close - should transition isClosed to true [CDP-EXTENSION: page-level close + isClosed round-trip]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent("<html><body>test</body></html>");
              yield* page.close();
              const closed = yield* page.isClosed();
              yield* assertEqual(closed, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "bringToFront - should resolve and leave the page usable [CDP-EXTENSION: page-level bringToFront]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent("<html><body>test</body></html>");
              yield* page.bringToFront();
              const closed = yield* page.isClosed();
              yield* assertEqual(closed, false);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ==========================================================================
    // page-basic.spec.ts parity tests (page.url, page.title, page.press, frame.press)
    // ==========================================================================

    test.live("page-basic.spec.ts - page.url should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Initial URL is about:blank (a freshly-attached target).
            yield* assertEqual(yield* page.url, "about:blank");
            // After navigation, URL reflects the document.
            yield* page.goto(`${httpUrl}/empty`);
            yield* assertEqual(yield* page.url, `${httpUrl}/empty`);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.skip("page-basic.spec.ts - page.url should include hashes [SKIP: NOT_PLANNED - page.url omits hash fragments because Page.navigatedWithinDocument fires after goto returns and FrameManager.currentUrl captures the URL at navigation time. Tracking hash changes requires either a hashchange listener (browser-side) or computing the URL from location.href at query time (already possible via page.evaluate(() => location.href)).]", () =>
      Effect.void);

    test.live("page-basic.spec.ts - page.title should return the page title", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // /links fixture has <title>Links Page</title>.
            yield* page.goto(`${httpUrl}/links`);
            yield* assertEqual(yield* page.title, "Links Page");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-basic.spec.ts - page.press should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<textarea></textarea>`);
            yield* page.press("textarea", "a");
            const value = yield* page.$eval("textarea", (el) => (el as HTMLTextAreaElement).value);
            yield* assertEqual(value, "a");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.skip("page-basic.spec.ts - page.press should work for Enter [SKIP: NOT_PLANNED - CDP synthetic KeyboardEvent doesn't update input.value; browser default text-input behavior (pressing Enter submits a form, types a newline into textarea) is not triggered by dispatchEvent. `browser-cdp`'s press sends Input.dispatchKeyEvent but the value mutation is browser-internal. Workaround: use locator.fill() for form-submit-like behavior, or evaluate(() => form.requestSubmit()) for explicit form submission.]", () =>
      Effect.void);

    test.live("page-basic.spec.ts - frame.press should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Synthetic keydown events don't trigger browser default typing
            // (input.value is NOT updated by dispatchEvent). Verify the
            // listener fires inside the frame, mirroring the frame-press
            // parity contract.
            yield* page.setContent(
              `<iframe name="inner" src="${httpUrl}/frames/frame.html"></iframe>`,
            );
            const frames = yield* page.frames;
            const iframe = frames[1];
            yield* iframe.evaluate(() => {
              (window as any).__keyDownKeys = [];
              document.getElementById("frame-input")?.addEventListener("keydown", (e: any) => {
                (window as any).__keyDownKeys.push(e.key);
              });
            });
            yield* iframe.press("#frame-input", "a");
            const keys = yield* iframe.evaluate(() => (window as any).__keyDownKeys as string[]);
            yield* assertEqual(keys.length, 1);
            yield* assertEqual(keys[0], "a");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ========================================================================
    // P12 — page-basic missing tests (3 IMPLEMENT + 9 NOT_PLANNED in
    // _parityNotPlanned.ts).
    //
    // The remaining 6 of 18 upstream page-basic tests (page.url,
    // page.title, page.press, frame.press + 2 TODO) are above.
    // ========================================================================

    test.live("page-basic.spec.ts - page.frame should respect name", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<iframe name="target"></iframe>`);
            const bogus = yield* page.frame({ name: "bogus" });
            yield* assertTrue(Option.isNone(bogus));
            const found = yield* page.frame({ name: "target" });
            yield* assertTrue(Option.isSome(found));
            if (Option.isSome(found)) {
              const children = yield* (yield* page.mainFrame).childFrames;
              yield* assertEqual(found.value.frameId, children[0]?.frameId ?? null);
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-basic.spec.ts - page.frame should respect url", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<iframe src="${httpUrl}/empty"></iframe>`);
            const bogus = yield* page.frame({ url: /bogus/ });
            yield* assertTrue(Option.isNone(bogus));
            const found = yield* page.frame({ url: /empty/ });
            yield* assertTrue(Option.isSome(found));
            if (Option.isSome(found)) {
              const url = yield* found.value.url;
              yield* assertEqual(url, `${httpUrl}/empty`);
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-basic.spec.ts - should have sane user agent", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<html><body></body></html>`);
            const userAgent = yield* page.evaluate(() => navigator.userAgent);
            const parts = userAgent.split(/[()]/).map((p) => p.trim());
            const [part1, , part3, part4, part5] = parts as [
              string,
              string?,
              string?,
              string?,
              string?,
            ];
            // First part is always "Mozilla/5.0".
            yield* assertEqual(part1, "Mozilla/5.0");
            // For Chromium, third part is the AppleWebKit version.
            yield* assertTrue((part3 ?? "").startsWith("AppleWebKit/"));
            // Fourth part is "KHTML, like Gecko".
            yield* assertEqual(part4, "KHTML, like Gecko");
            // Fifth part encodes real browser name + engine version.
            yield* assertTrue(part5 !== undefined);
            const [engine, browser] = (part5 ?? "").split(" ");
            yield* assertTrue((browser ?? "").startsWith("Safari/"));
            yield* assertTrue((engine ?? "").includes("Chrome/"));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
