# AGENTS.md

## Commands

- Build: `pnpm build`
- Test unit: `pnpm test:unit` — vitest unit tests (node)
- Test single: `pnpm tsx scripts/test-runner/TestRunner.ts unit -t "test name"`
- Test smoke: `pnpm test:smoke` — module-load check, all runtimes (no Chrome)
- Test integration: `pnpm test:integration` — Chrome + HTTP server, all runtimes
- Test providers: `pnpm test:providers` — all providers × runtimes (real APIs, costs money)
- Test stagehand: `pnpm test:stagehand` — Stagehand + LLM (real APIs, costs money)
- Test all: `pnpm test:all` — unit + integration
- Pre-push check: `pnpm run verify` — codegen freshness + check + build + unit + smoke + examples + docs (run before pushing)
- Release check: `pnpm run verify:release` — verify + integration (run before tagging a release)
- Check: `pnpm check` (lint + fallow + typecheck + fmt:check)
- Check all: `pnpm check:all` — check + smoke (bun + deno)
- Check fix: `pnpm check:fix` (fmt + lint --fix + typecheck + fallow)
- Examples prepare: `pnpm examples:prepare` — copy root `.env` to all examples (writes `.dev.vars` for `cf-workers/*`, `.env` for `cf-workers-alchemy/*`)
- Examples typecheck: `pnpm examples:typecheck` — typecheck examples

### Test runner: one command, flag-based selection

All test categories run through **one Effect CLI runner**:

```bash
pnpm tsx scripts/test-runner/TestRunner.ts <subcommand> [flags]
```

Subcommands: `unit` · `smoke` · `integration` · `providers` · `stagehand`. Bare
invocation prints `--help`; each subcommand has its own `--help`.

Flags are translated to each runtime's native form (vitest / deno test / bun test):

| Flag | Meaning |
| --- | --- |
| `-t <pattern>` / `--test <pattern>` | Run only tests matching pattern |
| `--verbose` | Verbose reporter (`--reporter=verbose` / `--verbose`) |
| `--fail-fast` | Stop on first failure (`--bail=1` / `--fail-fast` / `--bail`) |
| `--runtime node\|workerd\|workerd-nocompat\|deno\|bun` | Runtime (default `all`); not available on `unit` (vitest/node only); `providers`/`stagehand` accept `node\|workerd` only. `workerd-nocompat` runs workerd without the `nodejs_compat` flag — verifies the CDP module works with no Node compat layer. |
| `--no-smoke` | Skip the smoke gate that runs before each integration runtime |
| `--provider steel\|browserbase\|cf-browser-run` | Provider (default `all`); `providers` only |
| `-- <args...>` | Extra args forwarded raw to the test runner |

Examples:

```bash
# integration: node only, verbose, filtered, skip smoke
pnpm tsx scripts/test-runner/TestRunner.ts integration --runtime node --verbose --no-smoke -t "cookie"

# integration: all runtimes, fail-fast
pnpm tsx scripts/test-runner/TestRunner.ts integration --fail-fast -t "mouse"

# smoke: single runtime
pnpm tsx scripts/test-runner/TestRunner.ts smoke --runtime workerd

# providers: Steel only
pnpm tsx scripts/test-runner/TestRunner.ts providers --provider steel

# raw vitest passthrough
pnpm tsx scripts/test-runner/TestRunner.ts integration --runtime node -- --reporter=json
```

The npm scripts (`test`, `test:unit`, `test:smoke`, `test:integration`,
`test:providers`, `test:stagehand`) are thin aliases with no trailing `--`, so
flags forward cleanly: `pnpm test:integration --verbose --runtime node` works.

#### Runtime-specific behavior

