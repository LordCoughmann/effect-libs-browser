/**
 * Effect-aware test utilities - runtime-agnostic core.
 *
 * This module provides:
 * - TestApi interface for test runners
 * - Effect-aware assertions
 * - Helper types for test definitions
 *
 * Runtime-specific implementations are in:
 * - tests/utils/effect-test/Vitest.ts
 */

import type { Layer } from "effect/Layer";

import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";

// ─────────────────────────────────────────────────────────────────────────────
// Test API Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration passed to shared test definitions.
 */
export interface TestConfig {
  /** WebSocket URL for Chrome DevTools Protocol */
  wsUrl: string;
  /** HTTP base URL for test server */
  httpUrl: string;
}

/**
 * Test function inside a layer context.
 *
 * Used by `layer` callback - provides Effect-aware test registration
 * with the layer's context automatically provided.
 */
export interface LayerTestFn {
  /** Register an effect test */
  effect: (name: string, fn: () => Effect.Effect<void, any, any>, options?: TestOptions) => void;
  /** Skip this test */
  skip: (name: string, fn: () => Effect.Effect<void, any, any>, options?: TestOptions) => void;
  /** Only run this test */
  only: (name: string, fn: () => Effect.Effect<void, any, any>, options?: TestOptions) => void;
}

/**
 * Test API provided by runtime-specific implementations.
 *
 * Usage:
 * ```typescript
 * const api = make();
 * api.test("my test", () => Effect.gen(...));
 * api.describe("group", () => { ... });
 * api.beforeAll(() => Effect.gen(...));
 * ```
 */
export interface TestApi {
  /** Register a test */
  readonly test: TestFn;
  /** Register a describe block */
  readonly describe: DescribeFn;
  /** Run effect before all tests in this file */
  readonly beforeAll: BeforeAllFn;
  /** Run effect after all tests in this file */
  readonly afterAll: AfterAllFn;
  /** Run effect before each test */
  readonly beforeEach: BeforeEachFn;
  /** Run effect after each test */
  readonly afterEach: AfterEachFn;
  /** Run tests with a Layer provided (for @effect/vitest style tests) */
  readonly layer: <R, E>(layer: Layer<R, E, never>) => (fn: (it: LayerTestFn) => void) => void;
}

/**
 * Describe function with skip, only, etc. variants.
 */
export interface DescribeFn {
  (name: string, fn: () => void): void;
  /** Skip this describe block */
  skip: (name: string, fn: () => void) => void;
  /** Only run this describe block */
  only: (name: string, fn: () => void) => void;
}

/**
 * Options for test registration.
 */
export interface TestOptions {
  /** Test timeout in milliseconds. The test runner kills the test if it exceeds this. */
  readonly timeoutMs?: number;
  /**
   * Tags for this test (e.g. `"cleanup"`).
   *
   * Tags are surfaced through vitest's `JsonAssertionResult.tags` and can be
   * used to filter tests at command time (`vitest --tags cleanup`). They are
   * also useful as documentation markers — a `cleanup`-tagged test asserts
   * that a scoped API actually closes its resources, but the assertion
   * fails the run via vitest's normal failure handling rather than via any
   * separate gate.
   *
   * Multiple tags can be passed as an array.
   */
  readonly tag?: string | ReadonlyArray<string>;
}

/**
 * Test function with skip, only, etc. variants.
 *
 * Note: Tests must provide their own context via Effect.provide within the test body.
 * The effect returned by the test function should have no unmet context requirements.
 */
