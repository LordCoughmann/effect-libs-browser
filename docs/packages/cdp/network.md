# browser-cdp — Network

`@effect-libs/browser-cdp`'s network layer has three distinct surfaces:

1. **Interception** — `route`, `unroute`, `routeWebSocket` for blocking,
   rewriting, and mocking requests and WebSocket frames.
2. **Custom requests** — `page.fetch`, `page.httpClient`, `page.request`
   for sending requests through the page context (inheriting cookies
   and storage).
3. **Observation** — `onRequest`, `onResponse`, `onRequestFailed` event
   streams (see [browser-cdp — Event Streams](./streams.md)).

This page covers (1) and (2). Observation is its own document because
it's a different conceptual surface — you watch, you don't intercept.

## `route()` — HTTP request interception

`route(url, handler)` registers a handler that fires for every matching
request. The handler can:

- `route.continue()` — let the request proceed unchanged
- `route.continue({ overrides })` — let it proceed with header / method / URL / body overrides
- `route.abort()` — block the request (`net::ERR_FAILED`)
- `route.fulfill({ response })` — return a synthetic response without hitting the network
- `route.fallback()` — skip this handler and try the next match (or let the request through)

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      // Block all third-party trackers
      yield* page.route(/google-analytics\.com/, (route) => route.abort("blockedbyclient"));

      // Mock an API endpoint with a synthetic response
      yield* page.route("**/api/users", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ users: [{ id: 1, name: "Alice" }] }),
        }),
      );

      // Rewrite headers on every request (request is the second arg)
      yield* page.route("**/*", (route, request) =>
        route.continue({
          headers: { ...request.headers, "x-test": "true" },
        }),
      );

      yield* page.goto("https://example.com");
    }),
  );
});
```

### `unroute()` and `unrouteAll()`

Remove routes registered with `route()`. The handler-matching order is
last-registered-first (upstream Playwright semantics): later routes shadow earlier
ones for the same URL pattern.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import { Effect } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  Effect.gen(function* () {
    // Remove a specific handler
    yield* page.unroute("**/api/users");

    // Or remove everything
    yield* page.unrouteAll();
  });
```

## `routeWebSocket()` — WebSocket interception

For WebSocket connections opened by the page. The route handler receives
a `CdpWebSocketRoute` with `connectToServer()`, `send()`, `close()`, and
event handlers for messages flowing in either direction.

This is one of `@effect-libs/browser-cdp`'s most distinctive features — upstream Playwright
has it, but it's rarely used in automation; `@effect-libs/browser-cdp` has full
support for it.

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.routeWebSocket("wss://example.com/ws", (ws) =>
        Effect.gen(function* () {
          // Connect to the real server; messages auto-forward both ways
          // unless you set a handler on that direction.
          const server = ws.connectToServer();

          // Hook messages from the page; intercept / mutate as needed.
          // onPageMessage is a setter (returns void), not an Effect.
          ws.onPageMessage((message) => {
            console.log("page → server:", message);
          });

          // Hook messages from the server
          ws.onServerMessage((message) => {
            console.log("server → page:", message);
          });

          // Send a synthetic message from the "server"
          yield* server.send("hello from the test");
        }),
      );

      yield* page.goto("https://example.com/ws-app");
    }),
  );
});
```

After `connectToServer()` is called, both directions are auto-forwarded
**unless** you set a handler on that side. This mirrors upstream Playwright's
semantics. The handler can also call `ws.close({ code, reason })` to
terminate the page-side socket.

## `page.fetch` / `page.httpClient` / `page.request`

`@effect-libs/browser-cdp` exposes three ways to send a request, with two
different transport backends:

| Name                        | Type                              | Backend                                                                                                     | Notes                                                                                           |
| --------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `page.fetch(url, options?)` | `Effect<FetchResponse, CdpError>` | Browser-side `fetch()` via `page.evaluate` (CORS-restricted, inherits page cookies)                         | Lowest-level; returns a schema-validated response.                                              |
| `page.httpClient`           | `HttpClient.HttpClient`           | Browser-side `fetch()` via `page.evaluate` (same backend as `page.fetch`)                                   | Effect-native HTTP client; composes with `filterStatusOk`, `retryTransient`, etc.               |
| `page.request`              | `HttpClient.HttpClient`           | Server-side Chrome DevTools Protocol-driven `Fetch.enable` + `Fetch.continueRequest` (no CORS, server-side) | Distinct from `httpClient`. Use for authenticated API calls that would hit CORS in the browser. |

`page.fetch` and `page.httpClient` run the actual `fetch()` **in the
browser** — so cookies, redirects, CORS, service workers, and any
in-page middleware all apply. The result is serialised back to the
worker via `page.evaluate`.

`page.request` runs the request **server-side** via the Chrome DevTools Protocol `Fetch`
domain: `Fetch.enable` intercepts the request, the wrapper reads
cookies from the browser session and forwards them in a synthetic
`Fetch.continueRequest`, then captures the response via
`Fetch.responseReceived`. This is the same trick the upstream Playwright
`APIRequestContext` uses — server-side, no CORS, but no in-page
middleware (service workers, page-level fetch overrides) either.

```typescript
import { Duration, Effect, Stream } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  Effect.gen(function* () {
    const stream = yield* page.onRequestFailed;
    const failure = yield* stream.pipe(
      Stream.filter((r) => r.url.includes("/api/data")),
      Stream.take(1),
      Stream.runHead,
      Effect.timeout(Duration.seconds(5)),
      Effect.catchTag("TimeoutError", () => Effect.succeed(null)),
    );
  });
