# Steel Provider

Managed browser sessions with anti-bot bypass, CAPTCHA solving, and persistent cookies. See [steel.dev](https://steel.dev).

## Install

```bash
pnpm add @effect-libs/browser-providers steel-sdk effect@4.0.0-rc.108
```

> **Effect v4 RC required.** This package requires the Effect v4 RC API and is incompatible with Effect v3 and prior Effect v4 beta APIs.

## Configuration

`SteelProvider` ships with two layer constructors:

- `SteelProvider.layerConfig({...})` — recommended; reads `apiKey` from `Config.redacted("STEEL_API_KEY")` and `baseURL` from `STEEL_BASE_URL` (default `https://api.steel.dev`).
- `SteelProvider.layer({...})` — explicit values; use when you need a literal key (e.g. in a one-off script) or non-env-var values.

Both accept an `options` field for default session options (`profileId`, `persistProfile`, `blockAds`, `advancedStealth`, `clientTimeout`). Per-session overrides go through `provider.createSession({...})`. See the JSDoc on `SteelProviderOptions` and `SteelProvider.layerConfig` for the full shape.

For Cloudflare Worker bindings or other non-env-var values, see the [binding provider section](./cf-browser-run.md#binding-provider) for the one case that requires `layer({...})`.

## Steel-specific features

For raw SDK access — anything not in the typed `BrowserProvider` interface — use `provider.use((client) => client.sessions.create({...}))`. The `client` is the Steel SDK; see the JSDoc on `SteelProvider.use` for the available surfaces (`sessions`, `profiles`, etc.).

## Resources

- [Steel Docs](https://docs.steel.dev/)
- [Sessions API](https://docs.steel.dev/overview/sessions-api/overview)
- [Playwright Integration](https://docs.steel.dev/cookbook/playwright)

## See also

- [Provider patterns](./index.md) — swapping, direct session access
- [Browserbase](./browserbase.md) — managed browsers with persistent contexts
- [Cloudflare Browser Run](./cf-browser-run.md) — Cloudflare-native
- [Cookbook](../cookbook/managing-sessions.md) — runnable recipes
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-providers/src/steel) — full API in JSDoc
