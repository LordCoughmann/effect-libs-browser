# browser-cdp — Evaluate

`@effect-libs/browser-cdp` exposes five evaluate entry points. They all share one
underlying pipeline (`evaluatePage` / `evaluateHandlePage`) and one
hard constraint on what you can put in the payload.

## Entry points

| Method                             | Returns                       | Use when                                                                                                                                                      |
| ---------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.evaluate(fn, arg?)`          | `Effect<T, CdpError>`         | You want a serialized result. The browser returns JSON; you receive `T`.                                                                                      |
| `page.evaluateHandle(fn, arg?)`    | `Effect<CdpHandle, CdpError>` | You want to **pass the result** to another evaluate (DOM element, function, class instance).                                                                  |
| `page.$eval(selector, fn, arg?)`   | `Effect<T, CdpError>`         | You have a CSS selector and want to run `fn` on the first match. Auto-waits for the element.                                                                  |
| `page.$$eval(selector, fn, arg?)`  | `Effect<T, CdpError>`         | Same as `$eval` but receives an **array** of all matching elements. Does not auto-wait (returns `[]` for no match).                                           |
| `Locator.evaluate(fn, arg?)`       | `Effect<T, CdpError>`         | Same as `page.$eval`, but scoped to a previously-built locator (auto-waits; resolves the indexed element when the locator is `.nth(i)` / `.first` / `.last`). |
| `Locator.evaluateAll(fn, arg?)`    | `Effect<T, CdpError>`         | Same as `page.$$eval`, but scoped to a locator. Receives **all** matching elements regardless of indexing.                                                    |
| `Locator.evaluateHandle(fn, arg?)` | `Effect<CdpHandle, CdpError>` | Same as `page.evaluateHandle`, but receives the resolved element as its first argument.                                                                       |

For `$eval` / `$$eval`, the page-level methods delegate to locator-level
calls internally — they're convenient shortcuts. The Locator form is
preferred when you already have a locator built (e.g. from
`page.getByRole`).

## The hard constraint: no imports inside the payload

The function you pass to `page.evaluate(fn)` is serialized with
`Function.prototype.toString()` and shipped to the browser. **Imports
referenced inside the function body don't roundtrip cleanly** — they
break at runtime in some environments.

Inside the payload, use native JavaScript primitives instead of imported
helpers:

| Don't write               | Write instead                     |
| ------------------------- | --------------------------------- |
| `Predicate.isString(x)`   | `typeof x === "string"`           |
| `Predicate.isArray(x)`    | `Array.isArray(x)`                |
| `Predicate.isDate(x)`     | `x instanceof Date`               |
| `Predicate.isNullable(x)` | `x === null \|\| x === undefined` |

The constraint applies to **all** imports — `effect`, `devtools-protocol`,
`@effect-libs/browser`, and any third-party library. The function body
must be self-contained JS, with closures over values passed as arguments
rather than direct references to module-scoped identifiers.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import type { CdpPageService } from "@effect-libs/browser-cdp";

import { Effect, Predicate } from "effect";

const example = (page: CdpPageService) =>
  Effect.gen(function* () {
    // ❌ Breaks on some runtimes — Predicate is an import
    yield* page.evaluate(() => Predicate.isString(window.location.href));

    // ✅ Works everywhere — typeof is a JS operator
    yield* page.evaluate(() => typeof window.location.href === "string");
  });
```

Values captured by the surrounding `Effect.gen` are fine — those are
passed as **arguments** through the Chrome DevTools Protocol `arguments` payload, not
referenced inside the arrow body.

For the runtime-specific rationale and the regression history, see
[`docs/contributing/cdp/decisions/0006-ssr-import-constraint.md`](../../contributing/cdp/decisions/0006-ssr-import-constraint.md).

## Return-type behavior

`page.evaluate(fn)` returns the function's return value, serialized back
to Node. Three things to know:

1. **Plain JSON-serializable values** (objects, arrays, strings, numbers,
   booleans, `null`) roundtrip exactly. Round-trip is symmetric for these.
2. **Non-JSON values** (Date, RegExp, Map, Set, Error, typed arrays,
   bigints, functions, circular refs) roundtrip via the utility-script
   serializer — see [`handles.md`](./handles.md) for the full surface.
   Use `page.evaluateHandle(fn)` when you need to **pass** such a value
   back into another evaluate without round-tripping through JSON.
