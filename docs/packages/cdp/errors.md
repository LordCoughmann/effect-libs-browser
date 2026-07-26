# browser-cdp — Errors

`@effect-libs/browser-cdp` exposes a single `CdpError` parent error with a
structured `reason` union of 14 specific reason classes. Pattern
matching is via `Effect.catchTag("CdpError", ...)` and the
`isRetryable` getter, which delegates to the underlying reason.

This mirrors [`@effect-libs/browser-playwright`'s error model][pw-errors] (4
reason classes) and the [Effect `SqlError` pattern][sql-error]: one
parent error wrapping a discriminated union of reasons.

[pw-errors]: ./../playwright/errors.md
[sql-error]: https://effect.website/docs/error-management/reason-based-errors

## The shape

`CdpError` carries `source` (the wrapper class that produced the error), `method` (the call), `reason` (the discriminated union of 14 reason classes), `isRetryable` (delegates to the reason), `cause === reason` (so the typed reason is visible in stack traces as `Caused by: ...`), and `message` (derived from `source` + `method` + `reason._tag` + `reason.description`). The `_tag` on `CdpError` itself is always `"effect-libs/browser/CdpError"`. Match on `reason._tag` (or use `Effect.catchReason`) for the specific reason (or use the `isXxxError` class guards exported from the package).

## Reason classes

14 reason classes. Each has a small set of fields and an
`isRetryable` getter.

| Class                      | isRetryable | Fields                             | When                                                                   |
| -------------------------- | :---------: | ---------------------------------- | ---------------------------------------------------------------------- |
| `ConnectionError`          |     ✅      | `description`, `cause?`            | WebSocket connection failed (network, auth, etc.).                     |
| `ContextNotSupportedError` |     ❌      | `description`                      | Provider rejected `Target.createBrowserContext` (e.g. CF Browser Run). |
| `NavigationError`          |     ✅      | `url`, `description`               | Page navigation failed (`net::ERR_*`, timeout, blocked).               |
| `PageTimeoutError`         |     ✅      | `selector?`, `timeout`, `state?`   | A page operation timed out (default 30s, configurable).                |
| `CommandError`             |     ❌      | `method`, `params?`, `description` | CDP command returned an error response from Chrome.                    |
| `EvaluationError`          |     ❌      | `description`                      | `page.evaluate` threw or returned a CDP-side error.                    |
| `SelectorError`            |     ❌      | `selector`, `description`          | Element not found, not interactable, or actionability check failed.    |
| `ScreenshotError`          |     ❌      | `description`                      | Screenshot capture failed.                                             |
| `PdfError`                 |     ❌      | `description`                      | PDF generation failed.                                                 |
| `CookieError`              |     ❌      | `description`                      | Cookie get/set failed.                                                 |
| `StorageError`             |     ❌      | `description`                      | `localStorage` / `sessionStorage` / `storageState` operation failed.   |
| `FetchError`               |     ✅      | `url`, `status?`, `description`    | Page-context `fetch()` failed (CORS, network, server error).           |
| `ViewportError`            |     ❌      | `description`                      | Viewport size change failed.                                           |
| `ContentUnavailableError`  |     ✅      | `description`                      | `page.content()` / `frame.content` called while navigating.            |

## Transport-layer errors

Four errors are re-exported from the transport layer (not wrapped in
`CdpError` — they fire before any operation reaches a method):

| Class                  | When                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `CdpConnectionError`   | Low-level WebSocket transport error.                                     |
| `CdpTimeoutError`      | Low-level timeout on a CDP request (before the operation-level timeout). |
| `CdpCommandError`      | Failed to dispatch a CDP command (e.g. protocol error, channel closed).  |
| `CdpMessageParseError` | Failed to parse an inbound CDP message.                                  |

In normal use you should catch `CdpError` (the parent) and not these —
the operation-level errors are wrapped. Catch them directly only when
building on top of the raw transport.

## Pattern matching

Three patterns, in order of preference.

### 1. `Effect.catchTag` on the parent

Catch all CDP errors at once. The handler can re-fail with the typed
`CdpError` (preserving the reason union for downstream handlers) or
branch on `reason._tag` if you need it — but for typed narrowing, prefer
the per-reason helpers below.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import { Effect } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  page.goto("https://example.com").pipe(
    Effect.catchTag("effect-libs/browser/CdpError", (e) =>
      Effect.gen(function* () {
        yield* Effect.logError(e.message);
        return yield* e; // re-fail with the typed CdpError
      }),
    ),
  );
