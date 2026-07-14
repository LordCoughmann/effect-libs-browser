# ADR-0005: Tagged-Error Guard Pattern (`Predicate.isTagged` over `instanceof`)

> All Node-context error discrimination uses `Predicate.isTagged(tag)(value)`. Browser-context `instanceof` against JS builtins is the deliberate exception. Centralized type guards in `CdpError.ts`.

**Status:** Accepted
**Date:** 2026-07-02
**Source:** Shipped in P16 (see git history; the phase log lived in `packages/browser-cdp/src/CDP_PROGRESS.md`, now consolidated into this directory).

## Context

`@effect-libs/browser-cdp` error classes are `Schema.TaggedErrorClass` (`CdpError`, `SelectorError`, `EvaluationError`, `ConnectionError`, `ContextNotSupportedError`, `NavigationError`, `PageTimeoutError`, `CommandError`). Each has a stable `_tag` discriminant.

Pre-P16, error discrimination used `instanceof CdpError` / `instanceof SelectorError` / `instanceof EvaluationError` checks. This violated the v4 skill's "Never use `as` casts" rule and was paired with `(x as { description: string })` casts to extract fields.

Two structural problems with `instanceof X` for tagged errors:

1. **Cross-realm fragility.** In the browser context, the `@effect-libs/browser-cdp` class isn't shipped (so `instanceof CdpError` always returns `false`). In worker contexts (`workerd`), structured-cloned errors lose class identity. Cross-`MessagePort` transfers do the same.
2. **Idiomatic mismatch.** v4 ships `Predicate.isTagged(tag)` and `Cause.isTimeoutError(cause)` for tagged-error matching. The v4 idiomatic check is `Predicate.isTagged(tag)(value)`, which inspects the `_tag` discriminant directly and works across `structuredClone` / `MessagePort` / cross-realm boundaries.

`Schema.TaggedErrorClass` does NOT auto-generate a `.is()` static method (verified against `effect-smol/packages/effect/src/Schema.ts`). So users need either `Predicate.isTagged(...)` or to write their own `.is()` static. We chose the former for consistency with the rest of the codebase.

## Decision

- All Node-context error discrimination uses `Predicate.isTagged(tag)(value)`.
- Three type guards centralized in [`packages/browser-cdp/src/CdpError.ts`](../../../../packages/browser-cdp/src/CdpError.ts):
  - `isCdpError(u: unknown): u is CdpError` → `Predicate.isTagged("effect-libs/browser/CdpError")(u)`.
  - `isSelectorError(u: unknown): u is SelectorError` → `Predicate.isTagged("effect-libs/browser/CdpError/SelectorError")(u)`.
  - `isEvaluationError(u: unknown): u is EvaluationError` → `Predicate.isTagged("effect-libs/browser/CdpError/EvaluationError")(u)`.
- 14 call sites across 13 files updated (P16 commit; see git history for the full list).

## What STAYS `instanceof` (deliberate exceptions)

**Browser-context code** is the only category that keeps `instanceof`. In the page context, Effect is not available; only JS builtins exist.

The classification is simple: a file is "browser-context" if it ships code into the page (via `Runtime.callFunctionOn` / `Runtime.evaluate` / `Page.addScriptToEvaluateOnNewDocument`) OR if it runs in the `preSerialize` Node-side helper that prepares user args for the page.

Browser-context files where `instanceof` is correct:

| File                                                               | `instanceof` targets                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `internal/Page/Evaluate/serialization/utilityScriptSerializers.ts` | 🚫 VENDORED — per AGENTS.md "Boundaries"                                                    |
| `internal/Page/Util/browserSerializer.ts`                          | `Date`, `URL`, `RegExp`, `Error`, `Map`, `Set`, `ArrayBuffer`, `Window`, `Document`, `Node` |
| `internal/Page/UtilityScript.ts` (the browser-side body)           | JS builtins                                                                                 |
| `internal/Page/Evaluate.ts` (lines 225–231, `preSerialize` only)   | JS builtins                                                                                 |
| `Click.ts:514` (`hit instanceof Element`)                          | DOM API; inside a function body that gets serialized and sent to the browser                |
| `SetInputFiles.ts:80` (`el instanceof HTMLInputElement`)           | DOM API; same rationale                                                                     |

