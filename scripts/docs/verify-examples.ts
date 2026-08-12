/**
 * Verify that TypeScript code blocks in markdown docs compile correctly.
 *
 * The verifier extracts ` ```typescript ` / ` ```ts ` fenced code blocks from
 * markdown files, writes them as real `.ts` files under a temporary directory
 * (`.tmp/docs-verify`), and runs the project TypeScript checker (`tsgo --noEmit`)
 * against a generated `tsconfig.json`. The generated directory is recreated on
 * each run and is safe to delete.
 *
 * ## Verification Modes (HTML marker comments)
 *
 * Place an HTML comment **before** the code block (within 500 characters) to
 * control how the block is verified:
 *
 * | Marker                     | Mode      | Behavior                                               |
 * |----------------------------|-----------|--------------------------------------------------------|
 * | *(no marker)*              | `default` | Code is type-checked as-is                             |
 * | `<!-- verify:ignore -->`   | `ignore`  | Block is skipped entirely                              |
 * | `<!-- verify:stubs -->`    | `stubs`   | Prepends built-in stub declarations (see {@link STUBS})|
 * | `<!-- verify:stubs:X -->`  | `stubs`   | Built-in stubs **plus** custom stub text `X`           |
 * | `<!-- verify:raw -->`      | `raw`     | Code is written verbatim — no stubs, no wrapping      |
 *
 * ## Auto-wrapping
 *
 * When a block in `default` or `stubs` mode contains top-level `yield*`
 * expressions, the verifier automatically wraps the body in
 * `Effect.gen(function* () { ... })` so the code is syntactically valid.
 * Import lines are kept at module top-level.
 *
 * ## Usage
 *
 * ```sh
 * # Verify default docs files
 * pnpm docs:typecheck
 *
 * # Format code blocks in default docs files
 * pnpm docs:format
 *
 * # Verify specific files
 * pnpm tsx scripts/docs/verify-examples.ts docs/guides/my-guide.md
 *
 * # Format specific files
 * pnpm tsx scripts/docs/verify-examples.ts --format docs/guides/my-guide.md
 *
 * # Verbose: print per-block / per-file progress
 * pnpm tsx scripts/docs/verify-examples.ts --verbose
 * ```
 *
 * By default the script prints only summary lines (counts, passed/failed
 * totals, final status). Pass `--verbose` to also emit per-block and
 * per-file progress lines (one line per extracted code block).
 *
 */

import type { Scope } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import { NodeServices } from "@effect/platform-node";
import { Effect, Console, Schema, FileSystem, Path, Result } from "effect";
import * as Arr from "effect/Array";

import { walkEntries } from "../shared/FileWalker.js";
import { execAndCapture } from "../shared/ProcessSpawner.js";

// =============================================================================
// Errors
// =============================================================================

/** Thrown when a markdown file cannot be read or the verify directory cannot be created. */
class ExtractionError extends Schema.TaggedError<ExtractionError>()(
  "scripts/ExtractionError",
  Schema.Struct({
    file: Schema.String,
    cause: Schema.Defect(),
  }),
) {}

/** Thrown when `tsgo --noEmit` reports diagnostics. */
class TypecheckError extends Schema.TaggedError<TypecheckError>()(
  "scripts/TypecheckError",
  Schema.Struct({
    output: Schema.String,
  }),
) {}

/** Thrown when one or more code blocks fail type-checking. */
class VerificationFailedError extends Schema.TaggedError<VerificationFailedError>()(
  "scripts/VerificationFailedError",
  Schema.Struct({
    count: Schema.Finite,
    failed: Schema.Array(Schema.String),
  }),
) {}

/** Thrown when the formatter (`oxfmt`) fails. */
class FormatError extends Schema.TaggedError<FormatError>()(
  "scripts/FormatError",
  Schema.Struct({
    output: Schema.String,
  }),
) {}

// =============================================================================
// Types
// =============================================================================

/**
 * A TypeScript code block extracted from a markdown file.
 *
 * @property code        - The raw source code inside the fenced block.
 * @property file        - Path to the source markdown file.
 * @property index       - Zero-based block index within the file (across all `ts`/`typescript` blocks).
 * @property line        - One-based line number where the block starts in the markdown.
 * @property mode        - Verification mode determined by preceding HTML marker comments.
 * @property customStubs - Additional stub declarations from `<!-- verify:stubs:... -->` markers.
 * @property startOffset - Character offset of the opening fence in the markdown source (used for replacement).
 */
