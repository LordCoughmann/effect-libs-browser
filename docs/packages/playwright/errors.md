# browser-playwright — Errors

The `@effect-libs/browser-playwright` module exposes a single `PlaywrightError` parent error
with a structured `reason` union of 4 typed reason classes. Pattern
matching is via `Effect.catchTag("effect-libs/browser/PlaywrightError", ...)`
and the `isRetryable` getter, which delegates to the underlying reason.

This mirrors the [`@effect-libs/browser-cdp` error model](./../cdp/errors.md) (14 reason
classes) and the [Effect `SqlError` pattern][sql-error]: one parent
error wrapping a discriminated union of reasons.

[sql-error]: https://effect.website/docs/error-management/reason-based-errors

## The shape

`PlaywrightError` carries `module` (the source wrapper), `method` (the call), `reason` (the discriminated union of 4 reason classes), `isRetryable` (delegates to the reason), `cause === reason` (so the typed reason is visible in stack traces as `Caused by: ...`), and `message` (derived from `module` + `method` + `reason._tag` + `reason.description`). The `_tag` on `PlaywrightError` itself is always `"effect-libs/browser/PlaywrightError"`. Match on `reason._tag` (or use `Effect.catchReason`) for the specific reason.

## Reason classes

4 reason classes. Each has a small set of fields and an `isRetryable`
getter.

| Class             | isRetryable | Fields                                   | When                                                                                           |
| ----------------- | :---------: | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ConnectionError` |     ✅      | `description`, `cause?`                  | `connectOverCDP` failed (network, auth, invalid CDP URL).                                      |
| `ContextError`    |     ✅      | `description`, `cause?`                  | Browser context allocation or page creation failed.                                            |
| `NavigationError` |     ✅      | `method`, `url`, `description`, `cause?` | `page.goto` / `page.reload` failed (`net::ERR_*`, timeout, blocked).                           |
| `OperationError`  |     ✅      | `method`, `description`, `cause?`        | A page / locator / context operation failed (click, fill, evaluate, screenshot, cookies, ...). |

All four are `isRetryable: true` by default — the wrapper treats them as
transient at the top level. For finer-grained control, use
`Effect.catchReason` to handle one reason specifically (see
[Pattern matching](#pattern-matching)).

> **Why all `isRetryable: true`?** Most operations that surface as
> `PlaywrightError` are transient by nature — a `net::ERR_CONNECTION_REFUSED`
> on a navigation, a target detachment during a click, an upstream
> timeout. `isRetryable` defaults to `true` so that top-level
> `Effect.retry(schedule)` combinators work without further configuration.
> Use `Effect.catchReason` to opt out for non-retryable cases
> (e.g. evaluation syntax errors, which surface as `OperationError`).

## Pattern matching

Three patterns, in order of preference.

### 1. `Effect.catchTag` on the parent

Catch all Playwright errors at once. The handler can re-fail with the
typed `PlaywrightError` (preserving the reason union for downstream
handlers) or branch on `reason._tag` if you need it — but for typed
narrowing, prefer the per-reason helpers below.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-playwright").PlaywrightPage -->

```typescript
import { Effect } from "effect";

const example = (page: import("@effect-libs/browser-playwright").PlaywrightPage) =>
  page.goto("https://example.com").pipe(
    Effect.catchTag("effect-libs/browser/PlaywrightError", (e) =>
      Effect.gen(function* () {
        yield* Effect.logError(e.message);
        return yield* e; // re-fail with the typed PlaywrightError
      }),
    ),
  );
```

### 2. `Effect.catchReason` on a specific reason

If you only care about one reason, catch it directly with
`Effect.catchReason` — the handler receives the narrowed reason (e.g.
`reason.url`), and any reason that isn't matched re-fails with the
typed `PlaywrightError`. Never wrap a typed reason in `new Error(...)`,
which would lose the type.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-playwright").PlaywrightPage -->

```typescript
import { Effect } from "effect";

declare function retryWithLongerTimeout(url: string): Effect.Effect<unknown, unknown>;

const example = (page: import("@effect-libs/browser-playwright").PlaywrightPage) =>
  page.goto("https://slow-site.example.com").pipe(
    Effect.catchReason(
      "effect-libs/browser/PlaywrightError",
      "effect-libs/browser/PlaywrightError/NavigationError",
      (reason) =>
        Effect.gen(function* () {
          yield* Effect.logWarning(
            `navigation failed, retrying with longer timeout: ${reason.url}`,
          );
          return yield* retryWithLongerTimeout(reason.url);
        }),
      (e) => Effect.fail(e),
    ),
  );
