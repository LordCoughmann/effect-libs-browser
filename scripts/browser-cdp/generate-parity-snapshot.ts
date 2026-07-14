/**
 * Generates the CDP parity coverage snapshot.
 *
 * Compares upstream Playwright specs against local CDP test implementations,
 * then emits the coverage snapshot at
 * `docs/contributing/cdp/upstream-integration-test-snapshot.md` (or one of
 * several other formats for ad-hoc analysis).
 *
 * Usage:
 *   pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts [console|json|markdown|generate-skips] [--out <path>]
 *
 * Examples:
 *   pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts                            # console report
 *   pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts json                       # JSON
 *   pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts markdown --out ./report.md # write markdown
 *   pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts --generate-skips           # emit test.skip lines
 *
 */

import { NodeServices } from "@effect/platform-node";
import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  HashMap,
  Option,
  Path,
  Result,
  Stream,
  String,
  pipe,
} from "effect";
import * as Str from "effect/String";

import {
  parseUpstreamTests,
  TAG_RE,
  type UpstreamTest,
} from "./shared/upstream-playwright-tests-parser.js";

// =============================================================================
// Types
// =============================================================================

type TestStatus = "live" | "skip";
type SkipType = "NOT_PLANNED" | "TODO" | "BLOCKED";

interface LocalTest {
  readonly name: string;
  readonly specFile: string;
  readonly file: string;
  readonly line: number;
  readonly status: TestStatus;
  readonly skipType: Option.Option<SkipType>;
  readonly skipReason: Option.Option<string>;
  readonly cdpExtension: Option.Option<string>;
}

