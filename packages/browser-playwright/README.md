# @effect-libs/browser-playwright

Full upstream Playwright API on Cloudflare Workers and other edge runtimes,
based on our fork of `@cloudflare/playwright` ([`@effect-libs/cloudflare-playwright`](../cloudflare-playwright)).

> **Stable.** Recommended default for production browser automation on edge
> runtimes. The Playwright runtime ships as a transitive direct dependency —
> no second `pnpm add` needed.

## Install

```bash
pnpm add @effect-libs/browser-playwright effect@beta
```

The Playwright runtime comes from `@effect-libs/cloudflare-playwright` (our maintained fork of `@cloudflare/playwright@1.3.0`). It's a direct dependency, so it installs transitively — no second `pnpm add` needed. `effect` is also a peer dependency — `effect@beta` installs the latest v4 beta.

## Documentation

[browser-playwright reference](../../docs/packages/playwright/index.md)

MIT.
