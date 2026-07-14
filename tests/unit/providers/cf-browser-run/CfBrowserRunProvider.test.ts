/**
 * Unit tests for CfBrowserRunProvider service.
 *
 * Tests use mock layers from mocks.ts to verify service behavior
 * without requiring actual Cloudflare Browser Run endpoints.
 *
 * HTTP request/response behavior is tested in integration tests.
 */

import { assert, describe, it, layer } from "@effect/vitest";
import { CfBrowserRunProviderLayerTest } from "@test/utils/mocks.js";
import { DateTime, Effect, Layer, Option, Redacted } from "effect";

import { BrowserProviderError, SessionId, UrlString } from "@effect-libs/browser";
import {
  CfBrowserRunProvider,
  type CfBrowserRunProviderService,
} from "@effect-libs/browser-providers/cf-browser-run";

// ── Method Behavior Tests ───────────────────────────────────────────────────────

describe("CfBrowserRunProvider Methods", () => {
  layer(CfBrowserRunProviderLayerTest)((it) => {
    it.effect("createSession returns session with expected fields", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunProvider;

        const session = yield* provider.createSession();

        assert.strictEqual(session.id, "test-cf-session-id");
        assert.isTrue(DateTime.isDateTime(session.createdAt));
        assert.strictEqual(
          Redacted.value(session.cdpUrl),
          "wss://test.devtools.cloudflare.com/session/test",
        );
      }),
    );

    it.effect("releaseSession succeeds without error", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunProvider;

        // Should not throw
        yield* provider.releaseSession(SessionId("test-session-id"));
      }),
    );

    it.effect("getCdpUrl returns URL for known session", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunProvider;

        const wsUrlOption = provider.getCdpUrl(SessionId("any-session-id"));

        assert.isTrue(Option.isSome(wsUrlOption));
        const wsUrl = Option.getOrThrow(wsUrlOption);
        assert.isTrue(Redacted.value(wsUrl).startsWith("wss://"));
      }),
    );

    it.effect("use returns result from SDK callback", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunProvider;

        // Mock returns null as A, verify it succeeds
        const result = yield* provider.use(() => Promise.resolve({ data: "test" }));
        assert.isNull(result);
      }),
    );
  });
});

// ── Error Handling Tests ────────────────────────────────────────────────────────

describe("CfBrowserRunProvider Error Handling", () => {
  it.effect("createSession can fail with BrowserProviderError", () => {
    const failingProvider: CfBrowserRunProviderService = {
      accountId: "test-account",
      createSession: () =>
        Effect.fail(
          new BrowserProviderError({
            reason: "Invalid API key",
            cause: new Error("401 Unauthorized"),
          }),
        ),
      releaseSession: () => Effect.void,
      getCdpUrl: () => Option.none(),
      use: () => Effect.die("not implemented in mock"),
    };

    const FailingMock = Layer.succeed(CfBrowserRunProvider, failingProvider);

    return Effect.gen(function* () {
      const provider = yield* CfBrowserRunProvider;

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

  it.effect("releaseSession can fail with BrowserProviderError", () => {
    const failingProvider: CfBrowserRunProviderService = {
      accountId: "test-account",
      createSession: () =>
        Effect.succeed({
          id: SessionId("test"),
          createdAt: DateTime.makeUnsafe(new Date()),
          cdpUrl: Redacted.make(UrlString("wss://test")),
        }),
      releaseSession: () =>
        Effect.fail(
          new BrowserProviderError({
            reason: "Session not found",
            cause: new Error("404 Not Found"),
          }),
        ),
      getCdpUrl: () => Option.none(),
      use: () => Effect.die("not implemented in mock"),
    };

    const FailingMock = Layer.succeed(CfBrowserRunProvider, failingProvider);

    return Effect.gen(function* () {
      const provider = yield* CfBrowserRunProvider;

      const result = yield* provider.releaseSession(SessionId("invalid-id")).pipe(
        Effect.map(() => ({ caught: false, reason: "" })),
        Effect.catchTag("effect-libs/browser/BrowserProviderError", (e) =>
          Effect.succeed({ caught: true, reason: e.reason }),
        ),
      );

      assert.isTrue(result.caught);
      assert.strictEqual(result.reason, "Session not found");
    }).pipe(Effect.provide(FailingMock));
  });
});
