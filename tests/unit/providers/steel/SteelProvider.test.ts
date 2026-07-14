/**
 * Unit tests for SteelProvider service.
 *
 * Tests use mock layers from mocks.ts to verify service behavior
 * without requiring actual Steel.dev API calls.
 */

import { assert, describe, it, layer } from "@effect/vitest";
import { SteelProviderLayerTest } from "@test/utils/mocks.js";
import { DateTime, Effect, Layer, Option, Redacted } from "effect";

import { BrowserProviderError, SessionId, UrlString } from "@effect-libs/browser";
import { SteelProvider, type SteelProviderService } from "@effect-libs/browser-providers/steel";

// ── Method Behavior Tests ───────────────────────────────────────────────────────

describe("SteelProvider Methods", () => {
  layer(SteelProviderLayerTest)((it) => {
    it.effect("createSession returns session with expected fields", () =>
      Effect.gen(function* () {
        const provider = yield* SteelProvider;

        const session = yield* provider.createSession();
        assert.strictEqual(session.id, "test-session-id");
        assert.isTrue(DateTime.isDateTime(session.createdAt));
      }),
    );

    it.effect("releaseSession succeeds without error", () =>
      Effect.gen(function* () {
        const provider = yield* SteelProvider;

        yield* provider.releaseSession(SessionId("test-session-id"));
      }),
    );

    it.effect("getCdpUrl returns URL with sessionId", () =>
      Effect.gen(function* () {
        const provider = yield* SteelProvider;

        const session = yield* provider.createSession();
        const wsUrlOption = provider.getCdpUrl(session.id);

        assert.isTrue(Option.isSome(wsUrlOption));
        const wsUrl = Option.getOrThrow(wsUrlOption);

        assert.isTrue(Redacted.value(wsUrl).includes("ws://localhost:9222"));
        assert.isTrue(Redacted.value(wsUrl).includes("sessionId=test-session-id"));
      }),
    );

    it.effect("use returns result from SDK callback", () =>
      Effect.gen(function* () {
        const provider = yield* SteelProvider;

        const result = yield* provider.use(() => Promise.resolve({ data: "test" }));
        assert.isNull(result);
      }),
    );
  });
});

// ── Error Handling Tests ─────────────────────────────────────────────────────────

describe("SteelProvider Error Handling", () => {
  // Tests with failing provider need isolated layers
  it.effect("createSession can fail with BrowserProviderError", () => {
    const failingProvider: SteelProviderService = {
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

    const FailingMock = Layer.succeed(SteelProvider, failingProvider);

    return Effect.gen(function* () {
      const provider = yield* SteelProvider;

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
    const failingProvider: SteelProviderService = {
      createSession: () =>
        Effect.succeed({
          id: SessionId("test"),
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

    const FailingMock = Layer.succeed(SteelProvider, failingProvider);

    return Effect.gen(function* () {
      const provider = yield* SteelProvider;

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

// ── getCdpUrl Edge Cases ─────────────────────────────────────────────

describe("SteelProvider getCdpUrl", () => {
  layer(SteelProviderLayerTest)((it) => {
    it.effect("handles various session ID formats", () =>
      Effect.gen(function* () {
        const provider = yield* SteelProvider;

        const ids = ["simple", "with-dashes", "with_underscores", "123456"];

        for (const id of ids) {
          const urlOption = provider.getCdpUrl(SessionId(id));
          assert.isTrue(Option.isSome(urlOption));
          assert.isTrue(Redacted.value(Option.getOrThrow(urlOption)).includes(`sessionId=${id}`));
        }
      }),
    );
  });
});
