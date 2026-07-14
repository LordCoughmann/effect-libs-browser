# `browser-playwright`

Full upstream Playwright API on Cloudflare Workers and other edge runtimes. Chrome only. Based on `@cloudflare/playwright` with patches for external Chrome DevTools Protocol browser support.

> **Stable.** The recommended default for production browser automation on edge runtimes. For lightweight scraping or non-Worker runtimes, see [`browser-cdp`](./../cdp/index.md) (which is LLM-assisted — see its [AI / LLM usage disclosure →](./../cdp/index.md#ai--llm-usage-disclosure)).

## Install

```bash
pnpm add @effect-libs/browser-playwright effect@beta
```

The Playwright runtime comes from `@effect-libs/cloudflare-playwright` (our maintained fork of `@cloudflare/playwright@1.3.0`) as a transitive direct dependency — no separate install command needed. `effect` is also a peer dependency — `effect@beta` installs the latest v4 beta (currently `4.0.0-beta.94`).

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

Details: [Playwright — Added APIs](./added-apis.md).

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
| Node.js / Deno / Bun | 🟠     | works — original `playwright` is the better default |

Other edge runtimes (Fastly, Akamai, etc.) are not supported — use [`@effect-libs/browser-cdp`](./../cdp/index.md) instead.

## When to use

**Use this module when:**

- Cloudflare Workers / edge runtime — original `playwright` doesn't run here
- You need the full Playwright API with external providers (Steel, Browserbase)

**Use something else when:**

- Node.js / Deno / Bun → original `playwright`
- Lightweight scraping → [`@effect-libs/browser-cdp`](./../cdp/index.md) (zero deps, no `nodejs_compat`)

Full comparison: [Playwright — Comparison & Alternatives](./comparison.md).

## See also

- [Migrating from Playwright](../../migrations/from-playwright.md) — coming from vanilla Playwright
- [Playwright — Context API](./context.md) — `BrowserContext` wrapper
- [Playwright — Input](./input.md) — keyboard / mouse / touchscreen
- [Playwright — Errors](./errors.md) — typed reason hierarchy
- [Playwright — Added APIs](./added-apis.md) — `page.fetch` / `page.httpClient` / lazy getters
- [Concepts](../../concepts/client-and-provider.md) — client + provider, scoped resources, errors
- [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) — `browser-cdp`'s deviations from upstream Playwright
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-playwright/src) — full API in JSDoc