interface CodeBlock {
  readonly code: string;
  readonly file: string;
  readonly index: number;
  readonly line: number;
  readonly mode: "default" | "stubs" | "raw" | "ignore";
  readonly customStubs: string;
  readonly startOffset: number;
}

/**
 * A {@link CodeBlock} that has been written to the temporary verify directory.
 *
 * @property block        - The original extracted block.
 * @property path         - Absolute path to the generated `.ts` file.
 * @property relativePath - Same as `path` (used for matching in tsgo output).
 */
interface WrittenBlock {
  readonly block: CodeBlock;
  readonly path: string;
  readonly relativePath: string;
}

// =============================================================================
// Stub Declarations
// =============================================================================

/**
 * Ambient type declarations prepended to code blocks in `stubs` mode.
 *
 * These declare fictional functions and variables commonly used in doc examples
 * (e.g. `extractData()`, `inputs`, `env`) so that the code type-checks without
 * a real runtime.
 */
const STUBS = `
// -- Stubs for fictional code used in examples --
declare function extractData(): unknown;
declare const inputs: { superpower: string; features_used: string[]; coolest_build: string };
declare const env: { MYBROWSER: unknown; CF_ACCOUNT_ID: string; CF_API_TOKEN: string; CDP_URL?: string; STEEL_API_KEY: string };
// -- End stubs --

`;

// =============================================================================
// Code Block Extraction
// =============================================================================

const TYPESCRIPT_CODE_PATTERN = /```(?:typescript|ts)\r?\n([\s\S]*?)```/g;
const VERIFY_DIR = ".tmp/docs-verify";
const VERIFY_TSCONFIG = `${VERIFY_DIR}/tsconfig.json`;

/**
 * Extract all TypeScript code blocks from a markdown string, classifying each
 * by its {@link CodeBlock.mode}.
 *
 * Scans for ` ```typescript ` and ` ```ts ` fenced blocks, determines each
 * block's mode by inspecting preceding HTML marker comments (within the same
 * prose section).
 *
 * A verify marker applies to a code block only if it appears AFTER the most
 * recent closing code fence in the file (i.e., in the same prose section as
 * the code block). This prevents markers from leaking across sections when a
 * block has no marker of its own.
 *
 * Blocks in sections that contain a `<!-- verify:ignore -->` marker are
 * returned with `mode: "ignore"`. Consumers decide what to do with them:
 * the typecheck program skips them entirely, and the format program applies
 * only `yield *` → `yield*` normalisation to them (no stubs, no wrap, no
 * `oxfmt`) so author-controlled formatting is preserved while the canonical
 * `yield*` spelling is enforced everywhere.
 *
 * @param markdown - Full text of the markdown file.
 * @param filePath - Path to the file (stored in each block for error reporting).
 * @returns Array of extracted code blocks, including ignored blocks (mode `"ignore"`).
 */
