# browser-playwright — Added APIs

The `@effect-libs/browser-playwright` module adds three categories of API on top of the
upstream `Page` API:

1. **HTTP helpers** — `page.fetch(url, options?)` and `page.httpClient`
   for browser-context requests (cookies, CORS, page-state).
2. **Lazy page-level getters** — `page.context()`, `page.workers()`, and
   the input-device namespaces (`page.keyboard`, `page.mouse`,
   `page.touchscreen`). These are cached on first access and reused for
   the lifetime of the `PlaywrightPage`.
3. **Synchronous setters** — `page.setDefaultTimeout(ms)` and
   `page.setDefaultNavigationTimeout(ms)`. These are void-returning
   pass-throughs to the upstream `Page` setters.

The HTTP helpers (`fetch`, `httpClient`) are non-upstream — they don't
exist on `@cloudflare/playwright`'s `Page`. The other categories are
upstream methods that the wrapper exposes directly (lazy / cached for
DX, rather than re-implemented).

## `page.fetch`

`page.fetch(url, options?)` runs an HTTP request through the browser's
`fetch()` API — so it inherits the page's cookies, session storage, and
CORS state. Useful when an external HTTP API must be called with the
browser's auth (e.g. a `/api/me` call after a login flow).

```typescript
import { Effect } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  return yield* playwright.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com/login");
      yield* page.fill("#email", "user@example.com");
      yield* page.click("button.login");

      // Call /api/me with the page's cookies attached
      const response = yield* page.fetch("/api/me");
      class JsonParseError extends Error {
        readonly _tag = "JsonParseError";
      }
      const body = yield* Effect.try({
        try: () => JSON.parse(response.body) as unknown,
        catch: (e) => new JsonParseError(`failed to parse /api/me response: ${String(e)}`),
      });
      return body;
    }),
  );
});
```

### `FetchOptions`

| Field     | Type                             | Default        | Notes                                                                                                                                                    |
| --------- | -------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `method`  | `string`                         | `"GET"`        | HTTP method.                                                                                                                                             |
| `headers` | `Record<string, string>`         | `{}`           | Request headers.                                                                                                                                         |
| `body`    | `string \| Uint8Array \| object` | `undefined`    | Body shape — `string` is sent as text, `Uint8Array` is sent as bytes (no `TextDecoder` round-trip), `object` is `JSON.stringify`'d at the host boundary. |
| `timeout` | `DurationInput`                  | `"30 seconds"` | Request timeout.                                                                                                                                         |

### `FetchResponse`

```typescript
interface FetchResponse {
  readonly status: number; // HTTP status code
  readonly ok: boolean; // true if status is 2xx
  readonly headers: Record<string, string>; // response headers (lowercased keys)
  readonly body: string; // response body (always text — for binary use page.evaluate(fetch(...).then(r => r.arrayBuffer())))
}
```

The response `body` is always a `string`. For binary responses, dispatch
to `page.evaluate(async () => (await fetch(url)).arrayBuffer())` and
inspect the resulting `ArrayBuffer` directly.

### Errors

`page.fetch` fails with `PlaywrightError` (a `OperationError` reason) on:

