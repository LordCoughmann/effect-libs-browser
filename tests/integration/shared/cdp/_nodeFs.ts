/**
 * Lazy access to `@effect/platform-node`'s `NodeFileSystem` for `browser-cdp` tests that
 * need a real filesystem (downloads, setInputFiles).
 *
 * ## Why this exists
 * `@effect/platform-node` depends on `undici@8.x`. undici 8's mock module does
 * `const { Console } = require("node:console")`, which returns `undefined` in
 * the workerd (Cloudflare Workers) runtime — a CJS-interop quirk that throws
 * `TypeError: Cannot destructure property 'Console' of 'require(...)'` at
 * module-load time. A top-level `import { NodeFileSystem } from
 * "@effect/platform-node"` therefore crashes the entire `browser-cdp` test suite on
 * workerd before any test runs (see the undici 8.x footgun documented in
 * docs/contributing/cdp/navigation-concurrency.md).
 *
 * The fix: never import `@effect/platform-node` at module top level. Load it
 * with a dynamic `import()` the first time the FileSystem layer is actually
 * provided, and skip these tests entirely on workerd (which has no real Node
 * filesystem for downloads / temp files anyway).
 *
 * On node, bun, and deno the dynamic import resolves immediately and the tests
 * run normally.
 */

import { Effect, Layer } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

/**
 * True when running inside the Cloudflare Workers (workerd) runtime.
 *
 * workerd sets `navigator.userAgent` to `"Cloudflare-Workers"`. We feature-detect
 * rather than sniff build-time globals so the same shared test files load in
 * every runtime.
 */
export const isWorkersRuntime = (): boolean =>
  typeof navigator !== "undefined" &&
  typeof navigator.userAgent === "string" &&
  navigator.userAgent.includes("Cloudflare-Workers");

/**
 * Provide the `Cdp + NodeFileSystem` layer to an Effect.
 *
 * Drop-in replacement for the old module-level `CdpWithFs` constant +
 * `Effect.provide(CdpWithFs)` calls. The `@effect/platform-node` import is
 * deferred to a dynamic `import()` so undici 8.x is never loaded at module-load
 * time (which would crash workerd). The runtime caches the dynamic import, so
 * repeated calls are cheap.
 *
 * The merged layer is constructed inline so TypeScript keeps the precise
 * `Cdp | FileSystem` requirements and `Effect.provide` can subtract them.
 */
export const provideCdpWithFs = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const { NodeFileSystem } = yield* Effect.promise(() => import("@effect/platform-node"));
    return yield* self.pipe(Effect.provide(Layer.merge(Cdp.layer, NodeFileSystem.layer)));
  });
