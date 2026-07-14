/**
 * Static assertion that the no-compat wrangler config really disables
 * `nodejs_compat` — the deterministic half of the "no nodejs_compat"
 * claim.
 *
 * ## Why this exists
 *
 * The workerd-nocompat runtime in `wrangler.test.nocompat.jsonc` is the
 * regression gate for the CDP module's "zero-dep / no `nodejs_compat`
 * needed" claim. The runtime half of that claim is covered by
 *
 *   - `tests/integration/runtime/workerd/cdp/CdpNoCompat.smoke.test.ts`
 *     (CDP module loads under workerd without `nodejs_compat`)
 *   - `tests/integration/runtime/workerd/cdp/Cdp.integration.test.ts`
 *     (823 CDP integration tests pass without `nodejs_compat`)
 *
 * But both depend on the wrangler config being **correctly** free of
 * `nodejs_compat`. If a future change accidentally adds
 * `compatibility_flags: ["nodejs_compat"]` to
 * `wrangler.test.nocompat.jsonc`, the runtime tests would silently
 * pass for the wrong reason (the modules would load, the compat shim
 * would cover the `Buffer.from` / `node:` import).
 *
 * This file is the deterministic gate: it greps the config file
 * directly. If the string `"nodejs_compat"` ever appears in
 * `wrangler.test.nocompat.jsonc`, the test fails — no runtime
 * ambiguity, no segfault, no flakiness.
 *
 * ## Why a string match (not a JSON parse)
 *
 * - **Robustness**: catches all variants a reviewer might type —
 *   `nodejs_compat`, `nodejs_compat_v2`, `nodejs_compat:1`, etc.
 * - **Comment-safe**: a future maintainer who adds a comment like
 *   `// don't add nodejs_compat here` would also fail this test —
 *   prompting them to either remove the comment or explain why
 *   the assertion is wrong (it isn't).
 * - **Zero dependencies**: no JSONC parser, no schema, no version
 *   drift. The file is small and the assertion is narrow.
 *
 * @see wrangler.test.nocompat.jsonc - The file under test
 * @see tests/integration/runtime/workerd/cdp/CdpNoCompat.smoke.test.ts
 *      - Runtime half of the no-compat claim
 */

import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// ── Path helpers ──────────────────────────────────────────────────────────────

/**
 * Absolute path to `wrangler.test.nocompat.jsonc`, resolved relative to
 * this test file. Lives in the repo root (not under `src/`) so the
 * typical source-alias resolution doesn't apply — we read it as a
 * plain file from the repo root.
 *
 * `vitest.unit.config.ts` sets the CWD to the repo root, so a
 * relative path also works; we use `import.meta.url` for explicitness
 * and to be CWD-independent.
 */
const WRANGLER_CONFIG_PATH = fileURLToPath(
  new URL("../../../wrangler.test.nocompat.jsonc", import.meta.url),
);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Read the wrangler config as a UTF-8 string. */
const readConfig = (): Effect.Effect<string, NodeJS.ErrnoException> =>
  Effect.promise(() => readFile(WRANGLER_CONFIG_PATH, "utf-8"));

/**
 * Strip JSONC comments so a maintainer can mention `nodejs_compat` in
 * a doc comment without triggering the assertion. JSONC has two comment
 * forms:
 *
 *   - `// line comment` to end of line
 *   - `/* block comment *\/` (potentially multi-line)
 *
 * We don't parse the JSON — we only need the body of the file, minus
 * comments, before the regex check. (The structured-shape check is
 * left to the wrangler CLI / `wrangler deploy --dry-run`, which runs
 * in `pnpm run verify`.)
 */
const stripJsoncComments = (raw: string): string =>
  raw
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // line comments (avoid `://` in URLs)

// ── Tests ────────────────────────────────────────────────────────────────────

describe("wrangler.test.nocompat.jsonc (no-compat gate)", () => {
  it.effect("does not enable nodejs_compat", () =>
    Effect.gen(function* () {
      const content = yield* readConfig();
      const stripped = stripJsoncComments(content);

      // The headline assertion: the compat shim must not be active.
      // Match `nodejs_compat` as a whole word, not as a substring of
      // an unrelated identifier (defensive against false positives
      // like a property name that happens to contain it).
      const match = stripped.match(/\bnodejs_compat\b/);
      assert.isNull(
        match,
        `wrangler.test.nocompat.jsonc must not contain "nodejs_compat" ` +
          `(found: ${JSON.stringify(match?.[0])}). The no-compat gate is ` +
          `the regression test for the CDP module's "no nodejs_compat ` +
          `needed" claim — see tests/integration/runtime/workerd/cdp/ ` +
          `CdpNoCompat.smoke.test.ts for the runtime half.`,
      );
    }),
  );

  it.effect("differs from wrangler.test.jsonc (otherwise the gate is meaningless)", () =>
    Effect.gen(function* () {
      // The complementary config (with nodejs_compat enabled) MUST
      // exist and MUST enable nodejs_compat. If both configs end up
      // identical, the no-compat gate is a no-op.
      //
      // This is the contrapositive check: it would fail loudly if a
      // future cleanup accidentally "unified" the two configs.
      const compatConfigPath = fileURLToPath(
        new URL("../../../wrangler.test.jsonc", import.meta.url),
      );
      const [compatContent, noCompatContent] = yield* Effect.all(
        [Effect.promise(() => readFile(compatConfigPath, "utf-8")), readConfig()],
        { concurrency: 1 },
      );
      const compatStripped = stripJsoncComments(compatContent);
      const noCompatStripped = stripJsoncComments(noCompatContent);

      assert.isTrue(
        /\bnodejs_compat\b/.test(compatStripped),
        `wrangler.test.jsonc (the compat config) must enable nodejs_compat ` +
          `for the no-compat gate to be a meaningful contrast.`,
      );
      assert.isFalse(
        noCompatStripped === compatStripped,
        `wrangler.test.nocompat.jsonc and wrangler.test.jsonc are identical. ` +
          `The no-compat gate is meaningless if the two configs are the same.`,
      );
    }),
  );
});
