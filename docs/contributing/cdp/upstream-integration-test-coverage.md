# browser-cdp — Upstream Integration Test Coverage

> **Audience: maintainers of `@effect-libs/browser-cdp`.**
>
> For the user-facing reference of what `browser-cdp` supports vs upstream
> Playwright (✅/🚫 method-level table), see
> [`docs/reference/cdp-feature-parity.md`](../../reference/cdp-feature-parity.md).
> For the live numbers, see [`./upstream-integration-test-snapshot.md`](./upstream-integration-test-snapshot.md)
> (auto-generated; run `pnpm codegen:cdp:snapshot` to refresh).

How to track and grow the `browser-cdp`'s behavioral test coverage against
upstream Playwright. The `browser-cdp` (`@effect-libs/browser-cdp`) is a
zero-dependency CDP client with Effect patterns. We port upstream
Playwright specs as the source-of-truth for behavioral compatibility.

For general test-coverage expectations (mock layers, naming, file
layout), see the [Coverage Guide](../testing/coverage.md).

## How it works

The parity analyzer (`scripts/browser-cdp/generate-parity-snapshot.ts`) walks two
directories:

- **Upstream**: `repos/cloudflare-playwright/tests/page/*.spec.ts` —
  the reference test definitions.
- **Local**: `tests/integration/shared/cdp/*.ts` — `browser-cdp`
  integration tests.

It matches each upstream `it(...)` definition against local
`test.live(...)` calls by test name (normalized for case, whitespace,
quotes), then classifies each upstream test as one of:

| Local status                            | Classification  | Meaning                                              |
| --------------------------------------- | --------------- | ---------------------------------------------------- |
| A matching `test.live(...)` exists      | **Covered**     | We actively run this test                            |
| A matching `test.skip` with NOT_PLANNED | **NOT_PLANNED** | We explicitly don't want this behavior               |
| A matching `test.skip` with TODO        | **TODO**        | In scope, planned but not yet written                |
| A matching `test.skip` with BLOCKED     | **BLOCKED**     | In scope, blocked on infrastructure                  |
| No match                                | **Missing**     | Upstream test with no CDP counterpart — needs triage |

**Intended coverage** is the primary metric: `covered / (total - NOT_PLANNED)`.
NOT*PLANNED is excluded because it's work we've decided \_not* to do —
counting it would make the metric meaningless (you could "improve"
coverage by adding skip markers).

The full methodology and skip-category philosophy live in
[ADR-0001: Scraping-vs-testing scope](./decisions/0001-scraping-vs-testing-scope.md).

## Prerequisites

The analyzer compares local CDP tests against **upstream Playwright specs
vendored in `repos/cloudflare-playwright/`**. Without these vendored specs,
the analyzer cannot run.

```bash
# Clone the upstream Playwright (Cloudflare fork) into repos/
# NOTE: this checkout may ship with only `repos/effect-smol/` populated.
# Clone `repos/cloudflare-playwright/` yourself to run the parity analyzer.

# Expected layout once populated:
#   repos/cloudflare-playwright/
#     tests/page/                    # upstream Playwright page specs (.spec.ts)
#     packages/playwright-core/      # source for implementer reference
#   repos/effect-smol/               # populated (for Effect patterns)
#   repos/cloudflare-playwright/     # you populate this
```

If `repos/cloudflare-playwright/` is absent, `codegen:cdp:snapshot`
exits 0 with a warning and writes a placeholder to
`upstream-integration-test-snapshot.md` so the freshness check doesn't fail in
contributor envs.

## Running the analyzer

```bash
# Refresh the canonical snapshot
pnpm codegen:cdp:snapshot              # writes docs/contributing/cdp/upstream-integration-test-snapshot.md

# Freshness gate (CI): fail if the snapshot is stale
pnpm codegen:cdp:snapshot:freshness    # part of `pnpm verify`

# Ad-hoc analysis (one-off console / JSON output)
pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts                            # console
pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts json                       # JSON
pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts generate-skips             # emit test.skip lines
```

`scripts/README.md` documents the full CLI surface.

## Test naming convention

Parity tests **must** follow the naming convention to be matched against
upstream. The analyzer uses the spec file + test name as a composite key.

<!-- verify:ignore -->

```typescript
// ✅ Parity test — matches upstream test name exactly
test.live("page-goto.spec.ts - should work", () => ...)

// ✅ Variant tests — multiple CDP tests covering one upstream test
test.live("page-goto.spec.ts - should respect timeout - no url option", ...)
test.live("page-goto.spec.ts - should respect timeout - with url option", ...)
// Both count as coverage for upstream's "should respect timeout"

// ❌ Wrong — abbreviated name doesn't match upstream
test.live("page-goto.spec.ts - should dispatch click on Space press", ...)
// Upstream has: "should dispatch a click event on a button when Space gets pressed"

// ✅ Organic test — no spec prefix, tests our own behavior (excluded from parity count)
test.live("should work with networkidle", () => ...)
```

## Skip categories

Use these prefixes in `test.skip(...)` names to categorize the gap:

<!-- verify:ignore -->

```typescript
// NOT_PLANNED — out of scope, doesn't fit our aims
test.skip("page-eval.spec.ts - should work with ElementHandle [SKIP: NOT_PLANNED - ElementHandle not in CDP]", ...)

// TODO — planned but not yet implemented
test.skip("page-wait-for-function.spec.ts - should work on frame [SKIP: TODO - needs frame context]", ...)

// BLOCKED — infrastructure limitation that could be resolved
test.skip("page-goto.spec.ts - should work with bad SSL [SKIP: BLOCKED - needs HTTPS server]", ...)
```

