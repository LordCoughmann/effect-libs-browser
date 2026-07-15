# Adding a Provider

Contributor guide: how to implement a custom `BrowserProvider` for a browser-vendorservice that isn't already supported (Browserbase, Steel, Cloudflare Browser Run, etc.).

## Interface

The core session interfaces live in `@effect-libs/browser`:

```typescript
// BrowserProviderSessionBase (from @effect-libs/browser):
//   readonly id: SessionId                       — branded session id
//   readonly createdAt: DateTime.DateTime        — Effect DateTime
//   readonly liveViewUrl?: UrlString             — optional live view URL
//
// BrowserProviderSession extends BrowserProviderSessionBase with:
//   cdpUrl: Redacted<UrlString>                  — the CDP WebSocket URL (redacted)
//
// BrowserProviderService<Session> requires:
//   createSession(): Effect.Effect<Session, BrowserProviderError>
//   releaseSession(id: string): Effect.Effect<void, BrowserProviderError>
//   getCdpUrl(id: string): Option<Redacted<UrlString>>
//     (Option.some(url) for CDP providers, Option.none() for binding providers)
```

For binding providers, return `Option.none()` from `getCdpUrl` — the session lifecycle is managed by the binding itself, not by a CDP URL. The `cdpUrl` field is also `Redacted` (from `Redacted.Redacted<UrlString>`) — call `Redacted.value(cdpUrl)` to unwrap it.

---

## Complete Example

<!-- verify:ignore -->

```typescript
import {
  BrowserProviderService,
  BrowserProviderSessionBase,
  BrowserProviderSession,
  BrowserProvider,
  BrowserProviderError,
} from "@effect-libs/browser";
import { Effect, Context, Layer, Option, Redacted } from "effect";

// 1. Define your session type (extends BrowserProviderSessionBase)
//    BrowserProviderSessionBase provides: id (SessionId),
//    createdAt (DateTime.DateTime), liveViewUrl? (UrlString).
interface MySession extends BrowserProviderSessionBase {
  // Add any provider-specific fields
  metadata?: { region: string };
}

// 2. Define the service interface
interface MyProviderService extends BrowserProviderService<MySession> {
  // Add any provider-specific methods here
  readonly use: <A>(fn: (client: unknown) => Promise<A>) => Effect.Effect<A, BrowserProviderError>;
}

// 3. Create the service class with Context.Service<Self, Shape>()(id)
export class MyProvider extends Context.Service<MyProvider, MyProviderService>()(
  "myapp/MyProvider",
) {
  /** Factory for creating mock implementations in tests */
  static readonly of = (impl: MyProviderService): MyProviderService => impl;

  /**
   * Layer factory that provides BOTH MyProvider AND BrowserProvider.
   * This allows code to depend on either the abstract BrowserProvider
   * or the concrete MyProvider.
   */
  static readonly layer = (config: {
    apiKey: string;
    region: string;
  }): Layer.Layer<MyProvider | BrowserProvider> =>
    Layer.effectContext(
      Effect.gen(function* () {
        // Create the provider implementation
        const provider: MyProviderService = {
          createSession: () =>
            Effect.gen(function* () {
              const response = yield* Effect.tryPromise({
                try: () =>
                  fetch("https://api.myprovider.com/sessions", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${config.apiKey}`,
                    },
                    body: JSON.stringify({ region: config.region }),
                  }).then((r) => r.json()),
                catch: (cause) =>
                  new BrowserProviderError({
                    reason: "Failed to create session",
                    cause,
                  }),
              });

              return {
                id: response.id,
                createdAt: response.createdAt,
                metadata: { region: config.region },
              } satisfies MySession;
            }),

          releaseSession: (sessionId) =>
            Effect.gen(function* () {
              yield* Effect.tryPromise({
                try: () =>
                  fetch(`https://api.myprovider.com/sessions/${sessionId}`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${config.apiKey}` },
                  }),
                catch: (cause) =>
                  new BrowserProviderError({
                    reason: "Failed to release session",
                    cause,
                  }),
              });
            }),

          // Return Option.some for CDP providers, Option.none for binding providers
          getCdpUrl: (sessionId) =>
            Option.some(Redacted.make(`wss://api.myprovider.com/sessions/${sessionId}/ws`)),

          // Provider-specific method
          use: (fn) =>
            Effect.tryPromise({
              try: () => fn({}), // Pass your API client here
              catch: (cause) =>
                new BrowserProviderError({
                  reason: "Provider operation failed",
                  cause,
                }),
            }),
        };

        // Provide both MyProvider and BrowserProvider
        return Context.make(MyProvider, provider).pipe(Context.add(BrowserProvider, provider));
      }),
    );
}

