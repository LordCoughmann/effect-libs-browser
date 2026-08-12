/**
 * Unified test runner — one file, two roles.
 *
 * **Library exports** (consumed by `TestRunnerCategories.ts`, `TestRunnerInfra.ts`,
 * `TestRunnerRuntimes.ts` and any external caller):
 * - Type-level: {@link CommandBuilder}, {@link BeforeHook}, {@link SubcommandSpec},
 *   {@link TestFlags}, {@link RuntimeResult}
 * - Helpers: {@link runCmd}, {@link asOk}, {@link vitestArgs},
 *   {@link vitestArgsWithJsonReport}, {@link denoTestArgs}, {@link bunTestArgs},
 *   {@link execArgs}, {@link isFailureExit}
 * - Errors: {@link CommandFailure}, {@link SmokeTestFailure}
 * - Engine: {@link runSubcommand}
 *
 * **CLI entry point**: when this file is invoked directly
 * (`pnpm tsx scripts/test-runner/TestRunner.ts <subcommand> [flags]`),
 * runs the declarative subcommand dispatch (unit / smoke / integration /
 * providers / stagehand). Bare invocation prints `--help`.
 *
 * Flag → runtime argv conversion (vitest, deno test, bun test) is also here
 * because each runtime's args shape differs.
 */

import "@dotenvx/dotenvx/config";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Equal, Exit, Option, Predicate, Schema, type Scope } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { Block, render, type Section } from "../shared/CliFormat.js";
import { type TestFlags } from "./internal/TestRunnerArgs.ts";
import {
  integrationCommand,
  INTEGRATION_RUNTIMES,
  type IntegrationRuntime,
  providersCommand,
  PROVIDER_RUNTIMES,
  type Provider,
  PROVIDERS,
  type ProviderRuntime,
  smokeCommand,
  SMOKE_RUNTIMES,
  type SmokeRuntime,
  stagehandNodeCommand,
  STAGEHAND_RUNTIMES,
  type StagehandRuntime,
  unitArgs,
} from "./internal/TestRunnerCategories.ts";
import { ensureInfra, InfraLayer } from "./internal/TestRunnerInfra.ts";
import { type Runtime } from "./internal/TestRunnerRuntimes.ts";

/** Build the test command for a given runtime + flags. Returns `[cmd, [...args]]`. */
export type CommandBuilder<R extends string> = (
  runtime: R,
  flags: TestFlags,
) => readonly [string, ReadonlyArray<string>];

/** Pre-command hook (e.g. smoke gate, workerd Stagehand driver). */
export type BeforeHook<R extends string, O extends object> = (
  runtime: R,
  flags: TestFlags,
  opts: O,
) => Effect.Effect<void, never, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope>;

/** Per-runtime pass/fail result row. */
export interface RuntimeResult<R extends string> {
  readonly runtime: R;
  readonly ok: boolean;
}

/**
 * A declarative description of one subcommand.
 *
 * The dispatch engine (`runSubcommand`) consumes this and handles the common
 * per-runtime pass/fail bookkeeping (logging, summary, fail-fast, forceExit).
 * Subcommand-specific customisation lives in the optional `before` hook.
 *
 * @typeParam R  Runtime subset this subcommand supports.
 * @typeParam O  Per-subcommand opts shape (for the `before` hook's extra context).
 */
export interface SubcommandSpec<R extends string = Runtime, O extends object = object> {
  readonly name: string;
  readonly description: string;
  readonly runtimes: ReadonlyArray<R>;
  /** Build the command for a given runtime + flags. */
  readonly command: CommandBuilder<R>;
  /** Optional pre-command hook (e.g. smoke gate, workerd Stagehand driver). */
  readonly before?: BeforeHook<R, O>;
  /** Whether this subcommand requires Chrome + HTTP infra. Default: false. */
  readonly requiresInfra?: boolean;
  /**
   * Force `process.exit` at end. Used by `integration` to work around
   * vitest-pool-workers / miniflare cleanup hangs (HTTP server finalizer
   * blocks on `server.close()` waiting for connections).
   * Default: false.
   */
  readonly forceExit?: boolean;
}

/** Run a `[cmd, args]` tuple, failing with `SmokeTestFailure` on non-zero exit. */
export const runCmd = (cmd: readonly [string, ReadonlyArray<string>]) =>
  execArgs(cmd[0], cmd[1]).pipe(Effect.mapError((cause) => new SmokeTestFailure({ cause })));

