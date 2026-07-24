# `browser-stagehand`

AI-powered browser automation with natural-language instructions. Stagehand v3 on Cloudflare Workers.

> **Stable.** Runs upstream Stagehand v3 on Cloudflare Workers via runtime polyfills (`ws`, `AsyncLocalStorage.enterWith`). For Node/Bun/Deno, use the original `@browserbasehq/stagehand`.
>
> **AI / LLM usage.** This package is a thin wrapper around upstream `@browserbasehq/stagehand`. The wrapper code is LLM-assisted but small in volume and human-reviewed — there is no large LLM-generated surface area to disclose the way `browser-cdp` does. Note that this package calls an LLM at runtime for `act` / `extract` / `observe` — every call costs money and adds latency. See the [`browser-cdp` AI / LLM usage disclosure](./../cdp/index.md#ai--llm-usage-disclosure) for the broader project disclosure.

## Install

```bash
pnpm add @effect-libs/browser-stagehand @browserbasehq/stagehand effect@beta
```

`effect` is a peer dependency — `effect@beta` installs the latest v4 beta.

## Resource acquisition

Stagehand has two scope levels — **session** and **connection**. The `instance` is the unit of work; there is no context/page nesting.

| Method                      | Bundle                  |
| --------------------------- | ----------------------- |
| `withSession({ provider })` | `{ session, instance }` |
| `withConnection(source)`    | `{ instance }`          |

`source` is `{ url: string }` (raw CDP endpoint) or `{ session }` (provider session).

## Instance API

All operations go through `instance.use((s, signal) => ...)`, which provides the raw Stagehand v3 object and an `AbortSignal` wired to Effect cancellation:

| Method                         | Description                           |
| ------------------------------ | ------------------------------------- |
| `act(instruction)`             | natural-language action               |
| `act(instruction, options)`    | action with model override            |
| `extract(instruction, schema)` | structured extraction with Zod schema |
| `observe(instruction)`         | list of possible actions              |
| `page`                         | direct access to Playwright page      |

Full Stagehand API: [docs.stagehand.dev](https://docs.stagehand.dev/).

## Schema conversion errors

`toZodSchema` converts **Effect Schema → JSON Schema (draft-2020-12) → Zod v4** and can fail on the second hop (Zod's `fromJSONSchema` is experimental and does not yet cover every JSON Schema feature). When it does, `toZodSchema` returns an `Effect` that fails with `SchemaConversionError` — it does **not** throw.

`SchemaConversionError` is a separate error from `StagehandError` (different `_tag`: `"effect-libs/browser/SchemaConversionError"`). It is **not** wrapped under `StagehandError`, so it is not visible to a `catchTag("effect-libs/browser/StagehandError", ...)` handler. Catch it explicitly:

<!-- verify:ignore -->

```typescript
import { Effect } from "effect";
import { toZodSchema } from "@effect-libs/browser-stagehand";

const program = Effect.gen(function* () {
  // For known-good schemas (Struct of primitive fields), this succeeds.
  const productZod = yield* toZodSchema(ProductSchema).pipe(
    Effect.catchTag(
      "effect-libs/browser/SchemaConversionError",
      (e) =>
        // Fallback: hand-written Zod schema, or fail the program with
        // a clearer message.
        Effect.fail(new Error(`Could not derive Zod for ProductSchema: ${e.reason}`)),
    ),
  );
  return yield* instance.use((s) => s.extract("get product details", productZod));
});
```

When it fires — practical cases:

| Effect Schema shape                                 | Why it fails                                              | Workaround                                                     |
| --------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `Schema.Record(...)` with non-`string` keys         | JSON Schema allows string keys only                       | Define the shape as `Schema.Struct` instead                    |
| `Schema.Union(...)` of incompatible members         | Zod's `fromJSONSchema` may not emit a discriminated union | Use `Schema.Struct` with optional fields, or write Zod by hand |
| Recursive schemas (`Schema.suspend`)                | JSON Schema `$ref` round-tripping is fragile in Zod v4    | Write Zod by hand                                              |
| `Schema.instanceOf(...)` for class-based validation | Not representable in JSON Schema                          | Convert to a primitive-shape schema                            |

In practice, `SchemaConversionError` is rare for common patterns (`Schema.Struct` of primitives, arrays of structs, nested structs). For unusual shapes, prefer a hand-written Zod schema and pass it directly to `s.extract`. See [SchemaConversionError](./errors.md#schema-conversion-errors) for the full error fields and `cause` shape.

## Polyfills

Two runtime shims are needed on Cloudflare Workers. Both ship with the package and only require configuration (no code changes).

- **`ws` → native WebSocket.** Stagehand v3 imports Node.js's `ws` package internally to talk to CDP endpoints. Cloudflare Workers doesn't have Node `net`/`tls`, so the npm `ws` package fails. Add a wrangler alias that points `ws` at our Cloudflare Workers-compatible shim:

  ```jsonc
  // wrangler.jsonc
  {
    "alias": {
      "ws": "@effect-libs/browser-stagehand/ws"
    }
  }
  ```

  See the polyfill's [`top-level JSDoc`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-stagehand/src/polyfills/ws.ts) for the full `wrangler.jsonc` alias, what the polyfill does and does not support (notably: no custom headers, text frames only), and the rationale for Cloudflare Workers-only targeting.

- **`AsyncLocalStorage.enterWith()` → patched for Cloudflare Workers.** Stagehand v3 calls `enterWith()` from `node:async_hooks`; Cloudflare Workers' implementation intentionally throws because `enterWith()` mutates context for the remaining async chain, which is unsafe across concurrent requests. The polyfill ([source](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-stagehand/src/polyfills/asyncLocalStorage.ts)) makes `enterWith()` a no-op. Stagehand uses `run()` for actual context propagation, which works natively on Cloudflare Workers, so the no-op is enough. Remove the polyfill once upstream [PR #2062](https://github.com/browserbase/stagehand/pull/2062) lands.

These polyfills are imported automatically when the `Stagehand` service is constructed. Node.js, Deno, and Bun do not need them — use the upstream `@browserbasehq/stagehand` package instead.

## Errors

Every Effect can fail with `StagehandError`, a single parent error with a `reason` union of 3 typed classes: `ConnectionError`, `OperationError`, `AgentError`. Match with `Effect.catchTag("effect-libs/browser/StagehandError", ...)`. Full hierarchy and `isRetryable` semantics: [Stagehand — Errors](./errors.md).

`toZodSchema` (see [Schema conversion errors](#schema-conversion-errors)) is the one exception: it fails with a separate `SchemaConversionError`, not `StagehandError`. Catch it directly with `Effect.catchTag("effect-libs/browser/SchemaConversionError", ...)` — see [Schema conversion errors](./errors.md#schema-conversion-errors).

## Not supported

| Feature                               | Status | Notes                                                               |
| ------------------------------------- | ------ | ------------------------------------------------------------------- |
| Firefox / WebKit                      | ❌     | Stagehand v3 is Chromium-only                                       |
| Node.js / Deno / Bun without polyfills | ❌     | Use original `@browserbasehq/stagehand` instead                |

## Not wrapped by design

These are deliberate omissions, not gaps. They live on the raw V3 instance, which is reachable through the `instance.use` escape hatch.

| Feature                     | Status | Notes                                                                                                                                                                                                                         |
| --------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stagehand `agent` primitive | ❌     | [`instance.use((s) => s.agent({...}).execute(...))`](./errors.md#not-wrapped-by-design) — a wrapper would be a thin pass-through. See [ADR-0001](../../contributing/stagehand/decisions/0001-stagehand-agent-not-wrapped.md). |

## Compatibility

| Browser           | Support |
| ----------------- | ------- |
| Chrome / Chromium | ✅      |
| Firefox / WebKit  | ❌      |

| Runtime              | Status | Notes                                                             |
| -------------------- | ------ | ----------------------------------------------------------------- |
| Cloudflare Workers   | ✅     | polyfills applied automatically                                   |
| Node.js / Deno / Bun | 🟠     | works — original `@browserbasehq/stagehand` is the better default |

## When to use

**Use this package when:**

- Cloudflare Workers — original Stagehand needs `ws` + `AsyncLocalStorage.enterWith()`, Cloudflare Workers doesn't have either
- You need Stagehand v3 on Cloudflare Workers (polyfills are applied automatically)

**Use something else when:**

- Node.js / Deno / Bun → original `@browserbasehq/stagehand`

Full comparison: [Stagehand — Comparison & Alternatives](./comparison.md).

## See also

- [Stagehand — Errors](./errors.md) — `StagehandError` reason classes
- [Effect Schema → Zod](./errors.md#schema-conversion-errors) — convert Effect Schema to Zod for Stagehand
- [Stagehand — Comparison & Alternatives](./comparison.md) — vs `@browserbasehq/stagehand`, vs v2.5
- [Stagehand upstream docs](https://docs.stagehand.dev/)
- [Concepts](../../overview.md) — Client & Provider, scoped resources, errors
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-stagehand/src) — full API in JSDoc
