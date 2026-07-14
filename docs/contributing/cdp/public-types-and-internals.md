# CdpConnectionService and the Public-Type Surface

> **Internal reference for `browser-cdp` maintainers.** This document records the design decision that **`CdpConnection.subscribe` is intentionally part of the public `CdpConnectionService` type**, alongside the equally "internal-looking" `cdp` proxy and `events` stream. It's a deliberate trade-off, not an oversight.

## TL;DR

`CdpConnectionService` looks like it has implementation-detail fields (`subscribe`, `cdp.*`, `events`). It does — and that's by design. The type is the **parameter type of the public `page.use((conn, sid) => ...)` escape hatch**, so it must include every surface the escape hatch exposes. Consumers need to import the type to write their callback's signature. Splitting "public" from "internal" would either break the escape hatch (consumers can't type their callbacks) or require redesigning the escape hatch to take a narrower view.

This is the standard TypeScript pattern for public APIs that hand out a live object via a callback.

## The design constraint

`packages/browser-cdp/src/internal/CdpPage.ts:2149` declares the public `CdpPageService.use`:

<!-- verify:ignore -->

```ts
readonly use: <A>(
  fn: (cdp: CdpConnectionService, sessionId: string) => Effect.Effect<A, CdpError>,
) => Effect.Effect<A, CdpError>;
```

When a consumer calls `yield* page.use((conn, sid) => ...)`, the callback receives the full `CdpConnectionService` object. To write this callback with proper typing, the consumer needs to refer to `CdpConnectionService` in their own code. That's why the type is exported from `packages/browser-cdp/src/CdpTypes.ts:781`.

This is the same pattern as `node:fs`'s `FileHandle` or `node:net`'s `Socket` — when an API hands you an object via a callback, the object's type must be reachable from the public surface for consumer code to type-check.

## Why this means low-level fields stay on the type

`CdpConnectionService` exposes three "low-level" surfaces:

| Field       | What it is                                            | Why it's on the public type                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cdp`       | Raw CDP command proxy (`conn.cdp.Page.navigate(...)`) | The escape-hatch point of `page.use`. Without this, the escape hatch couldn't send arbitrary CDP commands.                                                                                                   |
| `events`    | Raw `Stream.Stream<CdpMessage>` of all CDP events     | The escape hatch lets consumers build their own event filters / handlers. Without this, the escape hatch couldn't observe raw CDP events.                                                                    |
| `subscribe` | Raw `PubSub.Subscription<CdpMessage>`                 | Same as `events` but as a single-consumer `Subscription` for navigation-scoped event waits. See [Navigation & concurrency](./navigation-concurrency.md#pubsub-subscriptions-vs-streams) for the trade-off. |

All three are **necessary** for `page.use` to be useful. Hiding any of them would break the documented use cases of the escape hatch (see `docs/packages/cdp/index.md` and the JSDoc on `CdpPageService.use`).

## Why we considered hiding `subscribe` anyway

The JSDoc audit (`JSDOCS_AUDIT.md`) and CDP audit (`CDP_AUDIT.md` item C) flagged `subscribe` as "internal leaking into public." The reasoning was sound: `subscribe` returns a raw `PubSub.Subscription<CdpMessage>`, which is harder to use than the structured `page.onConsole` / `page.waitForRequest` / etc. APIs, and looks like an implementation detail.

The proposed fix was to split `CdpConnectionService` into:

- `CdpConnectionService` (public, no `subscribe`)
- `CdpConnectionInternalService` (internal, extends public, adds `subscribe`)

…with a parallel `CdpConnectionInternal` `Context.Service` tag for internal code.

## Why we didn't do it

That refactor would break `page.use`. The public `CdpPageService.use` callback signature `(cdp: CdpConnectionService, sid: string) => ...` would have to change to one of:

1. **`(cdp: ???, sid)`** — there's no good "public-only" type. The escape hatch _needs_ access to `cdp` (raw command proxy), `events` (raw event stream), AND `subscribe` (raw subscription) to fulfill its role. If we strip `subscribe`, we should also strip the others, at which point the escape hatch stops being an escape hatch.

2. **Keep `(cdp: CdpConnectionService, sid)` but with `subscribe` removed** — this means `conn.subscribe` is on the type that consumer callbacks receive, but the type they import doesn't have it. TypeScript prevents this; you can't pass an object that has more fields than the declared parameter type without widening. The compiler would either reject the assignment or silently strip the field (depending on how the type narrowing is set up).

Either way, **the fix breaks the public API surface it's trying to protect**. The "leak" is structural to how the escape hatch is typed.

## What we did instead

Three things, all low-cost:

1. **No code change.** `CdpConnectionService` keeps `subscribe` on it. The 6 internal call sites that use `conn.subscribe` continue to work unchanged.

2. **Documented the pattern.** This file exists so future maintainers don't redo the same audit cycle. When somebody asks "why is `subscribe` on the public type?", point them here.

3. **Already-covered docs.** `navigation-concurrency.md` (§ 1, "PubSub Subscriptions vs Streams") already explains the `conn.subscribe` vs `conn.events` trade-off for maintainers. This doc adds the **why-it's-public** layer on top.

## What about the `events` raw stream?

The same argument applies. `events: Stream.Stream<CdpMessage>` is on `CdpConnectionService` for the same reason — `page.use` callbacks need to observe raw events. If you wanted to hide it for the same "internal detail" reasons, you'd run into the same escape-hatch-typing constraint.

The audit didn't flag `events`, but it could have. The principle is the same.

## When this principle DOES NOT apply

This "type is the parameter type of a public callback" justification only holds for fields that consumers actually use through the escape hatch. If you find a future field on `CdpConnectionService` that:

- Is used only by internal code (`packages/browser-cdp/src/internal/...`),
- Has no consumer-facing use case through `page.use`,
- And nothing in `docs/` documents it for consumers,

…then it probably IS an internal leak and should be hidden via the two-tag pattern. Apply the test case by case, not blanket.

## Open question: should the escape hatch be narrower?

The escape hatch could in principle be redesigned to expose a narrower "public raw surface" — e.g., a typed subset of CDP commands (`conn.cdp.Page.*` only, no `Network.*`, no `Target.*`) — and a higher-level event-filtering API instead of `events`/`subscribe`. This would be a large API change with backwards-compatibility concerns; not done as part of the audit.

If a future audit revisits this, the right move is to redesign the escape hatch, not to split the type.

## See also

- [Navigation & concurrency](./navigation-concurrency.md) — when to use `conn.events` vs `conn.subscribe` (the "how to use it" guide).
- [Upstream integration test coverage](./upstream-integration-test-coverage.md) — how we track public-API parity with upstream Playwright.
- [Event-delivery latency](./event-delivery-latency.md) — async delivery semantics of the event stream.
- [ADR-0002: Single-process architecture](./decisions/0002-single-process-architecture.md) — why the connection object lives on the public type and the type isn't split.
- [ADR-0005: Tagged-error guard pattern](./decisions/0005-tagged-error-guard-pattern.md) — the v4 idiom for error discrimination (relates to `CdpError` propagation through this escape hatch).
- `JSDOCS_AUDIT.md` "Out-of-audit-scope follow-ups (CDP)" — the original audit finding.
- `CDP_AUDIT.md` item C — the deferred item this document resolves.