```

### 3. Retry on `isRetryable`

For high-level retry semantics, use the `isRetryable` getter on
either the parent or the reason.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-playwright").PlaywrightPage -->

```typescript
import { Effect, Schedule } from "effect";

const isRetryablePlaywright = (e: unknown): boolean => {
  // Narrow to PlaywrightError, then check isRetryable
  if (
    !!e &&
    typeof e === "object" &&
    "_tag" in e &&
    e._tag === "effect-libs/browser/PlaywrightError"
  ) {
    return (e as unknown as { isRetryable: boolean }).isRetryable === true;
  }
  return false;
};

const example = (page: import("@effect-libs/browser-playwright").PlaywrightPage) =>
  page.goto("https://flaky.example.com").pipe(
    Effect.retry({
      schedule: Schedule.exponential("100 millis"),
      times: 3,
      while: isRetryablePlaywright,
    }),
    Effect.catchIf(isRetryablePlaywright, () => Effect.succeed("gave up after retries")),
  );
```

> **Pattern.** Combine `Effect.retry(schedule)` with
> `Effect.catchIf(isRetryablePlaywright, fallback)` to retry only on
> retryable errors. The pre-typed `Effect.retry` predicate (one that
> narrows on `PlaywrightError` directly) will land in a future Effect
> release.

## Module field

`PlaywrightError.module` identifies the wrapper that produced the error.
Useful when the same program uses multiple wrappers and you want to log
or branch on the source.

| `module` value               | Source                                                          |
| ---------------------------- | --------------------------------------------------------------- |
| `"Playwright"`               | The `Playwright` service (`connectOverCDP`, lifecycle).         |
| `"PlaywrightPage"`           | `page.*` operations (navigation, evaluate, screenshot, ...).    |
| `"PlaywrightBrowserContext"` | `context.*` operations (cookies, setGeolocation, storageState). |
| `"PlaywrightLocator"`        | `locator.*` operations (click, fill, textContent).              |
| `"PlaywrightFrame"`          | `frame.*` operations.                                           |

## `cause === reason`

The `cause` property on `PlaywrightError` is set to the reason. This
mirrors the Effect `Schema.TaggedErrorClass` convention where the
underlying reason is the cause of the wrapper. JS engines surface
`cause` in stack traces (`Error: ... Caused by: ...`), so this keeps the
typed reason visible in error logs.

## Migration from upstream `playwright`

If you're moving code that catches `playwright.errors.TimeoutError` /
`playwright.errors.Error` to `@effect-libs/browser-playwright`, the new shape is:

```diff
- import { errors } from "playwright";
- try {
-   await page.goto(url, { timeout: 5_000 });
- } catch (e) {
-   if (e instanceof errors.TimeoutError) { ... }
- }
+ import { Effect } from "effect";
+ import { Playwright } from "@effect-libs/browser-playwright";
+
+ yield* playwright.withConnection({ url }, ({ page }) =>
+   page.goto(url).pipe(
+     Effect.catchReason(
+       "effect-libs/browser/PlaywrightError",
+       "effect-libs/browser/PlaywrightError/NavigationError",
+       (reason) =>
+         Effect.gen(function* () {
+           // The original `reason.description` is the upstream error message
+           yield* Effect.logWarning(`navigation timeout: ${reason.url}`);
+           return yield* retryWithLongerTimeout(reason.url);
+         }),
+       (e) => Effect.fail(e),
+     ),
+   ),
+ );
```

The `description` field on the reason is the human-readable message
from the original error; `method`, `url`, etc. are typed for structured
handling.

## See also

- [browser-cdp — Errors](./../cdp/errors.md) — the parallel shape for `browser-cdp` (14 reason classes)
- [`@effect-libs/browser-playwright` module](./index.md) — the module landing page
- [Why Effect?](../../concepts/effect.md) — typed errors as a first-class
  language feature
- [Effect Reason Pattern](https://effect.website/docs/error-management/reason-based-errors) —
  the upstream pattern this is modeled on
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-playwright/src) — full API in JSDoc
