/**
 * Declarative CLI output primitives.
 *
 * Why this exists
 * ───────────────
 * Scripts across this repo build terminal output with hand-rolled `lines.push`
 * or string concatenation. That style scales poorly:
 *   - Imperative accumulation hides the output's *structure*.
 *   - Reusable pieces (banners, separators, indented blocks) get copy-pasted.
 *   - Adding color, word-wrap, or alternate renderers means rewriting every
 *     call site.
 *
 * This module provides a small structural AST (`Block`) and a single renderer.
 * Scripts compose output as data (declarative) and let `render` turn it into
 * a string at the edge. Renderers are swappable in one place.
 *
 * Design notes
 * ────────────
 * - `Block` is a `Data.TaggedEnum` with structural variants only
 *   (`Line`, `Rule`, `Indented`). Domain knowledge (e.g. "a failure block",
 *   "a banner") lives in the calling script — the AST is intentionally
 *   domain-agnostic so it can serve all four formatting sites in `scripts/`.
 *   Blank lines are `Block.Line({ text: "" })` — no separate variant needed.
 * - `Section = ReadonlyArray<Block>` is a composable unit. Scripts build
 *   sections via array spread; `concatSections` is a convenience for the
 *   variadic case.
 * - `render` returns a string. The caller decides how to emit it (`Console.log`,
 *   `Console.error`, etc.). Keeping render I/O-free means the module is
 *   trivially testable and doesn't couple to any particular Effect runtime.
 *
 * Example
 * ───────
 *   const section: Section = [
 *     Block.Rule({ char: "=", width: 32 }),
 *     Block.Line({ text: "Passed: 12" }),
 *     Block.Line({ text: "Failed: 0" }),
 *     Block.Line({ text: "" }),
 *     Block.Line({ text: "All examples passed! ✅" }),
 *   ]
 *   Console.log(render(section))
 */

import { Data, Match } from "effect";

// =============================================================================
// Block AST
// =============================================================================

/**
 * A single renderable unit of terminal output.
 *
 * Structural variants only — no domain knowledge. Add a domain-specific shape
 * (e.g. `Failure`, `Banner`) at the call site by composing these primitives.
 */
export type Block = Data.TaggedEnum<{
  /** A single line of text. No trailing newline. Use `text: ""` for blank lines. */
  Line: { readonly text: string };
  /** A horizontal rule: `char.repeat(width)`. */
  Rule: { readonly char: string; readonly width: number };
  /**
   * A multi-line block, indented by `level` spaces per line.
   * Internal newlines are preserved; each line gets the indent prefix.
   */
  Indented: { readonly text: string; readonly level: number };
}>;

/** Constructors and matchers for {@link Block}. */
export const Block = Data.taggedEnum<Block>();

/** A composable group of blocks. */
export type Section = ReadonlyArray<Block>;

// =============================================================================
// Render
// =============================================================================

/** Render a single {@link Block} to its string form (no trailing newline). */
const renderBlock = (block: Block): string =>
  Match.value(block).pipe(
    Match.tag("Line", ({ text }) => text),
    Match.tag("Rule", ({ char, width }) => char.repeat(width)),
    Match.tag("Indented", ({ text, level }) =>
      text
        .split("\n")
        .map((line) => " ".repeat(level) + line)
        .join("\n"),
    ),
    Match.exhaustive,
  );

/**
 * Render a {@link Section} as a single newline-joined string.
 *
 * No trailing newline. Callers using `Console.log`/`Console.error` get the
 * trailing newline from `Console` itself.
 */
export const render = (section: Section): string => section.map(renderBlock).join("\n");

// =============================================================================
// Composition
// =============================================================================

/** Concatenate sections left-to-right. Equivalent to `sections.flat()`. */
export const concatSections = (...sections: ReadonlyArray<Section>): Section => sections.flat();