3. **DOM elements** cannot be serialized — use `page.evaluateHandle(fn)`
   to get a `CdpHandle` reference, then pass that handle to a subsequent
   evaluate.

## `evaluateHandle` and handles

`page.evaluateHandle(fn)` returns a `CdpHandle` — a discriminated union
of `CdpObjectHandle` (real Chrome DevTools Protocol `objectId`) and `CdpPrimitiveHandle`
(synthetic, for primitive results). Use it when:

- The result is a DOM element you want to act on later.
- The result is a function you want to call later.
- The result is an object that should not round-trip through JSON.

The full handle API (`jsonValue`, `getProperty`, `getProperties`,
`asElement`, `evaluate`, `evaluateHandle`, `dispose`) is documented in
[`handles.md`](./handles.md).

## Examples

### Basic `page.evaluate`

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      // Return a serialized value
      const title = yield* page.evaluate(() => document.title);

      // Pass arguments through the closure
      const sum = yield* page.evaluate((args: { a: number; b: number }) => args.a + args.b, {
        a: 2,
        b: 3,
      });

      return { title, sum };
    }),
  );
});
```

### `page.$eval` and `page.$$eval`

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      // First match — auto-waits for the element to appear
      const firstHref = yield* page.$eval(
        "a.nav-link",
        (el: Element) => (el as HTMLAnchorElement).href,
      );

      // All matches — no auto-wait, returns [] for no match
      const allHrefs = yield* page.$$eval("a.nav-link", (els: ReadonlyArray<Element>) =>
        els.map((el) => (el as HTMLAnchorElement).href),
      );

      return { firstHref, allHrefs };
    }),
  );
});
```

### `Locator.evaluate` with a built locator

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com/login");

      // Locator.evaluate receives the resolved element as first arg
      const email = yield* page
        .getByLabel("Email address")
        .evaluate((el: Element) => (el as HTMLInputElement).value);

      return email;
    }),
  );
});
```

### `page.evaluateHandle` for DOM elements

```typescript
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  return yield* cdp.withConnection({ url: "ws://localhost:9222" }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");

      // Get a handle to document.body
      const body = yield* page.evaluateHandle(() => document.body);

      // Pass the handle to another evaluate — no JSON roundtrip
      const childCount = yield* page.evaluate((el: Element) => el.children.length, body);

      // Release the remote object
      yield* body.dispose();

      return childCount;
    }),
  );
});
```

### Strings as expressions

You can pass a string expression instead of a function — useful for one-liners:

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import type { CdpPageService } from "@effect-libs/browser-cdp";

import { Effect } from "effect";

const example = (page: CdpPageService) =>
  Effect.gen(function* () {
    yield* page.evaluate("document.title");
    yield* page.evaluate("location.href");
    yield* page.evaluate("Array.from(document.querySelectorAll('a')).length");
  });
```

The expression is `eval`'d in the page context. The same no-imports
constraint applies — string expressions don't have an import surface
to begin with, so they're always safe.

## Errors

`evaluate` fails with `CdpError` reason `EvaluationError` when:

- The function throws in the browser (the error is serialized back, preserving the message).
- The function returns a value that can't be serialized (rare — Date, Map, Set, etc. all serialize fine).
- The browser-side execution context is destroyed mid-evaluation (e.g. the page navigated away).

`evaluateHandle` fails with the same reason for the same conditions.
See [`errors.md`](./errors.md) for the full error taxonomy.

## See also

- [`handles.md`](./handles.md) — the `CdpHandle` discriminated union reference.
- [`locators.md`](./locators.md) — the full Locator API (`evaluate`, `evaluateAll`, `evaluateHandle` on locators).
- [`errors.md`](./errors.md) — error taxonomy and matching patterns.
- [ADR-0006: SSR import constraint](../../contributing/cdp/decisions/0006-ssr-import-constraint.md) — runtime-specific rationale for the no-imports payload constraint.
- [ADR-0004: `Runtime.callFunctionOn` migration](../../contributing/cdp/decisions/0004-callFunctionOn-migration.md) — how payloads reach the browser via the utility script.
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src) — full API in JSDoc