const extractCodeBlocks = (markdown: string, filePath: string): CodeBlock[] => {
  const blocks: CodeBlock[] = [];
  let match: RegExpExecArray | null;
  let blockIndex = 0;

  // Pre-compute the position of every closing fence in the file. A verify
  // marker is in the same prose section as a code block if and only if it
  // appears after the most recent closing fence before that block.
  const closingFencePositions: number[] = [];
  const CLOSING_FENCE_RE = /\n```\n/g;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = CLOSING_FENCE_RE.exec(markdown)) !== null) {
    closingFencePositions.push(fenceMatch.index + fenceMatch[0].length);
  }

  // Pre-compute every verify marker position in the file with its mode and
  // optional custom stubs text. We pick the most recent one whose position
  // is after the last closing fence, not simply "in the last N bytes".
  const MARKER_RE = /<!-- verify:(\w+)(?::\s*([\s\S]+?))?\s*-->/g;
  type Marker = { pos: number; mode: string; customStubs: string };
  const markers: Marker[] = [];
  let markerMatch: RegExpExecArray | null;
  while ((markerMatch = MARKER_RE.exec(markdown)) !== null) {
    markers.push({
      pos: markerMatch.index,
      mode: markerMatch[1] ?? "",
      customStubs: (markerMatch[2] ?? "").trim(),
    });
  }

  const lastClosingFenceBefore = (pos: number): number => {
    let result = -1;
    for (const p of closingFencePositions) {
      if (p <= pos) result = p;
      else break;
    }
    return result;
  };

  while ((match = TYPESCRIPT_CODE_PATTERN.exec(markdown)) !== null) {
    const code = match[1];
    const blockStart = match.index;
    const fenceEnd = lastClosingFenceBefore(blockStart);
    const markersInSection: Marker[] = [];
    for (const m of markers) {
      if (m.pos >= fenceEnd && m.pos < blockStart) markersInSection.push(m);
    }

    const line = markdown.slice(0, blockStart).split("\n").length;

    // If the section contains any `verify:ignore` marker, the block is
    // returned with mode `"ignore"`. The typecheck pipeline skips these
    // entirely; the format pipeline applies only `yield *` → `yield*`
    // normalisation (no stubs, no wrap, no oxfmt).
    if (markersInSection.some((m) => m.mode === "ignore")) {
      if (code !== undefined) {
        blocks.push({
          code,
          file: filePath,
          index: blockIndex,
          line,
          mode: "ignore",
          customStubs: "",
          startOffset: blockStart,
        });
      }
      blockIndex++;
      continue;
    }

    // Otherwise, the most recent non-default marker wins.
    const lastNonDefault = [...markersInSection]
      .reverse()
      .find((m) => m.mode === "stubs" || m.mode === "raw");

    let mode: "default" | "stubs" | "raw" = "default";
    let customStubs = "";
    if (lastNonDefault) {
      if (lastNonDefault.mode === "raw") mode = "raw";
      else {
        mode = "stubs";
        customStubs = lastNonDefault.customStubs;
      }
    }

    if (code !== undefined) {
      blocks.push({
        code,
        file: filePath,
        index: blockIndex,
        line,
        mode,
        customStubs,
        startOffset: blockStart,
      });
    }
    blockIndex++;
  }

  return blocks;
};

// =============================================================================
// Code Generation
// =============================================================================

/**
 * Normalize `yield *` (with a space) to `yield*` so the detection regex
 * works consistently regardless of authoring style.
 */
const normalizeYieldStar = (code: string): string => code.replace(/\byield\s+\*/g, "yield*");

/**
 * Detect whether a code block contains top-level `yield*` expressions that
 * need to be wrapped in `Effect.gen(function* () { ... })` to be syntactically
 * valid TypeScript.
 *
 * Uses simple brace-depth tracking — sufficient for doc examples which are
 * typically short and flat.
 */
const needsEffectGenWrap = (code: string): boolean => {
  const normalized = normalizeYieldStar(code);
  // Check if there are yield* at the module's top level (outside any function* body)
  const lines = normalized.split("\n");
  let depth = 0; // function nesting depth
  for (const line of lines) {
    const depthBefore = depth;
    // Track function* / generator nesting
    for (const ch of line) {
      // Simple brace tracking — good enough for doc examples
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    // Check yield* at the depth in effect when this line started.
    // Handles `const x = yield* foo({...})` correctly: yield* comes before
    // the `{` on the same line, so it's at module-level even though braces
    // on this line push depth up.
    if (depthBefore === 0 && /\byield\*/.test(line)) return true;
  }
  return false;
};

/**
 * Transform a {@link CodeBlock} into compilable TypeScript source.
 *
 * - **`raw` mode**: returns the code verbatim.
 * - **`stubs` mode**: prepends {@link STUBS} and any custom stub declarations.
 * - **`default` / `stubs` mode with top-level `yield*`**: separates import lines
 *   from the body, adds `import { Effect } from "effect"` if needed, and wraps
 *   the body in `Effect.gen(function* () { ... })`.
 *
 * @param block - The code block to generate source for.
 * @returns Ready-to-write TypeScript source string.
 */
const generateCode = (block: CodeBlock): string => {
  if (block.mode === "raw") return block.code;

  let code = normalizeYieldStar(block.code);

  if (block.mode === "stubs") {
    code =
      `// __VERIFY_STUBS_START__
${STUBS}// __VERIFY_STUBS_END__

` + code;
    if (block.customStubs) {
      code =
        `// __VERIFY_CUSTOM_STUBS_START__
${block.customStubs}
// __VERIFY_CUSTOM_STUBS_END__

` + code;
    }
  }

  if (needsEffectGenWrap(block.code)) {
    // Separate imports from body so imports stay at module top-level.
    // Stubs sections (between __VERIFY_*_STUBS_START__ / __VERIFY_*_STUBS_END__)
    // are also kept at module top-level: `declare` is only valid at module
    // scope, and stub declarations must be visible to the wrapped body.
    const importLines: string[] = [];
    const stubLines: string[] = [];
    const bodyLines: string[] = [];
    let inStubsSection = false;
    for (const line of code.split("\n")) {
      if (/^import\s/.test(line)) {
        importLines.push(line);
        continue;
      }
      if (
        line.includes("__VERIFY_STUBS_START__") ||
        line.includes("__VERIFY_CUSTOM_STUBS_START__")
      ) {
        inStubsSection = true;
        stubLines.push(line);
        continue;
      }
      if (line.includes("__VERIFY_STUBS_END__") || line.includes("__VERIFY_CUSTOM_STUBS_END__")) {
        inStubsSection = false;
        stubLines.push(line);
        continue;
      }
      if (inStubsSection) {
        stubLines.push(line);
      } else {
        bodyLines.push(line);
      }
    }
    const effectImport = importLines.some((l) => l.includes('"effect"'))
      ? ""
      : '// __VERIFY_AUTO_IMPORT__\nimport { Effect } from "effect";\n';
    code = `${effectImport}${importLines.join("\n")}${Arr.isReadonlyArrayNonEmpty(importLines) ? "\n\n" : ""}${stubLines.join("\n")}\n// __VERIFY_WRAP_START__\nconst __docExample = Effect.gen(function* () {\n${bodyLines.join("\n")}\n});\n// __VERIFY_WRAP_END__`;
  }

  return code;
};