/** Run an effect, returning `true` on success / `false` on failure (never throws). */
export const asOk = <E, R>(
  effect: Effect.Effect<unknown, E, R>,
): Effect.Effect<boolean, never, R> =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(effect);
    return Exit.isSuccess(exit);
  });

/** Print a runtime × pass/fail summary table. */
const formatSummary = <R extends string>(results: ReadonlyArray<RuntimeResult<R>>): Section => {
  const width = Math.max(...results.map((r) => r.runtime.length), 0);
  const passed = results.filter((r) => r.ok).length;
  return [
    ...results.map(({ runtime, ok }) =>
      Block.Line({
        text: `${ok ? "✓" : "✗"} ${runtime.padEnd(width)} ${ok ? "pass" : "fail"}`,
      }),
    ),
    Block.Line({ text: "" }),
    Block.Line({ text: `${passed}/${results.length} passed` }),
  ];
};

/** Print a runtime × pass/fail summary table. */
const printSummary = <R extends string>(
  label: string,
  results: ReadonlyArray<RuntimeResult<R>>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Console.log("");
    for (const line of render(formatSummary(results)).split("\n")) {
      yield* Console.log(line === "" ? "" : `[${label}] ${line}`);
    }
    yield* Console.log("");
  });

/**
 * Engine that runs a {@link SubcommandSpec}.
 *
 * - Iterates `selectedRuntimes` in order
 * - Calls `ensureInfra` (via `Effect.yieldNow`-style plumbing) when
 *   `spec.requiresInfra` is true
 * - Runs `spec.before(runtime, flags, opts)` (if defined), then `spec.command(runtime, flags)`
 * - Prints per-runtime PASS/FAIL
 * - Honours `flags.failFast` (stop on first failure)
 * - Calls `process.exit` if `spec.forceExit` is true
 *
 * The Effect type exposes the services it needs. Callers wrap with
 * `.pipe(Effect.provide(InfraLayer), Effect.scoped)` to satisfy them:
 * - `InfraLayer` provides Chrome + HTTP server services + the NodeServices
 *   bundle (ChildProcessSpawner, FileSystem, Path, Stdio, etc.)
 * - `Effect.scoped` provides `Scope`
 */
export const runSubcommand = <R extends string, O extends object>(
  spec: SubcommandSpec<R, O>,
  selectedRuntimes: ReadonlyArray<R>,
  flags: TestFlags,
  opts: O,
) =>
  Effect.gen(function* () {
    if (spec.requiresInfra) {
      yield* ensureInfra;
    }

    yield* Console.log(`[${spec.name}] Running: ${selectedRuntimes.join(", ")}\n`);

    const results: RuntimeResult<R>[] = [];
    for (const runtime of selectedRuntimes) {
      yield* Console.log(`[${spec.name}] ${runtime}...`);
      const ok = yield* asOk(
        Effect.gen(function* () {
          if (spec.before) {
            yield* spec.before(runtime, flags, opts);
          }
          yield* runCmd(spec.command(runtime, flags));
        }),
      );
      yield* Console.log(`[${spec.name}] ${runtime} ${ok ? "✓ PASS" : "✗ FAIL"}`);
      results.push({ runtime, ok });
      if (flags.failFast && !ok) {
        yield* Console.log(`\n[${spec.name}] Stopping due to failure (--fail-fast)`);
        break;
      }
    }

    yield* printSummary(spec.name, results);

    if (spec.forceExit) {
      const failed = results.some((r) => !r.ok);
      return yield* Effect.sync(() => process.exit(failed ? 1 : 0));
    }
  });

// =============================================================================
// Types
// =============================================================================

// `TestFlags` lives in `./internal/TestRunnerArgs.ts` (the runtime-arg
// conversion module that consumes it). Re-exported here for convenience so
// callers can import it from `TestRunner.ts` alongside the dispatch engine
// (e.g. `import { TestFlags, runSubcommand } from "../TestRunner.ts"`).
export type { TestFlags };

// =============================================================================
// Flag → Runtime Arg Conversion (re-exports)
// =============================================================================

