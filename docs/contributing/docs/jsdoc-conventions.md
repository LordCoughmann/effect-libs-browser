# JSDoc Conventions

How to write JSDoc for the public API surface of `@effect-libs/browser`.
Mirrors the conventions used by the `effect-smol` codebase (see
[the Effect skills reference][effect-skills] for the upstream rationale).

These rules were established during a documentation cleanup pass that
aligned the public clients (`Cdp`, `Playwright`, `Stagehand`, the four
providers, the base `BrowserProvider` type, and the three utility
files) to a single canonical form. The internal/, type/, and error/
files are deferred to a follow-up sweep — apply these conventions as
you touch them.

[effect-skills]: https://github.com/Effect-TS/skills

## Consumer Surface

The **class declaration's JSDoc is what consumers see on IDE hover** —
not the top-level file JSDoc. Put the rich content (When to use,
Mental model, Example, Gotchas) on the class, and keep the top-level
JSDoc to a brief 4–5 line file-purpose header that points at the
class.

Canonical structure (see `packages/browser-playwright/src/Playwright.ts`):

<!-- verify:ignore -->

````typescript
/**
 * Defines the `X` service, which [one-line role description].
 *
 * [Optional one-line caveat (e.g. **Experimental.**)] [One sentence
 * about scope / when to pick it.] See the {@link X} class below for
 * the consumer-facing documentation (mental model, common tasks,
 * example, gotchas).
 */

import { ... };

// ... implementation ...

/**
 * Service tag for the X browser service.
 *
 * **When to use**
 *
 * [Positive case]. [Cross-module comparison to the 2 siblings].
 *
 * **Mental model**            ← top-level only
 *
 * [Conceptual framing of the API surface]
 *
 * **Common tasks**            ← top-level only
 *
 * - [Task 1]
 * - [Task 2]
 *
 * **Example** (Title)         ← multiple OK
 *
 * ```ts
 * // Self-contained, imports from @effect-libs/browser-...
 * ```
 *
 * **Gotchas**
 *
 * - [Real footgun identified by reading the implementation]
 *
 * @see {@link XService} for the full service contract
 *
 * @category services
 * @since 0.1.0
 */
export class X extends Context.Service<X, XService>()(...) {}
````

## Purpose of JSDoc

Every JSDoc on the public API surface should answer three questions
for the consumer reading the IDE hover:

