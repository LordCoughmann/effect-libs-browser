# Runtime & Browser Support

Compatibility matrix for the `browser-*` packages.

## `browser-playwright`

### Edge runtimes (primary focus)

| Runtime            | Status    | Notes                    |
| ------------------ | --------- | ------------------------ |
| Cloudflare Workers | ✅ Tested | Requires `nodejs_compat` |

> `browser-playwright` (`@effect-libs/browser-playwright`) depends on `@effect-libs/cloudflare-playwright` (our
> fork of `@cloudflare/playwright@1.3.0`). It requires `node:async_hooks`
> and importable stubs for several Node.js builtins (`node:fs`, `node:crypto`,
> etc.). Cloudflare Workers provides these via `nodejs_compat`. Other edge
> runtimes without Node.js compat (Fastly, Akamai, etc.) are not supported
> — use `browser-cdp` instead.

### Standard runtimes (use upstream Playwright instead)

| Runtime | Status                       | Notes                                          |
| ------- | ---------------------------- | ---------------------------------------------- |
| Node.js | ✅ Tested                    | Full Node.js support — use upstream Playwright |
| Deno    | ⚠️ Works but not recommended | Full Node.js compat — use upstream Playwright  |
| Bun     | ⚠️ Works but not recommended | Full Node.js compat — use upstream Playwright  |

| Browser | Support |
| ------- | ------- |
| Chrome  | ✅ Only |
| Firefox | ❌      |
| WebKit  | ❌      |

**Limitations:**

- `browserType.launch()` throws — use `connectOverCDP()`
- Firefox and WebKit not supported
- Android and Electron not supported
- See [cloudflare/playwright](https://github.com/cloudflare/playwright) for full list

## `browser-stagehand`

### Edge runtimes (primary focus)

| Runtime            | Status    | Notes                           |
| ------------------ | --------- | ------------------------------- |
| Cloudflare Workers | ✅ Tested | Polyfills applied automatically |

> Other edge runtimes are not tested. `browser-stagehand` depends on runtime-specific
> polyfills. Use `browser-cdp` or `browser-playwright` instead.

### Standard runtimes (use upstream `@browserbasehq/stagehand` instead)

| Runtime | Status                       | Notes                                                         |
| ------- | ---------------------------- | ------------------------------------------------------------- |
| Node.js | ✅ Tested                    | Works natively — use upstream `@browserbasehq/stagehand`      |
| Deno    | ⚠️ Works but not recommended | Full Node.js compat — use upstream `@browserbasehq/stagehand` |
| Bun     | ⚠️ Works but not recommended | Full Node.js compat — use upstream `@browserbasehq/stagehand` |

| Browser | Support |
| ------- | ------- |
| Chrome  | ✅ Only |

**Polyfills provided:**

- `ws` → native WebSocket (add alias in wrangler)
- `AsyncLocalStorage.enterWith()` → patched for Workers

## `browser-cdp`

> **Experimental.** Prefer `browser-playwright` unless you specifically need a zero-dependency, no-`nodejs_compat` client. See [`browser-cdp`](../packages/cdp/index.md) for status details and the AI/LLM usage disclosure.

### Edge runtimes (primary focus)

| Runtime            | Status    | Notes                      |
| ------------------ | --------- | -------------------------- |
| Cloudflare Workers | ✅ Tested | Works with `nodejs_compat` |

> **Other edge runtimes** (Fastly, Akamai, Gcore, etc.) — `browser-cdp` has zero
> runtime dependencies beyond native `WebSocket` and should work on any
> [WinterCG](https://wintercg.org)-compliant runtime. Not yet tested.

### Standard runtimes (compatibility)

| Runtime | Status    | Notes                       |
| ------- | --------- | --------------------------- |
| Node.js | ✅ Tested | —                           |
| Deno    | ✅ Tested | Only needs native WebSocket |
| Bun     | ✅ Tested | Only needs native WebSocket |

### Any runtime with WebSocket

🚧 Should work — zero runtime dependencies beyond native WebSocket.

| Browser            | Support                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| Any CDP-compatible | ✅ (Chrome, Edge, Brave, Opera, and other Chromium-based browsers)               |
| Firefox            | ❌ (Firefox remote debugging uses Juggler, not Chrome DevTools Protocol)         |
| Safari / WebKit    | ❌ (WebKit remote debugging uses WebKit Inspector, not Chrome DevTools Protocol) |

## Vercel Edge Functions

Vercel [recommends using the Node.js runtime](https://vercel.com/docs/functions/runtimes/edge) over Edge Runtime for improved performance and reliability. On Vercel, use `runtime = 'nodejs'` (the default) — all packages work with full Node.js support.

## Legend

| Symbol | Meaning                                          |
| ------ | ------------------------------------------------ |
| ✅     | Tested and working                               |
| 🚧     | Should work but not tested                       |
| ⚠️     | Needs additional setup (polyfills, compat flags) |
| ❌     | Not supported                                    |

## Testing Your Runtime

For runtimes marked 🚧 or ⚠️, test with a simple script:

```typescript
import { Effect } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

const result = await Effect.runPromise(
  Effect.gen(function* () {
    const playwright = yield* Playwright;
    return yield* playwright.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto("https://example.com");
        return yield* page.title;
      }),
    );
  }).pipe(Effect.provide(Playwright.layer)),
);

console.log(result);
```

If this works, the package is compatible with your runtime.

## See Also

- [`browser-playwright`](../packages/playwright/index.md)
- [`browser-stagehand`](../packages/stagehand/index.md)
- [`browser-cdp`](../packages/cdp/index.md)
- [Cloudflare Workers Guide](../guides/cloudflare-workers.md)