/** Sanitize a string for use as a filesystem path component. */
const sanitizePathPart = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, "_");

/**
 * Generate a unique `.ts` filename for a code block, encoding the source file,
 * block index, and line number for easy identification in type-check output.
 */
const generatedFileName = (block: CodeBlock): string => {
  const source = sanitizePathPart(block.file.replace(/\.md$/, ""));
  return `${source}-block-${block.index}-line-${block.line}.ts`;
};

// =============================================================================
// Filesystem + Typecheck
// =============================================================================

/**
 * Recreate the temporary verify directory and write every code block to its
 * own generated `.ts` file plus a `tsconfig.json` that includes them all.
 *
 * Uses `Effect.acquireRelease` so the `.tmp/docs-verify` directory is removed
 * on success, failure, or interruption — leaving no artifacts behind.
 *
 * @returns The list of {@link WrittenBlock}s pointing to the generated files.
 */
const prepareVerifyDirectory = (
  blocks: readonly CodeBlock[],
): Effect.Effect<
  WrittenBlock[],
  ExtractionError,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      yield* fs.remove(VERIFY_DIR, { recursive: true }).pipe(Effect.ignore);
      yield* fs.makeDirectory(VERIFY_DIR, { recursive: true });

      const writtenBlocks: WrittenBlock[] = [];
      for (const block of blocks) {
        const fileName = generatedFileName(block);
        const filePath = path.join(VERIFY_DIR, fileName);
        yield* fs.writeFileString(filePath, generateCode(block));
        writtenBlocks.push({
          block,
          path: filePath,
          relativePath: filePath,
        });
      }

      const include = writtenBlocks.map((written) => `./${path.basename(written.path)}`);
      yield* fs.writeFileString(
        VERIFY_TSCONFIG,
        `${JSON.stringify(
          {
            extends: "../../tsconfig.json",
            compilerOptions: {
              noEmit: true,
              skipLibCheck: true,
              noUnusedLocals: false,
              noUnusedParameters: false,
            },
            include,
          },
          null,
          2,
        )}\n`,
      );

      return writtenBlocks;
    }).pipe(Effect.mapError((cause) => new ExtractionError({ file: VERIFY_DIR, cause }))),
    (_writtenBlocks) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(VERIFY_DIR, { recursive: true }).pipe(Effect.ignore);
      }),
  );

/**
 * Run `pnpm exec tsgo --noEmit -p <tsconfig>` and return the combined stdout/stderr.
 *
 * Wraps the underlying {@link execAndCapture} (which never fails): a non-zero
 * exit code is reified into a {@link TypecheckError} so the caller can branch
 * on success vs failure.
 *
 * @returns The checker output on success.
 * @throws {TypecheckError} when the checker exits non-zero.
 */