```

### 2. `Effect.catchReason` on a specific reason

If you only care about one reason, catch it directly with
`Effect.catchReason` — the handler receives the narrowed reason (e.g.
`reason.selector`), and any reason that isn't matched re-fails with the
typed `CdpError`. Never wrap a typed reason in `new Error(...)`, which
would lose the type.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import { Effect } from "effect";

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  page.goto("https://slow-site.example.com").pipe(
    Effect.catchReason(
      "effect-libs/browser/CdpError",
      "effect-libs/browser/CdpError/PageTimeoutError",
      (reason) =>
        Effect.gen(function* () {
          yield* Effect.logWarning(`page timeout, falling back to cache: ${reason.timeout}`);
          return Effect.succeed("loaded from cache");
        }),
      (e) => Effect.fail(e),
    ),
  );
```

### 3. Retry on `isRetryable`

For high-level retry semantics, use the `isRetryable` getter on
either the parent or the reason.

<!-- verify:stubs -->
<!-- verify:stubs:declare const page: import("@effect-libs/browser-cdp").CdpPageService -->

```typescript
import { Effect, Schedule } from "effect";

const isRetryableCdp = (e: unknown): boolean => {
  // Narrow to CdpError, then check isRetryable
  if (!!e && typeof e === "object" && "_tag" in e && e._tag === "effect-libs/browser/CdpError") {
    return (e as unknown as { isRetryable: boolean }).isRetryable === true;
  }
  return false;
};

const example = (page: import("@effect-libs/browser-cdp").CdpPageService) =>
  page.goto("https://flaky.example.com").pipe(
    Effect.retry({
      schedule: Schedule.exponential("100 millis"),
      times: 3,
      while: isRetryableCdp,
    }),
    Effect.catchIf(isRetryableCdp, () => Effect.succeed("gave up after retries")),
  );
```

> ⚠️ **Pattern.** Combine `Effect.retry(schedule)` with
> `Effect.catchIf(isRetryableCdp, fallback)` to retry only on retryable
> errors. The pre-typed `Effect.retry` predicate (one that narrows on
> `CdpError` directly) will land in a future Effect release.

## Source field

`CdpError.source` identifies the wrapper class that produced the error.
Useful when the same program uses multiple `@effect-libs/browser-cdp` services and you want
to log or branch on the source.

| `source` value         | Source                                                                |
| ---------------------- | --------------------------------------------------------------------- |
| `"Cdp"`                | The `Cdp` service (`acquireSession` / `acquireConnection` lifecycle). |
| `"CdpPage"`            | `page.*` operations (navigation, click, evaluate, screenshot, ...).   |
| `"CdpFrame"`           | `frame.*` operations (goto, waitForNavigation, content, ...).         |
| `"CdpLocator"`         | `locator.*` operations that fail inside the locator resolver.         |
| `"CdpContextHandle"`   | `context.*` operations (cookies, setGeolocation, storageState).       |
| `"CdpConnectionHandle"` | `connection.withContext` failures (e.g. `ContextNotSupportedError`).  |

## Migration from upstream `playwright`

If you're moving code that catches `playwright.errors.TimeoutError` /
`playwright.errors.Error` to `@effect-libs/browser-cdp`, the new shape is:

```diff
- import { errors } from "playwright";
- try {
-   await page.goto(url, { timeout: 5_000 });
- } catch (e) {
-   if (e instanceof errors.TimeoutError) { ... }
- }
+ import { Effect } from "effect";
+ import { Cdp } from "@effect-libs/browser-cdp";
+
+ yield* cdp.withConnection({ url }, ({ page }) =>
+   page.goto(url).pipe(
+     Effect.catchReason(
+       "effect-libs/browser/CdpError",
+       "effect-libs/browser/CdpError/PageTimeoutError",
+       (reason) =>
+         Effect.gen(function* () {
+           // The original `reason.description` is the CDP error description
+           yield* Effect.logWarning(`page timeout: ${reason.timeout}`);
+           return yield* retryWithLongerTimeout(url);
+         }),
+       (e) => Effect.fail(e),
+     ),
+   ),
+ );
```

The `description` field on the reason is the human-readable message
from the original error; `selector`, `url`, etc. are typed for
structured handling.

## See also

- [Playwright — Errors](./../playwright/errors.md) — the parallel shape for
  `@effect-libs/browser-playwright`
- [Why Effect?](../../concepts/effect.md) — typed errors as a first-class
  language feature
- [Effect Reason Pattern](https://effect.website/docs/error-management/reason-based-errors) —
  the upstream pattern this is modeled on
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-cdp/src) — full API in JSDoc
