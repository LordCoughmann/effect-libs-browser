/**
 * Bun adapter for EffectTest.
 *
 * Provides make() factory that returns TestApi for Bun's test framework.
 *
 * @example
 * ```typescript
 * import { make } from "./Bun";
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
} from "../../../utils/effect-test/EffectTest.js";

import {
  test as bunTest,
  describe as bunDescribe,
  beforeAll as bunBeforeAll,
  afterAll as bunAfterAll,
  beforeEach as bunBeforeEach,
  afterEach as bunAfterEach,
} from "bun:test";
import * as Effect from "effect/Effect";

/**
 * Default per-test timeout in milliseconds.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

const timeoutOptions = (ms?: number) =>
  ms !== undefined ? { timeout: ms } : { timeout: DEFAULT_TIMEOUT_MS };

/**
 * Create TestApi for Bun.
 */
export const make = (): TestApi => {
  const test = ((
    name: string,
    fn: () => Effect.Effect<void, any, never>,
    options?: TestOptions,
  ) => {
    bunTest(name, timeoutOptions(options?.timeoutMs), () => Effect.runPromise(fn()));
  }) as TestFn;

  test.skip = (name: string, fn: () => Effect.Effect<void, any, never>, _options?: TestOptions) => {
    bunTest.skip(name, () => Effect.runPromise(fn()));
  };

  test.only = (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => {
    bunTest.only(name, timeoutOptions(options?.timeoutMs), () => Effect.runPromise(fn()));
  };

  test.skipIf =
    (condition: boolean) =>
    (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => {
      bunTest.skipIf(condition)(name, timeoutOptions(options?.timeoutMs), () =>
        Effect.runPromise(fn()),
      );
    };

  // Bun doesn't have TestClock, so all tests are "live" by default
  test.live = (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => {
    bunTest(name, timeoutOptions(options?.timeoutMs), () => Effect.runPromise(fn()));
  };

  const describeFn = ((name: string, fn: () => void) => bunDescribe(name, fn)) as DescribeFn;

  describeFn.skip = (name: string, fn: () => void) => bunDescribe.skip(name, fn);
  describeFn.only = (name: string, fn: () => void) => bunDescribe.only(name, fn);

  const beforeAllFn: BeforeAllFn = <A>(
    fn: () => Effect.Effect<A, any, never>,
  ): Effect.Effect<A, any, never> => {
    let result: A;
    bunBeforeAll(async () => {
      result = await Effect.runPromise(fn());
    });
    return Effect.sync(() => result);
  };

  const afterAllFn = ((fn: () => Effect.Effect<void, any, never>) => {
    bunAfterAll(() => Effect.runPromise(fn()));
  }) as AfterAllFn;

  afterAllFn.skipIf = (condition: boolean) => (fn: () => Effect.Effect<void, any, never>) => {
    if (condition) return;
    bunAfterAll(() => Effect.runPromise(fn()));
  };

  const beforeEachFn: BeforeEachFn = (fn: () => Effect.Effect<void, any, never>) => {
    bunBeforeEach(() => Effect.runPromise(fn()));
  };

  const afterEachFn: AfterEachFn = (fn: () => Effect.Effect<void, any, never>) => {
    bunAfterEach(() => Effect.runPromise(fn()));
  };

  const layerFn = <R, E>(_layer: Layer<R, E, never>) => {
    return (_fn: (it: LayerTestFn) => void) => {
      // Layer-based tests not supported in Bun runtime
      // These tests (playwright, stagehand) only run in vitest (node/workerd)
      bunTest.skip("layer tests not supported in Bun", () => {});
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
