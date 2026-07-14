# Errors are Typed

Every operation can fail with `PlaywrightError` (or `CdpError`, `StagehandError`). The error has a `reason` union of typed reason classes — handle them with `Effect.catchTag` for type-safe narrowing on each reason:

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

Each module has an error reference:

- [`browser-playwright` — Errors](../packages/playwright/errors.md)
- [`browser-cdp` — Errors](../packages/cdp/errors.md)
- [`browser-stagehand`` — Errors](../packages/stagehand/errors.md)

## See also

- [Effect](./effect.md) — pair error handling with retries and timeouts
- [Client + provider](./client-and-provider.md) — typed errors as one of the library's foundations
