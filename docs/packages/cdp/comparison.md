# browser-cdp — Comparison & Alternatives

> How `@effect-libs/browser-cdp` compares to other CDP clients. This page is about **choosing between us and them** (edge-runtimes support, dependency footprint, API surface). For **why we made the design choices we did**, see [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md).

## vs simple-cdp

[simple-cdp](https://github.com/gildas-lormeau/simple-cdp) is a lightweight CDP client. Also uses native WebSocket — zero dependencies.

|                       | `@effect-libs/browser-cdp` | simple-cdp      |
| --------------------- | -------------------------- | --------------- |
| **Edge runtimes**     |                            |                 |
| CF Workers            | ✅                         | ✅              |
| Vercel Edge           | 🟡                         | 🟡              |
| --                    | --                         | --              |
| **Standard runtimes** |                            |                 |
| Node.js               | 🟠                         | ✅              |
| Deno                  | 🟠                         | ✅ (Deno-first) |
| Bun                   | 🟠                         | ✅              |
| --                    | --                         | --              |
| **Browser support**   |                            |                 |
| Chrome / Chromium     | ✅                         | ✅              |
| Firefox               | ❌                         | ❌              |
| Safari / WebKit       | ❌                         | ❌              |
| --                    | --                         | --              |
| **API**               |                            |                 |
| Playwright            | ✅ (subset)                | ❌              |
| Direct CDP commands   | ✅                         | ✅              |

**Pick `@effect-libs/browser-cdp` for:** upstream Playwright convenience API (`goto`, `click`, `fill`) + raw Chrome DevTools Protocol in one package.

**Pick simple-cdp for:** Thin wire client only — send/receive Chrome DevTools Protocol commands, no convenience methods.

simple-cdp is a thin Chrome DevTools Protocol wire client. `@effect-libs/browser-cdp` adds a Playwright-compatible convenience API on top (`goto`, `click`, `fill`, `evaluate`, `screenshot`, cookies, etc.) plus full raw Chrome DevTools Protocol access underneath. If you just need to send Chrome DevTools Protocol commands and handle responses, simple-cdp is lighter. If you want higher-level page interaction without reaching for the full upstream Playwright, use our package.

---

## vs chrome-remote-interface

[chrome-remote-interface](https://github.com/cyrus-and/chrome-remote-interface) is the classic Chrome DevTools Protocol client. Mature, well-known. Depends on `ws` — Node.js only.

|                       | `@effect-libs/browser-cdp` | CRI              |
| --------------------- | -------------------------- | ---------------- |
| **Edge runtimes**     |                            |                  |
| CF Workers            | ✅                         | ❌ (`ws`)        |
| Vercel Edge           | 🟡                         | ❌               |
| --                    | --                         | --               |
| **Standard runtimes** |                            |                  |
| Node.js               | 🟠                         | ✅               |
| Deno                  | 🟠                         | ✅ (Node compat) |
| Bun                   | 🟠                         | ✅ (Node compat) |
| --                    | --                         | --               |
| **Browser support**   |                            |                  |
| Chrome / Chromium     | ✅                         | ✅               |
| Firefox               | ❌                         | ❌               |
| Safari / WebKit       | ❌                         | ❌               |
| --                    | --                         | --               |
| **API**               |                            |                  |
| Playwright            | ✅ (subset)                | ❌               |
| Direct CDP commands   | ✅                         | ✅               |

**Pick `@effect-libs/browser-cdp` for:** edge runtimes, upstream Playwright convenience without the weight.

**Pick CRI for:** Node.js + mature Chrome DevTools Protocol client, don't need Playwright API or Effect integration.

CRI is mature and well-documented, but tied to Node.js via the `ws` dependency. If you're on Node.js and already using CRI, there's no reason to switch. If you need edge runtime support, use our package.

---

## vs upstream Playwright (original)

The original Microsoft Playwright package. Full API, all browsers. Bundles `ws` and Node.js APIs — Node.js only.

|                       | `@effect-libs/browser-cdp` | playwright      |
| --------------------- | -------------------------- | --------------- |
| **Edge runtimes**     |                            |                 |
| CF Workers            | ✅                         | ❌              |
| Vercel Edge           | 🟡                         | ❌              |
| --                    | --                         | --              |
| **Standard runtimes** |                            |                 |
| Node.js               | 🟠                         | ✅              |
| Deno                  | 🟠                         | ✅              |
| Bun                   | 🟠                         | ✅              |
| --                    | --                         | --              |
| **Browser support**   |                            |                 |
| Chrome / Chromium     | ✅                         | ✅              |
| Firefox               | ❌                         | ✅              |
| Safari / WebKit       | ❌                         | ✅              |
| --                    | --                         | --              |
| **API**               |                            |                 |
| Playwright            | Subset                     | Full API        |
| Direct CDP commands   | ✅                         | ❌ (abstracted) |

**Pick `@effect-libs/browser-cdp` for:** edge runtimes, lightweight, raw Chrome DevTools Protocol access.

**Pick upstream Playwright for:** Node.js/Deno/Bun + full Playwright API + all browsers + Playwright Test.

On Node.js, Deno, or Bun — use upstream Playwright if you need the full API. Use `@effect-libs/browser-cdp` if you want lightweight, zero-dependency automation.

---

## vs @cloudflare/playwright

Cloudflare's upstream Playwright fork. Works on Cloudflare Workers but only with Browser Run.

|                       | `@effect-libs/browser-cdp` | @cloudflare/playwright |
| --------------------- | -------------------------- | ---------------------- |
| **Edge runtimes**     |                            |                        |
| CF Workers            | ✅                         | ✅ (Browser Run only)  |
| Vercel Edge           | 🟡                         | ❌                     |
| --                    | --                         | --                     |
| **Standard runtimes** |                            |                        |
| Node.js               | 🟠                         | ❌ (crashes)           |
| Deno                  | 🟠                         | ❌                     |
| Bun                   | 🟠                         | ❌                     |
| --                    | --                         | --                     |
| **Browser support**   |                            |                        |
| Chrome / Chromium     | ✅                         | ✅                     |
| Firefox               | ❌                         | ❌                     |
| Safari / WebKit       | ❌                         | ❌                     |
| --                    | --                         | --                     |
| **API**               |                            |                        |
| Playwright            | Subset                     | Full API               |
| Direct CDP commands   | ✅                         | ❌ (abstracted)        |

**Pick `@effect-libs/browser-cdp` for:** any Chrome DevTools Protocol endpoint (Steel, Browserbase, local Chrome), lightweight.

**Pick @cloudflare/playwright for:** Cloudflare Browser Run only + full Playwright API (use via `@effect-libs/browser-playwright`).

`@cloudflare/playwright` only connects to Cloudflare Browser Run. `@effect-libs/browser-cdp` connects to any `ws://` endpoint — Steel, Browserbase, local Chrome, anything. Use `@effect-libs/browser-cdp` for lightweight scraping on Cloudflare Workers with any provider. Use `@cloudflare/playwright` (via `@effect-libs/browser-playwright`) if you need the full Playwright API.

---

## vs @effect-libs/browser-playwright

Both clients work on the same edge runtimes. Choose based on what you need.

|                       | `@effect-libs/browser-cdp` | `@effect-libs/browser-playwright` |
| --------------------- | -------------------------- | --------------------------------- |
| **Edge runtimes**     |                            |                                   |
| CF Workers            | ✅                         | ✅ (needs `nodejs_compat`)        |
| Vercel Edge           | 🟡                         | 🟡                                |
| --                    | --                         | --                                |
| **Standard runtimes** |                            |                                   |
| Node.js               | 🟠                         | 🟠                                |
| Deno                  | 🟠                         | 🟠                                |
| Bun                   | 🟠                         | 🟠                                |
| --                    | --                         | --                                |
| **Browser support**   |                            |                                   |
| Chrome / Chromium     | ✅                         | ✅                                |
| Firefox               | ❌                         | ❌                                |
| Safari / WebKit       | ❌                         | ❌                                |
| --                    | --                         | --                                |
| **API**               |                            |                                   |
| Playwright            | Subset                     | Full API                          |
| Direct CDP commands   | ✅                         | ❌ (abstracted)                   |
| Playwright Test       | ❌                         | ❌ (except Assertions)            |

**Pick `@effect-libs/browser-cdp` for:** lightweight scraping, raw Chrome DevTools Protocol access.

**Pick `@effect-libs/browser-playwright` for:** full Playwright API (locators, network interception, waiting strategies), porting existing Playwright code.

---

## Effect integration

See [Effect](../../concepts/effect.md) for concrete before/after patterns — guaranteed resource cleanup, typed errors, provider swapping, and composability.

**Don't want Effect?** `@effect-libs/browser-cdp` requires Effect as a runtime. For a zero-framework Chrome DevTools Protocol client, see [simple-cdp](https://github.com/gildas-lormeau/simple-cdp) (~1.7KB, native WebSocket, zero deps) or [chrome-remote-interface](https://github.com/cyrus-and/chrome-remote-interface) (mature, but `ws` dependency — Node.js only).

## See also

- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src) — full API in JSDoc
