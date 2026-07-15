# ADR-0003: Effect-Idiomatic API Surface

> `@effect-libs/browser-cdp` follows upstream Playwright's method names but chooses Effect-idiomatic signatures where Effect is strictly better. Three categories of deviation: properties as `Effect<T>`, events as `Stream<T>`, page-level helpers for context-level APIs.

**Status:** Accepted
**Date:** 2026-07-02
**Source:** Captured across phases P1–P16 and the [`cdp-feature-parity.md`](../../../reference/cdp-feature-parity.md) Effect-idiomatic shapes section.

## Context

`@effect-libs/browser-playwright` and `@effect-libs/browser-cdp` have different signatures for the same operations:

| Aspect   | `@effect-libs/browser-playwright`   | `@effect-libs/browser-cdp`                      |
| -------- | ----------------------------------- | ----------------------------------------------- |
| Property | `const url = page.url();`           | `const url = yield* page.url;`                  |
| Event    | `page.on('console', (msg) => ...);` | `Stream.runForEach(page.onConsole, msg => ...)` |
| Method   | `await page.click(sel);`            | `yield* page.click(sel);`                       |

`@effect-libs/browser-cdp` is a single-process implementation with full access to the `effect` package. Choosing Effect-idiomatic shapes (over mirroring upstream Playwright 1:1) is the value-add that distinguishes the package from `@effect-libs/browser-playwright`. Without these deviations, why ship `@effect-libs/browser-cdp` at all?

## Decision

Three categories of deviation are stable, documented, and intentional. They are not bugs, gaps, or workarounds.

### 1. Properties as `Effect<T>`

Sync getters become Effect-idiomatic properties accessed via `yield*`:

<!-- verify:ignore -->

```ts
// @effect-libs/browser-playwright (mirrors upstream Playwright)
const url: string = page.url();

// @effect-libs/browser-cdp
const url: string = yield* page.url;  // Effect<string, CdpError>
```

Affected APIs (representative — see [`docs/reference/cdp-feature-parity.md`](../../../reference/cdp-feature-parity.md#effect-idiomatic-shapes) for the full list):

- `page.url`, `page.title`, `page.content`
- `page.frames`, `page.mainFrame`
- `frame.url`, `frame.name`, `frame.page`
- `frame.childFrames`, `frame.parentFrame`

Why:

- **Lazy evaluation.** `page.url` only runs when the effect runs. The page-1 mainFrame might be stale; the effect reads it fresh.
- **Proper error handling.** Properties can fail (closed page, detached frame) — `Effect<T, CdpError>` is the right shape.
- **Service composition.** The underlying `connection` / `state` / `frameManager` are Effect services, and properties compose with them.

### 2. Events as `Stream<T>`

Callback-based event APIs become Effect streams:

<!-- verify:ignore -->

```ts
// @effect-libs/browser-playwright (mirrors upstream Playwright)
page.on('console', (msg) => console.log(msg.text()));

// @effect-libs/browser-cdp
yield* Stream.runForEach(page.onConsole, (msg) =>
  Effect.sync(() => console.log(msg.text())),
);
```

Affected APIs (representative):

- `onConsole`, `onRequest`, `onResponse`, `onRequestFailed`
- `onPageError`, `onDialog`, `onDownload`
- `onFramenavigated`, `onFramedetached`, `onFramestoppedloading`
- `onFrameAttached` (added in P10.3)

Why:

- **Multi-consumer.** Multiple `Stream.runForEach` calls on the same stream are independent — they don't compete for events. Playwright's `page.on` API uses a single callback, so adding a second listener is awkward.
- **Cancellation is scoped.** `Stream.runScoped` ties the subscription lifetime to a `Scope`, so navigating away cleans up automatically.
- **Filter / map / take composition is built-in.** `Stream.filter`, `Stream.map`, `Stream.take(1)` are first-class.
- **Naming.** `browser-cdp` uses `onEventName` (verb-less noun, returns a `Stream`). Playwright uses `page.on('eventName', handler)`. Same data flow, different API.

### 3. Page-level helpers for context-level APIs

Upstream Playwright exposes `setGeolocation`, `setOffline`, `setUserAgent`, `cookies` / `addCookies` / `clearCookies`, `localStorage` / `sessionStorage`, `storageState` / `addStorageState`, `grantPermissions` on `BrowserContext` only. `@effect-libs/browser-cdp` exposes them on `CdpPage` directly:

<!-- verify:ignore -->

```ts
// @effect-libs/browser-playwright (mirrors upstream Playwright)
await context.setGeolocation({ latitude: 0, longitude: 0 });
await context.setOffline(true);
await context.setUserAgent('custom');

// @effect-libs/browser-cdp
yield* page.setGeolocation({ latitude: 0, longitude: 0 });
yield* page.setOffline(true);
yield* page.setUserAgent('custom');
```

Why:

- **Single-page ergonomics.** Scraping workflows typically run on a single page. Reaching into context plumbing for every environment mutation is friction.
- **Implementation walks the context.** Internally, `page.setGeolocation(...)` calls `context.setGeolocation(...)` (which fan-outs to every existing page) and persists to the context settings bundle, so new pages created later pick up the same value.

Source: Q1 in the original coverage-parity doc (archived to git history). Implemented in P4.

## Consequences

- **API surface is a deliberate trade-off.** Less 1:1 with upstream Playwright, more idiomatic with Effect.
- **Migration between `@effect-libs/browser-playwright` and `@effect-libs/browser-cdp` requires signature adaptation.** Method names match; signatures don't. `docs/migrations/from-playwright.md` covers the translation patterns.
- **The `use()` escape hatch** gives direct Chrome DevTools Protocol access for users who want upstream-protocol-style APIs on the underlying connection.
- **`onEventName` vs `page.on('eventName', handler)` naming asymmetry** can confuse users coming from upstream Playwright. The streams in `docs/packages/cdp/streams.md` are the workaround.

## Alternatives considered

- **Mirror upstream Playwright 1:1.** Rejected. `@effect-libs/browser-cdp`'s value-add over `@effect-libs/browser-playwright` is zero-dependency + Effect-native. If signatures match exactly, why ship a separate package?
- **Effect-idiomatic only on the public methods, keep events as callbacks.** Rejected. Callbacks are not Effect-idiomatic. Multi-consumer / cancellation / filtering all become awkward.
- **Mirror only the property-as-`Effect<T>` deviation, leave events as callbacks and methods as promises.** Rejected. Inconsistent — half Effect-native, half not. Loses the multi-consumer advantage.

## See also

- [`docs/reference/cdp-feature-parity.md`](../../../reference/cdp-feature-parity.md) Effect-idiomatic shapes section — full enumeration.
- [`docs/packages/cdp/streams.md`](../../../packages/cdp/streams.md) — `Stream<T>` event API.
- [`docs/migrations/from-playwright.md`](../../../migrations/from-playwright.md) — signature translation patterns.
- [`docs/packages/cdp/network.md`](../../../packages/cdp/network.md) — `onRequest` / `onResponse` streams.
- ADR-0001 (scraping-vs-testing scope) — the sibling source of "we diverge from upstream Playwright on purpose."
- ADR-0002 (single-process architecture) — informed the `Stream<T>` design.
