# @effect-libs/browser

Browser automation for Cloudflare Workers and other edge runtimes, built on
[Effect](https://effect.website) v4. Connect to any browser that supports
Chrome DevTools Protocol and get automatic browser session cleanup on success, error, timeout, and cancellations.

## Packages

| Package                                                                | Description                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@effect-libs/browser-playwright`](packages/browser-playwright)       | `browser-playwright` — an `@effect-libs/browser` implementation for our fork of `@cloudflare/playwright` ([`@effect-libs/cloudflare-playwright`](packages/cloudflare-playwright)). **Stable** — full upstream Playwright API on edge runtimes. |
| [`@effect-libs/browser-stagehand`](packages/browser-stagehand)         | `browser-stagehand` — an `@effect-libs/browser` implementation for `@browserbasehq/stagehand` v3 (AI-powered browser automation) with polyfills for Cloudflare Workers only. **Stable.**                                                       |
| [`@effect-libs/browser-cdp`](packages/browser-cdp)                     | `browser-cdp` — an `@effect-libs/browser` implementation of a zero-dependency Chrome DevTools Protocol client for non-Node-compatible runtimes. **Experimental.**                                                                              |
| [`@effect-libs/browser-providers`](packages/browser-providers)         | An `@effect-libs/browser` implementation for managed browser providers (e.g. Steel, Browserbase, Cloudflare Browser Run).                                                                                                                      |
| [`@effect-libs/browser`](packages/browser)                             | Core types and the `BrowserProvider` interface shared by the clients.                                                                                                                                                                          |
| [`@effect-libs/cloudflare-playwright`](packages/cloudflare-playwright) | A fork of `@cloudflare/playwright` that connects to any browser that supports Chrome DevTools Protocol (e.g. Steel, Browserbase, local Chrome), tested on Cloudflare Workers, Bun, Deno.                                                       |

## Documentation

- [Documentation](docs/README.md) — concepts, cookbook, guides, reference, comparisons

## License

MIT.