- Network errors (DNS, connection refused, CORS).
- Timeouts (the request exceeded `options.timeout`).
- Browser-side evaluation failures (the `fetch()` call couldn't be dispatched).

See [Playwright — Errors](./errors.md) for the full hierarchy.

### Body handling notes

The body normalization happens at the host-module boundary
(`packages/browser-playwright/src/internal/PlaywrightFetch.ts`), not in the browser-side
`fetch()`. This keeps the browser-side code minimal — it only handles
`string | Uint8Array<ArrayBuffer>`, both of which are valid `BodyInit`
values.

- `string` → passed through unchanged (UTF-8 text).
- `Uint8Array` → passed through as raw bytes. The wrapper does **not**
  decode via `TextDecoder` (which would corrupt binary data).
- `object` → `JSON.stringify`'d before evaluation. The browser-side
  code receives a `string`.
- `undefined` / `null` → no body.

## `page.httpClient`

`page.httpClient` is the Effect-native equivalent of `page.fetch`. It
returns a `HttpClient.HttpClient` (from `effect/unstable/http`) that
uses the browser's `fetch()` internally. This means you can compose it
with the rest of the Effect HTTP toolkit — `filterStatusOk`,
`retryTransient`, `schemaBodyJson`, middleware, etc.

```typescript
import { Effect, Schedule } from "effect";
import { Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { Playwright } from "@effect-libs/browser-playwright";

const UserSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
});

const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  return yield* playwright.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      // Build a typed, retry-aware HTTP client with browser cookies
      const client = page.httpClient.pipe(
        HttpClient.filterStatusOk,
        HttpClient.retryTransient({ schedule: Schedule.exponential("100 millis"), times: 3 }),
      );

      // Use it like any HttpClient — schema validation, body decoding, etc.
      const user = yield* client
        .get("/api/me")
        .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(UserSchema)));

      return user;
    }),
  );
});
```

`page.httpClient` is built once per `page` (it's a property, not a
method). The returned `HttpClient.HttpClient` is a value, not an
Effect — you can pass it around, store it in a Layer, or compose it with
other clients.

> **Note:** `page.httpClient` uses the browser's `fetch()` under the
> hood, just like `page.fetch`. The difference is the API surface —
> `httpClient` returns Effect's typed `HttpClient`, while `fetch` returns
> a hand-rolled `FetchResponse`. Prefer `httpClient` for new code; reach
> for `fetch` when you need the raw response shape or have a non-Effect
> consumer.

## Page-level accessors

`page.context()` is a method accessor whose wrapper is cached after
the first call. `page.workers()` is a method accessor that re-fetches
the upstream worker list on each call. The 3 input-device namespaces
(`page.keyboard`, `page.mouse`, `page.touchscreen`) are cached
handles built once at `makePage` time.

| Accessor           | Returns                           | Lifetime                                                                                                   |
| ------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `page.context()`   | `PlaywrightBrowserContext`        | Cached — same wrapper for the lifetime of the `PlaywrightPage`. The underlying `BrowserContext` is stable. |
| `page.workers()`   | `ReadonlyArray<PlaywrightWorker>` | Re-fetched on every call. The underlying `Worker` list is fetched fresh.                                   |
| `page.keyboard`    | `PlaywrightKeyboard`              | Cached — same handle for the lifetime of the `PlaywrightPage`.                                             |
| `page.mouse`       | `PlaywrightMouse`                 | Cached — same handle for the lifetime of the `PlaywrightPage`.                                             |
| `page.touchscreen` | `PlaywrightTouchscreen`           | Cached — same handle for the lifetime of the `PlaywrightPage`.                                             |

The input-device namespaces and `context()` are cached because their
underlying handles are stable for the page's lifetime, so caching
avoids per-call allocation without changing semantics. `workers()`
is re-fetched because the upstream worker list is dynamic — caching
it would require subscribing to worker lifecycle events
(`page.on('worker')` / `page.on('workerGone')`) to invalidate the
cache, which is a larger change. Callers that poll `workers()` in a
hot path should hoist the result to a local.

### `page.context()`

`page.context()` returns the same shape as `connection.withContext(...)`'s
context handle — the full `PlaywrightBrowserContext` method set. The
standalone factory and the handle returned from `withContext` share an
identical method set
(cookies, storageState, setGeolocation, grantPermissions, setOffline,
setDefaultTimeout, etc.). See
[Playwright — Context API](./context.md) for the full
method list.

```typescript
import { Effect } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  return yield* playwright.withPage({ url: "ws://localhost:9222" }, (page) =>
    Effect.gen(function* () {
      // Reach the context handle from a page-only scope
      const context = page.context();
      yield* context.grantPermissions(["geolocation"]);
      yield* page.goto("https://example.com");
    }),
  );
});
```

### `page.workers()`

`page.workers()` returns a `ReadonlyArray<PlaywrightWorker>` — service
workers and shared workers for this page. For most pages, this is an
empty array.

### `page.keyboard` / `page.mouse` / `page.touchscreen`

The input-device namespaces. See [Input](./input.md) for the
full method list, the `AbortSignal` caveat, and example workflows.

## Synchronous setters

Two methods are void-returning pass-throughs to the upstream `Page`
setters:

| Method                                      | Returns | Notes                                                            |
| ------------------------------------------- | ------- | ---------------------------------------------------------------- |
| `page.setDefaultTimeout(timeout)`           | `void`  | Default timeout (ms) for every page operation. Matches upstream. |
| `page.setDefaultNavigationTimeout(timeout)` | `void`  | Default timeout (ms) for every navigation. Matches upstream.     |

These are synchronous (the upstream `Page.setDefaultTimeout(...)` /
`Page.setDefaultNavigationTimeout(...)` don't return Promises). They
mirror the same methods on `PlaywrightBrowserContext` (see
[Context API](./context.md#timeouts)) — calling either is
equivalent.

## See also

- [`@effect-libs/browser-playwright` module](./index.md) — the module landing page
- [Playwright — Context API](./context.md) — `page.context()`
  returns the same handle
- [Playwright — Input](./input.md) — the input-device
  namespaces
- [Playwright — Errors](./errors.md) — for the typed error
  hierarchy used by `page.fetch`
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-playwright/src) — full API in JSDoc
