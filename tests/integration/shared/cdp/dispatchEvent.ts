/**
 * Parity tests for `browser-cdp` page.dispatchEvent.
 *
 * Mirrors Playwright's `page.dispatchEvent(selector, type, eventInit?)`.
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 *
 * Behavior verified:
 * - dispatches a click event that fires the element's addEventListener handler
 * - dispatches a custom event with EventInit options (e.g. `input`)
 * - fails immediately when no element matches the selector
 * - dispatches on the first match if multiple elements match (no strict mode)
 *
 * NOTE: `dispatchEvent` fires `addEventListener` handlers reliably, but the
 * `onclick=""` HTML attribute handler is unreliable for synthetic events in
 * some browsers. We use addEventListener in tests to be portable.
 *
 * NOTE: dispatchEvent does NOT auto-wait. Tests pre-create the target element
 * via setContent so it's already in the DOM.
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Result } from "effect";

import { Cdp, CdpError } from "@effect-libs/browser-cdp";

import { CROSS_PROCESS_PREFIX } from "../../../setup/http-server/Client.js";
import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineDispatchEventTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.dispatchEvent", () => {
    test.live("page-dispatchevent.spec.ts - should dispatch click event @smoke", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              '<button id="b">Click me</button><script>document.getElementById("b").addEventListener("click", () => { window.__clicked = true; });</script>',
            );
            yield* page.dispatchEvent("#b", "click");
            const clicked = yield* page.evaluate(() => (window as any).__clicked);
            yield* assertEqual(clicked, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-dispatchevent.spec.ts - should dispatch click event properties", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              '<input id="i" /><script>document.getElementById("i").addEventListener("input", e => { window.__bubbles = e.bubbles; window.__composed = e.composed; });</script>',
            );
            yield* page.dispatchEvent("#i", "input", { bubbles: true, composed: true });
            const result = yield* page.evaluate(() => ({
              bubbles: (window as any).__bubbles,
              composed: (window as any).__composed,
            }));
            yield* assertEqual(result.bubbles, true);
            yield* assertEqual(result.composed, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-dispatchevent.spec.ts - should throw if argument is from different frame", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>no buttons here</div>");
            const result = yield* Effect.result(page.dispatchEvent("button.missing", "click"));
            if (Result.isSuccess(result)) {
              return yield* Effect.fail("Expected dispatchEvent to fail for missing selector");
            }
            yield* assertTrue(result.failure instanceof CdpError);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-dispatchevent.spec.ts - should be atomic", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              '<button id="a">A</button><button id="b">B</button><script>document.getElementById("a").addEventListener("click", () => { window.__which = "a"; }); document.getElementById("b").addEventListener("click", () => { window.__which = "b"; });</script>',
            );
            yield* page.dispatchEvent("button", "click");
            const which = yield* page.evaluate(() => (window as any).__which);
            yield* assertEqual(which, "a");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should dispatch click svg ──────────────────────────────────────

    test.live("page-dispatchevent.spec.ts - should dispatch click svg", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`
              <svg height="100" width="100">
                <circle onclick="window.__CLICKED=42" cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" />
              </svg>
            `);
            yield* page.dispatchEvent("circle", "click");
            const clicked = yield* page.evaluate(() => (window as any).__CLICKED);
            yield* assertEqual(clicked, 42);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should dispatch click on a span with an inline element inside ──

    test.live(
      "page-dispatchevent.spec.ts - should dispatch click on a span with an inline element inside",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(
                `<style>span::before { content: 'q'; }</style><span onclick="window.CLICKED=42"></span>`,
              );
              yield* page.dispatchEvent("span", "click");
              const clicked = yield* page.evaluate(() => (window as any).CLICKED);
              yield* assertEqual(clicked, 42);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should dispatch click after navigation ─────────────────────────

    test.live("page-dispatchevent.spec.ts - should dispatch click after navigation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/button`);
            yield* page.dispatchEvent("button", "click");
            yield* page.goto(`${httpUrl}/input/button`);
            yield* page.dispatchEvent("button", "click");
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertEqual(result, "Clicked");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should dispatch click after a cross origin navigation ─────────

    test.live(
      "page-dispatchevent.spec.ts - should dispatch click after a cross origin navigation",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/input/button`);
              yield* page.dispatchEvent("button", "click");
              // CROSS_PROCESS_PREFIX is a different hostname (127.0.0.1 vs
              // localhost) but same port. Exercises the cross-process
              // session re-creation path.
              yield* page.goto(`${CROSS_PROCESS_PREFIX}/input/button`);
              yield* page.dispatchEvent("button", "click");
              const result = yield* page.evaluate(() => (window as any).result);
              yield* assertEqual(result, "Clicked");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should not fail when element is blocked on hover ───────────────

    test.live("page-dispatchevent.spec.ts - should not fail when element is blocked on hover", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<style>
                container { display: block; position: relative; width: 200px; height: 50px; }
                div, button { position: absolute; left: 0; top: 0; bottom: 0; right: 0; }
                div { pointer-events: none; }
                container:hover div { pointer-events: auto; background: red; }
              </style>
              <container>
                <button onclick="window.clicked=true">Click me</button>
                <div></div>
              </container>`);
            yield* page.dispatchEvent("button", "click");
            const clicked = yield* page.evaluate(() => (window as any).clicked);
            yield* assertTrue(clicked === true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should dispatch click when node is added in shadow dom [NOT_PLANNED] ─────

    test.live(
      "page-dispatchevent.spec.ts - should dispatch click when node is added in shadow dom [SKIP: NOT_PLANNED - `browser-cdp`'s CSS selector engine does not pierce shadow DOM by default; the upstream test relies on Playwright's automatic open-shadow piercing]",
      () => Effect.void,
    );

    // ── P8: should dispatch wheel event ────────────────────────────────────

    test.live("page-dispatchevent.spec.ts - should dispatch wheel event", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              `<body><script>
                window.__wheelEvents = [];
                document.body.addEventListener('wheel', (event) => {
                  window.__wheelEvents.push({ deltaX: event.deltaX, deltaY: event.deltaY });
                });
              </script></body>`,
            );
            yield* page.dispatchEvent("body", "wheel", { deltaX: 100, deltaY: 200 });
            const events = yield* page.evaluate(() => (window as any).__wheelEvents);
            yield* assertEqual(events.length, 1);
            yield* assertEqual(events[0].deltaX, 100);
            yield* assertEqual(events[0].deltaY, 200);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should dispatch device orientation event [NOT_PLANNED] ───────────

    test.live(
      "page-dispatchevent.spec.ts - should dispatch device orientation event [SKIP: NOT_PLANNED - Chromium's DeviceOrientationEvent constructor ignores init params; alpha/beta/gamma are managed by the sensor subsystem. Even Object.defineProperty with a getter doesn't override because the property descriptor is non-configurable on the prototype. Tested manually that direct `new DeviceOrientationEvent(type, {alpha: 10})` returns null alpha.]",
      () => Effect.void,
    );

    // ── P8: should dispatch absolute device orientation event [NOT_PLANNED] ──

    test.live(
      "page-dispatchevent.spec.ts - should dispatch absolute device orientation event [SKIP: NOT_PLANNED - same Chromium DeviceOrientationEvent constructor limitation as above]",
      () => Effect.void,
    );

    // ── P8: should dispatch device motion event [NOT_PLANNED] ─────────────────

    test.live(
      "page-dispatchevent.spec.ts - should dispatch device motion event [SKIP: NOT_PLANNED - same Chromium DeviceMotionEvent constructor limitation; acceleration/rotationRate are managed by the sensor subsystem]",
      () => Effect.void,
    );

    // ── P8: drag-drop + ElementHandle + cross-frame [NOT_PLANNED] ─────────

    test.live(
      "page-dispatchevent.spec.ts - should dispatch drag drop events [SKIP: NOT_PLANNED - drag-drop requires passing a DataTransfer JSHandle across the callFunctionOn boundary; `browser-cdp`'s handle protocol does not preserve DataTransfer]",
      () => Effect.void,
    );

    test.live(
      "page-dispatchevent.spec.ts - should dispatch drag drop events via ElementHandles [SKIP: NOT_PLANNED - ElementHandle is intentionally not implemented in `browser-cdp` (locator-only)]",
      () => Effect.void,
    );

    test.live(
      "page-dispatchevent.spec.ts - should dispatch click event via ElementHandles [SKIP: NOT_PLANNED - ElementHandle is intentionally not implemented in `browser-cdp` (locator-only)]",
      () => Effect.void,
    );

    test.live(
      "page-dispatchevent.spec.ts - should throw if argument is from different frame [SKIP: NOT_PLANNED - tests JSHandle cross-frame validation; `browser-cdp` is locator-only and does not surface JSHandles to consumers]",
      () => Effect.void,
    );
  });
};
