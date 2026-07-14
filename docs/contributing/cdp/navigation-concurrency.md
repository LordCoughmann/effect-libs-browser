## 1. PubSub Subscriptions vs Streams

### The Core Problem

`CdpConnection` publishes all CDP events to a `PubSub.dropping<CdpMessage>`. There are two ways to consume them:

| Method           | API                           | Subscription semantics                                                                                                                      |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `conn.events`    | `Stream.fromPubSub(eventBus)` | Each access creates a **new independent subscriber** — events are not shared                                                                |
| `conn.subscribe` | `PubSub.subscribe(eventBus)`  | Returns a **single-consumer `Subscription`** — events are buffered, multiple `Stream.fromSubscription` calls **compete** for the same queue |

### When to Use Which

- **`conn.events`** — Page-level long-lived consumers (e.g., network tracker). Starts at page creation, no race condition. Each call gets an independent stream.
- **`conn.subscribe`** — Navigation-scoped event waiting (e.g., `waitForNavigation`, `goto`). Allocates synchronously, buffers events, and is cleaned up via `Scope`.

### Competing Consumers on Subscriptions

A `PubSub.Subscription` is a **single-consumer queue**. Multiple `Stream.fromSubscription(subscription)` calls **steal events from each other**.

<!-- verify:ignore -->

```typescript
// ❌ WRONG — two streams from the same subscription compete
const sub = yield* conn.subscribe;
const fiberA = yield* Effect.forkChild(
  Stream.fromSubscription(sub).pipe(Stream.filter(isFrameNavigated), Stream.runDrain),
);
const fiberB = yield* Effect.forkChild(
  Stream.fromSubscription(sub).pipe(Stream.filter(isLoadEvent), Stream.runDrain),
);
// frameNavigated might get consumed by fiberB and filtered out → LOST FOREVER
```

**Solutions:**

1. **Sequential consumption** — drain one event type, then the next, from the same subscription. Events are buffered, so nothing is lost:

   <!-- verify:ignore -->

   ```typescript
   const sub = yield* conn.subscribe;
   // Phase 1: drain until frameNavigated
   yield* Stream.fromSubscription(sub).pipe(
     Stream.filter(isFrameNavigated),
     Stream.take(1),
     Stream.runDrain,
   );
   // Phase 2: drain until the lifecycle event (still in the buffer)
   yield* Stream.fromSubscription(sub).pipe(
     Stream.filter(isLifecycleEvent),
     Stream.take(1),
     Stream.runDrain,
   );
   ```

2. **Multiple subscriptions** — one per concurrent consumer:

   <!-- verify:ignore -->

   ```typescript
   const lifecycleSub = yield* conn.subscribe; // for frameNavigated (lifecycle events via SubscriptionRef)
   const networkSub = yield* conn.subscribe; // only needed if not using page-level tracker
   ```

---

## 2. The Subscribe-Before-Async Rule

**All event subscriptions must be active BEFORE any operation that could publish events.**

### Why

In workerd's cooperative single-threaded scheduler, Chrome can respond to a CDP command (e.g., `Page.navigate`) before a forked fiber runs. If the fiber hasn't subscribed yet, the event is lost.

```
1. forkChild(waitForNavigation)    → fiber created but NOT yet running
2. Page.navigate sent to Chrome     → Chrome responds fast (localhost WS)
3. Chrome fires Page.lifecycleEvent → published to PubSub
4. PubSub delivers to subscribers   → forkChild fiber hasn't subscribed → DROPPED
5. forkChild fiber finally runs     → subscribes, waits forever → timeout
```

Node.js hides this because its multi-threaded event loop gives the fiber time to run before Chrome responds over the network.

### Pattern: Synchronous Subscription

<!-- verify:ignore -->

<!-- verify:ignore -->

```typescript
// ✅ CORRECT — subscribe synchronously, THEN trigger navigation
yield* Effect.scoped(
  Effect.gen(function* () {
    const lifecycleSub = yield* conn.subscribe;  // synchronous

    const navFiber = yield* Effect.forkChild(
      waitForNavigationInternal(lifecycleSub, ...),
    );

    yield* conn.cdp.Page.navigate({ url }, sessionId);  // async — but we're subscribed
    yield* Fiber.await(navFiber);
  }),
);
```

### Pattern: Prepare-Then-Await (Public API)

For user-facing APIs like `page.waitForNavigation()`, the caller needs to subscribe before clicking. Return a nested `Effect<Effect<void>>` — outer allocates subscriptions, inner awaits the event:

<!-- verify:ignore -->

```typescript
// Usage:
const awaitNavigation = yield* page.waitForNavigation(); // subscribes synchronously
yield* page.click("a.link"); // triggers navigation
yield* awaitNavigation; // awaits completion
```

