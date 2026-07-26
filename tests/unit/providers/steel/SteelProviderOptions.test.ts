/**
 * Unit tests for SteelProvider session options merging behavior.
 *
 * Verifies that:
 * - Default session options configured at the layer level are passed to the Steel SDK.
 * - Per-call createSession options take precedence over layer-level defaults.
 * - Options are correctly passed through when defaults or per-call options are omitted.
 */

import { assert, beforeEach, describe, layer } from "@effect/vitest";
import { DateTime, Effect, Option, Redacted } from "effect";
import { vi } from "vitest";

import { SessionId } from "@effect-libs/browser";
import { SteelProvider, type SteelSessionCreateParams } from "@effect-libs/browser-providers/steel";

// ── SDK Mock Setup ─────────────────────────────────────────────────────────────

const { mockCreate, MockSession } = vi.hoisted(() => ({
  mockCreate: vi.fn<(params: Record<string, unknown>) => Promise<Record<string, unknown>>>(),
  MockSession: {
    id: "mock-session-abc123",
    createdAt: new Date().toISOString(),
    creditsUsed: 0,
    debugUrl: "http://localhost:9222",
    websocketUrl: "ws://localhost:9222",
    dimensions: { width: 1920, height: 1080 },
    duration: 0,
    eventCount: 0,
    proxyBytesUsed: 0,
    proxySource: null,
    sessionViewerUrl: "http://localhost:9222/viewer",
    status: "live" as const,
    timeout: 300000,
    optimizeBandwidth: {},
  },
}));

vi.mock("steel-sdk", () => ({
  default: class MockSteelSDK {
    readonly sessions = { create: mockCreate };
  },
}));

// ── Test Helpers ───────────────────────────────────────────────────────────────

const TEST_API_KEY = Redacted.make("test-api-key-12345");

/** Utility to create a SteelProvider layer with optional default session options. */
const makeTestLayer = (options?: SteelSessionCreateParams) =>
  SteelProvider.layer({
    apiKey: TEST_API_KEY,
    ...(options !== undefined ? { options } : {}),
  });

/** Helper to retrieve and type-check the arguments passed to SDK create call. */
const getLastCallParams = (): Record<string, unknown> => {
  assert.strictEqual(mockCreate.mock.calls.length, 1, "Expected SDK create to be called once");
  return mockCreate.mock.calls[0][0];
};

// ── Test Suites ────────────────────────────────────────────────────────────────

describe("SteelProvider Options Merging", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue(MockSession);
  });

  // ── Layer Defaults ───────────────────────────────────────────────────────────

  describe("Layer Defaults", () => {
    layer(
      makeTestLayer({
        profileId: "test-profile",
        persistProfile: false,
        timeout: 60000,
        dimensions: { width: 1280, height: 720 },
      }),
    )((it) => {
      it.effect(
        "passes layer-level default options when createSession is called without arguments",
        () =>
          Effect.gen(function* () {
            const provider = yield* SteelProvider;
            yield* provider.createSession();

            const options = getLastCallParams();
            assert.deepStrictEqual(options, {
              profileId: "test-profile",
              persistProfile: false,
              timeout: 60000,
              dimensions: { width: 1280, height: 720 },
            });
          }),
      );
    });
  });

  // ── Per-call Overrides & Merging ─────────────────────────────────────────────

  describe("Per-call Overrides & Merging", () => {
    layer(
      makeTestLayer({
        profileId: "default-profile",
        persistProfile: true,
        timeout: 30000,
        stealthConfig: { humanizeInteractions: true },
      }),
    )((it) => {
      it.effect("merges additive per-call options with layer defaults", () =>
        Effect.gen(function* () {
          const provider = yield* SteelProvider;
          yield* provider.createSession({ blockAds: true });

          const options = getLastCallParams();
          assert.strictEqual(options.profileId, "default-profile");
          assert.strictEqual(options.blockAds, true);
        }),
      );

      it.effect("overrides layer default options with per-call options", () =>
        Effect.gen(function* () {
          const provider = yield* SteelProvider;
          yield* provider.createSession({
            profileId: "override-profile",
            timeout: 99999,
          });

          const options = getLastCallParams();
          assert.strictEqual(options.profileId, "override-profile");
          assert.strictEqual(options.timeout, 99999);
          assert.strictEqual(options.persistProfile, true);
        }),
      );

      it.effect("replaces nested configuration objects when specified per-call", () =>
        Effect.gen(function* () {
          const provider = yield* SteelProvider;
          yield* provider.createSession({
            stealthConfig: { autoCaptchaSolving: true },
          });

          const options = getLastCallParams();
          assert.deepStrictEqual(options.stealthConfig, { autoCaptchaSolving: true });
        }),
      );
    });
  });

  // ── Empty & Omitted Options ──────────────────────────────────────────────────

  describe("Empty & Omitted Options", () => {
    layer(makeTestLayer())((it) => {
      it.effect("passes an empty options object when neither defaults nor call options exist", () =>
        Effect.gen(function* () {
          const provider = yield* SteelProvider;
          yield* provider.createSession();

          const options = getLastCallParams();
          assert.deepStrictEqual(options, {});
        }),
      );

      it.effect("passes per-call options directly when no default layer options are set", () =>
        Effect.gen(function* () {
          const provider = yield* SteelProvider;
          yield* provider.createSession({ profileId: "direct-profile" });

          const options = getLastCallParams();
          assert.deepStrictEqual(options, { profileId: "direct-profile" });
        }),
      );
    });
  });

  // ── Integration & Response Mapping ───────────────────────────────────────────

  describe("Integration & Response Mapping", () => {
    layer(makeTestLayer({ profileId: "test-profile" }))((it) => {
      it.effect("maps SDK response into a valid SteelSession struct", () =>
        Effect.gen(function* () {
          mockCreate.mockResolvedValueOnce({
            ...MockSession,
            id: "session-456",
            createdAt: "2026-06-15T10:30:00.000Z",
          });

          const provider = yield* SteelProvider;
          const session = yield* provider.createSession();

          assert.strictEqual(session.id, SessionId("session-456"));
          assert.isTrue(DateTime.isDateTime(session.createdAt));
          assert.strictEqual(session.status, "live");

          const cdpUrlOption = provider.getCdpUrl(session.id);
          assert.isTrue(Option.isSome(cdpUrlOption));
        }),
      );
    });
  });
});
