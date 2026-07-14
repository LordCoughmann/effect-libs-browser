## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com) with Cloudflare Workers enabled
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) installed (`pnpm add -D wrangler`)
- A provider API key — [Steel](https://steel.dev) (recommended for anti-bot), [Browserbase](https://browserbase.com) (enterprise proxies), or [Browser Run](https://developers.cloudflare.com/browser-run/) (Cloudflare-native)

---

## Part 1: New project from scratch

This walks through a production-ready Worker: `browser-playwright` + `SteelProvider`. Swap Steel for Browserbase or Browser Run by changing one layer — nothing else moves.

### 1. Create the project

```bash
mkdir my-browser-worker && cd my-browser-worker
pnpm init
```

### 2. Install dependencies

```bash
pnpm add effect @effect-libs/browser-playwright @effect-libs/browser-providers
pnpm add -D wrangler typescript @types/node
```

| Package                           | Role                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `effect`                          | Effect runtime — scoped cleanup, typed errors, retries     |
| `@effect-libs/browser-playwright` | Full Playwright API on Cloudflare Workers (the **client**) |
| `@effect-libs/browser-providers`  | Steel, Browserbase, and Browser Run providers              |

### 3. Configure TypeScript

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["@types/node"],
  },
}
```

### 4. Configure Wrangler

```jsonc
// wrangler.jsonc
{
  "name": "my-browser-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-05-23",
  "compatibility_flags": ["nodejs_compat"],
}
```

`nodejs_compat` is required by `@effect-libs/browser-playwright`. If you're using Browser Run's binding provider, you'll also add a `browser.binding` — but for Steel and Browserbase, this is all you need.

### 5. Store your API key

```bash
# .dev.vars (never commit this file)
STEEL_API_KEY=your-steel-api-key
```

### 6. Write the Worker

<!-- verify:ignore -->

```typescript
// src/index.ts
import { Effect, Layer, Redacted } from "effect";
import { Playwright } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

