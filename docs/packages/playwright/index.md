# `browser-playwright`

Full upstream Playwright API on Cloudflare Workers and other edge runtimes. Chrome only. Based on `@cloudflare/playwright` with patches for external Chrome DevTools Protocol browser support.

> **Stable.** The recommended default for production browser automation on edge runtimes. For lightweight scraping or Node.js / Bun / Deno (no Cloudflare Worker), see [`browser-cdp`](./../cdp/index.md) (which is LLM-assisted — see its [AI / LLM usage disclosure](./../cdp/index.md#ai--llm-usage-disclosure)).

## Install

```bash
pnpm add @effect-libs/browser-playwright effect@4.0.0-rc.108
```

The Playwright runtime comes from `@effect-libs/cloudflare-playwright` (our maintained fork of `@cloudflare/playwright@1.3.0`) as a transitive direct dependency — no separate install command needed.

> **Effect v4 RC required.** This package requires the Effect v4 RC API and is incompatible with Effect v3 and prior Effect v4 beta APIs.

## Resource acquisition

Follows the standard 4-level hierarchy — `Session` → `Connection` → `Context` → `Page` — documented in [Concepts](../../concepts/resources.md).

| Form                | Lifetime                                              |
| ------------------- | ----------------------------------------------------- |
| `withX(source, fn)` | scope = the callback (default — used 90% of the time) |
| `acquireX(source)`  | you own the scope (pools, durable objects, fan-out)   |

See [Managing Resources](../../concepts/resources.md) for pooling patterns and the session/connection/context/page tradeoffs.

## Added APIs

Three methods added on top of the upstream `Page` API:

| Method                      | Returns                                  | Notes                                                                                                                        |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `page.fetch(url, options?)` | `Effect<FetchResponse, PlaywrightError>` | HTTP through the browser context (inherits cookies + CORS)                                                                   |
| `page.httpClient`           | `HttpClient.HttpClient` (Effect)         | Effect-native HTTP client                                                                                                    |
| `page.context()`            | `PlaywrightBrowserContext`               | Page-level context accessor — `setGeolocation`, `grantPermissions`, etc. without going through `connection.withContext(...)` |

Details: [`browser-playwright` — Added APIs](./added-apis.md).

## Not supported

Inherited from `@cloudflare/playwright`:

| Feature                               | Status                                                  |
| ------------------------------------- | ------------------------------------------------------- |
| `browserType.launch`                  | ❌ throws — use `withConnection` / `withSession`        |
| `browserType.launchPersistentContext` | ❌                                                      |
| `browserType.launchServer`            | ❌                                                      |
| `browserType.connect`                 | ❌                                                      |
| `browserType.connectOverCDP`          | ✅ (with our patches)                                   |
| Firefox / WebKit                      | ❌ (upstream `@cloudflare/playwright` is Chromium-only) |
| Android / Electron                    | ❌                                                      |
| Playwright Test                       | ❌ (except Assertions)                                  |
| Videos                                | ❌                                                      |

## Compatibility

| Browser           | Support |
| ----------------- | ------- |
| Chrome / Chromium | ✅      |
| Firefox           | ❌      |
| WebKit            | ❌      |

| Runtime              | Status | Notes                                               |
| -------------------- | ------ | --------------------------------------------------- |
| Cloudflare Workers   | ✅     | needs `nodejs_compat`                               |
| Node.js / Deno / Bun | 🟠     | works — upstream Playwright is the better default |

Other edge runtimes (Fastly, Akamai, etc.) are not supported — use [`@effect-libs/browser-cdp`](./../cdp/index.md) instead.

## When to use

**Use this package when:**

- Cloudflare Workers / edge runtime — upstream Playwright doesn't run here
- You need the full upstream Playwright API with external providers (Steel, Browserbase)

**Use something else when:**

- Node.js / Deno / Bun → original `playwright`
- Lightweight scraping → [`@effect-libs/browser-cdp`](./../cdp/index.md) (zero deps, no `nodejs_compat`)

Full comparison: [Playwright — Comparison & Alternatives](./comparison.md).

## See also

- [Migrating from Playwright](../../migrations/from-playwright.md) — coming from vanilla Playwright
- [Playwright — Context API](./context.md) — `BrowserContext` wrapper
- [Playwright — Errors](./errors.md) — typed reason hierarchy
- [Playwright — Added APIs](./added-apis.md) — `page.fetch` / `page.httpClient` / lazy getters
- [Concepts](../../overview.md) — Client & Provider, scoped resources, errors
- [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) — `browser-cdp`'s deviations from upstream Playwright
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-playwright/src) — full API in JSDoc
