/**
 * Unit tests for BrowserbaseProvider service.
 *
 * Tests the provider method behavior and error handling using layerTest
 * from mocks.ts and custom mock implementations.
 */

import { assert, describe, it, layer } from "@effect/vitest";
import { BrowserbaseProviderLayerTest } from "@test/utils/mocks.js";
import { DateTime, Effect, Layer, Option, Redacted } from "effect";

import { BrowserProviderError, SessionId } from "@effect-libs/browser";
import {
  BrowserbaseProvider,
  type BrowserbaseProviderService,
} from "@effect-libs/browser-providers/browserbase";

// ── Method Behavior Tests ───────────────────────────────────────────────────────

describe("BrowserbaseProvider Methods", () => {
  layer(BrowserbaseProviderLayerTest)((it) => {
    it.effect("createSession returns session with expected fields", () =>
      Effect.gen(function* () {
        const provider = yield* BrowserbaseProvider;

        const session = yield* provider.createSession();

        assert.strictEqual(session.id, "test-session-id");
        assert.isTrue(DateTime.isDateTime(session.createdAt));
        assert.strictEqual(session.status, "RUNNING");
        assert.strictEqual(session.projectId, "test-project-id");
        const cdpUrl = Redacted.value(Option.getOrThrow(provider.getCdpUrl(session.id)));
        assert.isTrue(cdpUrl.startsWith("wss://connect.browserbase.com"));
      }),
    );

    it.effect("releaseSession succeeds without error", () =>
      Effect.gen(function* () {
        const provider = yield* BrowserbaseProvider;

        // Should not throw
        yield* provider.releaseSession(SessionId("test-session-id"));
      }),
    );

    it.effect("getCdpUrl returns URL with sessionId", () =>
      Effect.gen(function* () {
        const provider = yield* BrowserbaseProvider;

        const wsUrlOption = provider.getCdpUrl(SessionId("my-session-123"));

        assert.isTrue(Option.isSome(wsUrlOption));
        const wsUrl = Option.getOrThrow(wsUrlOption);

        assert.isTrue(Redacted.value(wsUrl).startsWith("wss://connect.browserbase.com?"));
        assert.isTrue(Redacted.value(wsUrl).includes("sessionId=my-session-123"));
      }),
    );
    it.effect("use returns result from SDK client callback", () =>
      Effect.gen(function* () {
        const provider = yield* BrowserbaseProvider;

        // Mock returns null as A, verify it succeeds
        const result = yield* provider.use(() => Promise.resolve({ data: "test" }));
        assert.isNull(result);
      }),
    );
  });
});

// ── getCdpUrl Edge Cases ─────────────────────────────────────────────

describe("BrowserbaseProvider getCdpUrl", () => {
  layer(BrowserbaseProviderLayerTest)((it) => {
    it.effect("handles various session ID formats", () =>
      Effect.gen(function* () {
        const provider = yield* BrowserbaseProvider;

        const ids = ["simple", "with-dashes", "with_underscores", "123456", "uuid-v4-style"];

        for (const id of ids) {
          const urlOption = provider.getCdpUrl(SessionId(id));
          assert.isTrue(Option.isSome(urlOption));
          assert.isTrue(Redacted.value(Option.getOrThrow(urlOption)).includes(`sessionId=${id}`));
        }
      }),
    );

    it.effect("URL always uses wss:// protocol", () =>
      Effect.gen(function* () {
        const provider = yield* BrowserbaseProvider;

        const urlOption = provider.getCdpUrl(SessionId("any-id"));
        assert.isTrue(Option.isSome(urlOption));
        assert.isTrue(Redacted.value(Option.getOrThrow(urlOption)).startsWith("wss://"));
      }),
    );
  });
});

// ── Error Handling Tests ────────────────────────────────────────────────────────

describe("BrowserbaseProvider Error Handling", () => {
  it.effect("createSession can fail with BrowserProviderError", () => {
    const failingProvider: BrowserbaseProviderService = {
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

    const FailingMock = Layer.succeed(BrowserbaseProvider, failingProvider);

    return Effect.gen(function* () {
      const provider = yield* BrowserbaseProvider;

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
    const now = new Date().toISOString();
    const failingProvider: BrowserbaseProviderService = {
      createSession: () =>
        Effect.succeed({
          id: SessionId("test"),
          createdAt: DateTime.makeUnsafe(new Date()),
          expiresAt: now,
          keepAlive: false,
          projectId: "test-project-id",
          proxyBytes: 0,
          region: "us-west-2" as const,
          startedAt: now,
          status: "RUNNING" as const,
          updatedAt: now,
          seleniumRemoteUrl: "",
          signingKey: "",
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

    const FailingMock = Layer.succeed(BrowserbaseProvider, failingProvider);

    return Effect.gen(function* () {
      const provider = yield* BrowserbaseProvider;

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

  it.effect("createSession failure preserves cause chain", () => {
    const originalError = new Error("Network timeout");
    const failingProvider: BrowserbaseProviderService = {
      createSession: () =>
        Effect.fail(
          new BrowserProviderError({
            reason: "Failed to create Browserbase session",
            cause: originalError,
          }),
        ),
      releaseSession: () => Effect.void,
      getCdpUrl: () => Option.none(),
      use: () => Effect.die("not implemented in mock"),
    };

    const FailingMock = Layer.succeed(BrowserbaseProvider, failingProvider);

    return Effect.gen(function* () {
      const provider = yield* BrowserbaseProvider;

      const result = yield* provider.createSession().pipe(
        Effect.map(() => ({ caught: false, cause: undefined })),
        Effect.catchTag("effect-libs/browser/BrowserProviderError", (e) =>
          Effect.succeed({ caught: true, cause: e.cause }),
        ),
      );

      assert.isTrue(result.caught);
      assert.instanceOf(result.cause, Error);
    }).pipe(Effect.provide(FailingMock));
  });
});
