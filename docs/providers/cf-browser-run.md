# Cloudflare Browser Run

Two `BrowserProvider` implementations for [Cloudflare Browser Rendering](https://developers.cloudflare.com/browser-rendering/). Pick one:

- **HTTP** (`CfBrowserRunProvider`) — works anywhere with HTTP access to the Cloudflare API.
- **Binding** (`CfBrowserRunBindingProvider`) — direct binding to Browser Rendering on Cloudflare Workers; no external API calls.

## HTTP Provider

### Install

```bash
pnpm add @effect-libs/browser-providers cloudflare effect@4.0.0-rc.108
```

> **Effect v4 RC required.** This package requires the Effect v4 RC API and is incompatible with Effect v3 and prior Effect v4 beta APIs.

### Configuration

`CfBrowserRunProvider.layerConfig({...})` reads `accountId` from `Config.string("CF_ACCOUNT_ID")` and `apiKey` from `Config.redacted("CF_API_TOKEN")`. Accepts an `options` field for default session options (`keepAlive` is the most common). Per-session overrides go through `provider.createSession({...})`. See the JSDoc on `CfBrowserRunProviderOptions` for the full shape.

### SDK access

For raw SDK access — anything not in the typed `BrowserProvider` interface — use `provider.use((client) => client.screenshot.create({...}))`. The `client` is `CfBrowserRunSdk`; see the JSDoc on `CfBrowserRunProvider.use` for available surfaces (`screenshot`, `scrape`, `json`, `links`, `pdf`, `sessions`).

## Binding Provider

Direct browser access via Cloudflare Workers binding. No external HTTP calls — the browser runs in the same Workers runtime as your code.

### Configure wrangler

```jsonc
{
  "compatibility_flags": ["nodejs_compat"],
  "compatibility_date": "2026-05-23",
  "browser": {
    "binding": "MYBROWSER"
  }
}
```

### Install

```bash
pnpm add @effect-libs/browser-providers @effect-libs/cloudflare-playwright effect@4.0.0-rc.108
```

### Usage

Key differences from the HTTP provider:

- No `Playwright` import or layer needed
- Provider handles browser launch internally
- Only `provider.withSession(fn)` — no client-centric pattern
- Session lifecycle managed automatically (browser = session)

### Configuration

`CfBrowserRunBindingProvider.layer({...})` takes `endpoint` (string, URL, or `BrowserWorker`) and optional `options` (`WorkersLaunchOptions`):

| Option       | Type      | Default | Description                                   |
| ------------ | --------- | ------- | --------------------------------------------- |
| `recording`  | `boolean` | `false` | Enable session recording                      |
| `keep_alive` | `number`  | `60000` | Keep-alive duration in ms (10_000 to 600_000) |
| `lab`        | `boolean` | `false` | Enable experimental features                  |

Override per-session through `provider.withSession({ recording: false, ... }, fn)`. See the JSDoc on `CfBrowserRunBindingProvider.layer` for the full shape.

### SDK access

The binding provider exposes the raw browser endpoint binding (`env.MYBROWSER`) and `@effect-libs/cloudflare-playwright` operations — no `account_id` needed. See the JSDoc on `CfBrowserRunBindingProvider.use` for available surfaces.

## Resources

- [Browser Run Docs](https://developers.cloudflare.com/browser-rendering/)
- [Playwright Integration](https://developers.cloudflare.com/browser-rendering/integrations/playwright/)
- [CDP Integration](https://developers.cloudflare.com/browser-rendering/integrations/cdp/)
- [Pricing](https://developers.cloudflare.com/browser-rendering/pricing/)

## See also

- [Provider patterns](./index.md) — swapping, direct session access
- [Steel](./steel.md) — managed browsers with anti-bot bypass
- [Browserbase](./browserbase.md) — managed browsers with persistent contexts
- [Cloudflare Workers guide](../guides/cloudflare-workers.md) — Cloudflare Workers-specific setup
- [Cookbook](../cookbook/managing-sessions.md) — runnable recipes
- [Source on GitHub (HTTP)](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-providers/src/cf-browser-run) — full API in JSDoc
- [Source on GitHub (Binding)](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-providers/src/cf-browser-run-binding) — full API in JSDoc
