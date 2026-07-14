# Writing Code Examples in Markdown Docs

This guide explains how to write TypeScript code examples in markdown documentation that are automatically verified for type-correctness.

## Why Verify Examples?

Code examples in docs can silently drift out of sync with the API. The example verifier (`scripts/docs/verify-examples.ts`) extracts every TypeScript code block from markdown, writes it as a real `.ts` file, and runs the project's TypeScript checker. If an example doesn't compile, CI fails — catching broken imports, renamed exports, and type errors before they reach readers.

## Running the Verifier

```sh
# Verify the default docs
pnpm docs:typecheck

# Format code blocks in default docs
pnpm docs:format

# Verify specific files
pnpm tsx scripts/docs/verify-examples.ts docs/guides/my-guide.md docs/other.md

# Format specific files
pnpm tsx scripts/docs/verify-examples.ts --format docs/guides/my-guide.md
```

## How It Works

1. The verifier scans markdown files for ` ```typescript ` and ` ```ts ` fenced code blocks.
2. Each block is extracted and may be transformed based on its **mode** (see below).
3. Blocks are written as individual `.ts` files under `.tmp/docs-verify/` alongside a generated `tsconfig.json`.
4. `tsgo --noEmit` is run against the directory.
5. Results are reported per-block. The temp directory is cleaned up automatically.

## Verification Modes

Control how each code block is handled by placing an **HTML marker comment** on the line(s) immediately before the code fence. The marker must be within 500 characters of the opening backticks.

### `default` — No marker

Code is type-checked as-is. Use this for self-contained examples that compile without any extra declarations.

````markdown
```typescript
import { Effect } from "effect";

const program = Effect.succeed(42);
```
````

````

### `stubs` — `<!-- verify:stubs -->`

Prepends built-in stub declarations so you can reference fictional runtime values (`extractData()`, `inputs`, `env`, etc.) without importing anything real. This is the most common mode for guide examples.

<!-- verify:ignore -->

```markdown
<!-- verify:stubs -->
```typescript
import { Cdp } from "@effect-libs/browser-cdp";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const cdp = yield* Cdp;
  const data = yield* cdp.withSession({ provider }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
      return yield* page.evaluate(() => extractData());
    }),
  );
});
````

````

#### Built-in stubs

The following ambient declarations are automatically available in `stubs` mode:

```typescript
declare function extractData(): unknown;
declare const inputs: { superpower: string; features_used: string[]; coolest_build: string };
declare const env: {
  MYBROWSER: unknown;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  CDP_URL?: string;
  STEEL_API_KEY: string;
};
````

### Custom stubs — `<!-- verify:stubs:<text> -->`

Add your own type declarations on top of the built-in stubs. Useful when an example references a type or function not in the default stubs.

<!-- verify:ignore -->

````markdown
<!-- verify:stubs -->
<!-- verify:stubs:declare const provider: { createSession: () => Effect.Effect<{ id: string }> } -->

```typescript
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const session = yield* provider.createSession();
  console.log(session.id);
});
```
````

````

### `raw` — `<!-- verify:raw -->`

Code is written to disk exactly as-is — no stubs, no auto-wrapping, no transformations. Use this for complete, self-contained examples that should compile without any help.

```markdown
<!-- verify:raw -->
```typescript
const x: number = 1 + 2;
console.log(x);

````

````

### `ignore` — `<!-- verify:ignore -->`

Block is skipped entirely. Use for pseudocode, partial snippets, or examples that intentionally demonstrate incorrect usage.

```markdown
<!-- verify:ignore -->
```typescript
// Pseudocode — not runnable
const result = yield* someOperation();
````

````

## Auto-Wrapping

Code blocks in `default` and `stubs` mode are scanned for **top-level `yield*`** expressions. If found, the verifier:

1. Separates `import` lines from the body.
2. Adds `import { Effect } from "effect";` if no `"effect"` import is present.
3. Wraps the body in `Effect.gen(function* () { ... })`.

This means you can write natural Effect examples with `yield*` and the verifier makes them syntactically valid:

<!-- verify:ignore -->

```markdown
<!-- verify:stubs -->
```typescript
import { Cdp } from "@effect-libs/browser-cdp";

// This looks like it uses yield* at the top level...
const cdp = yield* Cdp;
const result = yield* cdp.withSession({ provider }, ({ page }) =>
  Effect.gen(function* () {
    yield* page.goto("https://example.com");
  }),
);
````

````

The generated `.ts` file becomes:

<!-- verify:ignore -->

```typescript
import { Effect } from "effect";
import { Cdp } from "@effect-libs/browser-cdp";

const __docExample = Effect.gen(function* () {
  const cdp = yield* Cdp;
  const result = yield* cdp.withSession({ provider }, ({ page }) =>
    Effect.gen(function* () {
      yield* page.goto("https://example.com");
    }),
  );
});
````

### When auto-wrap does NOT apply

- **`raw` mode** — never transformed.
- **`ignore` mode** — block is skipped entirely.
- **No top-level `yield*`** — code that doesn't use `yield*` at the outermost scope is written as-is (e.g., a simple `Effect.succeed(42)` example).

## Tips for Writing Verifiable Examples

### Do

- **Use `stubs` mode** for most guide examples — it provides `extractData()`, `env`, etc. so examples read naturally.
- **Import what you use** — the verifier runs against the real project's `tsconfig.json`, so imports resolve against the actual source.
- **Keep examples short** — one concept per block. Long blocks are harder to debug when they fail.
- **Run `pnpm docs:typecheck`** before pushing docs changes.

### Don't

- **Don't reference undeclared variables** in `default` mode — there are no stubs. Either declare them inline, switch to `stubs` mode, or add custom stubs.
- **Don't nest `yield*` inside a plain function** and expect auto-wrap — the wrap only happens when `yield*` is detected at the module's top level (brace depth 0). If you're inside a function body, you're responsible for making the code valid.
- **Don't put marker comments too far from the code block** — markers must be within 500 characters before the opening backticks.

## Default Verified Files

When run without arguments (`pnpm docs:typecheck`), the verifier walks `docs/` recursively and type-checks every markdown file with a TypeScript code block. This includes all user docs (`packages/`, `providers/`, `guides/`, `reference/`, `comparisons/`) and the contributing guides.

To verify a specific file or set of files, pass them as arguments:

```sh
pnpm tsx scripts/docs/verify-examples.ts docs/guides/my-guide.md
```

## Architecture

```
scripts/docs/verify-examples.ts
  ├─ extractCodeBlocks()      — Parse markdown, find blocks + modes
  ├─ generateCode()           — Apply stubs, auto-wrap, normalisation
  ├─ prepareVerifyDirectory() — Write .ts files + tsconfig.json
  ├─ runTypecheck()           — Execute tsgo --noEmit
  └─ program()                — Orchestrate + report results
```

The temp directory (`.tmp/docs-verify/`) is created fresh each run and removed on completion or failure via `Effect.acquireRelease`.
