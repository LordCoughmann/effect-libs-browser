# @effect-libs/browser-providers

An `@effect-libs/browser` implementation for managed browser providers ([Steel](../../docs/providers/steel.md),
[Browserbase](../../docs/providers/browserbase.md), [Cloudflare Browser Run](../../docs/providers/cf-browser-run.md)).

Each provider is an optional peer dependency — install `@effect-libs/browser-providers`
once, then add only the SDKs for the providers you actually use. Don't want a provider?
Skip this package and connect to any raw CDP URL with `withConnection({ url: "wss://…" })`.

## Install

```bash
# Steel
pnpm add @effect-libs/browser-providers steel-sdk effect@4.0.0-rc.108

# Browserbase
pnpm add @effect-libs/browser-providers @browserbasehq/sdk effect@4.0.0-rc.108

# Cloudflare Browser Run (HTTP)
pnpm add @effect-libs/browser-providers cloudflare effect@4.0.0-rc.108

# Cloudflare Browser Run (binding, Playwright only)
pnpm add @effect-libs/browser-providers @effect-libs/cloudflare-playwright effect@4.0.0-rc.108
```

> **Effect v4 RC required.** This package requires the Effect v4 RC API and is incompatible with Effect v3 and prior Effect v4 beta APIs.

## Documentation

[Providers index](../../docs/providers/index.md)

MIT.