```

### When to use which

- **`page.fetch`** — simplest; you know exactly what URL you want and
  don't need composability.
- **`page.httpClient`** — you want to use Effect's `HttpClient` machinery
  (filtering, retrying, composing with other clients) AND the request
  must go through the browser (e.g. it depends on a session cookie
  that isn't `HttpOnly`).
- **`page.request`** — you need to call an API that would hit CORS
  in the browser, or you want the speed of a server-side request.
  Cookies are still attached (via the Chrome DevTools Protocol), but service workers and
  in-page fetch overrides do not run.
- **Stream the body** — both `page.fetch` and the `HttpClient` variants
  return `Uint8Array` for binary, or you can decode JSON directly.

### Errors

If the page-side `fetch()` rejects (e.g. CORS, DNS failure, server
returned 500), the result is a `CdpError` with reason `FetchError`,
including the URL and (when available) the status code. The error is
**retryable** (`isRetryable: true`) — transient network failures are
appropriate to retry.

## Header overrides

Two paths for setting extra headers:

- **Page-level** — `page.setExtraHTTPHeaders(headers)`. Applies to every
  request on this page only.
- **Context-level** — `context.setExtraHTTPHeaders(headers)`. Applies to
  every page in the context.

Both override the page's existing headers but do not remove them —
headers you don't list are unchanged.

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      // setExtraHTTPHeaders is on the page — applies to every request on this page.
      // For context-wide headers, the page-level call covers all pages opened
      // from the same connection default page; use `@effect-libs/browser-playwright` for
      // per-context header overrides (see its docs).
      yield* page.setExtraHTTPHeaders({
        "x-tenant-id": "acme-corp",
        "accept-language": "en-US",
      });
      yield* page.goto("https://example.com");
    }),
  );
});
```

## `exposeFunction` / `exposeBinding`

Make Node-side functions callable from the page. The browser-side args
are serialised through the same `__serialize` codec used by
`page.evaluate`; the Node-side callback can return a value or a Promise
or an Effect; thrown errors propagate to the page as a rejected Promise.

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      // Simple function — args serialised, return value serialised.
      yield* page.exposeFunction("hashPassword", (input: string) => btoa(input));

      // With a BindingSource — receives (source, ...args) where source
      // exposes frame, page, and context for the calling origin. The
      // callback signature is generic over Args, with `unknown` as the
      // first (source) arg by default.
      yield* page.exposeBinding<[string]>("getUserId", (source, key) =>
        key === "alice" ? "user-1" : "user-2",
      );

      yield* page.goto("https://example.com/login");
      // The page can now call window.hashPassword("...") and get back a string.
    }),
  );
});
```

`exposeBinding` has a `{ handle: true }` option that delivers the first
page-side argument un-serialised (use when you need to pass a complex
object back without round-trip serialisation).

## `addInitScript` / `addScriptTag` / `addStyleTag`

Inject code into the page:

| Method                                | Runs                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `page.addInitScript(script)`          | On every new document (before any user scripts). Mirrors upstream Playwright's `Page.addInitScript`. |
| `page.addScriptTag({ url, content })` | One-shot, after the current document loads.                                                          |
| `page.addStyleTag({ url, content })`  | One-shot, adds a `<style>` to the current document.                                                  |

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      // Set a global flag before any page script runs
      yield* page.addInitScript(() => {
        (globalThis as any).__test = true;
      });

      // Inject a script from a URL
      yield* page.addScriptTag({ url: "https://cdn.example.com/lib.js" });

      // Add inline CSS
      yield* page.addStyleTag({ content: "body { background: red; }" });
    }),
  );
});
```

## See also

- [browser-cdp — Event Streams](./streams.md) — for `onRequest`, `onResponse`,
  `onRequestFailed` (observation)
- [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) — `browser-cdp`'s deviations
  from upstream Playwright
- [Managing Resources](../../concepts/resources.md) — context vs
  page-level header overrides
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src) — full API in JSDoc
