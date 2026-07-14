# `browser-cdp` — Feature Parity with Upstream Playwright

> What `browser-cdp` (`@effect-libs/browser-cdp`) does differently from upstream Playwright.
> For a side-by-side with other Chrome DevTools Protocol clients, see [browser-cdp — Comparison & Alternatives](../packages/cdp/comparison.md).
>
> **Terminology.** Throughout this page, `Playwright` (PascalCase) means the upstream Microsoft library, `browser-cdp` is our package, and "Chrome DevTools Protocol" is the wire protocol. See [`CONTEXT.md`](../../CONTEXT.md#referencing-packages-in-user-facing-copy) for the canonical vocabulary.

## Summary

`browser-cdp` is a Playwright-compatible browser-automation package built directly on the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) — no upstream Playwright runtime, no `nodejs_compat`, native WebSocket only. It exposes roughly the same `Page` / `Locator` / `Frame` / `BrowserContext` shape as upstream Playwright, so most Playwright code translates 1:1.

Three deliberate deviations:

1. **Effect-idiomatic shapes** — Promises become `Effect<T, E>`, callbacks become `Stream<T>`, maybes become `Option<T>`.
2. **Scraping-focused surface** — Test-only APIs (`ElementHandle`, video, trace, HAR replay, `pause`, ...) are omitted.
3. **Browser-automation additions** — New APIs not in upstream Playwright (`page.fetch`, `page.httpClient`, `page.localStorage()`, `context.addStorageState`, ...).

