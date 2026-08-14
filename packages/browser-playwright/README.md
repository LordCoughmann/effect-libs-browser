# @effect-libs/browser-playwright

Full upstream Playwright API on Cloudflare Workers and other edge runtimes,
based on our fork of `@cloudflare/playwright` ([`@effect-libs/cloudflare-playwright`](../cloudflare-playwright)).

> **Stable.** Recommended default for production browser automation on edge
> runtimes. The Playwright runtime ships as a transitive direct dependency —
> no second `pnpm add` needed.

## Install

```bash
pnpm add @effect-libs/browser-playwright effect@4.0.0-rc.108
```

The Playwright runtime comes from `@effect-libs/cloudflare-playwright` (our maintained fork of `@cloudflare/playwright@1.3.0`). It's a direct dependency, so it installs transitively — no second `pnpm add` needed.

> **Effect v4 RC required.** This package requires the Effect v4 RC API and is incompatible with Effect v3 and prior Effect v4 beta APIs.

## Documentation

[browser-playwright reference](../../docs/packages/playwright/index.md)

MIT.
