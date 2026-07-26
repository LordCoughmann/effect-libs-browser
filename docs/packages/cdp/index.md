# `browser-cdp`

> **Experimental.** API surface stable; awaiting human review. **Prefer [`browser-playwright`](./../playwright/index.md) for production use.** See [AI / LLM usage disclosure](#ai--llm-usage-disclosure) below.

A zero-dependency, native-WebSocket `@effect-libs/browser-cdp` client with a Playwright-compatible API. Lighter than `browser-playwright` — no `ws` package, no Playwright runtime, no `nodejs_compat` required.

## Install

```bash
pnpm add @effect-libs/browser-cdp effect@beta
```

`effect` is a peer dependency — `effect@beta` installs the latest v4 beta. No additional runtime dependencies required.

## Resource acquisition

Follows the standard 4-level hierarchy — `Session` → `Connection` → `Context` → `Page` — documented in [Concepts](../../concepts/resources.md).

| Form                | Lifetime                                              |
| ------------------- | ----------------------------------------------------- |
| `withX(source, fn)` | scope = the callback (default — used 90% of the time) |
| `acquireX(source)`  | you own the scope (pools, durable objects, fan-out)   |

See [Managing Resources](../../concepts/resources.md) for pooling patterns and the session/connection/context/page tradeoffs.

## Capabilities

| Area                                                                      | Status | Reference                                                                                        |
| ------------------------------------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------ |
| Navigation (goto, reload, setContent, history)                            |   ✅   | [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) |
| Locator API (locator, getByRole, getByText, ...)                          |   ✅   | [browser-cdp — Locators](./locators.md)                                                          |
| Network interception (route, unroute, routeWebSocket)                     |   ✅   | [browser-cdp — Network](./network.md)                                                            |
| Context API (cookies, setUserAgent, setGeolocation, storage, permissions) |   ✅   | [browser-cdp — Context API](./context.md)                                                        |
| Event streams (onConsole, onRequest, onResponse, onPageError, ...)        |   ✅   | [browser-cdp — Event Streams](./streams.md)                                                      |
| Frames (page.frames, page.frame, page.frameLocator)                       |   ✅   | [browser-cdp — Frames](./frames.md)                                                              |
| HTTP helpers (page.fetch, page.httpClient)                                |   ✅   | [browser-cdp — Network](./network.md#pagefetch--pagehttpclient--pagerequest)                                      |
| Mouse / keyboard                                                          |   ✅   | [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) |
| Touchscreen (`page.touchscreen.tap(x, y)` — coordinate-direct, stateless) |   ✅   | [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) |
| Screenshots / PDF                                                         |   ✅   | [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) |
| Typed errors                                                              |   ✅   | [browser-cdp — Errors](./errors.md)                                                              |
| Video / trace                                                             |   ❌   | not planned                                                                                      |

For `page.evaluate` / `page.evaluateHandle` and the no-imports payload constraint, see [browser-cdp — Evaluate](./evaluate.md). For the `CdpHandle` discriminated union, see [browser-cdp — Handles](./handles.md).

For operations not in the convenience API, use `page.use((cdp, sessionId) => ...)` to run raw Chrome DevTools Protocol commands.

## Errors

Every Effect can fail with `CdpError`, a single parent error with a `reason` union of 14 typed classes covering connection, navigation, page operations, evaluation, selector, screenshot, cookies, storage, PDF, fetch, viewport, content-unavailable, and context-not-supported failures. Match with `Effect.catchTag("effect-libs/browser/CdpError", ...)`. Full hierarchy and `isRetryable` semantics: [browser-cdp — Errors](./errors.md).

## Configuration

`@effect-libs/browser-cdp` reads connection defaults from environment variables (via `CdpConfig`):

| Env var                  | Default                   | Purpose                                                                  |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------ |
| `CDP_ENDPOINT`           | `wss://connect.steel.dev` | Default endpoint for `CdpConnection.make(cdpUrl)` when none is supplied. |
| `CDP_COMMAND_TIMEOUT_MS` | `30000`                   | Timeout for a single CDP command (request → response).                   |
| `CDP_CONNECT_TIMEOUT_MS` | `20000`                   | Timeout for the initial WebSocket connection to open.                    |
| `CDP_EVENT_BUFFER_SIZE`  | `256`                     | Capacity of the internal event `PubSub` (per page).                      |
| `CDP_DEBUG`              | `false`                   | When `true`, log every inbound/outbound CDP message at debug level.      |

The endpoint is a `ws://` or `wss://` URL — the Chrome DevTools Protocol transport is WebSocket-based; you cannot connect via plain HTTP. Per-call URLs passed to `Cdp.withConnection({ url })` / `Cdp.acquireConnection({ url })` override the env default for that call.

## Compatibility

| Browser                                         | Support                                                 |
| ----------------------------------------------- | ------------------------------------------------------- |
| Any CDP-compatible (Chrome, Edge, Brave, Opera) | ✅                                                      |
| Firefox                                         | ❌ (Firefox uses Juggler, not CDP)                      |
| WebKit                                          | ❌ (WebKit uses the WebKit Inspector protocol, not CDP) |

| Runtime                       | Status | Notes                                                               |
| ----------------------------- | ------ | ------------------------------------------------------------------- |
| Cloudflare Workers            | ✅     | no `nodejs_compat` needed                                           |
| Vercel Edge / Fastly / Akamai | 🟡     | untested but expected to work (any runtime with native `WebSocket`) |
| Node.js / Deno / Bun          | 🟠     | works — but upstream Playwright is the better default             |

For per-client runtime details, see [Runtime & Browser Support](../../reference/runtime-and-browser-support.md).

## When to use

**Use this package when:**

- You need a zero-dependency client (no `nodejs_compat` required)
- You're on a runtime without Node.js compat
- You need raw Chrome DevTools Protocol access alongside a Playwright-style API (the same shape as upstream Playwright)

**Use [`@effect-libs/browser-playwright`](./../playwright/index.md) instead when:**

- You want the full, stable upstream Playwright API on edge runtimes
- You want a stable, human-reviewed implementation on a published dependency graph

**Use a different CDP client when:**

- You're on Node.js and only need a thin wire client — [chrome-remote-interface](https://github.com/cyrus-and/chrome-remote-interface)

For the design rationale behind `@effect-libs/browser-cdp`'s deviations from upstream Playwright (Effect-idiomatic shapes, scraping-vs-testing scope, additions), see [`browser-cdp` — Feature Parity](../../reference/cdp-feature-parity.md). For a side-by-side with other CDP clients, see [browser-cdp — Comparison & Alternatives](./comparison.md).

## See also

- [`@effect-libs/browser-playwright`](./../playwright/index.md) — the full-API sibling on edge runtimes
- [`browser-stagehand`](./../stagehand/index.md) — AI-powered browser automation on top of upstream `Playwright`
- [`browser-cdp` — Feature Parity with Upstream Playwright](../../reference/cdp-feature-parity.md) — `browser-cdp`'s deviations from upstream Playwright
- [Migrating from upstream Playwright](../../migrations/from-playwright.md) — coming from vanilla upstream Playwright
- [Concepts](../../overview.md) — Client & Provider, scoped resources, errors
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src) — full API in JSDoc

## AI / LLM usage disclosure

While the [client and provider abstractions](../../overview.md) is designed and coded by the maintainer, the `@effect-libs/browser-cdp` internals (i.e. [`packages/browser-cdp/src/internal/`](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src/internal)) is coded by frontier LLMs and the maintainer has not conducted a line-by-line review of the generated code.

Nonetheless, the maintainer maintains the following practices to ensure code quality:

- **Test-driven development (TDD).** All integration tests (over 1,000) are ported directly from upstream Playwright specs and run against live Chrome in each supported runtime. Each `@effect-libs/browser-cdp` internals implementation is driven from a failing test — features ship only when the corresponding upstream test passes. While this does not ensure 100% feature parity with Playwright, this TDD approach ensures CDP implementation is not just some AI slop. See [Parity Coverage](../../contributing/cdp/upstream-integration-test-coverage.md) for the full methodology and caveats.
- **Human-in-the-loop.** Each LLM coding session is steered by the maintainer to ensure the LLMs dont hallucinate into a vicious loop. The LLM acts as a pair-programming partner under direct supervision rather than an "autonomous" code generator.