const runTypecheck = (): Effect.Effect<
  string,
  TypecheckError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function* () {
    const result = yield* execAndCapture("pnpm", [
      "exec",
      "tsgo",
      "--noEmit",
      "-p",
      VERIFY_TSCONFIG,
    ]);
    const output = result.output.trim();
    if (result.exitCode !== 0) {
      return yield* new TypecheckError({ output });
    }
    return output;
  });

/**
 * Match the file paths in `tsgo` output against generated files to identify
 * which blocks failed type-checking.
 */
const findFailedBlocks = (
  output: string,
  writtenBlocks: readonly WrittenBlock[],
): ReadonlySet<WrittenBlock> => {
  const failed = new Set<WrittenBlock>();
  for (const written of writtenBlocks) {
    if (output.includes(written.relativePath) || output.includes(written.path)) {
      failed.add(written);
    }
  }
  return failed;
};

// =============================================================================
// Format Mode
// =============================================================================

/**
 * Strip formatting markers and synthetic wrapper from a formatted `.ts` file,
 * recovering the original code block content.
 *
 * Reverses {@link generateCode}: removes stub sections, auto-import lines,
 * and `Effect.gen` wrapper, then dedents the body.
 *
 * @param formatted - The formatted TypeScript source (including markers).
 * @param block     - The original code block (needed for mode and import info).
 * @returns The stripped code, ready to write back into the markdown fence.
 */
const stripFormattedCode = (formatted: string, block: CodeBlock): string => {
  if (block.mode === "raw") return formatted;

  let result = formatted;

  // Strip stubs section
  result = result.replace(/\/\/ __VERIFY_STUBS_START__\n[\s\S]*?\/\/ __VERIFY_STUBS_END__\n*/g, "");

  // Strip custom stubs section
  result = result.replace(
    /\/\/ __VERIFY_CUSTOM_STUBS_START__\n[\s\S]*?\/\/ __VERIFY_CUSTOM_STUBS_END__\n*/g,
    "",
  );

  // Check if we have a wrap section
  const wrapMatch = result.match(
    /\/\/ __VERIFY_WRAP_START__\nconst __docExample = Effect\.gen\(function\* \(\) \{\n([\s\S]*?)\}\);\n\/\/ __VERIFY_WRAP_END__/,
  );

  if (wrapMatch) {
    const indentedBody = wrapMatch[1];

    // Dedent by 2 spaces
    const dedented = indentedBody.split("\n").map((line: string) => {
      if (line.startsWith("  ")) return line.slice(2);
      if (line.trim() === "") return "";
      return line;
    });

    // Remove trailing empty lines
    while (Arr.isReadonlyArrayNonEmpty(dedented) && dedented[dedented.length - 1].trim() === "") {
      dedented.pop();
    }

    const body = dedented.join("\n");

    // Remove the wrap section from result, keep imports
    if (wrapMatch.index === undefined) {
      return block.code;
    }
    result = result.slice(0, wrapMatch.index) + result.slice(wrapMatch.index + wrapMatch[0].length);

    // Remove auto-import marker and auto-added Effect import
    result = result.replace(
      /\/\/ __VERIFY_AUTO_IMPORT__\nimport \{ Effect \} from "effect";\n*/g,
      "",
    );

    // Remove any remaining marker comments
    result = result.replace(/\/\/ __VERIFY_\w+__\n?/g, "");

    // Clean up: collect import lines, then body
    const importLines = result
      .split("\n")
      .filter((l: string) => l.startsWith("import ") || l.trim() !== "")
      .filter((l: string) => l.startsWith("import ") || l !== "");
    const meaningfulImports = importLines.filter((l: string) => l.startsWith("import "));

    if (Arr.isReadonlyArrayNonEmpty(meaningfulImports)) {
      return meaningfulImports.join("\n") + "\n\n" + body;
    }
    return body;
  }

  // No wrap — just strip markers and auto-import
  result = result.replace(
    /\/\/ __VERIFY_AUTO_IMPORT__\nimport \{ Effect \} from "effect";\n*/g,
    "",
  );
  result = result.replace(/\/\/ __VERIFY_\w+__\n?/g, "");

  // Clean trailing blank lines
  return result.replace(/\n+$/, "");
};

