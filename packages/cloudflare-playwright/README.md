# @effect-libs/cloudflare-playwright

A fork of `@cloudflare/playwright` that connects to any browser that supports CDP (e.g., Steel.dev, Browserbase, local Chrome), tested on Node, Bun, Deno, not just Cloudflare Browser Run.

> **Vendored.** This package is vendored inside the [`@effect-libs/browser`](https://github.com/LordCoughmann/effect-libs-browser) monorepo and published to npm as a separate package — consumers `pnpm add` it like any other dependency.

## Install

```bash
pnpm add @effect-libs/cloudflare-playwright @cloudflare/playwright@1.3.0
```

Both packages are required (this fork depends on the upstream `1.3.0`).

## Why this fork exists

Upstream `@cloudflare/playwright` was designed exclusively for Cloudflare Workers — its top-level `import { env } from 'cloudflare:workers'` crashes on import in Node, Bun, Deno, or browsers. Four patches fix that plus three other issues that affect the [`@effect-libs/browser`](https://github.com/LordCoughmann/effect-libs-browser) use case.

The full list of patches and why each is needed lives in [`patches/CHECKLIST.md`](./patches/CHECKLIST.md).

## Upstream tracking

Forked from `@cloudflare/playwright@1.3.0`. Resynced on each upstream release via [`scripts/sync-upstream.sh`](./scripts/sync-upstream.sh). Versioned on its own `0.x` series; the upstream version it tracks is documented in this README and the changelog, not encoded in the package version.

Three of the four patches have corresponding upstream PRs:

- [PR #193 — lazy-load `cloudflare:workers`](https://github.com/cloudflare/playwright/pull/193)
- [PR #194 — `.d.ts` extensions for NodeNext](https://github.com/cloudflare/playwright/pull/194)

## Used by

- [`@effect-libs/browser-playwright`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-playwright) — Effect-native browser automation on top of this fork

## License

Apache-2.0, same as upstream. Original copyright Cloudflare, Inc. Modifications by the `@effect-libs` maintainers. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
