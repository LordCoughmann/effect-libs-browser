# ADR-0002: Stagehand v4 Support Undecided

> `browser-stagehand` stays on upstream Stagehand v3 for now. v4 moved the Stagehand runtime out of the SDK process and into a browser extension, which changes who the wrapper can talk to and what "provider-agnostic" means for this package. This ADR records the evidence and the triggers that will settle the question; it commits to neither v4 support nor rejection of it.

**Status:** Proposed (decision deferred — deliberate, not an oversight)
**Date:** 2026-09-19
**Source:** Upstream [v3 → v4 migration guide](https://docs.stagehand.dev/v4/migrations/v3), inspection of the published `@browserbasehq/stagehand@4.1.0` tarball, the [Steel Extensions API docs](https://docs.steel.dev/overview/extensions-api/overview), and the sibling [ADR-0001](./0001-stagehand-agent-not-wrapped.md). Recorded during the monthly dependency sweep that closed Dependabot PR #15.

## Context

### Upstream v4 is a rewrite, not a version bump

Stagehand v4 keeps `act` / `extract` / `observe` but moves nearly everything around them: the constructor is private (`Stagehand.create({ browser })`), the browser handle must come from a factory rather than the SDK (`browserbase.launch()` / `localBrowser.launch()` / `localBrowser.connect({ cdpUrl })`), the context moves onto that handle (`await browser.context.activePage()`), every primitive returns `{ data, metadata }`, `enableCaching` becomes `cache`, `metrics` becomes a method, `deepLocator()` folds into `locator()`, and `agent()` is **removed** with no one-for-one replacement.

The v3 line is still maintained — the published `v3-latest` dist-tag tracks `3.7.3` while `latest` tracks `4.1.0` — so staying on v3 is a supported position, not a countdown.

### v4's runtime is a browser extension

The v4 npm package ships `dist/extension/` (`manifest.json`, `service-worker.js`, `content-script.js`, `offscreen/…`) and `dist/assets/stagehand-extension.zip`. The manifest is MV3 with the `debugger`, `offscreen`, `scripting`, and `tabs` permissions and `<all_urls>` host permissions. The SDK reaches the browser over CDP, but the automation logic runs *inside* the browser as that extension; `Stagehand.create` requires a browser object branded with a private symbol that only the SDK's own factories produce, so an arbitrary CDP or Playwright handle cannot be substituted.

Attachment requires **exactly one** of three modes, followed by a protocol-major handshake between SDK and extension:

| Mode | What it requires | Where it can work |
| --- | --- | --- |
| `extensionDir` | `Extensions.loadUnpacked` loads the extension from the **SDK host's** filesystem into the browser | Browsers sharing a filesystem with the SDK process |
| `extensionId` | The browser was already started with the extension loaded | Local or self-hosted Chrome launched with `--load-extension` |
| `preloadedExtension` | Discovery of an already installed and enabled Stagehand extension in the connected browser | **Managed browser providers that install an extension at session start** |

### Which providers can host that extension

| Provider | Extension support | v4 attach path |
| --- | --- | --- |
| Steel | [Extensions API](https://docs.steel.dev/overview/extensions-api/overview) — upload `.zip`/`.crx` or a Chrome Web Store URL, stored per organization, attached per session via `extensionIds` (`['all_ext']` for everything). **Currently in beta, per Steel's own callout.** | Plausible, unverified |
| Browserbase | First-class — `browserbase.launch()` uploads the SDK's extension into the session, or the extension can be uploaded out of band and attached by session ID | Yes |
| Cloudflare Browser Run | None documented | No |
| Local / self-hosted Chrome | Launch with `--load-extension` | Yes, via `extensionId` |

`steel-sdk@0.18.0` — inside the `^0.18.0` range `browser-providers` already peers on — ships the `extensions` resource and the `extensionIds` session field, so a Steel spike needs no SDK bump.

### What v4 costs on Cloudflare Workers

The v4 SDK imports `node:fs/promises`, `node:path`, `node:os`, `node:net`, `node:fs`, and `node:child_process`; v3 needed only the [`ws`](../../../../packages/browser-stagehand/src/polyfills/ws.ts) and `AsyncLocalStorage` polyfills. Workers has no filesystem, so `extensionDir` is unusable there and `extensionId` presumes a launch flag we never control — the only viable Workers path is `preloadedExtension`, meaning the extension must be uploaded to the **managed browser provider** out of band and enabled at session start, and the protocol-major handshake must survive `nodejs_compat`. None of that is verified.

### What the wrapper would have to change, and what it would not

Only four source files touch the peer today: [Stagehand.ts](../../../../packages/browser-stagehand/src/Stagehand.ts) (construction, `env: "LOCAL"`, `localBrowserLaunchOptions.cdpUrl`, `init()`), [StagehandTypes.ts](../../../../packages/browser-stagehand/src/StagehandTypes.ts), [index.ts](../../../../packages/browser-stagehand/src/index.ts), and the `ws` polyfill. The consumer-facing Effect contract is already major-agnostic — `StagehandService` (`acquireSession` / `withSession` / `acquireConnection` / `withConnection`), `StagehandConfig`, the `StagehandError` reason taxonomy, `SchemaConverter`, and the `BrowserProvider` plumbing would all survive unchanged.

The exception is the one public type that leaks upstream: `instance.use((s, signal) => …)` hands back the raw `V3` instance, and that escape hatch is the documented route to `agent` per [ADR-0001](./0001-stagehand-agent-not-wrapped.md). Under v4 the parameter type changes, and `agent` disappears entirely — so v4 support forces an ADR-0001 rewrite and a `CONTEXT.md` anti-claim rewrite, regardless of packaging.

### Repo constraints if both majors were ever supported

- `release-please-config.json` pins a `linked-versions` group and [`scripts/package-metadata/check.ts`](../../../../scripts/package-metadata/check.ts) fails on `Package versions are not synchronized` — a second Stagehand package could not be versioned independently; "experimental" would have to live in prose, and a v3 fix would bump it too.
- [`CONTEXT.md`](../../../../CONTEXT.md) defines a **Package** as "the conceptual feature slice users choose between… one package = one feature". A major-suffixed sibling is the same feature slice with a different upstream major, so it needs that definition amended. The one suffixed precedent, `@effect-libs/cloudflare-playwright`, is explicitly "not a user-chosen package" and does not cover this.
- npm has no per-subpath peer dependencies, which is what rules out the one-package alternative below.

### Adoption context

npm reports 271–327 downloads per month for each of the five published packages — near-identical figures, the signature of mirror and CI traffic rather than users. Carrying two upstream majors has to be justified against that, not against a hypothetical demand.

## Decision

**Undecided.** What *is* decided, for the avoidance of doubt:

1. `@effect-libs/browser-stagehand` stays on upstream v3. The peer range is `^3.0.0` in [package.json](../../../../packages/browser-stagehand/package.json); a consumer installing Stagehand v4 gets a peer warning, and that refusal is deliberate rather than stale metadata.
2. No v4 work is committed to a release. v4 support, in any packaging, is gated on the triggers below.
3. Dependabot proposing `4.x` is **not** a trigger to reconsider — the peer range is the contract, and the ignore list in `.github/dependabot.yml` encodes that.

This ADR exists so the deferral is visible and re-openable. The triggers that settle it:

- **Steel spike result.** Upload `dist/assets/stagehand-extension.zip` to a Steel organization, attach it via `extensionIds`, connect with `localBrowser.connect({ cdpUrl, extensionId })`, and run `act` / `extract` / `observe` under `workerd`. This is the single test that decides whether v4 has a Workers story at all.
- **Upstream ships extension-free attach.** If Stagehand restores a browser the SDK does not have to own, the current provider-agnostic story survives and this becomes a routine major bump.
- **Real demand.** An issue or PR from someone who needs v4 through this wrapper counts. Download counters do not.
- **Upstream v3 end-of-life.** If the `v3-latest` line stops receiving fixes, the deferral expires on its own.

If v4 support is ever taken on, the default path is a **breaking major of the existing package** (peer `^4.0.0`, escape hatch retyped, polyfills swapped, positioning narrowed to extension-capable providers) rather than two coexisting majors — unless the demand trigger shows both lines have real users.

## Consequences

### Positive

- **No churn on an unverified premise.** v4 support would be built on a Steel beta API and an unproven `nodejs_compat` handshake. Deferring avoids shipping a rewrite that may not run on the runtime this package exists for.
- **The provider-agnostic promise stays intact.** Today `browser-stagehand` works with any provider that hands out a CDP URL. v4 support narrows that to providers that accept an extension — Steel, Browserbase, self-hosted Chrome — and that narrowing is a user-visible change, not an implementation detail.
- **v3 is a supported position, not a legacy corner.** Upstream still maintains `v3-latest`, so the deferral costs users nothing today.
- **The option stays open and is documented.** The adapter is four files thick and the Effect contract does not move, so deferring does not make v4 more expensive to adopt later — except for the ADR-0001 rewrite noted below.

### Negative

- **v4-only capabilities are unavailable to wrapper users**: server-side `cache`, the Browserbase Model Gateway, WebMCP (`page.tools()`), the `page.snapshot()` accessibility-tree loop, and the v4 locator parity work. Users who want those must use upstream `@browserbasehq/stagehand` directly.
- **Cloudflare Browser Run is a second-class citizen under v4.** It is one of the three providers `browser-providers` supports, and it has no documented extension support. Whatever packaging is chosen, v4 makes that provider's story weaker than v3's.
- **ADR-0001 and the `CONTEXT.md` anti-claim have a shelf life.** Both describe exposing `agent` through the escape hatch. Upstream removed `agent()` in v4, so the moment the peer moves, both documents are wrong and must be rewritten together.
- **The dual-major option gets more expensive the longer both exist.** If the demand trigger fires after v4 support lands v4-only, retrofitting a v3 package means re-deriving the v3 adapter against a v3 dependency that has drifted.

### Costs

- **A standing decision to re-read.** This ADR is worth nothing if the triggers are never checked; the Steel spike is the concrete work item, and it is small (an upload, a session, a `connect`).
- **Beta dependency risk on the spike's result.** Steel's Extensions API is explicitly in beta and "subject to improvements, updates, and changes", so a green spike is evidence, not a guarantee, and the extension payload itself is versioned against Stagehand's protocol major.
- **Weak signalling to users.** A peer warning about `^3.0.0` is the only signal today that a v4 install will not work. If v4 adoption grows upstream, the package's docs will need a plain "we support v3; here is why" line, sourced from this ADR.

## Alternatives considered

- **Two packages — keep `browser-stagehand` on v3 and add `@effect-libs/browser-stagehand-v4`.** Deferred, not rejected. It is the workable shape if both majors ever need to coexist, because it keeps each package's escape hatch exactly typed and lets a consumer install whichever matches their upstream major. It is not chosen now because it needs the `release-please` linked-versions group and the version-sync check to absorb a sibling, it contradicts the "one package = one feature" definition in `CONTEXT.md`, and it duplicates the docs tree, examples, and workerd stagehand driver for an audience that is currently mirror traffic.
- **One package, subpath exports (`@effect-libs/browser-stagehand/v4`).** Rejected on technical merits. npm has no per-subpath peer dependencies, so one installed `@browserbasehq/stagehand` major would satisfy one entry point and silently break the other. The shipped declaration file is where it hurts: `instance.use` is typed against the raw upstream instance, so a v4 consumer type-checking a v3-typed `.d.ts` (or the reverse) errors inside our package, and the only way out is to type the escape hatch as `unknown` — gutting the feature ADR-0001 relies on. Per-major polyfills (`ws` + `AsyncLocalStorage` versus `node:fs`/`path`/`os`/`net`/`child_process`), `tsdown` externals, and wrangler aliases would also diverge inside a single package.
- **An unpublished prototype package under `packages/`.** Rejected. [`scripts/package-metadata/check.ts`](../../../../scripts/package-metadata/check.ts) requires every manifest under `packages/` to share one version, and release-please bumps the released packages past an unmanaged sibling — so the prototype would turn CI red the first time anything else was released. Prototype in `.llm/playground/` instead.
- **Go v4-only now, as a breaking major of the existing package.** Deferred. It is the likely end state if the Steel spike succeeds and v3 support is dropped, but doing it before the spike risks a rewrite whose target runtime cannot run it, and it would narrow the package's provider promise on the strength of an unverified beta.
- **Say nothing and let the peer range speak for itself.** Rejected. Users hit a peer warning with no explanation and no link to the reasoning; this ADR is the canonical source for the line the user-facing docs will eventually need.

## See also

- [ADR-0001: Stagehand `agent` primitive not wrapped](./0001-stagehand-agent-not-wrapped.md) — the escape hatch this decision protects, and the first document to rewrite when the peer range moves.
- [`CONTEXT.md`](../../../../CONTEXT.md) — the **Package** definition, the anti-claims list, and the "AI-powered browser automation" phrasing the v4 copy will have to follow.
- [`docs/packages/stagehand/comparison.md`](../../../packages/stagehand/comparison.md) — the user-facing comparison against upstream Stagehand; the place a "we support v3" note would live.
- [`packages/browser-stagehand/package.json`](../../../../packages/browser-stagehand/package.json) — the `^3.0.0` peer range that encodes this decision.
- [`packages/browser-stagehand/src/polyfills/ws.ts`](../../../../packages/browser-stagehand/src/polyfills/ws.ts) — the polyfill set v4 would replace with a larger one.
- [`release-please-config.json`](../../../../release-please-config.json) and [`scripts/package-metadata/check.ts`](../../../../scripts/package-metadata/check.ts) — the lockstep versioning constraints behind the two-package trade-off.
- [`docs/contributing/cdp/decisions/0006-ssr-import-constraint.md`](../../cdp/decisions/0006-ssr-import-constraint.md) — sibling ADR on a Workers-runtime constraint that v4 support would extend.
