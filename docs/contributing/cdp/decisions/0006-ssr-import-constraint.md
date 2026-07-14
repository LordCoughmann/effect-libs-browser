# ADR-0006: No imports inside `evaluate` payload arrow bodies

> Functions passed to `evaluatePage` / `evaluateHandle` are serialized via `.toString()` and executed in the browser. Any import referenced inside the arrow body is transformed by Vite's SSR bundler on the workerd runtime path, emitting `__vite_ssr_import_0__` references that don't exist in the browser execution context.

**Status:** Accepted
**Date:** 2026-07-04
**Source:** Filed after the `b897201` regression broke 45 workerd integration tests (all `ElementContent` / `ElementState` / `Locator` methods). The `extractElementOption<T>` and `extractElementStrict<T>` helper extractions were reverted; this ADR is the rule that prevents future re-extraction attempts.

## Context

The `@effect-libs/browser-cdp` `evaluatePage` / `evaluateHandle` pipeline (see ADR-0004) takes a user-supplied function, calls `.toString()` on it, and ships the resulting source to the browser via `Runtime.callFunctionOn` + `UtilityScript.evaluate`. On the **node** vitest runtime, the function body is bundled and `.toString()` returns a clean native source. On the **workerd** vitest runtime (`@cloudflare/vitest-pool-workers`), the bundler uses Vite's SSR-mode module graph, and any import referenced inside the function body gets re-written to:

```javascript
__vite_ssr_import_0__.Predicate.isString(passed)
```

instead of the original:

```javascript
Predicate.isString(passed)
```

`__vite_ssr_import_0__` is a Vite-SSR-only global. It's defined in workerd's module graph but **not** in the browser's execution context. When the browser tries to evaluate the rewritten function body, it throws:

```
ReferenceError: __vite_ssr_import_0__ is not defined
```

The same shape applies to **any** import, not just Effect's. Anything Vite SSR-bundles into a module import — `effect`, `devtools-protocol`, `@effect-libs/browser` — will produce this error if it's referenced inside an evaluate-payload arrow body.

### Why this didn't surface until now

The regression landed in commit `b897201 refactor(cdp): extract element extraction helpers`. Before that commit, each `textContentElement` / `innerTextElement` / `innerHtmlElement` / `getElementAttribute` had its own inline arrow that only used DOM property access (`.textContent`, `.innerHTML`, `.getAttribute(name)`) — no imported helpers. After the extraction, all four share a single arrow that calls `Predicate.isString(passed)` to discriminate between a bare selector and a `[selector, ...args]` array. That one `Predicate.isString` reference is enough to trigger Vite SSR injection.

The workerd integration suite hadn't been run against the post-`b897201` code, so the failure stayed latent.

## Decision