| Category        | Marker                         | Meaning                                                                    | Examples                                                                                                   |
| --------------- | ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **NOT_PLANNED** | `[SKIP: NOT_PLANNED - reason]` | Out of scope, doesn't fit our aims. We explicitly don't want this feature. | ElementHandle API, actionability waiting, selector engine, CORS tests, service worker tests, dataURL tests |
| **TODO**        | `[SKIP: TODO - reason]`        | Planned to implement but not yet done. In scope.                           | Complex test needing investigation, frame tests, missing helper function                                   |
| **BLOCKED**     | `[SKIP: BLOCKED - reason]`     | Infrastructure limitation on something we DO want.                         | Needs HTTPS server, needs cross-origin server for a feature we want                                        |

**Key distinction:**

- **NOT_PLANNED** = Doesn't fit our aims. We explicitly don't want this.
  - API features that belong in Playwright wrapper, not `browser-cdp` (ElementHandle)
  - Features we've decided not to add (actionability waiting in CDP layer)
  - Tests not useful for our scope (CORS, service worker, dataURL)
  - Platform-specific behavior we don't want to emulate

- **TODO** = We plan to do this. It's in scope.
  - Tests we want to write but haven't gotten to
  - Features we want to add but need investigation
  - Missing fixtures we intend to create

- **BLOCKED** = Infrastructure limitation on something we DO want.
  - Test infrastructure we need for a feature that's in scope
  - We plan to add the infrastructure or wait for upstream fix

**Triage decision tree:**

1. "Does this fit our aims/scope?" If no → NOT_PLANNED
2. "Do we want this?" If yes but blocked by infra → BLOCKED
3. Otherwise → TODO

The `pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts generate-skips` command
emits `test.skip(...)` lines for every currently-missing upstream test,
using `[SKIP: TODO - implement]` as the default marker. Triage them in
batches: change NOT_PLANNED where appropriate, update the reason
comment, commit.

## Adding new parity tests

For a single missing test in an already-port-covered spec:

1. Find the upstream test in `repos/cloudflare-playwright/tests/page/`
2. Copy the **exact** test name — case, spacing, punctuation
3. Add `test.live("<spec-file>.spec.ts - <exact-name>")` to the
   matching file under `tests/integration/shared/cdp/`
4. Run `pnpm codegen:cdp:snapshot:freshness` to verify

For a brand-new spec (not just adding tests to an existing one):

1. **Read the upstream implementation** — start from
   `repos/cloudflare-playwright/packages/playwright-core/src/server/page.ts`
   (or whichever server file hosts the feature). Note any browser-side
   controllers or generated scripts; if the generator isn't vendored,
   you'll need a hand-rolled equivalent.

2. **Implement using Effect** — start with a naive port. Reuse existing
   helpers (`addInitScript`, `InjectedScript`, `AttachToTarget`) rather
   than inventing new plumbing.

3. **Generate skip tests** — run
   `pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts generate-skips` to scaffold
   a new `tests/integration/shared/cdp/<feature>.ts` with all upstream
   tests as `test.skip("... [SKIP: TODO]")` markers. Wire it into
   `defineAllCdpTests` in `tests/integration/shared/cdp/index.ts`.

4. **Write tests batch by batch** — un-skip a small batch (3–4 "basic"
   tests), adapt them to Effect patterns (see
   [testing-practices.md](../testing/testing-practices.md)), and run them.

5. **Iterate** — if a test fails, re-read the relevant upstream
   implementation, consult the existing clients, fix, re-run. Move to
   the next batch once green.

6. **Triage the rest** — once all reachable tests pass, walk through
   the remaining `test.skip` markers and decide NOT_PLANNED vs TODO vs
   BLOCKED for each (see decision tree above).

## Common pitfalls

| Problem                           | Symptom                       | Fix                                                                                                                                                                                                                             |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abbreviated test name             | Test not counted as covered   | Use exact upstream name                                                                                                                                                                                                         |
| Hyphen vs space (self-requesting) | Test not counted              | Match upstream exactly                                                                                                                                                                                                          |
| Organic test with spec prefix     | Inflates covered count        | Remove spec prefix                                                                                                                                                                                                              |
| Wrong spec file in prefix         | Test appears in wrong section | Correct the spec file name                                                                                                                                                                                                      |
| `for-of` expansion in upstream    | Test names counted as one     | Analyzer handles `for...of` loops with template-literal names (in `scripts/browser-cdp/shared/upstream-playwright-tests-parser.ts`); if a new spec uses a different expansion pattern (e.g. `Object.entries`), update that file |

## See also

- [Coverage snapshot](./upstream-integration-test-snapshot.md) — live snapshot, auto-generated from the analyzer
- [ADR-0001: Scraping-vs-testing scope](./decisions/0001-scraping-vs-testing-scope.md) — the `🚫` philosophy that explains the NOT_PLANNED bucket
- [ADR-0003: Effect-idiomatic API surface](./decisions/0003-effect-idiomatic-api-surface.md) — the page-level-context-extensions rationale that explains some CDP-Extension entries
- [User-facing feature reference](../../reference/cdp-feature-parity.md) — `@effect-libs/browser-cdp`'s deviations from upstream Playwright
