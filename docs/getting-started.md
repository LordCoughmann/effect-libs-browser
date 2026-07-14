# Getting started

> For context on who this is for, what the library does, and the three clients, see [Overview →](./overview.md). This page is the mechanical path: install, run a session, done.

## Install

The default — Playwright on Cloudflare Workers:

```bash
pnpm add @effect-libs/browser-playwright effect@beta
```

The Playwright runtime comes from `@effect-libs/cloudflare-playwright` (our maintained fork of `@cloudflare/playwright@1.3.0`) as a transitive direct dependency — no separate install command needed. `effect` is also a peer dependency — `effect@beta` installs the latest v4 beta (currently `4.0.0-beta.94`).

Other clients:

```bash
# AI-powered browser automation (Stagehand v3 on Workers)
pnpm add @effect-libs/browser-stagehand @browserbasehq/stagehand effect@beta

# Zero-dependency CDP, no nodejs_compat required (experimental)
pnpm add @effect-libs/browser-cdp effect@beta
```

[Choosing a client →](./concepts/client-and-provider.md#choosing-a-client) for the full comparison.

## Run a session

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
```

Three things going on:

- **client** (`Playwright` from `@effect-libs/browser-playwright`) — which API surface
- **provider** (`SteelProvider`) — where the browser runs
- **`withSession(...)`** — scoped lifecycle (opens on entry, closes on exit, including on errors and timeouts)

Swap `SteelProvider` for `BrowserbaseProvider`, `CfBrowserRunProvider`, or a raw CDP URL — same code:

<!-- verify:ignore -->

```typescript
// Any CDP-compatible endpoint — your hosted Chrome, local Chrome, anything
yield* playwright.withConnection({ url: "ws://localhost:9222" }, ({ page }) => /* ... */);
```

[Providers →](./providers/index.md) for the full list and per-provider setup.

## Next steps

- **[Cloudflare Workers Guide →](./guides/cloudflare-workers.md)** — `nodejs_compat`, `wrangler.toml` setup
- **[Cookbook → Managing sessions →](./cookbook/managing-sessions.md)** — copy-paste recipes
- **[Concepts → Client + provider →](./concepts/client-and-provider.md)** — the architecture
- **[Migrating from Playwright →](./migrations/from-playwright.md)** — coming from `@cloudflare/playwright` or vanilla upstream Playwright
