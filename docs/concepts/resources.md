# Resources

Browser automation is organized into four levels: `Session` → `Connection` → `Context` → `Page`. Each level represents a scope of work. The library handles cleanup at every level — when your code is done with a resource, it closes itself, even on errors, timeouts, or cancellations.

## The hierarchy

```
Session (a running instance of web browser hosted and managed by the provider, e.g. Steel.dev)
  └─ Connection (a connection between your client, e.g. Cloudflare Worker, and the Session)
      └─ Context (a context shared between the Pages)
          └─ Page (an actual tab or page opened in the web browser)
```

## What each level is

- A **`Session`** is a running instance of a web browser, hosted and managed by the provider (e.g. Steel.dev). The browser runs on the provider's server and receives your instructions and executes them.
- A **`Connection`** is a connection between your client (e.g. Cloudflare Worker) and the `Session`. Your client sends Chrome DevTools Protocol instructions through this WebSocket connection. A `Connection` exposes a default `Page` in an implicit default `Context`, which is why `withConnection(...)` returns `{ connection, page }` directly without requiring an explicit context.
- A **`Context`** is a context shared between the `Page`s. Different `Context`s in the same `Connection` have isolated cookies, localStorage, and IndexedDB — useful for multi-account or multi-tenant isolation on one connection.
- A **`Page`** is an actual tab or page opened in the web browser. `Page`s share cookies and storage with sibling `Page`s in the same `Context`. A `Page` does not have its own cookies or storage — those live on the `Context`.

## Billing

Costs are provider-specific, but the typical dimensions are:

- Number of concurrent `Session`s
- Length of each `Session`
- Maximum number of `Connection`s per `Session`
- Resource limits (e.g., RAM caps the number of `Page`s you can open at the same time)

See the provider's website for exact pricing and limits.

## Entry points

Each level has **two entry points** with the same shape:

| Form                | Lifetime             | Use when                              |
| ------------------- | -------------------- | ------------------------------------- |
| `withX(source, fn)` | scope = the callback | default — used 90% of the time        |
| `acquireX(source)`  | you own the scope    | pooling, fan-out, long-lived sessions |

