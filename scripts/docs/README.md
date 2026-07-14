# Doc Example Verification

This directory contains tooling to verify that TypeScript code blocks in markdown documentation actually compile.

## Quick Start

```bash
# Verify default docs
pnpm tsx scripts/docs/verify-examples.ts

# Verify specific files
pnpm tsx scripts/docs/verify-examples.ts docs/guides/scoping.md docs/faq.md
```

## How It Works

The `verify-examples.ts` script:

1. **Extracts** TypeScript code blocks from markdown files (`typescript or `ts fences)
2. **Transforms** each block based on its verification mode (see below)
3. **Compiles** each block using TypeScript's Language Service API against the project's tsconfig
4. **Reports** pass/fail status for each block, exiting with code 1 if any fail

## Verification Modes

Control behavior by placing HTML comments **before** the code block:

### Default Mode (no comment)

Compile as-is, with auto-wrapping only:

````markdown
```typescript
import { Effect } from "effect";
const hello = Effect.succeed("world");
```
````

````

- No stubs prepended
- If the block has top-level `yield*` without an `Effect.gen`, it's auto-wrapped in `Effect.gen(function* () { ... })`

### Stubs Mode

```markdown
<!-- verify:stubs -->
```typescript
const data = yield* page.evaluate(() => extractData());
````

````

- Prepends fictional-code stub declarations (see below)
- Auto-wraps in Effect.gen if needed
- Use when an example intentionally references placeholder functions/variables that aren't real imports

### Raw Mode

```markdown
<!-- verify:raw -->
```typescript
import { Effect } from "effect";
const hello = Effect.succeed("world");
````

````

- Compile exactly as written — no stubs, no wrapping
- Use for self-contained examples that must compile without any transformation

### Ignore Mode

```markdown
<!-- verify:ignore -->
```typescript
// This won't be verified at all
const x = someUndefinedVariable;
````

````

- Skip verification entirely
- Use for pseudo-code, incomplete examples, or code that intentionally shows errors

## Stubs

**Stubs** are TypeScript `declare` statements for fictional names used in documentation examples. They allow examples to reference placeholder functions/variables without requiring real implementations.

### Why Stubs?

Documentation often shows simplified examples:

```typescript
// In a doc, this is meant as a placeholder:
const data = yield* page.evaluate(() => extractData());
````

`extractData()` isn't a real function — it's a stand-in for "whatever the user wants to extract." Without a stub, TypeScript would error: `Cannot find name 'extractData'`.

**Stubs are purely for type-checking — they are never executed.** Since `declare` statements produce no JavaScript output and the script compiles with `noEmit: true`, the stubs exist solely to satisfy the compiler's name-resolution pass. Nothing is written to disk and nothing is ever run.

**Stubs are opt-in.** By default, the verifier compiles code as-is. This ensures that doc examples with missing imports fail verification rather than being silently covered by stubs. Use `<!-- verify:stubs -->` when an example intentionally uses fictional placeholders.

### Current Stubs

```typescript
declare function extractData(): unknown;
declare function extractDashboardData(): unknown;
declare const inputs: { superpower: string; features_used: string[]; coolest_build: string };
declare const env: {
  MYBROWSER: unknown;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  CDP_URL?: string;
};
```

| Stub                     | Purpose                                                  | Used In                                                                                           |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `extractData()`          | Generic placeholder for "extract whatever data you want" | `why-effect.md`, `comparisons/side-by-side.md`                                                    |
| `extractDashboardData()` | Dashboard-specific extraction placeholder                | `scoping.md`, `advanced-scoping.md`                                                               |
| `inputs`                 | Form input object for AI automation examples             | `comparisons/side-by-side.md`                                                                     |
| `env`                    | Cloudflare Workers environment bindings                  | `getting-started.md`, `cloudflare-workers.md`, `cf-browser-run.md`, `comparisons/side-by-side.md` |

### Adding New Stubs

Edit the `STUBS` constant in `verify-examples.ts`:

```typescript
const STUBS = `
// -- Stubs for fictional code used in examples --
declare function extractData(): unknown;
declare function myNewPlaceholder(): string;  // <-- Add here
// -- End stubs --

`;
```

Guidelines for adding stubs:

- Use `unknown` return types when the shape doesn't matter
- Use specific types when the example needs to show property access
- Keep stubs minimal — only what's needed for the examples to compile

### When to Use `<!-- verify:stubs -->`

Use it when a code block references any of the stub names above. If you're not sure, try running the verifier without the directive — if it fails with `Cannot find name 'X'`, either add `<!-- verify:stubs -->` (if `X` is a fictional placeholder) or fix the import (if `X` should be a real import).

## Files

```
scripts/docs/
├── README.md              # This file
├── verify-examples.ts     # Main verification script
└── fixtures/
    └── test-examples.md   # Test file exercising all verification modes
```

## Testing the Verifier

The `fixtures/test-examples.md` file contains examples for each verification mode. Run it to verify the verifier itself works:

```bash
pnpm tsx scripts/docs/verify-examples.ts scripts/docs/fixtures/test-examples.md
```

## CI Integration

The script exits with code 1 if any code block fails to compile, making it suitable for CI pipelines. Example:

```yaml
# In a GitHub Actions workflow
- name: Verify doc examples
  run: pnpm tsx scripts/docs/verify-examples.ts
```

## Troubleshooting

### "Cannot find name 'X'"

The example uses a name that isn't imported. Either:

1. Add `<!-- verify:stubs -->` if `X` is an intentional placeholder (and add a stub for it in `verify-examples.ts` if needed)
2. Fix the import path if `X` should be a real import
3. Add `<!-- verify:ignore -->` if the example is intentionally incomplete

### "Block has yield\* but no Effect.gen"

This is expected behavior — the script auto-wraps such blocks. If you see a compilation error after wrapping, the issue is likely in the code itself, not the wrapping.

### "Module not found"

The example imports a module that doesn't exist. Either:

1. Fix the import path
2. Use `<!-- verify:ignore -->` if the import is illustrative only
