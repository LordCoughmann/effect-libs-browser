# ADR-0004: `Runtime.callFunctionOn` Migration (delete in-house serializer)

> `@effect-libs/browser-cdp` abandoned the in-house `BROWSER_SERIALIZER_CODE` / `serializedValueToJsExpression` pipeline in favor of upstream Playwright's `Runtime.callFunctionOn` + utility-script pattern. The serialization boundary is centralized in the vendored `utilityScriptSerializers.ts`.

**Status:** Accepted
**Date:** 2026-07-02
**Source:** Shipped in P6 across commits `90a0d02`, `2e6bc79`, `38493e4`, `d52c650`, `bfffa3a`.

## Context

`@effect-libs/browser-cdp`'s `page.evaluate(fn, arg)` and `evaluateHandle(fn, arg)` originally used a custom serialization pipeline:

- **Browser-side:** `BROWSER_SERIALIZER_CODE` (~70 LOC) — a `__serialize` / `__innerSerialize` pair that walked the arg tree, allocated ids for repeated refs, and emitted `{ref: id}` markers. The class was shipped into the page via `Runtime.evaluate`.
- **Node-side:** `serializedValueToJsExpression` (~110 LOC) — re-walked the `SerializedValue` tree to emit a JS expression literal that, when `eval`'d in the page, reconstructed the original arg.
- **Wire-side:** `HANDLE_RESOLVER_CODE` — inline template literal that substituted `{__cdpHandleRef: i}` placeholders against a `__handles` array.

It worked. It also **drifted three times during P1 alone**:

| Phase    | Bug                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1.2** | `evaluateHandle` exposed the `{ref: id}` machinery for the first time; required `Runtime.callFunctionOn` `arguments` field to pass handles as `{ objectId }` entries, which introduced the `{__cdpHandleRef: i}` placeholder indirection.         |
| **P1.5** | `CdpHandle.evaluate(fn, arg)` had to support primitive-handle args; required `replaceHandlesWithRefs` to inline primitive values as literals (so the arg tree could be JSON-stringified) while passing object handles via `arguments` separately. |
| **P1.6** | The arg-side `serializedValueToJsExpression` emitted `undefined /* ref:N */` for repeated references; the browser-side `__serialize` dropped repeats to `{v: 'undefined'}`. Both had to be fixed.                                                 |

Each fix was local and worked. The structural problem is that the serialization boundary was held in our code, on **both sides of the wire**, and a drift in either created a user-visible bug. Upstream avoids this because the only place that ever constructs or parses `SerializedValue` is the vendored `utilityScriptSerializers.ts` (adapted from Microsoft Playwright, Apache 2.0).

## Decision

Mirror upstream Playwright's `crExecutionContext.evaluateWithArguments` pattern exactly:

1. Inject a `UtilityScript` singleton into the page via the existing `InjectedScript` mechanism.
2. For every `evaluate`-style call, send `Runtime.callFunctionOn` with `objectId: utilityScript._objectId` and a real `CallArgument[]` payload. **No JS-expression inlining, no `{ref: id}` markers, no inline `__serialize`.**
3. The utility script's `evaluate(...)` method calls `parseEvaluationResultValue` (vendored) to deserialize args, then `global.eval(expression)` to run the user code.

Implementation lives in [`packages/browser-cdp/src/internal/Page/UtilityScript.ts`](../../../../packages/browser-cdp/src/internal/Page/UtilityScript.ts) and [`packages/browser-cdp/src/internal/Page/InjectedScript.ts`](../../../../packages/browser-cdp/src/internal/Page/InjectedScript.ts). The `Evaluate.ts` callers now build a structured `CallFunctionOn` payload.

## Consequences

- **Cycles in args round-trip correctly.** `page.evaluate((x) => x.self === x, cyclic)` returns `true` (was `false`).
- **Repeated object references preserve identity on the browser side.** `page.evaluate((x) => x.bar[0] === x.foo, {foo, bar: [foo]})` returns `true` (was `false`).
- **Type catalog is centralized in the vendored file.** Future Chrome API additions (e.g., a new "unserializable" sentinel) require syncing with upstream, not patching `@effect-libs/browser-cdp`'s own code.
- **Bundle size shrinks ~1–2 KB minified.** The in-house `BROWSER_SERIALIZER_CODE` was the largest inlined JS string in the package.
- **22 wire-format unit tests** in `tests/unit/cdp/UtilityCallPayload.test.ts` cover the structured `CallFunctionOn` payload construction.
- **2 integration tests** in `tests/integration/shared/cdp/evaluate.ts` exercise the cycle-in-arg and identity-preserving paths.
- **No behavior change for any previously-passing test.** The refactor is behavior-preserving for the common cases; the wins are the previously-broken cycle / identity cases.

## What was deleted

- `BROWSER_SERIALIZER_CODE` (browser-side `__serialize` / `__innerSerialize`, ~70 LOC)
- `serializedValueToJsExpression` (Node-side SerializedValue → JS-expression converter, ~110 LOC)
- `HANDLE_RESOLVER_CODE` (×2, in `Evaluate.ts` and `EvaluateHandle.ts`, ~12 LOC each)
- `replaceHandlesWithRefs` (in `EvaluateHandle.ts`, ~50 LOC)
- `validateSerializable` (helper for `serializeForBrowser`)

Replaced with ~30 LOC of utility-script bootstrap and the structured `callFunctionOn` payload construction.

## Alternatives considered

- **Keep the in-house pipeline; just fix the bugs.** Rejected. We did this through P1.6 and the architecture was still fragile. The next type addition would have meant yet another round of dual-side fixes.
- **Port upstream Playwright's full selectors / script engine into CDP wholesale.** Rejected. Way out of scope; the goal is to remove the boundary, not replicate the engine.
- **Use a third-party serialization library (e.g., `superjson`, `devalue`).** Rejected. None match upstream Playwright's semantics for `Date` / `URL` / `RegExp` / cycles / repeated refs / handles; rolling our own was the original problem.

## See also

- [`packages/browser-cdp/src/internal/Page/Evaluate.ts`](../../../../packages/browser-cdp/src/internal/Page/Evaluate.ts) — current implementation.
- [`packages/browser-cdp/src/internal/Page/UtilityScript.ts`](../../../../packages/browser-cdp/src/internal/Page/UtilityScript.ts) — the new utility script.
- [`packages/browser-cdp/src/internal/Page/InjectedScript.ts`](../../../../packages/browser-cdp/src/internal/Page/InjectedScript.ts) — the injection mechanism.
- [`packages/browser-cdp/src/internal/Page/Evaluate/serialization/utilityScriptSerializers.ts`](../../../../packages/browser-cdp/src/internal/Page/Evaluate/serialization/utilityScriptSerializers.ts) — vendored serializer (do not modify; per AGENTS.md "Boundaries").
- [`tests/unit/cdp/UtilityCallPayload.test.ts`](../../../../tests/unit/cdp/UtilityCallPayload.test.ts) — wire-format tests.
- [`tests/integration/shared/cdp/evaluate.ts`](../../../../tests/integration/shared/cdp/evaluate.ts) — cycle-in-arg and identity-preserving integration tests.
- [upstream pattern reference](https://github.com/cloudflare/playwright/blob/main/packages/playwright-core/src/server/chromium/crExecutionContext.ts#L59) — upstream pattern reference.
- ADR-0002 (single-process architecture) — single-process informed that the wire-boundary encoding was unnecessary.
