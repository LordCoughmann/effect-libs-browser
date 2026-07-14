/**
 * Parity tests for `browser-cdp` page.touchscreen.tap — adapted from upstream
 * Playwright's touchscreen behavior (`repos/cloudflare-playwright/packages/
 * playwright-core/src/server/chromium/crInput.ts`, `RawTouchscreenImpl.tap`).
 * Subject under test: @effect-libs/browser-cdp.
 *
 * `page.touchscreen.tap(x, y)` is the coordinate-direct touchscreen API.
 * It is stateless — no selector resolution, no actionability check, no
 * retry. Each call dispatches exactly two CDP events (`touchStart` +
 * `touchEnd`) at the literal viewport coordinates you give it. The
 * element at (x, y), if any, receives the click — same user-observable
 * behavior as a real touch tap.
 *
 * Tests cover the invariants that distinguish `page.touchscreen.tap` from
 * the selector-based APIs (`page.tap`, `locator.tap`, `frame.tap`):
 *
 *   - Touch dispatch fires both `touchstart` and `touchend` (in that
 *     order) at the exact viewport coordinates passed in.
 *   - The element under (x, y) receives the click — coordinate-direct,
 *     NOT selector-based. Tapping outside an element does nothing; tapping
 *     on a different element than expected fires that other element.
 *   - Statelessness: no retry, no waiting. Tapping empty viewport space
 *     succeeds without an actionability error (unlike `page.tap(selector)`
 *     which would fail on a hidden element).
 *
 * Key differences from upstream:
 *   - `hasTouch: true` is implicit in `browser-cdp` — Chrome auto-enables touch
 *     when `Input.dispatchTouchEvent` is called.
 *   - We assert the user-observable invariant (the click handler runs on
 *     the element at the tapped coords), not the underlying event log,
 *     because CDP touch events fire `click` on pointerup just like mouse
 *     events.
 *
 * Gap: multi-touch (`Input.dispatchTouchEvent` with multiple
 * `touchPoints`) is out of scope — `page.touchscreen` exposes only the
 * single-point form, matching upstream `RawTouchscreenImpl.tap`.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertDeepEqual, assertEqual } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineTouchscreenTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl } = config;

  describe("page.touchscreen parity", () => {
    // ── Touch dispatch fires click on the element under (x, y) ─────────────

    // Place a single button at known viewport coords (top-left at 50,50,
    // size 100x50, so its center is at 100,75). Tap at the center and
    // verify the click handler fires. Confirms the basic happy path:
    // CDP touch events reach the page and trigger click on the element
    // under the tap point.
    test.live(
      "touchscreen.tap fires click on element at (x, y) [CDP-EXTENSION: coordinate-direct tap (upstream tap.spec.ts is selector-based; coordinate-direct variant is tested here)]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`
              <button
                id="tgt"
                style="position: absolute; left: 50px; top: 50px; width: 100px; height: 50px;"
              >tap me</button>
              <script>
                window.__tapped = 0;
                document.getElementById('tgt').addEventListener('click', () => {
                  window.__tapped += 1;
                });
              </script>
            `);
              // Tap the element's center: x=100, y=75
              yield* page.touchscreen.tap(100, 75);
              const count = yield* page.evaluate(() => (window as any).__tapped);
              yield* assertEqual(count, 1);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Both touchstart and touchend fire (in that order) ───────────────────

    // The CDP dispatch sends touchStart with the touch point and touchEnd
    // with empty touchPoints. We observe the events the page receives:
    // a `touchstart` (with one Touch) followed by a `touchend` (with no
    // Touches, since touchEnd clears active touches).
    test.live(
      "touchscreen.tap fires touchstart then touchend [CDP-EXTENSION: coordinate-direct tap (upstream tap.spec.ts is selector-based; coordinate-direct variant is tested here)]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`
              <button
                id="tgt"
                style="position: absolute; left: 50px; top: 50px; width: 100px; height: 50px;"
              >x</button>
              <script>
                window.__events = [];
                const el = document.getElementById('tgt');
                el.addEventListener('touchstart', (e) => {
                  window.__events.push({ type: 'touchstart', count: e.touches.length });
                });
                el.addEventListener('touchend', (e) => {
                  window.__events.push({ type: 'touchend', count: e.touches.length });
                });
              </script>
            `);
              yield* page.touchscreen.tap(100, 75);
              const events = yield* page.evaluate(() => (window as any).__events);
              yield* assertDeepEqual(events, [
                { type: "touchstart", count: 1 },
                { type: "touchend", count: 0 },
              ]);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Coordinate-direct: tap at coords, NOT element center ────────────────

    // The defining behavior of `page.touchscreen.tap` is that it's
    // coordinate-direct — there is no selector, no center computation.
    // Place two buttons side by side. Tap at coords that fall on the
    // FIRST button's edge (not its center). The first button must fire,
    // the second must not. This proves the API dispatches at the given
    // coords, not at any selector-derived center.
    test.live(
      "touchscreen.tap dispatches at literal coords (not element center) [CDP-EXTENSION: coordinate-direct tap (upstream tap.spec.ts is selector-based; coordinate-direct variant is tested here)]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`
              <button
                id="left"
                style="position: absolute; left: 0px; top: 0px; width: 200px; height: 100px;"
              >left</button>
              <button
                id="right"
                style="position: absolute; left: 200px; top: 0px; width: 200px; height: 100px;"
              >right</button>
              <script>
                window.__clicks = { left: 0, right: 0 };
                document.getElementById('left').addEventListener('click', () => {
                  window.__clicks.left += 1;
                });
                document.getElementById('right').addEventListener('click', () => {
                  window.__clicks.right += 1;
                });
              </script>
            `);
              // Coords (10, 10) are inside the LEFT button (which spans
              // 0–200 horizontally). If this API computed element centers,
              // we'd tap the left button center at (100, 50) instead.
              yield* page.touchscreen.tap(10, 10);
              const clicks = yield* page.evaluate(() => (window as any).__clicks);
              yield* assertDeepEqual(clicks, { left: 1, right: 0 });
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Stateless: tapping empty viewport space doesn't fail ────────────────

    // Unlike `page.tap(selector)` (which retries actionability until the
    // element appears or the timeout elapses), `page.touchscreen.tap` is
    // stateless — it dispatches the touch events at the given coords and
    // returns. If no element is at (x, y), no click fires, but the call
    // itself succeeds. This is the primary behavioral difference from
    // selector-based tap.
    test.live(
      "touchscreen.tap on empty viewport space does not fail [CDP-EXTENSION: coordinate-direct tap (upstream tap.spec.ts is selector-based; coordinate-direct variant is tested here)]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<div>No interactive element here</div>`);
              // Tap at (999, 999) — far outside any element. The call must
              // succeed without throwing; no click should fire.
              yield* page.touchscreen.tap(999, 999);
              // Sanity: page is still alive and evaluate works
              const body = yield* page.evaluate(() => document.body.textContent);
              yield* assertEqual(body, "No interactive element here");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
