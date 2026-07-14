# Managing Sessions

Three recipes for the most common session operations: open a fresh session and get a `page`, connect to one that's already running, and pool pages across requests.

## Basic scrape

Open a browser session, navigate to a page, extract the title. The session is released automatically when the callback returns — no `try/finally` needed.

<!-- verify:ignore -->

```typescript
import { Effect, Layer, Redacted } from "effect";
import { Playwright } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

const scrape = (apiKey: string) =>
  Effect.gen(function* () {
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
        SteelProvider.layer({ apiKey: Redacted.make(apiKey) }),
      ),
    ),
  );

// Cloudflare Workers entry point
export default {
  async fetch(_request: Request, env: { STEEL_API_KEY: string }) {
    return Effect.runPromise(
      scrape(env.STEEL_API_KEY).pipe(Effect.map((title) => new Response(title))),
    );
  },
} satisfies ExportedHandler;
```

Swap providers by changing the layer — the scraper doesn't change. See [Swapping providers](./swapping-providers.md).

> **See also:** [Cloudflare Workers Guide](../guides/cloudflare-workers.md), [Steel provider](../providers/steel.md)

---

## Connect to an existing session

Already have a browser session? Connect to it by URL — no provider layer needed. Useful when a human logged in via live view and you want to automate from there, or when you cached a CDP URL from a previous request.

```typescript
import { Effect } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

const useExistingSession = (cdpUrl: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;

    return yield* playwright.withConnection({ url: cdpUrl }, ({ page }) =>
      Effect.gen(function* () {
        // Already logged in — go straight to the protected page
        yield* page.goto("https://saas.example.com/dashboard");
        return yield* page.title;
      }),
    );
  }).pipe(Effect.provide(Playwright.layer));
```

The session stays alive after the callback returns — `withConnection` disconnects the WebSocket but doesn't release the browser. Reconnect later with the same URL.

> **See also:** [Concepts → Managing Resources](../concepts/resources.md#connection--reuse-a-logged-in-browser)

---

## Pool sessions across requests

When requests arrive faster than you can create sessions, keep a session alive and fan pages out from it. Use `acquireConnection` (owned scope) instead of `withConnection` (callback scope).

```typescript
import { Effect, Exit, Scope } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

const makeSessionPool = (cdpUrl: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;

    // Create a scope that outlives any single callback
    const scope = yield* Scope.make();
    const { connection, page } = yield* playwright
      .acquireConnection({ url: cdpUrl })
      .pipe(Scope.provide(scope));

    // Login once on the default page
    yield* page.goto("https://saas.example.com/login");
    yield* page.fill("#email", "user@example.com");
    yield* page.click("button[type=submit]");

    return {
      // Fan out concurrent pages — all share the login
      scrape: (url: string) =>
        connection.withPage((p) =>
          Effect.gen(function* () {
            yield* p.goto(url);
            return yield* p.title;
          }),
        ),
      // Close the pool when done
      close: Scope.close(scope, Exit.void),
    };
  }).pipe(Effect.provide(Playwright.layer));

// Usage
const pool = await Effect.runPromise(makeSessionPool("wss://..."));
// In production: load from config, queue, or DB
const paths: ReadonlyArray<string> = ["/products", "/cart", "/checkout"];
const results = await Effect.runPromise(
  Effect.all(
    paths.map((path) => pool.scrape(`https://saas.example.com${path}`)),
    { concurrency: 5 }, // tune to your browser's capacity
  ),
);
await Effect.runPromise(pool.close);
```

> **See also:** [Concepts → Managing Resources → Owned scopes](../concepts/resources.md#owned-scopes-when-withx-isnt-enough)

## Hand off to a human

Some sites require CAPTCHA, 2FA, or other human-only steps. Share the live view URL, wait for the human to complete the flow, then continue automation.

<!-- verify:stubs -->

```typescript
import { Effect, Layer, Redacted } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { CfBrowserRunProvider } from "@effect-libs/browser-providers/cf-browser-run";

const humanInTheLoop = (accountId: string, apiToken: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;
    const provider = yield* CfBrowserRunProvider;

    return yield* playwright.withSession({ provider }, ({ page, session }) =>
      Effect.gen(function* () {
        yield* page.goto("https://bank.example.com/login");

        // Share the live view URL — the human opens it, completes login/2FA/CAPTCHA
        console.log(`Human needed. Open: ${session.liveViewUrl}`);

        // Wait up to 5 minutes for the human to finish
        yield* page.waitForNavigation({ waitUntil: "networkidle", timeout: 300_000 });

        // Human is done — continue automation on the authenticated page
        yield* page.goto("https://bank.example.com/dashboard");
        return yield* page.title;
      }),
    );
  }).pipe(
    Effect.provide(
      Layer.merge(
        Playwright.layer,
        CfBrowserRunProvider.layer({
          accountId,
          apiKey: Redacted.make(apiToken),
        }),
      ),
    ),
  );
```

`session.liveViewUrl` is the same field name across all providers — Steel, Browserbase, and Cloudflare Browser Run normalize it.

> **See also:** [CF Browser Run provider](../providers/cf-browser-run.md), [Concepts → Managing Resources → Connection](../concepts/resources.md#connection--reuse-a-logged-in-browser)

## See also

- [Scoped Resources](../concepts/resources.md) — architecture overview, the Session/Connection/Context/Page hierarchy
- [Managing Resources](../concepts/resources.md) — pooling patterns, scope selection, owned scopes
- [Swapping providers](./swapping-providers.md) — same scraper against any provider
- [Working with pages](./working-with-pages.md) — what to do once you have a `page`
- [Reusing auth](./reusing-auth.md) — keep login state across sessions