/**
 * Run `oxfmt` on all generated `.ts` files in the verify directory.
 *
 * Wraps the underlying {@link execAndCapture} (which never fails): a non-zero
 * exit code is reified into a {@link FormatError}.
 *
 * @throws {FormatError} when the formatter exits non-zero.
 */
const runFormatter = (): Effect.Effect<
  void,
  FormatError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function* () {
    const result = yield* execAndCapture("pnpm", ["exec", "oxfmt", VERIFY_DIR, "--write"]);
    if (result.exitCode !== 0) {
      return yield* new FormatError({ output: result.output.trim() });
    }
  });

/**
 * Replace TypeScript code blocks in a markdown source string with new content.
 *
 * Identifies blocks by their `startOffset` (character position of the opening
 * fence) and replaces the code inside each fence with the corresponding value.
 *
 * @param markdown    - Original markdown source.
 * @param replacements - Map from startOffset → new code content.
 * @returns Updated markdown source.
 */
const replaceBlocksInMarkdown = (
  markdown: string,
  replacements: ReadonlyMap<number, string>,
): string => {
  const result: string[] = [];
  let lastIndex = 0;
  const pattern = /```(?:typescript|ts)\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    const offset = match.index;
    const code = match[1];
    if (code === undefined) {
      result.push(match[0]);
      lastIndex = offset + match[0].length;
      continue;
    }

    // Push text before this block
    result.push(markdown.slice(lastIndex, offset));

    const newCode = replacements.get(offset);
    if (newCode !== undefined) {
      // Find the fence prefix (```typescript or ```ts)
      const fenceEnd = match[0].indexOf(code);
      const fence = match[0].slice(0, fenceEnd);
      result.push(fence + newCode + "\n```");
    } else {
      result.push(match[0]);
    }

    lastIndex = offset + match[0].length;
  }

  // Push remaining text
  result.push(markdown.slice(lastIndex));

  return result.join("");
};

/**
 * Format program: extract code blocks, wrap them with stubs/generator markers,
 * run `oxfmt` on the generated files, strip markers back out, and write the
 * formatted code back into the original markdown files.
 *
 * `verify:ignore` blocks are processed separately: they are not written to the
 * temp directory, not run through `oxfmt`, and not given stubs/wrappers —
 * they are simply normalised (`yield *` → `yield*`) and written back, so
 * author-controlled formatting is preserved while the canonical `yield*`
 * spelling is enforced everywhere.
 *
 * @param files   - Markdown file paths to format.
 * @param verbose - When `true`, also log per-file progress (block counts and
 *                  per-file "Updated <path>" messages). Defaults to `false`
 *                  for terse, summary-only output.
 */
