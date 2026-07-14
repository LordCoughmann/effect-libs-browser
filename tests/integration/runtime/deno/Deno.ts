/**
 * Deno adapter for EffectTest.
 *
 * Provides make() factory that returns TestApi for Deno's BDD test framework
 * (`@std/testing/bdd`). Uses describe/it for grouped test output.
 *
 * @example
 * ```typescript
 * import { make } from "./Deno.js";
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
  afterAll as bddAfterAll,
  afterEach as bddAfterEach,
  beforeAll as bddBeforeAll,
  beforeEach as bddBeforeEach,
  describe as bddDescribe,
  it as bddIt,
} from "@std/testing/bdd";
import * as Effect from "effect/Effect";

/**
 * Delay to allow async cleanup (WebSocket close, etc.) to complete.
 * Deno's test sanitizer checks for leaks immediately after test completion,
 * but async operations like WebSocket close handshakes may still be in progress.
 */
const CLEANUP_DELAY_MS = 50;

/**
 * Default per-test timeout in milliseconds.
 *
 * Deno 2.8+ added a native `timeout` option to `Deno.test()`, but
 * `@std/testing/bdd` (v1.0.x) does not yet pass it through to the
 * underlying `Deno.test()` / `t.step()` calls. Until it does, we
 * enforce timeouts at the Effect level via `Effect.timeout()`.
 *
 * @see https://github.com/denoland/deno/pull/33815 — native timeout
 * @see https://github.com/denoland/deno_std/issues — bdd timeout passthrough
 */
const DEFAULT_TIMEOUT_MS = 10_000;

const run = (fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => async () => {
  const effect = fn().pipe(Effect.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS), Effect.orDie);
  await Effect.runPromise(effect);
  // Wait for async cleanup to complete before Deno checks for leaks
  await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY_MS));
};

/**
 * Create TestApi for Deno.
 */
export const make = (): TestApi => {
  const test = ((
    name: string,
    fn: () => Effect.Effect<void, any, never>,
    options?: TestOptions,
  ) => {
    bddIt(name, run(fn, options));
  }) as TestFn;

  test.skip = (name: string, fn: () => Effect.Effect<void, any, never>, _options?: TestOptions) => {
    bddIt.skip(name, run(fn));
  };

  test.only = (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => {
    bddIt.only(name, run(fn, options));
  };

  test.skipIf =
    (condition: boolean) =>
    (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => {
      if (condition) {
        bddIt.skip(name, run(fn));
      } else {
        bddIt(name, run(fn, options));
      }
    };

  // Deno doesn't have TestClock, so all tests are "live" by default
  test.live = (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => {
    bddIt(name, run(fn, options));
  };

  const describeFn = ((name: string, fn: () => void) => {
    bddDescribe(name, fn);
  }) as DescribeFn;

  describeFn.skip = (name: string, fn: () => void) => {
    bddDescribe.skip(name, fn);
  };

  describeFn.only = (name: string, fn: () => void) => {
    bddDescribe.only(name, fn);
  };

  const beforeAllFn: BeforeAllFn = <A>(
    fn: () => Effect.Effect<A, any, never>,
  ): Effect.Effect<A, any, never> => {
    let result: A;
    bddBeforeAll(async () => {
      result = await Effect.runPromise(fn());
    });
    return Effect.sync(() => result);
  };

  const afterAllFn = ((fn: () => Effect.Effect<void, any, never>) => {
    bddAfterAll(run(fn));
  }) as AfterAllFn;

  afterAllFn.skipIf = (condition: boolean) => (fn: () => Effect.Effect<void, any, never>) => {
    if (condition) return;
    bddAfterAll(run(fn));
  };

  const beforeEachFn: BeforeEachFn = (fn: () => Effect.Effect<void, any, never>) => {
    bddBeforeEach(run(fn));
  };

  const afterEachFn: AfterEachFn = (fn: () => Effect.Effect<void, any, never>) => {
    bddAfterEach(run(fn));
  };

  const layerFn = <R, E>(_layer: Layer<R, E, never>) => {
    return (_fn: (it: LayerTestFn) => void) => {
      // Layer-based tests not supported in Deno runtime
      // These tests (playwright, stagehand) only run in vitest (node/workerd)
      bddIt.skip("layer tests not supported in Deno", () => {});
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
