# Swapping Providers

The scraper depends on the `BrowserProvider` interface — not Steel, Browserbase, or Browser Run. Swap the layer, nothing else changes.

```typescript
import { Effect, Redacted } from "effect";

import { Playwright, BrowserProvider } from "@effect-libs/browser-playwright";
import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";
import { CfBrowserRunProvider } from "@effect-libs/browser-providers/cf-browser-run";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

// The scraper only knows about the interface — never a concrete provider
const scrape = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* BrowserProvider;

  return yield* playwright.withSession({ provider }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      return yield* page.title;
    }),
  );
}).pipe(Effect.provide(Playwright.layer));

// Steel — anti-bot bypass, CAPTCHA solving
const withSteel = scrape.pipe(
  Effect.provide(SteelProvider.layer({ apiKey: Redacted.make(process.env.STEEL_API_KEY!) })),
);

// Browserbase — enterprise proxies, persistent contexts
const withBrowserbase = scrape.pipe(
  Effect.provide(
    BrowserbaseProvider.layer({ apiKey: Redacted.make(process.env.BROWSERBASE_API_KEY!) }),
  ),
);

// Cloudflare Browser Run — Cloudflare-native
const withCfBrowserRun = scrape.pipe(
  Effect.provide(
    CfBrowserRunProvider.layer({
      accountId: process.env.CF_ACCOUNT_ID!,
      apiKey: Redacted.make(process.env.CF_API_TOKEN!),
    }),
  ),
);
```

Use the `BrowserProvider` tag when the provider choice is a deployment decision (Steel in prod, local Chrome in dev). Use a concrete provider tag when the code is provider-specific (persistent contexts, profiles).

> **See also:** [Concepts → Client & Provider](../overview.md), [Cloudflare Workers Guide](../guides/cloudflare-workers.md#part-2-swap-providers--one-line-nothing-else-changes)

## See also

- [Concepts → Client & Provider](../overview.md) — the architecture that makes this work
- [Providers](../providers/steel.md) — what each provider gives you
