# Getting started

> For context on who this is for, what the library does, and the three clients, see [Overview](./overview.md). This page is the install + configure + run path.

## Install

Pick the client that matches what you're using now:

**Coming from `@cloudflare/playwright` or upstream Playwright?**

```bash
pnpm add @effect-libs/browser-playwright effect@4.0.0-rc.108
```

`@effect-libs/browser-playwright` brings `@effect-libs/cloudflare-playwright` (our maintained fork of `@cloudflare/playwright@1.3.0`) as a transitive direct dependency — no separate install.

> **Effect v4 RC required.** All packages require the Effect v4 RC API and are incompatible with Effect v3 and prior Effect v4 beta APIs.

**Coming from `@browserbasehq/stagehand`?**

```bash
pnpm add @effect-libs/browser-stagehand @browserbasehq/stagehand effect@4.0.0-rc.108
```

**Want a zero-dependency Chrome DevTools Protocol client without `nodejs_compat`?**

```bash
pnpm add @effect-libs/browser-cdp effect@4.0.0-rc.108
```

[Choosing a client](./overview.md#choosing-a-client) covers the stability / API surface / dependency trade-offs. For per-client deep-dives (added APIs, errors, comparison with alternatives), see [`browser-playwright`](./packages/playwright/index.md), [`browser-stagehand`](./packages/stagehand/index.md), and [`browser-cdp`](./packages/cdp/index.md).

## Configure a provider

`withSession({ provider }, ...)` opens a session with a provider. This guide uses Steel as the running example; the same code works with [Browserbase](https://browserbase.com), [Cloudflare Browser Run](https://developers.cloudflare.com/browser-run/), or your own Chrome DevTools Protocol endpoint — only the layer changes. See [Providers](./providers/index.md) for per-provider setup and the [Choosing a provider](./overview.md#choosing-a-provider) table for the trade-offs.

For Steel:

```bash
pnpm add @effect-libs/browser-providers
echo "STEEL_API_KEY=your-key" > .dev.vars
```

`@effect-libs/browser-providers` is a meta-package. Each provider is an optional peer dependency — install only the SDKs you actually need (`steel-sdk`, `@browserbasehq/sdk`, `cloudflare`). The npm install picks the right peer automatically.

`.dev.vars` is a Cloudflare Workers convention for local-only secrets. Add it to `.gitignore`. On a deployed Worker, the same key is set with `wrangler secret put STEEL_API_KEY`. See the [Cloudflare Workers guide](./guides/cloudflare-workers.md) for the full setup.

## Write a program

Open a session on Steel, navigate to example.com, read the title:

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
```

Three things going on:

- `browser-playwright` is the **client** Effect service — the API you call. The other clients are `browser-cdp` and `browser-stagehand`.
- `SteelProvider` is the **provider** Effect service — where the browser runs. The other managed providers are `BrowserbaseProvider` and `CfBrowserRunProvider`; you can also skip the provider layer and pass a Chrome DevTools Protocol URL to `withConnection({ url })`.
- `withSession({ provider }, ({ page }) => ...)` opens a session on entry, gives you a Playwright `Page`, and closes the session on exit — including on errors, timeouts, and request cancellation. No `try/finally`.

`page` is an upstream Playwright `Page`. `goto`, `title`, `click`, `fill`, `evaluate`, and the rest of the API work as documented at [playwright.dev](https://playwright.dev). See [`browser-playwright` — Added APIs](./packages/playwright/added-apis.md) for the three methods the wrapper adds on top: `page.fetch`, `page.httpClient`, and `page.context()`.

## Run the program

<!-- verify:ignore -->

```typescript
const title = await Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.merge(
        Playwright.layer,
        SteelProvider.layerConfig({ apiKey: Config.redacted("STEEL_API_KEY") }),
      ),
    ),
  ),
);
console.log(title); // "Example Domain"
```

`Config.redacted("STEEL_API_KEY")` reads the env var. On Cloudflare Workers it reads from the worker's environment; locally it reads from `.dev.vars`. The `Redacted` wrapper masks the key in logs and traces — it never serializes in plain text.

`Effect.runPromise` runs the program to completion and resolves with the success value. For a non-blocking run that returns a `Fiber` (e.g. for graceful shutdown), use `Effect.runFork`; for synchronous code paths, `Effect.runSync`. See [Concepts — Effect](./concepts/effect.md) for the rest of the runtime entry points.

## Run on Cloudflare Workers

This is a Cloudflare Workers library, but the same `program` runs on Node, Bun, Deno, and workerd (via `wrangler dev`).

For a full Workers walkthrough — `wrangler.jsonc` setup, the `nodejs_compat` flag, the `browser.binding` for Cloudflare Browser Run, secrets management, local dev vs deploy — see the [Cloudflare Workers guide](./guides/cloudflare-workers.md).

## What's next

- [Choosing a client](./overview.md#choosing-a-client) and [Choosing a provider](./overview.md#choosing-a-provider) — when to pick which
- [Cloudflare Workers guide](./guides/cloudflare-workers.md) — full Workers walkthrough
- [Cookbook — Managing sessions](./cookbook/managing-sessions.md) — pool, fan-out, human-in-the-loop
- [Concepts — Effect](./concepts/effect.md) — typed errors, retries, timeouts, tracing
- [Migrating from upstream Playwright](./migrations/from-playwright.md) — coming from `@cloudflare/playwright` or vanilla upstream Playwright