interface ParseWarning {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

type CoverageStatus = "covered" | "not_planned" | "todo" | "blocked" | "missing";

interface TestStatusEntry {
  readonly status: CoverageStatus;
  readonly originalName: string;
  readonly skipReason: Option.Option<string>;
}

interface CoverageCounts {
  readonly total: number;
  readonly covered: number;
  readonly skipped: number;
  readonly notPlanned: number;
  readonly todo: number;
  readonly blocked: number;
  readonly missing: readonly string[];
}

interface SpecCoverage {
  readonly upstreamFile: string;
  readonly upstreamTests: readonly UpstreamTest[];
  readonly localTests: readonly LocalTest[];
  readonly counts: CoverageCounts;
  readonly statuses: HashMap.HashMap<string, TestStatusEntry>;
}

type OutputFormat = "console" | "json" | "markdown" | "generate-skips";

// =============================================================================
// Pure Parsing & Analysis
// =============================================================================

const LOCAL_TEST_START_RE = /^\s*test\.(live|skip)\s*\(/;
const LOCAL_TEST_INLINE_RE = /test\.(?:live|skip)\(\s*(['"])(.*?)\1/;
const LOCAL_TEST_NEXT_LINE_RE = /^\s*(['"])(.*?)\1/;
// Allow periods in the spec prefix so filenames like `matchers.misc.spec.ts`
// match (upstream has at least one such spec). The regex still anchors on
// `<specFile>.spec.ts - <testName>` so the period in `.spec.ts` is literal.
const SPEC_PREFIX_RE = /^([a-z0-9.-]+\.spec\.ts) - (.+)$/;
const CDP_EXTENSION_BARE_RE = /^\s*(.+?)\s*\[CDP-EXTENSION:\s*([^\]]+)\]\s*$/;
const TAGS_RE =
  /\s*(?:\[CDP-EXTENSION:\s*([^\]]+)\]|\[SKIP:\s*(NOT_PLANNED|TODO|BLOCKED)\s*-\s*([^\]]+)\])?\s*(?:\[VARIANT:\s*[^\]]+\])?\s*$/;

interface LinePair {
  readonly current: string;
  readonly next: Option.Option<string>;
  readonly lineNumber: number;
}

// -- Declarative Predicates & Extractors --------------------------------------

const isTestDeclarationStart = (line: string): boolean => LOCAL_TEST_START_RE.test(line);

const extractTestStatus = (line: string): Option.Option<TestStatus> => {
  const match = line.match(LOCAL_TEST_START_RE);
  return match?.[1] ? Option.some(match[1] as TestStatus) : Option.none();
};

const extractInlineTestName = (line: string): Option.Option<string> => {
  const match = line.match(LOCAL_TEST_INLINE_RE);
  return match?.[2] ? Option.some(match[2]) : Option.none();
};

const extractNextLineTestName = (line: string): Option.Option<string> => {
  const match = line.match(LOCAL_TEST_NEXT_LINE_RE);
  return match?.[2] ? Option.some(match[2]) : Option.none();
};

const parseSpecPrefix = (
  rawName: string,
): Option.Option<{ readonly specFile: string; readonly testName: string }> => {
  const match = rawName.match(SPEC_PREFIX_RE);
  if (!match?.[1] || !match[2]) return Option.none();
  return Option.some({ specFile: match[1], testName: match[2] });
};

const parseTags = (
  rawName: string,
): {
  readonly cleanName: string;
  readonly skipType: Option.Option<SkipType>;
  readonly skipReason: Option.Option<string>;
  readonly cdpExtension: Option.Option<string>;
} => {
  const match = rawName.match(TAGS_RE);
  // Group 1 = CDP-EXTENSION reason (when present, comes first in the regex)
  // Group 2 = SKIP type
  // Group 3 = SKIP reason
  const cdpExtension = match?.[1] ? Option.some(match[1].trim()) : Option.none();
  const skipType = match?.[2] ? Option.some(match[2] as SkipType) : Option.none();
  const skipReason = match?.[3] ? Option.some(match[3].trim()) : Option.none();
  const cleanName = rawName.replace(TAGS_RE, "").trim();
  return { cleanName, skipType, skipReason, cdpExtension };
};

const isEmptyString = (s: string): boolean => Str.isEmpty(s);

// -- Core Parsing Logic -------------------------------------------------------

/**
 * Attempts to extract a test name from a line pair.
 * Uses early returns instead of nested Option.flatMap for readability.
 */
const extractTestName = (
  pair: LinePair,
): Option.Option<{ readonly name: string; readonly line: number }> => {
  const inlineName = extractInlineTestName(pair.current);
  if (Option.isSome(inlineName)) {
    return Option.some({ name: inlineName.value, line: pair.lineNumber });
  }

  if (Option.isSome(pair.next)) {
    const nextName = extractNextLineTestName(pair.next.value);
    if (Option.isSome(nextName)) {
      return Option.some({ name: nextName.value, line: pair.lineNumber + 1 });
    }
  }

  return Option.none();
};

/**
 * Parses a single line pair into either a valid LocalTest or a ParseWarning.
 * Returns None if the line is not a test declaration at all.
 * Uses early returns for flat, readable control flow.
 */
const parseLinePair = (
  pair: LinePair,
  fileName: string,
): Option.Option<Result.Result<LocalTest, ParseWarning>> => {
  if (!isTestDeclarationStart(pair.current)) return Option.none();

  const statusOpt = extractTestStatus(pair.current);
  if (Option.isNone(statusOpt)) return Option.none();
  const status = statusOpt.value;

  const nameOpt = extractTestName(pair);
  if (Option.isNone(nameOpt)) {
    return Option.some(
      Result.fail({
        file: fileName,
        line: pair.lineNumber,
        message: "Found test.live/skip declaration but could not extract test name",
      }),
    );
  }
  const { name: rawFullName, line } = nameOpt.value;

  // CDP-extension tests use a bare name with [CDP-EXTENSION: reason] tag,
  // not the canonical "<specFile>.spec.ts - <testName>" form. Detect this
  // case before falling back to the malformed-warning path.
  const cdpBareMatch = rawFullName.match(CDP_EXTENSION_BARE_RE);
  if (cdpBareMatch?.[1] && cdpBareMatch[2]) {
    const cleanName = cdpBareMatch[1].trim();
    const cdpReason = cdpBareMatch[2].trim();
    if (isEmptyString(cleanName)) {
      return Option.some(
        Result.fail({
          file: fileName,
          line,
          message: `CDP-extension test name is empty: "${rawFullName}"`,
        }),
      );
    }
    return Option.some(
      Result.succeed({
        name: cleanName,
        specFile: "cdp-extension",
        file: fileName,
        line,
        status,
        skipType: Option.none(),
        skipReason: Option.none(),
        cdpExtension: Option.some(cdpReason),
      }),
    );
  }

  const specPrefixOpt = parseSpecPrefix(rawFullName);
  if (Option.isNone(specPrefixOpt)) {
    return Option.some(
      Result.fail({
        file: fileName,
        line,
        message: `Test name does not match expected "<specFile> - <testName>" format: "${rawFullName}"`,
      }),
    );
  }
  const { specFile, testName: rawTestName } = specPrefixOpt.value;

  // Strip @smoke/@slow/@fail tags from the local test name the same way the
  // upstream parser does, so coverage matching works. Without this, a CDP
  // test named `locator-misc-1.spec.ts - should hover @smoke` never matches
  // the upstream `locator-misc-1.spec.ts - should hover` (the upstream parser
  // strips `@smoke` before the lookup; the local parser kept it).
  const strippedTestName = rawTestName.replace(TAG_RE, "").trim();

  const { cleanName, skipType, skipReason, cdpExtension } = parseTags(strippedTestName);
  if (isEmptyString(cleanName)) {
    return Option.some(
      Result.fail({
        file: fileName,
        line,
        message: `Test name is empty after stripping tags: "${rawFullName}"`,
      }),
    );
  }

  return Option.some(
    Result.succeed({
      name: cleanName,
      specFile,
      file: fileName,
      line,
      status,
      skipType,
      skipReason,
      cdpExtension,
    }),
  );
};

/**
 * Extracts local CDP test definitions from implementation file content.
 * Returns both successfully parsed tests and any parse warnings.
 */
const parseLocalTestFile = (
  content: string,
  fileName: string,
): { readonly tests: readonly LocalTest[]; readonly warnings: readonly ParseWarning[] } => {
  const lines = content.split("\n");

  const pairs: readonly LinePair[] = lines.map((current, i) => ({
    current,
    next: i + 1 < lines.length ? Option.some(lines[i + 1]) : Option.none(),
    lineNumber: i + 1,
  }));

  const tests: LocalTest[] = [];
  const warnings: ParseWarning[] = [];

  for (const pair of pairs) {
    const result = parseLinePair(pair, fileName);
    if (Option.isNone(result)) continue;

    const value = result.value;
    if (Result.isSuccess(value)) {
      tests.push(value.success);
    } else {
      warnings.push(value.failure);
    }
  }

  return { tests, warnings };
};

// -----------------------------------------------------------------------------
// Coverage Analysis
// -----------------------------------------------------------------------------

/** Normalizes test names for fuzzy matching between upstream and local suites. */
const normalizeTestName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/['"`[\]]/g, "'")
    .trim();

/** Computes coverage analysis for a single spec file. */
const analyzeSpecCoverage = (
  upstreamTests: readonly UpstreamTest[],
  allLocalTests: readonly LocalTest[],
  upstreamFile: string,
): SpecCoverage => {
  const relevantLocalTests = allLocalTests.filter((t) => t.specFile === upstreamFile);

  // Declarative lookup map assembly: live tests take priority over skipped ones
  const testLookup = Arr.reduce(
    relevantLocalTests,
    HashMap.empty<string, LocalTest>(),
    (lookup, test) => {
      const key = normalizeTestName(test.name);
      return pipe(
        HashMap.get(lookup, key),
        Option.match({
          onNone: () => HashMap.set(lookup, key, test),
          onSome: (existing) =>
            test.status === "live" && existing.status !== "live"
              ? HashMap.set(lookup, key, test)
              : lookup,
        }),
      );
    },
  );

  // Pure state reduction for total metrics and coverage tracking
  const analysis = Arr.reduce(
    upstreamTests,
    {
      covered: 0,
      skipped: 0,
      notPlanned: 0,
      todo: 0,
      blocked: 0,
      missing: [] as string[],
      statuses: HashMap.empty<string, TestStatusEntry>(),
    },
    (acc, upstream) => {
      const normalized = normalizeTestName(upstream.name);
      return pipe(
        HashMap.get(testLookup, normalized),
        Option.match({
          onNone: () => ({
            ...acc,
            missing: [...acc.missing, upstream.name],
            statuses: HashMap.set(acc.statuses, normalized, {
              status: "missing",
              originalName: upstream.name,
              skipReason: Option.none(),
            }),
          }),
          onSome: (localTest) => {
            if (localTest.status === "live") {
              return {
                ...acc,
                covered: acc.covered + 1,
                statuses: HashMap.set(acc.statuses, normalized, {
                  status: "covered",
                  originalName: upstream.name,
                  skipReason: Option.none(),
                }),
              };
            }

            const skipKind = Option.getOrElse(localTest.skipType, () => "TODO" as SkipType);
            const entryStatus: CoverageStatus =
              skipKind === "NOT_PLANNED"
                ? "not_planned"
                : skipKind === "BLOCKED"
                  ? "blocked"
                  : "todo";

            return {
              ...acc,
              skipped: acc.skipped + 1,
              notPlanned: acc.notPlanned + (skipKind === "NOT_PLANNED" ? 1 : 0),
              blocked: acc.blocked + (skipKind === "BLOCKED" ? 1 : 0),
              todo: acc.todo + (skipKind === "TODO" ? 1 : 0),
              statuses: HashMap.set(acc.statuses, normalized, {
                status: entryStatus,
                originalName: upstream.name,
                skipReason: localTest.skipReason,
              }),
            };
          },
        }),
      );
    },
  );

  return {
    upstreamFile,
    upstreamTests,
    localTests: relevantLocalTests,
    counts: {
      total: upstreamTests.length,
      covered: analysis.covered,
      skipped: analysis.skipped,
      notPlanned: analysis.notPlanned,
      todo: analysis.todo,
      blocked: analysis.blocked,
      missing: analysis.missing,
    },
    statuses: analysis.statuses,
  };
};

// =============================================================================
// Summary Computation
// =============================================================================

interface CoverageSummary {
  readonly totalUpstream: number;
  readonly totalCovered: number;
  readonly totalNotPlanned: number;
  readonly totalTodo: number;
  readonly totalBlocked: number;
  readonly totalMissing: number;
  readonly totalCdpExtensions: number;
  readonly intendedTotal: number;
  readonly intendedPercent: number;
  readonly actualPercent: number;
}

const computeSummary = (
  coverages: readonly SpecCoverage[],
  cdpExtensions: readonly LocalTest[] = [],
): CoverageSummary => {
  const totalUpstream = coverages.reduce((sum, c) => sum + c.counts.total, 0);
  const totalCovered = coverages.reduce((sum, c) => sum + c.counts.covered, 0);
  const totalNotPlanned = coverages.reduce((sum, c) => sum + c.counts.notPlanned, 0);
  const totalTodo = coverages.reduce((sum, c) => sum + c.counts.todo, 0);
  const totalBlocked = coverages.reduce((sum, c) => sum + c.counts.blocked, 0);
  const totalMissing = coverages.reduce((sum, c) => sum + c.counts.missing.length, 0);
  const totalCdpExtensions = cdpExtensions.length;
  const intendedTotal = totalUpstream - totalNotPlanned;

  return {
    totalUpstream,
    totalCovered,
    totalNotPlanned,
    totalTodo,
    totalBlocked,
    totalMissing,
    totalCdpExtensions,
    intendedTotal,
    intendedPercent: intendedTotal > 0 ? Math.round((totalCovered / intendedTotal) * 100) : 0,
    actualPercent: totalUpstream > 0 ? Math.round((totalCovered / totalUpstream) * 100) : 0,
  };
};

// =============================================================================
// Formatters
// =============================================================================

const formatJson = (
  coverages: readonly SpecCoverage[],
  cdpExtensions: readonly LocalTest[] = [],
): string => JSON.stringify({ coverages, cdpExtensions }, null, 2);

const formatConsole = (
  coverages: readonly SpecCoverage[],
  cdpExtensions: readonly LocalTest[] = [],
): string => {
  const summary = computeSummary(coverages, cdpExtensions);
  const lines = [
    "",
    "CDP Test Coverage Report",
    "════════════════════════",
    "",
    `Upstream tests:     ${summary.totalUpstream}`,
    `Covered:            ${summary.totalCovered}`,
    `NOT_PLANNED:        ${summary.totalNotPlanned}`,
    `TODO:               ${summary.totalTodo}`,
    `BLOCKED:            ${summary.totalBlocked}`,
    `Missing:            ${summary.totalMissing}`,
    `CDP-Extensions:     ${summary.totalCdpExtensions}`,
    "",
    `Intended coverage: ${summary.totalCovered}/${summary.intendedTotal} (${summary.intendedPercent}%)`,
    `Actual coverage:   ${summary.totalCovered}/${summary.totalUpstream} (${summary.actualPercent}%)`,
    "",
    "Per-Spec Coverage:",
    "──────────────────",
  ];

  for (const coverage of coverages) {
    const effective = coverage.counts.total - coverage.counts.notPlanned;
    const percent = effective > 0 ? Math.round((coverage.counts.covered / effective) * 100) : 0;
    const emoji = percent === 100 ? "✅" : percent >= 80 ? "🟡" : "🔴";
    // Use `covered/total` as the display denominator (more informative than
    // `effective` when a spec is fully NOT_PLANNED — `effective = 0` produces
    // a confusing `0/0` instead of `0/8`).
    const denomDisplay = coverage.counts.total;
    const display =
      effective === 0 && coverage.counts.total > 0
        ? `${coverage.counts.covered}/${denomDisplay} (all NOT_PLANNED)`
        : `${coverage.counts.covered}/${effective} (${percent}%)`;
    lines.push(`  ${emoji} ${coverage.upstreamFile.padEnd(45)} ${display}`);

    if (
      Arr.isReadonlyArrayNonEmpty(coverage.counts.missing) &&
      coverage.counts.missing.length <= 3
    ) {
      for (const name of coverage.counts.missing) lines.push(`      Missing: ${name}`);
    } else if (coverage.counts.missing.length > 3) {
      lines.push(`      Missing: ${coverage.counts.missing.length} tests`);
    }
  }

  if (Arr.isReadonlyArrayNonEmpty(cdpExtensions)) {
    lines.push("", "CDP-Extension Tests:", "─────────────────────");
    // Group by source file for readability
    const byFile = Arr.reduce(
      cdpExtensions,
      HashMap.empty<string, readonly LocalTest[]>(),
      (acc, t) =>
        pipe(
          HashMap.get(acc, t.file),
          Option.match({
            onNone: () => HashMap.set(acc, t.file, [t]),
            onSome: (existing) => HashMap.set(acc, t.file, [...existing, t]),
          }),
        ),
    );
    const sortedFiles = Arr.sort(HashMap.keys(byFile), String.Order);
    for (const file of sortedFiles) {
      const testsOpt = HashMap.get(byFile, file);
      if (Option.isNone(testsOpt)) continue;
      const tests = testsOpt.value;
      lines.push(`  ${file} (${tests.length})`);
      for (const t of tests) {
        const reason = Option.getOrElse(t.cdpExtension, () => "");
        lines.push(`    - ${t.name} (${reason})`);
      }
    }
  }

  return lines.join("\n");
};

const formatGenerateSkips = (
  coverages: readonly SpecCoverage[],
  _cdpExtensions: readonly LocalTest[] = [],
): string => {
  const sections: string[] = [];
  for (const coverage of coverages) {
    if (Arr.isReadonlyArrayEmpty(coverage.counts.missing)) continue;
    const entries = coverage.counts.missing.map(
      (name) =>
        `test.skip("${coverage.upstreamFile} - ${name} [SKIP: TODO - implement]", () => Effect.void);`,
    );
    sections.push(`// Missing tests from ${coverage.upstreamFile}`, ...entries, "");
  }
  return sections.join("\n");
};

const formatMarkdown = (
  coverages: readonly SpecCoverage[],
  cdpExtensions: readonly LocalTest[] = [],
): string => {
  const summary = computeSummary(coverages, cdpExtensions);
  const lines: string[] = [
    "<!-- AUTO-GENERATED by `pnpm codegen:cdp:snapshot`. Do not edit by hand. -->",
    "",
    "# browser-cdp Coverage Snapshot",
    "",
    "Auto-generated coverage of `browser-cdp` tests against upstream Playwright specs.",
    "",
    "**Intended coverage** is the primary metric: `covered / (total - not_planned)`.",
    "NOT_PLANNED tests are deliberately excluded because the `browser-cdp` is a",
    "scraping library, not a testing framework, and many upstream specs test",
    "testing-only features (assertion API, actionability waiting, leak detection,",
    "etc.) that are out of scope for CDP.",
    "",
    "For narrative context (what to implement next, skip-category decisions, Phase",
    "history), see [`./upstream-integration-test-coverage.md`](./upstream-integration-test-coverage.md).",
    "",
    "## Summary",
    "",
    "| Metric            | Count |",
    "| ----------------- | ----- |",
    `| Upstream tests    | ${summary.totalUpstream} |`,
    `| Covered           | ${summary.totalCovered} |`,
    `| NOT_PLANNED       | ${summary.totalNotPlanned} |`,
    `| TODO              | ${summary.totalTodo} |`,
    `| BLOCKED           | ${summary.totalBlocked} |`,
    `| Missing           | ${summary.totalMissing} |`,
    `| CDP-Extensions    | ${summary.totalCdpExtensions} |`,
    "",
    `**Intended coverage:** ${summary.totalCovered}/${summary.intendedTotal} (${summary.intendedPercent}%)`,
    "",
    `**Actual coverage:**   ${summary.totalCovered}/${summary.totalUpstream} (${summary.actualPercent}%)`,
    "",
    "## Per-spec coverage",
    "",
    "Sorted by intended coverage ascending — the lowest rows are the next",
    "implementation targets.",
    "",
    "| Spec | Covered | Effective | % | Status |",
    "| --- | --- | --- | --- | --- |",
  ];

  // Sort specs by intended coverage ascending: low-coverage specs first
  // (they're the next implement targets). Specs with effective=0 are
  // placed at the very top, since they need attention before specs with
  // a small gap.
  const sortedCoverages: readonly SpecCoverage[] = Arr.sort(
    coverages,
    (a: SpecCoverage, b: SpecCoverage): -1 | 0 | 1 => {
      const aEffective = a.counts.total - a.counts.notPlanned;
      const bEffective = b.counts.total - b.counts.notPlanned;
      const aPercent = aEffective > 0 ? a.counts.covered / aEffective : -1;
      const bPercent = bEffective > 0 ? b.counts.covered / bEffective : -1;
      if (aPercent !== bPercent) return aPercent < bPercent ? -1 : 1;
      return a.upstreamFile.localeCompare(b.upstreamFile) < 0 ? -1 : 1;
    },
  );

  for (const coverage of sortedCoverages) {
    const effective = coverage.counts.total - coverage.counts.notPlanned;
    const total = coverage.counts.total;
    if (effective === 0 && total > 0) {
      lines.push(`| \`${coverage.upstreamFile}\` | 0 | 0 | — | all NOT_PLANNED |`);
      continue;
    }
    const percent = Math.round((coverage.counts.covered / effective) * 100);
    const status = percent === 100 ? "✅" : percent >= 80 ? "🟡" : percent === 0 ? "🔴" : "🔴";
    lines.push(
      `| \`${coverage.upstreamFile}\` | ${coverage.counts.covered} | ${effective} | ${percent}% | ${status} |`,
    );
  }

  // Missing tests grouped per-spec (capped at 5 names per spec for readability)
  const specsWithMissing = sortedCoverages.filter((c) =>
    Arr.isReadonlyArrayNonEmpty(c.counts.missing),
  );
  if (Arr.isReadonlyArrayNonEmpty(specsWithMissing)) {
    lines.push("", "## Missing tests");
    lines.push("");
    lines.push("Upstream test names with no CDP counterpart. Each row is a candidate");
    lines.push("for either a parity test implementation or a `NOT_PLANNED` skip");
    lines.push("declaration in `tests/integration/shared/cdp/_parityNotPlanned.ts`.");
    lines.push("");
    for (const coverage of specsWithMissing) {
      lines.push(`### \`${coverage.upstreamFile}\` (${coverage.counts.missing.length})`);
      lines.push("");
      const shown = coverage.counts.missing.slice(0, 5);
      for (const name of shown) lines.push(`- ${name}`);
      if (coverage.counts.missing.length > shown.length) {
        lines.push(`- _… ${coverage.counts.missing.length - shown.length} more_`);
      }
      lines.push("");
    }
  }

  if (Arr.isReadonlyArrayNonEmpty(cdpExtensions)) {
    lines.push("## CDP-Extension tests");
    lines.push("");
    lines.push("Tests that exercise CDP-only features with no upstream Playwright");
    lines.push("equivalent. Grouped by source file.");
    lines.push("");
    // Group by source file for readability
    const byFile = Arr.reduce(
      cdpExtensions,
      HashMap.empty<string, readonly LocalTest[]>(),
      (acc, t) =>
        pipe(
          HashMap.get(acc, t.file),
          Option.match({
            onNone: () => HashMap.set(acc, t.file, [t]),
            onSome: (existing) => HashMap.set(acc, t.file, [...existing, t]),
          }),
        ),
    );
    const sortedFiles = Arr.sort(HashMap.keys(byFile), String.Order);
    for (const file of sortedFiles) {
      const testsOpt = HashMap.get(byFile, file);
      if (Option.isNone(testsOpt)) continue;
      const tests = testsOpt.value;
      lines.push(`### \`${file}\` (${tests.length})`);
      lines.push("");
      for (const t of tests) {
        const reason = Option.getOrElse(t.cdpExtension, () => "");
        lines.push(`- ${t.name} _(${reason})_`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
};

const getFormatter = (
  format: OutputFormat,
): ((coverages: readonly SpecCoverage[], cdpExtensions?: readonly LocalTest[]) => string) => {
  switch (format) {
    case "json":
      return formatJson;
    case "markdown":
      return formatMarkdown;
    case "generate-skips":
      return formatGenerateSkips;
    default:
      return formatConsole;
  }
};

// =============================================================================
// Declarative Program
// =============================================================================

const makeProgram = (format: OutputFormat, outPath: Option.Option<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const repoRoot = path.resolve(import.meta.dirname ?? ".", "../..");
    const upstreamDir = path.join(repoRoot, "repos", "cloudflare-playwright", "tests", "page");
    const localDir = path.join(repoRoot, "tests", "integration", "shared", "cdp");

    // Gracefully skip when the vendored upstream specs aren't present. The
    // vendored `repos/cloudflare-playwright/` checkout is documented as
    // optional (see `upstream-integration-test-coverage.md` Prerequisites) — contributors may
    // have populated only `repos/effect-smol/`. Emit a warning and exit 0
    // rather than failing the run with ENOENT.
    const upstreamExists = yield* fs.exists(upstreamDir);
    if (!upstreamExists) {
      yield* Console.warn(
        `\n⚠️  Vendored upstream specs not found at ${upstreamDir}.\n` +
          `   Skipping CDP coverage analysis. See docs/contributing/cdp/upstream-integration-test-coverage.md\n` +
          `   for how to populate repos/cloudflare-playwright/ if you need live numbers.\n`,
      );
      if (Option.isSome(outPath)) {
        const placeholder = [
          "<!-- AUTO-GENERATED by `pnpm codegen:cdp:snapshot`. Do not edit by hand. -->",
          "",
          "# browser-cdp Coverage Snapshot",
          "",
          "_Coverage analysis skipped: vendored upstream specs not found._",
          "",
          "This file is normally regenerated from upstream Playwright specs in",
          "`repos/cloudflare-playwright/tests/page/`. When that directory is",
          "absent, the analyzer cannot run and this placeholder is written instead.",
          "",
          "To populate the vendored specs, see the **Prerequisites** section of",
          "[`./upstream-integration-test-coverage.md`](./upstream-integration-test-coverage.md).",
          "",
        ].join("\n");
        yield* fs.writeFileString(outPath.value, placeholder);
      }
      return undefined;
    }

    const [upstreamFiles, localFiles] = yield* Effect.all(
      [
        pipe(
          fs.readDirectory(upstreamDir),
          Effect.map(Arr.filter((f: string) => f.endsWith(".spec.ts"))),
          Effect.map(Arr.sort(String.Order)),
        ),
        pipe(
          fs.readDirectory(localDir),
          Effect.map(Arr.filter((f: string) => f.endsWith(".ts") && f !== "index.ts")),
        ),
      ] as const,
      { concurrency: 2 },
    );

    const localTestEffects = Arr.map(localFiles, (file: string) =>
      pipe(
        fs.stream(path.join(localDir, file)),
        Stream.decodeText({ encoding: "utf-8" }),
        Stream.splitLines,
        Stream.runFold(
          () => "",
          (acc, line) => acc + line + "\n",
        ),
        Effect.map((content: string) => parseLocalTestFile(content, file)),
      ),
    );

    const localParseResults = yield* Effect.all(localTestEffects, { concurrency: "unbounded" });

    const allLocalTests: readonly LocalTest[] = pipe(
      localParseResults,
      Arr.flatMap((r) => r.tests),
    );

    const allWarnings: readonly ParseWarning[] = pipe(
      localParseResults,
      Arr.flatMap((r) => r.warnings),
    );

    if (Arr.isReadonlyArrayNonEmpty(allWarnings)) {
      yield* Console.warn(`\n⚠️  Found ${allWarnings.length} malformed test declaration(s):`);
      for (const w of allWarnings) {
        yield* Console.warn(`   ${w.file}:${w.line} — ${w.message}`);
      }
      yield* Console.warn("");
    }

    const relevantSpecFiles = pipe(
      allLocalTests,
      Arr.map((t: LocalTest) => t.specFile),
      Arr.dedupe,
      Arr.filter((f: string) => upstreamFiles.includes(f)),
      Arr.sort(String.Order),
    );

    const cdpExtensionTests: readonly LocalTest[] = pipe(
      allLocalTests,
      Arr.filter((t) => Option.isSome(t.cdpExtension)),
    );

    const specAnalysisEffects = Arr.map(relevantSpecFiles, (specFile: string) =>
      pipe(
        fs.stream(path.join(upstreamDir, specFile)),
        Stream.decodeText({ encoding: "utf-8" }),
        Stream.splitLines,
        Stream.runFold(
          () => "",
          (acc, line) => acc + line + "\n",
        ),
        Effect.map((content: string) => parseUpstreamTests(content, specFile)),
        Effect.map((upstreamTests: readonly UpstreamTest[]) =>
          analyzeSpecCoverage(upstreamTests, allLocalTests, specFile),
        ),
      ),
    );

    const coverages: readonly SpecCoverage[] = yield* Effect.all(specAnalysisEffects, {
      concurrency: "unbounded",
    });

    if (format === "generate-skips") {
      // Dump all missing tests to stdout in a readable form.
      // The `formatGenerateSkips` formatter only emits skip lines for
      // first-N missing tests, so we print the full list here.
      const sections: string[] = [];
      for (const coverage of coverages) {
        if (Arr.isReadonlyArrayEmpty(coverage.counts.missing)) continue;
        sections.push(
          `# Missing tests from ${coverage.upstreamFile} (${coverage.counts.missing.length}):`,
        );
        for (const name of coverage.counts.missing) {
          sections.push(`  - ${name}`);
        }
        sections.push("");
      }
      yield* Console.log(sections.join("\n"));
    } else {
      const output = getFormatter(format)(coverages, cdpExtensionTests);
      if (Option.isSome(outPath)) {
        yield* fs.writeFileString(outPath.value, output);
      } else {
        yield* Console.log(output);
      }
    }
  });

// =============================================================================
// CLI Entry Point
// =============================================================================

const parseFormat = (arg: string | undefined): OutputFormat => {
  switch (arg) {
    case "json":
    case "markdown":
    case "generate-skips":
      return arg;
    default:
      return "console";
  }
};

/**
 * Parses `--out <path>` from `argv`. Returns `Option.none()` when absent.
 * Positional args (the format) come first; `--out` may appear in any later
 * position.
 */
const parseOutPath = (argv: readonly string[]): Option.Option<string> => {
  const idx = argv.indexOf("--out");
  if (idx < 0 || idx + 1 >= argv.length) return Option.none();
  return Option.some(argv[idx + 1]);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const format = parseFormat(process.argv[2]);
  const outPath = parseOutPath(process.argv.slice(3));

  const program = makeProgram(format, outPath).pipe(
    Effect.provide(NodeServices.layer),
    Effect.catch((error) =>
      Effect.sync(() => {
        console.error(error);
        process.exit(1);
      }),
    ),
  );

  Effect.runPromise(program);
}
