/**
 * Per-category test command builders.
 *
 * Each builder returns the argv for the underlying test runner (vitest / deno /
 * bun), given a runtime and the parsed {@link TestFlags}. The CLI dispatcher
 * (`TestRunner.ts` CLI section) composes these with infrastructure setup and execs them.
 *
 * Commands are derived from `TestRunnerRuntimes.ts#RUNTIME_SPECS` so per-runtime switch
 * statements are not repeated across categories.
 */

import type { TestFlags } from "./TestRunnerArgs.ts";

import { Option } from "effect";

import { vitestArgs, vitestArgsWithJsonReport } from "./TestRunnerArgs.ts";
import { getRuntimeSpec, type Runtime } from "./TestRunnerRuntimes.ts";

// =============================================================================
// Runtime subsets
// =============================================================================

export const INTEGRATION_RUNTIMES = ["node", "workerd", "workerd-nocompat", "deno", "bun"] as const;
export type IntegrationRuntime = (typeof INTEGRATION_RUNTIMES)[number];

export const SMOKE_RUNTIMES = ["node", "workerd", "workerd-nocompat", "bun", "deno"] as const;
export type SmokeRuntime = (typeof SMOKE_RUNTIMES)[number];

export const PROVIDER_RUNTIMES = ["node", "workerd"] as const;
export type ProviderRuntime = (typeof PROVIDER_RUNTIMES)[number];

export const STAGEHAND_RUNTIMES = ["node", "workerd"] as const;
export type StagehandRuntime = (typeof STAGEHAND_RUNTIMES)[number];

// =============================================================================
// Provider filter
// =============================================================================

export const PROVIDERS = ["steel", "browserbase", "cf-browser-run"] as const;
export type Provider = (typeof PROVIDERS)[number];

/**
 * Translate a `--provider` selection into the vitest test-name filter for the
 * node providers config. `all` (absent) runs every provider.
 */
const providerFilter = (provider: Option.Option<Provider>): ReadonlyArray<string> =>
  Option.isSome(provider) ? [provider.value] : [];

// =============================================================================
// Category paths
// =============================================================================

/**
 * Vitest config filename: `vitest.<category>.<runtime>.config.ts`.
 * `workerd-nocompat` becomes `workerd.nocompat` in the filename.
 */
const vitestConfig = (category: "smoke" | "integration", runtime: Runtime): string =>
  `vitest.${category}.${runtime.replace("-", ".")}.config.ts`;

/**
 * Non-vitest test paths per category. Bun and deno both smoke-test a single
 * file and integration-test a directory.
 */
const NON_VITEST_PATHS: Record<
  "smoke" | "integration",
  Readonly<Record<"bun" | "deno", string>>
> = {
  smoke: {
    bun: "tests/integration/runtime/bun/smoke.test.ts",
    deno: "tests/integration/runtime/deno/smoke.test.ts",
  },
  integration: {
    bun: "tests/integration/runtime/bun/",
    deno: "tests/integration/runtime/deno/",
  },
};

/** Deno-specific prefix (allow-all + sloppy imports). */
const DENO_PREFIX = ["-A", "--sloppy-imports"] as const;

// =============================================================================
// Unit (node-only)
// =============================================================================

/** Args for `pnpm vitest run` against the unit config. */
export const unitArgs = (flags: TestFlags): ReadonlyArray<string> => [
  "vitest",
  "run",
  "--config",
  "vitest.unit.config.ts",
  ...vitestArgs(flags),
];

// =============================================================================
// Smoke
// =============================================================================

/** Command + args for a single smoke runtime. Returns `[cmd, [...args]]`. */
export const smokeCommand = (
  runtime: SmokeRuntime,
  flags: TestFlags,
): readonly [string, ReadonlyArray<string>] => {
  const spec = getRuntimeSpec(runtime);
  if (spec.usesVitest) {
    return [
      "pnpm",
      ["vitest", "run", "--config", vitestConfig("smoke", runtime), ...spec.argsFn(flags)],
    ];
  }
  // spec.usesVitest is false → runtime is bun or deno
  return nonVitestCommand(runtime as "bun" | "deno", NON_VITEST_PATHS.smoke, flags);
};