1. **What is this thing?** — a definition. 1 line, scope-relative
   for fields ("the X for this scope"), definitional for types
   ("A X is a [definition]"), verb-led for methods ("Creates a
   fresh X").
2. **What should I use it for?** — use-case prose. 1–2 sentences
   on the method, with the verb-led pattern ("Use for X" /
   "Use to Y" / "Use when Z").
3. **What should I expect?** — lifetime (when is it cleaned up),
   errors, gotchas. The lifetime line is on the field, not the
   type, because the type is not scoped to a callback; the field is.

These three questions drive every convention below. If your JSDoc
doesn't answer all three, it's missing something.

## Punctuation: em-dash vs parentheses

Use **em-dash (—)** for definitions, rephrasings, consequences, and
subordinate clauses that are essential to the main clause:

- "The default Playwright page — a browser tab scoped to this session."
- "human-in-the-loop flows — where an operator logged in elsewhere — use X"
- "`releaseSession` is a soft release — it sets the session's status to..."
- "is heuristic — it inspects the underlying cause for a numeric HTTP status."

Use **parentheses (())** for side clarifications, lists of examples,
and "e.g." style additions:

- "Page navigation failed (e.g., net::ERR_CONNECTION_REFUSED, timeout)."
- "Provider features and limits (timeouts, live view, recording, billing) vary by provider."
- "Every concrete provider (Steel, Browserbase, Cloudflare Browser Run HTTP and Binding)."

**Don't** use em-dash for examples. **Don't** use parens for
definitions. The distinction is the same one mainstream TypeScript
libraries (TypeScript stdlib, React, Node, Effect) and English
style guides follow. The codebase already uses both with this
semantic distinction — codify it.

## Articles: The vs a

Use **"the"** when there's a single referable instance in scope:

- "The default Playwright page" (one per scope)
- "The connection handle" (one per scope)
- "The remote browser instance for this scope" (one per scope)
- "The fields every provider session exposes" (one type's contents)

Use **"a"** when defining a term in the abstract:

- "A session is a single remote browser instance" (type-level definition)
- "A general page operation failed" (error class description)

Use **verb-led** for actions (no article issue — the verb carries
the meaning):

- "Creates a fresh browser session."
- "Connects to an existing browser."

The rule: "the" is for specific instances the consumer has; "a" is
for definitional/categorical. Method JSDocs almost always use the
verb-led form.

## Standardized wording

### Lifetime — passive voice, past participle

Three lifetime patterns, all consistent:

- **Callback variant** (`withX`): "Cleaned up automatically when the callback returns."
- **Scope variant** (`acquireX`): "Cleaned up when the scope ends."
- **Full disclosure** (when scope hygiene matters): "The session, connection, context, and page are cleaned up when the scope ends. Close with `Effect.scoped` or a long-lived `Scope.make()`."

Always **passive voice, past participle** ("Cleaned up" not "Cleans
up"). The framework does the action; the resource is the recipient.
This matches Rust's "is dropped", Go's "is executed", Java's "is
closed", Python's "is called", Node's "is released". "Cleans up"
sounds like the resource has agency — it doesn't.

### Use cases — verb-led

- **Method, callback variant**: "Use for X" / "Use to Y" / "Use when Z"
- **Method, scope variant**: "Use for X" / "Use to Y"
- **Field, identity + link**: "The X handle. See {@link X}." (handles only)

### Definitions — three patterns

- **Field, scope-relative**: "The X for this scope — a [definition]."
- **Type, definitional**: "A X is a [definition]."
- **Field, identity + link**: "The X. See {@link X}." (handles)

## Library-neutral phrasing

Don't say library-internal jargon in JSDoc — use consumer-facing
phrasings:

| ❌ Don't say                                              | ✅ Say                                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| "Connects the Effect runtime to an existing browser"      | "Connects to an existing browser"                                                 |
| "Resources are cleaned up"                                | "The session, connection, context, and page are cleaned up"                       |
| "Provider-specific semantics"                             | "Provider features and limits"                                                    |
| "Spawns a resource bound to the caller's ambient `Scope`" | "Returns the resource; close with `Effect.scoped` or a long-lived `Scope.make()`" |
| "The surrounding framework"                               | (just don't mention it; the library IS the framework)                             |

Consumers think "I want a browser", not "I want to connect the
Effect runtime to a browser". The library vocabulary is for
maintainers; the consumer vocabulary is for users.

## Three-level discovery flow

For fields whose type is a documented symbol (handle, page, session),
documentation is layered across three surfaces:

- **Level 1 (scope field JSDoc)**: 1-line preview, "navigate, click,
  read content, capture state" + link to type. Audience: consumer
  hovering on `page:` in a destructure.
- **Level 2 (type field/method JSDoc)**: per-name semantic description,
  `@param`, `@returns`, `@example`, gotchas. Audience: consumer typing
  `page.goto` and hovering completion.
- **Level 3 (TypeScript signature)**: the actual type, visible on
  hover, navigable via Ctrl+Click.

The three levels should not duplicate. Level 1 is a _pointer_ with
a preview; Level 2 is the _source of truth_; Level 3 is the _type
itself_. If Level 1 is doing what Level 2 should be doing, you've
duplicated.

For methods that wrap a well-known external API (Playwright, Stagehand),
the **upstream link** is the Level 2 pointer — the method JSDoc
links to the canonical Playwright/Stagehand docs instead of
re-explaining what `goto` / `click` / `title` do. Consumers know
Playwright basics; the library adds scope-relative framing and
lifetime, not full re-documentation.

## Sections

Only these sections are allowed in JSDoc. No ad hoc markdown
headings (`## Foo`, `**Foo:**`, `### Bar`).

| Section             | Used in              | Purpose                                                                                  |
| ------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| **Mental model**    | Top-level            | Conceptual framing of the API surface. **Not used in provider files.**                   |
| **When to use**     | Class                | Positive case + cross-module / cross-provider comparison.                                |
| **Common tasks**    | Top-level            | Bullet list of typical uses.                                                             |
| **Gotchas**         | Top-level + Class    | Real footguns identified by reading the implementation (not best-practice generalities). |
| **Example** (Title) | Top-level + Class    | One per concrete use case. The parenthetical title is the heading.                       |
| **Quickstart**      | Top-level (optional) | One full end-to-end runnable example, used at the file root.                             |
| **See also**        | Top-level (optional) | Plain-text cross-references to sibling clients.                                          |

`Mental model` is for top-level only on services and the base
`BrowserProvider`. Provider files skip it — the When-to-use + Example

- Gotchas pattern is enough, because the same Mental model would
  duplicate across all four providers and add no signal.

## Tags

- `@category <name>` — **required for root declarations.** Drop
  `@module` entirely (effect-smol uses `@category` in 496 files and
  `@module` in zero).
- `@since <version>` — when the symbol was added.
- `@see {@link X}` — in-file references.
- `@deprecated` / `@default` / `@example` — rare; see the Effect
  skills reference for usage.

### Valid categories

The category groups root declarations in the API surface for IDE
discovery and any future doc generator. Use the values below —
don't invent new ones.

| Category       | Applies to                                                               | Used in this repo                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models`       | Pure type-level declarations: interfaces, type aliases, schemas-as-types | `packages/browser/src/BrowserProvider.ts`, `packages/browser-playwright/src/PlaywrightTypes.ts`                                                                                   |
| `services`     | `Context.Service` declarations — the consumer-facing service tag         | `packages/browser-playwright/src/Playwright.ts`, `packages/browser-cdp/src/Cdp.ts`, `packages/browser-stagehand/src/Stagehand.ts`                                                 |
| `providers`    | Provider service tags (subclass of `services`)                           | `packages/browser-providers/src/steel/SteelProvider.ts`, `packages/browser-providers/src/browserbase/BrowserbaseProvider.ts`, `packages/browser-providers/src/cf-browser-run/...` |
| `errors`       | Error classes (Effect `Schema.TaggedError` or similar)                   | `packages/browser-playwright/src/PlaywrightError.ts`                                                                                                                              |
| `types`        | Standalone type aliases (union types, branded types)                     | `packages/browser-playwright/src/PlaywrightError.ts` (e.g. `PlaywrightErrorReason`)                                                                                               |
| `schemas`      | Schema values (runtime schemas, distinct from types)                     | `packages/browser-playwright/src/PlaywrightError.ts` (e.g. `PlaywrightErrorReason` const)                                                                                         |
| `utilities`    | Utility helpers, internal-but-exported functions                         | `packages/browser/src/utils/error.ts`                                                                                                                                             |
| `converting`   | Type/value converters (Stagehand schemas, etc.)                          | `packages/browser-stagehand/src/SchemaConverter.ts`                                                                                                                               |
| `wrappers`     | Thin wrappers around an upstream API                                     | `packages/browser-playwright/src/internal/Playwright*.ts` (Page, Locator, Frame, etc.)                                                                                            |
| `constructors` | Factory methods on a class (e.g. `Layer.layer`, `Context.make`)          | Same `internal/Playwright*.ts` files                                                                                                                                              |

**Why `models` for type-only files.** In effect-smol, `models` is the
category for the main type of a module (`Ref`, `Fiber`, `Option`,
`Context`). A file that exports only interfaces and type aliases
gets `@category models` on each root declaration. Methods on a
service get more specific categories (`constructors`, `getters`,
`mutations`); the file's main type gets `models`. The two pattern
files in this repo are pure type-level, so every root declaration
gets `models`.

**Don't mix categories on the same file** without a reason. If a
file mixes a type interface (`models`) and a service class
(`services`), the file is doing two things — split it, or
re-examine whether the categories are right.

**Tag order** (mirrors effect-smol):
`@deprecated` → `@default` → `@see` → `@category` → `@since`

`@see` is allowed on a field only when the type is generic (the
shape isn't visible from the field declaration) or when the `@see`
points to something _outside_ the field's own type (a related method
or sibling interface). Don't `@see` the field's own type — the
type _is_ the pointer. **TS Server strips `@see` from the parameter
hover popup**; for navigation in field JSDocs, use inline
`{@link X}` in prose.

## Examples vs `@example`

| Location                         | Use                                                 |
| -------------------------------- | --------------------------------------------------- |
| Top-level / class / function     | `**Example** (Title)` section with a code fence     |
| Type-level JSDoc (e.g. a Schema) | `@example` tag — better TS Server IDE hover support |

Mixing the two is fine; the rule is "match the location to the
format". Type-level docs use `@example` because the IDE surfaces
them differently than file-level docs, and `@example` tags nest
cleaner under type members.

## Field JSDocs: 3-tier system

The audience is the consumer hovering on a field declaration in a
destructure pattern (`({ page, session }) => ...`). Text in that
hover popup is the only thing consumers see when reading library
code. The three tiers split field JSDocs by how much info the
consumer needs on hover:

### Tier 1 (rich) — fields pointing to huge well-known APIs

For fields that point to a large, well-known external API (e.g.
`page` typed as a Playwright page with 50+ methods). The consumer
needs to discover the common operations without leaving the hover.

- 1-line definition with scope-relative framing
- 4-op preview (curated, not exhaustive)
- Upstream link
- Lifetime

<!-- verify:ignore -->

```ts
/**
 * The default Playwright page — a browser tab scoped to this session.
 * Use it to navigate, click, read content, and capture state. See
 * [Playwright's `Page` reference](https://playwright.dev/docs/api/class-page)
 * for the full API.
 *
 * Cleaned up automatically when the callback returns.
 */
readonly page: PlaywrightPage;
```

**Don't** list all methods on the field. Listing 50+ method names
on `page` would be a wall of text that drifts with every Playwright
release. The 4-op preview is curated; the link to upstream docs
covers the rest.

**Don't** put examples on field JSDocs. The 4-op preview is already
a "micro-example" (verbs, not code). Real examples belong on the
method JSDocs, which is the consumer's primary action point.

### Tier 2 (medium) — fields with a small defined shape

For fields whose type has a small, fixed set of fields (e.g.
`session` typed as `BrowserProviderSession` with `id`, `cdpUrl`,
`createdAt`, `liveViewUrl`). The consumer needs to know "what is
this and what to expect."

- 1-line definition with scope-relative framing
- Pointer to type (no field list — the type's own JSDoc covers the shape)
- Lifetime

<!-- verify:ignore -->

```ts
/**
 * The remote browser instance for this scope — a single isolated
 * browser on the provider's infrastructure, with its own cookies,
 * localStorage, and state.
 *
 * See {@link BrowserProviderSession} for the per-field shape.
 *
 * Provider features and limits (timeouts, live view, recording,
 * billing) vary by provider — see your provider's documentation.
 *
 * Cleaned up automatically when the callback returns.
 */
readonly session: S;
```

**Don't** leak the type's shape into the field JSDoc
("holds id, cdpUrl, createdAt, ..."). The shape is owned by the
type's own JSDoc; enumerating it here creates two sources of truth
that drift.

### Tier 3 (terse) — fields that are handles

For fields whose type is a handle with methods documented on the
type (e.g. `connection` typed as `PlaywrightConnectionHandle`
with `withContext`, `withPage`). The consumer needs to know
"this is a handle, click through for the methods, and it's
cleaned up at this time."

- 1-line identity + type link
- Lifetime

<!-- verify:ignore -->

```ts
/**
 * The connection handle. See {@link PlaywrightConnectionHandle}.
 *
 * Cleaned up automatically when the callback returns.
 */
readonly connection: PlaywrightConnectionHandle;
```

**Don't** add a "what to use it for" preview to handle fields.
The "what to use it for" lives on the type's method JSDocs
(`PlaywrightConnectionHandle.withContext`, `withPage`), which
the consumer can hover on after clicking through.

### Lifetime on all three tiers

The lifetime line is present on **all three tiers** because "when
is this cleaned up" is the one question that has to be answered
on the field, not the type. The type is not scoped to a callback;
the field is.

### Don't do

- ❌ Bare names list (`/** Methods: withContext, withPage. */`)
  — text the IDE doesn't resolve.
- ❌ Bullet-list shape preview (`/** Holds id, cdpUrl, createdAt, ... */`)
  — duplicates the type's own JSDoc.
- ❌ Tautological `@see` on a field (`/** @see {@link X} for all
methods */` on a field typed `X`) — the field's type _is_ the
  pointer.
- ❌ Examples on field JSDocs — belong on method JSDocs.
- ❌ Tautological phrasing (`/** The provider session. */`) — "the
  X" is what the field declaration already says.

## Method JSDocs: consumer-facing structure

Method JSDocs are the consumer's primary action point. They should
answer all three "purpose of docs" questions:

1. **1-line: what it does + lifetime** — verb-led, definite or
   indefinite article as appropriate.
2. **Use-case prose** — "Use for X" / "Use to Y" / "Use when Z".
   Tells the consumer when to pick this method over its siblings.
3. **Pointer to type** — inline `{@link ScopeType}` so the
   field-level docs are discoverable from the method hover.
4. **`@param`** for each parameter, one-sentence description.
5. **One canonical `@example`** — type-checked by `pnpm docs:typecheck`.
6. **Upstream link** (only for methods that wrap a well-known API).
7. **Lifetime line** — the same canonical wording as the field JSDoc.

Canonical structure (see `packages/browser-playwright/src/PlaywrightTypes.ts`):

<!-- verify:ignore -->

````ts
/**
 * Creates a fresh browser session. The session, connection, context,
 * and page are cleaned up automatically when the callback returns.
 *
 * Use for one-off scraping jobs, per-request clean slates, or any
 * automation that doesn't need to persist cookies or login state.
 * For human-in-the-loop flows — where an operator logged in elsewhere —
 * use {@link withConnection} instead.
 *
 * The callback receives `{ session, connection, context, page }`.
 * See [Playwright's `Browser` reference](https://playwright.dev/docs/api/class-browser)
 * for the underlying browser/session API.
 *
 * @param source - Provider service and optional session options.
 * @param fn - Callback receiving a {@link PlaywrightSessionScope}.
 *
 * @see {@link PlaywrightSessionScope} for the scope fields (hover each field for details)
 *
 * @example
 * ```typescript
 * const stories = yield* playwright.withSession({ provider }, ({ page, session }) =>
 *   Effect.gen(function* () {
 *     yield* page.goto("https://news.ycombinator.com");
 *     const id = session.id; // provider-specific session identifier
 *     // ...
 *   }),
 * );
 * ```
 */
readonly withSession: <T extends BrowserProviderSessionBase, O, A, E, R>(
  source: { readonly provider: BrowserProviderService<T, O>; readonly options?: O },
  fn: (scope: PlaywrightSessionScope<T & BrowserProviderSession>) => Effect.Effect<A, E, R>,
) => Effect.Effect<A, E | PlaywrightError | BrowserProviderError, Exclude<R, Scope.Scope>>;
````

## What NOT to do

- ❌ `@module X` — use `@category X` instead.
- ❌ `@example` on top-level / class / function JSDoc — use a
  `**Example** (Title)` section.
- ❌ Ad hoc markdown headings (`## Limitations`,
  `**Browserbase Docs:**`, `## Why This Helper?`).
- ❌ Duplicating the same content in both top-level and class JSDoc.
  Pick one (the class).
- ❌ Cross-client `{@link}` — the clients don't import each other,
  so the link won't resolve. Use plain text.
- ❌ Bare `**Example**:` (with a colon) or `**Example**: <code>`
  inline. The heading is `**Example** (Title)` — no colon, no
  inline code, code goes in a fenced block.
- ❌ Leaking the shape of a typed field into its field JSDoc
  (`"holds id, cdpUrl, createdAt, ..."`) — the shape is owned by
  the type's own JSDoc. Enumerating it here creates two sources
  of truth that drift.
- ❌ Tautological `@see` on a field (`"@see {@link X} for all
available methods"` on a field typed `X`) — the field's type
  _is_ the pointer; an explicit `@see` adds no signal.
- ❌ Re-describing in a field JSDoc what the field's type already
  documents. If `PlaywrightConnectionHandle.withContext` is
  documented in `PlaywrightConnectionHandle`'s JSDoc, the
  field JSDoc on `connection: PlaywrightConnectionHandle`
  should not duplicate that.
- ❌ "Effect runtime", "framework", "semantics", "resources" in
  JSDoc — use the library-neutral phrasings.
- ❌ "Cleans up" / "Will be cleaned up" — use "Cleaned up" (passive,
  past participle).
- ❌ Inconsistent em-dash vs parens — em-dash for definitions and
  rephrasings, parens for examples and side clarifications.
- ❌ Method JSDocs that re-explain upstream APIs (Playwright,
  Stagehand) — link to the canonical docs instead.
- ❌ Tautological `/** The X. */` field JSDocs where "the X" is
  just restating the field declaration.

## Cross-references

| Target         | Syntax                                                                          |
| -------------- | ------------------------------------------------------------------------------- |
| Same file      | `@see {@link X}`                                                                |
| Sibling module | "see the X module" (plain text)                                                 |
| External URL   | `[effect docs](https://effect.website)`                                         |
| Upstream API   | `[Playwright's \`Page\` reference](https://playwright.dev/docs/api/class-page)` |

## Canonical examples in the repo

| Form                   | File                                                                               | Sections / pattern                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Service (full)         | `packages/browser-playwright/src/Playwright.ts`                                    | When to use + Mental model + Common tasks + Example + Gotchas                                    |
| Service (experimental) | `packages/browser-cdp/src/Cdp.ts`                                                  | + "**Experimental.**" caveat at top                                                              |
| Service (LLM)          | `packages/browser-stagehand/src/Stagehand.ts`                                      | Same as Playwright, no auto-waiting note in Gotchas                                              |
| Provider               | `packages/browser-providers/src/steel/SteelProvider.ts`                            | When to use + 2 Examples + Gotchas (no Mental model)                                             |
| Base type              | `packages/browser/src/BrowserProvider.ts`                                          | When to use + Mental model + Common tasks + Example + Gotchas (generic service tag + base types) |
| Type interface         | `packages/browser-playwright/src/PlaywrightTypes.ts`                               | 1-line summary + tags on the interface; rich content on methods/fields (Tier 1–3 examples)       |
| SDK wrapper            | `packages/browser-providers/src/cf-browser-run/CfBrowserRunSdk.ts`                 | Brief file header pointing to the provider class                                                 |
| SDK wrapper (binding)  | `packages/browser-providers/src/cf-browser-run-binding/CfBrowserRunBindingSdk.ts`  | Brief file header + 1-line interface + verb-led factory; no @example on file-level JSDoc         |
| Utility                | `packages/browser/src/utils/error.ts`                                              | Brief 4-line file header; classes use the canonical class form                                   |
| Field Tier 1 (rich)    | `packages/browser-playwright/src/PlaywrightTypes.ts` `page` field                  | 1-line definition + 4-op preview + upstream link + lifetime                                      |
| Field Tier 2 (medium)  | `packages/browser-playwright/src/PlaywrightTypes.ts` `session` field               | 1-line scope-relative definition + pointer to type + lifetime                                    |
| Field Tier 3 (terse)   | `packages/browser-playwright/src/PlaywrightTypes.ts` `connection`/`context` fields | 1-line identity + type link + lifetime                                                           |

## When applying to existing files

1. Read the implementation to identify real gotchas (don't invent).
   Look at: hardcoded values, error handling, retries, resource
   cleanup, security-sensitive data in URLs / headers, integration
   points with external APIs.
2. Read other clients in the same family for the cross-comparison
   tone. The "When to use" section is the most-read part of the
   class JSDoc — keep it specific.
3. If the file is a provider, **do not add Mental model** — the
   convention is `When to use` + `Example` + `Gotchas`.
4. Apply the 3-tier field system: Tier 1 (rich) for huge-API
   fields pointing to upstream libraries; Tier 2 (medium) for
   fields with a small defined shape; Tier 3 (terse) for handles.
5. Run `pnpm docs:typecheck` after edits. The doc-typecheck script
   also handles `<!-- verify:ignore -->` markers for examples that
   shouldn't be type-checked.
