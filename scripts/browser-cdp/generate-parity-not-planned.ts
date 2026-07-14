/**
 * Generates the NOT_PLANNED skip marker file for out-of-scope upstream specs.
 *
 * `browser-cdp` is a scraping library, not a testing framework. Many
 * upstream Playwright spec files test Playwright features that are
 * deliberately out of scope for `browser-cdp`:
 *
 *   - ElementHandle API (13 files) — `browser-cdp` is locator-only
 *   - expect/assertion API (8 files) — testing-only
 *   - JSHandle (5 files) — `browser-cdp` doesn't expose JSHandle
 *   - selector engine internals (8 files) — `browser-cdp` uses simpler selectors
 *   - autowaiting/actionability (2 files) — testing-only
 *   - leak detection, listener counting, strict mode, etc.
 *
 * This script reads the upstream spec files and emits a list of skip
 * declarations grouped per spec, with the spec-level rationale.
 *
 * Output: tests/integration/shared/cdp/_parityNotPlanned.ts
 *
 * The output is a `defineParityNotPlannedTests(api, config)` function
 * that registers `test.skip(...)` for every test in every NOT_PLANNED
 * spec. The coverage analyzer counts these as NOT_PLANNED instead of
 * missing.
 *
 * Usage: pnpm tsx scripts/browser-cdp/generate-parity-not-planned.ts
 *
 */

import * as Arr from "effect/Array";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseUpstreamTests } from "./shared/upstream-playwright-tests-parser.js";

// =============================================================================
// Per-spec skip reasons — what's NOT_PLANNED and why
// =============================================================================

interface SkipSpec {
  /** Pattern matched against spec filename (basename, no .spec.ts). */
  readonly pattern: RegExp;
  /** Why the spec is NOT_PLANNED — appears in skip markers. */
  readonly reason: string;
  /**
   * Optional list of upstream test names (matched verbatim against the
   * upstream test name) to EXCLUDE from the generated NOT_PLANNED skip
   * block. Use this when some tests of an otherwise-skipped spec are
   * already covered as `test.live` or have their own explicit
   * `[SKIP: TODO - ...]` skip markers in another file (e.g.,
   * `pageState.ts`). Without exclude, the codegen would emit a
   * redundant `test.skip` line that the analyzer would then have to
   * de-prioritize against the live/TODO declaration elsewhere.
   */
  readonly excludeTests?: readonly string[];
}

