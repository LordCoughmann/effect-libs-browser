/**
 * Shared test layers for browser provider tests.
 *
 * Provides test layers for unit testing without real API calls or browser connections.
 * All provider layers use the dual-key pattern where they provide both the concrete
 * service and the abstract BrowserProvider service.
 *
 * Naming follows Effect convention: `layerTest` extracted as `<Service>LayerTest`.
 */

import type Steel from "steel-sdk";

import type { CfBrowserRunSdk } from "@effect-libs/browser-providers/cf-browser-run";
import type { CfBrowserRunBindingSdk } from "@effect-libs/browser-providers/cf-browser-run-binding";

import { Context, DateTime, Effect, Layer, Option, Redacted } from "effect";

import { BrowserProvider, BrowserProviderError, SessionId, UrlString } from "@effect-libs/browser";
import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";
import { CfBrowserRunProvider } from "@effect-libs/browser-providers/cf-browser-run";
import { CfBrowserRunBindingProvider } from "@effect-libs/browser-providers/cf-browser-run-binding";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

// =============================================================================
// Steel Provider
// =============================================================================

/**
 * Test SteelProviderService implementation.
 */
const testSteelProvider = SteelProvider.of({
  createSession: () =>
    Effect.succeed({
      id: SessionId("test-session-id"),
      createdAt: DateTime.makeUnsafe(new Date()),
      status: "live",
      creditsUsed: 0,
      duration: 0,
      eventCount: 0,
      proxyBytesUsed: 0,
      proxySource: null,
      sessionViewerUrl: "http://localhost:9222/viewer",
      debugUrl: "http://localhost:9222",
      websocketUrl: "ws://localhost:9222",
      timeout: 300000,
      dimensions: { width: 1920, height: 1080 },
      optimizeBandwidth: {},
      cdpUrl: Redacted.make(UrlString("ws://localhost:9222")),
    }),
  releaseSession: () => Effect.void,
  getCdpUrl: (id) => Option.some(Redacted.make(UrlString(`ws://localhost:9222?sessionId=${id}`))),
  use: <A>(_fn: (client: Steel) => Promise<A>) =>
    Effect.tryPromise({
      try: () => Promise.resolve(null as A),
      catch: () => new BrowserProviderError({ reason: "mock use failed" }),
    }),
});

/**
 * Test layer for SteelProvider.
 * Provides BOTH SteelProvider AND BrowserProvider (dual-key pattern).
 */
export const SteelProviderLayerTest = Layer.effectContext(
  Effect.sync(() =>
    Context.make(SteelProvider, testSteelProvider).pipe(
      Context.add(BrowserProvider, testSteelProvider),
    ),
  ),
);

// =============================================================================
// Browserbase Provider
// =============================================================================

/**
 * Test BrowserbaseProviderService implementation.
 */
const testBrowserbaseProvider = BrowserbaseProvider.of({
  createSession: () => {
    const now = new Date().toISOString();
    return Effect.succeed({
      id: SessionId("test-session-id"),
      createdAt: DateTime.makeUnsafe(new Date()),
      expiresAt: now,
      keepAlive: false,
      projectId: "test-project-id",
      proxyBytes: 0,
      region: "us-west-2",
      startedAt: now,
      status: "RUNNING",
      updatedAt: now,
      seleniumRemoteUrl: "https://selenium.browserbase.com",
      signingKey: "test-signing-key",
    });
  },
  releaseSession: () => Effect.void,
  getCdpUrl: (id) =>
    Option.some(Redacted.make(UrlString(`wss://connect.browserbase.com?sessionId=${id}`))),
  use: <A>(_fn: (client: never) => Promise<A>) =>
    Effect.tryPromise({
      try: () => Promise.resolve(null as A),
      catch: () => new BrowserProviderError({ reason: "mock use failed" }),
    }),
});

/**
 * Test layer for BrowserbaseProvider.
 * Provides BOTH BrowserbaseProvider AND BrowserProvider (dual-key pattern).
 */
export const BrowserbaseProviderLayerTest = Layer.effectContext(
  Effect.sync(() =>
    Context.make(BrowserbaseProvider, testBrowserbaseProvider).pipe(
      Context.add(BrowserProvider, testBrowserbaseProvider),
    ),
  ),
);

// =============================================================================
// CfBrowserRun Provider
// =============================================================================

/**
 * Test CfBrowserRunProviderService implementation.
 */
const testCfBrowserRunProvider = CfBrowserRunProvider.of({
  accountId: "test-account-id",
  createSession: () =>
    Effect.succeed({
      id: SessionId("test-cf-session-id"),
      createdAt: DateTime.makeUnsafe(new Date()),
      cdpUrl: Redacted.make(UrlString("wss://test.devtools.cloudflare.com/session/test")),
    }),
  releaseSession: () => Effect.void,
  getCdpUrl: () =>
    Option.some(Redacted.make(UrlString("wss://test.devtools.cloudflare.com/session/test"))),
  use: <A>(_fn: (sdk: CfBrowserRunSdk) => Promise<A>) =>
    Effect.tryPromise({
      try: () => Promise.resolve(null as A),
      catch: () => new BrowserProviderError({ reason: "mock use failed" }),
    }),
});

/**
 * Test layer for CfBrowserRunProvider.
 * Provides BOTH CfBrowserRunProvider AND BrowserProvider (dual-key pattern).
 */
export const CfBrowserRunProviderLayerTest = Layer.effectContext(
  Effect.sync(() =>
    Context.make(CfBrowserRunProvider, testCfBrowserRunProvider).pipe(
      Context.add(BrowserProvider, testCfBrowserRunProvider),
    ),
  ),
);

// =============================================================================
// CfBrowserRun Binding Provider
// =============================================================================

/**
 * Test CfBrowserRunBindingProviderService implementation.
 *
 * Note: The binding provider does NOT provide BrowserProvider because it
 * uses launch() instead of CDP WebSocket URLs (incompatible with Cdp/Stagehand).
 */
const testCfBrowserRunBindingProvider = CfBrowserRunBindingProvider.of({
  createSession: () =>
    Effect.succeed({
      id: SessionId("test-binding-session-id"),
      createdAt: DateTime.makeUnsafe(new Date()),
      endpoint: {} as any,
    }),
  releaseSession: () => Effect.void,
  getCdpUrl: () => Option.none(), // Binding provider has no CDP URL
  withSession: (_optionsOrFn: any, _fn?: any) => Effect.die("withSession not implemented in mock"),
  use: <A>(_fn: (sdk: CfBrowserRunBindingSdk) => Promise<A>) =>
    Effect.tryPromise({
      try: () => Promise.resolve(null as A),
      catch: () => new BrowserProviderError({ reason: "mock use failed" }),
    }),
});

/**
 * Test layer for CfBrowserRunBindingProvider.
 * Note: Does NOT provide BrowserProvider (binding provider uses launch, not CDP).
 */
export const CfBrowserRunBindingProviderLayerTest = Layer.succeed(
  CfBrowserRunBindingProvider,
  testCfBrowserRunBindingProvider,
);

// =============================================================================
// Composed Services
// =============================================================================

// No composed service layers - use provider pattern directly:
// Effect.gen(function* () {
//   const playwright = yield* Playwright;
//   const provider = yield* BrowserbaseProvider;
//   yield* playwright.withSession({ provider }, (page, session) => ...);
// }).pipe(
//   Effect.provide(BrowserbaseProviderLayerTest),
//   Effect.provide(PlaywrightLayerTest),
// )