### When This Does NOT Apply

- **Synchronous operations** — `Ref.get`, value construction — don't yield, no interleaving.
- **Request-response commands** — `Page.evaluate`, `Network.getCookies` — use command ID matching, not the event stream.
- **Fire-and-forget consumers** — The page-level network tracker can miss early events without correctness impact.

---

## 3. Fiber Lifecycle: forkScoped vs forkDetach

### The Scope Death Problem (Fixed)

Previously, `makePage` used `Effect.provide(Layer.merge(...))` to inject `CdpConnection` and `CdpConfig` into `CdpPage.make()`. This created a **transient scope** that closed after `make()` returned, killing all `forkScoped` fibers — including the page-level network tracker.

**Fix**: Use `Effect.provideService` instead, which adds services to the environment without creating a scope. The `Scope` requirement from `CdpPage.make` now flows through to the caller's `Effect.scoped`.

<!-- verify:ignore -->

```typescript
// ❌ BEFORE — transient scope kills forkScoped fibers
CdpPage.make(targetId).pipe(
  Effect.provide(
    Layer.merge(Layer.succeed(CdpConnection, connection), Layer.succeed(CdpConfig, config)),
  ),
);

// ✅ AFTER — no transient scope, forkScoped works correctly
CdpPage.make(targetId).pipe(
  Effect.provideService(CdpConnection, connection),
  Effect.provideService(CdpConfig, config),
);
```

### Current Rules

| Fiber type   | Use when                                                                  | Cleanup                                                    |
| ------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `forkScoped` | Fibers that should live as long as the page scope (e.g., network tracker) | Auto-cleaned when the page scope closes (`withPage` exits) |
| `forkChild`  | Short-lived fibers within a scoped block (e.g., navigation waiters)       | Auto-cleaned when the enclosing scope closes               |
| `forkDetach` | Fibers that must survive scope closure (last resort)                      | Never cleaned up automatically                             |

**Rule**: Prefer `forkScoped` > `forkChild` > `forkDetach`. Only use `forkDetach` when the fiber truly has no natural cleanup point.

---

## 4. CDP Navigation Events by Method

Not all CDP navigation commands fire the same events. This affects which `waitUntil` values are reliable.

### Event Sequences

| Command                                          | Events fired                                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Page.navigate` (goto)                           | `frameStartedNavigating` → `frameStartedLoading` → `frameNavigated` → `lifecycleEvent("load")` → `frameStoppedLoading`                                                |
| `Page.reload`                                    | Same as `Page.navigate`                                                                                                                                               |
| `Page.navigateToHistoryEntry` (goBack/goForward) | `frameStartedNavigating` → `frameStartedLoading` → `frameNavigated` → `lifecycleEvent` → `frameStoppedLoading` (lifecycleEvent may be delayed or absent with bfcache) |

### Implications

- **`goto` / `reload`**: `"load"` waitUntil works — `Page.lifecycleEvent` fires with `name: "load"`.
- **`goBack` / `goForward`**: Uses `"commit"` by default (waits for `Page.frameNavigated` only). History navigation may or may not fire `Page.lifecycleEvent` depending on cache state — passing `"load"` explicitly is not guaranteed to work.
- **History navigation default**: Uses `"commit"` (waits for `Page.frameNavigated` only). The page is effectively loaded by the time any subsequent operation runs because resources are in browser cache.
- Users can pass `"domcontentloaded"`, `"networkidle"`, or `"load"` explicitly.

### about:blank in History

After `Target.createTarget({ url: "about:blank" })` + `goto("/")`, the history is:

```
entries: ['about:blank', 'http://localhost:3000/']
currentIndex: 1
```

`goBack()` navigates to `about:blank` — this matches upstream Playwright behavior. Do **not** filter `about:blank` entries.

---

## 5. Testing Concurrent Navigation Code

### Timing Assertions

Integration tests for async behavior should include timing assertions to catch silent timeout fallbacks:

<!-- verify:ignore -->

```typescript
// ✅ Catches "passes for the wrong reason" (30s timeout fallback)
const start = Date.now();
yield* page.goto(url, { waitUntil: "networkidle" });
const elapsed = Date.now() - start;
yield* assertTrue(elapsed < 5000, `networkidle took ${elapsed}ms`);
```

<!-- verify:ignore -->

```typescript
// ❌ May pass even if detection is broken — the 30s timeout resolves,
// and by then the page state happens to be correct
yield* page.goto(url, { waitUntil: "networkidle" });
const status = yield* page.evaluate(() => document.getElementById("status")?.textContent);
```

### Mock WebSocket for Unit Testing

The CDP connection can be tested with a mock WebSocket (see `tests/unit/cdp/CdpConnection.test.ts`). The mock supports:

- `simulateOpen()` — trigger connection
- `simulateMessage(data)` — inject CDP messages
- `simulateClose(code)` — simulate disconnection

This allows unit-testing the subscribe-before-async pattern without a real browser.

---

## 6. Common Pitfalls

These bit us during parity-test work. Re-read them before touching retry loops, frame navigation, or fiber creation.

### Ghost Subscription (CRITICAL)

**Do not create PubSub subscriptions inside an `Effect.repeat` retry loop.** Each iteration allocates a new subscription that misses CDP events that already fired during earlier iterations.

<!-- verify:ignore -->

```typescript
// ❌ WRONG: subscription inside retry loop — events fire once, get "ghost"-ed
Effect.repeat(
  Effect.scoped(
    Effect.gen(function* () {
      const stream = yield* page.onDetached;  // new subscription each iteration
      // ...
    }),
  ),
)

