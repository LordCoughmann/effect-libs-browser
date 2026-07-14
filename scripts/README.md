# Scripts

Utility scripts for development, testing, codegen, and docs.

## Structure

```
scripts/
├── test-runner/                      # Test-related files (mirrors packages/<name>/src/)
│   ├── TestRunner.ts                 # Public entry: library exports (types, helpers, runSubcommand) + CLI subcommand dispatch
│   └── internal/                     # Implementation details (mirrors packages/<name>/src/internal/)
│       ├── TestRunnerArgs.ts        # TestFlags + per-runtime flag → argv conversion (vitest/deno/bun)
│       ├── TestRunnerCategories.ts  # Per-category command builders (unit/smoke/integration/providers/stagehand)
│       ├── TestRunnerInfra.ts       # Chrome + HTTP server setup (InfraLayer, ensureInfra, runInfraForever)
│       └── TestRunnerRuntimes.ts    # Runtime × config table (single source of truth for argsFn/usesVitest)
├── browser-cdp/                      # Scripts serving packages/browser-cdp/ — codegen + parity tooling
│   ├── generate-protocol.ts          # Emit packages/browser-cdp/src/internal/CdpProtocol.ts (from devtools-protocol)
│   ├── generate-parity-snapshot.ts   # Emit docs/contributing/cdp/upstream-integration-test-snapshot.md (parity coverage)
│   ├── generate-parity-not-planned.ts # Emit tests/integration/shared/cdp/_parityNotPlanned.ts (skip markers for out-of-scope specs)
│   └── shared/
│       └── upstream-playwright-tests-parser.ts # Shared parser: test definitions in upstream *.spec.ts files
├── docs/                             # Doc tooling (see scripts/docs/README.md)
│   ├── verify-examples.ts            # Verify TS code blocks in markdown compile
│   └── fixtures/                     # Verifier self-test fixtures
├── examples/                         # Example utility scripts
│   ├── copy-env.ts                   # Copy root .env to all examples
│   └── typecheck.ts                  # Typecheck all examples (tsgo)
└── shared/                           # Cross-cutting helpers consumed by scripts/<x>/
    ├── ProcessSpawner.ts             # execInherit, execAndCapture — spawn a process, return {exitCode, output?}
    └── FileWalker.ts                 # walkEntries — recursive directory walk with predicate filter
```

## Test runner

**One command, five subcommands, flag-based selection** (the `cargo test` / `go test`
model). Invoke via `pnpm tsx scripts/test-runner/TestRunner.ts <subcommand> [flags]`.
Bare invocation prints `--help`; each subcommand has its own `--help`.

```
subcommands: unit | smoke | integration | providers | stagehand
flags:       --verbose --fail-fast -t/--test <pattern> -- <raw passthrough>
             --runtime node|workerd|workerd-nocompat|deno|bun|all   (smoke / integration; providers / stagehand: node|workerd|all)
             --no-smoke                            (integration — skip the smoke gate)
             --provider steel|browserbase|cf-browser-run|all   (providers)
```

```bash
pnpm tsx scripts/test-runner/TestRunner.ts integration --runtime node --verbose --no-smoke -t "cookie"
pnpm tsx scripts/test-runner/TestRunner.ts smoke --runtime workerd
pnpm tsx scripts/test-runner/TestRunner.ts providers --provider steel
pnpm tsx scripts/test-runner/TestRunner.ts --help
```

