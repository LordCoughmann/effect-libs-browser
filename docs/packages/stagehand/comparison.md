# browser-stagehand — Comparison & Alternatives

> How `@effect-libs/browser-stagehand` compares to other Stagehand integrations. This page is about **choosing between us and them** (edge-runtimes support, polyfill surface, API parity). For **why we made the design choices we did**, see [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) (covers the underlying polyfill strategy) and [ADR-0001: Stagehand agent not wrapped](../../contributing/stagehand/decisions/0001-stagehand-agent-not-wrapped.md).

## vs @browserbasehq/stagehand

The original package. Works on Node.js and runtimes with full Node.js compat.

|                       | `@effect-libs/browser-stagehand` | @browserbasehq/stagehand |
| --------------------- | -------------------------------- | ------------------------ |
| Bundle size (gzip)    | ~14KB (polyfills) + stagehand    | stagehand                |
| --                    | --                               | --                       |
| **Edge runtimes**     |                                  |                          |
| CF Workers            | ✅ (polyfills)                   | ❌                       |
| Vercel Edge           | 🟡                               | ❌                       |
| --                    | --                               | --                       |
| **Standard runtimes** |                                  |                          |
| Node.js               | 🟠                               | ✅                       |
| Deno                  | 🟠                               | ✅ (Node compat)         |
| Bun                   | 🟠                               | ✅ (Node compat)         |
| --                    | --                               | --                       |
| **Browser support**   |                                  |                          |
| Chrome / Chromium     | ✅                               | ✅                       |
| Firefox               | ❌                               | ❌                       |
| Safari / WebKit       | ❌                               | ❌                       |
| --                    | --                               | --                       |
| **API**               |                                  |                          |
| `act()` / `extract()` | ✅                               | ✅                       |
| `extract()` schemas   | Effect Schema + Zod v4           | Zod v4                   |

**Pick `@effect-libs/browser-stagehand` for:** Cloudflare Workers — polyfills `ws` and `AsyncLocalStorage` for you.

**Pick @browserbasehq/stagehand for:** Node.js/Deno/Bun — no polyfills needed, native support.

**On Node.js, Deno, or Bun — use original `@browserbasehq/stagehand`.** No polyfills needed, native Node.js support. This package exists for Cloudflare Workers.

---

## vs Stagehand v2.5 + @cloudflare/playwright

Older Stagehand versions work with `@cloudflare/playwright` natively, but miss v3 features.

|                       | Stagehand v3 (this package)  | Stagehand v2.5 + @cloudflare/playwright |
| --------------------- | ----------------------------- | --------------------------------------- |
| Bundle size (gzip)    | ~14KB (polyfills) + stagehand | stagehand + @cloudflare/playwright      |
| --                    | --                            | --                                      |
| **Edge runtimes**     |                               |                                         |
| CF Workers            | ✅ (any CDP endpoint)         | ✅ (Browser Run only)                   |
| Vercel Edge           | 🟡                            | ❌                                      |
| --                    | --                            | --                                      |
| **Standard runtimes** |                               |                                         |
| Node.js               | 🟠                            | ❌ (crashes on import)                  |
| Deno                  | 🟠                            | ❌                                      |
| Bun                   | 🟠                            | ❌                                      |
| --                    | --                            | --                                      |
| **API**               |                               |                                         |
| `act()` / `extract()` | ✅                            | ✅                                      |
| `extract()` schemas   | Effect Schema + Zod v4        | Zod v3                                  |
| Effect Schema → Zod   | ✅ `toZodSchema()`            | ❌                                      |
| Any CDP endpoint      | ✅                            | ❌ (Browser Run only)                   |

**Pick this package for:** Stagehand v3 features (latest `act()`, Zod v4 schemas) on Cloudflare Workers with any browser provider.

**Pick Stagehand v2.5 + @cloudflare/playwright for:** Browser Run only, no polyfills, but you miss v3 features.

Stagehand v3 uses `import WebSocket from "ws"` and `AsyncLocalStorage.enterWith()`. Neither is available on Cloudflare Workers. We polyfill both and connect via CDP directly — Stagehand v3 on Cloudflare Workers with any browser provider.

---

## Effect integration

See [Effect](../../concepts/effect.md) for concrete before/after patterns — guaranteed resource cleanup, typed errors, provider swapping, and composability.

**Don't want Effect?** The Stagehand polyfills work independently — see [using without Effect](../../faq.md#do-i-need-to-learn-effect-to-use-this).

## See also

- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-stagehand/src) — full API in JSDoc
