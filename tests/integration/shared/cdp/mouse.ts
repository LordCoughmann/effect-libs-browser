/**
 * Parity tests for `browser-cdp` page.mouse and page.hover — aligned with Playwright's page-mouse.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-mouse.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * page-mouse.spec.ts tests the `page.mouse.*` low-level mouse API
 * (move, down, up, click, dblclick, wheel with coordinates) plus
 * `page.hover(selector)` for element-based hovering.
 *
 * Gap map (upstream tests → classification):
 *
 *   Live tests (this file) — use page.mouse.* (coordinate-based):
 *     - "should click the document" (smoke)
 *     - "should dblclick the div"
 *     - "down and up should generate click"
 *     - "should pointerdown the div with a custom button"
 *     - "should report correct buttons property"
 *     - "should tween mouse movement"
 *     - "should always round down"
 *     - "should not crash on mouse drag with any button"
 *     - "should select the text with mouse"
 *     - "should set modifier keys on click"
 *
 *   Live tests (this file) — use page.hover(selector):
 *     - "should trigger hover state"
 *     - "should trigger hover state on disabled button"
 *     - "should trigger hover state with removed window.Node"
 *
 *   NOT_PLANNED (requires features not in `browser-cdp`):
 *     - "should report correct pointerType property" (pointerType always 'mouse' in `browser-cdp`)
 *     - "should dispatch mouse move after context menu was opened" (platform-specific context menu)
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

export const defineMouseTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page-mouse.spec.ts parity", () => {
    // ── "should trigger hover state" ───────────────────────────────────
    // Upstream: hover over buttons at different scroll positions, verify :hover

    test.live("page-mouse.spec.ts - should trigger hover state", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/scrollable`);
            yield* page.hover("#button-6");
            let hoveredId = yield* page.evaluate(
              () => (document.querySelector("button:hover") as HTMLElement | null)?.id,
            );
            yield* assertEqual(hoveredId, "button-6");
            yield* page.hover("#button-2");
            hoveredId = yield* page.evaluate(
              () => (document.querySelector("button:hover") as HTMLElement | null)?.id,
            );
            yield* assertEqual(hoveredId, "button-2");
            yield* page.hover("#button-91");
            hoveredId = yield* page.evaluate(
              () => (document.querySelector("button:hover") as HTMLElement | null)?.id,
            );
            yield* assertEqual(hoveredId, "button-91");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should trigger hover state on disabled button" ──────────────────
    // Upstream: disable button via $eval, then hover, verify :hover
    // Adapted: disable via evaluate (we have evaluate, $eval maps to it)

    test.live("page-mouse.spec.ts - should trigger hover state on disabled button", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/scrollable`);
            yield* page.evaluate(() => {
              (document.querySelector("#button-6") as HTMLButtonElement).disabled = true;
            });
            yield* page.hover("#button-6", { timeout: 5000 });
            const hoveredId = yield* page.evaluate(
              () => (document.querySelector("button:hover") as HTMLElement | null)?.id,
            );
            yield* assertEqual(hoveredId, "button-6");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should trigger hover state with removed window.Node" ────────────
    // Upstream: delete window.Node, then hover, verify :hover still works

    test.live("page-mouse.spec.ts - should trigger hover state with removed window.Node", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/scrollable`);
            yield* page.evaluate(() => {
              delete (window as any).Node;
            });
            yield* page.hover("#button-6");
            const hoveredId = yield* page.evaluate(
              () => (document.querySelector("button:hover") as HTMLElement | null)?.id,
            );
            yield* assertEqual(hoveredId, "button-6");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should click the document" @smoke ─────────────────────────────
    // Upstream: page.mouse.click(50, 60) → verify click event properties

    test.live("page-mouse.spec.ts - should click the document", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.evaluate(() => {
              (window as any).clickPromise = new Promise((resolve) => {
                document.addEventListener("click", (event) => {
                  resolve({
                    type: event.type,
                    detail: event.detail,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    isTrusted: event.isTrusted,
                    button: event.button,
                  });
                });
              });
            });
            yield* page.mouse.click(50, 60);
            const event = yield* page.evaluate(() => (window as any).clickPromise);
            yield* assertEqual(event.type, "click");
            yield* assertEqual(event.detail, 1);
            yield* assertEqual(event.clientX, 50);
            yield* assertEqual(event.clientY, 60);
            yield* assertEqual(event.isTrusted, true);
            yield* assertEqual(event.button, 0);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should dblclick the div" ────────────────────────────────────
    // Upstream: page.mouse.dblclick(50, 60) → verify dblclick event

    test.live("page-mouse.spec.ts - should dblclick the div", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<div style="width: 100px; height: 100px;">Click me</div>`);
            yield* page.evaluate(() => {
              (window as any).dblclickPromise = new Promise((resolve) => {
                document.querySelector("div")!.addEventListener("dblclick", (event: any) => {
                  resolve({
                    type: event.type,
                    detail: event.detail,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    isTrusted: event.isTrusted,
                    button: event.button,
                  });
                });
              });
            });
            yield* page.mouse.dblclick(50, 60);
            const event = yield* page.evaluate(() => (window as any).dblclickPromise);
            yield* assertEqual(event.type, "dblclick");
            yield* assertEqual(event.detail, 2);
            yield* assertEqual(event.clientX, 50);
            yield* assertEqual(event.clientY, 60);
            yield* assertEqual(event.isTrusted, true);
            yield* assertEqual(event.button, 0);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "down and up should generate click" ──────────────────────────
    // Upstream: page.mouse.move + down + up → verify click event

    test.live("page-mouse.spec.ts - down and up should generate click", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.evaluate(() => {
              (window as any).clickPromise = new Promise((resolve) => {
                document.addEventListener("click", (event) => {
                  resolve({
                    type: event.type,
                    detail: event.detail,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    isTrusted: event.isTrusted,
                    button: event.button,
                  });
                });
              });
            });
            yield* page.mouse.move(50, 60);
            yield* page.mouse.down();
            yield* page.mouse.up();
            const event = yield* page.evaluate(() => (window as any).clickPromise);
            yield* assertEqual(event.type, "click");
            yield* assertEqual(event.detail, 1);
            yield* assertEqual(event.clientX, 50);
            yield* assertEqual(event.clientY, 60);
            yield* assertEqual(event.isTrusted, true);
            yield* assertEqual(event.button, 0);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should pointerdown the div with a custom button" ────────────
    // Upstream: page.mouse.click(50, 60, { button: 'middle' }) → verify pointerdown

    test.live("page-mouse.spec.ts - should pointerdown the div with a custom button", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<div style="width: 100px; height: 100px;">Click me</div>`);
            yield* page.evaluate(() => {
              (window as any).pointerdownPromise = new Promise((resolve) => {
                document.querySelector("div")!.addEventListener("pointerdown", (event: any) => {
                  resolve({
                    type: event.type,
                    detail: event.detail,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    isTrusted: event.isTrusted,
                    button: event.button,
                    buttons: event.buttons,
                    pointerId: event.pointerId,
                  });
                });
              });
            });
            yield* page.mouse.click(50, 60, { button: "middle" });
            const event = yield* page.evaluate(() => (window as any).pointerdownPromise);
            yield* assertEqual(event.type, "pointerdown");
            yield* assertEqual(event.clientX, 50);
            yield* assertEqual(event.clientY, 60);
            yield* assertEqual(event.isTrusted, true);
            yield* assertEqual(event.button, 1);
            yield* assertEqual(event.buttons, 4);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should report correct buttons property" ─────────────────────
    // Upstream: multi-button down/up sequence → verify buttons bitmask

    test.live("page-mouse.spec.ts - should report correct buttons property", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.evaluate(() => {
              (window as any).__EVENTS = [];
              const handler = (event: any) => {
                (window as any).__EVENTS.push({
                  type: event.type,
                  button: event.button,
                  buttons: event.buttons,
                });
              };
              window.addEventListener("mousedown", handler, false);
              window.addEventListener("mouseup", handler, false);
            });
            yield* page.mouse.move(50, 60);
            yield* page.mouse.down({ button: "middle" });
            yield* page.mouse.down({ button: "left" });
            yield* page.mouse.up({ button: "middle" });
            yield* page.mouse.up({ button: "left" });
            const events = yield* page.evaluate(() => (window as any).__EVENTS);
            yield* assertDeepEqual(events, [
              { type: "mousedown", button: 1, buttons: 4 },
              { type: "mousedown", button: 0, buttons: 5 },
              { type: "mouseup", button: 1, buttons: 1 },
              { type: "mouseup", button: 0, buttons: 0 },
            ]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should tween mouse movement" ────────────────────────────────
    // Upstream: page.mouse.move(200, 300, { steps: 5 }) → verify intermediate points

    test.live("page-mouse.spec.ts - should tween mouse movement", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.mouse.move(100, 100);
            yield* page.evaluate(() => {
              (window as any).result = [];
              document.addEventListener("mousemove", (event) => {
                (window as any).result.push([event.clientX, event.clientY]);
              });
            });
            yield* page.mouse.move(200, 300, { steps: 5 });
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertDeepEqual(result, [
              [120, 140],
              [140, 180],
              [160, 220],
              [180, 260],
              [200, 300],
            ]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should always round down" ──────────────────────────────────
    // Upstream: page.mouse.click(50.1, 50.9) → verify coordinates rounded down

    test.live("page-mouse.spec.ts - should always round down", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.evaluate(() => {
              document.addEventListener("mousedown", (event) => {
                (window as any).result = [event.clientX, event.clientY];
              });
            });
            yield* page.mouse.click(50.1, 50.9);
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertDeepEqual(result, [50, 50]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should not crash on mouse drag with any button" ─────────────
    // Upstream: drag with left, middle, right buttons — no crash

    test.live("page-mouse.spec.ts - should not crash on mouse drag with any button", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.evaluate(() => {
              // Suppress contextmenu (poorly supported on right click)
              window.addEventListener("contextmenu", (e) => e.preventDefault(), false);
            });
            // Drag with each button
            for (const button of ["left", "middle", "right"] as const) {
              yield* page.mouse.move(50, 50);
              yield* page.mouse.down({ button });
              yield* page.mouse.move(100, 100);
              // Release to reset state for next iteration
              yield* page.mouse.up({ button });
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should select the text with mouse" ─────────────────────────
    // Upstream: focus textarea, type text, drag-select with mouse, verify
    // the selected substring equals the typed text.

    test.live("page-mouse.spec.ts - should select the text with mouse", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/textarea`);
            yield* page.focus("textarea");
            const text =
              "This is the text that we are going to try to select. Let's see how it goes.";
            yield* page.keyboard.type(text);
            // Reset scroll to top (Firefox needs a frame; harmless elsewhere)
            yield* page.evaluate(() => {
              (document.querySelector("textarea") as HTMLTextAreaElement).scrollTop = 0;
            });
            // Get the textarea's upper-left corner (start of text)
            const start = yield* page.evaluate(() => {
              const r = document.querySelector("textarea")!.getBoundingClientRect();
              return { x: r.x, y: r.y };
            });
            // Move into the textarea, press down, drag to far point, release
            yield* page.mouse.move(start.x + 2, start.y + 2);
            yield* page.mouse.down();
            yield* page.mouse.move(200, 200);
            yield* page.mouse.up();
            // Verify the selection spans the entire typed text
            const selected = yield* page.evaluate(() => {
              const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
              return textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
            });
            yield* assertEqual(selected, text);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should set modifier keys on click" ─────────────────────────
    // Upstream: keyboard.down(modifier) + page.click('#button-3') → verify
    // the mousedown event reports the modifier flag.
    // Adapted: uses coordinate-based mouse.click at #button-3's center.
    // Mouse events now reflect current keyboard modifier state
    // (state.currentModifierMask), mirroring Click.ts's fallback behavior.

    test.live("page-mouse.spec.ts - should set modifier keys on click", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/scrollable`);
            // Capture mousedown on button-3
            yield* page.evaluate(() => {
              document.querySelector("#button-3")!.addEventListener(
                "mousedown",
                (e: any) => {
                  (window as any).lastEvent = e;
                },
                true,
              );
            });
            // Get button-3 center coordinates for coordinate-based click
            const rect = yield* page.evaluate(() => {
              const r = document.querySelector("#button-3")!.getBoundingClientRect();
              return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            });
            const modifiers = {
              Shift: "shiftKey",
              Control: "ctrlKey",
              Alt: "altKey",
              Meta: "metaKey",
            } as const;
            // Each modifier: hold via keyboard.down, click, verify flag is true
            for (const modifier of Object.keys(modifiers) as (keyof typeof modifiers)[]) {
              yield* page.keyboard.down(modifier);
              yield* page.mouse.click(rect.x, rect.y);
              const prop = modifiers[modifier];
              const value = yield* page.evaluate((p: string) => (window as any).lastEvent[p], prop);
              yield* assertEqual(value, true);
              yield* page.keyboard.up(modifier);
            }
            // After releasing all modifiers, none should be set
            yield* page.mouse.click(rect.x, rect.y);
            for (const modifier of Object.keys(modifiers) as (keyof typeof modifiers)[]) {
              const prop = modifiers[modifier];
              const value = yield* page.evaluate((p: string) => (window as any).lastEvent[p], prop);
              yield* assertEqual(value, false);
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── NOT_PLANNED skip markers ────────────────────────────────────────

    test.skip("page-mouse.spec.ts - should report correct pointerType property [SKIP: NOT_PLANNED - pointerType always 'mouse' in `browser-cdp`]", () =>
      Effect.void);

    test.skip("page-mouse.spec.ts - should dispatch mouse move after context menu was opened [SKIP: NOT_PLANNED - context menu handling, platform-specific]", () =>
      Effect.void);
  });
};
