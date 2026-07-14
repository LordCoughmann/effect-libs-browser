/**
 * Cross-cutting process-spawn helpers for scripts that shell out to
 * external tools (`tsgo`, `oxfmt`, `wrangler`, etc.).
 *
 * Exports:
 * - {@link execAndCapture}: spawn a command, capture combined stdout + stderr,
 *   return `{ exitCode, output }`
 * - {@link execInherit}: spawn a command, inherit stdio, return `{ exitCode }`
 *
 * Both helpers swallow spawn failures and signal non-zero exit via the
 * returned `exitCode` (defaulting to `1` on spawn error), so the returned
 * Effect never fails. Callers branch on `exitCode` to detect failures.
 * This matches the existing verify-examples.ts pattern where downstream
 * code (`findFailedBlocks`) parses the output to figure out which blocks
 * failed — there's no typed error to wrap into.
 *
 * Used by:
 *   - scripts/docs/verify-examples.ts (tsgo, oxfmt)
 *   - scripts/examples/typecheck.ts (wrangler types, tsgo)
 *
 * @see {@link TestRunner.execArgs} in scripts/test-runner/TestRunner.ts for a
 *   similar helper that DOES surface typed errors (CommandFailure) — chosen
 *   for the test-runner because vitest exit-code semantics differ per runtime.
 */

import { Effect, Stream, type Scope } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

// =============================================================================
// Types
// =============================================================================

/** Options for spawning a child process. */
export interface ExecOptions {
  /** Working directory for the spawned process. Defaults to inherit (process.cwd()). */
  readonly cwd?: string;
}

/** Result of a spawn (exit-code only). */
export interface ExecResult {
  /**
   * Process exit code. `0` means success. `1` (sentinel) is returned when the
   * process could not be spawned at all (e.g. binary not on PATH) — callers
   * can detect this by `output === ""` for {@link ExecCaptureResult}.
   */
  readonly exitCode: number;
}

/** Result of a spawn that captures output. */
export interface ExecCaptureResult extends ExecResult {
  /** Combined stdout + stderr decoded as UTF-8. Empty when capture wasn't requested. */
  readonly output: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Spawn a command and inherit stdio. Returns the exit code.
 *
 * Use this for fire-and-forget commands whose output the user sees directly
 * in their terminal (e.g. `wrangler types` — its progress output is useful).
 *
 * @example
 * ```ts
 * const result = yield* execInherit("npx", ["wrangler", "types"], { cwd: examplePath });
 * if (result.exitCode !== 0) {
 *   yield* Console.error(`wrangler types failed with code ${result.exitCode}`);
 * }
 * ```
 */
export const execInherit = (
  command: string,
  args: ReadonlyArray<string>,
  options: ExecOptions = {},
): Effect.Effect<ExecResult, never, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner
      .spawn(makeCommand(command, args, "inherit", options))
      .pipe(Effect.orElseSucceed(() => null));

    if (handle === null) return { exitCode: EXIT_FAILURE_VALUE };

    const exitCode = yield* handle.exitCode.pipe(Effect.orElseSucceed(() => EXIT_FAILURE));
    return { exitCode };
  }).pipe(Effect.scoped);

/**
 * Spawn a command and capture combined stdout + stderr. Returns the exit code and output.
 *
 * Use this for commands whose output you need to parse or display (e.g.
 * `tsgo --noEmit` — diagnostics are matched against expected output file paths).
 *
 * @example
 * ```ts
 * const result = yield* execAndCapture("pnpm", ["tsgo", "--noEmit", "-p", tsconfigPath]);
 * if (result.exitCode !== 0) {
 *   return yield* new TypecheckError({ output: result.output });
 * }
 * ```
 */
export const execAndCapture = (
  command: string,
  args: ReadonlyArray<string>,
  options: ExecOptions = {},
): Effect.Effect<ExecCaptureResult, never, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner
      .spawn(makeCommand(command, args, "pipe", options))
      .pipe(Effect.orElseSucceed(() => null));

    if (handle === null) return { exitCode: EXIT_FAILURE_VALUE, output: "" };

    const outputChunks: string[] = [];
    const collectOutput = Stream.decodeText(handle.all).pipe(
      Stream.tap((chunk) => Effect.sync(() => outputChunks.push(chunk))),
      Stream.runDrain,
    );

    // exitCode and collectOutput run concurrently: the stream needs to be
    // drained as the process writes so we don't deadlock on a full pipe buffer.
    // orElseSucceed on both so the Effect.all stays `never`-erroring, letting
    // the public API keep its `Effect<..., never, ...>` contract.
    const [exitCode] = yield* Effect.all(
      [
        handle.exitCode.pipe(Effect.orElseSucceed(() => EXIT_FAILURE)),
        collectOutput.pipe(Effect.orElseSucceed(() => undefined)),
      ],
      { concurrency: 2 },
    );

    return { exitCode, output: outputChunks.join("") };
  }).pipe(Effect.scoped);

// =============================================================================
// Internal
// =============================================================================

/** Sentinel exit code for "spawn failed" — coerced to plain number for the public API. */
const EXIT_FAILURE = ChildProcessSpawner.ExitCode(1);
const EXIT_FAILURE_VALUE = 1;

/**
 * Build a `ChildProcess.make` command with the requested stdio mode and optional cwd.
 */
const makeCommand = (
  command: string,
  args: ReadonlyArray<string>,
  stdio: "inherit" | "pipe",
  options: ExecOptions,
): ChildProcess.Command =>
  ChildProcess.make(command, args, {
    stdout: stdio,
    stderr: stdio,
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  });
