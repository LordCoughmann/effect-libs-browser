# browser-cdp — Handles

`CdpHandle` is `@effect-libs/browser-cdp`'s remote-object reference type — the
analogue of upstream Playwright's `JSHandle`. You get one from `page.evaluateHandle(fn)`,
`Locator.evaluateHandle(fn)`, or any of the property-access methods on a
handle itself.

A handle is **opaque** from Node's perspective. It wraps a CDP
`RemoteObject.objectId` (or a synthetic equivalent for primitives) and
can only be used as an argument to subsequent browser-side operations.
To read the underlying value, pass the handle to `page.evaluate(fn, handle)`
or call `handle.jsonValue()`.

## The discriminated union

`CdpHandle` is a discriminated union of two kinds:

| Kind                                 | When you get one                                                                        | Backed by                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `"object"` — `CdpObjectHandle`       | The result is a DOM element, function, class instance, or any other non-primitive value | A real Chrome DevTools Protocol `objectId` from `Runtime.evaluate` |
| `"primitive"` — `CdpPrimitiveHandle` | The result is a number, string, boolean, `null`, or `undefined`                         | A synthetic wrapper — no real `objectId`                           |

Discriminate with the `__kind` field:

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import type { CdpHandle, CdpPageService } from "@effect-libs/browser-cdp";

import { Effect } from "effect";

const example = (page: CdpPageService) =>
  Effect.gen(function* () {
    const handle: CdpHandle = yield* page.evaluateHandle(() => window);

    if (handle.__kind === "primitive") {
      // Primitive: read the wrapped value via __primitiveValue or jsonValue
      const value = yield* handle.jsonValue();
    } else {
      // Object: read properties, dispose when done
      const props = yield* handle.getProperties();
      yield* handle.dispose();
    }
  });
```

The `handle.__kind === "primitive"` discriminator is the public way to
branch on handle kind — there are no exported type guards yet. When you
need to detect a handle in arbitrary input, check for the `objectId` and
`dispose` properties on the value. The `evaluate` pipeline detects
handles via this same shape internally to route them through
`Runtime.callFunctionOn`.

## Operations on a `CdpObjectHandle`

All operations return `Effect<...>`. Failures produce `CdpError` with
reason `EvaluationError`.

| Method                     | Returns                                            | Behavior                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispose()`                | `Effect<void, CdpError>`                           | Releases the remote object. After `dispose`, the handle is invalid and any subsequent operation fails.                                                                                                                                                                                                                                                                                                              |
| `evaluate(fn, arg?)`       | `Effect<T, CdpError>`                              | Evaluates `fn(handle.value, ...args)` in the browser. `handle.value` is the dereferenced remote object. The result is returned deserialized.                                                                                                                                                                                                                                                                        |
| `evaluateHandle(fn, arg?)` | `Effect<CdpHandle, CdpError>`                      | Like `evaluate` but returns a handle to the result. If the result is a primitive, the handle is a `CdpPrimitiveHandle`.                                                                                                                                                                                                                                                                                             |
| `jsonValue()`              | `Effect<unknown, CdpError>`                        | Returns a JSON-serializable representation of the value, bypassing `toJSON`. Walks the object via the browser-side serializer (`__serialize`). Handles plain objects, arrays, primitives, `NaN`, `±Infinity`, `±0`, `Date` (as `Date`, not stringified), `URL`, `RegExp`, `Map`, `Set`, `Error`, typed arrays, `ArrayBuffer`, bigints, functions (as `{ s: source }`), and circular refs (returned as `undefined`). |
| `getProperties()`          | `Effect<ReadonlyMap<string, CdpHandle>, CdpError>` | Returns a map of own **and inherited** property names to `CdpHandle` instances for the property values. Uses `Runtime.getProperties` with `ownProperties: false`. Primitive-valued properties are wrapped in `CdpPrimitiveHandle`.                                                                                                                                                                                  |
| `getProperty(name)`        | `Effect<CdpHandle, CdpError>`                      | Like `getProperties` but for a single property. Returns `CdpPrimitiveHandle` for primitive-valued properties.                                                                                                                                                                                                                                                                                                       |
| `asElement()`              | `Effect<CdpHandle \| null, CdpError>`              | Returns the same handle if it references a DOM `Node` (`Element`, `Text`, etc.), or `null` otherwise. Implemented via `Runtime.callFunctionOn` with `this instanceof Node`. `browser-cdp` is locator-only — there is no `ElementHandle` type; the handle itself is the element reference.                                                                                                                           |

## Operations on a `CdpPrimitiveHandle`

The synthetic handle wrapping a primitive value. The same operation
surface is provided for API symmetry, with the semantics adjusted:

| Method                     | Returns                                            | Behavior                                                                                                                         |
| -------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `dispose()`                | `Effect<void, CdpError>`                           | No-op (no remote object to release).                                                                                             |
| `evaluate(fn, arg?)`       | `Effect<T, CdpError>`                              | Evaluates `fn(primitiveValue, ...args)` in the browser. The primitive value is inlined as a literal in the function declaration. |
| `evaluateHandle(fn, arg?)` | `Effect<CdpHandle, CdpError>`                      | Like `evaluate` but returns a handle to the result.                                                                              |
| `jsonValue()`              | `Effect<unknown, CdpError>`                        | Returns the wrapped primitive value.                                                                                             |
| `getProperties()`          | `Effect<ReadonlyMap<string, CdpHandle>, CdpError>` | Always returns an empty map — primitives have no properties.                                                                     |
| `getProperty(name)`        | `Effect<CdpHandle, CdpError>`                      | Always fails with `EvaluationError`.                                                                                             |
| `asElement()`              | `Effect<CdpHandle \| null, CdpError>`              | Always returns `null`.                                                                                                           |

The wrapped value is also exposed as `handle.__primitiveValue` for direct
access (bypassing the `Effect`).

## Lifecycle

Handles are reference-counted on the browser side. `@effect-libs/browser-cdp`
**does not** automatically dispose handles created via `evaluateHandle` —
you must call `handle.dispose()` explicitly, or rely on page teardown
to release them when the page is destroyed.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import type { CdpHandle, CdpPageService } from "@effect-libs/browser-cdp";

import { Effect } from "effect";

const example = (page: CdpPageService) =>
  Effect.gen(function* () {
    // ✅ Recommended: explicit dispose
    const body: CdpHandle = yield* page.evaluateHandle(() => document.body);
    try {
      const childCount = yield* page.evaluate((el: Element) => el.children.length, body);
      return childCount;
    } finally {
      yield* body.dispose();
    }
  });
```

```typescript
import type { CdpHandle, CdpPageService } from "@effect-libs/browser-cdp";

import { Effect } from "effect";

const example = (page: CdpPageService) =>
  Effect.gen(function* () {
    // ⚠️ Works, but leaks until page teardown — fine for short-lived scrapers
    const body: CdpHandle = yield* page.evaluateHandle(() => document.body);
    const childCount = yield* page.evaluate((el: Element) => el.children.length, body);
    return childCount;
  });
```

## Passing handles to subsequent evaluations

Handles are first-class arguments. Pass them to any `evaluate` /
`evaluateHandle` call — the pipeline detects them by their
`objectId` + `dispose` shape and routes them through
`Runtime.callFunctionOn` instead of `Runtime.evaluate`, so the browser
side receives a live `objectId` reference rather than a serialized copy.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import type { CdpHandle, CdpPageService } from "@effect-libs/browser-cdp";

import { Effect } from "effect";

const example = (page: CdpPageService) =>
  Effect.gen(function* () {
    // Get a handle to a DOM element
    const form: CdpHandle = yield* page.evaluateHandle(() => document.querySelector("form"));

    // Read a property off it
    const action = yield* form.getProperty("action");
    const actionValue = yield* action.jsonValue();

    // Pass it to a function — receives the element, not a serialized copy
    const method = yield* page.evaluate((el: HTMLFormElement) => el.method, form);

    // Or build a handle to a derived value
    const inputs: CdpHandle = yield* page.evaluateHandle((el: HTMLFormElement) => el.length, form);
  });
```

Nested handles work too — handles inside arrays or objects are detected
and routed correctly.

## When to use `evaluateHandle` vs `evaluate`

| Scenario                                                 | Use                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Return a serialized value (number, string, plain object) | `page.evaluate(fn)`                                                                                  |
| Return a DOM element and operate on it later             | `page.evaluateHandle(fn)`                                                                            |
| Return a function and call it later                      | `page.evaluateHandle(fn)`                                                                            |
| Return a class instance and read properties later        | `page.evaluateHandle(fn)`                                                                            |
| Return a `Date` / `Map` / `Set` and just want the value  | `page.evaluate(fn)` (round-trips via the browser-side serializer)                                    |
| Return a primitive                                       | `page.evaluate(fn)` — `evaluateHandle` returns a `CdpPrimitiveHandle` that just wraps the same value |

## Errors

- `EvaluationError` — function threw in the browser, or the remote object was released before the operation completed.
- The `__kind === "primitive"` discriminator is the only reliable way to
  branch on handle kind at runtime — `instanceof` checks do not work
  across the discriminated-union boundary.

## See also

- [`evaluate.md`](./evaluate.md) — the evaluate pipeline and the
  no-imports payload constraint.
- [`locators.md`](./locators.md) — `Locator.evaluateHandle(fn)` for the
  resolved-element case.
- [`errors.md`](./errors.md) — error taxonomy and matching patterns.
- [Playwright `JSHandle` reference](https://playwright.dev/docs/api/class-jshandle)
  — the upstream Playwright API the `@effect-libs/browser-cdp` handle mirrors.
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src) — full API in JSDoc
