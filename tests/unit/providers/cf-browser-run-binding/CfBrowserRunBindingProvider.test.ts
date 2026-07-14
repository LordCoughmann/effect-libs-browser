/**
 * Unit tests for CfBrowserRunBindingProvider service.
 *
 * Tests use mock layers from mocks.ts to verify service behavior
 * without requiring actual Cloudflare Workers runtime.
 *
 * withSession behavior (browser launch, context/page management) is tested
 * in integration tests that run in a Workers runtime.
 */

import { assert, describe, it, layer } from "@effect/vitest";
import { CfBrowserRunBindingProviderLayerTest } from "@test/utils/mocks.js";
import { DateTime, Effect, Layer, Option } from "effect";

import { BrowserProviderError, SessionId } from "@effect-libs/browser";
import {
  PlaywrightError,
  ConnectionError as PlaywrightConnectionError,
} from "@effect-libs/browser-playwright";
import {
  CfBrowserRunBindingProvider,
  type CfBrowserRunBindingProviderService,
} from "@effect-libs/browser-providers/cf-browser-run-binding";

// ── Method Behavior Tests ───────────────────────────────────────────────────────

describe("CfBrowserRunBindingProvider Methods", () => {
  layer(CfBrowserRunBindingProviderLayerTest)((it) => {
    it.effect("createSession returns session with expected fields", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunBindingProvider;

        const session = yield* provider.createSession();

        assert.strictEqual(session.id, "test-binding-session-id");
        assert.isTrue(DateTime.isDateTime(session.createdAt));
      }),
    );

    it.effect("releaseSession succeeds without error", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunBindingProvider;

        // Should not throw
        yield* provider.releaseSession(SessionId("test-session-id"));
      }),
    );

    it.effect("getCdpUrl always returns None (no CDP URL)", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunBindingProvider;

        const result = provider.getCdpUrl(SessionId("any-session-id"));
        assert.isTrue(Option.isNone(result));
      }),
    );

    it.effect("use returns result from SDK callback", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunBindingProvider;

        // Mock returns null as A, verify it succeeds
        const result = yield* provider.use(() => Promise.resolve({ data: "test" }));
        assert.isNull(result);
      }),
    );
  });
});

// ── Error Handling Tests ────────────────────────────────────────────────────────

describe("CfBrowserRunBindingProvider Error Handling", () => {
  it.effect("createSession can fail with BrowserProviderError", () => {
    const failingProvider: CfBrowserRunBindingProviderService = {
      createSession: () =>
        Effect.fail(
          new BrowserProviderError({
            reason: "Invalid API key",
            cause: new Error("401 Unauthorized"),
          }),
        ),
      releaseSession: () => Effect.void,
      getCdpUrl: () => Option.none(),
      withSession: () => Effect.die("not implemented in mock"),
      use: () => Effect.die("not implemented in mock"),
    };

    const FailingMock = Layer.succeed(CfBrowserRunBindingProvider, failingProvider);

    return Effect.gen(function* () {
      const provider = yield* CfBrowserRunBindingProvider;

      const result = yield* provider.createSession().pipe(
        Effect.map(() => ({ caught: false, reason: "" })),
        Effect.catchTag("effect-libs/browser/BrowserProviderError", (e) =>
          Effect.succeed({ caught: true, reason: e.reason }),
        ),
      );

      assert.isTrue(result.caught);
      assert.strictEqual(result.reason, "Invalid API key");
    }).pipe(Effect.provide(FailingMock));
  });

  it.effect("withSession can fail with PlaywrightError", () => {
    const failingProvider: CfBrowserRunBindingProviderService = {
      createSession: () =>
        Effect.succeed({
          id: SessionId("test"),
          createdAt: DateTime.makeUnsafe(new Date()),
          endpoint: {} as any,
        }),
      releaseSession: () => Effect.void,
      getCdpUrl: () => Option.none(),
      withSession: () =>
        Effect.fail(
          new PlaywrightError({
            module: "CfBrowserRunBindingProvider",
            method: "withSession",
            reason: new PlaywrightConnectionError({
              description: "Endpoint not available",
            }),
          }),
        ),
      use: () => Effect.die("not implemented in mock"),
    };

    const FailingMock = Layer.succeed(CfBrowserRunBindingProvider, failingProvider);

    return Effect.gen(function* () {
      const provider = yield* CfBrowserRunBindingProvider;

      const result = yield* provider
        .withSession(() => Effect.void)
        .pipe(
          Effect.map(() => ({ caught: false, tag: "" })),
          Effect.catchTag("effect-libs/browser/PlaywrightError", (e) =>
            Effect.succeed({ caught: true, tag: e._tag }),
          ),
        );

      assert.isTrue(result.caught);
      assert.strictEqual(result.tag, "effect-libs/browser/PlaywrightError");
    }).pipe(Effect.provide(FailingMock));
  });

  it.effect("use can fail with BrowserProviderError", () => {
    const failingProvider: CfBrowserRunBindingProviderService = {
      createSession: () =>
        Effect.succeed({
          id: SessionId("test"),
          createdAt: DateTime.makeUnsafe(new Date()),
          endpoint: {} as any,
        }),
      releaseSession: () => Effect.void,
      getCdpUrl: () => Option.none(),
      withSession: () => Effect.die("not implemented in mock"),
      use: () =>
        Effect.fail(
          new BrowserProviderError({
            reason: "SDK operation failed",
            cause: new Error("Internal error"),
          }),
        ),
    };

    const FailingMock = Layer.succeed(CfBrowserRunBindingProvider, failingProvider);

    return Effect.gen(function* () {
      const provider = yield* CfBrowserRunBindingProvider;

      const result = yield* provider
        .use(() => Promise.resolve(null))
        .pipe(
          Effect.map(() => ({ caught: false, reason: "" })),
          Effect.catchTag("effect-libs/browser/BrowserProviderError", (e) =>
            Effect.succeed({ caught: true, reason: e.reason }),
          ),
        );

      assert.isTrue(result.caught);
      assert.strictEqual(result.reason, "SDK operation failed");
    }).pipe(Effect.provide(FailingMock));
  });
});
