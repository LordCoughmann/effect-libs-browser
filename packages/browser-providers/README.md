# @effect-libs/browser-providers

An `@effect-libs/browser` implementation for managed browser providers ([Steel](../../docs/providers/steel.md),
[Browserbase](../../docs/providers/browserbase.md), [Cloudflare Browser Run](../../docs/providers/cf-browser-run.md)).

Each provider is an optional peer dependency — install `@effect-libs/browser-providers`
once, then add only the SDKs for the providers you actually use. Don't want a provider?
Skip this package and connect to any raw CDP URL with `withConnection({ url: "wss://…" })`.

## Install

```bash
# Steel
pnpm add @effect-libs/browser-providers steel-sdk effect@beta

# Browserbase
pnpm add @effect-libs/browser-providers @browserbasehq/sdk effect@beta

# Cloudflare Browser Run (HTTP)
pnpm add @effect-libs/browser-providers cloudflare effect@beta

# Cloudflare Browser Run (binding, Playwright only)
pnpm add @effect-libs/browser-providers @effect-libs/cloudflare-playwright effect@beta
```

`effect` is a peer dependency — `effect@beta` installs the latest v4 beta (currently `4.0.0-beta.94`).

## Documentation

→ [Providers index](../../docs/providers/index.md)

MIT.
