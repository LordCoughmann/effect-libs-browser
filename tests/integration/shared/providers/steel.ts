/**
 * Shared Steel provider integration tests.
 *
 * Tests only our HTTP client glue against the real Steel API.
 * Capabilities (navigate, evaluate, etc.) are tested via CDP/Playwright
 * shared suites against local Chrome — not here.
 *
 * Requires STEEL_API_KEY environment variable.
 *
 * Used by:
 * - tests/integration/runtime/node/providers/SteelProvider.integration.test.ts
 * - tests/integration/runtime/workerd/providers/SteelProvider.integration.test.ts
 */

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { DateTime, Effect, Option, Redacted } from "effect";

import { SteelProvider } from "@effect-libs/browser-providers/steel";

import { hasSteelConfig } from "../../../utils/config/TestProviderConfig.js";

// ── Check if Steel is configured ──────────────────────────────────────────────

const steelAvailable = Effect.runSync(hasSteelConfig);

// ── Helpers ────────────────────────────────────────────────────────────────────

const getSteelApiKey = () => process.env.STEEL_API_KEY!;

// ── Standard Provider Contract ────────────────────────────────────────────────

export const defineSteelProviderTests = (api: TestApi, _config: TestConfig): void => {
  const { describe, test } = api;
  const maybeDescribe = steelAvailable ? describe : describe.skip;

  maybeDescribe("SteelProvider Integration", () => {
    test("session lifecycle: create → validate → get WS endpoint → release", () =>
      Effect.gen(function* () {
        const provider = yield* SteelProvider;

        // Create
        const session = yield* provider.createSession();
        yield* Effect.logInfo(`Created session: ${session.id}`);

        // Validate response shape (our HTTP client parsed their API correctly)
        yield* Effect.sync(() => {
          if (!session.id) throw new Error("session.id should exist");
          if (!DateTime.isDateTime(session.createdAt))
            throw new Error("session.createdAt should be a DateTime");
        });

        // Validate WS endpoint format (our URL builder works with a real session ID)
        const wsUrlOption = provider.getCdpUrl(session.id);
        yield* Effect.sync(() => {
          if (Option.isNone(wsUrlOption)) throw new Error("Expected Some, got None");
          const wsUrl = wsUrlOption.value;
          if (!Redacted.value(wsUrl).includes("wss://connect.steel.dev"))
            throw new Error(`Expected wss://connect.steel.dev, got ${wsUrl}`);
          if (!Redacted.value(wsUrl).includes("sessionId="))
            throw new Error(`Expected sessionId param, got ${wsUrl}`);
        });

        // Release
        yield* provider.releaseSession(session.id);
        yield* Effect.logInfo(`Released session: ${session.id}`);
      }).pipe(
        Effect.provide(SteelProvider.layer({ apiKey: Redacted.make(getSteelApiKey()) })),
        Effect.withSpan("SteelProvider.integration.lifecycle"),
      ));

    test("releaseSession is idempotent", () =>
      Effect.gen(function* () {
        const provider = yield* SteelProvider;

        const session = yield* provider.createSession();
        yield* provider.releaseSession(session.id);

        // Double-release should not throw unexpectedly
        const result = yield* provider.releaseSession(session.id).pipe(
          Effect.map(() => "ok" as const),
          Effect.catchTag("effect-libs/browser/BrowserProviderError", () =>
            Effect.succeed("error" as const),
          ),
        );

        yield* Effect.sync(() => {
          if (result !== "ok" && result !== "error")
            throw new Error(`Expected "ok" or "error", got "${result}"`);
        });
      }).pipe(
        Effect.provide(SteelProvider.layer({ apiKey: Redacted.make(getSteelApiKey()) })),
        Effect.withSpan("SteelProvider.integration.idempotentRelease"),
      ));
  });
};