The rest of this page covers each. For per-method documentation, see the [per-module docs](#method-level-coverage). For deep design rationale, see the [ADR directory](../contributing/cdp/decisions/).

## Effect-idiomatic shapes

These shape changes apply across the entire API surface, not just one method. See [ADR-0003](../contributing/cdp/decisions/0003-effect-idiomatic-api-surface.md) for the rationale.

| Pattern           | Upstream Playwright      | `browser-cdp`                                           | Notes                                      |
| ----------------- | ------------------------ | ------------------------------------------------------- | ------------------------------------------ |
| Sync getter       | `page.url()`             | `yield* page.url`                                       | `—`                                        |
| `Promise<T>` read | `await page.title()`     | `yield* page.title`                                     | `—`                                        |
| Maybe             | `Promise<T \| null>`     | `Effect<Option<T>, E>` (e.g. `page.getAttribute`)       | Shape change — `null` → `Option<T>`        |
| Callback event    | `page.on('console', cb)` | `page.onConsole: Effect<Stream<T>, never, Scope.Scope>` | Shape change — callback → `Stream<T>`      |
| Single-error type | `try/catch` with strings | `Effect.catchTag` against the `CdpError` union          | Shape change — strings → tagged `CdpError` |

`—` means same shape, just effect-wrapped (Promise → Effect, sync getter → Effect-property). `Shape change` means the type's structure differs from upstream Playwright.

### Why

- **Composable.** Streams compose with `Stream.map` / `Stream.filter` / `Stream.take(N)`. Effects compose with `Effect.gen` / `Effect.scoped` / `Effect.race` / `Effect.timeout`.
- **Explicit lifetimes.** Stream subscriptions are scoped — no manual `removeListener`.
- **Typed errors.** A single tagged-error union (`CdpError`) carries the cause. Match with `Effect.catchTag` instead of string-sniffing. See [browser-cdp — Errors](../packages/cdp/errors.md).
- **Lazy / cancellable.** Effects only run when the program runs; cancellation propagates through the whole graph.

### Not-found reads

`Promise<T | null>` is replaced with `Effect<Option<T>, E>`. The `null` ambiguity is gone — the type forces you to handle the missing case.

## Page vs. Context bridging

`browser-cdp` mirrors some upstream Playwright `BrowserContext` APIs on `Page` too — for single-page scraping ergonomics. **Caveat:** only the APIs that genuinely operate per-session have both forms. Operations that set context-wide browser state keep their `Page` form out of `browser-cdp` because a `page1.setUserAgent(...)` call would silently affect every other page in the same context. The `page.X` name doesn't suggest that. `browser-cdp` deliberately keeps these context-only so the cross-page side effect has to be written out explicitly. From a page, get the handle and call through:

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
const ctx = yield* page.context; // Effect<CdpContextHandle, CdpError>
yield* ctx.setUserAgent("custom-ua");
```

The page form would be a footgun: the name promises per-page semantics, the implementation walks the context.

The five upstream Playwright Page APIs that don't have a `page.X` form in `browser-cdp`:

| Upstream Playwright API               | `browser-cdp` equivalent                                         |
| ------------------------------------- | ---------------------------------------------------------------- |
| `page.setOffline(offline)`            | `context.setOffline(offline): Effect<void, CdpError>`            |
| `page.setGeolocation(geo?)`           | `context.setGeolocation(geo?): Effect<void, CdpError>`           |
| `page.setUserAgent(ua, opts?)`        | `context.setUserAgent(ua, opts?): Effect<void, CdpError>`        |
| `page.grantPermissions(perms, opts?)` | `context.grantPermissions(perms, opts?): Effect<void, CdpError>` |
| `page.clearPermissions()`             | `context.clearPermissions(): Effect<void, CdpError>`             |

`page.setHTTPCredentials` is the reverse case — asymmetric placement (`browser-cdp` exposes on `Page`, not `Context`; upstream Playwright places it on `BrowserContext`). See [Network](../packages/cdp/network.md).

## Scraping vs testing scope

`browser-cdp` is scraping-focused, not testing-focused. The omissions aren't gaps — they're intentional exclusions of test-only upstream Playwright APIs.

| What is omitted                     | Category               | Why                                         |
| ----------------------------------- | ---------------------- | ------------------------------------------- |
| `ElementHandle`                     | locator-only design    | `browser-cdp` uses `CdpLocator` exclusively |
| Video / trace / HAR replay / popup  | testing-only artifacts | Test-recording                              |
| `requestGC`                         | testing-only           | Memory-tuning for long-running tests        |
| `pause`                             | testing-only           | Interactive debugger                        |
| `ariaSnapshot`, `highlight`         | testing-only           | Test-debug overlays                         |
| `serviceWorkers`, `backgroundPages` | testing-only           | Service-worker / background-page inspection |

See [ADR-0001](../contributing/cdp/decisions/0001-scraping-vs-testing-scope.md) for the full list and rationale.

## Browser-automation additions

`browser-cdp` adds APIs that don't exist in upstream Playwright.

| `browser-cdp` addition                                                                                        | Where                                                                      | Why it's new                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `page.fetch(url, options?)` — browser-side `fetch()` with page cookies                                        | [Network → HTTP helpers](../packages/cdp/network.md#pagefetch--pagehttpclient--pagerequest) | Runs in-browser (so CORS, service workers, page-level fetch overrides all apply). Distinct from `page.request`: `page.fetch` runs in the browser; `page.request` runs server-side via the Chrome DevTools Protocol `Fetch` domain and bypasses CORS.                                                                                                                                                                                                   |
| `page.httpClient` — Effect `HttpClient` over browser-side `fetch()`                                           | [Network → HTTP helpers](../packages/cdp/network.md#pagefetch--pagehttpclient--pagerequest) | Effect-native HTTP client at the page level. Wraps `page.fetch` so it composes with `HttpClient.filterStatusOk`, `retryTransient`, `schemaBodyJson`, etc.                                                                                                                                                                                                                                                                                              |
| `page.localStorage()`, `sessionStorage()` — read as `Map`                                                     | [Context](../packages/cdp/context.md)                                      | Upstream Playwright doesn't expose localStorage / sessionStorage as a Map getter on `Page`. `browser-cdp` returns a typed `Map<string, string>`.                                                                                                                                                                                                                                                                                                       |
| `page.setLocalStorageItem`, `setSessionStorageItem`, `clearLocalStorage`, `clearSessionStorage`               | [Context](../packages/cdp/context.md)                                      | Effect-friendly single-key / single-store mutators; upstream Playwright has no equivalent direct mutators.                                                                                                                                                                                                                                                                                                                                             |
| `context.addStorageState(state)` — restore from a `storageState` snapshot                                     | [Context](../packages/cdp/context.md)                                      | Upstream Playwright has `browserContext.storageState()` to read, but no inverse to restore.                                                                                                                                                                                                                                                                                                                                                            |
| `context.withPage(fn)` — open another page in the same isolated context; auto-closes on scope end             | [Context](../packages/cdp/context.md)                                      | Upstream Playwright has `browserContext.newPage()` (manually-managed Page), but not the scoped `withPage` ergonomic that guarantees cleanup on callback return.                                                                                                                                                                                                                                                                                        |
| `page.use((cdp, sessionId) => ...)` — raw Chrome DevTools Protocol escape hatch                               | [browser-cdp — Index](../packages/cdp/index.md)                            | Replaces upstream Playwright's `newCDPSession(page)` callback with an Effect-friendly closure that gives raw Chrome DevTools Protocol access without juggling session lifecycles.                                                                                                                                                                                                                                                                      |
| Direct selector actions on `Frame` — `frame.click(sel)`, `frame.fill(sel, …)`, `frame.textContent(sel)`, etc. | [Frames](../packages/cdp/frames.md)                                        | Upstream Playwright's shape is `frame.locator(sel).<m>()`. The direct form is a `browser-cdp` ergonomic that omits the `.locator(sel)` step. **Caveat:** the direct form dispatches synthetic DOM events in the iframe's main world (`event.isTrusted === false`) — some sites reject untrusted events. If you need trusted events, use `frame.locator(sel).<m>()`. See [ADR-0002](../contributing/cdp/decisions/0002-single-process-architecture.md). |

## Architectural differences from upstream Playwright

These are consequences of the implementation choice to bypass upstream Playwright and use the Chrome DevTools Protocol directly — not deviations for ergonomics.

- **Chrome DevTools Protocol only** — no Firefox (Juggler) or Safari / WebKit (WebKit Inspector). The Chrome DevTools Protocol is implemented by all Chromium-based browsers (Chrome, Edge, Brave, Opera, etc.), but Firefox and WebKit each use their own debugging protocol.
- **Single-process** — multi-iframe chaining is limited; use `browser-playwright` for that.
- **No browser object** — `browser-cdp` is connection-scoped, not browser-scoped.

See [ADR-0002](../contributing/cdp/decisions/0002-single-process-architecture.md) for the architecture rationale.

## Runtime / browser coverage

For runtime and browser support, see [Runtime & Browser Support](./runtime-and-browser-support.md). For the `browser-cdp` vs upstream Playwright comparison (browser coverage, API surface), see [browser-cdp — Comparison & Alternatives → vs playwright (original)](../packages/cdp/comparison.md#vs-playwright-original).

## Method-level coverage

Per-method signatures, options, and behavior live in the [per-module docs](../packages/cdp/index.md):

- [browser-cdp — Index](../packages/cdp/index.md) — module overview, install, quickstart
- [browser-cdp — Locators](../packages/cdp/locators.md) — full Locator API
- [browser-cdp — Frames](../packages/cdp/frames.md) — full Frame and FrameLocator API
- [browser-cdp — Context](../packages/cdp/context.md) — full Context API and page-level mirrors
- [browser-cdp — Network](../packages/cdp/network.md) — `route`, `fetch`, `httpClient`, `request`
- [browser-cdp — Streams](../packages/cdp/streams.md) — full Events API
- [browser-cdp — Evaluate](../packages/cdp/evaluate.md) — evaluate pipeline and no-imports payload constraint
- [browser-cdp — Handles](../packages/cdp/handles.md) — `CdpHandle` discriminated union reference
- [browser-cdp — Errors](../packages/cdp/errors.md) — error taxonomy and matching patterns

## See also

- [Choosing a client →](../concepts/client-and-provider.md#choosing-a-client) — when to pick `browser-cdp` vs `browser-playwright`
- [browser-cdp — Comparison & Alternatives](../packages/cdp/comparison.md) — vs raw Chrome DevTools Protocol clients and `@effect-libs/browser-playwright`
- [ADR directory](../contributing/cdp/decisions/) — design decisions behind these patterns
- [ADR-0001: Scraping-vs-testing scope](../contributing/cdp/decisions/0001-scraping-vs-testing-scope.md) — the `🚫` philosophy
- [ADR-0002: Single-process architecture](../contributing/cdp/decisions/0002-single-process-architecture.md) — frame chains, selector vocabulary
- [ADR-0003: Effect-idiomatic API surface](../contributing/cdp/decisions/0003-effect-idiomatic-api-surface.md) — properties as Effects, events as Streams
- [ADR-0004: `Runtime.callFunctionOn` migration](../contributing/cdp/decisions/0004-callFunctionOn-migration.md) — evaluate pipeline architecture
- [ADR-0005: Tagged-error guard pattern](../contributing/cdp/decisions/0005-tagged-error-guard-pattern.md) — error discrimination
- [Upstream integration test coverage](../contributing/cdp/upstream-integration-test-coverage.md) — methodology for behavioral test coverage
- [Upstream integration test snapshot](../contributing/cdp/upstream-integration-test-snapshot.md) — live coverage numbers (auto-generated)
