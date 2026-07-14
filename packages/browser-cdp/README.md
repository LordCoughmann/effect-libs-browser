# @effect-libs/browser-cdp

A zero-dependency CDP client for `@effect-libs/browser` with a
Playwright-compatible API. Uses native `WebSocket` only — no `nodejs_compat`
required, so it runs on edge runtimes that don't provide it (Vercel Edge,
Fastly, Akamai).

> ⚠️ **Experimental.** Not human-reviewed; awaiting line-by-line audit. For
> production today, use [`@effect-libs/browser-playwright`](../browser-playwright).

## Install

```bash
pnpm add @effect-libs/browser-cdp effect@beta
```

`effect` is a peer dependency — `effect@beta` installs the latest v4 beta (currently `4.0.0-beta.94`). No additional runtime dependencies required.

## AI / LLM usage

The `browser-cdp` implementation in `packages/browser-cdp/src/internal/` is generated
by frontier LLMs through a human-in-the-loop TDD workflow and has _not_ had
a line-by-line review. The maintainer designed and reviews the client and
provider abstractions on top. Full disclosure and methodology:
[browser-cdp docs → AI / LLM usage disclosure](../../docs/packages/cdp/index.md#ai--llm-usage-disclosure).

## Documentation

→ [browser-cdp reference](../../docs/packages/cdp/index.md)

MIT. Derives from [Playwright](https://github.com/microsoft/playwright) (Apache 2.0) — see `LICENSE`.