/**
 * Build a non-vitest command (bun or deno test). `runtime` is narrowed to the
 * non-vitest subset by the caller (after a `usesVitest` check).
 */
const nonVitestCommand = (
  runtime: "bun" | "deno",
  paths: Readonly<Record<"bun" | "deno", string>>,
  flags: TestFlags,
): readonly [string, ReadonlyArray<string>] => {
  const spec = getRuntimeSpec(runtime);
  if (runtime === "bun") return ["bun", ["test", paths.bun, ...spec.argsFn(flags)]];
  return ["deno", ["test", ...DENO_PREFIX, paths.deno, ...spec.argsFn(flags)]];
};

// =============================================================================
// Integration
// =============================================================================

/**
 * Command + args for a single integration runtime.
 *
 * Vitest-based runtimes (node, workerd, workerd-nocompat) write a JSON report to
 * `/tmp/vitest-<runtime>-integration.json`. Non-vitest runtimes (bun, deno) do
 * not write a JSON report — they are smoke-only in CI and don't need post-processing.
 *
 * Stagehand for workerd is a separate `stagehand` category; it does NOT run as
 * a side effect of integration. See `tests/integration/runtime/workerd/stagehand/driver.ts`.
 */
export const integrationCommand = (
  runtime: IntegrationRuntime,
  flags: TestFlags,
): readonly [string, ReadonlyArray<string>] => {
  const spec = getRuntimeSpec(runtime);
  if (spec.usesVitest) {
    return [
      "pnpm",
      [
        "vitest",
        "run",
        "--config",
        vitestConfig("integration", runtime),
        ...vitestArgsWithJsonReport(flags, `/tmp/vitest-${runtime}-integration.json`),
      ],
    ];
  }
  // Non-vitest: bun / deno
  return nonVitestCommand(runtime as "bun" | "deno", NON_VITEST_PATHS.integration, flags);
};

// =============================================================================
// Providers
// =============================================================================

/**
 * Vitest config for providers per runtime.
 * - node: dedicated `vitest.providers.config.ts`
 * - workerd: reuses `vitest.integration.workerd.config.ts` with a path filter
 */
const PROVIDER_VITEST_CONFIG: Record<ProviderRuntime, string> = {
  node: "vitest.providers.config.ts",
  workerd: "vitest.integration.workerd.config.ts",
};

const PROVIDER_WORKERD_PATH = "tests/integration/runtime/workerd/providers";

/** Command + args for a single provider runtime. */
export const providersCommand = (
  runtime: ProviderRuntime,
  provider: Option.Option<Provider>,
  flags: TestFlags,
): readonly [string, ReadonlyArray<string>] => {
  const args = ["vitest", "run", "--config", PROVIDER_VITEST_CONFIG[runtime]];
  if (runtime === "workerd") args.push(PROVIDER_WORKERD_PATH);
  args.push(...providerFilter(provider), ...getRuntimeSpec(runtime).argsFn(flags));
  return ["pnpm", args];
};

// =============================================================================
// Stagehand
// =============================================================================

/** Command + args for the node Stagehand suite. (workerd uses the standalone driver.) */
export const stagehandNodeCommand = (
  flags: TestFlags,
): readonly [string, ReadonlyArray<string>] => [
  "pnpm",
  [
    "vitest",
    "run",
    "--config",
    "vitest.integration.node.config.ts",
    "tests/integration/runtime/node/stagehand",
    ...vitestArgs(flags),
  ],
];

// Re-export for convenience (used by callers that want a single import surface)
export {
  getRuntimeSpec,
  runtimeHasVitest,
  RUNTIME_SPECS,
  RUNTIME_NAMES,
  type Runtime,
} from "./TestRunnerRuntimes.ts";