The npm scripts (`test`, `test:unit`, `test:smoke`, `test:integration`, `test:providers`,
`test:stagehand`) are thin aliases; flags forward cleanly because they have no trailing `--`.
See [`AGENTS.md`](../AGENTS.md#test-runner-one-command-flag-based-selection) for the full flag reference.

`test-runner/` mirrors `packages/<name>/src/`: one public entry file
(`TestRunner.ts`) + an `internal/` subfolder for the implementation. The library
exports of `TestRunner.ts` (types, helpers, `runSubcommand`) are consumed by
`TestRunnerCategories.ts`, `TestRunnerInfra.ts`, and `TestRunnerRuntimes.ts`.
The CLI section of `TestRunner.ts` is gated by `import.meta.url === ...` so
importing the file for its exports does NOT trigger CLI execution.

- `TestRunner.ts` (public) — library exports (`CommandBuilder`, `BeforeHook`,
  `SubcommandSpec`, `TestFlags`, `runCmd`, `asOk`, `runSubcommand`,
  `vitestArgs`, `vitestArgsWithJsonReport`, `denoTestArgs`, `bunTestArgs`,
  `execArgs`, `isFailureExit`, `CommandFailure`, `SmokeTestFailure`) + CLI
  subcommand dispatch.
- `internal/TestRunnerArgs.ts` — `TestFlags` + per-runtime flag → argv
  conversion (`vitestArgs`, `vitestArgsWithJsonReport`, `denoTestArgs`,
  `bunTestArgs`). Lives separately to break the cycle: `TestRunner.ts`
  imports `TestRunnerCategories.ts` for the CLI section, and
  `TestRunnerCategories.ts` / `TestRunnerRuntimes.ts` consume these args.
- `internal/TestRunnerCategories.ts` — per-category command builders
  (unit/smoke/integration/providers/stagehand).
- `internal/TestRunnerInfra.ts` — Chrome + HTTP server setup. Exports
  `InfraLayer`, `ensureInfra`, `runInfraForever`. When invoked directly, runs
  `runInfraForever` (manual infra CLI).
- `internal/TestRunnerRuntimes.ts` — runtime × config table (single source of
  truth for `argsFn` / `usesVitest`).

The wrangler-dev Stagehand workaround lives separately at
`tests/integration/runtime/workerd/stagehand/driver.ts` (standalone script).

## Codegen

Codegen scripts live in `scripts/<package>/` — one folder per package they serve,
mirroring the `packages/<package>/` layout. Cross-cutting tools (test-runner,
docs, examples) stay at the root.

### `browser-cdp/generate-protocol.ts`

Generates `packages/browser-cdp/src/internal/CdpProtocol.ts` — a type-only Effect-ified CDP protocol
interface, reading `devtools-protocol/json/*.json`. CI checks freshness via
`pnpm codegen:cdp:protocol:freshness`.

```bash
pnpm codegen:cdp:protocol                  # regenerate
pnpm codegen:cdp:protocol:freshness        # fail if committed file is stale
```

### `browser-cdp/generate-parity-snapshot.ts`

Compares upstream Playwright specs against local CDP test implementations and emits the parity coverage snapshot.

Arguments are positional (format first, optional `--out <path>` for file output).
Exits 0 with a warning when vendored upstream specs are absent (see
[`docs/contributing/cdp/upstream-integration-test-coverage.md`](../docs/contributing/cdp/upstream-integration-test-coverage.md)).

```bash
pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts                                # console report
pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts json                           # machine-readable JSON
pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts markdown                       # markdown to stdout
pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts markdown --out ./report.md     # markdown to file
pnpm tsx scripts/browser-cdp/generate-parity-snapshot.ts generate-skips                 # emit test.skip lines
```

Two npm scripts wrap the markdown output:

```bash
pnpm codegen:cdp:snapshot              # regenerate docs/contributing/cdp/upstream-integration-test-snapshot.md
pnpm codegen:cdp:snapshot:freshness    # regenerate + fail if file is stale (used in `pnpm verify`)
```

### `browser-cdp/generate-parity-not-planned.ts`

Generates `tests/integration/shared/cdp/_parityNotPlanned.ts` — `test.skip(...)`
declarations for upstream Playwright specs that are deliberately out of scope for the
browser-cdp (ElementHandle API, expect() assertions, selector engine internals, etc.).

```bash
pnpm codegen:cdp:parity-not-planned          # regenerate
pnpm codegen:cdp:parity-not-planned:freshness # regenerate + fail if file is stale (used in `pnpm verify`)
```

## Docs

See [`docs/README.md`](./docs/README.md) for the markdown example verifier
(`verify-examples.ts`) — extracts TS code blocks from markdown and compiles them.
Pass `--format` to format code blocks in place instead of type-checking.

```bash
pnpm docs:typecheck                       # = pnpm tsx scripts/docs/verify-examples.ts
pnpm docs:format                          # = pnpm tsx scripts/docs/verify-examples.ts --format
pnpm docs:typecheck docs/guides/foo.md    # type-check a specific subset (positional paths)
```

## Integration helpers

### `test-runner/internal/TestRunnerInfra.ts`

Standalone Chrome + HTTP server bootstrap for the "start infra in one terminal, run
tests in another" workflow. Exports `runInfraForever`; when this file is invoked
directly, the CLI gate runs it.

```bash
pnpm tsx scripts/test-runner/internal/TestRunnerInfra.ts
```

Outputs `CHROME_WS_URL` and `HTTP_BASE_URL`. Press `Ctrl+C` to stop.

The unified runner starts its own infra on demand (via `ensureInfra`), so this
manual CLI is only needed for the "split terminal" debugging workflow.

## Example Scripts

### `copy-env.ts`

Copy root `.env` to all example directories. Two passes based on which marker file is present:

- `examples/cf-workers/*/.dev.vars` — Workers examples (have `.dev.vars.example`)
- `examples/cf-workers-alchemy/*/.env` — Alchemy examples (have `.env.example`)

```bash
cp .env.example .env   # then edit with your API keys
pnpm examples:prepare  # = pnpm tsx scripts/examples/copy-env.ts
```

### `typecheck.ts`

Typecheck all examples with Effect's language service (`tsgo`). Generates
`worker-configuration.d.ts` if needed.

```bash
pnpm examples:typecheck  # = pnpm tsx scripts/examples/typecheck.ts
```

## Cross-cutting helpers

Helpers consumed by multiple script folders. Distinguished from
`scripts/<x>/shared/` (e.g. `scripts/browser-cdp/shared/`), which is private to a single
subfolder's scripts.

### `shared/ProcessSpawner.ts`

Process-spawn helpers. Both functions swallow spawn failures and signal non-zero exit via
`exitCode` (defaulting to `1` on spawn error), so the returned Effect never fails — callers
branch on `exitCode`. Two modes:

- `execInherit(command, args, { cwd? })` — spawn, inherit stdio, return `{ exitCode }`.
  Use for fire-and-forget commands whose output the user sees (e.g. `wrangler types`).
- `execAndCapture(command, args, { cwd? })` — spawn, capture combined stdout+stderr, return
  `{ exitCode, output }`. Use for commands whose output you parse or display
  (e.g. `tsgo --noEmit`, `oxfmt`).

### `shared/FileWalker.ts`

Directory-walk helper. `walkEntries(rootDir, options)` recursively walks `rootDir`,
returning entries that pass `options.filter` (an Effect-returning predicate, so callers can
do `fs.exists`/`fs.readFileString` checks inside it). Skips `node_modules` and `.git` by
default; `stat` failures per-entry are silently swallowed; `readDirectory` failures
propagate as `PlatformError`. Used by `verify-examples.ts` (find `.md` files), `copy-env.ts`
(find dirs with marker file), `typecheck.ts` (find dirs with `tsconfig.json`).

## Related

- Test infrastructure: `tests/setup/`
- Test utilities: `tests/utils/`
- Vitest configs: `vitest.*.config.ts`
- Test runner flags: [`AGENTS.md`](../AGENTS.md#test-runner-one-command-flag-based-selection)
