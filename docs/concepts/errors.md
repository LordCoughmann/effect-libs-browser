# Errors are Typed

Every operation can fail with `PlaywrightError` (or `CdpError`, `StagehandError`). The error has a `reason` union of typed reason classes — handle them with `Effect.catchTag` or `Effect.catchReason` for type-safe narrowing on each reason:

<!-- verify:ignore -->

```typescript
program.pipe(
  Effect.catchTag(
    "effect-libs/browser/PlaywrightError",
    "effect-libs/browser/PlaywrightError/NavigationError",
    (reason) => Effect.gen(function* () {
      yield* Effect.logWarning(`bad url, retrying: ${reason.url}`)
      return yield* retryWithFallbackUrl(reason.url)
    }),
    (e) => Effect.fail(e), // other reasons re-fail with the typed error
  ),
);
```

Two patterns, in order of preference.

## 1. `Effect.catchTag` on the parent error

Catch the parent (`PlaywrightError` / `CdpError` / `StagehandError`) and
narrow on the inner reason's `_tag`. Use this when you want to handle
multiple reasons from the same handler.

## 2. `Effect.catchReason` on a specific reason

If you only care about one reason, catch it directly with
`Effect.catchReason` — the handler receives the narrowed reason (e.g.
`reason.url`), and any reason that isn't matched re-fails with the
typed `PlaywrightError`. The reason is matched by its full tag
(`"effect-libs/browser/PlaywrightError/NavigationError"`):

<!-- verify:ignore -->

```typescript
page.goto("https://slow-site.example.com").pipe(
  Effect.catchReason(
    "effect-libs/browser/PlaywrightError",
    "effect-libs/browser/PlaywrightError/NavigationError",
    (reason) => Effect.gen(function* () {
      yield* Effect.logWarning(
        `navigation failed, retrying with longer timeout: ${reason.url}`,
      );
      return yield* retryWithLongerTimeout(reason.url);
    }),
    (e) => Effect.fail(e),
  ),
);
```

Never wrap a typed reason in `new Error(...)` — that would lose the
type and the `isRetryable` getter.

## Per-client reason classes

Each client has its own reason class set (Navigation, Selector,
Operation, etc.) and its own per-reason fields. The pattern above is
identical for all three; the reason class names and fields differ. See
the per-client reference for the full table:

- [`browser-playwright` — Errors](../packages/playwright/errors.md)
- [`browser-cdp` — Errors](../packages/cdp/errors.md)
- [`browser-stagehand` — Errors](../packages/stagehand/errors.md)

## `isRetryable` and retries

Every reason class has an `isRetryable` getter. The wrapper defaults to
`true` so that top-level `Effect.retry(schedule)` combinators work
without configuration. Use `Effect.catchReason` to opt out for
non-retryable cases (e.g. selector-not-found is usually a bug, not a
transient failure). See
[Cookbook — Retries and timeouts](../cookbook/retries-and-timeouts.md) for
the operator-by-operator recipes.

## See also

- [Effect](./effect.md) — pair error handling with retries and timeouts
- [Overview — How they compose](../overview.md#how-they-compose) — typed errors as one of the library's foundations