**Rule:** if `instanceof X` is checked in browser-context code and `X` is a JS builtin (or a DOM class), it's correct. If `X` is a `Schema.TaggedErrorClass` subclass, it's a bug — `@effect-libs/browser-cdp` classes are never shipped into the page, so the check always returns `false` and the branch is dead code.

## Classification rule for future audits

For each `instanceof` call in `packages/browser-cdp/src/`:

1. Is the code browser-context (no `effect` import; or runs in `preSerialize`; or ships into the page)? → If yes, allowed. If no, audit.
2. Is the target a JS builtin (`Error`, `Date`, `Map`, `Set`, `RegExp`, `ArrayBuffer`, etc.) or a DOM class? → Allowed.
3. Is the target a `Schema.TaggedErrorClass` subclass? → **BUG**. Replace with `Predicate.isTagged(tag)(value)` or `Effect.catchTag`.
4. Is the target a non-error CDP type (`CdpConnection`, `CdpHandle`, etc.)? → CASE-BY-CASE. Often a bug; sometimes intentional (type-only re-exports).

Grep command for the next audit:

```bash
cd packages/browser-cdp/src
grep -rn "instanceof " internal/Page/ CdpPage.ts internal/CdpPage.ts 2>/dev/null \
  | grep -v "node_modules" | grep -v "serialization/utilityScriptSerializers"
```

## Consequences

- **Tagged errors now survive `structuredClone`, `MessagePort`, and cross-realm boundaries** — class identity is irrelevant; `_tag` is sufficient.
- **Type guards are centralized.** Three exports in `CdpError.ts`; 14 call sites use them. Future error types get a one-line addition to `CdpError.ts` plus a `Predicate.isTagged(...)` call site.
- **Behavior preserved.** `Predicate.isTagged(tag)(value)` is exact-equivalent to `value instanceof TaggedErrorClass` for any class generated by `Schema.TaggedErrorClass` in the same module. The P16 refactor is behavior-preserving.
- **~40 LOC reduction across the affected files** (mostly the dropped `as { description: string }` casts and the trimmed `Predicate` imports).
- **6 stale `import { ..., Predicate } from "effect"` lines dropped** from files that no longer use `Predicate` after the refactor (`SetInputFiles`, `DispatchEvent`, `DragAndDrop`, `ScrollIntoView`, `BoundingBox`, `EvalOnSelector`).

## Alternatives considered

- **Continue using `instanceof X` everywhere.** Rejected. Cross-realm fragility, v4 idiomatic mismatch, and the dead-code risk in browser context.
- **Add a `.is()` static method to each tagged error class.** Rejected. Adds boilerplate; `Predicate.isTagged` is the v4 idiom and works across all error types with the same shape.
- **Use `Effect.catchTag` at every call site instead of type guards.** Considered. `Effect.catchTag` is correct when the call site is in the error channel; for sync helpers like `ensureCdpError` (Pattern B in P16) the call site is on the value side, where a type guard is the right fit. The mixed approach is intentional.

## See also

- [`packages/browser-cdp/src/CdpError.ts`](../../../../packages/browser-cdp/src/CdpError.ts) — type guard exports.
- [`packages/browser-cdp/src/internal/Page/SetInputFiles.ts`](../../../../packages/browser-cdp/src/internal/Page/SetInputFiles.ts) — Pattern A example.
- [`packages/browser-cdp/src/internal/Page/Click.ts`](../../../../packages/browser-cdp/src/internal/Page/Click.ts) — Pattern B example.
- [`packages/browser-cdp/src/internal/Page/Evaluate.ts`](../../../../packages/browser-cdp/src/internal/Page/Evaluate.ts) — Pattern C example.
- [`packages/browser-cdp/src/internal/Page/FrameLocator.ts`](../../../../packages/browser-cdp/src/internal/Page/FrameLocator.ts) — Pattern D example.
- P16 commit history (git log `--grep='P16'` for the audit inventory).
- ADR-0002 (single-process architecture) — informs which call sites are Node-context vs browser-context.
