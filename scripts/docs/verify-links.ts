/**
 * Verify that internal markdown links resolve to existing files and anchors.
 *
 * Walks the markdown files covered by `docs:typecheck` / `docs:format` plus
 * everything under `docs/`. Parses each file with `remark-parse` + `remark-gfm`,
 * walks every `link` and `image` node, and validates:
 *
 * - **Relative file paths** resolve to an existing file in the repo.
 * - **`#anchor` fragments** match a slugified heading in the target file.
 *
 * External links (`http://`, `https://`, `mailto:`, etc.) and same-page anchors
 * (`#foo`) are skipped. Relative paths that strip the fragment but still point
 * at a non-existent file are reported as broken — no special cases.
 *
 * The walk visits every `link` and `image` node, which covers the common
 * forms as well as image and link references (mdast normalizes them to those
 * types). Autolinks (`<https://...>`) are external by definition and skipped.
 *
 * ## Usage
 *
 * ```sh
 * # Verify default doc files (root + packages READMEs + every .md under docs/)
 * pnpm docs:check-links
 *
 * # Verify specific files
 * pnpm tsx scripts/docs/verify-links.ts docs/guides/my-guide.md
 *
 * # Verbose: print per-file status lines
 * pnpm tsx scripts/docs/verify-links.ts --verbose
 * ```
 *
 * By default the script prints only summary lines (count of checked links,
 * count of failures, and the broken-link list when there are any). Pass
 * `--verbose` to also emit per-file progress lines (`✓ <file>` /
 * `✗ <file> — <N> broken`).
 */

import type { Path } from "effect";
import type { PlatformError } from "effect/PlatformError";

import { NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Schema } from "effect";
import * as Arr from "effect/Array";
import GithubSlugger from "github-slugger";
import { toString as nodeToString } from "mdast-util-to-string";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import { walkEntries } from "../shared/FileWalker.js";

// =============================================================================
// Errors
// =============================================================================

/** Thrown when one or more links fail validation. */
class LinkVerificationError extends Schema.TaggedErrorClass<LinkVerificationError>()(
  "scripts/LinkVerificationError",
  Schema.Struct({
    count: Schema.Finite,
    failures: Schema.Array(
      Schema.Struct({
        file: Schema.String,
        line: Schema.Finite,
        url: Schema.String,
        reason: Schema.String,
      }),
    ),
  }),
) {}

// =============================================================================
// Types
// =============================================================================

/**
 * A single broken link or image, with enough context to locate and fix it.
 *
 * @property file   - Source markdown file (relative to repo root).
 * @property line   - One-based line in the source file.
 * @property url    - The original link target as it appears in the markdown.
 * @property reason - Human-readable explanation of the failure.
 */
interface LinkFailure {
  readonly file: string;
  readonly line: number;
  readonly url: string;
  readonly reason: string;
}

/** A `link` or `image` node from `mdast`. We only need the fields we use. */
interface LinkLike {
  readonly type: "link" | "image";
  readonly url: string;
  readonly position?: { readonly start: { readonly line: number } };
}

// =============================================================================
// Constants
// =============================================================================

/** Pattern matching absolute URLs with a scheme: `http:`, `https:`, `mailto:`, etc. */
const URLISH = /^[a-z][a-z0-9+.-]*:/i;

/** Pattern matching protocol-relative URLs (`//example.com/...`). */
const PROTOCOL_RELATIVE = /^\/\//;

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Recursively find all markdown files under `currentDir`.
 */
const findMarkdownFiles = (
  currentDir: string,
): Effect.Effect<readonly string[], PlatformError, FileSystem.FileSystem | Path.Path> =>
  walkEntries(currentDir, {
    filter: (entry) => Effect.succeed(entry.type === "file" && entry.name.endsWith(".md")),
  }).pipe(Effect.map((entries) => entries.map((e) => e.path)));

// =============================================================================
// Anchor Slugification
// =============================================================================

/**
 * Build a set of heading slugs for a markdown source. Uses `github-slugger`,
 * which mostly matches GitHub's heading rendering — with one correction:
 * GitHub strips leading numeric prefixes (`3. Foo` → `foo`), but
 * `github-slugger` keeps them (`3-foo`). Match GitHub's behavior here so
 * `#retry-on-isretryable` resolves when the heading is
 * `### 3. Retry on \`isRetryable\``. The slugger maintains state across calls
 * (incrementing duplicates with `-1`, `-2`, etc.), so it's instantiated once
 * per call.
 */
