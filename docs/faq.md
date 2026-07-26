# Frequently Asked Questions

Questions about **using this library** — the client/provider architecture,
Effect patterns specific to browser automation, runtime setup, and
lifecycle. For upstream Playwright API questions (selectors, screenshots,
clicks, network interception), see
[playwright.dev/docs/api](https://playwright.dev/docs/api) — the wrapper
passes them through unchanged.

Each entry is short and links to the deep doc for the full story.

## Setup

### Does this work on Cloudflare Workers? Node? Bun? Deno?

All of them. The same `program` runs on Workers (with `nodejs_compat` for
`browser-playwright` and `browser-stagehand`), Node, Bun, Deno, and workerd
(via `wrangler dev`). The Client & Provider composition is identical on
every runtime. See
[Runtime & Browser Support](./reference/runtime-and-browser-support.md)
for the full matrix.

### Why do I need `nodejs_compat` on Workers?

`browser-playwright` and `browser-stagehand` import Node.js-builtin modules
(`node:async_hooks`, `node:crypto`, partial `node:fs`) that Workers doesn't
ship by default. The `nodejs_compat` compat flag polyfills them.
`browser-cdp` is the only client that doesn't need it. See
[Cloudflare Workers Guide — the `nodejs_compat` flag](./guides/cloudflare-workers.md)
for the full setup.

### How do I set up Cloudflare Browser Run?

Two `BrowserProvider` implementations — the HTTP implementation works
everywhere, the binding implementation is Cloudflare Workers-only and skips
the HTTP roundtrip. See [Browser Run provider](./providers/cf-browser-run.md)
for both, including the `wrangler.jsonc` snippets.

### How do I run this locally without a managed provider?

Pass a `ws://` URL to `withConnection` — local Chrome launched with
`--remote-debugging-port=9222`, a Docker container, anything that speaks
Chrome DevTools Protocol. No provider layer required. See
[Cookbook — Connect to an existing session](./cookbook/managing-sessions.md#connect-to-an-existing-session)
for the recipe.

### Do I need to learn Effect to use this?

You need the basics: `Effect.gen` replaces `async`/`await`, `yield*`
replaces `await`, `Effect.runPromise(program)` is your entry point. The
library does the Effect work (scoped cleanup, typed errors, retries,
timeouts); you get the benefits without writing the patterns yourself.
See [Concepts — Effect](./concepts/effect.md) for the onramp.

For the patched `@cloudflare/playwright` without Effect, install
[`@effect-libs/cloudflare-playwright`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/cloudflare-playwright) directly.

## Architecture

### What's the difference between a client and a provider?

A **client** (`browser-playwright`, `browser-cdp`, `browser-stagehand`) is
the API surface — the Effect service you call. A **provider**
(`SteelProvider`, `BrowserbaseProvider`, `CfBrowserRunProvider`, or a
raw Chrome DevTools Protocol URL) is where the browser runs. Swap either
and the program doesn't change. See
[Overview — How they compose](./overview.md#how-they-compose) and
[Choosing a client / Choosing a provider](./overview.md#choosing-a-client)
for the picker tables.

### What's the difference between Session, Connection, Context, and Page?

The four-level hierarchy of the library's resource model. **Session** is a
provider-managed browser instance (opened by `withSession`). **Connection**
is the Chrome DevTools Protocol WebSocket to it. **Context** is an
isolated cookie/storage scope (created by `connection.withContext`).
**Page** is a tab within a context. The `withSession` callback receives
all four; `withConnection` skips the Session level. See
[Managing Resources](./concepts/resources.md) for the full model and
the diagram.

### `withSession` vs `withConnection` — when to use which?

`withSession({ provider }, fn)` opens a session on a managed provider, runs
your code, and closes the session on exit (including on errors, timeouts,
and request cancellation). The default — use it for 90% of scraping.

`withConnection({ url }, fn)` connects to an already-running browser via
Chrome DevTools Protocol WebSocket — no provider needed. Use it for local
Chrome, a browser you operate yourself, or reusing a session created
elsewhere. See
[Managing Resources — Entry points](./concepts/resources.md#entry-points)
for the full matrix.

### `withX` vs `acquireX` — when to use which?

`withX(source, fn)` scopes the resource to the callback — closed when the
callback returns. The default; used 90% of the time.

`acquireX(source)` returns a resource you own. You manage the scope
yourself. Use it only when the resource needs to outlive a single
callback — pool sessions across requests, fan out pages, run in a Durable
Object. See
[Managing Resources — Owned scopes](./concepts/resources.md#owned-scopes-when-withx-isnt-enough)
for the patterns.

### `browser-cdp` vs `browser-playwright` — which one?

`browser-playwright` is the default — full upstream Playwright API on
edge runtimes. `browser-cdp` is the only one that doesn't need
`nodejs_compat`, at the cost of API surface (no upstream Playwright
ergonomics — no locators, no `page.fetch`, etc.). See
[Choosing a client](./overview.md#choosing-a-client) and
[`browser-cdp` — Feature Parity](./reference/cdp-feature-parity.md) for
the full trade-off.

## Effect patterns

### What does `Effect.timeout` do to a session?

`Effect.timeout` cancels the parent fiber, and the library cleans up the
session on cancellation — that's the point. If you want a longer-running
operation, increase the timeout, or use `acquireSession` (owned scope)
instead of `withSession` (callback scope). See
[Cookbook — Retries and timeouts](./cookbook/retries-and-timeouts.md)
for the patterns.

### How do I run multiple sessions in parallel?

Each `withSession` is a separate `Effect`. `Effect.all` them with
`concurrency: N`:

<!-- verify:ignore -->

```typescript
const titles = yield* Effect.all(
  urls.map((url) =>
    Effect.gen(function* () {
      const playwright = yield* Playwright;
      const provider = yield* SteelProvider;
      return yield* playwright.withSession({ provider }, ({ page }) =>
        Effect.gen(function* () {
          yield* page.goto(url);
          return yield* page.title;
        }),
      );
    }),
  ),
  { concurrency: 5 },
);
```

See [Cookbook — Pool sessions across requests](./cookbook/managing-sessions.md#pool-sessions-across-requests)
for the recipe.

### How do I compose with the rest of my Effect program?

Browser operations are normal `Effect`s — they pipe, layer, retry, and
timeout like everything else. The example Cloudflare Worker handler is the standard
shape:

<!-- verify:ignore -->

```typescript
export default {
  async fetch(_request: Request, env: Env) {
    return Effect.runPromise(
      scrape(env).pipe(Effect.map((title) => new Response(title))),
    );
  },
} satisfies ExportedHandler;
```

Any Effect combinator works. See
[Concepts — Effect](./concepts/effect.md) for the broader pattern and
[Cookbook — Retries and timeouts](./cookbook/retries-and-timeouts.md) for
the operator-by-operator recipes.

### How do I write tests with mock providers?

Provide a different `BrowserProviderService` in tests — the program is
the same. See
[Cookbook — Managing sessions](./cookbook/managing-sessions.md) for the
pooling pattern (which is the same shape as test setup) and
[Providers — Adding a provider](./providers/adding-a-provider.md) for the
interface to implement.

## Errors

### I'm getting a `PlaywrightError` — how do I find out what failed?

Two patterns, in order of preference:

1. **`Effect.catchTag` on the parent error** — narrow on the reason's `_tag` when you want to handle multiple reasons from one handler.
2. **`Effect.catchReason` on a specific reason** — when you only care about one reason (e.g. `NavigationError`), match it directly. The handler receives the narrowed reason with its fields (`reason.url`, `reason.timeout`, etc.), and any unmatched reason re-fails with the typed error.

<!-- verify:ignore -->

```typescript
page.goto("https://slow-site.example.com").pipe(
  Effect.catchReason(
    "effect-libs/browser/PlaywrightError",
    "effect-libs/browser/PlaywrightError/NavigationError",
    (reason) => Effect.gen(function* () {
      yield* Effect.logWarning(`navigation failed: ${reason.url}`);
      return yield* retryWithLongerTimeout(reason.url);
    }),
    (e) => Effect.fail(e),
  ),
);
```

The reason class names and fields differ per client. See the per-client
reference for the full reason table and field list:

- [`browser-playwright` — Errors](./packages/playwright/errors.md) — 4 reason classes
- [`browser-cdp` — Errors](./packages/cdp/errors.md) — 14 reason classes
- [`browser-stagehand` — Errors](./packages/stagehand/errors.md) — 3 reason classes

[Concepts — Errors](./concepts/errors.md) covers the pattern in detail.

### I'm getting "Effect.layer" / "service not found" errors.

The program needs both the client layer and the provider layer at the
edge:

<!-- verify:ignore -->

```typescript
program.pipe(
  Effect.provide(
    Layer.merge(
      Playwright.layer,
      SteelProvider.layerConfig({ apiKey: Config.redacted("STEEL_API_KEY") }),
    ),
  ),
);
```

See [Getting started — Run the program](./getting-started.md#run-the-program)
for the full pattern.

### My code works locally but fails on Workers — why?

Most common causes: missing `nodejs_compat` flag, missing secret
(`STEEL_API_KEY` etc.), wrong `wrangler.jsonc` setup, or assuming Node
built-ins that Workers doesn't polyfill. See
[Cloudflare Workers Guide](./guides/cloudflare-workers.md) for the full
checklist.

## Production

### How do I pool sessions to save cost?

Use `acquireConnection` (owned scope) instead of `withConnection`
(callback scope) — the connection outlives any single callback and
multiple pages can share it. Open the session once, fan out pages from
it across many requests. See
[Cookbook — Pool sessions across requests](./cookbook/managing-sessions.md#pool-sessions-across-requests)
for the recipe.

### How do I deploy to Cloudflare Workers?

`pnpm run deploy` (or `wrangler deploy`) — the `wrangler.jsonc` setup
(including `nodejs_compat`, `browser.binding`, secrets, observability)
is documented in
[Cloudflare Workers Guide](./guides/cloudflare-workers.md).

## Migration

### I'm coming from `@cloudflare/playwright` — do I need to change my code?

Most of your code stays the same. The two changes are: lifecycle goes
from manual `try/finally` to scoped `withSession` / `withConnection`,
and the browser lives behind a provider (or a raw Chrome DevTools
Protocol URL) instead of `chromium.connectOverCDP`. See
[Migrating from Playwright](./migrations/from-playwright.md) for the
side-by-side.

### How do I create a custom provider?

Implement `BrowserProviderService`. The full template is in
[Providers — Adding a provider](./providers/adding-a-provider.md). The
provider interface is client-agnostic — works with `browser-playwright`
and `browser-cdp` identically.

### Why no Firefox or WebKit?

None of the three packages target those browsers' protocols.
`browser-playwright` and `browser-stagehand` inherit Chromium-only from
their upstream packages (`@cloudflare/playwright` and `@browserbasehq/stagehand`
v3); `browser-cdp` exposes Chrome DevTools Protocol primitives directly,
which Firefox and WebKit don't implement.

For Firefox or WebKit, use upstream
[Playwright](https://playwright.dev) on Node, Bun, or Deno.