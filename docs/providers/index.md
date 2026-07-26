# Providers

The `@effect-libs/browser-providers` package wraps managed browser providers — [Steel](./steel.md), [Browserbase](./browserbase.md), [Cloudflare Browser Run](./cf-browser-run.md). Each provider has its own install + configuration page; this page covers the patterns shared across all of them (swap, direct session access, Cloudflare Workers).

For help **picking** a provider (which one for what), see [Client & Provider → Choosing a provider](../overview.md#choosing-a-provider).

## Install

```bash
# Steel — needs steel-sdk
pnpm add @effect-libs/browser-providers steel-sdk effect@beta

# Browserbase — needs @browserbasehq/sdk
pnpm add @effect-libs/browser-providers @browserbasehq/sdk effect@beta

# Cloudflare Browser Run (HTTP) — needs cloudflare
pnpm add @effect-libs/browser-providers cloudflare effect@beta

# Cloudflare Browser Run (binding) — needs `@effect-libs/cloudflare-playwright`; `browser-playwright` only
pnpm add @effect-libs/browser-providers @effect-libs/cloudflare-playwright effect@beta
```

`effect` is a peer dependency — `effect@beta` installs the latest v4 beta (currently `4.0.0-beta.94`).

Don't want a provider? Connect to any Chrome DevTools Protocol URL with `playwright.withConnection({ url: "wss://…" })` — no provider package needed.

## Usage

Import a client and a provider, yield both in the program, merge their layers, and call `withSession`:

```typescript
import { Config, Effect, Layer } from "effect";

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
}).pipe(
  Effect.provide(
    Layer.merge(
      Playwright.layer,
      SteelProvider.layerConfig({ apiKey: Config.redacted("STEEL_API_KEY") }),
    ),
  ),
);
```

Same shape with any provider — just swap the import and the layer argument. See [Common patterns](#common-patterns) for swap and direct session access.

## Common patterns

These patterns are identical across Steel, Browserbase, and Cloudflare Browser Run (HTTP). See each provider page for the exact config (env vars, layer args, session options).

### Swap providers

The same program runs against any provider — only the layer swaps:

```typescript
import { Config, Effect, Layer } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* SteelProvider; // Swap point

  return yield* playwright.withSession({ provider }, ({ page, session }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      return yield* page.title;
    }),
  );
}).pipe(
  Effect.provide(
    Layer.merge(
      Playwright.layer,
      SteelProvider.layerConfig({ apiKey: Config.redacted("STEEL_API_KEY") }), // Must match the provider above
    ),
  ),
);
```

To switch providers: change the import, change `yield* SteelProvider`, and change the matching `SteelProvider.layerConfig(...)` argument. The `withSession` call and `Layer.merge` shape don't change.

### Direct session access

For custom session management — manual `createSession` → `getCdpUrl` → `playwright.withConnection({ url })` → `releaseSession`:

```typescript
import { Config, Effect, Layer, Option, Redacted } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* SteelProvider;

  const session = yield* provider.createSession({
    profileId: "my-profile",
    persistProfile: true,
  });
  console.log(`Session: ${session.id}`);

  const cdpUrl = Redacted.value(Option.getOrThrow(provider.getCdpUrl(session.id)));
  yield* playwright.withConnection({ url: cdpUrl }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
    }),
  );

  yield* provider.releaseSession(session.id);
}).pipe(
  Effect.provide(
    Layer.merge(
      Playwright.layer,
      SteelProvider.layerConfig({ apiKey: Config.redacted("STEEL_API_KEY") }),
    ),
  ),
);
```

`getCdpUrl` returns `Option.some(Redacted<url>)` for CDP-capable providers (Steel, Browserbase, CF HTTP) and `Option.none()` for the binding provider (CF binding) — the binding manages session lifecycle internally. The binding provider is also the one case that requires `layer({ endpoint: env.MYBROWSER })` instead of `layerConfig(...)`; see the [binding provider section](./cf-browser-run.md#binding-provider).

## See also

- [Cookbook](../cookbook/managing-sessions.md) — runnable recipes
- [Adding a provider](./adding-a-provider.md) — write your own
- [Cloudflare Workers guide](../guides/cloudflare-workers.md) — Cloudflare Workers-specific setup
- [Runtime & browser support](../reference/runtime-and-browser-support.md) — runtime compatibility matrix
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-providers/src) — full API in JSDoc
