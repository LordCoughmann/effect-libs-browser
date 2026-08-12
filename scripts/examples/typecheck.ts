/**
 * Typecheck all examples with Effect language service diagnostics.
 *
 * Usage: pnpm tsx scripts/examples/typecheck.ts
 *
 */

import type { PlatformError } from "effect/PlatformError";
import type { ChildProcessSpawner } from "effect/unstable/process";

import { NodeServices } from "@effect/platform-node";
import { Array, Console, Effect, FileSystem, Path, Schema, type Scope } from "effect";
import * as Arr from "effect/Array";

import { Block, render, type Section } from "../shared/CliFormat.js";
import { walkEntries } from "../shared/FileWalker.js";
import { execAndCapture, execInherit } from "../shared/ProcessSpawner.js";

// =============================================================================
// Errors
// =============================================================================

/**
 * Error when a typecheck command fails.
 */
class TypecheckError extends Schema.TaggedError<TypecheckError>()(
  "scripts/examples/TypecheckError",
  {
    example: Schema.String,
    output: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Typecheck failed for ${this.example}`;
  }
}

/**
 * Error when typechecking examples fails at the CLI level.
 */
class TypecheckFailedError extends Schema.TaggedError<TypecheckFailedError>()(
  "scripts/examples/TypecheckFailedError",
  {
    count: Schema.Finite,
    failed: Schema.Array(
      Schema.Struct({
        example: Schema.String,
        output: Schema.String,
      }),
    ),
  },
) {
  override get message(): string {
    return `Typecheck failed for ${this.count} examples`;
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Result of typechecking an example.
 */
interface TypecheckResult {
  readonly example: string;
  readonly passed: boolean;
  readonly output: string;
}

/**
 * Summary of all typecheck results.
 */
interface TypecheckSummary {
  readonly passed: number;
  readonly failed: readonly { example: string; output: string }[];
  readonly total: number;
}

// =============================================================================
// Example Discovery
// =============================================================================

/**
 * Find all example directories with a `tsconfig.json`.
 *
 * Walks `examples/` recursively, skipping `node_modules`, `.git`, and `test/`
 * (the original code excluded `test/` subdirectories defensively — kept here
 * to preserve behaviour).
 */
const findExamples = (
  rootDir: string,
): Effect.Effect<readonly string[], PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* walkEntries(path.join(rootDir, "examples"), {
      skipDirs: ["node_modules", ".git", "test"],
      filter: (entry) =>
        entry.type === "directory"
          ? fs.exists(path.join(entry.path, "tsconfig.json"))
          : Effect.succeed(false),
    });

    return entries.map((e) => e.path).sort();
  });

// =============================================================================
// Typegen
// =============================================================================

/**
 * Check if a tsconfig.json references worker-configuration.d.ts.
 * Parses the tsconfig and checks the "types" and "include" fields.
 */
const tsconfigNeedsWorkerConfig = (
  examplePath: string,
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tsconfigPath = path.join(examplePath, "tsconfig.json");

    const exists = yield* fs.exists(tsconfigPath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return false;

    const content = yield* fs.readFileString(tsconfigPath).pipe(Effect.orElseSucceed(() => ""));
    return content.includes("worker-configuration");
  });

/**
 * Generate worker-configuration.d.ts for a Cloudflare Workers example
 * if the tsconfig references it but the file doesn't exist yet.
 */
const ensureWorkerConfigTypes = (
  examplePath: string,
): Effect.Effect<
  void,
  TypecheckError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const needsIt = yield* tsconfigNeedsWorkerConfig(examplePath);
    if (!needsIt) return;

    const workerConfigPath = path.join(examplePath, "worker-configuration.d.ts");
    const exists = yield* fs.exists(workerConfigPath).pipe(Effect.orElseSucceed(() => false));
    if (exists) return;

    const relativePath = path.relative(process.cwd(), examplePath);
    yield* Console.log(`  Generating types for ${relativePath}...`);

    const result = yield* execInherit("npx", ["wrangler", "types"], { cwd: examplePath });

    if (result.exitCode !== 0) {
      return yield* new TypecheckError({
        example: relativePath,
        output: `wrangler types exited with code ${result.exitCode}`,
      });
    }
  });

// =============================================================================
// Typecheck Operations
// =============================================================================

/**
 * Run typecheck on a single example using shared ProcessSpawner helpers.
 * Auto-generates worker-configuration.d.ts if needed by the tsconfig.
 * Returns the result even on failure.
 */
const typecheckExampleWithResult = (
  rootDir: string,
  examplePath: string,
): Effect.Effect<
  TypecheckResult,
  TypecheckError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const relativePath = path.relative(rootDir, examplePath);

    // Ensure worker-configuration.d.ts exists if tsconfig references it
    yield* ensureWorkerConfigTypes(examplePath);

    const result = yield* execAndCapture("pnpm", ["tsgo", "--noEmit", "-p", examplePath]);

    return {
      example: relativePath,
      passed: result.exitCode === 0,
      output: result.output,
    };
  });

/**
 * Run typecheck on all examples and accumulate results.
 * Runs concurrently with max 10 parallel typechecks.
 */
const typecheckAll = (
  rootDir: string,
): Effect.Effect<
  TypecheckSummary,
  PlatformError | TypecheckError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function* () {
    const examples = yield* findExamples(rootDir);

    // Run typechecks concurrently with max 10 parallel
    const results = yield* Effect.all(
      examples.map((example) => typecheckExampleWithResult(rootDir, example)),
      { concurrency: 10 },
    );

    const passed = results.filter((r) => r.passed).length;
    const failed = results
      .filter((r) => !r.passed)
      .map((r) => ({ example: r.example, output: r.output }));

    return {
      passed,
      failed,
      total: examples.length,
    };
  });

// =============================================================================
// Output Formatting
// =============================================================================

const headerSection = (s: TypecheckSummary): Section => [
  Block.Rule({ char: "=", width: 32 }),
  Block.Line({ text: `Passed: ${s.passed}` }),
  Block.Line({ text: `Failed: ${s.failed.length}` }),
];

const successSection: Section = [
  Block.Line({ text: "" }),
  Block.Line({ text: "All examples passed! ✅" }),
];

const failureSection = (f: { example: string; output: string }): Section => {
  const body = f.output.trimEnd();
  return [
    Block.Line({ text: `❌ ${f.example}` }),
    ...(body ? [Block.Indented({ text: body, level: 3 })] : []),
    Block.Line({ text: "" }),
  ];
};

/**
 * Format typecheck results as a {@link Section}.
 *
 * Structure (failure case):
 *   - Header (rule + passed/failed counts)
 *   - Blank line
 *   - For each failure: title line, optional indented body, blank line
 *
 * Structure (success case):
 *   - Header
 *   - Blank line
 *   - "All examples passed!" line
 */
const formatOutput = (s: TypecheckSummary): Section => [
  ...headerSection(s),
  ...(Arr.isReadonlyArrayEmpty(s.failed)
    ? successSection
    : [Block.Line({ text: "" }), ...s.failed.flatMap(failureSection)]),
];

// =============================================================================
// Main Program
// =============================================================================

/**
 * Main program that typechecks all examples.
 * Runs concurrently with max 10 parallel typechecks.
 *
 * Fails with {@link TypecheckFailedError} if any example fails type-checking;
 * the CLI edge is a thin wrapper that maps that failure to a non-zero exit code.
 */
const program = (
  rootDir: string,
): Effect.Effect<
  TypecheckSummary,
  PlatformError | TypecheckError | TypecheckFailedError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function* () {
    yield* Console.log("Checking examples with Effect language service (tsgo)...");

    const summary = yield* typecheckAll(rootDir);

    const passedCount = summary.passed;
    if (passedCount > 0) {
      yield* Console.log(`✅ ${passedCount} examples passed`);
    }

    yield* Console.log(render(formatOutput(summary)));

    if (Array.isReadonlyArrayNonEmpty(summary.failed)) {
      return yield* new TypecheckFailedError({
        count: summary.failed.length,
        failed: summary.failed,
      });
    }

    return summary;
  });

// =============================================================================
// CLI Entry Point
// =============================================================================

// Only run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const rootDir = process.cwd();

  Effect.runPromise(program(rootDir).pipe(Effect.provide(NodeServices.layer), Effect.scoped)).catch(
    () => process.exit(1),
  );
}
