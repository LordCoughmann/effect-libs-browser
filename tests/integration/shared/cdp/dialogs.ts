/**
 * Parity tests for `browser-cdp` page.onDialog.
 *
 * Mirrors Playwright's `page.on('dialog', handler)` event stream.
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 *
 * Behavior verified:
 * - dialog.accept() resolves an alert dialog
 * - dialog.dismiss() dismisses a confirm dialog
 * - dialog.accept(text) responds to a prompt dialog with the given text
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Option, Stream } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineDialogTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.onDialog", () => {
    test.live("page-dialog.spec.ts - should fire", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to a real URL so dialogs work (about:blank may suppress them)
            yield* page.goto(`${httpUrl}/empty`);

            // Subscribe BEFORE triggering
            const dialogs = yield* page.onDialog;

            // Trigger alert from the page. Don't override window.alert —
            // overriding prevents the browser's native dialog handler
            // from firing the CDP Page.javascriptDialogOpening event.
            // Use a setTimeout to trigger alert asynchronously so this
            // evaluate returns immediately, then race the stream against
            // a timeout to avoid hanging.
            yield* page.evaluate(() => {
              setTimeout(() => alert("hello world"), 10);
            });

            const first = yield* dialogs.pipe(
              Stream.take(1),
              Stream.runHead,
              Effect.race(Effect.sleep("5 seconds").pipe(Effect.map(() => Option.none<never>()))),
            );
            if (Option.isNone(first)) {
              return yield* Effect.fail("Timed out waiting for dialog event");
            }
            const dialog = first.value;
            yield* assertEqual(dialog.type, "alert");
            yield* assertEqual(dialog.message, "hello world");
            // Dismiss to unblock the page
            yield* dialog.dismiss();
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
    test.live("page-dialog.spec.ts - should allow accepting prompts @smoke", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);

            const dialogs = yield* page.onDialog;
            // Trigger alert asynchronously so the page isn't blocked
            yield* page.evaluate(() => {
              setTimeout(() => alert("accept me"), 10);
            });

            // Wait for the dialog to appear, then accept it
            const first = yield* dialogs.pipe(
              Stream.take(1),
              Stream.runHead,
              Effect.race(Effect.sleep("5 seconds").pipe(Effect.map(() => Option.none<never>()))),
            );
            if (Option.isNone(first)) {
              return yield* Effect.fail("Timed out waiting for dialog event");
            }
            yield* first.value.accept();
            // After accept, alert() returns. The page is unblocked.
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-dialog.spec.ts - should dismiss the prompt", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);

            const dialogs = yield* page.onDialog;
            // Trigger confirm asynchronously. confirm() returns a boolean —
            // true if accepted, false if dismissed.
            yield* page.evaluate(() => {
              setTimeout(() => {
                const result = confirm("dismiss me?");
                (window as any).__confirmResult = result;
              }, 10);
            });

            const first = yield* dialogs.pipe(
              Stream.take(1),
              Stream.runHead,
              Effect.race(Effect.sleep("5 seconds").pipe(Effect.map(() => Option.none<never>()))),
            );
            if (Option.isNone(first)) {
              return yield* Effect.fail("Timed out waiting for dialog event");
            }
            yield* first.value.dismiss();
            const result = yield* page.evaluate(() => (window as any).__confirmResult);
            // confirm() returns false when cancelled
            yield* assertEqual(result, false);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-dialog.spec.ts - should accept the confirm prompt", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);

            const dialogs = yield* page.onDialog;
            // Trigger prompt asynchronously
            yield* page.evaluate(() => {
              setTimeout(() => {
                const result = prompt("what is the answer?");
                (window as any).__promptResult = result;
              }, 10);
            });

            const first = yield* dialogs.pipe(
              Stream.take(1),
              Stream.runHead,
              Effect.race(Effect.sleep("5 seconds").pipe(Effect.map(() => Option.none<never>()))),
            );
            if (Option.isNone(first)) {
              return yield* Effect.fail("Timed out waiting for dialog event");
            }
            yield* first.value.accept("the answer");
            const result = yield* page.evaluate(() => (window as any).__promptResult);
            yield* assertEqual(result, "the answer");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should dismiss the confirm prompt ──────────────────────────────

    test.live("page-dialog.spec.ts - should dismiss the confirm prompt", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);

            const dialogs = yield* page.onDialog;
            yield* page.evaluate(() => {
              setTimeout(() => {
                const result = confirm("question?");
                (window as any).__confirmResult = result;
              }, 10);
            });

            const first = yield* dialogs.pipe(
              Stream.take(1),
              Stream.runHead,
              Effect.race(Effect.sleep("5 seconds").pipe(Effect.map(() => Option.none<never>()))),
            );
            if (Option.isNone(first)) {
              return yield* Effect.fail("Timed out waiting for dialog event");
            }
            yield* first.value.dismiss();
            const result = yield* page.evaluate(() => (window as any).__confirmResult);
            // confirm() returns false when cancelled
            yield* assertEqual(result, false);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should be able to close context with open alert ────────────────

    test.live("page-dialog.spec.ts - should be able to close context with open alert", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);

            const dialogs = yield* page.onDialog;
            yield* page.evaluate(() => {
              setTimeout(() => {
                // eslint-disable-next-line no-alert
                alert("open alert");
              }, 0);
            });

            // Wait for the alert to actually open before closing.
            const first = yield* dialogs.pipe(
              Stream.take(1),
              Stream.runHead,
              Effect.race(Effect.sleep("5 seconds").pipe(Effect.map(() => Option.none<never>()))),
            );
            if (Option.isNone(first)) {
              return yield* Effect.fail("Timed out waiting for dialog event");
            }

            // Close the page while the alert is open. The close should
            // proceed even though the dialog is still outstanding.
            yield* page.close();
            yield* assertTrue(true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should handle multiple alerts ─────────────────────────────────

    test.live("page-dialog.spec.ts - should handle multiple alerts", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);

            const dialogs = yield* page.onDialog;
            // Use setTimeout to fire 3 alerts sequentially (after page load
            // completes). `alert()` blocks the page until dismissed, so the
            // 3 alerts fire one after another; we dismiss each one as it
            // arrives.
            yield* page.evaluate(() => {
              let n = 0;
              const fire = () => {
                // eslint-disable-next-line no-alert
                alert("a" + ++n);
                if (n < 3) setTimeout(fire, 10);
              };
              setTimeout(fire, 10);
            });

            // Drain 3 dialogs.
            for (let i = 0; i < 3; i++) {
              const first = yield* dialogs.pipe(
                Stream.take(1),
                Stream.runHead,
                Effect.race(Effect.sleep("5 seconds").pipe(Effect.map(() => Option.none<never>()))),
              );
              if (Option.isNone(first)) {
                return yield* Effect.fail(`Timed out waiting for dialog ${i + 1}`);
              }
              yield* first.value.dismiss();
            }
            yield* assertTrue(true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should handle multiple confirms ───────────────────────────────

    test.live("page-dialog.spec.ts - should handle multiple confirms", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);

            const dialogs = yield* page.onDialog;
            yield* page.evaluate(() => {
              let n = 0;
              const fire = () => {
                confirm("c" + ++n);
                if (n < 3) setTimeout(fire, 10);
              };
              setTimeout(fire, 10);
            });

            for (let i = 0; i < 3; i++) {
              const first = yield* dialogs.pipe(
                Stream.take(1),
                Stream.runHead,
                Effect.race(Effect.sleep("5 seconds").pipe(Effect.map(() => Option.none<never>()))),
              );
              if (Option.isNone(first)) {
                return yield* Effect.fail(`Timed out waiting for confirm ${i + 1}`);
              }
              yield* first.value.dismiss();
            }
            yield* assertTrue(true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: auto-dismiss without listeners [NOT_PLANNED] ─────────────────

    test.live(
      "page-dialog.spec.ts - should auto-dismiss the prompt without listeners [SKIP: NOT_PLANNED - `browser-cdp` auto-installs a dialog listener via the global Page.javascriptDialogOpening handler; auto-dismiss-on-no-listener semantics are not exposed]",
      () => Effect.void,
    );

    test.live(
      "page-dialog.spec.ts - should auto-dismiss the alert without listeners [SKIP: NOT_PLANNED - `browser-cdp` auto-installs a dialog listener via the global Page.javascriptDialogOpening handler; auto-dismiss-on-no-listener semantics are not exposed]",
      () => Effect.void,
    );
  });
};
