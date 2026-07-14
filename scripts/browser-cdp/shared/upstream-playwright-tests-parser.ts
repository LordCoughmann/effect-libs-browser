/**
 * Shared parser for test definitions in upstream Playwright spec files.
 *
 * Reads an upstream `*.spec.ts` file's content and returns the test
 * definitions inside it (name + file + line). Expands `for...of`
 * template-literal test names into one entry per loop value (e.g.,
 * `route.${method} should throw` with `method=['fulfill', 'continue']`
 * becomes two entries).
 *
 * Used by:
 *   - generate-parity-snapshot.ts (parity coverage analysis)
 *   - generate-parity-not-planned.ts (NOT_PLANNED skip marker generation)
 */

import { Option } from "effect";
import * as Arr from "effect/Array";

// =============================================================================
// Public types
// =============================================================================

export interface UpstreamTest {
  readonly name: string;
  readonly file: string;
  readonly line: number;
}

// =============================================================================
// Public regex
// =============================================================================

/** Matches `it()` / `test()` definitions in Playwright spec files. */
export const UPSTREAM_TEST_RE =
  /^\s*(?:it\.skip|it\.fixme|it|test\.skip|test\.fixme|test)\s*\(\s*(['"`])(.*?)\1/u;

/**
 * Strips `@smoke` / `@slow` / `@fail` tags from test names.
 *
 * Used by both the upstream parser (to normalize upstream names) and the
 * local test parser (to strip tags from CDP test declarations so they
 * match the upstream names). Exported so consumers stay in sync.
 */
export const TAG_RE = /\s*@(?:smoke|slow|fail)\s*/g;

// =============================================================================
// For-Loop Template Literal Expansion
// =============================================================================

/** Regex to detect for-of loops with inline array literals. */
const FOR_OF_LOOP_RE = /for\s*\(\s*(?:const|let|var)\s+(\w+)\s+of\s+\[([^\]]+)\]/;

/** Regex to detect template literal interpolation like `${method}` */
const TEMPLATE_INTERPOLATION_RE = /\$\{(\w+)\}/g;

/**
 * Extracts string values from an array literal string like
 * `'fulfill', 'continue', 'fallback', 'abort'`. Handles both single
 * and double quoted strings, with optional `as const` suffix.
 */
const extractArrayValues = (arrayContent: string): readonly string[] => {
  const values: string[] = [];
  const stringRe = /['"]([^'"]+)['"](?:\s*as\s+const)?/g;
  let match;
  while ((match = stringRe.exec(arrayContent)) !== null) {
    values.push(match[1]);
  }
  return values;
};

/**
 * Expands a template literal test name by substituting each value from the loop array.
 * E.g., `route.${method} should throw` with method=['fulfill', 'continue']
 * becomes ['route.fulfill should throw', 'route.continue should throw']
 */
const expandTemplateName = (
  testName: string,
  loopVar: string,
  values: readonly string[],
): readonly string[] =>
  values.map((value) => testName.replace(new RegExp(`\\$\\{${loopVar}\\}`, "g"), value));

/**
 * Looks backward from a test line to find the for-loop that defines a given variable.
 * Returns the array values if found, or undefined.
 */
const findForLoopValues = (
  lines: readonly string[],
  testLineIndex: number,
  loopVar: string,
): Option.Option<readonly string[]> => {
  const maxLookBack = 10; // typical for-loop is within a few lines above
  for (let j = testLineIndex - 1; j >= Math.max(0, testLineIndex - maxLookBack); j--) {
    const prevLine = lines[j];
    const forMatch = prevLine.match(FOR_OF_LOOP_RE);
    if (forMatch && forMatch[1] === loopVar) {
      const arrayContent = forMatch[2];
      const values = extractArrayValues(arrayContent);
      if (Arr.isReadonlyArrayNonEmpty(values)) return Option.some(values);
    }
    // Stop at boundaries that indicate we've left the for-loop scope
    if (prevLine.match(/^\s*it\(|^\s*function|^\s*async\s+\w|^\s*}\s*$/)) {
      break;
    }
  }
  return Option.none();
};

// =============================================================================
// Public parser
// =============================================================================

/**
 * Parse the test definitions out of an upstream Playwright spec file's content.
 *
 * Expands `for...of` template-literal test names into one entry per loop value.
 * Strips `@smoke` / `@slow` / `@fail` tags from test names so consumers can
 * match upstream names verbatim against local declarations.
 */
export const parseUpstreamTests = (content: string, fileName: string): readonly UpstreamTest[] => {
  const lines = content.split("\n");
  const results: UpstreamTest[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(UPSTREAM_TEST_RE);
    if (match?.[2]) {
      const rawName = match[2].replace(TAG_RE, "").trim();

      // Check for template literal interpolation (e.g., `route.${method} should throw`)
      const interpolationMatches = rawName.matchAll(TEMPLATE_INTERPOLATION_RE);
      const interpolations = Array.from(interpolationMatches);

      if (Arr.isReadonlyArrayNonEmpty(interpolations)) {
        // Template literal with interpolation - look backward for for-loop
        // Note: we only handle single-variable interpolation (most for-loops use one loop var)
        const loopVar = interpolations[0][1];
        const valuesOpt = findForLoopValues(lines, i, loopVar);

        if (Option.isSome(valuesOpt)) {
          // Expand: generate test names for each array value
          const expandedNames = expandTemplateName(rawName, loopVar, valuesOpt.value);
          for (const name of expandedNames) {
            results.push({ name, file: fileName, line: i + 1 });
          }
        } else {
          // No for-loop found nearby - keep template literal as-is (might be a different pattern)
          results.push({ name: rawName, file: fileName, line: i + 1 });
        }
      } else {
        // Regular test name, no interpolation
        results.push({ name: rawName, file: fileName, line: i + 1 });
      }
    }
  }

  return results;
};
