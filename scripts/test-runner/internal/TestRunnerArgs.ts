/**
 * Shared types and runtime-specific flag → argv conversion.
 *
 * Lives in its own module (no internal/ deps) so it can be imported by
 * `TestRunnerCategories.ts` and `TestRunnerRuntimes.ts` without creating a
 * cycle through `TestRunner.ts`. `TestRunner.ts` (which also acts as the
 * CLI entry point) imports from `TestRunnerCategories.ts`, so the chain
 * TestRunner.ts → Categories.ts → Runtimes.ts → TestRunner.ts must NOT
 * happen for value imports.
 *
 * Exports:
 * - {@link TestFlags}: parsed flag values (shared across all runtime arg fns)
 * - {@link vitestArgs}: vitest flag → argv (node, workerd)
 * - {@link vitestArgsWithJsonReport}: vitest + JSON reporter output (integration)
 * - {@link denoTestArgs}: deno test flag → argv
 * - {@link bunTestArgs}: bun test flag → argv
 */

import { Option } from "effect";

// =============================================================================
// Types
// =============================================================================

/**
 * The parsed flag values from a test-runner command.
 *
 * `testPattern` is `Option<string>` (absent when `-t`/`--test` is not given).
 * `extraArgs` captures everything after `--`.
 */
export interface TestFlags {
  readonly verbose: boolean;
  readonly failFast: boolean;
  readonly testPattern: Option.Option<string>;
  readonly extraArgs: ReadonlyArray<string>;
}

// =============================================================================
// Flag → Runtime Arg Conversion
// =============================================================================

/** Convert parsed flags to vitest args (node, workerd). */
export const vitestArgs = (flags: TestFlags): ReadonlyArray<string> => [
  ...(flags.verbose ? ["--reporter=verbose"] : []),
  ...(flags.failFast ? ["--bail=1"] : []),
  ...(Option.isSome(flags.testPattern) ? ["-t", flags.testPattern.value] : []),
  ...flags.extraArgs,
];

/**
 * Like {@link vitestArgs}, but also instructs vitest to write a JSON report to
 * `outputPath` so the runner script can post-process results (e.g. check for
 * failed tests with a specific tag).
 *
 * Vitest supports multiple reporters via repeated `--reporter=<name>` flags
 * and per-reporter output via `--outputFile.<reporterName>=<path>` (cac dot
 * notation). We add a silent `json` reporter alongside the user-facing
 * reporter so the JSON file is always written regardless of `--verbose` /
 * `--reporter=verbose` etc.
 */
export const vitestArgsWithJsonReport = (
  flags: TestFlags,
  outputPath: string,
): ReadonlyArray<string> => [
  ...(flags.verbose ? ["--reporter=verbose"] : []),
  "--reporter=json",
  `--outputFile.json=${outputPath}`,
  ...(flags.failFast ? ["--bail=1"] : []),
  ...(Option.isSome(flags.testPattern) ? ["-t", flags.testPattern.value] : []),
  ...flags.extraArgs,
];

/** Convert parsed flags to deno test args. */
export const denoTestArgs = (flags: TestFlags): ReadonlyArray<string> => [
  ...(flags.verbose ? ["--verbose"] : []),
  ...(flags.failFast ? ["--fail-fast"] : []),
  ...(Option.isSome(flags.testPattern) ? ["--filter", flags.testPattern.value] : []),
  ...flags.extraArgs,
];

/** Convert parsed flags to bun test args. */
export const bunTestArgs = (flags: TestFlags): ReadonlyArray<string> => [
  "--timeout=60000",
  ...(flags.verbose ? ["--verbose"] : []),
  ...(flags.failFast ? ["--bail"] : []),
  ...(Option.isSome(flags.testPattern) ? ["-t", flags.testPattern.value] : []),
  ...flags.extraArgs,
];