const formatProgram = (files: readonly string[], verbose: boolean = false) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Group blocks by source file so we can write back per-file
    const fileBlocks = new Map<string, CodeBlock[]>();

    for (const file of files) {
      const content = yield* fs
        .readFileString(file)
        .pipe(Effect.mapError((cause) => new ExtractionError({ file, cause })));
      const blocks = extractCodeBlocks(content, file);
      fileBlocks.set(file, blocks);
      if (verbose) {
        const ignored = blocks.filter((b) => b.mode === "ignore").length;
        yield* Console.log(
          `Found ${blocks.length} code blocks in ${file}` +
            (ignored > 0 ? ` (${ignored} ignored)` : ""),
        );
      }
    }

    const allBlocks = [...fileBlocks.values()].flat();
    const formatable = allBlocks.filter((b) => b.mode !== "ignore");

    if (Arr.isReadonlyArrayEmpty(formatable) && Arr.isReadonlyArrayEmpty(allBlocks)) {
      yield* Console.log("No code blocks found.");
      return;
    }

    // Write generated files (with markers) — only for non-ignored blocks.
    // Ignored blocks are normalised in a separate pass below.
    yield* fs.remove(VERIFY_DIR, { recursive: true }).pipe(Effect.ignore);
    yield* fs.makeDirectory(VERIFY_DIR, { recursive: true });

    const written: WrittenBlock[] = [];
    for (const block of formatable) {
      const fileName = generatedFileName(block);
      const filePath = path.join(VERIFY_DIR, fileName);
      yield* fs.writeFileString(filePath, generateCode(block));
      written.push({ block, path: filePath, relativePath: filePath });
    }

    yield* Console.log(`Wrote ${written.length} files to ${VERIFY_DIR}.`);

    // Run oxfmt
    if (Arr.isReadonlyArrayNonEmpty(written)) {
      yield* runFormatter();
      yield* Console.log("Formatted generated files.");
    }

    // Read back formatted files and strip markers.
    // The map is keyed by `${file}:${offset}` rather than just `offset`
    // because the offsets are file-local: two unrelated files can easily
    // share the same character position (e.g. both have a `verify:ignore`
    // block as their first content after a 674-char preamble), and a
    // global offset-only map would let one file silently overwrite
    // another's code block.
    const blockFormatting = new Map<string, string>();
    const blockKey = (file: string, offset: number): string => `${file}::${offset}`;

    for (const w of written) {
      const filePath = w.path;
      const formatted = yield* fs
        .readFileString(filePath)
        .pipe(Effect.mapError((cause) => new ExtractionError({ file: filePath, cause })));
      const stripped = stripFormattedCode(formatted, w.block);
      blockFormatting.set(blockKey(w.block.file, w.block.startOffset), stripped);
    }

    // For `verify:ignore` blocks, apply only the `yield *` → `yield*`
    // normalisation. No stubs, no wrap, no `oxfmt` — author formatting wins.
    // The captured `code` from the extraction regex retains the trailing
    // `\n` before the closing fence, so we strip it here to match the
    // invariant that replacements are newline-free (cf. stripFormattedCode).
    for (const block of allBlocks) {
      if (block.mode === "ignore") {
        const normalized = normalizeYieldStar(block.code).replace(/\n+$/, "");
        if (normalized !== block.code.replace(/\n+$/, "")) {
          blockFormatting.set(blockKey(block.file, block.startOffset), normalized);
        }
      }
    }

    // Write back to markdown files
    for (const [file, blocks] of fileBlocks) {
      const content = yield* fs
        .readFileString(file)
        .pipe(Effect.mapError((cause) => new ExtractionError({ file, cause })));

      // Build replacements map (indices are local to the current file)
      const replacements = new Map<number, string>();
      for (const block of blocks) {
        const stripped = blockFormatting.get(blockKey(block.file, block.startOffset));
        if (stripped !== undefined) {
          replacements.set(block.startOffset, stripped);
        }
      }

      const updated = replaceBlocksInMarkdown(content, replacements);
      yield* fs.writeFileString(file, updated);
      if (verbose) {
        yield* Console.log(`Updated ${file}.`);
      }
    }

    // Clean up temp directory
    yield* fs.remove(VERIFY_DIR, { recursive: true }).pipe(Effect.ignore);

    yield* Console.log("\nAll code blocks formatted! ✅");
  });

// =============================================================================
// Main Program
// =============================================================================

/**
 * Main verification program: extract code blocks from each markdown file,
 * write them to the verify directory, run the TypeScript checker, and report
 * per-block results. Fails with {@link VerificationFailedError} or
 * {@link TypecheckError} if any block does not type-check.
 *
 * @param files   - Markdown file paths to verify.
 * @param verbose - When `true`, also log per-block pass/fail status (one
 *                  line per block, e.g. `✅ Block 1 at docs/foo.md:42`).
 *                  Defaults to `false` for terse, summary-only output.
 *                  The summary lines and the failure diagnostics
 *                  (`TypeScript output:`, `Failed blocks:`) are always
 *                  printed regardless of `verbose`.
 */
