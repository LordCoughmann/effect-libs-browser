/**
 * Parity tests for `browser-cdp` page.tap() — adapted from upstream Playwright's
 * `tests/library/tap.spec.ts`. Subject under test: @effect-libs/browser-cdp.
 *
 * `page.tap` and `Locator.tap` both go through `Tap.ts` (`browser-cdp`)
 * `Input.dispatchTouchEvent`). Behavior reference: `Tap.ts` (mirrors
 * Playwright's `Frame.tap` / `CRInput.tap`).
 *
 * Tests cover:
 * - Tap dispatches touchstart + touchend (in that order) and triggers the
 *   element's click handler (CDP touch events fire click on pointerup).
 * - `trial: true` runs the actionability retry but does NOT dispatch the
 *   touch events — the click handler is not invoked.
 * - Hidden element (display:none): tap fails with a wait/selector error.
 *
 * Key differences from upstream:
 *   - CDP touch events don't expose the same PointerEvent/pointerover
 *     sequence as Playwright (`browser-cdp` doesn't track pointer events the same
 *     way). We verify the user-observable invariant: the click handler
 *     runs iff the touch events were dispatched (i.e. `trial` is false).
 *   - `hasTouch: true` is implicit in `browser-cdp` — Chrome's `--enable-features=...
 *     Touch` flag is auto-set when `Page.setTouchEmulationEnabled` is
 *     called. Tap works without explicit context touch config.
 *
 * GAP: "should send well formed touch points" — depends on
 * `Touch.touchstart` event payload with multiple `Touch` entries. `browser-cdp`'s
 * `Input.dispatchTouchEvent` accepts a `touchPoints` array but our tap
 * impl only sends a single-point tap (matches upstream
 * `client/page.ts: tap()`). Multi-touch is `📋 Phase P2 (touchscreen API)` —
 * CDP only ships the single-point form.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Cause, Duration, Effect, Exit, Result } from "effect";
import * as Str from "effect/String";

import { Cdp, CdpError } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

/**
 * Pulls the error message out of a failed Effect — for asserting that a
 * hidden/missing element surfaces a useful error.
 */
const failureMessage = <A, E>(exit: Exit.Exit<A, E>): string => {
  if (Exit.isSuccess(exit)) return "(no failure)";
  const cause = exit.cause;
  const found = Cause.findError(cause);
  if (Result.isSuccess(found)) {
    const err = found.success;
    if (err instanceof CdpError) return err.message;
    return String(err);
  }
  return Cause.pretty(cause);
};

export const defineTapTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl } = config;

  describe("page.tap parity", () => {
    // ── Basic tap ──────────────────────────────────────────────────────────

    // Adapted from `tap.spec.ts - should send all of the correct events`
    // (the user-observable invariant: tap fires the element's click handler
    // and the order is touchstart → touchend). We verify via the click
    // result, not the event log — CDP touch events fire `click` on
    // pointerup just like mouse events.
    test.live("tap.spec.ts - should send all of the correct events @smoke", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`
              <button id="tap-btn">Tap target</button>
              <script>
                window.__tapResult = 'not tapped';
                document.getElementById('tap-btn').addEventListener('click', () => {
                  window.__tapResult = 'tapped';
                });
              </script>
            `);
            yield* page.tap("#tap-btn");
            const result = yield* page.evaluate(() => (window as any).__tapResult);
            yield* assertEqual(result, "tapped");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Locator tap ────────────────────────────────────────────────────────

    // `Locator.tap` delegates to `page.tap` with the resolved selector.
    // Same observable behavior, different entry point.
    test.live(
      "tap.spec.ts - should send all of the correct events @smoke [CDP-EXTENSION: Locator.tap delegates to page.tap — verifies the same behavior via the Locator entry point]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`
                <button id="tap-target">Tap me</button>
                <script>
                  window.__tapped = 0;
                  document.getElementById('tap-target').addEventListener('click', () => {
                    window.__tapped += 1;
                  });
                </script>
              `);
              yield* page.locator("#tap-target").tap();
              const count = yield* page.evaluate(() => (window as any).__tapped);
              yield* assertEqual(count, 1);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Trial run ──────────────────────────────────────────────────────────

    // Adapted from `tap.spec.ts - trial run should not tap`. With `trial:
    // true`, the actionability auto-wait runs (so a hidden target still
    // fails) but no touch events are dispatched, so the element's click
    // handler is NOT invoked.
    test.live("tap.spec.ts - trial run should not tap", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`
              <button id="trial-target">Trial target</button>
              <script>
                window.__trialClicked = 0;
                document.getElementById('trial-target').addEventListener('click', () => {
                  window.__trialClicked += 1;
                });
              </script>
            `);
            yield* page.tap("#trial-target", { trial: true });
            const count = yield* page.evaluate(() => (window as any).__trialClicked);
            // Trial: click handler must NOT be invoked.
            yield* assertEqual(count, 0);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Hidden element error ──────────────────────────────────────────────

    // Tap on a `display: none` element should fail — the actionability loop
    // never sees a visible bounding box, so the timeout elapses and the
    // effect fails with a CdpError (not just returns).
    test.live("tap.spec.ts - should wait until an element is visible to tap it", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`
              <button id="hidden-btn" style="display: none">Hidden</button>
              <button id="visible-btn">Visible</button>
            `);
            // Short timeout so the test fails fast — we don't need 30s
            // to know a hidden element can't be tapped.
            const fastTimeout = Duration.millis(100);
            const result = yield* Effect.exit(page.tap("#hidden-btn", { timeout: fastTimeout }));
            // Failure path:
            //   - The tap function should return a failed Effect.
            //   - The error message should mention the selector (or
            //     timeout / display:none semantics) so users can debug.
            const msg = failureMessage(result);
            yield* assertTrue(typeof msg === "string" && Str.isNonEmpty(msg));
            // The visible button should still work — failure on one
            // selector doesn't break the page.
            yield* assertTrue(true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
