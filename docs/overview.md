# Overview

`@effect-libs/browser` is browser automation for Cloudflare Workers and other edge runtimes, built on [Effect](https://effect.website) v4. Three clients, each built on the same shape. Each runs against any browser that supports Chrome DevTools Protocol. Start with [Client + provider →](./concepts/client-and-provider.md) for the architecture.

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
```

## What you can do

- **Scrape JavaScript-heavy pages.** Get the rendered HTML, screenshot, or PDF of any page — even single-page apps and auth-walled content.
- **Extract data with AI.** Describe what you want in natural language. The AI finds the elements, even when the layout changes.
- **Hand off to a human.** Some sites need a real person for login, CAPTCHA, or 2FA. Share a live view, wait for the human, then continue.
- **Run multiple accounts on one browser.** Open separate cookie and storage spaces without paying for a new session per identity.

## Pick a client

A **client** is the browser-automation framework API you call — `Playwright`, `Cdp`, or `Stagehand`. Pick by what your Cloudflare Worker needs. See [Choosing a client →](./concepts/client-and-provider.md#choosing-a-client).

## Pick a provider

A **provider** is the browser that runs your code — Steel, Browserbase, Cloudflare Browser Run, or your own hosted Chrome. Pick where it should run. See [Choosing a provider →](./concepts/client-and-provider.md#choosing-a-provider).

## What you get

- **Automatic cleanup.** Browser sessions close themselves when your code is done — even on errors, timeouts, or request cancellation.
- **Swap providers with one line.** The same scraper runs against Steel, Browserbase, Cloudflare Browser Run, or your own hosted Chrome.
- **Typed errors.** Every failure is a specific, named error. Pattern-match them and the compiler checks you've handled every case.
- **Standard retries, timeouts, tracing.** Add them to any browser operation — they work just like they do for HTTP, databases, and queues.

## Next steps

- [Getting started →](./getting-started.md) — install + first session on Cloudflare Workers.
- [Client + provider →](./concepts/client-and-provider.md) — definitions, how to compose, and how to pick.
- [Cloudflare Workers guide →](./guides/cloudflare-workers.md) — configuration, runtime gotchas.
- [Migrating from Playwright →](./migrations/from-playwright.md) — coming from `@cloudflare/playwright` or upstream Playwright.
