# Writing Docs

Conventions for docs in this project. We're a small library with plain
markdown under `docs/` — no site framework, no nav config, no MDX.

## Structure

```
docs/
├── README.md                # entry point + nav table
├── overview.md              # primary use case, who it's for, what it gives you, three clients
├── getting-started.md       # install + run a session (mechanical, code-first)
├── faq.md
├── concepts/                # client + provider, scoped resources, errors, …
├── packages/<name>/          # one folder per package, with index.md
├── providers/               # one file per provider
├── guides/                  # runtime / deployment guides
├── cookbook/                # pattern-focused recipes
├── references/              # per-runtime / per-method reference tables
├── migrations/              # migration guides from other tools
├── comparisons/             # cross-cutting comparisons
└── contributing/            # docs for contributors (you are here)
    ├── docs/                # how to write docs (this folder)
    ├── testing/             # how to write tests
    └── cdp/                 # browser-cdp internals
```

`overview.md` is prose-first: it positions the library (primary use
case, audience, what it isn't, the three clients at a glance).
`getting-started.md` is mechanical: install + run a session + next
steps. Don't put positioning prose in Getting started or install
instructions in Overview.

When you add a new doc, pick the smallest folder that fits. If your doc
is "how to do X well" → `cookbook/`. If it's "what is X" →
`concepts/`. If it's "how do I use provider Y" → `providers/y.md`.
If nothing fits, propose a new folder in a PR and update the README.

## Frontmatter

**We don't use frontmatter.** No `---` blocks, no `title:`, no
`description:`. The first paragraph of each doc is its summary —
write it as a one-sentence description of what the reader will get
out of reading it. That's what GitHub shows in search previews and
what readers see first.

If we adopt a site framework later (Mintlify, Astro Starlight, …),
we'll add the framework's metadata convention at that point. Until
then, frontmatter is pure overhead with no consumer.

## Cross-references

Use relative `.md` paths with the fragment for headings:

```markdown
See [Concepts → Client + provider](../../concepts/client-and-provider.md)
for the architecture.

For per-module runtime details, see
[Reference → Runtime & browser support](../../reference/runtime-and-browser-support.md#per-runtime-details).
```

The `verify-examples.ts` script only checks TypeScript code blocks, not
link resolution. When you move or rename a doc, grep for the old path
to find cross-references that need updating:

```sh
rg 'old-path\.md' docs/
```

## Code blocks

Every TypeScript code block in a doc is type-checked by
`pnpm docs:typecheck`. See
[`docs-examples.md`](./docs-examples.md) for the verify markers
(`<!-- verify:ignore -->`, `<!-- verify:stubs -->`, etc.) and the
auto-wrapping rules. When in doubt, write the example naturally and
let the verifier tell you what it needs.

## Style

- **Em-dash** (`—`) for definitions, rephrasings, and subordinate
  clauses: "the default Playwright page — a browser tab scoped to
  this session."
- **Parentheses** for examples and side clarifications: "every
  concrete provider (Steel, Browserbase, …)."
- **Sentence-case headings.** `## Your first program`, not `## Your
First Program`.
- **One-sentence summary, then content.** Don't bury the lede.
- **Self-contained recipes.** Each `cookbook/` file should
  work standalone — readers land there from search, not from a
  reading order.

## See also

- [`docs-examples.md`](./docs-examples.md) — code-block verification
- [`jsdoc-conventions.md`](./jsdoc-conventions.md) — conventions for
  in-source JSDoc (separate from doc-file conventions)
- [`../README.md`](../../README.md) — the entry point of the docs tree
- [`../../../CONTEXT.md`](../../../CONTEXT.md) — project vocabulary;
  the **Referencing packages in user-facing copy** section
  is the canonical rule for how to refer to our packages vs upstream
  Playwright vs the Chrome DevTools Protocol in prose. Read it before
  writing the first sentence of a new doc.
