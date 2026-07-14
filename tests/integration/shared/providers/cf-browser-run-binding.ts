/**
 * Shared Cloudflare Browser Run Binding provider integration tests.
 *
 * Tests the binding provider's `withSession` and `use` methods against
 * the real Cloudflare Browser Run binding (env.MYBROWSER).
 *
 * Unlike the HTTP provider, the binding provider uses `launch(endpoint)`
 * from `@cloudflare/playwright` for direct browser access — no CDP WebSocket.
 *
 * **Runtime requirements:**
 * - Must run in Cloudflare Workers (workerd) with `[browser]` binding configured
 * - The `env.MYBROWSER` binding must be available via `cloudflare:workers`
 * - The `env.CF_API_TOKEN` must be available for `.use()` HTTP API calls
 * - Local: requires Chromium (auto-launched by wrangler/miniflare)
 *
 * Used by:
 * - tests/integration/runtime/workerd/providers/CfBrowserRunBindingProvider.integration.test.ts
 */

import type { BrowserEndpoint } from "@effect-libs/cloudflare-playwright";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Option } from "effect";

import { CfBrowserRunBindingProvider } from "@effect-libs/browser-providers/cf-browser-run-binding";

import { assertEqual, assertTrue, assertContains } from "../../../utils/effect-test/EffectTest.js";

// ── Detect binding availability ───────────────────────────────────────────────

// `env` from `cloudflare:workers` is only available in the workerd runtime.
// We lazily import it inside tests. For the describe.skip logic, we use a
// synchronous check — if this file is loaded in workerd with the browser
// binding configured, `env.MYBROWSER` will be truthy.

let bindingAvailable = false;
let cachedBinding: unknown = null;

try {
  // Dynamic import only resolves in workerd; in Node this throws.
  // We use a top-level await to check once at module load time.
  const mod = await import("cloudflare:workers");
  cachedBinding = mod.env?.MYBROWSER;
  bindingAvailable = !!cachedBinding;
} catch {
  bindingAvailable = false;
}

// ── Helper ────────────────────────────────────────────────────────────────────

const layerOptions = {
  endpoint: cachedBinding as BrowserEndpoint,
};

// ── Test Definitions ──────────────────────────────────────────────────────────

export const defineCfBrowserRunBindingProviderTests = (api: TestApi, _config: TestConfig): void => {
  const { describe, test } = api;
  const maybeDescribe = bindingAvailable ? describe : describe.skip;

  maybeDescribe("CfBrowserRunBindingProvider Integration", () => {
    test("withSession navigates and evaluates page title", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunBindingProvider;

        const title = yield* provider.withSession((page) =>
          Effect.gen(function* () {
            yield* page.goto("https://example.com");
            return yield* page.title;
          }),
        );

        yield* assertContains(title.toLowerCase(), "example");
      }).pipe(Effect.provide(CfBrowserRunBindingProvider.layer(layerOptions))));

    test("use accesses binding SDK", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunBindingProvider;

        const result = yield* provider.use(async (client) => {
          // The binding SDK should have endpoint and operations
          return !!client.endpoint;
        });

        yield* assertTrue(result);
      }).pipe(Effect.provide(CfBrowserRunBindingProvider.layer(layerOptions))));

    test("session management: create → getCdpUrl → release", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunBindingProvider;

        // Create session record
        const session = yield* provider.createSession();
        yield* assertTrue(!!session.id);
        yield* assertEqual(typeof session.createdAt, "string");

        // Binding provider has no WebSocket endpoint
        const wsEndpoint = provider.getCdpUrl(session.id);
        yield* assertTrue(Option.isNone(wsEndpoint));

        // Release is a no-op
        yield* provider.releaseSession(session.id);
      }).pipe(Effect.provide(CfBrowserRunBindingProvider.layer(layerOptions))));
  });
};
