/**
 * Copy root .env to all example folders.
 *
 * Usage: pnpm tsx scripts/examples/copy-env.ts
 *
 * Prerequisites:
 *   1. Fill in your .env file at project root with your API keys
 *   2. Run this script to copy to all examples
 *
 */

import type { PlatformError } from "effect/PlatformError";

import { NodeServices } from "@effect/platform-node";
import { Effect, Console, Schema, FileSystem, Path } from "effect";

import { walkEntries } from "../shared/FileWalker.js";

// =============================================================================
// Errors
// =============================================================================

/**
 * Error when the .env file is not found at project root.
 */
class EnvFileNotFoundError extends Schema.TaggedErrorClass<EnvFileNotFoundError>()(
  "scripts/EnvFileNotFoundError",
  { path: Schema.String },
) {
  override get message(): string {
    return `.env file not found at ${this.path}`;
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Result of copying env file to an example.
 */
interface CopyResult {
  readonly example: string;
  readonly destination: string;
}

// =============================================================================
// Example Discovery
// =============================================================================

/**
 * Recursively find all directories under `rootExamplesDir` that contain a
 * marker file (e.g. `.dev.vars.example` or `.env.example`).
 */
const findMarkerDirs = (
  rootExamplesDir: string,
  markerFile: string,
): Effect.Effect<readonly string[], PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const entries = yield* walkEntries(rootExamplesDir, {
      filter: (entry) =>
        entry.type === "directory"
          ? fs.exists(path.join(entry.path, markerFile))
          : Effect.succeed(false),
    });

    return entries.map((e) => e.path);
  });

// =============================================================================
// Copy Operations
// =============================================================================

/**
 * Copy env file to all example directories found by marker file.
 */
const copyEnvToExamples = (envFile: string, rootExamplesDir: string, destFilename: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const markerFile = `${destFilename}.example`;
    const exampleDirs = yield* findMarkerDirs(rootExamplesDir, markerFile);
    const results: CopyResult[] = [];

    for (const dir of exampleDirs) {
      const dest = path.join(dir, destFilename);
      yield* fs.copyFile(envFile, dest);
      const relative = path.relative(rootExamplesDir, dir);
      results.push({ example: relative, destination: destFilename });
    }

    return results;
  });

// =============================================================================
// Main Program
// =============================================================================

/**
 * Program configuration derived from import.meta.url.
 * Returns an Effect that yields the config object.
 */
const getConfig = (importMetaUrl: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    const __filename = yield* path.fromFileUrl(new URL(importMetaUrl));
    const __dirname = path.dirname(__filename);
    const rootDir = path.join(__dirname, "..", "..");
    const envFile = path.join(rootDir, ".env");
    const examplesDir = path.join(rootDir, "examples");

    return { rootDir, envFile, examplesDir } as const;
  });

/**
 * Main program that copies .env to all example directories.
 */
const program = Effect.fn("copyEnvToExamples")(function* (config: {
  envFile: string;
  examplesDir: string;
}) {
  // Check if .env exists
  const fs = yield* FileSystem.FileSystem;
  const envExists = yield* fs.exists(config.envFile);
  if (!envExists) {
    return yield* new EnvFileNotFoundError({ path: config.envFile });
  }

  // Copy to all examples with .dev.vars.example (.dev.vars)
  const devVarsResults = yield* copyEnvToExamples(config.envFile, config.examplesDir, ".dev.vars");

  // Copy to all examples with .env.example (.env)
  const envResults = yield* copyEnvToExamples(config.envFile, config.examplesDir, ".env");

  return { devVarsResults, envResults };
});

/**
 * Run the program and print results.
 */
const run = (config: { envFile: string; examplesDir: string }) =>
  Effect.gen(function* () {
    const result = yield* program(config);

    // Print results
    yield* Console.log("Copying .env to all example folders...\n");

    for (const { example, destination } of result.devVarsResults) {
      yield* Console.log(`  ✓ ${example}/${destination}`);
    }

    for (const { example, destination } of result.envResults) {
      yield* Console.log(`  ✓ ${example}/${destination}`);
    }

    const total = result.devVarsResults.length + result.envResults.length;
    yield* Console.log(`\nDone! Copied to ${total} examples.`);

    return result;
  });

// =============================================================================
// CLI Entry Point
// =============================================================================

// Only run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  Effect.gen(function* () {
    const config = yield* getConfig(import.meta.url);
    return yield* run(config);
  })
    .pipe(
      Effect.provide(NodeServices.layer),
      Effect.catchTag("scripts/EnvFileNotFoundError", (error) =>
        Effect.gen(function* () {
          yield* Console.error(error.message);
          yield* Console.error("Please create .env from .env.example:");
          yield* Console.error("  cp .env.example .env");
          yield* Console.error("  # Then edit .env with your API keys");
          return yield* error;
        }),
      ),
      Effect.runPromise,
    )
    .catch(() => process.exit(1));
}
