# browser-stagehand — Errors

`browser-stagehand` exposes a single `StagehandError` parent error
with a structured `reason` union of 3 typed reason classes. Pattern
matching is via `Effect.catchTag("effect-libs/browser/StagehandError", ...)`
and the `isRetryable` getter, which delegates to the underlying reason.

This mirrors the [`@effect-libs/browser-playwright` error model](./../playwright/errors.md)
(4 reason classes), the [`@effect-libs/browser-cdp` error model](./../cdp/errors.md)
(14 reason classes), and the [Effect `SqlError` pattern][sql-error]:
one parent error wrapping a discriminated union of reasons.

[sql-error]: https://effect.website/docs/error-management/reason-based-errors

## The shape

`StagehandError` carries `module` (always `"Stagehand"`), `method` (the call), `reason` (the discriminated union of 3 reason classes), `isRetryable` (delegates to the reason), `cause === reason`, and `message` (derived). The `_tag` on `StagehandError` itself is always `"effect-libs/browser/StagehandError"`. Match on `reason._tag` for the specific reason (or use the `isXxxError` class guards).

## Reason classes

3 reason classes. Each has a small set of fields and an `isRetryable`
getter.

| Class             | isRetryable | Fields                            | When                                                                                                                                  |
| ----------------- | :---------: | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ConnectionError` |     ✅      | `description`, `cause?`           | Stagehand initialization or connection to the upstream Stagehand runtime failed.                                                      |
| `OperationError`  |     ✅      | `action`, `description`, `cause?` | An `act` / `extract` / `observe` operation failed. `action` is the Stagehand verb; `description` is the upstream error message.       |
| `AgentError`      |     ✅      | `description`, `cause?`           | The AI agent itself failed (API error, model error, rate limit, schema rejection). Not retryable by default; usually needs a new run. |

All three are `isRetryable: true` at the wrapper level. For
`AgentError` you'll usually want to use `Effect.catchReason` to opt out
of retries — see [Pattern matching](#pattern-matching).

> **Why all `isRetryable: true`?** Most operations that surface as
> `StagehandError` are transient — connection drops, upstream Stagehand
> runtime hiccups, model timeouts. `isRetryable` defaults to `true` so
> top-level `Effect.retry(schedule)` combinators work without
> configuration. Use `Effect.catchReason` to opt out for cases where
> retry is wasteful (e.g. `AgentError` from a malformed schema — fix the
> schema, don't retry).

## Schema conversion errors

One error is **not** wrapped by `StagehandError`. It surfaces from
[`toZodSchema`](./index.md#schema-conversion-errors), which converts an
Effect Schema into the Zod schema that `s.extract()` requires:

| Class                   | Tag                                           | Fields                            | When                                                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SchemaConversionError` | `"effect-libs/browser/SchemaConversionError"` | `cause: Defect`, `reason: string` | The Effect Schema → JSON Schema → Zod pipeline failed (most often on the Zod `fromJSONSchema` hop). See [Effect Schema → Zod](./index.md#schema-conversion-errors) for the common failure shapes (records with non-string keys, recursive schemas, class-instance schemas). |

`SchemaConversionError` is a standalone tagged error — it has the
`SchemaConversionError` `_tag`, not the `StagehandError` `_tag`. A
`catchTag("effect-libs/browser/StagehandError", ...)` handler will not
see it. Catch it directly:

<!-- verify:ignore -->

```typescript
import { Effect } from "effect";
import { toZodSchema } from "@effect-libs/browser-stagehand";

const program = toZodSchema(someSchema).pipe(
  Effect.catchTag(
    "effect-libs/browser/SchemaConversionError",
    (e) =>
      Effect.fail(
        new Error(`Could not derive Zod schema: ${e.reason} (${e.message})`),
      ),
  ),
);
```

The `cause` field holds the underlying defect from `z.fromJSONSchema`
(typically a `ZodError` instance or a thrown value); `reason` is a
short human-readable summary. Inspect both if you need to decide
between a fallback (hand-written Zod schema) and a hard failure.

In normal use, `SchemaConversionError` is rare — it fires only for
schema shapes that JSON Schema cannot express (or that Zod v4's
experimental `fromJSONSchema` cannot yet consume). See the
[Effect Schema → Zod](./index.md#schema-conversion-errors) section for
the recommended fallback strategy.

## Pattern matching

Three patterns, in order of preference.

### 1. `Effect.catchTag` on the parent

Catch all Stagehand errors at once. The handler can re-fail with the
typed `StagehandError` (preserving the reason union for downstream
handlers) or branch on `reason._tag` if you need it — but for typed
narrowing, prefer the per-reason helpers below.

<!-- verify:ignore -->

```typescript
import { Effect } from "effect";

const example = (
  stagehand: import("@effect-libs/browser-stagehand").Stagehand,
) =>
  stagehand
    .withConnection({ url: "ws://localhost:9222" }, ({ instance }) =>
      Effect.gen(function* () {
        return yield* instance.use((s) => s.act("click the submit button"));
      }),
    )
    .pipe(
      Effect.catchTag("effect-libs/browser/StagehandError", (e) =>
        Effect.gen(function* () {
          yield* Effect.logError(e.message);
          return yield* Effect.fail(e); // re-fail with the typed StagehandError
        }),
      ),
    );
```

### 2. `Effect.catchReason` on a specific reason

If you only care about one reason, catch it directly with
`Effect.catchReason` — the handler receives the narrowed reason (e.g.
`reason.description`), and any reason that isn't matched re-fails with
the typed `StagehandError`. Never wrap a typed reason in `new Error(...)`,
which would lose the type.

<!-- verify:ignore -->

```typescript
import { Effect } from "effect";

declare const schema: unknown;
declare function retryWithFallbackModel(action: string): Effect.Effect<unknown, unknown>;

const example = (
  stagehand: import("@effect-libs/browser-stagehand").Stagehand,
) =>
  stagehand
    .withConnection({ url: "ws://localhost:9222" }, ({ instance }) =>
      Effect.gen(function* () {
        return yield* instance.use((s) => s.extract("get the price", schema));
      }),
    )
    .pipe(
      Effect.catchReason(
        "effect-libs/browser/StagehandError",
        "effect-libs/browser/StagehandError/OperationError",
        (reason) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`operation failed, switching model: ${reason.description}`);
            return yield* retryWithFallbackModel(reason.description);
          }),
        (e) => Effect.fail(e),
      ),
    );
```

### 3. Retry on `isRetryable`

For high-level retry semantics, use the `isRetryable` getter on either
the parent or the reason.

<!-- verify:ignore -->

```typescript
import { Effect, Schedule } from "effect";

const isRetryableStagehand = (e: unknown): boolean => {
  if (
    !!e &&
    typeof e === "object" &&
    "_tag" in e &&
    e._tag === "effect-libs/browser/StagehandError"
  ) {
    return (e as unknown as { isRetryable: boolean }).isRetryable === true;
  }
  return false;
};

const example = (
  stagehand: import("@effect-libs/browser-stagehand").Stagehand,
) =>
  stagehand
    .withConnection({ url: "ws://localhost:9222" }, ({ instance }) =>
      Effect.gen(function* () {
        return yield* instance.use((s) => s.act("submit the form"));
      }),
    )
    .pipe(
      Effect.retry({
        schedule: Schedule.exponential("100 millis"),
        times: 3,
        while: isRetryableStagehand,
      }),
      Effect.catchIf(isRetryableStagehand, () => Effect.succeed("gave up after retries")),
    );
```

> **Pattern.** Combine `Effect.retry(schedule)` with
> `Effect.catchIf(isRetryableStagehand, fallback)` to retry only on
> retryable errors. The pre-typed `Effect.retry` predicate (one that
> narrows on `StagehandError` directly) will land in a future Effect
> release.

## Module field

`StagehandError.module` identifies the wrapper that produced the error.
`browser-stagehand` currently uses a single value:

| `module` value | Source                                                                |
| -------------- | --------------------------------------------------------------------- |
| `"Stagehand"`  | The `Stagehand` service (`withSession` / `withConnection` lifecycle). |

`method` is the operation name (`acquireSession`, `act`, `extract`,
`observe`, etc.). The error message is derived as
`${module}.${method}: ${reason._tag}`.

## `cause === reason`

The `cause` property on `StagehandError` is set to the reason. This
mirrors the Effect `Schema.TaggedErrorClass` convention where the
underlying reason is the cause of the wrapper. JS engines surface
`cause` in stack traces (`Error: ... Caused by: ...`), so this keeps
the typed reason visible in error logs.

## Not wrapped by design

The `agent` primitive is upstream Stagehand v3 but is **not wrapped by
design** by this package. The upstream `V3.agent({...}).execute(...)` is
exposed through the `instance.use` escape hatch, which already wires
Effect cancellation and error wrapping to the raw V3 — a wrapper would
be a thin pass-through over a configuration-heavy
(`model` / `executionModel` / `mode` / `integrations` / `tools` / `stream`)
and `@experimental` upstream API. See
[ADR-0001 — Stagehand `agent` primitive not wrapped](../../contributing/stagehand/decisions/0001-stagehand-agent-not-wrapped.md)
for the rationale.

Use the escape hatch directly:

<!-- verify:ignore -->

```typescript
import { Effect, Schema } from "effect";

import { Stagehand, toZodSchema } from "@effect-libs/browser-stagehand";

const ProductSchema = Schema.Struct({
  title: Schema.String,
  price: Schema.Finite,
});

const result = yield* stagehand.withConnection({ url: cdpUrl }, ({ instance }) =>
  Effect.gen(function* () {
    const productZod = yield* toZodSchema(ProductSchema);
    // Non-streaming, DOM-mode agent (default). Replace `mode: "hybrid"`
    // or `mode: "cua"` to switch tool sets; `stream: true` for streaming.
    const out = yield* instance.use((s) =>
      s
        .agent({ mode: "dom" })
        .execute({ instruction: "find the cheapest product", output: productZod }),
    );
    return out.output;
  }),
);
```

The escape-hatch call goes through `instance.use`, so it has the same
Effect integration, `AbortSignal` cancellation, and `StagehandError`
wrapping as `act` / `extract` / `observe`. The only thing you give up
is a first-class `instance.agent()` method and a typed `Effect`/`Stream`
adapter for `stream: true` — neither of which we plan to add until the
upstream API stabilizes.

If you're on Node.js, Deno, or Bun and want a first-class `agent()`
API without the escape-hatch ceremony, use upstream
[`@browserbasehq/stagehand`](https://www.npmjs.com/package/@browserbasehq/stagehand)
directly. The wrapper exists for Cloudflare Workers; the escape hatch
exists for users who need the agent primitive.

## See also

- [Playwright — Errors](./../playwright/errors.md) — the parallel shape for `@effect-libs/browser-playwright` (4 reason classes)
- [browser-cdp — Errors](./../cdp/errors.md) — the parallel shape for `@effect-libs/browser-cdp` (14 reason classes)
- [`browser-stagehand`](./index.md) — the package landing page
- [Why Effect?](../../concepts/effect.md) — typed errors as a first-class language feature
- [Effect Reason Pattern](https://effect.website/docs/error-management/reason-based-errors) — the upstream pattern this is modeled on
- [Source on GitHub](https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/browser-stagehand/src) — full API in JSDoc
