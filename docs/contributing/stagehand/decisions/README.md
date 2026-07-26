# `@effect-libs/browser-stagehand` Decisions (ADRs)

Architecture decision records for `@effect-libs/browser-stagehand`. Each ADR captures one non-obvious design decision: the context, the decision, the consequences, and the alternatives considered.

These are **maintainer-facing** — they answer "why is `@effect-libs/browser-stagehand` this way?" without requiring a reader to comb through git history. Public API users will find the rationale surfaced in [`CONTEXT.md`](../../../../CONTEXT.md) under "What we don't claim" and in [`docs/packages/stagehand/`](../../../packages/stagehand/); this directory is for the deeper "why we did it this way and not that way" rationale.

Sister directories:

- **browser-cdp** — [`docs/contributing/cdp/decisions/`](../../cdp/decisions/) (six ADRs covering scope, architecture, API surface, and package-internal refactors).

## Index

| #    | Decision                                                                         | One-line                                                                                                                                                                                                                               |
| ---- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 | [Stagehand `agent` primitive not wrapped](./0001-stagehand-agent-not-wrapped.md) | `browser-stagehand` exposes Stagehand's `agent` primitive through the `instance.use` escape hatch, not a first-class service method — a wrapper would be a thin pass-through over a configuration-heavy, `@experimental` upstream API. |

## How to read these

If you're new to `@effect-libs/browser-stagehand`, read [`CONTEXT.md`](../../../../CONTEXT.md) first — it captures the language, anti-claims, and package scope. The ADRs in this directory are the deep dives into specific decisions that don't fit on a single bullet in `CONTEXT.md`.

## ADR format

Each ADR follows the MADR-lite structure (mirrors
[`docs/contributing/cdp/decisions/0001-scraping-vs-testing-scope.md`](../../cdp/decisions/0001-scraping-vs-testing-scope.md)):

- **Front-matter** — `Status`, `Date`, `Source` (which phase or commit established this).
- **Context** — the constraint or motivation.
- **Decision** — what we decided.
- **Consequences** — what it enables; what it forecloses; what it costs. Split into Positive / Negative / Costs.
- **Alternatives considered** — what we didn't pick and why.
- **See also** — cross-refs to code, related docs, related ADRs.

Grep-friendly: `grep "## Decision" docs/contributing/stagehand/decisions/*.md` lists every ADR's decision section. `grep "Status:" docs/contributing/stagehand/decisions/*.md` lists every ADR's lifecycle status.

## Adding a new ADR

1. Pick the next number (`0002-...`). ADRs in this directory are stagehand-specific; `browser-cdp` has its own counter under `docs/contributing/cdp/decisions/`.
2. Use the MADR-lite structure above.
3. Cross-reference related ADRs (including the CDP ones) in the `## See also` section.
4. Add the entry to the index table above.
5. Don't supersede an existing ADR without writing a new one that explicitly says "Supersedes ADR-NNN" in its Context.