- `--runtime workerd` integration **does not** include the Stagehand test as a
  side effect. Run Stagehand explicitly: `pnpm test:stagehand --runtime workerd`.
  The Stagehand workerd driver (`tests/integration/runtime/workerd/stagehand/driver.ts`)
  is a standalone script that uses `wrangler dev` instead of vitest-pool-workers
  due to the latter's dual-format module resolution bug —
  [cloudflare/workers-sdk#13037](https://github.com/cloudflare/workers-sdk/issues/13037).
  See also `pnpm test:stagehand:workerd` for direct invocation.

### Logging Test Output to File

**Always log test output to a file** under `/tmp/*.log`. Test output is large,
noisy, and interleaves with infra logs (HTTP server, Chrome startup). Trying
to `grep`/`head`/`tail` an interactive run is unreliable — the relevant
failure or `Effect.logInfo` line is rarely on the visible last screen, and
re-running the test to "see what happened" wastes minutes.

**Rule:** before running a test command, redirect its output to a log file,
then inspect that file:

```bash
# Always do this — terminal stays usable, output is preserved
pnpm test:integration --runtime node -t "shadow root" > /tmp/test-shadow.log 2>&1

# Then inspect with grep/head/tail freely
grep -E "FAIL|×|Total frames" /tmp/test-shadow.log
tail -40 /tmp/test-shadow.log
```

Other patterns:

```bash
# Redirect all output to file (terminal shows nothing)
pnpm test:integration > /tmp/test.log 2>&1

# Redirect stdout to file, keep stderr in terminal (errors visible)
pnpm test:integration > /tmp/test.log

# Append to existing file
pnpm test:integration >> /tmp/test.log 2>&1

# Single runtime with logging
pnpm test:integration --runtime node > /tmp/node-test.log 2>&1
```

**Common mistake to avoid:** running a test, seeing the result was "FAIL"
or that a test was supposed to print `Effect.logInfo`, and re-running
without a log file to "capture" the output. Always log first.

### Filtering by Test Domain

Tests are organized by domain (cdp, playwright, stagehand, providers). Filter with `-t`:

```bash
# Run only CDP tests
pnpm test:integration -t "cdp"

# Run only Playwright tests
pnpm test:integration -t "playwright"

# Run only Stagehand tests
pnpm test:integration -t "stagehand"

# Combine with runtime selection
pnpm test:integration --runtime node -t "cdp"
```

The `-t` flag matches against test names and file paths, so patterns like "cdp",
"playwright", "Mouse", "evaluate", etc. all work.

### LLM Workflow for Checks

1. Run `pnpm check` to lint and typecheck (doesn't modify files)
2. Make edits
3. Run `pnpm check:fix` to fix formatting/lint and verify all passes

### Playground for Quick Testing

Use `.llm/playground/*.ts` for testing short snippets and theories instead of inline test blocks:

- Create a file like `.llm/playground/test-theory.ts`
- Run with `pnpm tsx .llm/playground/test-theory.ts`
- Delete after use (directory is gitignored)

This saves tokens by avoiding inline test artifacts and keeps the session focused.

## Project Structure

- `packages/browser/` — `BrowserProvider` interface, types, shared utils (`@effect-libs/browser`)
- `packages/browser-cdp/` — Zero-dependency CDP client (experimental, not human-reviewed)
- `packages/browser-playwright/` — Playwright wrapper with Effect patterns
- `packages/browser-stagehand/` — AI-powered automation wrapper
- `packages/browser-providers/` — Steel, Browserbase, Cloudflare Browser Run
- `packages/cloudflare-playwright/` — Vendored fork of `@cloudflare/playwright@1.3.0` with the four patches applied (`@effect-libs/cloudflare-playwright`); upstream-synced via `pnpm --filter @effect-libs/cloudflare-playwright sync:upstream <version>`
- `tests/unit/` — Unit tests (no external services)
- `tests/integration/shared/` — Test definitions imported by runtimes (cdp, playwright, providers, stagehand)
- `tests/integration/runtime/` — Per-runtime test entry points (node, workerd, bun, deno). Node and workerd have `setup.ts` + `smoke.test.ts` + per-module entry points; bun and deno are smoke-only (no `setup.ts`, see CONTRIBUTING.md).
- `tests/integration/fixtures/` — Test HTML pages and click/select/input fixtures served by the HTTP server (the HTTP server itself lives in `tests/setup/`).
- `tests/setup/` — Global test setup (Chrome, HTTP server)
- `tests/utils/` — Test helpers and mocks
- `tests/fixtures/` — Certs and other shared fixtures
- `scripts/` — Dev tooling: `test-runner/` (public `TestRunner.ts` + `internal/`), `shared/` (CliFormat, FileWalker, ProcessSpawner helpers), `examples/`, `docs/`, plus `browser-cdp/` and `browser-playwright/` codegen scripts. See [`scripts/README.md`](./scripts/README.md) for the canonical layout.

## Searching

When using grep (or any search tool) to search this codebase, always exclude `node_modules` and `repos/`:

```bash
# ripgrep (preferred — auto-respects .gitignore)
rg --glob '!{node_modules,repos}' 'pattern'

# grep
 grep -R --exclude-dir=node_modules --exclude-dir=repos 'pattern' .
```

The `repos/` directory contains vendored external code for reference only and `node_modules` contains dependencies — neither should appear in search results.

## Vendored Repositories

This project vendors external repositories under `repos/` for coding agent reference.

- Use vendored repositories as read-only reference material
- Do not edit files under `repos/` unless explicitly asked
- Do not import from `repos/` — import from normal package dependencies

## Boundaries

- Always: Run `pnpm run verify` before pushing
- Always: Log test output to `/tmp/*.log` (see "Logging Test Output to File" above) — do not run tests interactively and try to `grep`/`head`/`tail` the visible output
- Never: Commit secrets, modify `patches/` without understanding implications
- Never: Modify `packages/browser-cdp/src/internal/Page/Evaluate/serialization/` — adapted from Microsoft Playwright, avoid changes to simplify upstream updates

## Git

- Conventional commits enforced via commitlint
- **pre-commit**: `lint-staged` (oxfmt + oxlint --fix on staged .ts files) + `tsgo --noEmit` (monorepo) + `examples:typecheck` + `fallow dead-code --fail-on-issues`
- **pre-push**: Full validation (`pnpm run verify`)
- Bypass with `--no-verify` if needed

## Agent skills

This repo is single-context. Before exploring:

1. Read `AGENTS.md` and `CONTRIBUTING.md` end-to-end. They are the canonical sources of conventions, commands, and project structure.
2. Skim the top-level `README.md` for the user-facing value proposition.
3. Use `gh` CLI for issue and PR work. Issues live in GitHub Issues, not local markdown.
4. Before writing user-facing copy (READMEs, docs/, `package.json` descriptions), read [`CONTEXT.md`](./CONTEXT.md) for terminology, positioning, and module scope.

Do not invent a separate set of agent conventions. This file is the contract.