const collectHeadingSlugs = (source: string): Set<string> => {
  const slugger = new GithubSlugger();
  const slugs = new Set<string>();
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source);
  visit(tree, "heading", (node) => {
    // GitHub strips leading digits, dots, whitespace, and hyphens; github-slugger
    // doesn't. Strip them manually first so the resulting slug matches what a
    // reader copying the URL anchor out of the GitHub UI would get.
    const text = nodeToString(node).replace(/^[\s\d.-]+/, "");
    slugs.add(slugger.slug(text));
  });
  return slugs;
};

// =============================================================================
// Link Validation
// =============================================================================

/**
 * Validate every relative link/image in a markdown file. External URLs and
 * same-page anchors are skipped.
 *
 * Returns a list of {@link LinkFailure}. The source file is parsed once for
 * the manual walk; `remark-validate-links` is then run separately to catch
 * anything the walker misses (autolinks, image references, etc.).
 */
const checkFileLinks = (file: string, source: string): readonly LinkFailure[] => {
  const failures: LinkFailure[] = [];
  const fileDir = dirname(file);

  // --- Manual walk: file existence + anchor validation -------------------------
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source);
  visit(tree, "link", (node) => checkLink(node, file, fileDir, failures));
  visit(tree, "image", (node) => checkLink(node, file, fileDir, failures));

  return failures;
};

/**
 * Check a single link or image node. External URLs and same-page anchors are
 * skipped. Pushes {@link LinkFailure} entries into `failures` for missing
 * targets or unknown anchors.
 */
const checkLink = (
  node: LinkLike,
  file: string,
  fileDir: string,
  failures: LinkFailure[],
): void => {
  const url = node.url;
  const line = node.position?.start.line ?? 0;
  if (!url) return;

  // External or protocol-relative — skip.
  if (URLISH.test(url) || PROTOCOL_RELATIVE.test(url)) return;

  // Split off the fragment.
  const hashIdx = url.indexOf("#");
  const linkPath = hashIdx === -1 ? url : url.slice(0, hashIdx);
  const anchor = hashIdx === -1 ? null : url.slice(hashIdx + 1);

  // Same-page anchor (`#foo`) — skip.
  if (linkPath === "" && anchor !== null) return;

  // Resolve relative path against the file's directory.
  const resolvedPath = linkPath === "" ? file : resolve(fileDir, linkPath);

  if (!existsSync(resolvedPath)) {
    failures.push({ file, line, url, reason: "file not found" });
    return;
  }

  if (anchor !== null) {
    const targetSource = readFileSync(resolvedPath, "utf8");
    const targetSlugs = collectHeadingSlugs(targetSource);
    if (!targetSlugs.has(anchor)) {
      failures.push({
        file,
        line,
        url,
        reason: `anchor "#${anchor}" not found in ${linkPath === "" ? file : linkPath}`,
      });
    }
  }
};

// =============================================================================
// Main Program
// =============================================================================

/**
 * Verify links across the given file list. Exits the Effect with a
 * {@link LinkVerificationError} if any links fail; otherwise prints a
 * success summary.
 */
const program = (files: readonly string[], verbose: boolean = false) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    let totalLinks = 0;
    const failures: LinkFailure[] = [];

    for (const file of files) {
      const source = yield* fs.readFileString(file);
      const fileFailures = checkFileLinks(file, source);
      totalLinks += countLinks(source);
      failures.push(...fileFailures);
      if (verbose) {
        if (Arr.isReadonlyArrayEmpty(fileFailures)) {
          yield* Console.log(`✓ ${file}`);
        } else {
          yield* Console.log(`✗ ${file} — ${fileFailures.length} broken`);
        }
      }
    }

    const totalBroken = failures.length;
    yield* Console.log("");
    yield* Console.log("================================");
    yield* Console.log(`Checked: ${totalLinks} links`);
    yield* Console.log(`Failed: ${totalBroken}`);

    if (totalBroken > 0) {
      yield* Console.log("");
      yield* Console.log("Broken links:");
      for (const f of failures) {
        yield* Console.log(`  ${f.file}:${f.line}  ${f.url}  — ${f.reason}`);
      }
      return yield* new LinkVerificationError({ count: totalBroken, failures });
    }

    yield* Console.log("");
    yield* Console.log("All links passed! ✅");
  });

/** Count the number of `link` and `image` nodes in a markdown source. */
const countLinks = (source: string): number => {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source);
  let count = 0;
  visit(tree, (node: { type?: string }) => {
    if (node.type === "link" || node.type === "image") count++;
  });
  return count;
};

// =============================================================================
// CLI Entry Point
// =============================================================================

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const filePaths = args.filter((a) => a !== "--verbose");

// Same default-file set as `verify-examples.ts`. These are the docs that ship
// on npm and GitHub; drift here hits every consumer first.
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

    yield* program(files, verbose);
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped);

Effect.runPromise(run()).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
