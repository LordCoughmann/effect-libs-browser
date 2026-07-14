/**
 * Parity tests for `browser-cdp` page.evaluateHandle() and Locator.evaluateHandle().
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-evaluate-handle.spec.ts
 *              (and jshandle-{properties,json-value,as-element,evaluate}.spec.ts)
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover the JSHandle-like handle API (Phase P1.2 + P1.5):
 * - Creating handles via `page.evaluateHandle(fn)`
 * - Passing handles to subsequent `page.evaluate(fn, handle)` calls
 * - Nested handle args (`{ foo: handle }`)
 * - `handle.evaluate(fn)` — function-on-handle form
 * - `handle.evaluateHandle(fn)` — return a new handle (Phase P1.5)
 * - `handle.getProperty(name)` / `getProperties()` — property access
 * - `handle.jsonValue()` — JSON projection, bypassing toJSON (Phase P1.5)
 * - `handle.asElement()` — element detection (Phase P1.5)
 * - `handle.dispose()` — releases the remote object reference
 * - Primitive-handle fallback for `evaluateHandle(() => 5)` (Phase P1.5)
 *
 * Key differences from upstream:
 *   - `browser-cdp` evaluateHandle returns a `CdpHandle` (objectId wrapper), not
 *     Playwright's full `JSHandle` (which proxies property reads with
 *     `Runtime.getProperties` round-trips).
 *   - `getProperty` returns a `CdpPrimitiveHandle` for primitive-valued
 *     properties (with a wrapped value); use `.jsonValue()` to read.
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   Phase P1.5 closes:
 *     - "should accept object handle to primitive types" — covered by
 *       the "should accept object handle to primitive types" test below.
 *
 *   Repeated-reference serializer (resolved in P1.6):
 *     - "should accept same nested object multiple times" — now supported.
 *       The browser-side __serialize tracks array/object ids and emits
 *       {ref: id} for repeated references; the Node-side parser resolves
 *       refs via the refs map (so identity is preserved alongside the
 *       existing deep-equality behavior).
 *
 *   Adapted upstream test "should accept object handle to unserializable
 *   value": Infinity is wrapped in an object ({ value: Infinity }) so the
 *   browser returns an objectId; the handle's evaluate returns true.
 *
 *   Subsumed (same value tested by differently-named test):
 *     - "should be able to throw a tricky error" — covered by evaluate error tests
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Result } from "effect";

import { Cdp, CdpError, EvaluationError } from "@effect-libs/browser-cdp";

import { AssertionError, assertTrue } from "../../../utils/effect-test/EffectTest.js";
import {
  assertIs,
  assertStructuralEqual,
  assertStringContains,
} from "../../../utils/effect-test/SerializationAssertions.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

/** Helper to assert an Effect failed with a CdpError containing EvaluationError. */
const assertEvaluateError = <A>(
  result: Result.Result<A, CdpError>,
  needle: string,
): Effect.Effect<void, AssertionError> =>
  Effect.sync(() => {
    if (Result.isSuccess(result)) {
      throw new AssertionError("Expected effect to fail, but it succeeded");
    }
    const err = result.failure;
    if (!(err instanceof CdpError)) {
      throw new AssertionError(`Expected CdpError, got ${String(err)}`);
    }
    if (!(err.reason instanceof EvaluationError)) {
      throw new AssertionError(`Expected EvaluationError reason, got ${String(err.reason)}`);
    }
    if (!err.reason.description.includes(needle)) {
      throw new AssertionError(
        `Expected error description to contain "${needle}", got "${err.reason.description}"`,
      );
    }
  });

