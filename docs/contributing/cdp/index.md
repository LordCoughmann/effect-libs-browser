# browser-cdp Internals

The `browser-cdp` (`@effect-libs/browser-cdp`) is the most complex part of this codebase. It implements a zero-dependency Chrome DevTools Protocol client with a Playwright-compatible API surface, and a few patterns have to be followed carefully for it to work correctly on edge runtimes.

> **AI / LLM usage:** The internals in `packages/browser-cdp/src/internal/` are coded by frontier LLMs through a human-in-the-loop TDD workflow. Read the full [AI / LLM usage disclosure](../../packages/cdp/index.md#ai--llm-usage-disclosure) before contributing — it covers the testing methodology, accuracy caveats, and what "human-in-the-loop" means in practice here.

Read these before touching `packages/browser-cdp/`.

## Docs

- [Navigation & concurrency](./navigation-concurrency.md) — PubSub subscriptions, the subscribe-before-async rule, fiber lifecycle, navigation event sequences.
- [Upstream integration test coverage](./upstream-integration-test-coverage.md) — How we track behavioral parity with upstream Playwright, and the parity analyzer (`scripts/browser-cdp/generate-parity-snapshot.ts`).
- [Event-delivery latency](./event-delivery-latency.md) — Why CDP `onConsole`/event streams have async delivery lag (upstream Playwright doesn't), and the stabilization-loop pattern tests must use to count events reliably.
- [Public types and internals](./public-types-and-internals.md) — Why `CdpConnection.subscribe`, `cdp`, and `events` are intentionally part of the public `CdpConnectionService` type (they're the parameter type of the public `page.use` escape hatch).

## Decisions (ADRs)

Non-obvious design decisions, captured for maintainers who need to deep-dive without combing through commit history. Each ADR has Context / Decision / Consequences / Alternatives / See also sections.

- [Decisions index](./decisions/index.md)
- [ADR-0001: Scraping-vs-testing scope](./decisions/0001-scraping-vs-testing-scope.md)
- [ADR-0002: Single-process architecture](./decisions/0002-single-process-architecture.md)
- [ADR-0003: Effect-idiomatic API surface](./decisions/0003-effect-idiomatic-api-surface.md)
- [ADR-0004: `Runtime.callFunctionOn` migration](./decisions/0004-callFunctionOn-migration.md)
- [ADR-0005: Tagged-error guard pattern](./decisions/0005-tagged-error-guard-pattern.md)