**Code passed to `evaluatePage` / `evaluateHandle` (i.e., function bodies that will be `.toString()`'d and sent to the browser) must not reference any imported symbol.** Use native JavaScript primitives for type discrimination and value checks.

Specifically:

- ✅ `typeof x === "string"` instead of `Predicate.isString(x)`
- ✅ `Array.isArray(x)` instead of `Predicate.isArray(x)` (when `x` is already a local closure var, not imported)
- ✅ `x instanceof Date` instead of `Predicate.isDate(x)`
- ✅ `x === null` / `x === undefined` instead of `Predicate.isNullable(x)`
- ❌ Any reference to a name that comes from an `import` statement, anywhere in the arrow body — including transitive helpers from `@effect-libs/browser` or `effect`

The function body's lexical scope can still **close over** imported values captured at the call site, but those values must be passed as **arguments** (`extract(el)` is fine because `extract` is a closure-captured parameter from the surrounding `Effect.gen`, not an import). The rule is about **direct references to imported identifiers inside the arrow's source**.

### How to recognize the rule in code

<!-- verify:ignore -->

```typescript
// ❌ BAD — Predicate is imported; reference injects __vite_ssr_import_0__
(passed: unknown) => {
  const sel = Predicate.isString(passed) ? passed : passed[0];
  // ...
}

// ✅ GOOD — `typeof` is a JS operator, no module reference
(passed: unknown) => {
  const sel = typeof passed === "string" ? passed : passed[0];
  // ...
}

// ✅ ALSO GOOD — `extract` is a closure parameter, not an import
(passed: unknown) => {
  const el = document.querySelector(sel);
  return el ? extract(el) : null;
}
```

### Lint rule enforcement

`oxlint`'s `effect/prefer-effect-is` rule pushes toward `Predicate.isString` for composability. That rule is disabled for `packages/browser-cdp/src/internal/Page/**` in `oxlint.config.ts`, with the suppression comment pointing here. If a new file under that directory uses `evaluatePage` / `evaluateHandle`, it inherits the same suppression — that's intentional, not a leak.

## Consequences

- **All 45 workerd integration tests pass again** (`ElementContent`, `ElementState`, `Locator` methods, page-check, page-element-state parity). Confirmed by re-running `pnpm test:integration --runtime workerd` after reverting `ElementContent.ts` and `ElementState.ts` to per-method arrows.
- **Node integration tests are unchanged** — node's vitest bundler doesn't apply the SSR rewrite, so the prior behavior is preserved.
- **The rule is visible at the call site** — `ElementContent.ts` and `ElementState.ts` carry a file-header blockquote explaining the constraint, with a link back to this ADR. Inline `// Inline arrow body — see file header.` comments mark each `evaluatePage` arrow.
- **Per-file lint override** — `effect/prefer-effect-is` is disabled for `packages/browser-cdp/src/internal/Page/**` in `oxlint.config.ts` with this ADR as the rationale. New `evaluatePage` call sites in that directory inherit the suppression automatically.
- **Future `evaluatePage` call sites get it right by default** — the file header + ADR + lint override make the constraint visible at the call site rather than surfacing as a workerd-only failure.
- **Duplication is the cost.** Each method repeats the `waitForSelectorElement` + `evaluatePage` + arrow scaffold (~5 lines × N methods). This is acceptable because the alternative — sharing via a closure-captured callback — is structurally incompatible with `.toString()`-based serialization.

## Alternatives considered

- **Disable Vite SSR for the affected files** (`vitest.integration.workerd.config.ts` `optimizeDeps.exclude`). Rejected — it papers over the constraint without explaining it, and any future `evaluatePage` call site in any file would silently reintroduce the bug.
- **Wrap every evaluate-payload function in a helper that pre-resolves imports** before `.toString()`. Rejected — adds runtime indirection, breaks the symmetry between node and workerd, and obscures what's actually safe to put in a payload.
- **Pre-process the function body to strip `__vite_ssr_import_0__` references**. Rejected — it's a bundler-private symbol; relying on Vite's internals to keep its name stable is fragile.
- **Use a string-based template for evaluate payloads** instead of `.toString()` of a closure. Rejected — already the pattern for cases where the function body needs imports; the closure-based path is preferred for type safety (TypeScript catches typos in property accesses at compile time).
- **Replace `Predicate.isString` with `typeof x === "string"` while keeping the `extractElementOption<T>` helper.** Tried and rejected. Even with native JS in place of imports, the helper still closure-captures the `extract` parameter into the arrow body. `Function.prototype.toString()` doesn't serialize closures, so the browser sees `ReferenceError: extract is not defined`. The only viable fix is to revert to per-method arrows with directly inlined DOM access.

## See also

- ADR-0004 (`Runtime.callFunctionOn` migration) — explains how payloads reach the browser via `UtilityScript.evaluate`.
- [`packages/browser-cdp/src/internal/Page/ElementContent.ts`](../../../../packages/browser-cdp/src/internal/Page/ElementContent.ts) — the file where the regression landed; reverted to per-method arrows with a file-header comment that points here.
- [`packages/browser-cdp/src/internal/Page/ElementState.ts`](../../../../packages/browser-cdp/src/internal/Page/ElementState.ts) — same pattern; same revert; same file-header comment.
- [`oxlint.config.ts`](../../../../oxlint.config.ts) — per-file `effect/prefer-effect-is: off` for `packages/browser-cdp/src/internal/Page/**`, with this ADR as the rationale.
- [`docs/contributing/testing/fallow.md`](../../testing/fallow.md) — marks `ElementContent.ts` and `ElementState.ts` duplication as **intentional**, with a pointer back here.
- `pnpm test:integration --runtime workerd` — verification command. Before this revert: 45 failures with `ReferenceError: __vite_ssr_import_0__ is not defined`. After: all green.
