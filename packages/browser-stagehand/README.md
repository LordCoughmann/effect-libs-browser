# @effect-libs/browser-stagehand

An `@effect-libs/browser` implementation for `@browserbasehq/stagehand` v3
(AI-powered browser automation). Ships polyfills for Cloudflare Workers
(`ws`, `AsyncLocalStorage.enterWith`) so the full Stagehand API runs on
Workers out of the box.

> **Stable** on Cloudflare Workers. On Node/Bun/Deno the upstream
> `@browserbasehq/stagehand` is the better default.
>
> **AI / LLM usage.** `act` / `extract` / `observe` call an LLM at runtime —
> every call costs money and adds latency.

## Install

```bash
pnpm add @effect-libs/browser-stagehand @browserbasehq/stagehand effect@beta
```

`effect` is a peer dependency — `effect@beta` installs the latest v4 beta (currently `4.0.0-beta.94`).

## Documentation

→ [browser-stagehand reference](../../docs/packages/stagehand/index.md)

MIT.
