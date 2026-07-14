// oxlint-disable effect/avoid-any — bridging Effect test types to Vitest

/**
 * Shared Vitest adapter for EffectTest.
 *
 * Provides make() factory that returns TestApi for Vitest.
 * Used by Node.js and workerd runtimes.
 *
 * @example
 * ```typescript
 * import { make } from "@test/utils/effect-test/Vitest";
 *
 * const api = make();
 * api.test("my test", () => Effect.gen(...));
 * ```
 */

import type { Layer } from "effect/Layer";

import type {
  TestApi,
  TestFn,
  BeforeAllFn,
  AfterAllFn,
  BeforeEachFn,
  AfterEachFn,
  DescribeFn,
  LayerTestFn,
  TestOptions,
} from "./EffectTest.js";

import { it, describe as effectDescribe, layer as effectLayer } from "@effect/vitest";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Vitest from "vitest";

/**
 * Create TestApi for Vitest.
 */
export const make = (): TestApi => {
  const test = ((
    name: string,
    fn: () => Effect.Effect<void, any, never>,
    options?: TestOptions,
  ) => {
    it.effect(name, fn as any, vitestOptionsFromEffectTestOptions(options));
  }) as TestFn;

  test.skip = (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => {
    it.skip(name, fn as any, options?.timeoutMs);
  };

  test.only = (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => {
    Vitest.it.only(name, () => Effect.runPromise(fn()), options?.timeoutMs);
  };

  test.skipIf =
    (condition: boolean) =>
    (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => {
      it.skipIf(condition)(name, fn as any, options?.timeoutMs);
    };

  test.live = (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => {
    it.live(name, fn as any, options?.timeoutMs);
  };

  const describeFn = ((name: string, fn: () => void) =>
    effectDescribe(name, fn)) as unknown as DescribeFn;

  describeFn.skip = (name: string, fn: () => void) => effectDescribe.skip(name, fn);
  describeFn.only = (name: string, fn: () => void) => effectDescribe.only(name, fn);

  const beforeAllFn = ((fn: () => Effect.Effect<unknown, any, never>) => {
    Vitest.beforeAll(() => Effect.runPromise(fn()));
  }) as BeforeAllFn;

  const afterAllFn = ((fn: () => Effect.Effect<void, any, never>) => {
    Vitest.afterAll(() => Effect.runPromise(fn()));
  }) as AfterAllFn;

  afterAllFn.skipIf = (condition: boolean) => (fn: () => Effect.Effect<void, any, never>) => {
    if (condition) return;
    Vitest.afterAll(() => Effect.runPromise(fn()));
  };

  const beforeEachFn: BeforeEachFn = (fn: () => Effect.Effect<void, any, never>) => {
    Vitest.beforeEach(() => Effect.runPromise(fn()));
  };

  const afterEachFn: AfterEachFn = (fn: () => Effect.Effect<void, any, never>) => {
    Vitest.afterEach(() => Effect.runPromise(fn()));
  };

  const layerFn = <R, E>(layer: Layer<R, E, never>) => {
    const run = effectLayer(layer as Layer<R, never, never>);
    return (fn: (it: LayerTestFn) => void) => {
      // Use 2-arg form to avoid getCurrentSuite() which fails in workerd pool
      run("Layer", (providedIt) => {
        const realLayerIt: LayerTestFn = {
          effect: (name, testFn, options) =>
            providedIt.effect(name, testFn as any, vitestOptionsFromEffectTestOptions(options)),
          skip: (name, testFn, options) => providedIt.skip(name, testFn as any, options?.timeoutMs),
          only: (name, testFn, options) => providedIt.only(name, testFn as any, options?.timeoutMs),
        };
        fn(realLayerIt);
      });
    };
  };

  return {
    test,
    describe: describeFn,
    beforeAll: beforeAllFn,
    afterAll: afterAllFn,
    beforeEach: beforeEachFn,
    afterEach: afterEachFn,
    layer: layerFn,
  };
};

/**
 * Translate the framework-agnostic `TestOptions` into the shape vitest's
 * `it.effect` expects. Currently:
 * - `timeoutMs` → `timeout` (vitest's option key)
 * - `tag` → `tags` (vitest's option key, normalized to an array)
 *
 * Pass the result as the third arg to `it.effect(name, fn, options)`.
 */
const vitestOptionsFromEffectTestOptions = (
  options: TestOptions | undefined,
): { readonly timeout?: number; readonly tags?: string[] } | number | undefined => {
  if (!options) return undefined;
  const vitestOptions: { timeout?: number; tags?: string[] } = {};
  if (options.timeoutMs !== undefined) vitestOptions.timeout = options.timeoutMs;
  if (options.tag !== undefined) {
    vitestOptions.tags = Array.isArray(options.tag) ? [...options.tag] : [options.tag];
  }
  return Arr.isReadonlyArrayEmpty(Object.keys(vitestOptions)) ? undefined : vitestOptions;
};
