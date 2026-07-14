# ADR-0002: Single-Process Architecture (no client/server split)

> `@effect-libs/browser-cdp` runs in a single process. Frame chains are structured `string[]`, not selector strings with wire-encoding markers. The selectors engine is not vendored.

**Status:** Accepted
**Date:** 2026-07-02
**Source:** Architectural decision from module inception; explained in `FrameLocator.ts`, `Locator.ts`, and the parity-vs-upstream discussions.

## Context

Upstream Playwright is **two processes communicating over a wire**:

```
test runner (client/)  ⇄ WebSocket / pipe ⇄  browser driver (server/)
   FrameLocator,                                Frame, FrameManager,
   Locator,                                     selectors engine,
   ...                                          ...
```

The wire boundary forces the client to encode everything as JSON-serializable values. The most visible consequence is that **frame traversal, selector chains, and event filters all become strings** with mini-languages:

- Frame chains: `iframe1 >> internal:control=enter-frame >> iframe2 >> internal:control=enter-frame >> input`
- Combined selectors: `:is(sel, other)`, `internal:has-text=`, `internal:and=...`, `internal:or=...`
- Selector engine tokens: `text=/regex/flags`, `xpath=...`, etc.

The server decodes these strings back into structured operations.

`@effect-libs/browser-cdp` does not have this constraint. It runs in a single process: the user's code, the Chrome DevTools Protocol client, and the Chrome connection all share memory space. **No JSON wire boundary** means no need for selector-string encoding, no need to vendor the selectors engine, no need to share class identity across processes.

## Decision

`@effect-libs/browser-cdp` is single-process. The structural consequences:

### 1. Frame chains are `string[]`, not selector strings

`makeFrameScopedCdpLocator` in [`packages/browser-cdp/src/internal/Page/FrameLocator.ts`](../../../../packages/browser-cdp/src/internal/Page/FrameLocator.ts) takes `(ctx, frameChain: ReadonlyArray<string>, innerSelector, ...)`. The chain walks `[]`, `[iframe1]`, `[iframe1, iframe2]`, etc. — a structured array, not a string with `>>` markers.

`resolveFrameChain` short-circuits on empty input: when the chain is empty, the locator evaluates in the current frame's main world. This is the path that frame-parity methods (P3) take via `makeFrameScopedCdpLocator(ctx, [], selector)`.

### 2. No selectors engine vendoring

`@effect-libs/browser-cdp` supports a smaller selector vocabulary than upstream Playwright:

| Selector                                                 | Status | Notes                                                                                                    |
| -------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| Plain CSS (`#id`, `.class`, `[attr=...]`, etc.)          | ✅     | Native `document.querySelector(All)`                                                                     |
| `text="..."` / `text=/regex/flags`                       | ✅     | Self-text match (upstream Playwright's `internal:text`)                                                  |
| `text-contains="..."` / `text-contains=/regex/`          | ✅     | Descendant-text match (upstream Playwright's `internal:has-text`) — added in P11                         |
| Chained `and` / `or` via `:is(...)` / `:not(:not(...))`  | ✅     | Subset of upstream Playwright's composition; full coverage requires `@effect-libs/browser-playwright`    |
| `>> internal:control=enter-frame`                        | ❌     | n/a — we use structured `string[]` chains instead                                                        |
| `>> internal:and=...` / `internal:or=...`                | ❌     | n/a — same reason                                                                                        |
| `xpath=...`                                              | ❌     | n/a — use `@effect-libs/browser-playwright`                                                              |
| `internal:has-text=...` (upstream Playwright token form) | ❌     | n/a — `@effect-libs/browser-cdp` exposes the equivalent via the `text-contains=` prefix on CSS selectors |

For full upstream Playwright selector coverage, use `@effect-libs/browser-playwright`.

### 3. Class identity is preserved across the module boundary

`CdpLocator` instances, `CdpFrame` instances, and `CdpError` subclasses all live in a single module graph. `instanceof CdpError` works in Node context, structured-clone preserves the `_tag` discriminant, and `Predicate.isTagged(tag)(err)` works the same regardless of the cloning path. See ADR-0005.

## Consequences

- **Pro:** simpler implementation — no selectors engine to vendor, no client/server split to maintain.
- **Pro:** type-safe APIs — frame chains are typed as `ReadonlyArray<string>`, not opaque strings.
- **Pro:** idiomatic Effect — `Stream<T>` events, `Effect<T>` properties, structured errors, all in a single namespace.
- **Con:** cannot be split across processes without re-architecting. Acceptable — `@effect-libs/browser-cdp` is a library, not a driver.
- **Con:** tighter coupling to the selectors we _do_ support. Users needing XPath or richer selector composition use `@effect-libs/browser-playwright`.

## Alternatives considered

- **Mirror Playwright's client/server split (port `repos/cloudflare-playwright/.../server/selectors/`).** Rejected. ~thousands of LOC of vendored selectors code, ongoing maintenance burden, no real win for the use case.
- **Single-process, but encode the chain as a string with markers (like Playwright does over the wire).** Rejected. The string encoding is a wire-format constraint; in-process we keep the type information.
- **Adopt a third-party selectors library (e.g., `css-select`, `cheerio`).** Considered. We chose to ship a minimal `@effect-libs/browser-cdp`-native selector engine (`SelectorEngine.ts`) to avoid adding runtime dependencies; the cost is the reduced vocabulary above.

## See also

- [`packages/browser-cdp/src/internal/Page/FrameLocator.ts`](../../../../packages/browser-cdp/src/internal/Page/FrameLocator.ts) — frame-chain implementation.
- [`packages/browser-cdp/src/internal/Page/SelectorEngine.ts`](../../../../packages/browser-cdp/src/internal/Page/SelectorEngine.ts) — the minimal selectors engine.
- [`docs/packages/cdp/frames.md`](../../../packages/cdp/frames.md) — frame-traversal API.
- [`docs/contributing/cdp/public-types-and-internals.md`](../public-types-and-internals.md) — single-process informed that `CdpConnection.subscribe` is on the public type.
- ADR-0003 (Effect-idiomatic API surface) — `Stream<T>` events and `Effect<T>` properties are downstream of this decision.
- ADR-0004 (callFunctionOn migration) — single-process informed the P6 refactor.
- ADR-0005 (tagged-error guard pattern) — class identity is preserved across the module boundary.