// Runtime-specific flag → argv conversion lives in `./internal/TestRunnerArgs.ts`.
// Re-exported here so callers can grab them alongside the dispatch engine.
export {
  vitestArgs,
  vitestArgsWithJsonReport,
  denoTestArgs,
  bunTestArgs,
} from "./internal/TestRunnerArgs.ts";

// =============================================================================
// Exit Code Helpers
// =============================================================================

/** Branded exit code constants for clarity. */
const ExitSuccess = ChildProcessSpawner.ExitCode(0);
const ExitFailure = ChildProcessSpawner.ExitCode(1);

/** Predicate that returns `true` if exit code indicates failure (non-zero). */
export const isFailureExit = Predicate.not(Equal.equals(ExitSuccess));

// =============================================================================
// Errors
// =============================================================================

/** Error for failed shell commands. */
export class CommandFailure extends Schema.TaggedError<CommandFailure>()("CommandFailure", {
  exitCode: Schema.Finite,
}) {
  override get message(): string {
    return `Command exited with code ${this.exitCode}`;
  }
}

/** Error for smoke test failures (wraps underlying CommandFailure). */
export class SmokeTestFailure extends Schema.TaggedError<SmokeTestFailure>()("SmokeTestFailure", {
  cause: CommandFailure,
}) {
  override get message(): string {
    return `Smoke test failed: ${this.cause.message}`;
  }
}

// =============================================================================
// Process Execution
// =============================================================================

/**
 * Execute a command with explicit args (array form).
 * Use this when you need to pass dynamic arguments.
 * Fails with `CommandFailure` on non-zero exit or spawn error.
 *
 * @example
 * ```ts
 * execArgs("pnpm", ["vitest", "run", "--reporter", "verbose"])
 * ```
 */
export const execArgs = (
  command: string,
  args: ReadonlyArray<string> = [],
): Effect.Effect<void, CommandFailure, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make(command, args, {
      stdout: "inherit",
      stderr: "inherit",
    }).pipe(Effect.mapError(() => new CommandFailure({ exitCode: ExitFailure })));

    const exitCode = yield* handle.exitCode.pipe(Effect.orElseSucceed(() => ExitFailure));

    if (isFailureExit(exitCode)) {
      return yield* new CommandFailure({ exitCode });
    }
  }).pipe(Effect.scoped);

// =============================================================================
// CLI entry point
// =============================================================================
// The remainder of this file is the CLI wiring (declarative subcommand dispatch).
// It is gated by `import.meta.url === file://${process.argv[1]}` so importing this
// file for the library exports above does NOT trigger CLI execution.

// -----------------------------------------------------------------------------
// Shared flag definitions
// -----------------------------------------------------------------------------

/** Coerced shape of the shared flags (mirrors {@link TestFlags}). */
interface SharedFlags {
  readonly verbose: boolean;
  readonly failFast: boolean;
  readonly testPattern: Option.Option<string>;
  readonly extraArgs: ReadonlyArray<string>;
}

const sharedFlagDefs = {
  verbose: Flag.boolean("verbose").pipe(
    Flag.withDescription("Enable verbose test output"),
    Flag.withDefault(false),
  ),
  failFast: Flag.boolean("fail-fast").pipe(
    Flag.withDescription("Stop on first test failure"),
    Flag.withDefault(false),
  ),
  testPattern: Flag.string("test").pipe(
    Flag.withAlias("t"),
    Flag.withDescription("Run only tests matching pattern"),
    Flag.optional,
  ),
  extraArgs: Argument.variadic(
    Argument.string("args").pipe(
      Argument.withDescription("Extra args forwarded to the test runner (after --)"),
    ),
  ),
} as const;

const toTestFlags = (opts: SharedFlags): TestFlags => ({
  verbose: opts.verbose,
  failFast: opts.failFast,
  testPattern: opts.testPattern,
  extraArgs: opts.extraArgs,
});

/** Resolve a `--runtime all|<value>` selection to an explicit list. */
const resolveRuntimes = <R extends string>(
  selection: "all" | R,
  all: ReadonlyArray<R>,
): ReadonlyArray<R> => (selection === "all" ? all : [selection]);

// -----------------------------------------------------------------------------
// Subcommand declarations
// -----------------------------------------------------------------------------

// ── unit ────────────────────────────────────────────────────────────────────

interface UnitOpts extends SharedFlags {}