const SKIP_SPECS: readonly SkipSpec[] = [
  // ── ElementHandle family (13 specs) — `browser-cdp` is locator-only ────────────
  {
    pattern: /^elementhandle-bounding-box$/,
    reason: "ElementHandle not in `browser-cdp` (locator-only)",
  },
  { pattern: /^elementhandle-click$/, reason: "ElementHandle not in `browser-cdp` (locator-only)" },
  {
    pattern: /^elementhandle-content-frame$/,
    reason: "ElementHandle not in `browser-cdp` (locator-only)",
  },
  {
    pattern: /^elementhandle-convenience$/,
    reason: "ElementHandle not in `browser-cdp` (locator-only)",
  },
  {
    pattern: /^elementhandle-eval-on-selector$/,
    reason: "ElementHandle not in `browser-cdp` (locator-only)",
  },
  { pattern: /^elementhandle-misc$/, reason: "ElementHandle not in `browser-cdp` (locator-only)" },
  {
    pattern: /^elementhandle-owner-frame$/,
    reason: "ElementHandle not in `browser-cdp` (locator-only)",
  },
  {
    pattern: /^elementhandle-query-selector$/,
    reason: "ElementHandle not in `browser-cdp` (locator-only)",
  },
  {
    pattern: /^elementhandle-screenshot$/,
    reason: "ElementHandle not in `browser-cdp` (locator-only)",
  },
  {
    pattern: /^elementhandle-scroll-into-view$/,
    reason: "ElementHandle not in `browser-cdp` (locator-only)",
  },
  {
    pattern: /^elementhandle-select-text$/,
    reason: "ElementHandle not in `browser-cdp` (locator-only)",
  },
  { pattern: /^elementhandle-type$/, reason: "ElementHandle not in `browser-cdp` (locator-only)" },
  {
    pattern: /^elementhandle-wait-for-element-state$/,
    reason: "ElementHandle not in `browser-cdp` (locator-only)",
  },

  // ── Expect / assertion API (8 specs) — testing-only ──────────────────
  { pattern: /^expect-boolean$/, reason: "expect() assertion API is testing-only" },
  { pattern: /^expect-matcher-result$/, reason: "expect() assertion API is testing-only" },
  { pattern: /^expect-misc$/, reason: "expect() assertion API is testing-only" },
  { pattern: /^expect-timeout$/, reason: "expect() assertion API is testing-only" },
  { pattern: /^expect-to-have-accessible$/, reason: "expect() assertion API is testing-only" },
  { pattern: /^expect-to-have-text$/, reason: "expect() assertion API is testing-only" },
  { pattern: /^expect-to-have-value$/, reason: "expect() assertion API is testing-only" },
  { pattern: /^matchers\.misc$/, reason: "expect() matchers are testing-only" },

  // ── JSHandle (5 specs) — `browser-cdp` doesn't expose JSHandle ────────────────
  {
    pattern: /^jshandle-as-element$/,
    reason: "JSHandle not in `browser-cdp` — use CdpHandle (Phase P1.5)",
  },
  {
    pattern: /^jshandle-evaluate$/,
    reason: "JSHandle not in `browser-cdp` — use CdpHandle (Phase P1.5)",
  },
  {
    pattern: /^jshandle-json-value$/,
    reason: "JSHandle not in `browser-cdp` — use CdpHandle (Phase P1.5)",
  },
  {
    pattern: /^jshandle-properties$/,
    reason: "JSHandle not in `browser-cdp` — use CdpHandle (Phase P1.5)",
  },
  {
    pattern: /^jshandle-to-string$/,
    reason: "JSHandle not in `browser-cdp` — use CdpHandle (Phase P1.5)",
  },

  // ── Selector engine internals (8 specs) — `browser-cdp` uses simpler selectors ─
  {
    pattern: /^selectors-css$/,
    reason: "selector engine internals (`browser-cdp` uses CDP DOM.querySelectorAll)",
  },
  { pattern: /^selectors-frame$/, reason: "selector engine internals" },
  { pattern: /^selectors-get-by$/, reason: "selector engine internals" },
  { pattern: /^selectors-misc$/, reason: "selector engine internals" },
  { pattern: /^selectors-react$/, reason: "selector engine internals (React-specific)" },
  { pattern: /^selectors-register$/, reason: "selector engine internals (custom selectors)" },
  { pattern: /^selectors-role$/, reason: "selector engine internals (ARIA role selectors)" },
  { pattern: /^selectors-text$/, reason: "selector engine internals" },
  { pattern: /^selectors-vue$/, reason: "selector engine internals (Vue-specific)" },

  // ── Autowaiting / actionability (2 specs) — testing-only ────────────
  { pattern: /^page-autowaiting-basic$/, reason: "actionability waiting is testing-only" },
  { pattern: /^page-autowaiting-no-hang$/, reason: "actionability waiting is testing-only" },

  // ── Leak detection, listener counting, strict mode (3 specs) ─────────
  { pattern: /^page-leaks$/, reason: "leak detection is testing-only" },
  { pattern: /^page-listeners$/, reason: "listener counting is testing-only" },
  { pattern: /^page-strict$/, reason: "strict mode violation is testing-only" },

  // ── Click-specific testing (4 specs) ─────────────────────────────────
  { pattern: /^page-click-during-navigation$/, reason: "race condition testing (testing-only)" },
  { pattern: /^page-click-react$/, reason: "React-specific event handling (framework-specific)" },
  { pattern: /^page-click-scroll$/, reason: "scroll-into-view actionability (testing-only)" },
  { pattern: /^page-click-timeout-1$/, reason: "actionability timeout (testing-only)" },
  { pattern: /^page-click-timeout-2$/, reason: "actionability timeout (testing-only)" },
  { pattern: /^page-click-timeout-3$/, reason: "actionability timeout (testing-only)" },
  { pattern: /^page-click-timeout-4$/, reason: "actionability timeout (testing-only)" },

  // ── ARIA snapshot (2 specs) — testing-only ──────────────────────────
  {
    pattern: /^page-aria-snapshot$/,
    reason: "aria tree snapshots are for assertions (testing-only)",
  },
  { pattern: /^page-aria-snapshot-ai$/, reason: "AI-driven aria is testing-only" },
  { pattern: /^to-match-aria-snapshot$/, reason: "aria matcher is testing-only" },

  // ── Other testing-only specs ─────────────────────────────────────────
  { pattern: /^interception$/, reason: "request interception internals (testing-only)" },
  { pattern: /^queryselector$/, reason: "selector engine internals" },
  { pattern: /^retarget$/, reason: "target attachment internals (testing-only)" },
  { pattern: /^wheel$/, reason: "synthetic wheel events are testing-only" },
  { pattern: /^workers$/, reason: "workers API is testing-only" },

  // ── Locator-ElementHandle — ElementHandle on locator ─────────────────
  {
    pattern: /^locator-element-handle$/,
    reason: "ElementHandle not in `browser-cdp` (locator-only)",
  },
  { pattern: /^frame-frame-element$/, reason: "returns ElementHandle (not in `browser-cdp`)" },

  // ── Locator highlight — debug aid ────────────────────────────────────
  { pattern: /^locator-highlight$/, reason: "locator highlight is a debug aid (testing-only)" },

  // ── Page-level: testing-only / browser-internal ──────────────────────
  {
    pattern: /^page-evaluate-no-stall$/,
    reason: "Playwright-internal API (nonStallingRawEvaluateInExistingMainContext)",
  },
  { pattern: /^page-add-locator-handler$/, reason: "addLocatorHandler is a testing-only utility" },
  { pattern: /^page-request-gc$/, reason: "requestGC is browser-internal (testing-only)" },
  { pattern: /^page-network-sizes$/, reason: "network size metrics are testing-only" },
  {
    pattern: /^page-event-popup$/,
    reason: "popup events are testing-only (`browser-cdp` has no popup helper)",
  },

  // ── Page-level drag and drop — synthetic events only ────────────
  // CDP's dragAndDrop fires dragstart/drop via dispatchEvent; it does NOT
  // emulate Playwright's full HTML5 drag-and-drop pipeline (mouse-button
  // tracking, drop-effect negotiation, drag-into-iframe, etc.).
  { pattern: /^page-drag$/, reason: "synthetic dragAndDrop, no HTML5 dnd emulation" },

  // ── page-basic: 9 of 18 upstream tests are testing-only or out-of-scope ──
  // The other 6 (page.url, page.title, page.press, frame.press + 2 TODO) are
  // already classified in tests/integration/shared/cdp/pageState.ts.
  // The 3 IMPLEMENT ones below (page.frame by name/url, sane UA) are also
  // implemented in pageState.ts.
  {
    pattern: /^page-basic$/,
    reason: "testing-only callbacks, async stacks, popup/opener APIs (out of scope)",
    excludeTests: [
      // Already implemented as test.live in pageState.ts:
      "page.url should work",
      "page.title should return the page title",
      "page.press should work",
      "frame.press should work",
      // Implemented as test.live in pageState.ts (P12):
      "page.frame should respect name",
      "page.frame should respect url",
      "should have sane user agent",
      // Already classified as TODO in pageState.ts:
      "page.url should include hashes",
      "page.press should work for Enter",
    ],
  },
];