Use `withX` 90% of the time; use `acquireX` only when the resource needs to outlive a single callback (pools, durable objects, fan-out). See [Owned scopes](#owned-scopes-when-withx-isnt-enough) below for the patterns.

## Session — "Scrape and clean up"

**API**: `playwright.withSession({ provider }, fn)` → `{ session, connection, context, page }`

A session is the outermost scope. The provider allocates a fresh browser, you do your work, and everything is cleaned up when the callback completes. Use this when you want **full isolation with zero leftover state**.

### When to use

- One-off scraping jobs
- Each request needs a clean browser slate
- No need to persist cookies or login state

### Example

<!-- verify:ignore -->

```typescript
import { Effect } from "effect";

import { Playwright, BrowserProvider } from "@effect-libs/browser-playwright";

const scrapeProduct = (url: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;
    const provider = yield* BrowserProvider;

    return yield* playwright.withSession({ provider }, ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto(url);
        return yield* page.title;
      }),
    );
  });
```

**Cost**: Each `withSession` call creates a new session. Providers bill per session and/or duration — minimize both.

## Connection — "Reuse a logged-in browser"

**API**: `playwright.withConnection(source, fn)` → `{ connection, context, page }`

A connection gives you a Chrome DevTools Protocol WebSocket to a browser without managing the session lifecycle. You're connecting to an **existing** browser — reuse authentication state, cookies, and localStorage from a previous login.

`source` is `{ url: string }` (raw Chrome DevTools Protocol WebSocket URL) or `{ session }` (provider session you already hold).

### When to use

- Human-in-the-loop: someone logged in via live view, now you automate
- Reuse a session across multiple operations
- Provider session created elsewhere

### Example: Human logs in, code takes over

All providers normalize the live view URL to `session.liveViewUrl` (the raw SDK field names differ — `debugUrl` for Steel, `debuggerUrl` for Browserbase, `devtoolsFrontendUrl` for CF Browser Run). Share the URL with a human, they complete login/CAPTCHA/2FA, then you connect:

<!-- verify:ignore -->

```typescript
import { Effect } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

const program = (cdpUrl: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;

    return yield* playwright.withConnection({ url: cdpUrl }, ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto("https://saas.example.com/dashboard");
        return yield* page.title;
      }),
    );
  });
```

**Cost**: No additional session creation — you're reusing an existing one. Usage time may still tick depending on provider.

## Context — "Isolate identities within one browser"

**API**: `connection.withContext(fn)` → `{ context, page }`

A browser context is an **isolated sandbox** within a connection. Each context has its own cookies, localStorage, and cache — completely separate from other contexts. Use it for **different identities on the same browser** without paying for separate sessions.

> Contexts and pages are nested operations on a connection handle — callback-only. No `acquireContext`; if you need a context to outlive a callback, acquire the parent connection.

### When to use

- Multi-tenant: check prices from different accounts
- Parallel tests with no state leakage
- One billing unit, multiple identities

### Example: Multi-account price comparison

<!-- verify:ignore -->

```typescript
import { Effect } from "effect";

import { Playwright, BrowserProvider } from "@effect-libs/browser-playwright";

const comparePrices = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* BrowserProvider;

  return yield* playwright.withSession({ provider }, ({ connection }) =>
    Effect.gen(function* () {
      const personalPrice = yield* connection.withContext(({ page }) =>
        Effect.gen(function* () {
          yield* page.goto("https://shop.example.com/login");
          // ...login as personal@example.com...
          yield* page.goto("https://shop.example.com/product/123");
          return yield* page.locator(".price").textContent;
        }),
      );

      const businessPrice = yield* connection.withContext(({ page }) =>
        Effect.gen(function* () {
          yield* page.goto("https://shop.example.com/login");
          // ...login as business@company.com...
          yield* page.goto("https://shop.example.com/product/123");
          return yield* page.locator(".price").textContent;
        }),
      );

      return { personalPrice, businessPrice };
    }),
  );
});
```

**Cost**: Zero. One session = one billing unit regardless of contexts.

## Page — "Multiple pages, minimal cost"

**API**: `connection.withPage(fn)` or `context.withPage(fn)` → bare `page`
**Shortcut**: `playwright.withPage(source, fn)` → bare `page`

A page is one browser page within a context. Pages in the same context share cookies and localStorage — use it for **multi-page workflows**.

### When to use

- Multi-page scraping: pagination, parallel extraction
- Same-site operations that share login state

### Example: Paginated search results

<!-- verify:ignore -->

```typescript
import { Effect } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

const scrapeAllPages = (cdpUrl: string, jobs: ReadonlyArray<{ query: string; page: number }>) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;

    return yield* playwright.withConnection({ url: cdpUrl }, ({ connection, page }) =>
      Effect.gen(function* () {
        yield* page.goto("https://shop.example.com/login");
        yield* page.locator("#email").fill("user@example.com");
        yield* page.locator("#submit").click();

        const results = yield* Effect.all(
          jobs.map((job) =>
            connection.withPage((p) =>
              Effect.gen(function* () {
                yield* p.goto(
                  `https://shop.example.com/search?q=${encodeURIComponent(job.query)}&page=${job.page}`,
                );
                return yield* p.locator(".results").textContent;
              }),
            ),
          ),
          { concurrency: 5 },
        );

        return results;
      }),
    );
  });
