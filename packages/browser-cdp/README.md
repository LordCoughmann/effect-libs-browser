# @effect-libs/browser-cdp

A zero-dependency CDP client for `@effect-libs/browser` with a
Playwright-compatible API. Uses native `WebSocket` only — no `nodejs_compat`
required, so it runs on edge runtimes that don't provide it (Vercel Edge,
Fastly, Akamai).

> ⚠️ **Experimental.** For production, please use [`@effect-libs/browser-playwright`](../browser-playwright).

## Install

```bash
pnpm add @effect-libs/browser-cdp effect@4.0.0-rc.108
```

> **Effect v4 RC required.** This package requires the Effect v4 RC API and is incompatible with Effect v3 and prior Effect v4 beta APIs. No additional runtime dependencies required.

## AI / LLM usage

See [AI / LLM usage disclosure](../../docs/packages/cdp/index.md#ai--llm-usage-disclosure).

## Documentation

[browser-cdp reference](../../docs/packages/cdp/index.md)

MIT. Derives from [Playwright](https://github.com/microsoft/playwright) (Apache 2.0) — see `LICENSE`.
