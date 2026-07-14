# Retries and Timeouts

Browser automation is inherently flaky. Since every operation is an `Effect`, retries and timeouts compose for free — no per-call config needed.

```typescript
import { Effect, Layer, Schedule, Redacted } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

const resilientScrape = (apiKey: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;
    const provider = yield* SteelProvider;

    return yield* playwright.withSession({ provider }, ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto("https://flaky-site.example.com");
        return yield* page.title;
      }),
    );
  }).pipe(
    Effect.provide(
      Layer.merge(Playwright.layer, SteelProvider.layer({ apiKey: Redacted.make(apiKey) })),
    ),
    // Retry up to 3 times with exponential backoff (1s, 2s, 4s)
    Effect.retry(Schedule.exponential("1 second").pipe(Schedule.upTo({ times: 3 }))),
    // Fail if the whole thing takes more than 30 seconds
    Effect.timeout("30 seconds"),
  );
```

Combinators stack: retry on transient failures, timeout for runaway operations, add `Effect.withSpan("scrape")` for tracing. All without touching the scraper logic.

## Retry only on `isRetryable`

Top-level `Effect.retry(schedule)` retries on every failure. To retry only on transient errors and give up immediately on permanent ones (e.g. selector not found, evaluate syntax error), pair the schedule with an `isRetryable` predicate.

Every module error (`PlaywrightError`, `CdpError`, `StagehandError`) exposes an `isRetryable` getter that delegates to the underlying reason. The pattern is the same for all three — here it is for Playwright:

```typescript
import type { PlaywrightError } from "@effect-libs/browser-playwright";

import { Effect, Schedule } from "effect";

const isRetryablePlaywright = (e: unknown): boolean =>
  !!e &&
  typeof e === "object" &&
  "_tag" in e &&
  e._tag === "effect-libs/browser/PlaywrightError" &&
  (e as unknown as { isRetryable: boolean }).isRetryable === true;

const navigate = (page: import("@effect-libs/browser-playwright").PlaywrightPage, url: string) =>
  page.goto(url).pipe(
    Effect.retry({
      schedule: Schedule.exponential("100 millis"),
      times: 3,
      while: isRetryablePlaywright,
    }),
    // Last resort: if we exhausted retries on a still-retryable error,
    // don't fail — return a sentinel. Otherwise the typed PlaywrightError propagates.
    Effect.catchIf(isRetryablePlaywright, () => Effect.succeed("gave up after retries")),
  );
```

For CDP and Stagehand the same pattern applies with `CdpError` / `StagehandError` instead — see each module's error reference for the exact `_tag` and `isRetryable` semantics.

## See also

- [Concepts → Errors are typed](../concepts/errors.md) — the typed error model and `isRetryable` per reason
- [Playwright — Errors → Retry on `isRetryable`](../packages/playwright/errors.md#retry-on-isretryable)
- [browser-cdp — Errors → Retry on `isRetryable`](../packages/cdp/errors.md#retry-on-isretryable)
- [Stagehand — Errors → Retry on `isRetryable`](../packages/stagehand/errors.md#retry-on-isretryable)
- [Concepts → Composing with effects](../concepts/effect.md) — the operators in detail
