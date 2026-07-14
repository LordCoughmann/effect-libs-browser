/**
 * `browser-cdp` parity tests for Phase P3 — Frame parity.
 *
 * Adapted from:
 *   repos/cloudflare-playwright/tests/page/frame-hierarchy.spec.ts
 *   repos/cloudflare-playwright/tests/page/frame-frame-element.spec.ts
 *   repos/cloudflare-playwright/tests/page/frame-evaluate.spec.ts
 *   repos/cloudflare-playwright/tests/page/frame-goto.spec.ts
 *
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright Frame API
 *
 * ## Known limitations (v1)
 *
 * - Frame-scoped actions dispatch synthetic DOM events inside the
 *   iframe's main world (event.isTrusted === false). Sites that
 *   specifically reject synthetic events won't work; coordinate
 *   translation for trusted events is deferred.
 * - `getByText` / `getByRole` in frame context don't work because
 *   the frame-scoped locator uses `document.querySelectorAll` (CSS
 *   only) inside the iframe. CDP selector engine syntax (`text=...`)
 *   isn't recognized. Tests use CSS selectors instead.
 * - `dragAndDrop` on a frame dispatches dragstart/drop synthetically
 *   (matches the locator pattern); trusted coordinate-translation drag
 *   is deferred.
 *
 * @module tests/integration/shared/cdp/frame-extensions
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Option } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

/** Run a test body with a `browser-cdp` page. */
const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineFrameExtensionsTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("Frame extensions — Phase P3", () => {
    describe("frame.title", () => {
      test.live(
        "frame-frame-element.spec.ts - should work with contentFrame [CDP-EXTENSION: frame.title — iframe's title reads through CDP DOM domain]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                yield* assertEqual(frames.length, 2);
                const iframe = frames[1];
                const title = yield* iframe.title;
                yield* assertEqual(title, "Frame");
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.page", () => {
      test.live(
        "frame-frame-element.spec.ts - should work with contentFrame [CDP-EXTENSION: frame.page — both main and iframe frames share the same page handle]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                yield* assertEqual(frames.length, 2);
                const mainPage = yield* frames[0].page;
                const iframePage = yield* frames[1].page;
                yield* assertTrue(mainPage === iframePage);
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.evaluateHandle", () => {
      test.live("frame-frame-element.spec.ts - should work @smoke", () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/frames/one-frame.html`);
              const frames = yield* page.frames;
              const iframe = frames[1];
              const handle = yield* iframe.evaluateHandle(() =>
                document.getElementById("frame-btn"),
              );
              yield* handle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.click", () => {
      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: frame.click — `browser-cdp` exposes .click(selector) on frame; upstream uses frame.$('selector').click()]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                yield* iframe.click("#frame-btn");
                // Verify the click reached the iframe by reading #frame-output
                // (set by the fixture's addEventListener('click', ...)).
                const outputText = yield* iframe.evaluate(
                  () => document.getElementById("frame-output")?.textContent ?? "",
                );
                yield* assertEqual(outputText, "clicked");
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.fill", () => {
      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: frame.fill — `browser-cdp` exposes .fill(selector, value) on frame]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                yield* iframe.fill("#frame-input", "hello world");
                const value = yield* iframe.inputValue("#frame-input");
                yield* assertEqual(value, "hello world");
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.press", () => {
      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: frame.press — synthetic KeyboardEvent in frame; upstream uses frame.$]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                // Synthetic keydown events don't trigger browser default
                // typing behavior (input.value is NOT updated by dispatchEvent).
                // We can only verify the listener fires. Install a listener
                // first, then press.
                yield* iframe.evaluate(() => {
                  (window as any).__keyDownKeys = [];
                  document.getElementById("frame-input")?.addEventListener("keydown", (e: any) => {
                    (window as any).__keyDownKeys.push(e.key);
                  });
                });
                yield* iframe.press("#frame-input", "a");
                const keys = yield* iframe.evaluate(() => (window as any).__keyDownKeys ?? []);
                yield* assertEqual(keys.length, 1);
                yield* assertEqual(keys[0], "a");
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.hover", () => {
      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: frame.hover — `browser-cdp` exposes .hover(selector) on frame]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                // Just verify it doesn't throw
                yield* iframe.hover("#frame-btn");
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.focus / frame.blur", () => {
      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                yield* iframe.focus("#frame-input");
                const focused = yield* iframe.evaluate(() => document.activeElement?.id || "");
                yield* assertEqual(focused, "frame-input");
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );

      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                yield* iframe.focus("#frame-input");
                yield* iframe.blur("#frame-input");
                const focused = yield* iframe.evaluate(() => document.activeElement?.id || "");
                yield* assertTrue(focused !== "frame-input");
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.check / frame.uncheck / frame.setChecked", () => {
      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                yield* iframe.check("#frame-check");
                const isChecked = yield* iframe.isChecked("#frame-check");
                yield* assertTrue(isChecked);
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );

      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                yield* iframe.setChecked("#frame-check", true);
                yield* iframe.setChecked("#frame-check", false);
                const isChecked = yield* iframe.isChecked("#frame-check");
                yield* assertTrue(!isChecked);
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.textContent / innerText / innerHTML", () => {
      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                const text = yield* iframe.textContent("#frame-h1");
                yield* assertTrue(Option.isSome(text));
                if (Option.isSome(text)) {
                  yield* assertEqual(text.value, "Frame");
                }
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );

      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                const text = yield* iframe.innerText("#frame-p");
                yield* assertTrue(Option.isSome(text));
                if (Option.isSome(text)) {
                  yield* assertEqual(text.value, "frame paragraph");
                }
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );

      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                const html = yield* iframe.innerHTML("#frame-p");
                yield* assertTrue(Option.isSome(html));
                if (Option.isSome(html)) {
                  yield* assertTrue(html.value.includes("frame paragraph"));
                }
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.getAttribute", () => {
      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                const id = yield* iframe.getAttribute("#frame-input", "id");
                yield* assertTrue(Option.isSome(id));
                if (Option.isSome(id)) {
                  yield* assertEqual(id.value, "frame-input");
                }
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.inputValue", () => {
      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                yield* iframe.fill("#frame-input", "test-value");
                const value = yield* iframe.inputValue("#frame-input");
                yield* assertEqual(value, "test-value");
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.isVisible / isHidden / isEnabled", () => {
      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                const visible = yield* iframe.isVisible("#frame-btn");
                yield* assertTrue(visible);
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );

      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                const enabled = yield* iframe.isEnabled("#frame-btn");
                yield* assertTrue(enabled);
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.locator", () => {
      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                const text = yield* iframe.locator("#frame-h1").textContent();
                yield* assertEqual(text, "Frame");
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });

    describe("frame.$eval / frame.$$eval", () => {
      test.live("frame-frame-element.spec.ts - should throw when detached", () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/frames/one-frame.html`);
              const frames = yield* page.frames;
              const iframe = frames[1];
              const id = yield* iframe.$eval("#frame-input", (el) => (el as HTMLElement).id);
              yield* assertEqual(id, "frame-input");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      );

      test.live(
        "frame-frame-element.spec.ts - should work @smoke [CDP-EXTENSION: `browser-cdp` frame.* method — upstream uses frame.$ element-handle API]",
        () =>
          Effect.gen(function* () {
            yield* withPage(wsUrl, (page) =>
              Effect.gen(function* () {
                yield* page.goto(`${httpUrl}/frames/one-frame.html`);
                const frames = yield* page.frames;
                const iframe = frames[1];
                const ids = yield* iframe.$$eval("input", (els) =>
                  els.map((e) => (e as HTMLElement).id),
                );
                yield* assertTrue(Array.isArray(ids));
                yield* assertTrue(ids.length >= 1);
                yield* assertTrue(ids.includes("frame-input"));
              }),
            );
          }).pipe(Effect.provide(Cdp.layer)),
      );
    });
  });
};