// =============================================================================
// Main
// =============================================================================

const REPO_ROOT = process.cwd();
const UPSTREAM_DIR = join(REPO_ROOT, "repos", "cloudflare-playwright", "tests", "page");
const OUT_FILE = join(REPO_ROOT, "tests", "integration", "shared", "cdp", "_parityNotPlanned.ts");

const main = (): void => {
  const files = readdirSync(UPSTREAM_DIR)
    .filter((f) => f.endsWith(".spec.ts"))
    .sort();

  const sections: string[] = [];
  let totalSpecs = 0;
  let totalTests = 0;

  for (const file of files) {
    const basename = file.replace(/\.spec\.ts$/, "");
    const skip = SKIP_SPECS.find((s) => s.pattern.test(basename));
    if (!skip) continue;

    const content = readFileSync(join(UPSTREAM_DIR, file), "utf-8");
    const tests = parseUpstreamTests(content, file).map((t) => t.name);
    if (Arr.isReadonlyArrayEmpty(tests)) continue;

    // Honor optional excludeTests: skip upstream test names that are
    // already classified elsewhere (active coverage in another file, or
    // explicit TODO skips). Case-sensitive exact match against the
    // upstream test name.
    const excluded = new Set(skip.excludeTests ?? []);
    const filteredTests = tests.filter((t) => !excluded.has(t));
    if (Arr.isReadonlyArrayEmpty(filteredTests)) continue;

    totalSpecs += 1;
    totalTests += filteredTests.length;

    sections.push(`    // ── ${file} — ${skip.reason} ──`);
    for (const test of filteredTests) {
      // Pick the quote style that avoids escaping the test name. Default to
      // double quotes (the analyzer's LOCAL_TEST_INLINE_RE accepts both
      // double and single quotes). If the test name contains a double
      // quote, fall back to single quotes; if it contains both, fall back
      // to backticks (which the analyzer doesn't accept — in that rare case
      // we just emit a malformed name; the user must fix manually).
      const hasDoubleQuote = test.includes('"');
      const hasSingleQuote = test.includes("'");
      let quote: '"' | "'" | "`";
      if (hasDoubleQuote && hasSingleQuote) {
        quote = "`";
      } else if (hasDoubleQuote) {
        quote = "'";
      } else {
        quote = '"';
      }
      const safeTest = test
        .replace(/\\/g, "\\\\")
        // Escape the chosen wrapping quote character
        .replace(new RegExp(`\\${quote}`, "g"), `\\${quote}`);
      sections.push(
        `    test.skip(${quote}${file} - ${safeTest} [SKIP: NOT_PLANNED - ${skip.reason}]${quote}, () => Effect.void);`,
      );
    }
    sections.push("");
  }

  const header = `/**
 * Auto-generated NOT_PLANNED skip declarations for testing-only upstream specs.
 *
 * browser-cdp is a scraping library, not a testing framework. Many upstream
 * Playwright specs test features that are deliberately out of scope:
 *
 *   - ElementHandle API (browser-cdp is locator-only)
 *   - expect() assertion API (testing-only)
 *   - JSHandle (browser-cdp uses CdpHandle)
 *   - selector engine internals (browser-cdp uses simpler DOM.querySelectorAll)
 *   - autowaiting / actionability (testing-only)
 *   - leak detection, listener counting, strict mode, etc.
 *
 * This file is auto-generated by scripts/browser-cdp/generate-parity-not-planned.ts.
 * Do not edit by hand. Re-run the generator to refresh.
 *
 * Coverage contribution: ${totalSpecs} specs / ${totalTests} tests → NOT_PLANNED.
 *
 */

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect } from "effect";

// This file is consumed by the coverage analyzer via static source scan
// (looking for test.skip(...) lines). It is NOT loaded by vitest. Wiring
// it into defineAllCdpTests would register many skipped tests with
// vitest's registry — analyzer-only is more efficient.
export const defineParityNotPlannedTests = (_api: TestApi, _config: TestConfig): void => {
  // test.skip() is captured statically by the coverage analyzer via the file
  // source — not via the \`test\` runtime. The closure-bound \`test\` from the
  // \`api\` argument is not used here. We use a no-op binding to satisfy the
  // pattern detector.
  void _api;
  void _config;

  // The skip statements below are picked up by the analyzer
  // (scripts/browser-cdp/generate-parity-snapshot.ts) via its test.skip(...)
  // line scanner. They are NOT registered with vitest — the analyzer reads
  // the file source directly.
`;

  const footer = `};
`;

  const body = sections.join("\n");
  writeFileSync(OUT_FILE, header + "\n" + body + "\n" + footer);

  console.log(`Wrote ${OUT_FILE}`);
  console.log(`  ${totalSpecs} specs / ${totalTests} tests → NOT_PLANNED`);
};

main();
