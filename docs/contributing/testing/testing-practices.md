# Testing Practices

This document describes the standardized approach to testing in `effect-libs/browser`. Our tests follow Effect v4 patterns and focus on high-value assertions while avoiding testing Effect internals or external dependencies.

## Principles

### 1. Test Behavior, Not Implementation

Focus on **what** your code does, not **how** Effect makes it work.

<!-- verify:stubs:declare const it: { effect: (name: string, fn: () => any) => void }; declare const assert: { strictEqual: (a: any, b: any) => void } -->

```typescript
import { Effect } from "effect";

import { SteelProvider } from "@effect-libs/browser-providers/steel";

// ✅ DO: Test service behavior
it.effect("createSession returns session with expected fields", () =>
  Effect.gen(function* () {
    const provider = yield* SteelProvider;
    const session = yield* provider.createSession();
    assert.strictEqual(session.id, "test-session-id");
  }),
);
```

For the matching "what NOT to do" examples (don't test Layer composition, don't test method existence, don't test that Effect.gen works), see [What NOT to Test](#what-not-to-test) below.

### 2. Don't Test External Dependencies

Never test that Effect's primitives, the TypeScript compiler, or third-party libraries (WebSocket, fetch, Schema, etc.) do what they advertise — those have their own test suites. See [What NOT to Test](#what-not-to-test) for the canonical list with code examples.

### 3. Use Mock Layers for Unit Tests

All unit tests should use mock layers from `tests/utils/mocks.ts`:

<!-- verify:stubs:declare const describe: (name: string, fn: () => void) => void; declare const layer: (mock: any) => (fn: (it: any) => void) => void; declare const SteelProviderLayerTest: any -->

```typescript
import { Effect } from "effect";

import { SteelProvider } from "@effect-libs/browser-providers/steel";

describe("SteelProvider Methods", () => {
  layer(SteelProviderLayerTest)((it) => {
    it.effect("createSession succeeds", () =>
      Effect.gen(function* () {
        const provider = yield* SteelProvider;
        const session = yield* provider.createSession();
        // Test YOUR logic, not the mock
      }),
    );
  });
});
```

### 4. One Assertion Per Concept

Each test should verify a single behavior:

<!-- verify:ignore -->

```typescript
// ✅ GOOD: Focused tests
it.effect("returns URL with sessionId", () => { ... });
it.effect("URL uses wss:// protocol", () => { ... });

// ❌ BAD: Multiple unrelated assertions
it.effect("URL is correct", () => {
  // Tests protocol, sessionId, query params, encoding...
  // Split into separate tests
});
```

## Test File Structure

### Standard Template

<!-- verify:ignore -->

```typescript
/**
 * Unit tests for [Component].
 *
 * Focuses on:
 * - [Key aspect 1]
 * - [Key aspect 2]
 */

import { assert, describe, it, layer } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { YourService } from "@effect-libs/browser-your-module";
import { YourServiceLayerTest } from "@test/utils/mocks.js";

// ── Section Name ─────────────────────────────────────────────────────

describe("YourService", () => {
  layer(YourServiceLayerTest)((it) => {
    it.effect("does something specific", () =>
      Effect.gen(function* () {
        const service = yield* YourService;
        // Test logic here
      }),
    );
  });
});
```

### Section Organization

Organize tests into logical sections with visual separators:

<!-- verify:ignore -->

```typescript
// ── Method Behavior Tests ─────────────────────────────────────────────

describe("Methods", () => { ... });

// ── Error Handling Tests ──────────────────────────────────────────────

describe("Error Handling", () => { ... });

// ── Edge Cases ────────────────────────────────────────────────────────

describe("Edge Cases", () => { ... });
```

## File Naming

- **Unit tests**: `*.test.ts` (e.g., `SteelProvider.test.ts`)
- **Integration tests**: `*.test.ts` in runtime-specific directories
- **Example tests**: `index.spec.ts` (required by Cloudflare test framework)

**Standardize on `.test.ts`** for all library code. Only use `.spec.ts` for Cloudflare Workers examples where the test framework requires it.

## Test Types

### Unit Tests (`tests/unit/`)

- Test individual services and functions in isolation
- Use mock layers from `tests/utils/mocks.ts`
- No external API calls or browser connections
- Fast execution (< 100ms per test)

**Example**: `tests/unit/providers/steel/SteelProvider.test.ts`

### Integration Tests (`tests/integration/`)

- Test real interactions between components
- May start actual browsers or HTTP servers
- Shared test definitions across runtimes (Node, Bun, Deno, workerd)
- Slower execution but catch integration issues

**Structure**:

```
tests/integration/
├── shared/           # Test definitions (imported by runtimes)
│   ├── cdp/
│   ├── playwright/
│   └── providers/
└── runtime/
    ├── node/
    ├── workerd/
    ├── bun/
    └── deno/
```

### Provider Tests (Real APIs)

- Located in `tests/integration/shared/providers/`
- Require API keys (`STEEL_API_KEY`, `BROWSERBASE_API_KEY`, etc.)
- Run with `npx dotenvx run -- pnpm test:providers`
- **Warning**: These cost money - keep minimal

## Mock Patterns

### Dual-Key Provider Pattern

Provider layers provide both the concrete service AND the abstract `BrowserProvider`. This is an implementation detail of the Effect service pattern — **do not write tests verifying the dual-key pattern works** (that's testing Effect's Layer mechanism).

<!-- verify:stubs:declare const testSteelProvider: any -->

```typescript
import { Effect, Layer, Context } from "effect";

import { BrowserProvider } from "@effect-libs/browser";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

// In mocks.ts — the mock provides both keys
export const SteelProviderLayerTest = Layer.effectContext(
  Effect.sync(() =>
    Context.make(SteelProvider, testSteelProvider).pipe(
      Context.add(BrowserProvider, testSteelProvider),
    ),
  ),
);
```

### Custom Mock for Error Cases

For error handling tests, create inline mocks:

<!-- verify:ignore -->

```typescript
import { Effect, Layer } from "effect";

it.effect("handles failure gracefully", () => {
  const failingProvider: YourService = {
    doSomething: () => Effect.fail(new YourError({ reason: "failed" })),
    // ... other methods
  };

  const FailingMock = Layer.succeed(YourService, failingProvider);

  return Effect.gen(function* () {
    const service = yield* YourService;
    // Test error handling
  }).pipe(Effect.provide(FailingMock));
});
```

## What NOT to Test

### ❌ Effect Internals

<!-- verify:stubs:declare const it: { effect: (name: string, fn: () => any) => void }; declare const assert: { strictEqual: (a: any, b: any) => void; isDefined: (a: any) => void }; declare const Service: any -->

```typescript
import { Effect } from "effect";

// Don't test that Effect.gen works
it.effect("generator executes", () =>
  Effect.gen(function* () {
    const x = 1;
    assert.strictEqual(x, 1); // Pointless
  }),
);

// Don't test Layer composition
it.effect("layer provides service", () =>
  Effect.gen(function* () {
    const s = yield* Service; // Just verifying Effect works
    assert.isDefined(s);
  }),
);
```

### ❌ TypeScript Type Checking

TypeScript catches these at compile time - no need for runtime tests:

<!-- verify:stubs:declare const it: { effect: (name: string, fn: () => any) => void }; declare const assert: { strictEqual: (a: any, b: any) => void }; declare const Service: any -->

```typescript
import { Effect } from "effect";

// Don't test method existence
it.effect("has createSession method", () =>
  Effect.gen(function* () {
    const s = yield* Service;
    assert.strictEqual(typeof s.createSession, "function"); // TS already ensures this
  }),
);
```

### ❌ External Library Behavior

```typescript
// Don't test that WebSocket connects
// Don't test that fetch returns Response
// Don't test that Schema validates
// These libraries have their own test suites
```

## Example Tests Directory

The `examples/cf-workers/*/test/` directories previously contained scaffolded "Hello World!" tests. These have been removed as they tested generated boilerplate, not library functionality. The examples themselves serve as usage documentation.

If adding new Cloudflare Workers examples, you may omit the `test/` directory entirely unless you have meaningful integration tests to write.

## Timeout Policy

All tests have a **10-second per-test timeout** by default. This applies across all runtimes:

| Config                            | Timeout                                 |
| --------------------------------- | --------------------------------------- |
| Vitest unit                       | 10s (via `testTimeout`)                 |
| Vitest integration (node/workerd) | 10s (via `testTimeout`)                 |
| Vitest smoke                      | 10s (via `testTimeout`)                 |
| Vitest providers                  | 120s (real API calls)                   |
| Bun adapter                       | 10s (via `DEFAULT_TIMEOUT_MS`)          |
| Deno adapter                      | 10s (via `Effect.timeout()` in adapter) |

### When to increase timeout

Tests that need more time should pass an explicit `timeoutMs` option:

<!-- verify:ignore -->

```typescript
// Integration test that needs more time for LLM calls
test("AI action completes", () => Effect.gen(...), { timeoutMs: 45_000 });

// Layer-based test with LLM calls
it.effect("extracts data", () => Effect.gen(...), { timeoutMs: 45_000 });
```

Typical cases for increased timeouts:

- **LLM/stagehand tests**: 45s (internal `Effect.timeout("30 seconds")` + overhead)
- **Network intercept tests**: 20s (waiting for CDP events)
- **Provider tests**: 120s (real API calls to Steel, Browserbase, etc.)

### Deno-specific notes

Deno 2.8+ added a native `timeout` option to `Deno.test()`, but `@std/testing/bdd` does not yet pass it through to the underlying test runner. The Deno adapter enforces timeouts at the Effect level via `Effect.timeout()` + `Effect.orDie` instead. When `@std/testing` adds native timeout support, the adapter can be simplified to match the Vitest/Bun pattern.

```bash
# All unit tests
pnpm test:unit

# Specific test file
pnpm vitest tests/unit/providers/steel/SteelProvider.test.ts

# Watch mode
pnpm vitest --watch

# With coverage
pnpm vitest --coverage
```

## Checklist Before Submitting

- [ ] Uses mock layers (no real API calls in unit tests)
- [ ] Tests behavior, not Effect internals
- [ ] Has JSDoc header explaining test focus
- [ ] Organized into logical sections with comments
- [ ] One assertion per concept (split multi-concept tests)
- [ ] Uses `.test.ts` extension (except CF examples)
- [ ] Follows standard template format
- [ ] Error cases tested with custom mocks
- [ ] No redundant "service exists" or "has method" tests

## Advanced Patterns (Integration Tests)

Patterns that came up repeatedly during CDP parity work. None of these
are required for unit tests — they're for the integration test layer
(`tests/integration/shared/cdp/`) where you drive a real browser.

### Key Transformations (Playwright → Effect)

When porting an upstream Playwright test:

| Upstream Playwright        | This codebase                            |
| -------------------------- | ---------------------------------------- |
| `await page.action()`      | `yield* page.action()`                   |
| `Promise.all([a, b])`      | `Effect.all([a, b], { concurrency: 2 })` |
| `expect(x).toBe(y)`        | `yield* assertEqual(x, y)`               |
| `server.EMPTY_PAGE`        | `${httpUrl}/empty`                       |
| `request.headers` (method) | `request.headers` (property)             |
| `request.url` (method)     | `request.url` (property)                 |

### Event Streams (Acquire Before Trigger)

Event streams are `Effect.Effect<Stream.Stream<T>, never, Scope.Scope>`,
not `Stream.Stream<T>` directly. The `Effect` acquires the PubSub
subscription when yielded, so events fired between the call and the
first pull are not lost.

<!-- verify:ignore -->

```typescript
// Pattern 1: acquire → trigger → consume
const requests = yield* page.onRequest;   // eager subscription
yield* page.goto(url);                    // triggers network events
const req = yield* requests.pipe(Stream.take(1), Stream.runHead);

// Pattern 2: fork consumer, trigger action concurrently
const requestStream = yield* page.onRequest;
const collectorFiber = yield* Effect.forkChild(
  requestStream.pipe(Stream.tap(logRequest), Stream.runDrain),
);
yield* page.goto(url);
yield* Fiber.join(collectorFiber);
```

### Route + Deferred

To intercept a request that fires during navigation, race the navigation
fiber against a `Deferred` that the route handler resolves.

<!-- verify:ignore -->

```typescript
const routeDeferred = yield* Deferred.make<RouteHandle>();
yield* page.route("**/empty*", (route, request) =>
  Deferred.succeed(routeDeferred, route),
);
const navFiber = yield* Effect.forkChild(page.goto(`${httpUrl}/empty`));
const route = yield* Deferred.await(routeDeferred);
yield* route.continue();
yield* Fiber.join(navFiber);
```

### Server-Side Stalling (Child-Frame Tests)

Route interception doesn't work for child-frame sessions. To stall a
resource fetched by a child frame, use `TestServerClient.setHangRoute`
on the test HTTP server.

<!-- verify:ignore -->

```typescript
yield* TestServerClient.setHangRoute(httpUrl, "/one-style.css");
yield* frame.goto(`${httpUrl}/one-style`, { waitUntil: "domcontentloaded" });
// CSS is hanging — load won't fire
yield* TestServerClient.release(httpUrl, "/one-style.css");
// Now load fires
```

### Error Extraction from `Effect.Cause`

When asserting that a failing effect contains a specific message, walk
the cause rather than pattern-matching on a single error type.

<!-- verify:ignore -->

```typescript
const exit = yield* someEffect.pipe(Effect.exit);
if (Exit.isFailure(exit)) {
  const failure = Cause.findErrorOption(exit.cause);
  if (Option.isSome(failure)) {
    const error = failure.value as any;
    const description = error.reason?.description ?? "";
    yield* assertContains(description, "expected message");
  }
}
```

`CdpServiceError.reason` can be `NavigationError`, `EvaluationError`, or
other types. Test helpers like `getErrorMsg` must handle all reason
types — not just `EvaluationError` — otherwise the test checks
`reason._tag` (e.g. "NavigationError") which won't contain the expected
substring (e.g. "detached").

## Test Infrastructure Gotchas

These came up in integration tests, not unit tests. If you're writing
in `tests/integration/`, read these first.

### `assertEqual` vs `assertDeepEqual`

`assertEqual` uses `===` (reference equality) — always `false` for
distinct objects even with identical content. Use `assertDeepEqual`
(JSON.stringify comparison) when comparing parsed JSON, response
bodies, or any object value.

### Effect `Headers` is not a Web API `Headers`

Effect's `Headers` type has a custom prototype. When you need to
construct a Web API `Request` (e.g. for `page.request`), spread the
headers into a plain record (`{ ...request.headers }`) rather than
`new Headers(request.headers)`.

**Also strip `content-length` before passing headers to the WHATWG `Request` constructor.** Effect's `HttpClientRequest` computes and includes a `content-length` for body requests, but the fetch spec forbids manual `Content-Length` (it auto-computes from the body). Node 24's built-in undici 7.x silently accepts it, but `@effect/platform-node` (a transitive dep of any test that imports from it) loads undici 8.x as the global dispatcher, which strictly validates headers and throws `InvalidArgumentError: invalid content-length header`. See [cdp/navigation-concurrency.md](../cdp/navigation-concurrency.md) for the full footgun.

### `waitForRequest` captures stale pending requests

The test server's `notifyRequestArrived` stores every request's headers
in `pendingRequests` (including browser navigation requests via
`page.goto`). `waitForRequest(path)` returns **immediately** if
`hasPendingRequest(path)` is already true — it does not wait for a
_new_ request.

Consequence: if a test does `page.goto("/empty")` to establish a CDP
session and then `waitForRequest("/empty")` + `page.request.get("/empty")`,
the waiter resolves with the **browser's** navigation headers (default
`Accept` header) instead of the `page.request` request's custom headers.

Fix: use a **different path** for the request target than the navigation
path. Use `/simple.json` for GET targets or `setRespondRoute("/test", ...)`
for dynamic targets.

## References

- Mock layers: `tests/utils/mocks.ts`
- Example unit test: `tests/unit/providers/steel/SteelProvider.test.ts`
- **CDP navigation & concurrency**: [cdp/navigation-concurrency.md](../cdp/navigation-concurrency.md) — event consumption, fiber lifecycle, and navigation patterns
