# browser-playwright — Comparison & Alternatives

> How `@effect-libs/browser-playwright` compares to other browser-automation libraries. This page is about **choosing between us and them** (edge-runtimes support, browser support, API surface). For **why we made the design choices we did**, see [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) (covers the underlying `browser-cdp` and the rationale for its Playwright-compatible shape) and the [contributing decisions](../../contributing/) (e.g. ADR-0003 for Effect-idiomatic API shape).

## vs @cloudflare/playwright (unpatched)

The upstream fork. Only connects to Cloudflare Browser Run's internal endpoint.

|                       | `@effect-libs/browser-playwright` | @cloudflare/playwright |
| --------------------- | --------------------------------- | ---------------------- |
| **Edge runtimes**     |                                   |                        |
| CF Workers            | ✅                                | ✅ (Browser Run only)  |
| Vercel Edge           | 🟡                                | ❌                     |
| --                    | --                                | --                     |
| **Standard runtimes** |                                   |                        |
| Node.js               | 🟠                                | ❌ (crashes on import) |
| Deno                  | 🟠                                | ❌                     |
| Bun                   | 🟠                                | ❌                     |
| --                    | --                                | --                     |
| **Browser support**   |                                   |                        |
| Chrome / Chromium     | ✅                                | ✅                     |
| Firefox               | ❌                                | ❌                     |
| Safari / WebKit       | ❌                                | ❌                     |
| --                    | --                                | --                     |
| **API**               |                                   |                        |
| Any CDP endpoint      | ✅                                | ❌ (Browser Run only)  |
| Playwright            | Full API                          | Full API               |

We apply four patches: external CDP URLs, lazy module loading, ESM type resolution, and a graceful skip for CDP targets without `browserContextId`. See the [fork's README](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/cloudflare-playwright/README.md) for details.

**Pick `@effect-libs/browser-playwright` for:** any browser provider (Steel, Browserbase, local Chrome), works outside Workers for testing.

**Pick @cloudflare/playwright for:** Browser Run only, no patches needed.

`@cloudflare/playwright` only works with Cloudflare Browser Run and crashes on import outside Workers. We patch it to accept any `ws://` or `wss://` CDP URL and lazily load the `cloudflare:workers` module so it works in Node.js too (useful for testing).

---

## vs playwright (original)

The original Microsoft `playwright` package. Full API, all browsers, all platforms.

|                       | `@effect-libs/browser-playwright` | playwright |
| --------------------- | --------------------------------- | ---------- |
| **Edge runtimes**     |                                   |            |
| CF Workers            | ✅                                | ❌         |
| Vercel Edge           | 🟡                                | ❌         |
| --                    | --                                | --         |
| **Standard runtimes** |                                   |            |
| Node.js               | 🟠                                | ✅         |
| Deno                  | 🟠                                | ✅         |
| Bun                   | 🟠                                | ✅         |
| --                    | --                                | --         |
| **Browser support**   |                                   |            |
| Chrome / Chromium     | ✅                                | ✅         |
| Firefox               | ❌                                | ✅         |
| Safari / WebKit       | ❌                                | ✅         |
| --                    | --                                | --         |
| **API**               |                                   |            |
| `browser.launch()`    | ❌                                | ✅         |
| `connectOverCDP()`    | ✅ (any endpoint)                 | ✅         |
| Playwright Test       | ❌                                | ✅         |
| Videos / Traces       | ❌                                | ✅         |

**Pick `@effect-libs/browser-playwright` for:** edge runtimes where original playwright can't run.

**Pick playwright for:** Node.js/Deno/Bun — full browser support, `launch()`, Playwright Test, simpler setup.

**On Node.js, Deno, or Bun — use original `playwright`.** Full browser support, `launch()`, simpler API. This module exists for constrained runtimes that can't run the original.

---

## vs @effect-libs/browser-cdp

`@effect-libs/browser-cdp` from the same library. Lighter, less API surface.

|                       | `@effect-libs/browser-playwright` | `@effect-libs/browser-cdp` |
| --------------------- | --------------------------------- | -------------------------- |
| **Edge runtimes**     |                                   |                            |
| CF Workers            | ✅ (needs `nodejs_compat`)        | ✅                         |
| Vercel Edge           | 🟡                                | 🟡                         |
| --                    | --                                | --                         |
| **Standard runtimes** |                                   |                            |
| Node.js               | 🟠                                | 🟠                         |
| Deno                  | 🟠                                | 🟠                         |
| Bun                   | 🟠                                | 🟠                         |
| --                    | --                                | --                         |
| **Browser support**   |                                   |                            |
| Chrome / Chromium     | ✅                                | ✅                         |
| Firefox               | ❌                                | ❌                         |
| Safari / WebKit       | ❌                                | ❌                         |
| --                    | --                                | --                         |
| **API**               |                                   |                            |
| Playwright            | Full API                          | Subset                     |
| Direct CDP commands   | ❌ (abstracted)                   | ✅                         |
| Playwright Test       | ❌ (except Assertions)            | ❌                         |

**Pick `@effect-libs/browser-playwright` for:** full Playwright API (locators, network interception, waiting), porting existing Playwright code.

**Pick `@effect-libs/browser-cdp` for:** lightweight scraping, raw CDP access.

---

## Effect integration

See [Effect](../../concepts/effect.md) for concrete before/after patterns — guaranteed resource cleanup, typed errors, provider swapping, and composability.

**Don't want Effect?** The Playwright patches work independently — see [using without Effect](../../faq.md#can-i-use-this-library-without-effect).

## See also

- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-playwright/src) — full API in JSDoc
