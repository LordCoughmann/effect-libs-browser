# ADR-0001: Stagehand `agent` Primitive Not Wrapped

> `browser-stagehand` deliberately does not wrap Stagehand's `agent` primitive (`v3.agent({...}).execute(...)`) as a first-class service method. Users reach it through the `instance.use` escape hatch.

**Status:** Accepted
**Date:** 2026-07-08
**Source:** Original wrapper design (P15); rationale captured retroactively in [`CONTEXT.md`](../../../../CONTEXT.md) under "What we don't claim" and in [`docs/packages/stagehand/index.md`](../../../packages/stagehand/index.md) under "Not wrapped by design".

## Context

The `browser-stagehand` package wraps upstream [`@browserbasehq/stagehand`](https://www.npmjs.com/package/@browserbasehq/stagehand) v3 on Cloudflare Workers. The wrapper exposes three Stagehand AI verbs through the `instance.use` escape hatch:

- `s.act(instruction)`
- `s.extract(instruction, schema)`
- `s.observe(instruction)`

Stagehand v3 ships a fourth verb — `agent` — with a different shape:

<!-- verify:ignore -->

```ts
// v3.d.ts
agent(options: AgentConfig & { stream: true }): {
  execute: (opts: string | AgentStreamExecuteOptions) => Promise<AgentStreamResult>;
};
agent(options?: AgentConfig & { stream?: false }): {
  execute: (opts: string | AgentExecuteOptions) => Promise<AgentResult>;
};
```

It is a **two-step API**: configure once (`v3.agent({...})` returns an `AgentInstance`), then call `.execute(...)`. The configuration surface is large — [`AgentConfig`](https://github.com/browserbase/stagehand/blob/main/packages/core/lib/v3/types/public/agent.d.ts) covers `systemPrompt`, `tools`, `integrations` (MCP `Client[]` or string refs), `model`, `executionModel` (separate model for tool execution), `mode: "dom" | "hybrid" | "cua"`, and `stream`. The `mode: "cua"` (Computer Use Agent) option requires provider-specific API keys for Anthropic Claude, Google Gemini, OpenAI computer-use, or Microsoft Fara. Per-execute options add `output` (Zod schema), `variables` (form-fill vars), `excludeTools`, `callbacks` (`onStepFinish` / `onChunk` / `onFinish` / `onError` / `onAbort` / `onSafetyConfirmation`), `signal`, `messages` (conversation continuation), `useSearch`, and `toolTimeout`.

The upstream type definitions are also peppered with `@experimental` markers, and the `cua` config field is explicitly marked `@deprecated` in favor of `mode: "cua"`. The API is in motion.

## Decision

`@effect-libs/browser-stagehand` does **not** wrap the `agent` primitive as a first-class service method. Users reach it through the `instance.use` escape hatch, the same path used for `act` / `extract` / `observe`:

<!-- verify:ignore -->

```ts
yield* instance.use((s) =>
  s.agent({ mode: "dom" }).execute({
    instruction: "find the cheapest product",
    output: productZod, // from toZodSchema()
  }),
);
```

The escape-hatch call already wires Effect cancellation, typed error wrapping into `StagehandError`, and `AbortSignal` propagation. The only thing it forgoes is a typed `Effect` / `Stream` adapter for `stream: true` and a first-class `instance.agent()` method.

## Consequences

### Positive

- **No thin wrapper to maintain.** The wrapper's `act` / `extract` / `observe` surface is itself mostly the escape hatch plus `toZodSchema` for `extract`. The agent primitive would not get a comparable convenience — the configuration step (`v3.agent({...})`) is API-passthrough, and the `output` Zod schema can already be supplied via `toZodSchema`.
- **No coupling to an unstable upstream contract.** The agent API is `@experimental` upstream; pinning our public API to it would force us to track breaking changes for an unstable surface.
- **No CUA credential plumbing.** Wrapping the agent would require deciding how to surface the Browserbase / Anthropic / Google / OpenAI / Microsoft API-key requirement for `mode: "cua"`, which is a meaningful design surface in its own right.
- **Node.js / Bun / Deno users have a clear upgrade path.** The escape-hatch framing makes it obvious that upstream `@browserbasehq/stagehand` is the right choice for those runtimes anyway — the wrapper exists for Cloudflare Workers.
- **Clear "deliberate non-feature" signal.** The `CONTEXT.md` anti-claim and the `Not wrapped by design` table row in `docs/packages/stagehand/index.md` tell readers the gap is intentional, not a TODO.

### Negative

- **No `Stream`-typed streaming.** Users who set `stream: true` get back an `AgentStreamResult` (an `ai` package `StreamTextResult`) through the escape hatch. A wrapper could expose this as `Stream.Stream<A, StagehandError>`. We don't.
- **No typed `Effect` adapter.** A wrapper could return `Effect<AgentResult, StagehandError, ...>` for the non-streaming case with a more precise error type than the escape-hatch `OperationError` wrap. We don't.
- **The escape hatch is one more thing to learn.** Users have to read upstream Stagehand docs to know what `agent({...}).execute(...)` accepts. The wrapper doesn't add documentation for the agent surface.

### Costs

- **Future reconsideration is non-trivial.** If the upstream API stabilizes and the value of a typed wrapper grows (e.g., new callback types land), the wrapper would need to be added without breaking existing escape-hatch users. The escape-hatch path is forward-compatible by design.
- **CUA mode is hidden from Cloudflare Workers users who might benefit from it.** A user who wants Computer Use Agent on Cloudflare Workers has to read upstream Stagehand docs and figure out the credential plumbing themselves.

## Alternatives considered

- **Wrap `agent` as a first-class method (`instance.agent(config, fn)`).** Rejected. The configuration is API-passthrough, the upstream API is unstable, and the wrapper would not add real lift over the escape hatch.
- **Wrap only the non-streaming `agent.execute({...})` (skip `stream: true`).** Rejected. Half a wrapper invites users to hit a wall when they try streaming. Either wrap the whole thing or expose via the escape hatch.
- **Wrap `agent.execute` with a `Stream` adapter for `stream: true` and let `stream: false` go through the escape hatch.** Rejected. Two paths to the same primitive, with one having first-class type-safety and the other not, is worse than one path.
- **Add the `agent` API to `@effect-libs/browser-stagehand` and re-evaluate after the upstream `@experimental` markers come off.** Accepted as the forward path — this ADR is the lock on the current decision, not a permanent ban. When upstream stabilizes, revisit.

## See also

- [`CONTEXT.md`](../../../../CONTEXT.md) — the source-of-truth for terminology, anti-claims, and package scope.
- [`docs/packages/stagehand/index.md`](../../../packages/stagehand/index.md) — the package landing page; the `Not wrapped by design` table row links here.
- [`docs/packages/stagehand/errors.md`](../../../packages/stagehand/errors.md) — the `Not wrapped by design` section has the escape-hatch code example.
- [`packages/browser-stagehand/src/Stagehand.ts`](../../../../packages/browser-stagehand/src/Stagehand.ts) — the wrapper implementation; the `instance.use` escape hatch is in `makeInstance`.
- [`packages/browser-stagehand/src/StagehandTypes.ts`](../../../../packages/browser-stagehand/src/StagehandTypes.ts) — the type contract for `StagehandInstance` and the scope bundles.
- [`docs/contributing/cdp/decisions/0001-scraping-vs-testing-scope.md`](../../cdp/decisions/0001-scraping-vs-testing-scope.md) — sibling ADR style: "deliberate omissions" framing for a different package.