export const defineEvaluateHandleTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.evaluateHandle parity", () => {
    // ── Basic handle creation ───────────────────────────────────────────────────────

    test.live("page-evaluate-handle.spec.ts - should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const windowHandle = yield* page.evaluateHandle(() => window);
            yield* assertTrue(windowHandle !== null && windowHandle !== undefined);
            yield* assertTrue(typeof windowHandle.objectId === "string");
            yield* windowHandle.dispose();
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Handle passed as evaluate argument ─────────────────────────────────────────

    test.live("page-evaluate-handle.spec.ts - should accept object handle as an argument", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const navigatorHandle = yield* page.evaluateHandle(() => navigator);
            const userAgent = yield* page.evaluate((n: Navigator) => n.userAgent, navigatorHandle);
            yield* assertStringContains(userAgent as string, "Mozilla");
            yield* navigatorHandle.dispose();
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Nested handle args ──────────────────────────────────────────────────────────

    test.live("page-evaluate-handle.spec.ts - should accept nested handle", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const foo = yield* page.evaluateHandle(() => ({ x: 1, y: "foo" }));
            const result = yield* page.evaluate(
              (args: { foo: { x: number; y: string } }) => args.foo,
              { foo },
            );
            yield* assertIs((result as { x: number; y: string }).x, 1);
            yield* assertIs((result as { x: number; y: string }).y, "foo");
            yield* foo.dispose();
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-evaluate-handle.spec.ts - should accept nested window handle", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const foo = yield* page.evaluateHandle(() => window);
            const result = yield* page.evaluate((args: { foo: Window }) => args.foo === window, {
              foo,
            });
            yield* assertIs(result, true);
            yield* foo.dispose();
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-evaluate-handle.spec.ts - should accept multiple nested handles", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // All three handles are objects (not primitives) so CDP
            // returns objectIds for each.
            const fooHandle = yield* page.evaluateHandle(() => ({ x: 1, y: "foo" }));
            const barHandle = yield* page.evaluateHandle(() => ({ value: 5 }));
            const bazHandle = yield* page.evaluateHandle(() => ({ arr: ["baz"] }));
            const result = yield* page.evaluate(
              (x: { a1: { foo: unknown }; a2: { bar: unknown; arr: Array<{ baz: unknown }> } }) =>
                JSON.stringify(x),
              { a1: { foo: fooHandle }, a2: { bar: barHandle, arr: [{ baz: bazHandle }] } },
            );
            yield* assertStructuralEqual(JSON.parse(result as string), {
              a1: { foo: { x: 1, y: "foo" } },
              a2: { bar: { value: 5 }, arr: [{ baz: { arr: ["baz"] } }] },
            });
            yield* fooHandle.dispose();
            yield* barHandle.dispose();
            yield* bazHandle.dispose();
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-evaluate-handle.spec.ts - should accept same handle multiple times", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Wrap the primitive in an object so CDP returns an objectId.
            const foo = yield* page.evaluateHandle(() => ({ value: 1 }));
            const result = yield* page.evaluate(
              (x: {
                foo: { value: number };
                bar: Array<{ value: number }>;
                baz: { foo: { value: number } };
              }) => x,
              { foo, bar: [foo], baz: { foo } },
            );
            yield* assertStructuralEqual(result, {
              foo: { value: 1 },
              bar: [{ value: 1 }],
              baz: { foo: { value: 1 } },
            });
            yield* foo.dispose();
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Reuse handle ───────────────────────────────────────────────────────────────

    test.live("page-evaluate-handle.spec.ts - should work with primitives", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const windowHandle = yield* page.evaluateHandle(() => {
              (window as any)["FOO"] = 123;
              return window;
            });
            const foo = yield* page.evaluate((w: Window) => (w as any)["FOO"], windowHandle);
            yield* assertIs(foo, 123);
            yield* windowHandle.dispose();
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── handle.evaluate(fn) ────────────────────────────────────────────────────────

    test.live(
      "page-evaluate-handle.spec.ts - handle.evaluate should work on a primitive handle",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // Wrap the primitive in an object so the browser returns
              // an objectId; then evaluate `e.value === 5`.
              const fiveHandle = yield* page.evaluateHandle(() => ({ value: 5 }));
              const result = yield* fiveHandle.evaluate((e: unknown) =>
                Object.is((e as { value: number }).value, 5),
              );
              yield* assertIs(result, true);
              yield* fiveHandle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-evaluate-handle.spec.ts - handle.evaluate should read window properties", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const windowHandle = yield* page.evaluateHandle(() => window);
            const innerWidth = yield* windowHandle.evaluate(
              (w: unknown) => (w as Window).innerWidth,
            );
            yield* assertTrue(typeof innerWidth === "number");
            yield* windowHandle.dispose();
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Primitive result (Phase P1.5) ────────────────────────────────────────────
    //
    // In Phase P1.2, primitive results failed because CDP
    // `Runtime.evaluate` does not return an `objectId` for primitives.
    // Phase P1.5 adds a primitive-handle fallback so the user can still
    // call `jsonValue()` on the result. Verify the new behavior.

    test.live("page-evaluate-handle.spec.ts - should accept object handle to primitive types", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const handle = yield* page.evaluateHandle(() => 7 * 3);
            // The handle is a primitive handle — it should still have
            // a string `objectId` (synthetic), `dispose`, and `jsonValue`.
            yield* assertTrue(typeof handle.objectId === "string");
            yield* assertIs(yield* handle.jsonValue(), 21);
            yield* handle.dispose();
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── handle.getProperty ─────────────────────────────────────────────────────────

    test.live(
      "page-evaluate-handle.spec.ts - handle.getProperty should read an object-valued property",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const handle = yield* page.evaluateHandle(() => ({ foo: { bar: "baz" } }));
              const fooProp = yield* handle.getProperty("foo");
              const barValue = yield* fooProp.evaluate((v: unknown) => (v as { bar: string }).bar);
              yield* assertIs(barValue, "baz");
              yield* handle.dispose();
              yield* fooProp.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-evaluate-handle.spec.ts - handle.getProperty should fail for missing property",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const handle = yield* page.evaluateHandle(() => ({ foo: "bar" }));
              const result = yield* Effect.result(handle.getProperty("missing"));
              yield* assertEvaluateError(result, "missing");
              yield* handle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── handle.dispose ────────────────────────────────────────────────────────────

    test.live(
      "page-evaluate-handle.spec.ts - handle.dispose should release the remote object",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const handle = yield* page.evaluateHandle(() => ({ x: 1 }));
              yield* handle.dispose();
              // Calling evaluate after dispose fails (CDP "Invalid objectId" or similar).
              const result = yield* Effect.result(
                handle.evaluate((v: unknown) => (v as { x: number }).x),
              );
              yield* assertTrue(Result.isFailure(result));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Additional upstream tests ──────────────────────────────────────────────────

    // Upstream test "should accept same nested object multiple times" —
    // resolved in Phase P1.6. The browser-side __serialize now tracks ids
    // for arrays/plain objects and emits {ref: id} for repeated references;
    // the Node-side serializedValueToJsExpression substitutes ref markers
    // with previously-built inline literals, so all three references
    // round-trip correctly.
    test.live(
      "page-evaluate-handle.spec.ts - should accept same nested object multiple times",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const foo = { x: 1 };
              const result = yield* page.evaluate(
                (x: {
                  foo: { x: number };
                  bar: Array<{ x: number }>;
                  baz: { foo: { x: number } };
                }) => x,
                { foo, bar: [foo], baz: { foo } },
              );
              yield* assertStructuralEqual(result, {
                foo: { x: 1 },
                bar: [{ x: 1 }],
                baz: { foo: { x: 1 } },
              });
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-evaluate-handle.spec.ts - should accept object handle to unserializable value",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // Wrap Infinity in an object so the browser returns an
              // objectId. The handle's value preserves Infinity across the
              // CDP boundary via our serializer.
              const infHandle = yield* page.evaluateHandle(() => ({ value: Infinity }));
              const isInfinity = yield* infHandle.evaluate((e: unknown) =>
                Object.is((e as { value: number }).value, Infinity),
              );
              yield* assertIs(isInfinity, true);
              yield* infHandle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-evaluate-handle.spec.ts - should pass configurable args", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const result = yield* page.evaluate(
              (arg: Record<string, number>) => {
                if (arg.foo !== 42) throw new Error("Not a 42");
                arg.foo = 17;
                if (arg.foo !== 17) throw new Error("Not 17");
                delete arg.foo;
                if (arg.foo === 17) throw new Error("Still 17");
                return arg;
              },
              { foo: 42 },
            );
            yield* assertStructuralEqual(result, {});
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Phase P1.5 — handle.evaluateHandle / jsonValue / getProperties / asElement ─

    // Upstream test "should evaluate handle" — verifies
    // `handle.evaluateHandle` returns a new handle for the result. From
    // `jshandle-evaluate.spec.ts - should work with function`.
    test.live(
      "page-evaluate-handle.spec.ts - handle.evaluateHandle should return a new handle",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const windowHandle = yield* page.evaluateHandle(() => {
                (window as unknown as { __foo: unknown[] })["__foo"] = [1, 2];
                return window;
              });
              const fooHandle = yield* windowHandle.evaluateHandle(
                (w: unknown) => (w as unknown as { __foo: unknown[] })["__foo"],
              );
              const foo = yield* fooHandle.evaluate((v: unknown) => v);
              yield* assertStructuralEqual(foo, [1, 2]);
              yield* windowHandle.dispose();
              yield* fooHandle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // From `jshandle-properties.spec.ts - getProperties should work`.
    test.live(
      "page-evaluate-handle.spec.ts - handle.getProperties should return all own properties as a map",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const handle = yield* page.evaluateHandle(() => ({ foo: "bar", baz: 42 }));
              const properties = yield* handle.getProperties();
              yield* assertTrue(properties.has("foo"));
              yield* assertTrue(properties.has("baz"));
              const fooValue = yield* properties.get("foo")!.jsonValue();
              const bazValue = yield* properties.get("baz")!.jsonValue();
              yield* assertIs(fooValue, "bar");
              yield* assertIs(bazValue, 42);
              yield* handle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // From `jshandle-properties.spec.ts - should work with undefined, null, and empty`.
    test.live(
      "page-evaluate-handle.spec.ts - handle.getProperties should return primitive handles for primitive-valued properties",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const handle = yield* page.evaluateHandle(() => ({
                undef: undefined,
                nul: null,
              }));
              const properties = yield* handle.getProperties();
              const undefHandle = properties.get("undef")!;
              const nulHandle = properties.get("nul")!;
              yield* assertIs(yield* undefHandle.jsonValue(), undefined);
              yield* assertIs(yield* nulHandle.jsonValue(), null);
              yield* handle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // From `jshandle-json-value.spec.ts - should work`.
    test.live(
      "page-evaluate-handle.spec.ts - handle.jsonValue should return a plain JS value (no toJSON)",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const handle = yield* page.evaluateHandle(() => ({ foo: "bar" }));
              const json = yield* handle.jsonValue();
              yield* assertStructuralEqual(json, { foo: "bar" });
              yield* handle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // From `jshandle-json-value.spec.ts - should work with dates`. The
    // serializer uses `Date.toISOString()` (not `toJSON()`) and the
    // deserializer reconstructs a Date object.
    test.live(
      "page-evaluate-handle.spec.ts - handle.jsonValue should preserve Date as a Date object",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const dateHandle = yield* page.evaluateHandle(
                () => new Date("2017-09-26T00:00:00.000Z"),
              );
              const date = (yield* dateHandle.jsonValue()) as Date;
              yield* assertTrue(date instanceof Date);
              yield* assertIs(date.toJSON(), "2017-09-26T00:00:00.000Z");
              yield* dateHandle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // From `jshandle-as-element.spec.ts - should return null for non-elements`.
    test.live(
      "page-evaluate-handle.spec.ts - handle.asElement should return null for non-DOM handles",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const handle = yield* page.evaluateHandle(() => 2);
              const element = yield* handle.asElement();
              yield* assertIs(element, null);
              yield* handle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // From `jshandle-as-element.spec.ts - should work` (for DOM elements).
    test.live(
      "page-evaluate-handle.spec.ts - handle.asElement should return the handle for DOM elements",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const handle = yield* page.evaluateHandle(() => document.body);
              const element = yield* handle.asElement();
              yield* assertTrue(element !== null);
              yield* handle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Verify primitive handle's `jsonValue` returns the wrapped value
    // directly (no CDP round-trip needed).
    test.live(
      "page-evaluate-handle.spec.ts - primitive handle.jsonValue should return the wrapped value",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const stringHandle = yield* page.evaluateHandle(() => "hello world");
              const value = yield* stringHandle.jsonValue();
              yield* assertIs(value, "hello world");
              yield* stringHandle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Verify primitive handle's `evaluate` runs the function in the
    // browser with the primitive value inlined as a literal.
    test.live(
      "page-evaluate-handle.spec.ts - primitive handle.evaluate should run the function with the primitive value",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const numHandle = yield* page.evaluateHandle(() => 42);
              const doubled = yield* numHandle.evaluate((v: unknown) => (v as number) * 2);
              yield* assertIs(doubled, 84);
              yield* numHandle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Verify a primitive handle can be passed as an evaluate arg. The
    // value should be inlined as a literal in the function declaration.
    test.live(
      "page-evaluate-handle.spec.ts - primitive handle passed as evaluate arg should be inlined as a value",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const fiveHandle = yield* page.evaluateHandle(() => 5);
              const sum = yield* page.evaluate(
                (args: { a: number; b: number }) => args.a + args.b,
                { a: 3, b: fiveHandle },
              );
              yield* assertIs(sum, 8);
              yield* fiveHandle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Verify primitive handle's `getProperties` returns an empty map and
    // `getProperty` fails.
    test.live(
      "page-evaluate-handle.spec.ts - primitive handle.getProperties should return an empty map",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const handle = yield* page.evaluateHandle(() => 42);
              const properties = yield* handle.getProperties();
              yield* assertIs(properties.size, 0);
              const result = yield* Effect.result(handle.getProperty("anyProp"));
              yield* assertEvaluateError(result, "no properties");
              yield* handle.dispose();
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Phase P1.5 — handle.evaluateHandle / jsonValue / getProperties / asElement ─
  });
};
