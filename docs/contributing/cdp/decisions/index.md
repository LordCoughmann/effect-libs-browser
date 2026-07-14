# `@effect-libs/browser-cdp` Decisions (ADRs)

Architecture decision records for `@effect-libs/browser-cdp`. Each ADR captures one non-obvious design decision: the context, the decision, the consequences, and the alternatives considered.

These are **maintainer-facing** — they answer "why is `@effect-libs/browser-cdp` this way?" without requiring a reader to comb through git history. Public API users will find the `🚫` rationale and Effect-idiomatic deviations in [`docs/reference/cdp-feature-parity.md`](../../../reference/cdp-feature-parity.md); this directory is for the deeper "why we did it this way and not that way" rationale.

## Index

| #    | Decision                                                                             | One-line                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 | [Scraping-vs-testing scope](./0001-scraping-vs-testing-scope.md)                     | `@effect-libs/browser-cdp` is built for scraping, not testing. Methods that exist only for testing ergonomics are marked `🚫`.                                                                                                                                       |
| 0002 | [Single-process architecture](./0002-single-process-architecture.md)                 | `@effect-libs/browser-cdp` runs in one process; frame chains are `string[]`, not selector strings with wire-encoding markers. No selectors engine vendoring.                                                                                                         |
| 0003 | [Effect-idiomatic API surface](./0003-effect-idiomatic-api-surface.md)               | Properties as `Effect<T>`, events as `Stream<T>`, page-level helpers for context-level APIs. Three stable deviations from upstream Playwright.                                                                                                                       |
| 0004 | [`Runtime.callFunctionOn` migration](./0004-callFunctionOn-migration.md)             | P6: deleted ~200 LOC of in-house serializer glue; centralized the serialization boundary in the vendored `utilityScriptSerializers.ts`.                                                                                                                              |
| 0005 | [Tagged-error guard pattern](./0005-tagged-error-guard-pattern.md)                   | P16: `Predicate.isTagged(tag)` over `instanceof X` for tagged errors. Centralized type guards in `CdpError.ts`.                                                                                                                                                      |
| 0006 | [No imports inside `evaluate` payload arrow bodies](./0006-ssr-import-constraint.md) | Functions passed to `evaluatePage`/`evaluateHandle` must not reference imports — Vite SSR injects `__vite_ssr_import_0__` on workerd, throwing `ReferenceError` at browser-eval time. Use native JS (`typeof`, `Array.isArray`, `instanceof`) inside payload bodies. |

## How to read these

If you're new to `@effect-libs/browser-cdp`, read 0001 → 0002 → 0003 in order. They establish the philosophy, the architecture, and the API surface respectively. 0004 and 0005 are about specific P-phase refactors that build on 0002.

If you're debugging a specific subsystem:

- Frame traversal / `FrameLocator` / iframe chains → 0002 (and the implementation in [`packages/browser-cdp/src/internal/Page/FrameLocator.ts`](../../../../packages/browser-cdp/src/internal/Page/FrameLocator.ts)).
- Events (`onConsole`, `onRequest`, etc.) → 0003 (and [`docs/packages/cdp/streams.md`](../../../packages/cdp/streams.md)).
- `evaluate` / `evaluateHandle` / arg passing → 0004 (and [`packages/browser-cdp/src/internal/Page/Evaluate.ts`](../../../../packages/browser-cdp/src/internal/Page/Evaluate.ts)).
- Writing an arrow body that ships to the browser → **0006** (no imports inside `evaluatePage`/`evaluateHandle` payload bodies; Vite SSR injects `__vite_ssr_import_0__` on workerd).
- Error discrimination / `_tag` checks → 0005 (and [`packages/browser-cdp/src/CdpError.ts`](../../../../packages/browser-cdp/src/CdpError.ts)).

If you're adding a new feature, read 0001 first to confirm the feature fits the scraping scope. Then check 0003 to see if the API shape needs to be Effect-idiomatic.

## ADR format

Each ADR follows the MADR-lite structure:

- **Front-matter** — `Status`, `Date`, `Source` (which phase or commit established this).
- **Context** — the constraint or motivation.
- **Decision** — what we decided.
- **Consequences** — what it enables; what it forecloses; what it costs.
- **Alternatives considered** — what we didn't pick and why.
- **See also** — cross-refs to code, related docs, related ADRs.

Grep-friendly: `grep "## Decision" docs/contributing/cdp/decisions/*.md` lists every ADR's decision section. `grep "Status:" docs/contributing/cdp/decisions/*.md` lists every ADR's lifecycle status.

## Adding a new ADR

1. Pick the next number (`0006-...`).
2. Use the MADR-lite structure above.
3. Cross-reference related ADRs in the `## See also` section.
4. Add the entry to the index table above.
5. Don't supersede an existing ADR without writing a new one that explicitly says "Supersedes ADR-NNN" in its Context.
