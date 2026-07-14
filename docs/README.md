# Documentation

> **New here?** Start with [Getting started →](./getting-started.md) for install + first session, then explore from here. The [root README](../README.md) is the project overview.

## Start here

- [Overview →](./overview.md) — what the library does and who it's for
- [Getting started →](./getting-started.md) — install + run your first session
- [Migrating from Playwright →](./migrations/from-playwright.md) — if you're coming from vanilla Playwright

For runnable patterns after the basics, see the [Cookbook →](./cookbook/managing-sessions.md).

## Concepts

- [Client + provider →](./concepts/client-and-provider.md) — the client + provider architecture, how they compose, choosing a client and a provider
- [Resources →](./concepts/resources.md) — Session → Connection → Context → Page hierarchy, lifecycle, pooling, auth persistence
- [Effect →](./concepts/effect.md) — why the library uses Effect, how to compose with it, escape hatch for non-Effect use
- [Errors →](./concepts/errors.md) — typed error hierarchies, `catchTag`, `isRetryable`

## Cookbook

- [Managing sessions](./cookbook/managing-sessions.md) — session → connection → context → page, pooling, fan-out
- [Retries and timeouts](./cookbook/retries-and-timeouts.md) — `Effect.retry` + `Schedule` patterns for browser operations
- [Reusing auth](./cookbook/reusing-auth.md) — cookies, storage state, persistent profiles
- [Swapping providers](./cookbook/swapping-providers.md) — same program, different layer
- [Working with pages](./cookbook/working-with-pages.md) — common page operations, escape hatches, multiple pages

## Guides

- [Cloudflare Workers](./guides/cloudflare-workers.md) — Workers-specific setup, limitations, workarounds

## Reference

- [Runtime & Browser Support](./reference/runtime-and-browser-support.md) — edge-runtime compatibility matrix
- [`browser-cdp` — Feature Parity with Upstream Playwright](./reference/cdp-feature-parity.md) — `browser-cdp`'s deviations from upstream Playwright
- [FAQ](./faq.md) — common questions
- [Examples](../examples/README.md) — Hacker News scrapers across all clients and providers

## Comparisons

How this library stacks up against alternatives:

- [`browser-playwright` — alternatives](./packages/playwright/comparison.md) — vs upstream Playwright, `@cloudflare/playwright`, `browser-cdp`
- [`browser-stagehand` — alternatives](./packages/stagehand/comparison.md) — vs `@browserbasehq/stagehand`, Stagehand v2.5
- [`browser-cdp` — alternatives](./packages/cdp/comparison.md) — vs upstream Playwright, simple-cdp, CRI, `@cloudflare/playwright`
- [Side-by-side rewrites](./comparisons/side-by-side.md) — provider docs rewritten with this library

## Contributing

See [`./contributing/`](./contributing/) for maintainer docs (testing, JSDoc conventions, CDP internals, decisions). Public contributors don't need to read these — they're for maintainers and the few who want to deep-dive on the design rationale.
