# Context

> Source-of-truth for writers, AI agents, and maintainers. **Read this before
> writing user-facing copy, adding a module, or claiming a feature.** User-facing
> explanations live in [`docs/overview.md`](./docs/overview.md).

## Positioning

`@effect-libs/browser` is browser automation for edge runtimes, built on
Effect v4. Connect to any CDP endpoint and get scoped cleanup on success,
error, or timeout.

## Audience

- **Primary**: developers deploying to Cloudflare Workers or other edge
  runtimes.
- **Secondary**: developers on Node/Bun/Deno who want Effect patterns and
  provider abstraction.

## Language

The project-specific vocabulary. One term per concept; aliases listed under
"Avoid".

**Precedence**: when upstream has a canonical term (Stagehand, Playwright,
each provider), prefer theirs. Our terms fill gaps upstream doesn't cover.

**Client**:
The Effect service that exposes a browser API surface — `Playwright`, `Cdp`,
`Stagehand`. What you automate with.
_Avoid_: driver, controller

**Provider**:
The Effect service that owns a connection to a **managed browser provider**
(Steel, Browserbase, Cloudflare Browser Run) — `SteelProvider`,
`BrowserbaseProvider`, `CfBrowserRunProvider`, `CfBrowserRunBindingProvider`
— or a raw CDP WebSocket URL passed directly to `withConnection`. Where
the browser lives.
_Avoid_: backend, host

**Managed browser provider**:
A third-party service that runs remote browsers for you, billed by session
or duration — Steel, Browserbase, Cloudflare Browser Run. The category of
service a **Provider** Effect class wraps.

