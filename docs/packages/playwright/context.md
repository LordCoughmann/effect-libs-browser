# browser-playwright — Context API

> **`@effect-libs/browser-playwright`'s `BrowserContext` equivalent.** Every scope bundle (`Session`, `Connection`, `Context`) carries a `context` field. The `context` is the unit of cookies, storage, emulation overrides (user agent, geolocation, offline state), permissions, and timeouts — it's the same shape whether you reach it via `connection.withContext(...)`, the `context` field on a scope, or `page.context()` on a page-only scope.
>
> For the full method surface (17 methods), see the JSDoc on [`PlaywrightBrowserContext`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-playwright/src/internal/PlaywrightBrowserContext.ts).

## Context vs page vs connection

The three scopes get confused. Here's the disambiguation:

- **Connection** — one Chrome DevTools Protocol WebSocket session to a browser. You can have many pages under one connection, but they share the same browser defaults. Acquired via `playwright.withConnection({ url }, ({ context, page }) => ...)` or `connection = yield* playwright.acquireConnection(...)`.
- **Context** (`BrowserContext`) — isolated cookies / storage / emulation. Multiple pages under one context share those, but contexts within one connection are isolated from each other. Acquired via `connection.withContext(...)` or `connection.acquireContext(...)`. The page-level `page.context()` returns the same handle.
- **Page** — one tab. Each page belongs to exactly one context (the default context if none was opened). Acquired via the `page` field on every scope, or `connection.withPage(...)` / `context.withPage(...)` for additional pages.

| Scope      | What it isolates            | What it shares                  |
| ---------- | --------------------------- | ------------------------------- |
| Connection | The WebSocket               | Browser defaults (no isolation) |
| Context    | Cookies, storage, emulation | The underlying connection       |
| Page       | (nothing — leaf)            | The underlying context          |

## Why context-level?

Context-level methods apply to **every page in the context**, not just the default page. A new page opened via `connection.withPage(...)` or `context.withPage(...)` inherits the same cookies, user-agent override, geolocation, and offline state as the default page.

The page-level mirror `page.context()` returns the same handle, so context-level methods are reachable from a page-only scope without going through `connection.withContext(...)`.

## Multi-page inside a context

`context.withPage(fn)` opens a new page in the **same** context — it shares cookies, storage, and emulation with the default page. Use this for multi-page workflows where pages need the same site state (e.g., open a tab that's already logged in from the default page's login flow):

```typescript
import { Effect } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  return yield* playwright.withConnection({ url: "ws://localhost:9222" }, ({ context, page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com/login");
      yield* page.fill("#email", "user@example.com");
      yield* page.click("button.login");

      // Open another tab in the same context — same login state
      yield* context.withPage((page2) =>
        Effect.gen(function* () {
          yield* page2.goto("https://example.com/dashboard");
        }),
      );
    }),
  );
});
```

For **isolated** tabs (no shared cookies / storage), use `connection.withContext(...)` instead.

`context.withPage` mirrors `connection.withPage` and `playwright.withPage` exactly — same callback signature, same cleanup semantics. You can refactor between the three without touching the callback body.

## Storage state

`context.storageState()` snapshots cookies and per-origin `localStorage` to JSON. The Playwright wrapper does **not** expose `addStorageState` (it doesn't exist on upstream `BrowserContext` either). To restore:

- Call `context.addCookies(loaded.cookies)` for the cookie half.
- For each origin in `loaded.origins`, navigate to the origin first, then `page.evaluate(([n, v]) => window.localStorage.setItem(n, v), [name, value])` for each entry.

`sessionStorage` is intentionally not included in the snapshot (matches upstream Playwright — it's per-tab and not persistable).

## Timeouts

`context.setDefaultTimeout(ms)` and `context.setDefaultNavigationTimeout(ms)` apply to every page in the context. They are synchronous setters (matching upstream Playwright's signature). The wrapper does not provide a "clear" form — call again with the original default (30s / no timeout for navigation) to reset.

## See also

- [`@effect-libs/browser-playwright`](./index.md) — the package landing page
- [Playwright — Added APIs](./added-apis.md) — `page.fetch` / `page.httpClient` and lazy page-level getters
- [Playwright — Errors](./errors.md) — typed error hierarchy used by every method on this handle
- [Managing Resources](../../concepts/resources.md) — `withContext` vs `withPage` decision tree
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-playwright/src) — full API in JSDoc
