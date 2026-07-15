# browser-cdp — Event Streams

`@effect-libs/browser-cdp` exposes 12 first-class `on*` stream accessors for
browser events. Each one returns `Effect<Stream<T>, never, Scope.Scope>`,
allocating the stream subscription **synchronously** so the
subscribe-before-async race that bites raw Chrome DevTools Protocol clients cannot happen.

This is the **architectural divergence** from `@effect-libs/browser-playwright`, which
uses callback-style `page.on(eventName, handler)` (reachable only via
`page.use(...)` in this library). Streams are strictly more capable:
multi-consumer, filterable, composable with `Stream.broadcast`,
`Stream.take`, `Stream.takeUntil`, etc.

## The eager-subscription pattern

A stream accessor like `page.onConsole` allocates the underlying
`PubSub` subscription synchronously inside its `Effect`. This matters
because Chrome can respond to Chrome DevTools Protocol commands faster than a forked fiber
runs in workerd's cooperative single-threaded scheduler — the same
race that motivates `waitForNavigation` also bites `on*` streams.

The shape `Effect<Stream<T>, never, Scope.Scope>` says:

1. **Run the outer Effect** to allocate the subscription.
2. **Use the resulting `Stream<T>`** with any `Stream` combinator
   (`Stream.take`, `Stream.filter`, `Stream.runCollect`, etc.).
3. **Bind `Scope.Scope`** so the subscription is released when the
   scope ends.

The recommended pattern uses `Stream.broadcast` to fan out events to
multiple consumers:

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import { Console, Fiber } from "effect";
import { Effect, Stream } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  Effect.gen(function* () {
    // Outer Effect allocates the subscription synchronously.
    // The returned Stream<T> is hot — events are buffered in the underlying
    // PubSub until something consumes them.
    const consoleStream = yield* page.onConsole;

    // Fan out to multiple consumers with Stream.broadcastN. The result is
    // a tuple of N independent streams. Wrap the whole call in Effect.scoped
    // so the broker cleans up when the scope ends.
    const [left, right] = yield* Stream.broadcastN({ n: 2, capacity: 256 })(consoleStream).pipe(
      Effect.scoped,
    );

    // Consumer 1: log every console message
    const logFiber = yield* Stream.runForEach(left, (msg) =>
      Console.log(`[console:${msg.type}] ${msg.text}`),
    ).pipe(Effect.forkChild);

    // Consumer 2: count errors
    const errorCount = yield* Stream.runCount(right.pipe(Stream.filter((m) => m.type === "error")));

    // ... drive the page; events flow to both consumers ...

    yield* Fiber.join(logFiber);
  });
```

## Streams

All 12 streams have the same shape
`Effect<Stream<T>, never, Scope.Scope>`. The first call to `yield* page.on*`
allocates the subscription; subsequent calls (before the first is closed)
share the same `PubSub`.

| Stream                  | Item type                | Description                                                                 |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `onConsole`             | `ConsoleMessage`         | `console.log` / `warn` / `error` / etc. with `type` and `text`.             |
| `onDialog`              | `CdpDialog`              | `alert` / `confirm` / `prompt` / `beforeunload` — `accept()` / `dismiss()`. |
| `onPageError`           | `CdpPageError`           | Uncaught page-side JavaScript exceptions.                                   |
| `onDownload`            | `CdpDownload`            | Downloads (per-request). `path()` saves, `cancel()` aborts.                 |
| `onRequest`             | `NetworkRequest`         | Every network request that the page initiates.                              |
| `onResponse`            | `NetworkResponse`        | Every response (status, headers, body via the same `requestId`).            |
| `onRequestFinished`     | `NetworkRequestFinished` | A request whose body was fully received.                                    |
| `onRequestFailed`       | `NetworkRequestFailed`   | A request that failed (`net::ERR_*`).                                       |
| `onFramenavigated`      | `CdpFrame`               | A frame completed a navigation.                                             |
| `onFramedetached`       | `CdpFrame`               | A frame was detached from the DOM.                                          |
| `onFramestoppedloading` | `CdpFrame`               | A frame stopped loading (network idle / lifecycle event).                   |
| `onFrameAttached`       | `CdpFrame`               | A new frame was attached (iframe added). CDP-Extension.                     |

## Common patterns

### One-shot wait (stream equivalent of `waitForRequest` / `waitForResponse`)

The first-class `waitForRequest` / `waitForResponse` /
`waitForRequestFailed` methods use a prepare-then-await nested-Effect
pattern. The stream equivalent — useful when you also need filtering,
broadcasting, or race-free composition — is one line with `Stream.take(1)`:

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import { Effect, Stream } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  Effect.gen(function* () {
    // Wait for the next response matching a URL pattern
    const stream = yield* page.onResponse;
    const first = yield* stream.pipe(
      Stream.filter((r) => r.url.includes("/api/data")),
      Stream.take(1),
      Stream.runHead,
    );
  });
```

