# Test Doc Examples

This file tests all verification modes for the doc example verifier.

**Reading the markers** — at-a-glance signals on each case below:

- ✅ — canonical / passes cleanly with no special directives
- ⚠️ — requires a special directive (`verify:stubs`, auto-wrap) to pass
- 🛑 — malformed (top-level `yield *`, undefined symbols); passes only because of a directive

> ⚠️ `yield*` outside a generator function is invalid syntax. `oxfmt` rewrites it as `yield *` to flag the problem; the verifier normalises back to `yield*` and wraps the body in `Effect.gen(function* () { ... })`.

## ✅ Case 1: Default mode with Effect.gen (already complete program)

This block has `Effect.gen` already, so the verifier should NOT add a wrapper. No stubs needed — all imports are real.

```typescript
import { Cdp } from "@effect-libs/browser-cdp";
import { BrowserProvider } from "@effect-libs/browser";
import { Effect } from "effect";

const scrapeProduct = (url: string) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    const provider = yield* BrowserProvider;

    return yield* cdp.withSession({ provider }, ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto(url);
        return yield* page.title;
      }),
    );
  });
```

## 🛑 Case 2: Malformed — top-level `yield *` with no `Effect.gen`

The body has `yield *` (with a space) at module top level. The verifier normalises the spacing and wraps the body in `Effect.gen`.

```typescript
import { Cdp } from "@effect-libs/browser-cdp";
import { BrowserProvider } from "@effect-libs/browser";
import { Effect } from "effect";

// Top-level `yield *` (with a space) is malformed — there is no enclosing generator.
const cdp = yield * Cdp;
const provider = yield * BrowserProvider;
const title =
  yield *
  cdp.withSession({ provider }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      return yield* page.title;
    }),
  );
```

✅ Correct form — same logic written inside `Effect.gen`:

```typescript
import { Cdp } from "@effect-libs/browser-cdp";
import { BrowserProvider } from "@effect-libs/browser";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  const provider = yield* BrowserProvider;

  return yield* cdp.withSession({ provider }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      return yield* page.title;
    }),
  );
});
```

## ⚠️ Case 3: Stubs mode with fictional code (extractData)

This block uses `extractData()` which is a fictional function. Without `<!-- verify:stubs -->`, it would fail. The directive tells the verifier to prepend stub declarations.

<!-- verify:stubs -->

```typescript
import { Cdp } from "@effect-libs/browser-cdp";
import { BrowserProvider } from "@effect-libs/browser";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  const provider = yield* BrowserProvider;

  return yield* cdp.withSession({ provider }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      return yield* page.evaluate(() => extractData());
    }),
  );
});
```

## ⚠️ Case 4: Stubs mode using env stub

This block uses the `env` stub for Cloudflare Workers environment bindings. Without `<!-- verify:stubs -->`, `env` would be undefined and fail verification.

> ⚠️ The runtime expects `cdp.withConnection({ url }, ...)` — an object, not a bare string. The example below matches that shape.

<!-- verify:stubs -->

```typescript
import { Cdp } from "@effect-libs/browser-cdp";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;

  if (env.CDP_URL) {
    return yield* cdp.withConnection({ url: env.CDP_URL }, ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto("https://example.com");
        return yield* page.content;
      }),
    );
  }
});
```

## ✅ Case 5: Raw mode (no stubs, no wrapping)

Compile exactly as written — no modifications at all.

<!-- verify:raw -->

```typescript
import { Effect } from "effect";

const hello = Effect.succeed("world");
```

## 🛑 Case 6: Ignored block — undefined symbol relies on `verify:ignore`

Pseudo-code that the verifier must skip. Without `<!-- verify:ignore -->`, `someUndefinedFunction` is undefined and fails typechecking.

<!-- verify:ignore -->

```typescript
// Pseudo-code: author is asserting "trust me". Verifier does NOT add stubs to ignored blocks.
const result = someUndefinedFunction();
```

✅ Alternative — declare the symbol via stubs so the block actually type-checks:

<!-- verify:stubs:declare function someUndefinedFunction(): string; -->

```typescript
const result = someUndefinedFunction();
```

## ✅ Case 7: Provider-specific imports (Steel)

No stubs needed — all imports are from real packages.

```typescript
import { Cdp } from "@effect-libs/browser-cdp";
import { SteelProvider } from "@effect-libs/browser-providers/steel";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  const provider = yield* SteelProvider;

  return yield* cdp.withSession({ provider }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      return yield* page.title;
    }),
  );
});
```

## ✅ Case 8: Provider-specific imports (CF Browser Run)

No stubs needed — all imports are from real packages. Uses `Option.match` (v4 API) instead of `Option.unwrap`.

```typescript
import { Cdp } from "@effect-libs/browser-cdp";
import { CfBrowserRunProvider } from "@effect-libs/browser-providers/cf-browser-run";
import { Effect, Option } from "effect";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  const provider = yield* CfBrowserRunProvider;

  return yield* cdp.withSession({ provider }, ({ page, session }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      // In real code you'd use Option.match to handle the endpoint:
      //   const cdpUrl = yield* Option.match(provider.getWebSocketEndpoint(session.id), { ... })
      return yield* page.title;
    }),
  );
});
```

## ✅ Case 9: Provider-specific imports (Browserbase)

No stubs needed — all imports are from real packages.

```typescript
import { Cdp } from "@effect-libs/browser-cdp";
import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  const provider = yield* BrowserbaseProvider;

  return yield* cdp.withSession({ provider }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      return yield* page.title;
    }),
  );
});
```

## ✅ Case 10: browser-playwright

No stubs needed — all imports are from real packages.

```typescript
import { Playwright } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* SteelProvider;

  return yield* playwright.withSession({ provider }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      return yield* page.content;
    }),
  );
});
```

## 🛑 Case 11: Ignored block — `verify:ignore` is not silently inferred

Same body as Case 6, repeated in a different section. Verifies that the verifier does not silently add stubs or infer `verify:ignore` across files — each `<!-- verify:ignore -->` directive must be authored explicitly.

<!-- verify:ignore -->

```typescript
const result = someUndefinedFunction();
```

✅ Correct form — declare the symbol via custom stubs so the block actually type-checks:

<!-- verify:stubs:declare function someUndefinedFunction(): string; -->

```typescript
const result = someUndefinedFunction();
```

## 🛑 Case 12: Malformed — top-level `yield *` plus two fictional symbols

The malformed input has three problems: top-level `yield *` (malformed), a fictional `inputs.superpower`, AND a fictional `page`. It is skipped with `<!-- verify:ignore -->` so the verifier does not try to typecheck it; only the corrected form below is typechecked.

<!-- verify:ignore -->

```typescript
yield * page.locator(`[data-value="${inputs.superpower}"]`).click();
```

✅ Correct form — real imports, real session, `inputs` passed as a parameter, body wrapped in `Effect.gen`. No verifier magic needed.

```typescript
import { Cdp } from "@effect-libs/browser-cdp";
import { BrowserProvider } from "@effect-libs/browser";
import { Effect } from "effect";

const clickSuperpower = (input: { superpower: string }) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    const provider = yield* BrowserProvider;

    return yield* cdp.withSession({ provider }, ({ page }) =>
      Effect.gen(function* () {
        yield* page.locator(`[data-value="${input.superpower}"]`).click();
        return yield* page.title;
      }),
    );
  });
```