// ✅ CORRECT: fork the subscription once outside, race against it inside
const detachedFiber = yield* Effect.forkChild(
  page.onDetached.pipe(Stream.take(1), Stream.runDrain),
);
yield* Effect.repeat(/* retry loop that doesn't allocate subscriptions */);
yield* Fiber.join(detachedFiber);
```

The same shape applies to any subscription used as a "did X happen?" signal inside a retry: fork it once before the loop, then `Fiber.join` (or `Deferred.await`) inside.

### Frame navigation: use `frame.goto()`, not `page.evaluate`

Always use `frame.goto(url)` for child-frame navigation. Setting `iframe.src` via `page.evaluate` bypasses CDP's `Page.navigate` and creates a race condition where `Page.frameNavigated` fires before CDP settles the execution context, leading to flaky or hung tests.

### Effect v4: `forkChild`, not `fork`

Use `Effect.forkChild` (v4), NOT `Effect.fork` (v3). The two have different scoping semantics; v4's `forkChild` returns a `Fiber` you can `join` or `interrupt` independently. The v4 linter will flag `fork` in most cases, but it's easy to miss when porting from examples.

### Strip `content-length` before constructing a WHATWG `Request` (CRITICAL)

**`packages/browser-cdp/src/internal/Page/Request.ts` must not propagate Effect's auto-computed `content-length` header to the WHATWG `Request` constructor.** The fetch spec forbids manually setting `Content-Length` and computes it from the body; passing one through is undefined behavior.

- Node 24's built-in undici (7.x) silently accepts the manual header.
- `@effect/platform-node` lists `undici@^8.2.0` as a direct dependency, so importing it anywhere in the test suite installs undici 8.x as the global dispatcher. The stricter version validates headers per WHATWG and throws `InvalidArgumentError: invalid content-length header` from the dispatcher `Request` constructor — breaking any test that does a `page.request.post`/`put`/`patch` with a body.

This is a transitive-import footgun: it doesn't matter whether the test itself uses `@effect/platform-node`; once any sibling test file imports from it, undici 8.x is loaded and the next `page.request` test with a body fails.

<!-- verify:ignore -->

```typescript
// ❌ WRONG — propagates Effect's manual content-length to the WHATWG Request
const headersRecord: Record<string, string> = { ...request.headers };
const fetchReq = new Request(url, { method, headers: headersRecord, body: bodyInit });

// ✅ CORRECT — strip content-length; the fetch spec auto-computes it from the body
const headersRecord: Record<string, string> = {};
for (const key of Object.keys(request.headers)) {
  if (key.toLowerCase() !== "content-length") {
    headersRecord[key] = request.headers[key];
  }
}
const fetchReq = new Request(url, { method, headers: headersRecord, body: bodyInit });
```

The case-insensitive check is required: headers may arrive as `Content-Length` (capitalized) or `content-length` depending on upstream construction. Re-read this section before touching any code path that constructs a WHATWG `Request` from an Effect `HttpClientRequest`.

---

## References

- [testing-practices.md](../testing/testing-practices.md) — General testing guidelines
- [CdpConnection.test.ts](../../../tests/unit/cdp/CdpConnection.test.ts) — Mock WebSocket patterns
- [WaitForNetworkIdle.test.ts](../../../tests/unit/cdp/WaitForNetworkIdle.test.ts) — Detector unit tests
- [ADR-0002: Single-process architecture](./decisions/0002-single-process-architecture.md) — why the events flow through PubSub rather than over a wire.
- [ADR-0003: Effect-idiomatic API surface](./decisions/0003-effect-idiomatic-api-surface.md) — why events are `Stream<T>` instead of callback APIs.
