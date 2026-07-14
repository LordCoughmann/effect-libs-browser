# Fallow Compliance

This document describes how this project handles [fallow](https://docs.fallow.tools) codebase intelligence findings.

## Overview

Fallow analyzes the codebase for:

- **Dead code** — unused files, exports, types, dependencies (and the reverse: dependencies that *are* listed but unused)
- **Code duplication** — clone groups across the project
- **Complexity hotspots** — high cyclomatic / cognitive / CRAP scores
- **Architecture boundary violations** — cross-zone imports
- **Stale suppressions** — `fallow-ignore-*` markers that no longer match any finding (governance surface, 3.4.2+)

The project tracks fallow 3.x as the active version. CLI wire contracts, config keys, and output formats used in this repo are 3.x stable. Where the 3.x semantics differ from 2.x in ways that matter for this codebase, the relevant section calls it out.

## The fail-gate policy

fallow's individual analyses aren't equally actionable. Some find bugs-in-waiting (unused exports, dangling imports) and some find code-quality issues (duplication, complexity) that are real but may not warrant blocking a release. We separate them:

| Analysis                | Behavior in CI                               | Behavior locally      |
| ----------------------- | -------------------------------------------- | --------------------- |
| **Dead code**           | **Fail-gate** — non-zero exit on any finding | Same as CI            |
| **Duplication**         | Reported, not failing                        | Reported, not failing |
| **Complexity**          | Reported, not failing                        | Reported, not failing |
| **Boundary violations** | Fail-gate (none currently)                   | Same as CI            |

This is enforced in `.github/workflows/ci.yml` (the `Code health (fallow)` step runs only `npx fallow dead-code --fail-on-issues`, matching `pnpm check` locally). Devs can still run `npx fallow` to see the full report.

**Why this split:** dead code is always wrong — an unused export either means the export is dead or something it references is missing. Duplication and complexity are _trade-off_ findings: the dupes might be intentional (per-method test boilerplate mirroring the upstream Playwright spec) and the complexity might be inherent to a protocol surface that has to handle many cases. Blocking releases on these would force premature refactors.

## Running fallow

```bash
# CI / pre-commit form (the fail-gate)
fallow dead-code --fail-on-issues

# Local full report — dupes + complexity + dead-code together
fallow

# Local subcommand — one analysis at a time
fallow dead-code
fallow dupes
fallow health

# Per-analysis config overrides (3.x defaults: cyclomatic 20, cognitive 15, CRAP 30, unit-size 60)
fallow dupes --threshold 50         # fail only if > 50% duplicated
fallow health --max-cyclomatic 30   # raise the cyclomatic threshold
fallow health --max-cognitive 25    # raise the cognitive threshold

# Governance / discovery (3.x — read-only, always exits 0)
fallow suppressions                 # list every active fallow-ignore marker (with line, kind, level, reason)
fallow suppressions --format json   # same, JSON envelope (`schema_version: 1`) for tooling
fallow recommend                    # project-tailored config recommendation for an agent to author
fallow schema                       # capability manifest: every rule's default severity, opt-in status, framework label
fallow plugin-check                 # dry-run external plugins: did they activate? which manifests did they seed?
fallow guard path/to/file.ts        # pre-edit architecture guard: which repo-wide rules apply to this file?
fallow list                         # entry points, plugins, workspaces, workspace-discovery diagnostics
fallow explain <issue-type>         # one-issue explainer (e.g. fallow explain code-duplication)

# Save analysis, render later (3.4.2) — useful for split analysis/CI-render pipelines
fallow --format json -o results.json
fallow report --from results.json --format github-annotations
fallow report --from results.json --format github-summary

# JSON output for tooling
fallow --format json | jq
fallow config --format json | jq    # 3.3.0+: prints clean JSON to stdout (was: provenance line + JSON)
```

### Threshold defaults (3.x)

| Threshold                | Default | Override                         | Notes                                                                              |
| ------------------------ | ------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| Cyclomatic complexity    | 20      | `health.maxCyclomatic` / CLI flag | The `--max-cyclomatic` CLI flag still works.                                       |
| Cognitive complexity     | 15      | `health.maxCognitive` / CLI flag | The `--max-cognitive` CLI flag still works.                                        |
| CRAP score               | 30      | `health.maxCrap` / CLI flag      | `fallow health` summary always reports the *effective* value of all four.          |
| Unit-size (large fn)     | 60 LOC  | `health.maxUnitSize`             | 3.2.0+: was hardcoded to 60 LOC. Raise to 200–500 for `tests/**` if needed.        |
| Coverage gap severity    | warn    | n/a (gated by `coverage-gaps` rule key) | 3.1.0 fix: bare `rules: {}` no longer promotes it to error.                  |

The `fallow health --format json` envelope's `summary` block always carries `max_cyclomatic_threshold`, `max_cognitive_threshold`, `max_crap_threshold`, **and** `max_unit_size_threshold` (3.2.0+), so a CI consumer can read back the resolved thresholds without parsing config.

### CI renderers (3.4.2+)

The 3.4.2 release added two log-based renderers that work on fork PRs without a write token (no `checks: write`, no PR comments):

```bash
fallow --format github-annotations   # ::error / ::warning / ::notice lines
fallow --format github-summary       # markdown for >> "$GITHUB_STEP_SUMMARY"
```

Both are emitted to stdout and respect `--report-path-prefix <prefix>` (formerly `--annotations-path-prefix`, kept as an alias). For non-fork workflows, the bundled `fallow ci` subcommand is the path that opens the sticky PR comment and Check Run.

## Disabled analyses

### `coverage-gaps` — Disabled

**Why:** Effect's service pattern (Layer composition, `yield* Service`) is fundamentally incompatible with what fallow's coverage-gaps detection expects (direct imports in test files).

- Services are accessed via context (`yield* Service`), not direct imports
- Tests use Layer composition patterns (`Effect.provide(Layer)`)
- Services are tested through the Effect runtime, not direct function calls
- Internal exports (schemas, error classes, factory functions) are tested indirectly

This causes most "untested" exports to be false positives — they ARE tested, just through Layer composition and internal usage patterns.

**Resolution:** `coverage-gaps` set to `"off"` in `.fallowrc.json`.

### `duplicate-exports` — Disabled

**Why:** Each `@effect-libs/browser-*` package re-exports selected items from `@effect-libs/browser` for ergonomic imports. fallow flags these as duplicate exports of the same name across packages, but the duplication is deliberate (per-package public surface).

**Resolution:** `duplicate-exports` set to `"off"` in `.fallowrc.json`.

### `unused-catalog-entries` — Disabled

**Why:** the pnpm catalog is intentionally over-provisioned to make new package additions frictionless. fallow flags unused catalog entries, but the entries are pre-staged for the next package that needs them.

**Resolution:** `unused-catalog-entries` set to `"off"` in `.fallowrc.json`.

## Ignored paths

See `ignorePatterns` in `.fallowrc.json` for the full list. The notable ones:

- `repos/**` — vendored external code (read-only reference)
- `packages/cloudflare-playwright/**` — vendored fork of `@cloudflare/playwright`
- `packages/browser-cdp/src/internal/Page/Evaluate/serialization/**` — vendored from Playwright (Microsoft, Apache 2.0)
- `tests/integration/runtime/{bun,deno}/**` and per-runtime `setup.ts` files — runtime-specific entry points, not part of the shared test surface
- `tests/utils/effect-test/**`, `tests/utils/config/**` — test infrastructure utilities
- `tests/setup/**` — global test setup (Chrome, HTTP server)
- `scripts/**` — codegen / verifier scripts

## Known duplication (reported, accepted)

These are real duplication findings that fallow reports but are **not** blockers. Each has a documented reason.

### Test boilerplate (the largest single source)

`tests/integration/shared/cdp/*.ts` test files share a common structure:

<!-- verify:ignore -->

```typescript
export const defineXyzTests = (fixture: TestFixture) =>
  test.live("xyz.spec.ts - …", async ({ page }) => { … });
```

Each `define*Tests` wraps a corresponding Playwright upstream spec (`page.spec.ts`, `frame.spec.ts`, etc.) so `browser-cdp` can match upstream behavior one-to-one. The repeated import block, fixture wiring, and describe-block scaffolding shows up as the same `~640-line` clone in 18 different files. **This is intentional and shouldn't be deduplicated** — each test file is meant to be a faithful, isolated port of one upstream spec.

**When to act:** if a test file's boilerplate genuinely diverges (custom setup, new helpers), extract those into `tests/utils/`. Don't extract the shared boilerplate itself.

### `browser-cdp` internals

| Source                                                                       | Why it exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cdp.ts` ↔ `Playwright.ts` ↔ `Stagehand.ts` (~29 lines)                      | The three Client `.layer` factories follow the same shape (config → Layer → tag → make). Small enough that extracting would just add indirection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `CdpHttpClient.ts` ↔ `PlaywrightHttpClient.ts` (~67 lines)                   | Both wrap the same `cdp:network` style transport. Different package, different module surface — extracting to a shared util would couple two packages that are otherwise independent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `CdpTypes.ts` ↔ `CdpPage.ts` (~127 lines)                                    | Type ↔ implementation drift by design — `CdpTypes.ts` is the protocol types, `CdpPage.ts` is the runtime that uses them. Splitting the runtime side further (see below) would also reduce this.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `CdpPage.ts` internal (8 clone groups, 515 lines)                            | `browser-cdp`'s main `Page` runtime. Duplication here is mostly repeated `page.methodX()` call-shapes that mirror the upstream `Page` API surface. Refactoring in scope of a `CdpPage.ts` split.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Page/Click.ts` ↔ `Page/Tap.ts` (~52 lines)                                  | Mouse-click vs touch-tap. The event-dispatch code is structurally identical; the inputs differ. Extracting would save a small amount of code at the cost of making the two paths less readable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Page/Dblclick.ts` ↔ `Page/Hover.ts` (~21 lines)                             | Mouse double-click vs hover. Same story as Click/Tap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Page/ElementContent.ts` (per-method arrows, ~30 lines duplication internal) | **Intentionally duplicated.** `textContentElement` / `innerTextElement` / `innerHtmlElement` / `getElementAttribute` / `inputValueElement` each repeat the wait + `evaluatePage` scaffold around a one-line DOM property access. An `extractElementOption<T>` helper extraction was attempted in `b897201` and reverted because it (a) imported `Predicate` inside the arrow body (Vite SSR injected `__vite_ssr_import_0__` → `ReferenceError` on workerd) and (b) closure-captured the `extract` parameter (`Function.prototype.toString` doesn't serialize closures → `ReferenceError: extract is not defined` in the browser). Per-method arrows are the cost of having serializable browser-side code. See [ADR-0006](../cdp/decisions/0006-ssr-import-constraint.md). |
| `Page/ElementState.ts` (per-method arrows, ~30 lines duplication internal)   | **Intentionally duplicated.** Same constraint as `ElementContent.ts`. `isCheckedElement` / `isDisabledElement` / `isEditableElement` each have their own inline `evaluatePage` arrow with directly-inlined DOM property access. `isEnabledElement` composes `isDisabledElement` and never goes through `evaluatePage`. The previous `extractElementStrict<T>` helper extraction in `b897201` was reverted for the same SSR + closure reasons. See [ADR-0006](../cdp/decisions/0006-ssr-import-constraint.md).                                                                                                                                                                                                                                                               |

## Known complexity hotspots (reported, accepted)

| File                                                                                                                                                                                                                                | Worst function                                                                                                      | Why it exists                                                                                                                                                                                                                      | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/browser-cdp/src/internal/CdpPage.ts`                                                                                                                                                                                      | ~~line 2846 — 74 cyclomatic, 84 cognitive, 320 lines~~ → below fallow's per-function threshold (post-refactor)      | ~~The `frameTracker` event dispatcher — 15 sequential `if (msg.method === "...")` checks (Page.frameAttached, Page.frameNavigated, Runtime.executionContextCreated, etc.).~~                                                       | **Done.** Extracted 15 closure-scoped handlers (`handleFrameAttached`, `handleFrameNavigated`, `handleDocumentOpened`, `handleLifecycleEvent`, `handleFrameDetached`, `handleFrameStoppedLoading`, `handleNavigatedWithinDocument`, `handleExecutionContextCreated`, `handleConsoleAPICalled`, `handleJavaScriptDialogOpening`, `handleDownloadWillBegin`, `handleDownloadProgressEvt`, `handleExceptionThrown`, `handleExecutionContextsCleared`, `handleBindingCalled`) plus a `frameTrackerCtx` dep-bundle. The 320-line if-tree is replaced with `Match.value(msg.method).pipe(Match.when("Page.frameAttached", () => handleFrameAttached(msg, frameTrackerCtx)), ..., Match.orElse(() => Effect.void))`. File dropped out of both the high-complexity list and the refactoring-targets list. Worst remaining function in CdpPage.ts is `getByRole` at 10 cyc / 18 cog / 31.6 CRAP. CdpPage is **not** split into multiple services (see refactoring-targets table footnote). |
| `packages/browser-cdp/src/internal/Page/RouteWebSocket.ts`                                                                                                                                                                          | ~~line 766 — 21 cyclomatic, 30 cognitive, 212 lines~~ → below fallow's per-function threshold (post-refactor)       | ~~WebSocket interception has many code paths (frames, buffering, per-message dispatch).~~                                                                                                                                          | **Done.** Extracted `handleOnCreate`, `handleOnMessageFromPage`, `handleOnClosePage`, `handleOnMessageFromServer`, `handleOnCloseServer` closure-scoped helpers. Switch replaced with `Match.value(parsed).pipe(Match.when({ type: 'literal' }, ...), Match.exhaustive)` dispatch table. File dropped out of both the high-complexity list and the refactoring-targets list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `packages/browser-cdp/src/internal/Page/Route.ts`                                                                                                                                                                                   | ~~line 949 — 18 cyclomatic, 32 cognitive, 120 lines~~ → 13 cyclomatic, 11 cognitive, 101 lines (post-refactor)      | ~~HTTP request interception (route fulfilment, redirects, mocks).~~                                                                                                                                                                | **Done.** Extracted `shouldSkipHandler`, `removeHandlerIfExpired`, `buildContinueRequestWithOverrides`, `resolveAfterDispatch`, `removeFromInFlight` helpers from `dispatchRoute`. The function now sits below fallow's complexity threshold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/browser-cdp/src/internal/Page/Request.ts`                                                                                                                                                                                 | ~~line 331 `body` — 14 cyclomatic, 30 cognitive, 23 lines~~ → below fallow's per-function threshold (post-refactor) | ~~The IIFE that converts an Effect `HttpClientRequest.body` to a `BodyInit` for the WHATWG `Request` constructor — type-guard tree over `Uint8Array`, string, and tagged-union shapes (`_tag: \"Uint8Array\"`, `_tag: \"Raw\"`).~~ | **Done.** Extracted `extractBodyInit` module-scope helper. Composes refinements with `Predicate.and(Predicate.or(P.isTagged(\"Uint8Array\"), P.isTagged(\"Raw\")), P.hasProperty(\"body\"))` so the tag dispatch + property check + content extraction are all named operations instead of nested `                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                                                    | `/`&&`chains. 24-case behavioral equivalence test in`tests/unit/RequestBody.test.ts` asserts the refactor preserves the original's behavior on every input shape (including non-string tags like Stream/FormData which fall through). |
| `packages/browser-cdp/src/internal/Page/Evaluate.ts`                                                                                                                                                                                | `walk` — 16 cyclomatic, 18 cognitive, 43 lines                                                                      | Recursive walker over JS value graphs (handles cycles, refs).                                                                                                                                                                      | Acceptable; the walker is intrinsically branchy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `packages/browser-cdp/src/internal/Page/Util/browserSerializer.ts`                                                                                                                                                                  | `build` — 24 cyclomatic, 41 cognitive, 117 lines                                                                    | **Vendored from Playwright** (Apache 2.0, see `AGENTS.md` "Boundaries").                                                                                                                                                           | Do NOT refactor — vendored code must keep upstream line-shape for diff/cherry-pick.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `packages/browser-cdp/src/internal/Page/Check.ts`, `ElementState.ts`, `Fill.ts`, `Request.ts`, `UrlMatch.ts`, `StorageState.ts`, `Click.ts`, `Reload.ts`, `SelectorEngine.ts`, `KeyboardLayout.ts`, `Press.ts`, `Goto.ts`, `Pdf.ts` | HIGH (13–16 cyclomatic)                                                                                             | Each one is a single-method wrapper around a CDP domain that has many option/flag combinations (e.g. `Request.body()` parses 4 content-types with 3 stream modes).                                                                 | Acceptable. The branchy paths are inherent to "support all the upstream options."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `packages/browser-cdp/src/internal/Page/UrlMatch.ts`                                                                                                                                                                                | 16 cyclomatic, 38 cognitive                                                                                         | `globToRegexPattern` is a position-dependent single-pass character tokenizer; each branch's behavior depends on the surrounding chars (e.g. `**/` preceded by `/` emits `((.+/)                                                    | )`, preceded by other chars emits `(.\*/)`). Now byte-identical with Playwright upstream's `urlMatch.ts::globToRegexPattern`; the 22 parity tests in `tests/unit/cdp/UrlMatch.test.ts` lock the contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Acceptable. The complexity is inherited from upstream and cannot be reduced without changing the algorithm itself. |
| `tests/integration/shared/cdp/*.ts`                                                                                                                                                                                                 | `define*Tests` (1,500–1,800 LOC each)                                                                               | One wrapper per Playwright spec, mirroring upstream one-to-one.                                                                                                                                                                    | Do NOT split per-function — splitting would scatter the upstream-spec mapping across multiple files and make parity audits harder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Refactoring targets (current ranking)

Fallow's refactoring targets are ROI-ordered (impact ÷ effort):

| Score | Pri  | File                                                               | Why                                                        |
| ----- | ---- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| 9.9   | 29.6 | `packages/browser-playwright/src/internal/PlaywrightPage.ts`       | High-impact file with 4 dependents — every change ripples. |
| 7.6   | 15.1 | `packages/browser-cdp/src/internal/Page/UrlMatch.ts`               | `globToRegexPattern`, 38 cognitive.                        |
| 4.3   | 8.6  | `packages/browser-cdp/src/internal/Page/Util/browserSerializer.ts` | Vendored — track only, don't refactor.                     |

All CDP fallow targets except UrlMatch.ts (intentionally not refactored) and browserSerializer.ts (vendored) have been cleared. Tracking issue: see the project tracker.

**UrlMatch parity status:** as of the parity fix, `globToRegexPattern` is byte-identical with Playwright upstream (`packages/cloudflare-playwright/lib/playwright-core/src/utils/isomorphic/urlMatch.js::globToRegexPattern`) — including the `charBefore` branch in `**/X` handling that earlier CDP simplifications had elided, and the explicit comma escape outside `{...}` groups. Parity is locked in by `tests/unit/cdp/UrlMatch.test.ts` (22 cases covering literal pass-through, escapes, single/double/triple star, `**/` with and without preceding `/`, groups, and `urlMatches` semantics). A behavioral divergence that integration tests had silently shipped — `urlMatches("foo", "**/foo")` returning `true` instead of upstream's `false` — is now caught at unit-test time. The current cognitive complexity (38) is inherited from upstream and cannot be reduced without changing the algorithm itself.

## Inline suppressions

Use the standard format for inline suppressions:

<!-- verify:ignore -->

```typescript
// fallow-ignore-next-line unused-export
export const intentionalExport = ...;

// fallow-ignore-file complexity
// Test files have inherent complexity from multiple test cases
```

Always add a brief explanation for why the suppression is needed. The 3.4.2 release fixed every `To suppress:` hint in the human footer to name a token the suppression parser recognizes — following the printed hint now actually suppresses the issue. Earlier 2.x versions printed tokens like `unused-files` that the parser silently ignored, leaving stale markers on top of stale findings.

### Auditing suppressions (3.4.2+)

`fallow suppressions` lists every active `fallow-ignore-*` marker as a governance read-only surface:

```bash
fallow suppressions                          # human-readable, grouped per file
fallow suppressions --format json            # envelope (schema_version: 1) for tooling
fallow suppressions --file packages/cdp/X.ts # scope to one file
fallow suppressions --changed-since main     # scope to files changed vs. a ref
```

The output pairs with the dead-code run via a join (not a separate detection), so a `fallow dead-code --format json` finding's `markers_without_reason` count is the same number this command reports. Track that count in a code-health dashboard over time — a rising number often precedes a real suppression audit.

## Configuration

See `.fallowrc.json` for project-specific configuration:

- `entry` — additional entry points beyond the plugin auto-detection
- `ignorePatterns` — files excluded from analysis
- `ignoreDependencies` — names listed in `package.json` (real or TS path-alias) that the unused check should not flag. Used here to silence `@test/*` path-alias imports (`tsconfig.json` declares `@test/*: ["./tests/*"]`), since fallow's package-name scanner doesn't auto-derive tsconfig path aliases.
- `usedClassMembers` — framework-invoked method names that look unused but aren't
- `rules` — per-issue severity (off / warn / error) for dead-code categories

The `$schema` field in `.fallowrc.json` points at the **installed** copy (`./node_modules/fallow/schema.json`) rather than the remote URL — falls into VS Code as `untrusted`, requires no manual trust grant, and stays in sync with the installed version. Non-npm installs (cargo, homebrew) keep falling back to the remote URL (3.3.0+).

### MCP surface (governance for agents)

The fallow 3.x MCP server exposes the read-only governance commands as tools — relevant when an AI agent needs to inspect a project's tech-debt posture without shelling out to the CLI:

| Tool                                          | Wraps                                                       | Note                                                       |
| --------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| `list_suppressions` (3.4.2)                   | `fallow suppressions --format json`                         | Verbatim envelope; read-only, always exits 0.              |
| `recommend`                                   | `fallow recommend --format json`                            | Tailored config for cold-onboarding agents.                |
| `guard`                                       | `fallow guard <file> --format json`                         | Pre-edit architecture guard.                               |
| `impact_closure` (3.3.0)                      | `fallow dead-code --impact-closure <path> --format json`    | Blast radius for one file.                                 |
| `trace_export` / `trace_file` / `trace_clone` | matching fallow trace subcommands                           | Find symbol / file / clone fingerprint.                    |

These are governance surfaces, never gates — they always exit 0 even when findings exist. Wrap them in an analysis-friendly runtime (`FALLOW_TIMEOUT_SECS` generously on large repos).

## References

- Fallow docs: https://docs.fallow.tools
- Fallow issue types: see `fallow explain <type>` (e.g. `fallow explain code-duplication`, `fallow explain high-complexity`)
- `AGENTS.md` "Boundaries" — vendored-code rules
- `CONTRIBUTING.md` — verify pipeline
