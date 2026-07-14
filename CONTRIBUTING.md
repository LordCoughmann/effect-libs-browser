# Contributing

We welcome contributions via pull requests! Here are some guidelines to help you get started.

## Setup

```bash
git clone https://github.com/LordCoughmann/effect-libs-browser.git
cd effect-libs/browser
pnpm install
```

## Pull Requests

1. Create a branch from `main`
2. Make your changes and add tests if applicable
3. Run `pnpm run verify` (the `pre-push` hook does this automatically) — see [What runs where](#what-runs-where) below
4. Push and open a PR with a conventional commit message (e.g. `feat:`, `fix:`)

Git hooks run automatically:

- **pre-commit** — lint, typecheck, dead-code check, examples typecheck
- **pre-push** — full `pnpm run verify`

Bypass with `--no-verify` if needed.

## What runs where

Testing is split into tiers, and not all tiers run in CI:

| Tier            | Command                | Runs in CI?                                                              | Runs locally             | When                       |
| --------------- | ---------------------- | ------------------------------------------------------------------------ | ------------------------ | -------------------------- |
| **Fast**        | `pnpm check`, `pnpm test:unit` | Yes — [`.github/workflows/ci.yml`](.github/workflows/ci.yml)             | Always                   | Every commit, every PR     |
| **Standard**    | `pnpm run verify`      | No                                                                       | `pre-push` hook          | Before pushing             |
| **Release**     | `pnpm run verify:release` | No                                                                    | Manual                   | Before tagging a release   |

`pnpm run verify` is the middle ground: lint, typecheck, fallow, fmt check, build, unit, smoke,
examples, docs. It does **not** include integration tests — those are reserved for the
release tier.

> **Note on the script name:** these scripts used to be called `ci` / `ci:release`. The
> names were misleading because CI doesn't actually run them — they're for the local
> pre-push safety net. They were renamed to `verify` / `verify:release`.

## What's not in any tier

These are never in CI and never in `pnpm run verify`. Run them manually when they apply:

- **`pnpm test:integration`** — runs against real Chrome. The CI workflow intentionally
  skips these; see the comment in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
  - **If your change touches a module or provider**, run
    `pnpm tsx scripts/test-runner/TestRunner.ts integration --runtime node` (optionally filtered with `-t`)
    before merging to catch regressions early. This is a manual step because integration
    tests need a real Chrome and aren't in the regular CI path.
  - Use `pnpm run verify:release` to run integration tests as part of a release-readiness check.
- **`pnpm test:providers`** — real provider APIs, costs money. Only run if you touched
  `packages/browser-providers/`.
- **`pnpm test:stagehand`** — real LLM API, costs money. Only run if you touched
  `packages/browser-stagehand/`.
- **Public API changes** need a matching update to `docs/` and possibly `examples/`.
  CI doesn't check this.

## Testing

See [Testing Practices](docs/contributing/testing-practices.md) for our testing philosophy, patterns, and what not to test.

```bash
pnpm test:unit                    # Unit tests (no external services)
pnpm test:smoke                   # Smoke tests — all runtimes (module-load check)
pnpm test:integration             # Integration tests — all runtimes (Chrome + HTTP server)
pnpm test:all                     # Unit + integration
```

All categories run through one runner (`scripts/test-runner/TestRunner.ts`) with flag-based selection:

```bash
pnpm tsx scripts/test-runner/TestRunner.ts smoke --runtime workerd
pnpm tsx scripts/test-runner/TestRunner.ts integration --runtime node --verbose --no-smoke -t "cookie"
pnpm tsx scripts/test-runner/TestRunner.ts providers --provider steel
pnpm tsx scripts/test-runner/TestRunner.ts --help
```

See [`AGENTS.md`](./AGENTS.md#test-runner-one-command-flag-based-selection) for the full flag reference.

### Providers (real APIs, costs money)

```bash
pnpm test:providers               # All providers × runtimes
pnpm tsx scripts/test-runner/TestRunner.ts providers --provider steel   # Steel only
pnpm tsx scripts/test-runner/TestRunner.ts providers --runtime workerd  # Workerd only
```

Requires API keys in `.env` (`STEEL_API_KEY`, `BROWSERBASE_API_KEY`, `CF_ACCOUNT_ID` + `CF_API_TOKEN`). Run with:

```bash
npx dotenvx run -- pnpm test:providers
```

### Stagehand (requires `OPENAI_API_KEY`)

```bash
pnpm test:stagehand               # Stagehand — all runtimes
pnpm tsx scripts/test-runner/TestRunner.ts stagehand --runtime node     # Node only
pnpm tsx scripts/test-runner/TestRunner.ts stagehand --runtime workerd  # Workerd only (wrangler workaround)
```

## Runtimes

This library runs on Node.js, Cloudflare Workers (workerd), Bun, and Deno. Integration tests use a shared/runtime split:

```
tests/integration/
├── shared/                        # Test definitions (imported by runtimes)
│   ├── cdp/cdp.ts                 #   CDP integration tests
│   ├── playwright/playwright.ts   #   Playwright integration tests
│   ├── providers/                 #   Provider integration tests
│   └── stagehand/stagehand.ts     #   Stagehand integration tests
└── runtime/
    ├── node/                      # Node.js entry points + setup
    ├── workerd/                   # Cloudflare Workers entry points + setup
    ├── bun/                       # Bun entry points (smoke only)
    └── deno/                      # Deno entry points (smoke only)
```

- **Smoke tests** (`smoke.test.ts`) verify that every public module imports without error in each runtime. Every runtime must have one.
- **Shared tests** define the actual assertions once; runtime entry points just `import { defineXxxTests }` and provide the test adapter + config.

When adding a new public module or feature:

1. Add a `test("module loads")` import line to **every** runtime's `smoke.test.ts`
2. If the feature has integration tests, add them under `shared/` and wire them into each runtime's entry point
3. Run `pnpm test:smoke` to verify all runtimes pass

## Adding a New Provider

When adding a new browser provider (e.g. `packages/browser-providers/src/myprovider/`):

1. **Implement** — Follow the [Adding a Provider Guide](docs/providers/adding-a-provider.md)
2. **Tests** — Add at minimum:
   - Unit tests in `tests/unit/` for your provider logic
   - Integration test entries (see existing patterns in `tests/integration/`)
3. **Examples** — Add matching examples under `examples/cf-workers/`:
   - One CDP example: `hackernews-cdp-<provider>/`
   - One Playwright example: `hackernews-playwright-<provider>/`
   - Run `pnpm examples:prepare` to sync versions and copy `.env`
4. **Verify** — `pnpm run verify` must pass (includes build, tests, and `examples:typecheck`)

> **Tip:** `pnpm run verify` typechecks all examples, so a missing or stale example
> will fail the check. If you're unsure, just run `pnpm run verify`.

## Updating Patches

The `@cloudflare/playwright` patches live in the [`@effect-libs/cloudflare-playwright`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/cloudflare-playwright) fork, not in this monorepo (`patches/` is empty here — the old `pnpm patch`-based mechanism was replaced by the fork). To rebase onto a new upstream release:

1. In the fork repo, run [`scripts/sync-upstream.sh <new-version>`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/cloudflare-playwright/scripts/sync-upstream.sh). This replaces the vendored files with the new upstream tarball.
2. Re-apply the four patches per [`patches/CHECKLIST.md`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/cloudflare-playwright/patches/CHECKLIST.md). The script does not auto-apply them because line offsets shift on every upstream release.
3. Bump the fork's own `0.x` version, update `patches/BASE_VERSION`, and update the fork README's upstream-tracking line.
4. From this monorepo: `pnpm install` then `pnpm test:integration --runtime node -t "playwright"`.

## Commit Messages

This project uses [conventional commits](https://www.conventionalcommits.org/):

```
<type>: <description>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Releasing

This project uses [release-please](https://github.com/googleapis/release-please) to automate releases. There is no manual release step.

1. Merge PRs with conventional commit messages — release-please automatically opens a release PR (e.g. `chore(main): release 0.2.0`) with the generated changelog
2. Review the changelog and merge the release PR when ready — this creates a git tag and GitHub release

## Dependency Updates

Dependabot runs on a **monthly** cadence (`.github/dependabot.yml`). The rationale:

- This is a **library**, not an app. Most npm bumps (vitest, dotenvx, tsx, lint-staged, fallow, oxlint, oxfmt) are internal dev tooling that downstream consumers never see. Bumping them continuously is pure PR noise.
- We bundle every monthly update into **one PR per ecosystem** (`groups: { all: { patterns: ["*"] } }`). One review, one merge, one changelog entry.
- The npm ecosystem is fast — weekly PRs are usually superseded before they're reviewed (a bump lands, a newer version ships the next day, the PR is stale).
- **Peer deps that affect consumers** (effect, `@effect/*`, the provider SDKs, playwright, wrangler) are still bumped monthly but reviewed more carefully — see the supported version range in the root `package.json` and `pnpm-workspace.yaml` catalog.

**Security alerts are independent of the version-update schedule.** GitHub Dependabot security alerts run continuously on every published advisory and are enabled at the repo level (Settings → Code security and analysis). Those are not throttled by the monthly schedule.

What to do when the monthly Dependabot PR opens:

1. Read the diff. For dev-only deps, default to merge.
2. For peer-dep bumps that change public API surface (effect majors, provider SDK majors), follow the bumping checklist before merging.
3. Don't enable auto-merge for Dependabot PRs — the override/ignore list (`playwright` vendoring, future pins) is intentional, and a missed `pnpm-workspace.yaml` adjustment can break the build.

Bumping outside the monthly cadence is fine for security fixes and for known-needed peer-dep ranges (e.g., before a release that needs to drop support for an old effect version). Just don't expect to see Dependabot queue it for you.

## Code Style

- [Oxlint](https://oxlint.rs) for linting
- [Oxfmt](https://oxlint.rs) for formatting
- [Fallow](https://fallow.dev) for dead-code detection
- TypeScript strict mode (`tsgo --noEmit`)
- Effect v4 patterns

```bash
pnpm check                        # Lint + dead-code + typecheck + fmt check
pnpm check:fix                    # Fix formatting/lint and verify
```

## Reference docs (conventions)

CI enforces the *what*. These docs in `docs/contributing/` explain the *why* behind the conventions:

- [Testing practices](docs/contributing/testing-practices.md) — Effect v4 testing patterns, what to test, what not to test.
- [Writing code examples in docs](docs/contributing/docs-examples.md) — How the doc verifier works.
- [Coverage guide](docs/contributing/coverage.md) — Test paradigm and expected coverage.
- [Fallow compliance](docs/contributing/fallow.md) — Why certain fallow findings are accepted.
- [CDP navigation & concurrency](docs/contributing/cdp/navigation-concurrency.md) — PubSub patterns, the subscribe-before-async rule, fiber lifecycle. Read before touching `packages/browser-cdp/`.
- [CDP upstream integration test coverage](docs/contributing/cdp/upstream-integration-test-coverage.md) — How we track behavioral parity with upstream Playwright.
- [CDP decisions (ADRs)](docs/contributing/cdp/decisions/index.md) — Why the CDP module is shaped the way it is. Read ADR-0001 → ADR-0002 → ADR-0003 in order before changing the public surface; check ADR-0004 / ADR-0005 when touching the `evaluate` pipeline or error-handling code.
