# Overview

`@effect-libs/browser` runs browser automation on [Cloudflare Workers](https://workers.cloudflare.com/) and other edge runtimes, in the [Effect](https://effect.website) ecosystem.

The library wraps [upstream Playwright](https://playwright.dev), [upstream Stagehand](https://stagehand.dev), and raw [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) for use in edge environments. The same code runs on a Cloudflare Worker, on Bun, on Deno, or on Node, and points at Steel, Browserbase, Cloudflare Browser Run, or your own Chrome.

## How they compose

A **client** (`browser-playwright`, `browser-cdp`, or `browser-stagehand`) is the API surface you call. A **provider** is where the browser runs — a managed service or any Chrome DevTools Protocol endpoint. They're composed in the same Effect program:

<!-- verify:ignore -->

```typescript
import { Effect, Layer, Config } from "effect";
import { Playwright } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

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

The program is the same regardless of provider. To switch providers, replace `SteelProvider` with `BrowserbaseProvider`, `CfBrowserRunProvider`, or pass a raw Chrome DevTools Protocol URL to `withConnection({ url })` — the program itself doesn't change.

## Choosing a client

### Coming from `@cloudflare/playwright` or `stagehand`?

Most users land here migrating from one of these — start there.

- **`@cloudflare/playwright`** (or vanilla `playwright` with `chromium.connectOverCDP`) → use `browser-playwright`. The API is familiar; the lifecycle moves from manual `try/finally` to scoped `withSession` / `withConnection`, and the browser comes from a provider instead of a CDP URL. See [Migrating from Playwright](./migrations/from-playwright.md).
- **`stagehand`** → use `browser-stagehand`. Same `act` / `extract` / `observe` API, polyfilled for Cloudflare Workers. Or port the orchestration to `browser-playwright` if you'd rather drop the per-call LLM cost.

### Starting fresh?

Start with `browser-playwright`. It is the most stable, has the full upstream Playwright API, and runs on every runtime this library supports (Node, Bun, Deno, Cloudflare Workers). Move on only when a specific constraint pushes you:

- **Selectors are fragile and you'd rather describe intent?** Use `browser-stagehand`. Stagehand v3 (`act` / `extract` / `observe`), polyfilled for Cloudflare Workers. The LLM calls cost money and add latency.
- **`nodejs_compat` isn't an option, or every KB of bundle matters?** Use `browser-cdp` (experimental). It is the only client that doesn't polyfill Node.js builtins, at the cost of API surface — no locators, no upstream Playwright ergonomics, no `page.fetch`.

For per-runtime + per-browser compatibility, see [Runtime & Browser Support](./reference/runtime-and-browser-support.md).

## Choosing a provider

Choose according to your needs — pricing, capabilities, runtime constraints, regional availability, and whether you need things like anti-bot bypass or session replay. Each provider's own page has the details:

- [Steel](./providers/steel.md)
- [Browserbase](./providers/browserbase.md)
- [Cloudflare Browser Run](./providers/cf-browser-run.md)

The library is provider-agnostic: pick a different one, change one line, the program stays the same. Or skip the provider entirely and pass a Chrome DevTools Protocol URL to `withConnection({ url: "ws://localhost:9222" })` if you already operate Chrome (locally, on a VPS, in a container) — no API key, no third-party billing.

See [Providers](./providers/index.md) for per-provider installation (env vars, account IDs, layer args).

**Cloudflare Browser Run** has two `BrowserProvider` implementations: the **HTTP** implementation works everywhere (Node, Bun, Deno, Cloudflare Workers) with your Cloudflare account ID + API token; the **binding** implementation is Cloudflare Workers-only, uses `browser.binding` in `wrangler.jsonc`, and skips the HTTP roundtrip. See [Browser Run provider](./providers/cf-browser-run.md) for the full setup.

## Next steps

- [Getting started](./getting-started.md) — install + first session
- [Migrating from upstream Playwright](./migrations/from-playwright.md) — coming from `@cloudflare/playwright` or vanilla upstream Playwright
- [Cookbook — Managing sessions](./cookbook/managing-sessions.md) — copy-paste recipes
- [Cloudflare Workers guide](./guides/cloudflare-workers.md) — `wrangler.toml`, `nodejs_compat`, runtime gotchas