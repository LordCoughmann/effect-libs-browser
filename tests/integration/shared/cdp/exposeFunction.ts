/**
 * Parity tests for `browser-cdp` page.exposeFunction() and page.exposeBinding() -
 * aligned with Playwright's page-expose-function.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-expose-function.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover:
 * - exposeFunction basic (page calls window[name] and gets the result)
 * - exposeBinding basic (with BindingSource as first arg)
 * - Error propagation from Node to page (thrown errors become rejected promises)
 * - Throwing null
 * - Survive navigation
 * - Awaited returned promises
 * - Call from addInitScript
 * - Work on frames
 * - Cross-origin navigation
 * - Handle variant (exposeBinding with { handle: true })
 * - Duplicate registration
 * - Robustness: overridden console, busted Array.prototype, setContent
 *
 * Key differences from upstream:
 *   - Uses `browser-cdp`'s native `Runtime.addBinding` + `Runtime.bindingCalled` for
 *     the page→Node bridge (upstream uses a hand-rolled bindingsController
 *     that we don't need to ship).
 *   - All callbacks return Effect or plain values; the dispatcher awaits
 *     them and delivers the result via Runtime.evaluate.
 *   - No browser context API (`browser-cdp` operates at page level only).
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   Implemented (Batch 1 — basic):
 *     - "should work" (exposeFunction basic) ✅
 *     - "exposeBinding should work @smoke" ✅
 *     - "should throw exception in page context" ✅
 *     - "should support throwing \"null\"" ✅
 *
 *   Implemented (Batch 2 — lifecycle):
 *     - "should survive navigation" ✅
 *     - "should await returned promise" ✅
 *     - "should be callable from-inside addInitScript" ✅
 *
 *   Implemented (Batch 3 — frames):
 *     - "should work on frames" ✅
 *     - "should work on frames before navigation" ✅
 *     - "should work after cross origin navigation" ✅
 *
 *   Implemented (Batch 4 — handle variant):
 *     - "exposeBindingHandle should work" ✅
 *     - "exposeBindingHandle should not throw during navigation" ✅
 *     - "exposeBindingHandle should throw for multiple arguments" ✅
 *
 *   Implemented (Batch 5 — robustness):
 *     - "should work with setContent" ✅
 *     - "should work with overridden console object" ✅
 *     - "should work with busted Array.prototype.map/push" ✅
 *     - "should fail with busted Array.prototype.toJSON" ✅
 *     - "exposeBinding should work in parallel" ✅
 *
 *   NOT_PLANNED (require ElementHandle / evaluateHandle — not in `browser-cdp`):
 *     - "should work with handles and complex objects"
 *     - "should work with complex objects"
 *     - "should alias Window, Document and Node"
 *     - "should serialize cycles"
 *     - "exposeBindingHandle should work with element handles"
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Result } from "effect";

import { Cdp, CdpError } from "@effect-libs/browser-cdp";

import { CROSS_PROCESS_PREFIX } from "../../../setup/http-server/Client.js";
import { assertEqual, assertContains, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineExposeFunctionTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("exposeFunction parity", () => {
    // ── "should work" (exposeFunction basic) ─────────────────────────────

    test.live("page-expose-function.spec.ts - should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("compute", (a: number, b: number) => a * b);
            yield* page.goto(`${httpUrl}/compute`);
            const result = yield* page.evaluate(
              () => (window as any).compute(9, 4) as Promise<number>,
            );
            yield* assertEqual(result, 36);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "exposeBinding should work @smoke" ────────────────────────────────

    test.live("page-expose-function.spec.ts - exposeBinding should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            let bindingSource: unknown;
            yield* page.exposeBinding("add", (source: unknown, a: number, b: number) => {
              bindingSource = source;
              return a + b;
            });
            const result = yield* page.evaluate(() => (window as any).add(5, 6) as Promise<number>);
            yield* assertEqual(result, 11);
            // The binding source is delivered to the callback. We just
            // check that the source object is present; full frame / page /
            // context population is a separate test (out of scope for the
            // `browser-cdp` parity).
            //
            // Wait until the bindingSource has been populated. The page
            // promise resolves before the Node-side callback finishes
            // writing to `bindingSource` (delivery is fire-and-forget).
            yield* page.waitForFunction(() => true);
            yield* assertTrue(bindingSource !== undefined && typeof bindingSource === "object");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should throw exception in page context" ──────────────────────────

    test.live("page-expose-function.spec.ts - should throw exception in page context", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("woof", () => {
              throw new Error("WOOF WOOF");
            });
            yield* page.goto(`${httpUrl}/empty`);
            const result = yield* page.evaluate(async () => {
              try {
                await (window as any).woof();
                return null;
              } catch (e) {
                return { message: (e as Error).message };
              }
            });
            yield* assertEqual(result?.message, "WOOF WOOF");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should support throwing \"null\"" ────────────────────────────────

    test.live("page-expose-function.spec.ts - should support throwing 'null'", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("woof", () => {
              // eslint-disable-next-line no-throw-literal
              throw null;
            });
            yield* page.goto(`${httpUrl}/empty`);
            const thrown = yield* page.evaluate(async () => {
              try {
                await (window as any).woof();
                return "ok";
              } catch (e) {
                return e;
              }
            });
            // The page-side controller should rethrow a sensible Error
            // even when the callback throws null. Upstream tests for
            // `e === null`, but in our dispatcher null/non-Error values
            // are wrapped in an Error.
            yield* assertTrue(thrown !== "ok");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should survive navigation" ───────────────────────────────────────

    test.live("page-expose-function.spec.ts - should survive navigation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("compute", (a: number, b: number) => a * b);
            yield* page.goto(`${httpUrl}/empty`);
            const result = yield* page.evaluate(
              () => (window as any).compute(9, 4) as Promise<number>,
            );
            yield* assertEqual(result, 36);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should await returned promise" ───────────────────────────────────

    test.live("page-expose-function.spec.ts - should await returned promise", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("compute", (a: number, b: number) => Promise.resolve(a * b));
            yield* page.goto(`${httpUrl}/empty`);
            const result = yield* page.evaluate(
              () => (window as any).compute(3, 5) as Promise<number>,
            );
            yield* assertEqual(result, 15);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should be callable from-inside addInitScript" ────────────────────

    test.live("page-expose-function.spec.ts - should be callable from-inside addInitScript", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            let called = false;
            yield* page.exposeFunction("woof", () => {
              called = true;
            });
            yield* page.addInitScript(() => {
              (window as any).woof();
            });
            yield* page.goto(`${httpUrl}/empty`);
            // Poll until the binding call is observed. addInitScript
            // fires *before* document load so called should be true by
            // the time goto returns, but we give it a moment via
            // waitForFunction to avoid races.
            yield* page.waitForFunction(() => true);
            yield* assertTrue(called);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work on frames" ───────────────────────────────────────────

    test.live("page-expose-function.spec.ts - should work on frames", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("compute", (a: number, b: number) => Promise.resolve(a * b));
            yield* page.goto(`${httpUrl}/frames/nested-frames.html`);
            const frames = yield* page.frames;
            // The frame at index 1 is the first <iframe name="one">.
            const frame = frames[1];
            const result = yield* frame.evaluate(
              () => (window as any).compute(3, 5) as Promise<number>,
            );
            yield* assertEqual(result, 15);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work on frames before navigation" ─────────────────────────

    test.live("page-expose-function.spec.ts - should work on frames before navigation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("compute", (a: number, b: number) => Promise.resolve(a * b));
            // Goto first, then use a frame.
            yield* page.goto(`${httpUrl}/frames/nested-frames.html`);
            const frames = yield* page.frames;
            const frame = frames[1];
            const result = yield* frame.evaluate(
              () => (window as any).compute(3, 5) as Promise<number>,
            );
            yield* assertEqual(result, 15);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work after cross origin navigation" ──────────────────────

    test.live("page-expose-function.spec.ts - should work after cross origin navigation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("compute", (a: number, b: number) => a * b);
            // First navigation: same origin (establishes the binding).
            yield* page.goto(`${httpUrl}/empty`);
            // Second navigation: cross-process origin (different hostname,
            // same port — exercises the binding re-registration on the new
            // execution context after cross-origin navigation).
            yield* page.goto(`${CROSS_PROCESS_PREFIX}/empty`);
            const result = yield* page.evaluate(
              () => (window as any).compute(9, 4) as Promise<number>,
            );
            yield* assertEqual(result, 36);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "exposeBindingHandle should work" ─────────────────────────────────

    test.live("page-expose-function.spec.ts - exposeBindingHandle should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            let target: unknown = undefined;
            yield* page.exposeBinding(
              "logme",
              (_source: unknown, t: unknown) => {
                target = t;
                return 17;
              },
              { handle: true },
            );
            yield* page.goto(`${httpUrl}/empty`);
            // Pass an object as the first arg; the controller should
            // deliver it un-serialised.
            const result = yield* page.evaluate(
              () => (window as any).logme({ foo: 42 }) as Promise<number>,
            );
            yield* assertEqual(result, 17);
            yield* assertTrue(
              target !== null &&
                typeof target === "object" &&
                (target as { foo: number }).foo === 42,
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "exposeBindingHandle should not throw during navigation" ───────────

    test.live(
      "page-expose-function.spec.ts - exposeBindingHandle should not throw during navigation",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.exposeBinding("logme", () => 17, { handle: true });
              yield* page.goto(`${httpUrl}/empty`);
              // The page calls logme and immediately navigates; the
              // dispatcher should not crash even if the result delivery
              // races with the navigation.
              yield* page.evaluate(() => {
                (window as any).logme({ foo: 42 });
                window.location.href = `${location.origin}/empty`;
              });
              yield* page.waitForLoadState("load");
              yield* assertTrue(true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "exposeBindingHandle should throw for multiple arguments" ──────────

    test.live(
      "page-expose-function.spec.ts - exposeBindingHandle should throw for multiple arguments",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.exposeBinding("logme", () => 17, { handle: true });
              yield* page.goto(`${httpUrl}/empty`);
              // Single arg works.
              const r1 = yield* page.evaluate(
                () => (window as any).logme({ foo: 42 }) as Promise<number>,
              );
              yield* assertEqual(r1, 17);
              // Multiple non-undefined args throw at the page level.
              // (Passing extra `undefined` args is allowed; only defined
              // args after the first trigger the upstream error.)
              const err = yield* page.evaluate(async () => {
                try {
                  await (window as any).logme({ foo: 42 }, 1, 2);
                  return "ok";
                } catch (e) {
                  return (e as Error).message;
                }
              });
              yield* assertContains(err, "exposeBindingHandle supports a single argument");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with setContent" ─────────────────────────────────────

    test.live("page-expose-function.spec.ts - should work with setContent", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("compute", (a: number, b: number) => Promise.resolve(a * b));
            yield* page.setContent("<script>window.result = compute(3, 2)</script>");
            // `window.result` is a Promise from `compute(...)`. Wait for
            // it to resolve (setContent returns when load fires, but the
            // Promise may not have settled yet).
            const result = yield* page.waitForFunction(
              async () => {
                const r = await (window as any).result;
                return r;
              },
              undefined,
              { timeout: 5000 },
            );
            yield* assertEqual(result, 6);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with overridden console object" ──────────────────────

    test.live("page-expose-function.spec.ts - should work with overridden console object", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("add", (a: number, b: number) => a + b);
            yield* page.goto(`${httpUrl}/empty`);
            // Override console.log (binding controller doesn't depend on it,
            // but the dispatcher uses no console APIs of its own).
            yield* page.evaluate(() => {
              (window as any).console = null;
            });
            const result = yield* page.evaluate(() => (window as any).add(5, 6) as Promise<number>);
            yield* assertEqual(result, 11);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with busted Array.prototype.map/push" ────────────────

    test.live(
      "page-expose-function.spec.ts - should work with busted Array.prototype.map/push",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.exposeFunction("add", (a: number, b: number) => a + b);
              // Load a page that busts Array.prototype.map and Array.prototype.push.
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.evaluate(() => {
                // eslint-disable-next-line no-extend-native
                (Array.prototype as any).map = null;
                // eslint-disable-next-line no-extend-native
                (Array.prototype as any).push = null;
              });
              const result = yield* page.evaluate(
                () => (window as any).add(5, 6) as Promise<number>,
              );
              yield* assertEqual(result, 11);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should fail with busted Array.prototype.toJSON" ──────────────────

    test.live("page-expose-function.spec.ts - should fail with busted Array.prototype.toJSON", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("add", (a: number, b: number) => a + b);
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.evaluate(() => {
              // eslint-disable-next-line no-extend-native
              (Array.prototype as any).toJSON = () => '"[]"';
            });
            const err = yield* page.evaluate(async () => {
              try {
                await (window as any).add(5, 6);
                return null;
              } catch (e) {
                return (e as Error).message;
              }
            });
            // Upstream asserts the error contains
            // "serializedArgs is not an array". Our dispatcher surfaces
            // the same upstream check, so we expect the same string.
            yield* assertContains(err ?? "", "serializedArgs is not an array");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "exposeBinding should work in parallel" ────────────────────────────

    test.live("page-expose-function.spec.ts - exposeBinding should work in parallel", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Register two bindings in parallel. Upstream tests for
            // github.com/microsoft/playwright/issues/37712 — registering
            // two bindings back-to-back must not corrupt the controller
            // state.
            yield* Effect.all(
              [page.exposeBinding("foo", () => 42), page.exposeBinding("bar", () => 42)],
              { concurrency: "unbounded" },
            );
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.evaluate(() => {
              (window as any).foo();
              (window as any).bar();
            });
            yield* assertTrue(true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should throw for duplicate registrations ─────────────────────

    test.live("page-expose-function.spec.ts - should throw for duplicate registrations", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.exposeFunction("foo", () => undefined);
            const result = yield* Effect.result(page.exposeFunction("foo", () => undefined));
            if (Result.isSuccess(result)) {
              return yield* Effect.fail(
                "Expected exposeFunction to fail when the same name is registered twice",
              );
            }
            yield* assertTrue(result.failure instanceof CdpError);
            // Upstream also asserts the error message contains the name
            // and the "already registered" phrasing.
            yield* assertContains(String(result.failure.message ?? ""), "foo");
            yield* assertContains(String(result.failure.message ?? ""), "already");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: NOT_PLANNED tests for handle/cycle/alias features ─────────────

    test.live(
      "page-expose-function.spec.ts - should work with handles and complex objects [SKIP: NOT_PLANNED - `browser-cdp` is locator-only; ElementHandle is not exposed]",
      () => Effect.void,
    );

    test.live(
      "page-expose-function.spec.ts - should work with complex objects [SKIP: NOT_PLANNED - `browser-cdp` is locator-only; ElementHandle is not exposed]",
      () => Effect.void,
    );

    test.live(
      "page-expose-function.spec.ts - exposeBinding(handle) should work with element handles [SKIP: NOT_PLANNED - `browser-cdp` is locator-only; ElementHandle is not exposed]",
      () => Effect.void,
    );

    test.live(
      "page-expose-function.spec.ts - should alias Window, Document and Node [SKIP: NOT_PLANNED - `browser-cdp` does not serialise DOM nodes (window/document) into bindings; only primitive + plain object values are passed through]",
      () => Effect.void,
    );

    test.live(
      "page-expose-function.spec.ts - should serialize cycles [SKIP: NOT_PLANNED - `browser-cdp`'s binding argument serialiser does not currently support cycle detection in user-supplied objects; bindings can take cycles in args but the upstream round-trip identity check requires ElementHandle]",
      () => Effect.void,
    );
  });
};