```

**Cost**: Zero. Pages are free — you're just opening more pages.

## Quick reference

### Entry points (service level)

| Level          | Callback (primary)              | Owned scope (escape hatch)     | Scope bundle                             | Cost            | Best for                  |
| -------------- | ------------------------------- | ------------------------------ | ---------------------------------------- | --------------- | ------------------------- |
| **Session**    | `withSession({ provider }, fn)` | `acquireSession({ provider })` | `{ session, connection, context, page }` | $$$ per session | One-off jobs, clean slate |
| **Connection** | `withConnection(source, fn)`    | `acquireConnection(source)`    | `{ connection, context, page }`          | $0 (reuse)      | Human-in-loop, reuse auth |
| **Page**       | `withPage(source, fn)`          | `acquirePage(source)`          | `page` (bare)                            | $0              | Simplest "just scrape"    |

### Nested operations (handle level)

| Handle         | Method                       | Scope bundle        | Cost | Best for                     |
| -------------- | ---------------------------- | ------------------- | ---- | ---------------------------- |
| **Connection** | `connection.withContext(fn)` | `{ context, page }` | $0   | Multi-tenant, isolated tests |
| **Connection** | `connection.withPage(fn)`    | `page`              | $0   | Multi-page, same-site        |
| **Context**    | `context.withPage(fn)`       | `page`              | $0   | Multi-page within context    |

## Client differences

### [`browser-playwright`](../packages/playwright/index.md) (recommended)

The stable, fully-featured client. Use this unless you have a specific reason to use `browser-cdp`.

### [`browser-cdp`](../packages/cdp/index.md) (experimental)

Also supports the full 4-level hierarchy with the same API. Lighter, zero-dependency — prefer `browser-playwright` for production.

### [`browser-stagehand`](../packages/stagehand/index.md)

Stagehand has 2 levels only: **session** and **connection**. The `instance` is the unit of work — no context/page nesting. Use Stagehand alongside `browser-playwright` if you need context/page control plus AI extraction.

## Owned scopes: when `withX` isn't enough

`withX` closes the resource when the callback returns. Use `acquireX` when the resource should **outlive a single callback**:

- **Pool a connection** across many requests
- **Fan out** pages without nesting everything in one callback
- **Store** a connection in a `Ref` for reuse

### Pattern: `acquireConnection` with `Effect.scoped`

<!-- verify:ignore -->

```typescript
import { Effect } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

const scrape = (cdpUrl: string, jobs: ReadonlyArray<{ query: string; page: number }>) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;

    const { connection, page } = yield* playwright.acquireConnection({ url: cdpUrl });

    yield* page.goto("https://example.com");
    const title = yield* page.title;

    const extras = yield* Effect.all(
      jobs.map((job) =>
        connection.withPage((p) =>
          Effect.gen(function* () {
            yield* p.goto(`https://example.com/search?q=${job.query}&page=${job.page}`);
            return yield* p.title;
          }),
        ),
      ),
      { concurrency: 5 },
    );

    return [title, ...extras];
  }).pipe(Effect.scoped, Effect.provide(Playwright.layer));
```

### Pattern: long-lived connection with a manual scope

For a connection that survives across requests (Durable Object, pooled service):

<!-- verify:ignore -->

```typescript
import { Effect, Exit, Scope } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

const makeBrowserPool = (cdpUrl: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;

    const scope = yield* Scope.make();
    const { connection, page } = yield* playwright
      .acquireConnection({ url: cdpUrl })
      .pipe(Scope.provide(scope));

    return {
      connection,
      page,
      close: Scope.close(scope, Exit.void),
    };
  }).pipe(Effect.provide(Playwright.layer));
```

## Persisting auth across sessions

| Strategy           | How it works                                                              | Cost                            | When to use                                 |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------- |
| **Save & restore** | Release session, save context/profile, create new session with saved data | Pay per session (cheaper)       | Login expensive but state is serializable   |
| **Keep alive**     | Don't release session, reconnect via `acquireConnection`                  | Pay for session + idle duration | Need runtime state that can't be serialized |

### Steel: Profiles

Steel's Profiles API captures full browser state (cookies, extensions, credentials). Pass `profileId` when creating new sessions to restore auth.

### Browserbase: Contexts

Browserbase Contexts persist cookies, localStorage, IndexedDB. Create a context, attach to sessions, reuse across runs.

### Cloudflare Browser Run: Keep alive

CF Browser Run doesn't support saving state. Use `keepAlive` parameter to extend session lifetime and reconnect before it expires.

See provider docs for details: [Steel](../providers/steel.md), [Browserbase](../providers/browserbase.md), [CF Browser Run](../providers/cf-browser-run.md).

## See also

- [Overview — How they compose](../overview.md#how-they-compose) — the architecture that makes all three clients interchangeable at the layer level
- [Cookbook: Managing sessions](../cookbook/managing-sessions.md) — runnable recipes for the common cases
- [Effect](./effect.md) — how Effect guarantees cleanup on success, error, or interruption