const unitCommand: CommandBuilder<"node"> = (_, flags) => ["pnpm", unitArgs(flags)];

const unitSpec: SubcommandSpec<"node", UnitOpts> = {
  name: "unit",
  description: "Run unit tests (vitest, node)",
  runtimes: ["node"],
  command: unitCommand,
};

const unitCmd = Command.make("unit", sharedFlagDefs).pipe(
  Command.withDescription(unitSpec.description),
  Command.withHandler((opts: UnitOpts) =>
    runSubcommand(unitSpec, unitSpec.runtimes, toTestFlags(opts), opts).pipe(
      Effect.provide(InfraLayer),
      Effect.scoped,
    ),
  ),
);

// ── smoke ────────────────────────────────────────────────────────────────────

interface SmokeOpts extends SharedFlags {
  readonly runtime: "all" | SmokeRuntime;
}

const smokeSpec: SubcommandSpec<SmokeRuntime, SmokeOpts> = {
  name: "smoke",
  description: "Run smoke tests (module-load check, no Chrome)",
  runtimes: SMOKE_RUNTIMES,
  command: smokeCommand,
};

const smokeCmd = Command.make("smoke", {
  ...sharedFlagDefs,
  runtime: Flag.choice("runtime", [...SMOKE_RUNTIMES, "all"] as const).pipe(
    Flag.withDescription("Runtime to smoke-test"),
    Flag.withDefault("all"),
  ),
}).pipe(
  Command.withDescription(smokeSpec.description),
  Command.withHandler((opts: SmokeOpts) =>
    runSubcommand(
      smokeSpec,
      resolveRuntimes(opts.runtime, smokeSpec.runtimes),
      toTestFlags(opts),
      opts,
    ).pipe(Effect.provide(InfraLayer), Effect.scoped),
  ),
);

// ── integration ────────────────────────────────────────────────────────────

interface IntegrationOpts extends SharedFlags {
  readonly runtime: "all" | IntegrationRuntime;
  readonly noSmoke: boolean;
}

/**
 * Pre-command hook for integration: optional smoke gate + workerd Stagehand driver.
 * Smoke runs per-runtime (so each runtime gets a fast module-load check first).
 * Both hooks are best-effort: failures are logged and swallowed (the actual
 * integration test will then surface real failures).
 */
const integrationBefore: BeforeHook<IntegrationRuntime, IntegrationOpts> = (runtime, flags, opts) =>
  Effect.gen(function* () {
    if (!opts.noSmoke) {
      yield* asOk(runCmd(smokeCommand(runtime as SmokeRuntime, flags)));
    }
    // Workerd integration includes the Stagehand workerd test (wrangler driver).
    // Skip when -t is specified (Stagehand tests don't respect vitest filtering).
    if (runtime === "workerd" && Option.isNone(flags.testPattern)) {
      yield* asOk(
        runCmd(["pnpm", ["tsx", "tests/integration/runtime/workerd/stagehand/driver.ts"]]),
      );
    }
  });

const integrationSpec: SubcommandSpec<IntegrationRuntime, IntegrationOpts> = {
  name: "integration",
  description: "Run integration tests (Chrome + HTTP server, per runtime)",
  runtimes: INTEGRATION_RUNTIMES,
  command: integrationCommand,
  before: integrationBefore,
  requiresInfra: true,
  forceExit: true,
};

const integrationCmd = Command.make("integration", {
  ...sharedFlagDefs,
  runtime: Flag.choice("runtime", [...INTEGRATION_RUNTIMES, "all"] as const).pipe(
    Flag.withDescription("Runtime to integration-test"),
    Flag.withDefault("all"),
  ),
  noSmoke: Flag.boolean("no-smoke").pipe(
    Flag.withDescription("Skip the smoke gate that runs before each runtime"),
    Flag.withDefault(false),
  ),
}).pipe(
  Command.withDescription(integrationSpec.description),
  Command.withHandler((opts: IntegrationOpts) =>
    runSubcommand(
      integrationSpec,
      resolveRuntimes(opts.runtime, integrationSpec.runtimes),
      toTestFlags(opts),
      opts,
    ).pipe(Effect.provide(InfraLayer), Effect.scoped),
  ),
);

// ── providers ──────────────────────────────────────────────────────────────