Used in user-facing copy ("An `@effect-libs/browser` implementation for
managed browser providers (Steel, Browserbase, Cloudflare Browser Run)").
_Avoid_: "browser-as-a-service" / "BaaS" (not established in this project);
"browser provider" alone (ambiguous — could refer to our `*Provider` Effect
classes); "remote browser infrastructure" (use this term instead).

**Session**:
A provider-managed billing unit, opened by `withSession({ provider })` and
closed automatically on success, error, or interruption.
_Avoid_: browser, instance, tab

**Connection**:
A CDP WebSocket to a browser, scoped to its callback by
`withConnection(source)`. `source` is `{ url }` (raw CDP URL) or
`{ session }` (provider-owned). A Connection owns the default Page
(`connection.page`) plus one or more **Contexts** — pages outside any
explicit context share the connection's default cookies/storage.
_Avoid_: socket, ws

**Context** (browser context):
An isolated cookie/storage scope within a connection. `connection.withContext`.
_Avoid_: incognito, profile

**Page**:
A single tab within a context (or the default context). `connection.withPage`.
_Avoid_: tab, window

**Instance** (Stagehand only):
The Stagehand object returned by `instance.use((s) => ...)`. Wraps a Page
plus the AI primitives. Distinct from a **Session** — Stagehand's
"instance" is per-Page, ours is per-provider-billing-unit.
_Avoid_: "Stagehand session" — collides with our **Session** term.

**Primitive** (Stagehand only):
A Stagehand AI verb: `act`, `extract`, `observe`, `agent`. Currently wrapped
by `@effect-libs/browser-stagehand`: `act`, `extract`, `observe`. Not yet
wrapped: `agent`.
_Avoid_: action, method (in Stagehand context)

**Stagehand (description term)**:
Canonical phrasing for Stagehand in user-facing copy is **"AI-powered browser
automation"** — matches upstream Stagehand docs and our existing deep docs
(`docs/packages/stagehand/index.md`, `docs/faq.md`).
_Avoid_: "LLM-driven" (LLM is one AI implementation, not the only one);
"AI-driven" (less common; "AI-powered" is upstream convention)

**Package**:
An npm artifact published from this monorepo — `@effect-libs/browser-core`,
`-playwright`, `-cdp`, `-stagehand`, `-providers`. Installed via `pnpm add`.
Currently one package contains one **Module**.

**Module**:
A coherent feature slice of the project — `playwright`, `cdp`, `stagehand`,
`providers`, `core`. The conceptual thing users choose between ("Choosing a
module") and the canonical name for the conceptual surface. Currently 1:1
with **Packages**, but the terms are distinct: a **Module** is the
feature, a **Package** is the npm artifact that delivers it.
_Avoid_: package (refers to the npm artifact, not the feature slice)

**Raw CDP URL**:
A WebSocket URL passed directly to `withConnection({ url })` with no
provider. Connects to any CDP-compatible endpoint — your hosted Chrome, local
Chrome, anything.
_Avoid_: raw ws URL, naked endpoint

### Referencing packages in user-facing copy

Three concepts, three canonical names. Stick to these in user-facing prose —
README, docs, package descriptions — to avoid the kind of ambiguity that
made "CDP module" / "@effect-libs/browser-cdp" / "Chrome DevTools Protocol"
all want to mean different things.

| Concept                                                 | Canonical form                                                                                                                                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The npm artifact we publish                             | `@effect-libs/browser-{module}` (full name)                                                                                                                                                                                       |
| The npm artifact we publish (in narrative)              | `browser-{module}` — `browser-playwright`, `browser-cdp`, `browser-stagehand`                                                                                                                                                     |
| Our **Client** Effect service (the consumer-facing API) | `Playwright`, `Cdp`, `Stagehand` (PascalCase, the export name)                                                                                                                                                                    |
| Upstream Playwright (Microsoft's library)               | `Playwright` (PascalCase); say "upstream Playwright" or "original Playwright" first mention                                                                                                                                       |
| The wire protocol                                       | "Chrome DevTools Protocol" — spell it out at first mention; `CDP` is acceptable as an adjective (`CDP endpoint`, `CDP command`, `CDP message`, `CDP client`) but never alone to mean "the protocol" and never to mean our package |
| The conceptual feature slice                            | lowercase, no scope: `playwright`, `cdp`, `stagehand`, `providers`, `core` (used in `docs/packages/{name}/index.md` paths and the choosing-client table inside [`docs/overview.md`](./docs/overview.md#pick-a-client))                                                                      |

**Rules of thumb**:

- **Never** write "the CDP module" or "the Playwright module" or "the Stagehand module" — the word "module" is overloaded (Node.js modules, ES modules, internal Maintainer term) and the noun phrase adds nothing the canonical name doesn't. Use `browser-cdp`, `browser-playwright`, `browser-stagehand` instead.
- **Never** write just `CDP` to refer to our package. It reads as the protocol and confuses readers. Use the scoped name `browser-cdp` (narrative) or the full npm name (code/install).
- **Never** write `playwright` (lowercase) when you mean upstream Microsoft Playwright — it conflicts with our module name. Use `Playwright` (PascalCase) and add "upstream" or "original" at first mention to disambiguate from `browser-playwright`.
- In install commands and code imports, always use the full `@effect-libs/browser-{module}`.
- In narrative prose, prefer the short `browser-{module}` form over the full @scope — it reads cleaner.
- The Consumer-facing Client class is the PascalCase export name (`Playwright`, `Cdp`, `Stagehand`); refer to it directly.

**Worked example**:

> Install `browser-cdp` for the zero-dependency CDP client, or
> `browser-playwright` for full upstream Playwright. Use uppercase
> `Playwright` when you mean the Microsoft library, lowercase
> `browser-playwright` when you mean our package. The wire protocol is
> spelled out as "Chrome DevTools Protocol" at first mention; `CDP` is
> fine as an adjective (CDP endpoint, CDP command).

### Relationships

- A **Client** consumes one or more **Providers**
- A **Session** owns one **Connection**
- A **Connection** owns one or more **Contexts**
- A **Context** owns one or more **Pages**
- An **Instance** wraps exactly one **Page** and exposes **Primitives**

## Module scope and status

Canonical statement of what each module does — prevents over-claim.

| Module       | Status       | Wraps                                            | Does NOT wrap                          |
| ------------ | ------------ | ------------------------------------------------ | -------------------------------------- |
| `playwright` | stable       | full Playwright API                              | —                                      |
| `stagehand`  | stable       | `act` / `extract` / `observe`                    | `agent` (upstream v3, not yet wrapped) |
| `cdp`        | experimental | zero-dependency CDP subset                       | full CDP domain; frames/events polish  |
| `providers`  | stable       | Steel, Browserbase, Browser Run (HTTP + binding) | —                                      |
| `core`       | stable       | `BrowserProvider` interface, types, shared utils | client APIs (those live in their own packages)    |

## Naming conventions

- **Package names**: `@effect-libs/browser-{module}`, lowercase kebab-case.
- **Doc paths** mirror package names: `docs/packages/{module}/index.md`.
- **Provider classes**: `SteelProvider`, `BrowserbaseProvider`,
  `CfBrowserRunProvider`, `CfBrowserRunBindingProvider`.
- **Layer factories**: `{Name}.layer` and `{Name}.layerConfig({...})`.
- **Entry points**: `withX` (scoped callback) and `acquireX` (owned scope).
- **Doc style** (em-dash, articles, voice): see
  [`docs/contributing/docs/jsdoc-conventions.md`](./docs/contributing/docs/jsdoc-conventions.md).

## What we don't claim (anti-claims)

The "no, we don't do X — yet" list. Prevents drift between marketing copy
and what the code actually does.

- **Stagehand `agent` primitive** — upstream v3, not yet wrapped. The `instance.use((s, signal) => s.agent.execute(...))` escape hatch already wires Effect cancellation and error wrapping to the raw V3, and the upstream API is configuration-heavy (`model` / `mode` / `integrations` / `tools` per call) and `@experimental` — a wrapper would be a thin pass-through until the API stabilizes.
- **Self-healing AI** — that's Stagehand's claim, true only when you use
  `act` or `observe`.
- **Cross-provider session handoff** — one provider per session. A `BrowserProviderSession` is bound to one provider's `cdpUrl` for its lifetime; cookies, storage, and live page state don't transfer to another provider, so "moving" a session means re-authing on a fresh one.
- **Full Node compat on Workers** — only what's documented per module. Cloudflare's `nodejs_compat` polyfills a subset of `node:*` (e.g. `node:async_hooks`, partial `node:fs`/`node:crypto`); the library uses only the subset each module's docs call out, never the full Node API surface.
- **"Cloudflare Workers" as the only target** — we also run on other
  WinterCG-compliant edge runtimes.
- **Auto-close without Effect** — scoped cleanup is an Effect idiom; if you
  drop the Effect layer, you lose the cleanup guarantees.

## References

- User-facing concepts: [`docs/overview.md`](./docs/overview.md).
- Per-module docs: [`docs/packages/`](./docs/packages/).
- Architecture decisions: [`docs/contributing/cdp/decisions/`](./docs/contributing/cdp/decisions/), [`docs/contributing/stagehand/decisions/`](./docs/contributing/stagehand/decisions/) (per-module ADRs; a general `docs/adr/` is lazily created when a real cross-module trade-off is recorded).
