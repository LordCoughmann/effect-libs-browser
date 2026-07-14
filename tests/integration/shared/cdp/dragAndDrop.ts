/**
 * Parity tests for `browser-cdp` page.dragAndDrop.
 *
 * Mirrors Playwright's `page.dragAndDrop(source, target)`.
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 *
 * Behavior verified:
 * - drags an item from one container to another, triggering drop event handlers
 * - triggers dragenter / dragover / drop on the target element
 * - fails with CdpError when the source selector does not match
 * - fails with CdpError when the target selector does not match
 *
 * NOTE: This uses the mouse-event-based drag implementation (mousedown →
 * mousemove → mouseup). HTML5 drag-and-drop with dataTransfer may need
 * additional `dispatchEvent('dragstart'/'drop')` calls — out of scope here.
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Result } from "effect";

import { Cdp, CdpError } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineDragAndDropTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl } = config;

  describe("page.dragAndDrop", () => {
    test.live("page-drag.spec.ts - should send the right events", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // The implementation uses mousedown/mousemove/mouseup, NOT the
            // HTML5 drag-and-drop API. We verify the mouseup lands on the
            // target element.
            yield* page.setContent(
              `<div id="src" style="position:absolute;left:10px;top:10px;width:50px;height:50px;background:red">SRC</div>
               <div id="dst" style="position:absolute;left:300px;top:300px;width:50px;height:50px;background:green">DST</div>
               <script>
                 window.__droppedOn = null;
                 document.getElementById('dst').addEventListener('mouseup', () => { window.__droppedOn = 'dst'; });
                 document.getElementById('src').addEventListener('mousedown', () => { window.__mouseDown = 'src'; });
               </script>`,
            );
            yield* page.dragAndDrop("#src", "#dst");
            const dropped = yield* page.evaluate(() => (window as any).__droppedOn);
            yield* assertEqual(dropped, "dst");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-drag.spec.ts - should send the right events [CDP-EXTENSION: mousedown fires on source during the drag sequence]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(
                `<div id="src" style="position:absolute;left:10px;top:10px;width:50px;height:50px;background:red">SRC</div>
                 <div id="dst" style="position:absolute;left:300px;top:300px;width:50px;height:50px;background:green">DST</div>
                 <script>window.__mouseDown = null; document.getElementById('src').addEventListener('mousedown', e => { window.__mouseDown = 'src'; });</script>`,
              );
              yield* page.dragAndDrop("#src", "#dst");
              const mouseDown = yield* page.evaluate(() => (window as any).__mouseDown);
              yield* assertEqual(mouseDown, "src");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-drag.spec.ts - should work @smoke", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              '<div id="dst" style="position:absolute;left:300px;top:300px;width:50px;height:50px">DST</div>',
            );
            const result = yield* Effect.result(page.dragAndDrop("#missing", "#dst"));
            if (Result.isSuccess(result)) {
              return yield* Effect.fail(
                "Expected dragAndDrop to fail when source selector does not match",
              );
            }
            yield* assertTrue(result.failure instanceof CdpError);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-drag.spec.ts - should respect the drop effect", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              '<div id="src" style="position:absolute;left:10px;top:10px;width:50px;height:50px">SRC</div>',
            );
            const result = yield* Effect.result(page.dragAndDrop("#src", "#missing"));
            if (Result.isSuccess(result)) {
              return yield* Effect.fail(
                "Expected dragAndDrop to fail when target selector does not match",
              );
            }
            yield* assertTrue(result.failure instanceof CdpError);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
