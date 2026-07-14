/**
 * Runtime × config table — single source of truth for runtime metadata.
 *
 * Categories (`TestRunnerCategories.ts`) derive commands from `RUNTIME_SPECS` so we don't
 * repeat the same switch arms across smoke/integration/providers.
 *
 * Per-category configuration that varies (vitest config filenames, non-vitest
 * test paths) lives in `TestRunnerCategories.ts` because it's category-specific,
 * not runtime-specific.
 */

import { bunTestArgs, denoTestArgs, vitestArgs, type TestFlags } from "./TestRunnerArgs.ts";

// =============================================================================
// Runtimes
// =============================================================================

export const RUNTIME_NAMES = ["node", "workerd", "workerd-nocompat", "bun", "deno"] as const;
export type Runtime = (typeof RUNTIME_NAMES)[number];

export interface RuntimeSpec {
  readonly name: Runtime;
  /** True for vitest-based runtimes (node, workerd, workerd-nocompat). */
  readonly usesVitest: boolean;
  /** Flag → argv for this runtime's test framework. */
  readonly argsFn: (flags: TestFlags) => ReadonlyArray<string>;
}

export const RUNTIME_SPECS: ReadonlyArray<RuntimeSpec> = [
  { name: "node", usesVitest: true, argsFn: vitestArgs },
  { name: "workerd", usesVitest: true, argsFn: vitestArgs },
  { name: "workerd-nocompat", usesVitest: true, argsFn: vitestArgs },
  { name: "bun", usesVitest: false, argsFn: bunTestArgs },
  { name: "deno", usesVitest: false, argsFn: denoTestArgs },
];

export const getRuntimeSpec = (name: Runtime): RuntimeSpec => {
  const spec = RUNTIME_SPECS.find((s) => s.name === name);
  if (!spec) throw new Error(`unknown runtime: ${name}`);
  return spec;
};

export const runtimeHasVitest = (name: Runtime): boolean => getRuntimeSpec(name).usesVitest;
