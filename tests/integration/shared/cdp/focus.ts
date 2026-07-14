/**
 * Parity tests for `browser-cdp` page.focus() - aligned with Playwright's page-focus.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-focus.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover:
 * - Focusing elements by selector
 * - Verifying activeElement after focus
 * - Tab traversal between inputs
 * - Focus/blur event emission
 *
 * Key differences from upstream:
 *   - `browser-cdp` focus uses evaluate-based el.focus(), not CDP Input domain
 *   - No browser context or browserName filtering (single Chromium engine)
 *   - No page.locator() — use page.focus() with selector directly
 *   - page.exposeFunction not available — use evaluate to track events via DOM
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   Platform-specific (not applicable):
 *     - "should traverse only form elements" — WebKit/macOS only, Alt+Tab link traversal
 *     - "tab should cycle between single input and browser" — headless Chromium fixme
 *     - "tab should cycle between document elements and browser" — headless Chromium fixme
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertDeepEqual } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineFocusTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl } = config;

  describe("page.focus parity", () => {
    // ── "should work" ────────────────────────────────────────────────────
    // Upstream: it('should work @smoke')

    test.live("page-focus.spec.ts - should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<div id=d1 tabIndex=0></div>`);
            const before = yield* page.evaluate(() => document.activeElement!.nodeName);
            yield* assertEqual(before, "BODY");
            yield* page.focus("#d1");
            const after = yield* page.evaluate(() => document.activeElement!.id);
            yield* assertEqual(after, "d1");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should traverse focus in all directions')
    // Fixed: Tab was incorrectly dispatched with text property, causing double Tab.
    // Now uses rawKeyDown (matching Playwright) and supports modifier combos.

    test.live("page-focus.spec.ts - should traverse focus in all directions", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              `<input id="i1" value="1"><input id="i2" value="2"><input id="i3" value="3">`,
            );
            // Focus first input explicitly
            yield* page.focus("#i1");
            yield* assertEqual(
              yield* page.evaluate(() => (document.activeElement as HTMLInputElement).value),
              "1",
            );
            // Tab to second input
            yield* page.press("#i1", "Tab");
            yield* assertEqual(
              yield* page.evaluate(() => (document.activeElement as HTMLInputElement).value),
              "2",
            );
            // Tab to third input
            yield* page.press("#i2", "Tab");
            yield* assertEqual(
              yield* page.evaluate(() => (document.activeElement as HTMLInputElement).value),
              "3",
            );
            // Shift+Tab back to second
            yield* page.press("#i3", "Shift+Tab");
            yield* assertEqual(
              yield* page.evaluate(() => (document.activeElement as HTMLInputElement).value),
              "2",
            );
            // Shift+Tab back to first
            yield* page.press("#i2", "Shift+Tab");
            yield* assertEqual(
              yield* page.evaluate(() => (document.activeElement as HTMLInputElement).value),
              "1",
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should emit focus event" ──────────────────────────────────────
    // Upstream: it('should emit focus event')
    // Uses evaluate-based event tracking instead of exposeFunction.

    test.live("page-focus.spec.ts - should emit focus event", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`
              <div id=d1 tabIndex=0></div>
              <script>
                window._focused = false;
                document.getElementById('d1').addEventListener('focus', () => { window._focused = true; });
              </script>
            `);
            yield* page.focus("#d1");
            const focused = yield* page.evaluate(() => (window as any)._focused);
            yield* assertEqual(focused, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should emit blur event" ────────────────────────────────────────
    // Upstream: it('should emit blur event')
    // Uses evaluate-based event tracking instead of exposeFunction.

    test.live("page-focus.spec.ts - should emit blur event", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`
              <div id=d1 tabIndex=0>DIV1</div>
              <div id=d2 tabIndex=0>DIV2</div>
              <script>
                window._events = [];
                d1.addEventListener('focus', () => window._events.push('focus-d1'));
                d1.addEventListener('blur', () => window._events.push('blur-d1'));
                d2.addEventListener('focus', () => window._events.push('focus-d2'));
              </script>
            `);
            yield* page.focus("#d1");
            const beforeBlur = yield* page.evaluate(() => (window as any)._events);
            yield* assertDeepEqual(beforeBlur, ["focus-d1"]);
            yield* page.focus("#d2");
            const afterBlur = yield* page.evaluate(() => (window as any)._events);
            yield* assertDeepEqual(afterBlur, ["focus-d1", "blur-d1", "focus-d2"]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should traverse focus" ──────────────────────────────────────────
    // Upstream: it('should traverse focus')
    // Adapted: uses evaluate-based event tracking instead of exposeFunction,
    // and page.type/page.press instead of keyboard.type/keyboard.press.

    test.live("page-focus.spec.ts - should traverse focus", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`
              <input id="i1"><input id="i2">
              <script>
                window._i2Focused = false;
                document.getElementById('i2').addEventListener('focus', () => { window._i2Focused = true; });
              </script>
            `);
            yield* page.focus("#i1");
            yield* page.type("#i1", "First");
            yield* page.press("#i1", "Tab");
            yield* page.type("#i2", "Last");
            const i2Focused = yield* page.evaluate(() => (window as any)._i2Focused);
            yield* assertEqual(i2Focused, true);
            const i1Value = yield* page.$eval("#i1", (el) => (el as HTMLInputElement).value);
            yield* assertEqual(i1Value, "First");
            const i2Value = yield* page.$eval("#i2", (el) => (el as HTMLInputElement).value);
            yield* assertEqual(i2Value, "Last");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "clicking checkbox should activate it" ───────────────────────────
    // Upstream: it('clicking checkbox should activate it') — fixme for non-Chromium
    // We always run Chromium, so this should work.

    test.live("page-focus.spec.ts - clicking checkbox should activate it", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type=checkbox></input>`);
            yield* page.click("input");
            const nodeName = yield* page.evaluate(() => document.activeElement!.nodeName);
            yield* assertEqual(nodeName, "INPUT");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "keeps focus on element when attempting to focus a non-focusable element"
    // Upstream uses page.locator().focus() — we use page.focus() directly.
    // When focusing a non-focusable element, focus should stay on the previously focused element.

    test.live(
      "page-focus.spec.ts - keeps focus on element when attempting to focus a non-focusable element",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`
              <div id="focusable" tabindex="0">focusable</div>
              <div id="non-focusable">not focusable</div>
              <script>
                window.eventLog = [];
                const focusable = document.getElementById("focusable");
                focusable.addEventListener('blur', () => window.eventLog.push('blur focusable'));
                focusable.addEventListener('focus', () => window.eventLog.push('focus focusable'));
                const nonFocusable = document.getElementById("non-focusable");
                nonFocusable.addEventListener('blur', () => window.eventLog.push('blur non-focusable'));
                nonFocusable.addEventListener('focus', () => window.eventLog.push('focus non-focusable'));
              </script>
            `);
              // Click the focusable element to focus it
              yield* page.click("#focusable");
              const activeId = yield* page.evaluate(() => document.activeElement!.id);
              yield* assertEqual(activeId, "focusable");
              // Attempt to focus the non-focusable element
              yield* page.focus("#non-focusable");
              // Focus should remain on the focusable element
              const activeIdAfter = yield* page.evaluate(() => document.activeElement!.id);
              yield* assertEqual(activeIdAfter, "focusable");
              // Only the initial focus event should have fired
              const events = yield* page.evaluate(() => (window as any).eventLog);
              yield* assertDeepEqual(events, ["focus focusable"]);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── NOT_PLANNED skips ────────────────────────────────────────────────
    // Platform-specific tests not applicable to our `browser-cdp`:

    test.skip("page-focus.spec.ts - should traverse only form elements [SKIP: NOT_PLANNED - WebKit/macOS platform-specific, Alt+Tab link traversal not applicable]", () =>
      Effect.void);

    test.skip("page-focus.spec.ts - tab should cycle between single input and browser [SKIP: NOT_PLANNED - headless Chromium-specific fixme, tests browser focus cycling behavior]", () =>
      Effect.void);

    test.skip("page-focus.spec.ts - tab should cycle between document elements and browser [SKIP: NOT_PLANNED - headless Chromium-specific fixme, tests browser focus cycling behavior]", () =>
      Effect.void);
  });
};