export interface TestFn {
  (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions): void;
  /** Skip this test */
  skip: (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => void;
  /** Only run this test */
  only: (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => void;
  /** Skip if condition is true */
  skipIf: (
    condition: boolean,
  ) => (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => void;
  /** Run with real timing (no TestClock) - for integration tests */
  live: (name: string, fn: () => Effect.Effect<void, any, never>, options?: TestOptions) => void;
}

/**
 * beforeAll hook that runs an Effect.
 *
 * Note: The effect should have no unmet context requirements.
 */
export interface BeforeAllFn {
  (fn: () => Effect.Effect<void, any, never>): void;
}

/**
 * afterAll hook.
 */
export interface AfterAllFn {
  (fn: () => Effect.Effect<void, any, never>): void;
  /** Skip if condition is true */
  skipIf: (condition: boolean) => (fn: () => Effect.Effect<void, any, never>) => void;
}

/**
 * beforeEach hook.
 */
export interface BeforeEachFn {
  (fn: () => Effect.Effect<void, any, never>): void;
}

/**
 * afterEach hook.
 */
export interface AfterEachFn {
  (fn: () => Effect.Effect<void, any, never>): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assertion error with helpful message.
 */
export class AssertionError extends Error {
  readonly _tag = "AssertionError";
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

/**
 * Assert that two values are equal (using ===).
 */
export const assertEqual = <T>(actual: T, expected: T): Effect.Effect<void, AssertionError> =>
  actual === expected
    ? Effect.void
    : Effect.fail(
        new AssertionError(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
      );

/**
 * Assert that a condition is true.
 */
export const assertTrue = (condition: boolean): Effect.Effect<void, AssertionError> =>
  condition ? Effect.void : Effect.fail(new AssertionError(`Expected true, got false`));

/**
 * Assert that a condition is false.
 */
export const assertFalse = (condition: boolean): Effect.Effect<void, AssertionError> =>
  !condition ? Effect.void : Effect.fail(new AssertionError(`Expected false, got true`));

/**
 * Assert that a value is not null or undefined.
 */
export const assertExists = <T>(
  value: T | null | undefined,
): Effect.Effect<NonNullable<T>, AssertionError> =>
  value !== null && value !== undefined
    ? Effect.succeed(value as NonNullable<T>)
    : Effect.fail(new AssertionError(`Expected value to exist, got ${value}`));

/**
 * Assert that a value is a string.
 */
export const assertIsString = (value: unknown): Effect.Effect<string, AssertionError> =>
  Predicate.isString(value)
    ? Effect.succeed(value)
    : Effect.fail(new AssertionError(`Expected string, got ${typeof value}`));

/**
 * Assert that a value is a number.
 */
export const assertIsNumber = (value: unknown): Effect.Effect<number, AssertionError> =>
  Predicate.isNumber(value)
    ? Effect.succeed(value)
    : Effect.fail(new AssertionError(`Expected number, got ${typeof value}`));

/**
 * Assert that a value is an array.
 */
export const assertIsArray = <T>(
  value: unknown,
): Effect.Effect<ReadonlyArray<T>, AssertionError> =>
  Array.isArray(value)
    ? Effect.succeed(value)
    : Effect.fail(new AssertionError(`Expected array, got ${typeof value}`));

/**
 * Assert that a value matches a predicate.
 */
export const assertThat = <T>(
  value: T,
  predicate: (value: T) => boolean,
  message?: string,
): Effect.Effect<T, AssertionError> =>
  predicate(value)
    ? Effect.succeed(value)
    : Effect.fail(
        new AssertionError(message ?? `Assertion failed for value ${JSON.stringify(value)}`),
      );

/**
 * Assert that two values are deeply equal (using JSON.stringify).
 */
export const assertDeepEqual = <T>(actual: T, expected: T): Effect.Effect<void, AssertionError> => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  return actualJson === expectedJson
    ? Effect.void
    : Effect.fail(new AssertionError(`Expected ${expectedJson}, got ${actualJson}`));
};

/**
 * Assert that a string contains another string.
 */
export const assertContains = (
  haystack: string,
  needle: string,
): Effect.Effect<void, AssertionError> =>
  haystack.includes(needle)
    ? Effect.void
    : Effect.fail(new AssertionError(`Expected "${haystack}" to contain "${needle}"`));

/**
 * Assert that a value has a specific length.
 */
export const assertLength = <T extends { length: number }>(
  value: T,
  expected: number,
): Effect.Effect<T, AssertionError> =>
  value.length === expected
    ? Effect.succeed(value)
    : Effect.fail(new AssertionError(`Expected length ${expected}, got ${value.length}`));

/**
 * Assert that an effect fails with a specific error type.
 */
export const assertFails = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<E, AssertionError> =>
  Effect.match(effect, {
    onSuccess: () => new AssertionError("Expected effect to fail, but it succeeded"),
    onFailure: (error) => error,
  }).pipe(
    Effect.flatMap((result) =>
      result instanceof AssertionError ? Effect.fail(result) : Effect.succeed(result),
    ),
  );

// ─────────────────────────────────────────────────────────────────────────────
// Test Definition Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type for test definition functions.
 * Shared tests receive TestApi and TestConfig.
 */
export type TestDefinitionFn = (api: TestApi, config: TestConfig) => void;

/**
 * Helper to define shared tests that can be used across runtimes.
 *
 * @example
 * ```typescript
 * // shared/cdp.ts
 * import { defineTests, TestApi, TestConfig, assertEqual } from "../utils/effect-test/EffectTest";
 *
 * export const defineCdpTests = defineTests((api, config) => {
 *   const { test, describe, beforeAll } = api;
 *   const { wsUrl, httpUrl } = config;
 *
 *   describe("Cdp", () => {
 *     test("navigates to URL", () => Effect.gen(function* () {
 *       // ... test code
 *       yield* assertEqual(title, "Expected");
 *     }));
 *   });
 * });
 *
 * // node/cdp.test.ts
 * import { make } from "./Vitest";
 * import { defineCdpTests } from "../shared/cdp";
 *
 * // Env vars are set by the orchestrator
 * defineCdpTests(make(), { wsUrl: process.env.CHROME_WS_URL!, httpUrl: process.env.HTTP_BASE_URL! });
 * ```
 */
export const defineTests =
  <T extends Record<string, unknown> = Record<string, never>>(
    fn: (api: TestApi, config: TestConfig & T) => void,
  ) =>
  (api: TestApi, config: TestConfig & T): void =>
    fn(api, config);
