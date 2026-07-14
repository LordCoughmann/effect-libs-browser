# Client + provider

A **client** is the browser-automation framework API you call — `Playwright`, `Cdp`, `Stagehand`. These are the Effect services that expose a programmatic browser interface.

A **provider** is the browser that runs your code — the actual Chrome instance you connect to. Three managed providers ship out of the box: `SteelProvider` (Steel.dev), `BrowserbaseProvider` (Browserbase), `CfBrowserRunProvider` (Cloudflare Browser Run, with HTTP + binding flavors). You can also connect to any Chromium-based browser directly, without a provider — your hosted Chrome, a local Chrome, anything that speaks Chrome DevTools Protocol.

## How they compose

A client and a provider are merged into the program at the edge:

<!-- verify:ignore -->

```typescript
const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* SteelProvider;

  return yield* playwright.withSession({ provider }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      return yield* page.title;
    }),
  );
});

Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.merge(
        Playwright.layer,
        SteelProvider.layerConfig({ apiKey: Config.redacted("STEEL_API_KEY") }),
      ),
    ),
  ),
);
```

The same `program` runs against any provider. To switch providers, change one line; the program itself doesn't change.

## Choosing a client

Three clients, three points on the stability / API surface / dependencies axes. Pick by what your Cloudflare Worker needs.

| Package                                                 | Status           | Use when                                                                                                              |
| ------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`browser-playwright`](../packages/playwright/index.md) | **Stable**       | Full upstream Playwright API on edge runtimes. Default for production. Needs `nodejs_compat`.                         |
| [`browser-stagehand`](../packages/stagehand/index.md)   | **Stable**       | AI-powered automation (`act` / `extract` / `observe`) when selectors break on dynamic layouts. Needs `nodejs_compat`. |
| [`browser-cdp`](../packages/cdp/index.md)               | **Experimental** | Zero-dependency, native-WebSocket Chrome DevTools Protocol client. The only one that doesn't need `nodejs_compat`.    |

All three target Chromium-based browsers — Chrome, Edge, Brave, Opera. For Firefox or WebKit, use upstream [Playwright](https://playwright.dev) on Node, Bun, or Deno.

## Choosing a provider

Four options: three managed providers plus a "skip the provider" path that connects to any Chrome DevTools Protocol endpoint directly.

| Provider                                                           | Best for                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [`SteelProvider`](../providers/steel.md)                           | Anti-bot bypass, CAPTCHA solving, persistent profiles                                        |
| [`BrowserbaseProvider`](../providers/browserbase.md)               | Enterprise proxies, persistent contexts, session replay                                      |
| [`CfBrowserRunProvider`](../providers/cf-browser-run.md) (HTTP)    | Cloudflare-native, no external API key                                                       |
| [`CfBrowserRunProvider`](../providers/cf-browser-run.md) (binding) | Cloudflare Workers-only, fastest path (Playwright only)                                      |
| (no provider) — `withConnection({ url: "wss://…" })`               | Any Chrome DevTools Protocol-compatible browser — your hosted Chrome, local Chrome, anything |

Each managed provider is an optional peer dependency of `@effect-libs/browser-providers`. Install only the SDKs you actually need (`steel-sdk`, `@browserbasehq/sdk`, `cloudflare`).

## See also

- [Resources](./resources.md) — Session → Connection → Context → Page hierarchy, lifecycle, pooling
- [Errors](./errors.md) — typed error hierarchies, `catchTag`, `isRetryable`
- [Effect](./effect.md) — what Effect gives you and how to compose with it
