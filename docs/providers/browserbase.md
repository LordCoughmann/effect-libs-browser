# Browserbase Provider

Managed browser sessions with persistent contexts, proxies, and enterprise features. See [browserbase.com](https://browserbase.com).

## Install

```bash
pnpm add @effect-libs/browser-providers @browserbasehq/sdk effect@4.0.0-rc.108
```

> **Effect v4 RC required.** This package requires the Effect v4 RC API and is incompatible with Effect v3 and prior Effect v4 beta APIs. No additional dependencies. Browserbase uses the HTTP API.

## Configuration

`BrowserbaseProvider` ships with two layer constructors:

- `BrowserbaseProvider.layerConfig({...})` — recommended; reads `apiKey` from `Config.redacted("BROWSERBASE_API_KEY")` and `baseURL` from `BROWSERBASE_BASE_URL` (default `https://api.browserbase.com`).
- `BrowserbaseProvider.layer({...})` — explicit values; use when you need a literal key or non-env-var values.

Both accept an `options` field for default session options (`projectId`, `browserSettings` with `blockAds` / `advancedStealth`, etc.). Per-session overrides go through `provider.createSession({...})`. See the JSDoc on `BrowserbaseProviderOptions` and `BrowserbaseProvider.layerConfig` for the full shape.

For Cloudflare Worker bindings or other non-env-var values, see the [binding provider section](./cf-browser-run.md#binding-provider) for the one case that requires `layer({...})`.

## Browserbase-specific features

For raw SDK access — anything not in the typed `BrowserProvider` interface — use `provider.use((client) => client.sessions.create({...}))`. The `client` is the Browserbase SDK; see the JSDoc on `BrowserbaseProvider.use` for the available surfaces (`sessions`, `projects`, etc.).

## Resources

- [Browserbase Docs](https://docs.browserbase.com/)
- [Playwright Quickstart](https://docs.browserbase.com/welcome/quickstarts/playwright)
- [API Reference](https://docs.browserbase.com/reference/overview)

## See also

- [Provider patterns](./index.md) — swapping, direct session access
- [Steel](./steel.md) — managed browsers with anti-bot bypass
- [Cloudflare Browser Run](./cf-browser-run.md) — Cloudflare-native
- [Cookbook](../cookbook/managing-sessions.md) — runnable recipes
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-providers/src/browserbase) — full API in JSDoc
