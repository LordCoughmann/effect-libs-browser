# Migrating from Playwright

You're using vanilla Playwright (`chromium.connectOverCDP`, `page.goto`, …) and Effect. This library keeps the Playwright API you already know and changes only the lifecycle, provider, and Effect integration. Most of your code stays the same.

## The two changes

**1. Lifecycle goes from manual to scoped.** Vanilla Playwright needs explicit `try/finally` at every nesting level to clean up browser → context → page. This library uses scoped callbacks (`withSession` / `withConnection`) that handle cleanup for you — on success, error, or fiber interruption (timeout, cancellation, SIGTERM).

**2. The browser lives behind a provider.** Instead of `chromium.connectOverCDP(wsUrl)`, you pass a provider to `withSession({ provider }, ...)` and the library creates and tears down the session for you. Or pass `{ url: "ws://..." }` to connect to a raw CDP endpoint.

## Side-by-side

### Open a page and get the title

**Vanilla:**

<!-- verify:ignore -->

```typescript
import { chromium } from "playwright";

async function getTitle(wsUrl: string) {
  const browser = await chromium.connectOverCDP(wsUrl);
  try {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      try {
        await page.goto("https://example.com");
        return await page.title();
      } finally {
        await page.close().catch(() => {});
      }
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}
```

**With this library:**

```typescript
import { Effect } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

const getTitle = (wsUrl: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;
    return yield* playwright.withConnection({ url: wsUrl }, ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto("https://example.com");
        return yield* page.title;
      }),
    );
  });
```

Cleanup is automatic. If `page.goto` throws, the fiber is interrupted, or `Effect.timeout` fires, the page, context, and connection all close.

### Use a provider (Steel)

**Vanilla:**

<!-- verify:ignore -->

```typescript
import Steel from "steel-sdk";
import { chromium } from "playwright";

const client = new Steel({ steelAPIKey: process.env.STEEL_API_KEY });

let session, browser;
try {
  session = await client.sessions.create();
  browser = await chromium.connectOverCDP(
    `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}&sessionId=${session.id}`,
  );
  const page = browser.contexts()[0].pages()[0];
  await page.goto("https://example.com");
  return await page.title();
} finally {
  await browser?.close().catch(() => {});
  if (session) await client.sessions.release(session.id);
}
```

**With this library:**

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

The provider handles session creation, CDP URL construction, and teardown.

### Composing with retries and timeouts

Because the program is an `Effect`, you get the standard combinators for free:

<!-- verify:ignore -->

```typescript
const program.pipe(
  Effect.retry(Schedule.exponential("1 second").pipe(Schedule.both(Schedule.recurs(3)))),
  Effect.timeout("30 seconds"),
  Effect.catchTag("effect-libs/browser/PlaywrightError", (e) =>
    Effect.logError(`Failed: ${e.message}`),
  ),
);
```

In vanilla Playwright, retry, timeout, and structured error handling are all per-call configuration that doesn't compose across operations. In Effect, they're just effects on the program.

### Switching providers without changing automation code

Pick the provider at the edge (env var, config, tenant) — the automation code is identical:

<!-- verify:ignore -->

```typescript
const ProviderLayer = Layer.unwrap(
  Effect.gen(function* () {
    const region = yield* Config.string("REGION");
    return region === "us"
      ? SteelProvider.layerConfig({ apiKey: Config.redacted("STEEL_API_KEY") })
      : BrowserbaseProvider.layerConfig({ apiKey: Config.redacted("BROWSERBASE_API_KEY") });
  }),
);

program.pipe(Effect.provide(Layer.merge(Playwright.layer, ProviderLayer)));
```

In vanilla Playwright, switching providers means editing every call site.

## What stays the same

- **Page API** — `page.goto`, `page.click`, `page.fill`, `page.locator(...)`, `page.evaluate(...)`, `page.waitForSelector(...)` — all direct effects or properties on the page handle.
- **Locator API** — `page.locator("a.more").click()`, `page.getByRole("button", { name: "Submit" }).click()`, `page.getByText("...")`.
- **Querying** — `page.$(...)`, `page.$$(...)`, `page.locator(...)`.
- **Waiting** — `page.waitForNavigation`, `page.waitForLoadState`, `page.waitForSelector`, `page.waitForRequest`, `page.waitForResponse`.
- **Network interception** — `page.route(...)`, `page.unroute(...)`, `page.routeWebSocket(...)`.
- **Frames** — `page.frames`, `page.mainFrame`, `page.frame(...)`, `page.frameLocator(...)`.

If a method isn't a direct property, it goes through `page.use((p) => ...)` — same Playwright Page object plus an `AbortSignal` wired to Effect cancellation.

## What changes (cheat sheet)

| Vanilla Playwright                                                                                                            | This library                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chromium.connectOverCDP(wsUrl)`                                                                                              | `playwright.withConnection({ url: wsUrl }, fn)`                                                                                                       |
| `client.sessions.create()` + `chromium.connectOverCDP(connectUrl)` + manual `browser.close()` + `client.sessions.release(id)` | `playwright.withSession({ provider }, fn)`                                                                                                            |
| `const title = await page.title()`                                                                                            | `const title = yield* page.title` (effect property, not a method)                                                                                     |
| `await page.goto(url)`                                                                                                        | `yield* page.goto(url)`                                                                                                                               |
| `await page.click(sel)`                                                                                                       | `yield* page.click(sel)`                                                                                                                              |
| `await page.locator(sel).textContent()`                                                                                       | `yield* page.locator(sel).textContent`                                                                                                                |
| `try { … } finally { await browser.close(); }`                                                                                | scoped — automatic on success, error, interruption                                                                                                    |
| string-matched exceptions                                                                                                     | typed `PlaywrightError` with a `reason` union (`ConnectionError`, `NavigationError`, `OperationError`, `ContextError`) — match with `Effect.catchTag` |

## When to use this library

**Use it when:**

- You're on Cloudflare Workers or another edge runtime where the original `playwright` doesn't run
- You want a stable, Effect-native interface you can swap providers on
- You're already using Effect — typed errors, retries, and scoped cleanup are free

**Don't use it when:**

- You're on Node.js, Deno, or Bun and don't need edge deployment — the original `playwright` is more complete and well-tested
- You only need a thin Chrome DevTools Protocol wire client — see [browser-cdp — Comparison](../packages/cdp/comparison.md)

## Full side-by-side rewrite of provider examples

The [side-by-side rewrites](../comparisons/side-by-side.md) page rewrites seven real examples from the Steel, Browserbase, and Cloudflare Browser Run documentation with this library — including persistent contexts, human-in-the-loop, session reuse, and form filling.