// 4. Use it
import { Playwright } from "@effect-libs/browser-playwright";

const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* MyProvider;

  const result = yield* playwright.withSession({ provider }, ({ page, session }) =>
    Effect.gen(function* () {
      // session includes cdpUrl (added by withSession)
      console.log(`Connected to ${session.cdpUrl}`);
      // session also has your custom fields
      console.log(`Using session from ${session.metadata?.region}`);

      yield* page.goto("https://example.com");
      return yield* page.title;
    }),
  );

  return result;
});

Effect.runPromise(
  program.pipe(
    Effect.provide(
      MyProvider.layer({ apiKey: Redacted.make("your-api-key"), region: "us-east-1" }),
    ),
    Effect.provide(Playwright.layer),
  ),
);
```

---

## Error Handling

Use `BrowserProviderError` directly with the `cause` pattern for wrapping external API errors:

<!-- verify:ignore -->

```typescript
import { BrowserProviderError } from "@effect-libs/browser";
import { Effect } from "effect";

// Use BrowserProviderError with cause for wrapping external errors
createSession: () =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch("https://api.myprovider.com/sessions", { method: "POST" }),
      catch: (cause) =>
        new BrowserProviderError({
          reason: "Failed to create session",
          cause,
        }),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new BrowserProviderError({
          reason: `API returned ${response.status}`,
        }),
      );
    }

    // ...
  });
```

The `BrowserProviderError` class already provides:

- `message` property that prefers cause message for debugging
- `isRetryable` property that detects retryable HTTP status codes (401, 403, 409, 429, 502, 503, 504)

---

## Using with CDP (experimental)

Custom providers work with both `@effect-libs/browser-playwright` and `@effect-libs/browser-cdp`. The shape is identical to the Complete Example above — just swap `Playwright` for `Cdp` (and use `Cdp.layer` instead of `Playwright.layer` in the `Effect.provide` chain). The provider interface is client-agnostic.

## Reference

- [`packages/browser/src/BrowserProvider.ts`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser/src/BrowserProvider.ts) — Core interface and error types
- [`packages/browser-providers/src/steel/SteelProvider.ts`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-providers/src/steel/SteelProvider.ts) — Full example implementation
- [`packages/browser-providers/src/browserbase/BrowserbaseProvider.ts`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-providers/src/browserbase/BrowserbaseProvider.ts) — Another example implementation

## Key Patterns

1. **Service Interface**: Define a separate interface extending `BrowserProviderService<T>`
2. **Service Class**: Use `Context.Service<Self, Shape>()(id)` with namespaced identifier
3. **Layer Factory**: Return `Layer.Layer<MyProvider | BrowserProvider>` to provide both services
4. **Layer.effectContext**: Use this to provide multiple services from one implementation
5. **Error Handling**: Use `BrowserProviderError` with `cause` for wrapping external errors

---

## See Also

- [FAQ](../faq.md) — Package selection, custom CDP URLs, using without Effect
- [Cloudflare Workers Guide](../guides/cloudflare-workers.md) — Setup for Cloudflare Workers
- [Fork README](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/cloudflare-playwright/README.md) — why `@effect-libs/cloudflare-playwright` exists and what it patches
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-providers/src) — full API in JSDoc (use `SteelProvider`, `BrowserbaseProvider`, or `CfBrowserRunProvider` as implementation references)