export interface Env {
  STEEL_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/scrape") {
      return Effect.runPromise(
        Effect.gen(function* () {
          const playwright = yield* Playwright;
          const provider = yield* SteelProvider;

          const title = yield* playwright.withSession({ provider }, ({ page }) =>
            Effect.gen(function* () {
              yield* page.goto("https://example.com");
              return yield* page.title;
            }),
          );

          return new Response(title);
        }).pipe(
          Effect.provide(
            Layer.merge(
              Playwright.layer,
              SteelProvider.layer({
                apiKey: Redacted.make(env.STEEL_API_KEY),
              }),
            ),
          ),
        ),
      );
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

That's the whole Worker. Here's what's happening:

1. **`Playwright.layer`** provides the Playwright client — the API you call
2. **`SteelProvider.layer({ apiKey })`** provides the Steel provider — where the browser lives. Uses `layer` (not `layerConfig`) because `layerConfig` reads from Node.js `process.env`, which doesn't exist in Cloudflare Workers
3. **`playwright.withSession({ provider }, ...)`** opens a browser session on Steel's infrastructure, gives you a Playwright `Page`, and cleans up when the callback returns — even on errors or timeouts
4. Inside the callback, `page` is a standard Playwright Page — `goto`, `title`, `click`, `fill`, `evaluate`, everything

### 7. Run it

```bash
# Local dev
pnpm wrangler dev

# Deploy
pnpm wrangler deploy
```

---

## Part 2: Swap providers — one line, nothing else changes

The whole point of the provider pattern: swap the layer, the business logic stays identical.

```typescript
import { Effect, Layer, Redacted } from "effect";

import { Playwright, BrowserProvider } from "@effect-libs/browser-playwright";
import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";
import { CfBrowserRunProvider } from "@effect-libs/browser-providers/cf-browser-run";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

// The scraper doesn't know which provider it uses — depends on BrowserProvider interface
const scrape = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* BrowserProvider;

  return yield* playwright.withSession({ provider }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      return yield* page.title;
    }),
  );
});

// Steel — anti-bot bypass, CAPTCHA solving
const withSteel = scrape.pipe(
  Effect.provide(
    Layer.merge(
      Playwright.layer,
      SteelProvider.layer({ apiKey: Redacted.make(process.env.STEEL_API_KEY!) }),
    ),
  ),
);

// Browserbase — enterprise proxies, persistent contexts
const withBrowserbase = scrape.pipe(
  Effect.provide(
    Layer.merge(
      Playwright.layer,
      BrowserbaseProvider.layer({ apiKey: Redacted.make(process.env.BROWSERBASE_API_KEY!) }),
    ),
  ),
);

// Cloudflare Browser Run (HTTP) — Cloudflare-native, no external API key
const withCfBrowserRun = scrape.pipe(
  Effect.provide(
    Layer.merge(
      Playwright.layer,
      CfBrowserRunProvider.layer({
        accountId: process.env.CF_ACCOUNT_ID!,
        apiKey: Redacted.make(process.env.CF_API_TOKEN!),
      }),
    ),
  ),
);
```

Each provider has its own setup — see the provider reference docs:

| Provider                                                                 | Docs                                  | Best for                                               |
| ------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------ |
| [Steel](../providers/steel.md)                                           | API key in `.dev.vars`                | Anti-bot bypass, CAPTCHA solving, persistent profiles  |
| [Browserbase](../providers/browserbase.md)                               | API key in `.dev.vars`                | Enterprise proxies, persistent contexts                |
| [Browser Run (HTTP)](../providers/cf-browser-run.md)                     | Account ID + API token                | Cloudflare-native, works with CDP and Stagehand        |
| [Browser Run (binding)](../providers/cf-browser-run.md#binding-provider) | `browser.binding` in `wrangler.jsonc` | Cloudflare Workers-only, fastest path, Playwright only |

> **Important:** All external providers on Cloudflare Workers use `layer({ apiKey: Redacted.make(...) })`, NOT `layerConfig(...)`. `layerConfig` reads from Node.js `process.env` via Effect's `Config` system, which doesn't exist in Cloudflare Workers. Always pass values explicitly from `env`.

---

## Part 3: Adding to an existing Worker

Already have a Worker? Add browser automation in three steps:

**1. Add dependencies:**

```bash
pnpm add @effect-libs/browser-playwright @effect-libs/browser-providers
```

**2. Add your API key to `.dev.vars` and `Env`:**

```typescript
export interface Env {
  STEEL_API_KEY: string; // add this
  // ... your existing bindings ...
}
```

**3. Wire in a route:**

<!-- verify:ignore -->

```typescript
import { Effect, Layer, Match, Cause, Redacted } from "effect";
import { Playwright } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Your existing routes...
    if (url.pathname === "/api/scrape") {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const playwright = yield* Playwright;
          const provider = yield* SteelProvider;

          return yield* playwright.withSession({ provider }, ({ page }) =>
            Effect.gen(function* () {
              yield* page.goto("https://news.ycombinator.com");
              return yield* page.evaluate(() =>
                Array.from(document.querySelectorAll(".titleline > a"))
                  .slice(0, 5)
                  .map((a) => a.textContent),
              );
            }),
          );
        }).pipe(
          Effect.provide(
            Layer.merge(
              Playwright.layer,
              SteelProvider.layer({ apiKey: Redacted.make(env.STEEL_API_KEY) }),
            ),
          ),
        ),
      );

      // Typed error handling — see Concepts for full pattern
      return Match.value(exit).pipe(
        Match.tag("Success", (e) => Response.json(e.value)),
        Match.tag("Failure", (e) =>
          Response.json({ error: Cause.pretty(e.cause) }, { status: 500 }),
        ),
        Match.exhaustive,
      );
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

---

## Part 4: Going further

Now that you have a working browser automation Worker, the rest of the docs are reference material for specific needs:

| When you need to...                    | Read this                                                                                                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the architecture            | **[Concepts](../concepts/client-and-provider.md)** — client + provider, scoped resources (Session → Connection → Context → Page), typed errors                                                           |
| Handle errors properly                 | **[Playwright — Errors](../packages/playwright/errors.md)** — 4 typed reason classes with pattern matching                                                                                               |
| Add retries and timeouts               | **[Concepts → Composing with effects](../concepts/effect.md)** — `Effect.retry`, `Effect.timeout`, `Effect.withSpan`                                                                     |
| Pool sessions across requests          | **[Managing Resources](../concepts/resources.md)** — `withX` vs `acquireX`, session/connection/context/page tradeoffs                                                                           |
| Persist login state across sessions    | **[Managing Resources → Persisting auth](../concepts/resources.md#persisting-auth-across-sessions)** — save & restore vs keep alive                                                             |
| Use Page API beyond `goto`/`title`     | **[`browser-playwright` → Page API](../packages/playwright/index.md#added-apis)** — click, fill, evaluate, locators, and the `page.use()` escape hatch                                                 |
| Set geolocation, cookies, user agent   | **[`browser-playwright` — Context API](../packages/playwright/context.md)** — `setGeolocation`, `grantPermissions`, `addCookies`, `storageState`                                                         |
| Use keyboard, mouse, touchscreen       | **[`browser-playwright` — Input](../packages/playwright/input.md)** — `keyboard.type`, `mouse.drag`, `touchscreen.tap`                                                                                   |
| Make HTTP requests through the browser | **[`browser-playwright` — Added APIs](../packages/playwright/added-apis.md)** — `page.fetch`, `page.httpClient`                                                                                          |
| Use AI-powered automation              | **[`browser-stagehand`](../packages/stagehand/index.md)** — `act`/`extract`/`observe` primitives on Cloudflare Workers                                                                                   |
| Go lightweight (no `nodejs_compat`)    | **[`browser-cdp`](../packages/cdp/index.md)** — zero-dependency client, same API shape                                                                                                                   |
| Access provider SDKs directly          | **[Steel](../providers/steel.md#steel-specific-features)** · **[Browserbase](../providers/browserbase.md#browserbase-specific-features)** · **[Browser Run](../providers/cf-browser-run.md#sdk-access)** |
| Write your own provider                | **[Adding a Provider](../providers/adding-a-provider.md)** — implement `BrowserProviderService`                                                                                                          |

---

## Limitations

### From `@cloudflare/playwright` (affects Playwright and Stagehand)

- Chrome only — no Firefox or WebKit
- No `browserType.launch` — use `withSession` or `withConnection` instead
- No Playwright Test runner
- Some APIs not implemented — see [`browser-playwright` → Not supported](../packages/playwright/index.md#not-supported)

### Provider-specific

- **Steel, Browserbase:** require API keys. `layerConfig()` doesn't work in Cloudflare Workers — use `layer({ apiKey: Redacted.make(...) })` with values from `env`
- **Browser Run:** [session duration and concurrency limits](https://developers.cloudflare.com/browser-run/platform/limits/); no persistent state between sessions
- **Browser Run binding:** Playwright only — no CDP or Stagehand
- **All providers:** sessions are isolated billing units — save cookies/localStorage yourself if you need state across sessions

---

## See also

- [Getting started](../getting-started.md) — architecture overview, pick a module and provider
- [Concepts](../concepts/client-and-provider.md) — client + provider, scoped resources, typed errors
- [Managing Resources](../concepts/resources.md) — sessions, connections, contexts, pages, pooling
- [`browser-playwright`](../packages/playwright/index.md) — full upstream Playwright API
- [Examples](../../examples/README.md) — runnable Hacker News scrapers