interface ProvidersOpts extends SharedFlags {
  readonly runtime: "all" | ProviderRuntime;
  readonly provider: "all" | Provider;
}

const providersCommandBuilder: CommandBuilder<ProviderRuntime> = (runtime, flags) => {
  // Provider selection is encoded into TestFlags.extraArgs by the wiring below.
  // Decode it here so providersCommand() gets an Option<Provider>.
  const providerOpt = decodeProviderFromFlags(flags);
  return providersCommand(runtime, providerOpt, flags);
};

/** Encode the provider choice into `extraArgs` for the inner vitest call. */
const encodeProviderIntoFlags = (flags: TestFlags, provider: "all" | Provider): TestFlags =>
  provider === "all" ? flags : { ...flags, extraArgs: [...flags.extraArgs, provider] };

/** Decode the provider choice from `extraArgs`. */
const decodeProviderFromFlags = (flags: TestFlags): Option.Option<Provider> => {
  for (const p of PROVIDERS) {
    if (flags.extraArgs.includes(p)) return Option.some(p);
  }
  return Option.none();
};

const providersSpec: SubcommandSpec<ProviderRuntime, ProvidersOpts> = {
  name: "providers",
  description: "Run provider tests (real APIs — opt-in, costs money)",
  runtimes: PROVIDER_RUNTIMES,
  command: providersCommandBuilder,
  requiresInfra: true,
};

const providersCmd = Command.make("providers", {
  ...sharedFlagDefs,
  runtime: Flag.choice("runtime", [...PROVIDER_RUNTIMES, "all"] as const).pipe(
    Flag.withDescription("Runtime to run provider tests in"),
    Flag.withDefault("all"),
  ),
  provider: Flag.choice("provider", [...PROVIDERS, "all"] as const).pipe(
    Flag.withDescription("Provider to test (default: all)"),
    Flag.withDefault("all"),
  ),
}).pipe(
  Command.withDescription(providersSpec.description),
  Command.withHandler((opts: ProvidersOpts) =>
    Effect.gen(function* () {
      const flags = encodeProviderIntoFlags(toTestFlags(opts), opts.provider);
      yield* runSubcommand(
        providersSpec,
        resolveRuntimes(opts.runtime, providersSpec.runtimes),
        flags,
        opts,
      ).pipe(Effect.provide(InfraLayer), Effect.scoped);
    }),
  ),
);

// ── stagehand ──────────────────────────────────────────────────────────────

interface StagehandOpts extends SharedFlags {
  readonly runtime: "all" | StagehandRuntime;
}

const stagehandCommand: CommandBuilder<StagehandRuntime> = (runtime, flags) => {
  if (runtime === "node") return stagehandNodeCommand(flags);
  return ["pnpm", ["tsx", "tests/integration/runtime/workerd/stagehand/driver.ts"]];
};

const stagehandSpec: SubcommandSpec<StagehandRuntime, StagehandOpts> = {
  name: "stagehand",
  description: "Run Stagehand tests (LLM — opt-in, costs money)",
  runtimes: STAGEHAND_RUNTIMES,
  command: stagehandCommand,
  requiresInfra: true,
};

const stagehandCmd = Command.make("stagehand", {
  ...sharedFlagDefs,
  runtime: Flag.choice("runtime", [...STAGEHAND_RUNTIMES, "all"] as const).pipe(
    Flag.withDescription("Runtime to run Stagehand tests in"),
    Flag.withDefault("all"),
  ),
}).pipe(
  Command.withDescription(stagehandSpec.description),
  Command.withHandler((opts: StagehandOpts) =>
    runSubcommand(
      stagehandSpec,
      resolveRuntimes(opts.runtime, stagehandSpec.runtimes),
      toTestFlags(opts),
      opts,
    ).pipe(Effect.provide(InfraLayer), Effect.scoped),
  ),
);

// -----------------------------------------------------------------------------
// Parent command
// -----------------------------------------------------------------------------

const test = Command.make("test").pipe(
  Command.withDescription("Unified test runner for @effect-libs/browser"),
  Command.withSubcommands([unitCmd, smokeCmd, integrationCmd, providersCmd, stagehandCmd]),
);

// -----------------------------------------------------------------------------
// CLI gate: only run when this file is the direct entry point
// -----------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  Command.run({ version: "1.0.0" })(test).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
