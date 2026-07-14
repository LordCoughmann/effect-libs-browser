# ADR-0001: Scraping-vs-Testing Scope

> `@effect-libs/browser-cdp` is built for **scraping**, not end-to-end testing. Methods that exist only for testing ergonomics are deliberately skipped and marked `🚫` in the parity table.

**Status:** Accepted
**Date:** 2026-07-02
**Source:** Module inception; reinforced across phases P1–P16 and the `cdp-feature-parity.md` Scraping scope section.

## Context

The `@effect-libs/browser` monorepo contains two browser-automation clients:

- **`@effect-libs/browser-playwright`** — a thin Effect wrapper around `@cloudflare/playwright` (our fork of upstream Playwright). Full feature surface, including all testing-utility APIs.
- **`@effect-libs/browser-cdp`** — a zero-dependency direct-Chrome-DevTools-Protocol implementation. Smaller, Effect-native, intended for a different use case.

The two clients coexist because they target different jobs. Conflating them would either:

- Bloat `@effect-libs/browser-cdp` with testing-utility code that has no value to scrapers, or
- Strip `@effect-libs/browser-playwright` of features that test users need.

We need a clean, documented split.

## Decision

`@effect-libs/browser-cdp` is built for **scraping** — headless data extraction, form interaction, network inspection, multi-page workflows. It is **not built for end-to-end testing** — assertion APIs, actionability auto-waiting, HAR replay, video recording, interactive debugging.

Methods that exist only for testing ergonomics are deliberately skipped. They are listed in the [Scraping vs testing scope](../../../reference/cdp-feature-parity.md#scraping-vs-testing-scope) section of [`docs/reference/cdp-feature-parity.md`](../../../reference/cdp-feature-parity.md) with a one-line rationale. Users who need them use `@effect-libs/browser-playwright` or the `use()` escape hatch.

## What is `🚫` (and why)

Each `🚫` row in the parity doc carries a one-line rationale. The omissions table is in [`cdp-feature-parity.md`](../../../reference/cdp-feature-parity.md#scraping-vs-testing-scope); here is the rationale taxonomy:

| Category              | Examples                                                            | Why skipped                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actionability waiting | `addLocatorHandler`, `removeLocatorHandler`, `pointerup/down` waits | Test-only auto-handling of dialogs / overlays / race-condition races. Scraping wants explicit failures.                                                                    |
| HAR / replay          | `routeFromHAR`                                                      | Replay recorded HTTP interactions. Scraping captures its own state; replay is a test-utility.                                                                              |
| Recording             | `video()`                                                           | Record video of session. Test artifact, not a scraping output.                                                                                                             |
| Interactive debugger  | `pause()`                                                           | Interactive debugger. Doesn't fit headless / server-side scraping.                                                                                                         |
| Browser-internal hint | `requestGC()`                                                       | GC hint for browser-internal test runs. `browser-cdp` can't usefully invoke it.                                                                                            |
| Tab management        | `opener()`                                                          | Tab-management helper for `window.opener`. No popup API in CDP.                                                                                                            |
| Accessibility tree    | `ariaSnapshot()`, `toMatchAriaSnapshot()`                           | Aria tree for assertions. Scraping reads DOM text directly.                                                                                                                |
| Pre-Locator API       | `ElementHandle`, `elementHandles`, `frameElement`                   | Pre-Locator API. `@effect-libs/browser-cdp` is deliberately locator-only (see Q2 in the original coverage-parity doc, archived to git history).                            |
| Assertion API         | `expect()` and the entire matcher family                            | Assertion API. Scraping tests results against its own state.                                                                                                               |
| `runBeforeUnload`     | (boolean setter)                                                    | Scraping **wants** unload handlers to run so pending state (analytics, fetch keepalive, beacons, localStorage flushes) lands. Suppression is a test-ergonomics affordance. |

## Consequences

- **API surface smaller and focused.** The parity table is the contract: every `✅` row is implementable in `@effect-libs/browser-cdp`, every `🚫` row is a deliberate omission, every `❌` row is upstream-only.
- **Clear upgrade path.** Users who hit a `🚫` method switch to `@effect-libs/browser-playwright` — no fudging, no escape-hatch wiring.
- **The `use()` escape hatch** (`page.use((cdp, sid) => ...)`) gives direct Chrome DevTools Protocol access for the rare case where a scraper needs upstream-protocol-style access to a `🚫` feature.
- **`@effect-libs/browser-playwright` bears the cost of testing ergonomics** at zero marginal implementation cost (it's a thin wrapper around `@cloudflare/playwright`).

## Alternatives considered

- **Implement everything in `@effect-libs/browser-cdp`.** Rejected. Actionability auto-waiting alone is ~1000 LOC of state-machine plumbing. `@effect-libs/browser-playwright` already implements it; the marginal cost to `@effect-libs/browser-cdp` is high and the marginal value to scrapers is zero.
- **Implement testing-only features behind a flag.** Rejected. We'd maintain two code paths, neither well-tested.
- **Strip `@effect-libs/browser-playwright` and ship a single combined module.** Rejected. It would either bloat the API surface for scrapers (including the testing APIs) or strip features from test users.

## See also

- [`docs/reference/cdp-feature-parity.md`](../../../reference/cdp-feature-parity.md) — omissions table with `🚫` rows and per-row rationale.
- [`docs/packages/cdp/index.md`](../../../packages/cdp/index.md) — module entry point.
- [`docs/packages/cdp/comparison.md`](../../../packages/cdp/comparison.md) — side-by-side with `@effect-libs/browser-playwright`.
- ADR-0003 (Effect-idiomatic API surface) — the sibling source of "we diverge from upstream Playwright on purpose."
