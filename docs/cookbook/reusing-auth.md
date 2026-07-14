# Reusing Auth

Two patterns for keeping login state alive across sessions: capture-and-restore the browser context, or attach a persistent provider context. Pick one based on which provider you use.

## Reuse auth across sessions

Log in once, capture the browser context, and restore it in future sessions. Avoids re-authenticating on every scrape.

<!-- verify:stubs -->

```typescript
import { Effect, Layer, Redacted } from "effect";

import { Playwright, type PlaywrightPage } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

const login = (page: PlaywrightPage) =>
  Effect.gen(function* () {
    yield* page.goto("https://saas.example.com/login");
    yield* page.fill('input[name="username"]', "user@example.com");
    yield* page.fill('input[name="password"]', "hunter2");
    yield* page.click('button[type="submit"]');
    yield* page.waitForSelector(".dashboard");
  });

const reuseAuth = (apiKey: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;
    const provider = yield* SteelProvider;

    // Step 1: Login and capture the session context
    const sessionContext = yield* playwright.withSession({ provider }, ({ page, session }) =>
      Effect.gen(function* () {
        yield* login(page);
        // Capture context BEFORE the session ends — it must be live
        return yield* provider.use((client) => client.sessions.context(session.id));
      }),
    );
    // Session #1 released automatically

    // Step 2: New session with the captured context — already logged in
    return yield* playwright.withSession({ provider, options: { sessionContext } }, ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto("https://saas.example.com/dashboard");
        return yield* page.title;
      }),
    );
    // Session #2 released automatically
  }).pipe(
    Effect.provide(
      Layer.merge(Playwright.layer, SteelProvider.layer({ apiKey: Redacted.make(apiKey) })),
    ),
  );
```

The context capture call (`provider.use(client => client.sessions.context(...))`) must happen inside `withSession` while the session is live. The context is serializable — store it in KV or a database for even longer-lived reuse.

> **See also:** [Concepts → Managing Resources → Persisting auth](../concepts/resources.md#persisting-auth-across-sessions), [Steel provider](../providers/steel.md)

---

## Persistent contexts (Browserbase)

Browserbase Contexts persist cookies, localStorage, and IndexedDB across sessions. Create a context once, attach it to every session — the browser state survives.

<!-- verify:stubs -->

```typescript
import { Effect, Layer, Redacted } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";

const usePersistentContext = (apiKey: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;
    const provider = yield* BrowserbaseProvider;

    // Create a persistent context once (store the ID in KV for long-lived reuse)
    const context = yield* provider.use((client) => client.contexts.create());

    // Session 1: Login with the context attached
    yield* playwright.withSession(
      { provider, options: { browserSettings: { context: { id: context.id, persist: true } } } },
      ({ page }) =>
        Effect.gen(function* () {
          yield* page.goto("https://saas.example.com/login");
          yield* page.fill("#email", "user@example.com");
          yield* page.fill("#password", "hunter2");
          yield* page.click("#submit");
          yield* page.waitForSelector(".dashboard");
        }),
    );

    // Session 2: Same context — login state persisted
    return yield* playwright.withSession(
      { provider, options: { browserSettings: { context: { id: context.id, persist: true } } } },
      ({ page }) =>
        Effect.gen(function* () {
          yield* page.goto("https://saas.example.com/dashboard");
          return yield* page.title;
        }),
    );
  }).pipe(
    Effect.provide(
      Layer.merge(Playwright.layer, BrowserbaseProvider.layer({ apiKey: Redacted.make(apiKey) })),
    ),
  );
```

> **See also:** [Browserbase provider](../providers/browserbase.md)

## See also

- [Managing sessions](./managing-sessions.md) — opening and connecting to sessions
- [Concepts → Managing Resources → Persisting auth](../concepts/resources.md#persisting-auth-across-sessions) — the broader auth-persistence model
