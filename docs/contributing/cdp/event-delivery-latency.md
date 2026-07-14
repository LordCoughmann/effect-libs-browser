# browser-cdp Event-Delivery Latency

> **Internal reference for `browser-cdp` maintainers.** The `browser-cdp`'s console event stream has **async delivery latency** that the equivalent upstream Playwright API does not. Tests that count stream events must compensate for it, or they will flake.
>
> Prefer [`@effect-libs/browser-playwright`](../../packages/playwright/index.md) unless you have a specific reason to use the `browser-cdp`.

## The Core Problem

CDP events flow through an async pipeline:

```
CDP WebSocket
  → frame event handler (yields effects)
  → PubSub.publish (returns a yield point)
  → Subscription.take (awaits)
  → Stream.fromSubscription (pulls in a fiber)
  → runForEach callback (e.g. Ref.update)
```

Every step that uses `yield*` is an async boundary. By the time `await page.waitForFunction(...)` returns, the **producer** (the browser) has stopped emitting `Runtime.consoleAPICalled` events, but the **consumer fiber** may still be processing the buffer.

This is structural — the `browser-cdp` uses a stream-based event model so that callers can `Stream.filter`, `Stream.runForEach`, and other stream combinators on real-time event traffic. It is not a bug.

## The Upstream Test Doesn't Have This Problem

Upstream Playwright's `page.on('console', cb)` registers a **synchronous** callback that runs on the same tick the event arrives. There is no stream or fiber in the path:

<!-- verify:ignore -->

```typescript
// Upstream Playwright — synchronous increment, no async hop
let counter = 0;
page.on('console', () => ++counter);
const error = await page.waitForFunction(...);
const savedCounter = counter; // sample is exact
```

When `waitForFunction` returns, all `console.log` calls that fired before the timeout have been counted. No settling needed.

## Our Equivalent Test Needs a Stabilization Loop

<!-- verify:ignore -->

```typescript
// Our `browser-cdp` — stream + PubSub + fiber, async hops in between
const counter = yield* Ref.make(0);
yield* Effect.forkChild(
  Stream.fromSubscription(consoleSubscription).pipe(
    Stream.runForEach(() => Ref.update(counter, (n) => n + 1)),
  ),
);
const error = yield* page.waitForFunction(...);
const savedCounter = yield* Ref.get(counter); // ← sample may be 2-12 events short
yield* page.waitForTimeout(2000);
yield* assertEqual(yield* Ref.get(counter), savedCounter); // ← flake
```

The fix is a **stream-drain stabilization loop**: poll the counter until two consecutive reads match, then capture the stable value as `savedCounter`. The downstream 2s observation window then verifies the page is quiescent as intended.

<!-- verify:ignore -->

```typescript
// ✅ Stabilization loop — wait for the stream buffer to drain
const MAX_DRAIN_ATTEMPTS = 40; // 40 × 50ms = 2s cap
let savedCounter = -1;
let current = yield* Ref.get(counter);
for (let i = 0; i < MAX_DRAIN_ATTEMPTS && current !== savedCounter; i++) {
  savedCounter = current;
  yield* page.waitForTimeout(50);
  current = yield* Ref.get(counter);
}
yield* page.waitForTimeout(2000); // unchanged: still proves quiescence
yield* assertEqual(yield* Ref.get(counter), savedCounter);
```

## Why This Is Not Cheating

The test's semantic claim is unchanged: **the page-side polling must stop, and the page must be quiescent for 2 seconds afterward**. The stabilization loop only makes the **measurement** deterministic. It does not:

- Weaken the observation window (still 2s)
- Skip the assertion
- Change the polling rate or any other behavior under test
- Hide a real bug — if the page keeps emitting, the counter never stabilizes, the loop hits the 2s cap, and the post-window assertion fails

If you are tempted to "fix" a similar flake by:

- **Bumping the fixed delay** (50ms → 500ms) — works most of the time, still flaky. The actual drain time varies with event rate and runtime (bun: up to 200ms; workerd: < 50ms typical).
- **Removing the assertion** — masks real bugs in polling termination.
- **Disabling the test on bun** — hides a portability issue, doesn't fix it.

Use the stabilization loop instead. It is deterministic, runtime-agnostic, and preserves the test's intent.

## When the Loop Hits the 2s Cap

If the page keeps emitting events faster than the 50ms poll interval, the loop never stabilizes. After 2 seconds, the cap is hit and `savedCounter` is set to the last `current` value (which is strictly less than the final counter). The post-window 2s observation will then see additional events and the assertion will fail — **the test correctly catches runaway polling**. This is the desired behavior.

The cap exists only to prevent the test from hanging forever if the stream consumer is somehow broken. In the normal case (page stops polling), the loop exits in 2-3 iterations (~150ms).

## When This Pattern Does Not Apply

- **Single-event tests** (e.g. one-shot fire-and-forget, network request sent once) — read the counter right after the action; no stabilization needed.
- **Stream.fromPubSub on `conn.events`** — this is a multi-consumer pub-sub. Each consumer gets its own independent stream, and event delivery semantics are the same (async). If you need exact event counts, apply the same pattern.
- **Frame events consumed by the page's network tracker** — these are tracked in Refs that are not exposed to user tests. The tracker subscribes eagerly and keeps up with the producer; user-visible API (`page.onRequest`, `page.onResponse`) is fed from the same hub but is also subject to async delivery if you count events.

## Related

- [Navigation & concurrency](./navigation-concurrency.md) — PubSub subscription semantics, fiber lifecycle.
- [Upstream integration test coverage](./upstream-integration-test-coverage.md) — how the test naming convention interacts with the upstream-vs-our-mechanism difference.
- [ADR-0003: Effect-idiomatic API surface](./decisions/0003-effect-idiomatic-api-surface.md) — the `Stream<T>` events API design rationale.

The `WaitForFunction > page-wait-for-function.spec.ts - should avoid side effects after timeout` test is the canonical example. The first version used a fixed 50ms settling delay and flaked on bun; the stabilized version passes 20/20 on bun, 5/5 on node/workerd/deno.
