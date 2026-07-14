/**
 * Cross-cutting directory-walking helpers for scripts that discover files
 * or directories in a tree.
 *
 * Exports:
 * - {@link walkEntries}: recursively walk a directory, returning entries
 *   that pass a predicate filter
 *
 * The walker skips `node_modules` and `.git` by default (consistent across
 * the three current consumers). `stat` failures (broken symlinks, etc.) are
 * silently swallowed per-entry; `readDirectory` failures propagate as
 * `PlatformError` so callers can wrap them into their domain error type.
 *
 * Used by:
 *   - scripts/docs/verify-examples.ts (find markdown files)
 *   - scripts/examples/copy-env.ts (find dirs with a marker file)
 *   - scripts/examples/typecheck.ts (find dirs with tsconfig.json)
 *
 * @see {@link TestRunnerRuntimes} for a similar table-driven pattern over a
 *   different value domain — same idea, narrow focused helper for one concern.
 */

import type { PlatformError } from "effect/PlatformError";

import { Effect, FileSystem, Path } from "effect";

// =============================================================================
// Types
// =============================================================================

/** A single entry seen during the walk. */
export interface WalkEntry {
  /** Base name of the entry (e.g. `"README.md"`). */
  readonly name: string;
  /** Absolute path to the entry. */
  readonly path: string;
  /** Whether the entry is a file or directory. */
  readonly type: "file" | "directory";
}

/** Options for {@link walkEntries}. */
export interface WalkOptions {
  /**
   * Directory names to skip entirely (won't be entered). Default:
   * `["node_modules", ".git"]` — matches every existing caller.
   */
  readonly skipDirs?: ReadonlyArray<string>;
  /**
   * Recurse into a directory even when `filter` returns false. Default: `true`.
   * Set to `false` to short-circuit a subtree as soon as the directory itself
   * is rejected (useful when you only want matches at a fixed depth).
   */
  readonly recurseIntoRejects?: boolean;
  /**
   * Predicate applied to every entry. Return `Effect.succeed(true)` to include
   * the entry in the results. Effect-returning so callers can do filesystem
   * checks (`fs.exists`, `fs.readFileString`) inside the predicate.
   */
  readonly filter: (
    entry: WalkEntry,
  ) => Effect.Effect<boolean, PlatformError, FileSystem.FileSystem | Path.Path>;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Recursively walk `rootDir`, returning entries that pass `filter`.
 *
 * Behaviour:
 * - Reads each directory's entries; skips names in `skipDirs` (default `node_modules`, `.git`).
 * - `fs.stat` failures per-entry are silently swallowed (broken symlinks etc.).
 * - `fs.readDirectory` failures propagate to the caller as `PlatformError`.
 * - Walks depth-first; relative order of results matches filesystem order.
 *
 * @example
 * ```ts
 * // Find all .md files under docs/, skipping node_modules/.git.
 * const files = yield* walkEntries("docs", {
 *   filter: (entry) => Effect.succeed(entry.type === "file" && entry.name.endsWith(".md")),
 * });
 * ```
 *
 * @example
 * ```ts
 * // Find all directories containing a tsconfig.json.
 * const dirs = yield* walkEntries("examples", {
 *   filter: (entry) =>
 *     entry.type === "directory"
 *       ? Effect.gen(function* () {
 *           const fs = yield* FileSystem.FileSystem;
 *           return yield* fs.exists(`${entry.path}/tsconfig.json`);
 *         })
 *       : Effect.succeed(false),
 * });
 * ```
 */
export const walkEntries = (
  rootDir: string,
  options: WalkOptions,
): Effect.Effect<readonly WalkEntry[], PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const skip = new Set(options.skipDirs ?? DEFAULT_SKIP_DIRS);
    const recurseIntoRejects = options.recurseIntoRejects ?? true;

    const results: WalkEntry[] = [];

    const walk = (
      dir: string,
    ): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
      Effect.gen(function* () {
        const entries = yield* fs.readDirectory(dir);
        for (const name of entries) {
          if (skip.has(name)) continue;
          const entryPath = path.join(dir, name);
          const stat = yield* fs.stat(entryPath).pipe(Effect.orElseSucceed(() => null));
          if (!stat) continue;

          const type: WalkEntry["type"] = stat.type === "Directory" ? "directory" : "file";
          const entry: WalkEntry = { name, path: entryPath, type };

          const matches = yield* options.filter(entry);
          if (matches) {
            results.push(entry);
          }

          if (type === "directory" && (matches || recurseIntoRejects)) {
            yield* walk(entryPath);
          }
        }
      });

    yield* walk(rootDir);
    return results;
  });

// =============================================================================
// Internal
// =============================================================================

/** Default `skipDirs` value — matches every current consumer. */
const DEFAULT_SKIP_DIRS: ReadonlyArray<string> = ["node_modules", ".git"];
