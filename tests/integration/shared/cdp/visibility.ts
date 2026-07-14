/**
 * Parity tests for `browser-cdp` page.isHidden() / page.isVisible() - aligned with Playwright's locator-is-visible.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/locator-is-visible.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover:
 * - Basic visibility checks for visible and hidden elements
 * - Elements with opacity:0 (visible in Playwright)
 * - Elements outside viewport (visible in Playwright)
 * - Elements inside button/role=button (hidden when empty)
 * - Details element visibility (hidden when collapsed)
 * - Missing elements (hidden)
 *
 * Key differences from upstream:
 *   - `browser-cdp` uses page.isHidden() / page.isVisible() directly
 *   - No locator API — use selectors directly
 *   - Tests use page.evaluate() for direct DOM manipulation
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   Uses locator.waitFor() / expect(locator).toBeVisible() (not implemented):
 *     - "isVisible during navigation should not throw"
 *
 *   Uses invalid selector engine (not implemented):
 *     - "isVisible with invalid selector should throw"
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineVisibilityTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl } = config;

  describe("page.isHidden / page.isVisible parity", () => {
    // ── "isVisible and isHidden should work" ──────────────────────────────
    // Adapted from upstream: locator-is-visible.spec.ts

    test.live(
      "page-element-state.spec.ts - isVisible/isHidden: should return correct visibility for visible and hidden elements",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<div>Hi</div><span></span>`);

              // div is visible (has content)
              const divVisible = yield* page.isVisible("div");
              const divHidden = yield* page.isHidden("div");
              yield* assertEqual(divVisible, true);
              yield* assertEqual(divHidden, false);

              // span is hidden (empty, zero dimensions)
              const spanVisible = yield* page.isVisible("span");
              const spanHidden = yield* page.isHidden("span");
              yield* assertEqual(spanVisible, false);
              yield* assertEqual(spanHidden, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "missing elements are hidden" ─────────────────────────────────────

    test.live(
      "page-element-state.spec.ts - isVisible/isHidden: should return hidden for missing elements",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<div>Hi</div>`);

              const missingVisible = yield* page.isVisible("no-such-element");
              const missingHidden = yield* page.isHidden("no-such-element");
              yield* assertEqual(missingVisible, false);
              yield* assertEqual(missingHidden, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "isVisible should be true for element outside view" ───────────────
    // Per Playwright: elements scrolled out of view are still visible

    test.live(
      "page-element-state.spec.ts - isVisible/isHidden: should return visible for elements outside viewport",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<div style="position: absolute; left: -1000px">Hi</div>`);

              const visible = yield* page.isVisible("div");
              yield* assertEqual(visible, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "isVisible and isHidden should work with details" ─────────────────
    // Adapted from upstream: locator-is-visible.spec.ts

    test.live(
      "page-element-state.spec.ts - isVisible/isHidden: should return hidden for collapsed details content",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<details>
              <summary>click to open</summary>
              <ul>
                <li>hidden item 1</li>
                <li>hidden item 2</li>
                <li>hidden item 3</li>
              </ul>
            </details>`);

              // ul inside closed details is hidden
              const ulHidden = yield* page.isHidden("ul");
              yield* assertEqual(ulHidden, true);

              const ulVisible = yield* page.isVisible("ul");
              yield* assertEqual(ulVisible, false);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "isVisible inside a button" ──────────────────────────────────────
    // Empty elements inside buttons are hidden

    test.live(
      "page-element-state.spec.ts - isVisible/isHidden: should return hidden for empty span inside button",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<button><span></span>a button</button>`);

              // Empty span inside button is hidden
              const spanVisible = yield* page.isVisible("span");
              const spanHidden = yield* page.isHidden("span");
              yield* assertEqual(spanVisible, false);
              yield* assertEqual(spanHidden, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "isVisible inside a role=button" ──────────────────────────────────

    test.live(
      "page-element-state.spec.ts - isVisible/isHidden: should return hidden for empty span inside role=button",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<div role=button><span></span>a button</div>`);

              // Empty span inside role=button is hidden
              const spanVisible = yield* page.isVisible("span");
              const spanHidden = yield* page.isHidden("span");
              yield* assertEqual(spanVisible, false);
              yield* assertEqual(spanHidden, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });

  describe("page.isHidden specific cases", () => {
    test.live("page-element-state.spec.ts - isHidden: should return true for display:none", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<div id="hidden" style="display:none">Hidden</div>`);

            const hidden = yield* page.isHidden("#hidden");
            yield* assertEqual(hidden, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isHidden: should return true for visibility:hidden",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<div id="hidden" style="visibility:hidden">Hidden</div>`);

              const hidden = yield* page.isHidden("#hidden");
              yield* assertEqual(hidden, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isHidden: should return true for visibility:collapse",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<div id="hidden" style="visibility:collapse">Hidden</div>`);

              const hidden = yield* page.isHidden("#hidden");
              yield* assertEqual(hidden, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isHidden: should return true for zero width element",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(
                `<div id="hidden" style="width:0;height:10px;overflow:hidden">Hidden</div>`,
              );

              const hidden = yield* page.isHidden("#hidden");
              yield* assertEqual(hidden, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isHidden: should return true for zero height element",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(
                `<div id="hidden" style="width:10px;height:0;overflow:hidden">Hidden</div>`,
              );

              const hidden = yield* page.isHidden("#hidden");
              yield* assertEqual(hidden, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });

  describe("page.isVisible specific cases", () => {
    test.live(
      "page-element-state.spec.ts - isVisible: should return true for normal visible element",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<div id="visible">Visible</div>`);

              const visible = yield* page.isVisible("#visible");
              yield* assertEqual(visible, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isVisible: should return true for inline element with content",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<span id="visible">Text</span>`);

              const visible = yield* page.isVisible("#visible");
              yield* assertEqual(visible, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });

  // ── "isVisible should be true for opacity:0" ───────────────────────────
  // Per Playwright: opacity:0 elements are still considered visible
  // (they take up space and can be interacted with)

  test.live(
    "page-element-state.spec.ts - isVisible/isHidden: should return visible for opacity:0 elements",
    () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<div style="opacity:0">Hi</div>`);

            // In Playwright, opacity:0 is visible (takes up space, can be interacted with)
            const visible = yield* page.isVisible("div");
            yield* assertEqual(visible, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
  );
};
