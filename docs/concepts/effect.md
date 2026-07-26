# Effect

The library is built on **Effect v4**. v4 differs significantly from v3 — most of the [official Effect documentation](https://effect.website/docs/introduction) describes v3, so when reading upstream material, watch for version-specific differences.

## If you already use Effect

Every operation returns an `Effect` with tagged errors. The result composes with the rest of the Effect ecosystem — layers, schedules, retries, tracing, etc. all work as expected.

Two places this changes your code:

- **Error handling.** Errors are tagged — `Effect.catchTag` gives compiler-checked exhaustiveness on every reason. See [Errors](./errors.md) for the type hierarchy, and the per-client error reference ([`browser-playwright`](../packages/playwright/errors.md), [`browser-cdp`](../packages/cdp/errors.md), [`browser-stagehand`](../packages/stagehand/errors.md)) for the reason-specific patterns.
- **Retries and timeouts.** `Effect.retry` / `Effect.timeout` work on the program directly — no per-call config. See [Cookbook → Retries and timeouts](../cookbook/retries-and-timeouts.md).

## If you're new to Effect

Effect is a TypeScript library for concurrent, type-safe programs with structured error handling and resource safety. Most of the official docs target v3; this library runs on **v4**. The conceptual model is the same; a few APIs have shifted — see [Where to go next](#where-to-go-next) below.

### Errors and context in the type signature

In typical TypeScript, a function either succeeds or throws:

<!-- verify:ignore -->

```typescript
const divide = (a: number, b: number): number => {
  if (b === 0) {
    throw new Error("Cannot divide by zero");
  }
  return a / b;
};
```

The return type tells you the success value, but not what can fail. Across hundreds of browser operations (navigation, clicks, screenshots, network calls), missing a `try` / `catch` — or a `finally` for cleanup — is easy.

Effect puts errors and context into the type signature:

<!-- verify:ignore -->

```typescript
import { Effect } from "effect";

const divide = (a: number, b: number): Effect.Effect<number, Error, never> =>
  b === 0 ? Effect.fail(new Error("Cannot divide by zero")) : Effect.succeed(a / b);
```

```text showLineNumbers=false
         ┌─── Produces a value of type number
         │       ┌─── Fails with an Error
         │       │      ┌─── Requires no dependencies
         │       │      │   from the Effect runtime
         ▼       ▼      ▼
Effect<number, Error, never>
```

The third type parameter — `R` — is the **context**: services the function requires from the Effect runtime. Instead of passing services through every function argument, you `yield*` them and provide them once at the program edge. That's what makes swapping a live `SteelProvider` for a mock in tests — or switching providers in production — a one-line change to `Layer.merge(...)`.

### Adopt incrementally

Effect is a toolkit. You can take pieces as you need them:

- **Start with `Effect.gen` / `yield*`** as a replacement for `async` / `await`. Run the program with `Effect.runPromise(program)` and you're done.
- **Add `Effect.catchTag`** for typed errors when you need to recover from specific failures.
- **Add retries, timeouts, and tracing** (`Effect.retry` / `Effect.timeout` / `Effect.withSpan`) once you need them.
- **Use layers and services** when you want to swap implementations.

### Where to go next

- [Effect introduction](https://effect.website/docs/introduction) — the canonical framing
- [Why Effect?](https://effect.website/docs/why-effect) — the deeper case

**Warning** The current official docs target **v3**, while this library runs on **v4**. If a snippet from upstream doesn't match the v4 API, the [v4 migration guide](https://effect.website/docs/guides/upgrading-to-v4) is the quickest bridge.

For community help: [Effect Discord](https://discord.gg/effect-ts), [Effect GitHub Discussions](https://github.com/Effect-TS/effect).

## If you don't want to learn Effect

1. **Use it as the library's API surface.** `Effect.gen` replaces `async`, `yield*` replaces `await`, `Effect.runPromise` is the entry point. Cleanup, typed errors, and composition work without further knowledge.
2. **Bypass it.** Install [`@effect-libs/cloudflare-playwright`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/cloudflare-playwright) directly for a patched `@cloudflare/playwright` without Effect. See the fork's [`README.md`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/cloudflare-playwright/README.md).

## See also

- [Overview — How they compose](../overview.md#how-they-compose) — the architecture that makes clients and providers interchangeable
- [Resources](./resources.md) — scoped cleanup, the Session / Connection / Context / Page hierarchy
- [Errors](./errors.md) — typed error hierarchies and `Effect.catchTag`