The `Stream.runHead` returns `Option<T>` — `Some(response)` if the stream
emitted, `None` if it completed before matching. Wrap in a `Effect.someOrFail`
if you need it to fail on timeout.

### With a timeout

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

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

### Collect everything in a window

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import { Effect, Stream } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  Effect.gen(function* () {
    const stream = yield* page.onConsole;
    // Take the next 50 console messages
    const messages = yield* stream.pipe(Stream.take(50), Stream.runCollect);
  });
```

### Multi-consumer via broadcast

Already shown in the eager-subscription example above. The key
insight: `Stream.broadcast(n)` is itself scoped — it auto-cleans when its
own scope ends. So the broadcast layer is independent of any single
consumer's lifetime.

## Why not `page.on(handler)`?

`@effect-libs/browser-playwright` inherits upstream Playwright's `page.on(eventName, handler)`
callback API, accessible via `page.use((p) => p.on("console", (msg) => ...))`.
We chose not to mirror that for `@effect-libs/browser-cdp` for three reasons:

1. **Race-free by construction.** A callback registered after the
   event has already fired misses it. The stream pattern allocates
   synchronously, so the subscription is in place before the trigger
   action runs.
2. **Composability.** You can `Stream.filter`, `Stream.merge`, `Stream.take`,
   `Stream.flatMap`, `Stream.runCollect`, etc. None of these are possible
   with a side-effecting callback.
3. **Multi-consumer.** `Stream.broadcast(n)` lets N consumers share the
   same event source without re-registering. A callback registered twice
   on the same event runs twice.

If you do need the callback shape, use the `use()` escape hatch — see [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md#browser-automation-additions).

## Stream alternative for `waitForRequest` / `waitForResponse` / `waitForRequestFailed`

The first-class `waitForRequest` / `waitForResponse` /
`waitForRequestFailed` methods are **not deprecated** — they're the
idiomatic one-shot wait. Use them when you just need "wait for the next
matching X". Use the `on*` stream when you need filtering,
broadcasting, multi-consumer, or race-free composition with other event
flows:

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import type { CdpPageService } from "@effect-libs/browser-cdp";

import { Effect } from "effect";

const example = (page: CdpPageService) =>
  Effect.gen(function* () {
    // Method form — one-shot wait
    const response = yield* page.waitForResponse("/api/data");
    yield* page.click("button.load-data");
    const info = yield* response;
  });
```

The stream equivalent uses `Stream.runHead` to consume one item
synchronously, then branches on `Option` for the match/no-match case.
See [`browser-cdp — Event Streams`](./streams.md) for the full pattern, including
timeout and broadcast variants.

The stream form composes with other streams, supports multi-consumer
via `Stream.broadcast`, and never has the prepare-then-await race. The
method form is preferred when none of that is needed.

## See also

- [browser-cdp — Network](./network.md) — for `route`, `routeWebSocket`, and
  the request interception patterns (vs. observation)
- [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) — `browser-cdp`'s deviations
  from upstream Playwright
- [Navigation & Concurrency Reference](../../contributing/cdp/navigation-concurrency.md) —
  the deeper technical note on subscribe-before-async
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src) — full API in JSDoc
