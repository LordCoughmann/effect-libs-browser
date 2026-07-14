# Frequently Asked Questions (FAQ)

Short answers to questions we see often. Each entry links out to the
canonical doc for the full story.

## Can I use this library without Effect?

No — the public API is Effect. But you don't need to learn the full Effect ecosystem. `Effect.gen` + `yield*` replaces `async`/`await`, and `Effect.runPromise` is your entry point. If you compose with Effect services and Layers, you get the benefits for free; if not, treat the API as an `async`-shaped interface.

If you want the patched `@cloudflare/playwright` without the Effect layer, install the fork directly: `pnpm add @effect-libs/cloudflare-playwright`. The patches are baked in. See the fork's [`README.md`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/cloudflare-playwright/README.md) for what changes.

## How do I connect to a custom Chrome DevTools Protocol URL?

Pass `{ url: "ws://..." }` to `withConnection`. No provider needed:

<!-- verify:ignore -->

```typescript
yield* playwright.withConnection({ url: "ws://localhost:9222" }, ({ page }) => ...);
```

Works with Steel, Browserbase, local Chrome, or any browser that supports Chrome DevTools Protocol. See [Choosing a client →](./concepts/client-and-provider.md#choosing-a-client) for the broader picture.

## How do I create a custom provider?

Implement `BrowserProviderService`. The full template is in [Adding a Provider](./providers/adding-a-provider.md).

## Why no Firefox or WebKit support?

None of the three packages target those browsers' protocols. `browser-playwright` and `browser-stagehand` inherit Chromium-only from their upstream packages (`@cloudflare/playwright` and `@browserbasehq/stagehand` v3); `browser-cdp` exposes Chrome DevTools Protocol primitives directly, which Firefox and WebKit don't implement.

For Firefox or WebKit, use the original [`playwright`](https://playwright.dev) package on Node, Bun, or Deno.

## What's the error-handling API?

Every operation can fail with `PlaywrightError` (or `CdpError`, `StagehandError`). The error has a `reason` union of typed reason classes — match them with `Effect.catchTag` and the compiler checks exhaustiveness. See [Concepts → Errors are typed](./concepts/errors.md) for the full pattern.

## Why Effect?

See [Why Effect?](./concepts/effect.md) for the full case (scoped cleanup, typed errors, retries, composition). The short version: every `withSession` / `withConnection` guarantees cleanup on success, error, or fiber interruption (timeout, cancellation), and the program is a normal `Effect` so retries, timeouts, and tracing are free.

## Where can I find copy-paste recipes?

See the [Cookbook](./cookbook/managing-sessions.md) for runnable recipes covering session management, retries and timeouts, auth reuse, page interactions, and provider swapping. Error handling is covered in [Concepts → Errors are typed](./concepts/errors.md).