const program = (files: readonly string[], verbose: boolean = false) =>
  Effect.gen(function* () {
    const allBlocks: CodeBlock[] = [];
    for (const file of files) {
      const fs = yield* FileSystem.FileSystem;
      const content = yield* fs
        .readFileString(file)
        .pipe(Effect.mapError((cause) => new ExtractionError({ file, cause })));
      allBlocks.push(...extractCodeBlocks(content, file));
    }

    // `verify:ignore` blocks are intentionally not type-checked; they show
    // pseudocode or partial snippets that depend on undeclared locals.
    const typecheckable = allBlocks.filter((b) => b.mode !== "ignore");
    const ignoredCount = allBlocks.length - typecheckable.length;

    yield* Console.log(
      `Found ${typecheckable.length} code blocks in ${files.length} files.` +
        (ignoredCount > 0 ? ` (${ignoredCount} ignored)` : ""),
    );

    const writtenBlocks = yield* prepareVerifyDirectory(typecheckable);
    yield* Console.log(`Wrote generated files to ${VERIFY_DIR}.`);

    const typecheck = yield* Effect.result(runTypecheck());

    const output = Result.isFailure(typecheck) ? typecheck.failure.output : typecheck.success;
    const failedBlocks: ReadonlySet<WrittenBlock> = Result.isFailure(typecheck)
      ? findFailedBlocks(output, writtenBlocks)
      : new Set();

    const sortedBlocks = [...writtenBlocks].sort((a, b) =>
      a.block.file === b.block.file
        ? a.block.line - b.block.line
        : a.block.file.localeCompare(b.block.file),
    );

    for (const written of sortedBlocks) {
      const passed = !failedBlocks.has(written);
      const status = passed ? "✅" : "❌";
      const location = `${written.block.file}:${written.block.line}`;
      if (verbose) {
        yield* Console.log(`${status} Block ${written.block.index} at ${location}`);
      }
    }

    const passed = writtenBlocks.length - failedBlocks.size;
    const failedLocations = [...failedBlocks].map(
      (written) => `${written.block.file}:${written.block.line}`,
    );

    yield* Console.log("\n================================");
    yield* Console.log(`Passed: ${passed}`);
    yield* Console.log(`Failed: ${failedBlocks.size}`);

    if (Result.isFailure(typecheck)) {
      yield* Console.log("\nTypeScript output:");
      yield* Console.log(output);
    }

    if (failedBlocks.size > 0) {
      yield* Console.log("\nFailed blocks:");
      for (const loc of failedLocations) {
        yield* Console.log(`  - ${loc}`);
      }
      return yield* new VerificationFailedError({
        count: failedBlocks.size,
        failed: failedLocations,
      });
    }

    if (Result.isFailure(typecheck)) {
      return yield* new TypecheckError({ output });
    }

    yield* Console.log("\nAll code blocks passed! ✅");
  });

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Recursively find all markdown files under `currentDir`.
 *
 * Wraps the underlying {@link walkEntries} (which returns `PlatformError`):
 * the error is reified into {@link ExtractionError} for caller-side context.
 */
const findMarkdownFiles = (
  currentDir: string,
): Effect.Effect<readonly string[], ExtractionError, FileSystem.FileSystem | Path.Path> =>
  walkEntries(currentDir, {
    filter: (entry) => Effect.succeed(entry.type === "file" && entry.name.endsWith(".md")),
  }).pipe(
    Effect.map((entries) => entries.map((e) => e.path)),
    Effect.mapError((cause) => new ExtractionError({ file: currentDir, cause })),
  );

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * CLI entry point. Reads file paths from `process.argv`; if none are provided,
 * verifies all markdown files in the docs directory. Exits with status 1 if any block
 * fails to type-check.
 *
 * Supported flags:
 *
 * - `--format`   Format code blocks instead of type-checking.
 * - `--verbose`  Also print per-block (`✅ Block N at file:line`) and per-file
 *                (`Found N code blocks in <file>`, `Updated <file>.`) progress
 *                lines. By default only summary lines are emitted.
 */
const args = process.argv.slice(2);
const isFormat = args.includes("--format");
const verbose = args.includes("--verbose");
const filePaths = args.filter((a) => a !== "--format" && a !== "--verbose");

// Markdown files verified by default (`pnpm docs:typecheck`, `pnpm docs:format`).
// Root README + every package README + the examples README. `docs/` is walked
// recursively and appended to this list. Keep this list narrow — these are the
// docs that ship on npm and GitHub; drift here hits every consumer first.
const defaultFilePaths = [
  "README.md",
  "examples/README.md",
  "packages/browser/README.md",
  "packages/browser-cdp/README.md",
  "packages/browser-playwright/README.md",
  "packages/browser-stagehand/README.md",
  "packages/browser-providers/README.md",
  "packages/cloudflare-playwright/README.md",
];

const run = () =>
  Effect.gen(function* () {
    const files = Arr.isReadonlyArrayNonEmpty(filePaths)
      ? filePaths
      : yield* findMarkdownFiles("docs").pipe(
          Effect.map((arr) => [...defaultFilePaths, ...arr].sort()),
        );

    if (isFormat) {
      yield* formatProgram(files, verbose);
    } else {
      yield* program(files, verbose);
    }
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped);

Effect.runPromise(run()).catch(() => process.exit(1));
