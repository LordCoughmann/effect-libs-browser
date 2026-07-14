# Test Suite

This directory contains all tests for `@effect-libs/browser`. Every category runs through one CLI runner: `pnpm tsx scripts/test-runner/TestRunner.ts <subcommand> [flags]`. See [`CONTRIBUTING.md`](../CONTRIBUTING.md) and [`AGENTS.md`](../AGENTS.md#test-runner-one-command-flag-based-selection) for the full flag reference and tier policy.

## Categories

| Category    | Subcommand    | Purpose                                 | Cost        |
| ----------- | ------------- | --------------------------------------- | ----------- |
| Unit        | `unit`        | Service interface with mocks (Node)     | Free        |
| Smoke       | `smoke`       | Module-load check, per runtime          | Free        |
| Integration | `integration` | Real browser automation (Chrome + HTTP) | Free        |
| Provider    | `providers`   | Real external provider APIs             | Costs money |
| Stagehand   | `stagehand`   | Stagehand + LLM (real API)              | Costs money |

All categories support `--runtime node|workerd|deno|bun|all` (default `all`); `providers` additionally has `--provider steel|browserbase|cf-browser-run|all`. Common flags: `-t <pattern>`, `--verbose`, `--fail-fast`.

## Tiers (when each command runs)

| Tier         | Command(s)                                                            | Runs in CI?                      | When                                         |
| ------------ | --------------------------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| **Fast**     | `pnpm check` + `pnpm test:unit`                                       | Yes (`.github/workflows/ci.yml`) | Every commit, every PR                       |
| **Standard** | `pnpm run verify`                                                     | No (local `pre-push` hook)       | Before pushing                               |
| **Release**  | `pnpm run verify:release`                                             | No (manual)                      | Before tagging a release                     |
| **Manual**   | `pnpm test:integration`, `pnpm test:providers`, `pnpm test:stagehand` | No                               | Before merging changes to packages/providers |

`pnpm run verify` does **not** include integration tests. It is a lint + typecheck + build + unit + smoke + examples + docs sweep that runs as the local `pre-push` safety net. See [`CONTRIBUTING.md`](../CONTRIBUTING.md#what-runs-where) for the canonical description of what each tier enforces.

## Directory structure

```
tests/
├── unit/                                    # Unit tests (vitest, Node.js only)
│   ├── cdp/                                 #   CDP connection / message / serialization
│   ├── playwright/                          #   Playwright wrapper
│   ├── stagehand/                           #   Stagehand wrapper
│   ├── providers/                           #   Provider unit tests
│   └── utils/                               #   Shared Effect/Schema helpers
│
├── integration/                             # Integration tests (Chrome + HTTP server)
│   ├── shared/                              #   Test definitions, imported by runtimes
│   │   ├── cdp/                             #     ~30 CDP feature test files
│   │   ├── playwright/                      #     Playwright API tests
│   │   ├── providers/                       #     Steel, Browserbase, CF Browser Run
│   │   └── stagehand/                       #     Stagehand AI tests
│   ├── runtime/                             #   Per-runtime entry points
│   │   ├── node/                            #     Node (setup.ts, smoke.test.ts, cdp/, playwright/, stagehand/, providers/)
│   │   ├── workerd/                         #     Cloudflare Workers (vitest-pool-workers; full suite)
│   │   ├── bun/                             #     Bun (smoke + cdp integration)
│   │   └── deno/                            #     Deno (smoke + cdp integration)
│   └── fixtures/                            #   HTTP test pages + registry
│
├── setup/                                   # Test infrastructure (started by the orchestrator)
│   ├── chrome.ts                            #   Chrome lifecycle (start, stop, kill)
│   └── http-server.ts                       #   HTTP/HTTPS test server
│
├── utils/                                   # Test helpers
│   ├── helpers.ts                           #   Error categorization
│   ├── mocks.ts                             #   Layer mocks for unit tests
│   ├── config/                              #   Env var config loaders
│   └── effect-test/                         #   TestApi adapters (Vitest / Bun / Deno)
│
└── fixtures/                                # Static assets (e.g. TLS certs)
```

### Why a shared / runtime split?

Each runtime runs a different test framework:

- **Node** — vitest
- **workerd** — vitest with `@cloudflare/vitest-pool-workers` (miniflare bindings)
- **Bun** — `bun test`
- **Deno** — `deno test` (with `@std/testing/bdd`)

To avoid duplicating every test N times, the actual assertions live under `integration/shared/`. Each runtime directory contains only a thin entry point that imports the shared definitions and registers them with a per-runtime `TestApi` adapter. Adding a new feature test = add one file under `shared/`, wire it into that module's `index.ts`, and it runs in every runtime that supports it.

The test runner (`scripts/test-runner/TestRunner.ts`) spawns Chrome and the HTTP server itself (the "orchestrator") and exports their URLs as `CHROME_WS_URL` / `HTTP_BASE_URL` before launching the test process. Workerd tests read those via miniflare bindings (`tests/integration/runtime/workerd/env.ts`), not `process.env`.

## Running tests

```bash
pnpm test:unit                       # unit only (Node)
pnpm test:smoke                      # smoke, all runtimes
pnpm test:integration                # integration, all runtimes
pnpm test:providers                  # real provider APIs, all runtimes
pnpm test:stagehand                  # Stagehand + LLM, all runtimes
pnpm test:all                        # unit + integration

# Per-runtime:
pnpm tsx scripts/test-runner/TestRunner.ts integration --runtime node
pnpm tsx scripts/test-runner/TestRunner.ts smoke --runtime workerd

# Pattern filter:
pnpm tsx scripts/test-runner/TestRunner.ts integration --runtime node -t "cookie"
```

Provider and Stagehand tests need real API keys — load `.env` via `dotenvx`:

```bash
npx dotenvx run -- pnpm test:providers
npx dotenvx run -- pnpm test:stagehand
```

## Environment variables

Read by the test runner (or by the per-runtime setup). Defaults shown in parentheses.

| Variable                        | Purpose                                               | Default                       |
| ------------------------------- | ----------------------------------------------------- | ----------------------------- |
| `CHROME_WS_URL`                 | WebSocket URL Chrome is listening on                  | `ws://localhost:9222`         |
| `HTTP_BASE_URL`                 | Base URL for the test HTTP server                     | `http://localhost:3000`       |
| `CHROME_PATH` / `CHROMIUM_PATH` | Chrome/Chromium binary path                           | Auto-detected                 |
| `BROWSER_MODE`                  | `"local"` (orchestrator-spawned Chrome) or `"remote"` | `"local"`                     |
| `BROWSER_WS_URL`                | WebSocket URL when `BROWSER_MODE=remote`              | (required in remote mode)     |
| `LLM_MODEL`                     | Stagehand / Stagehand-tests LLM model                 | `mistral/mistral-medium-2508` |
| `LLM_API_KEY`                   | LLM provider key (Stagehand tests)                    | (none)                        |
| `LLM_BASE_URL`                  | LLM provider base URL                                 | (provider default)            |
| `STEEL_API_KEY`                 | Steel provider API key                                | (none)                        |
| `BROWSERBASE_API_KEY`           | Browserbase provider API key                          | (none)                        |
| `CF_ACCOUNT_ID`                 | Cloudflare account ID (CF Browser Run)                | (none)                        |
| `CF_API_TOKEN`                  | Cloudflare API token (CF Browser Run)                 | (none)                        |

The orchestrator exports `CHROME_WS_URL` and `HTTP_BASE_URL` itself; you usually only set them manually if running a test file directly.

## Adding tests

### For a new feature in an existing module

1. **Unit test** — add `*.test.ts` under `tests/unit/<module>/`, using mock layers from `tests/utils/mocks.ts`. See [`docs/contributing/testing/testing-practices.md`](../docs/contributing/testing/testing-practices.md) for the standardized pattern.
2. **Integration test** (if the feature hits a real browser) — add a `defineXxxTests` file under `tests/integration/shared/<module>/` and export it from that module's `index.ts`. Each runtime's entry point picks it up automatically.

### For a new public module

If you're exposing a brand-new entry point from `src/`:

1. Add it to `package.json` `exports`
2. Add a one-line `test("module loads", ...)` import to **every** runtime's `smoke.test.ts`
3. Run `pnpm test:smoke` to confirm all runtimes load it

### For a new runtime

To add another runtime beyond Node/workerd/Bun/Deno:

1. Create `tests/integration/runtime/<new>/` with:
   - `setup.ts` — validates `CHROME_WS_URL` and `HTTP_BASE_URL` (see `runtime/node/setup.ts` for the contract)
   - `smoke.test.ts` — module-load check for every public module
   - Per-module directories (e.g. `cdp/`) with thin entry points that import from `integration/shared/`
2. Add a `TestApi` adapter in `tests/utils/effect-test/` for the new runtime's test framework
3. Register the runtime in `scripts/test-runner/internal/TestRunnerCategories.ts` (extend `SMOKE_RUNTIMES` / `INTEGRATION_RUNTIMES` as appropriate)
4. Run `pnpm tsx scripts/test-runner/TestRunner.ts smoke --runtime <new>` to confirm

Don't create a top-level `tests/<runtime>/` directory — everything lives under `tests/integration/runtime/`.

## Troubleshooting

### Chrome not found

```bash
export CHROME_PATH=/usr/bin/google-chrome
export CHROMIUM_PATH=/usr/bin/chromium
```

### Port already in use

Tests use 9222 (Chrome) and 3000 (HTTP):

```bash
lsof -ti:9222 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### workerd: `CHROME_WS_URL not set`

`@cloudflare/vitest-pool-workers` reads bindings from `wrangler.test.jsonc`, and workerd's `process.env` does **not** see the orchestrator's exports. Access them through `cloudflare:workers`'s `env`, not `process.env` — see `tests/integration/runtime/workerd/env.ts`.

### Bun / Deno: tests run but only smoke + CDP

This is intentional. Bun and Deno only have `smoke.test.ts` and `cdp/` integration entry points today. Adding Playwright / providers / stagehand entries is a future concern; the shared/runtime architecture already supports it (just add the entry file under `runtime/<bun|deno>/<module>/`).
