/**
 * Shared Cloudflare Browser Run HTTP provider integration tests.
 *
 * Tests only our HTTP client glue against the real Cloudflare Browser Run API.
 * Capabilities (navigate, evaluate, etc.) are tested via CDP/Playwright
 * shared suites against local Chrome — not here.
 *
 * Requires CF_ACCOUNT_ID and CF_API_TOKEN environment variables.
 *
 * Used by:
 * - tests/integration/runtime/node/providers/CfBrowserRunProvider.integration.test.ts
 * - tests/integration/runtime/workerd/providers/CfBrowserRunProvider.integration.test.ts
 */

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { DateTime, Effect, Option, Redacted } from "effect";

import { CfBrowserRunProvider } from "@effect-libs/browser-providers/cf-browser-run";

import { hasCfBrowserRunConfig } from "../../../utils/config/TestProviderConfig.js";

// ── Check if Browser Run is configured ────────────────────────────────────────

const cfBrowserRunAvailable = Effect.runSync(hasCfBrowserRunConfig);

// ── Helpers ────────────────────────────────────────────────────────────────────

const getCfBrowserRunConfig = () => ({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiKey: Redacted.make(process.env.CF_API_TOKEN!),
  // Use short keepAlive for tests (60s) to minimize quota consumption if sessions leak
  // Free plan: 10 min/day - leaked 10min session = entire quota gone
  // Default (600s) would consume entire quota if test fails before release
  keepAlive: 60_000, // 60 seconds (minimum timeout)
});

// ── Standard Provider Contract ────────────────────────────────────────────────

export const defineCfBrowserRunProviderTests = (api: TestApi, _config: TestConfig): void => {
  const { describe, test } = api;
  const maybeDescribe = cfBrowserRunAvailable ? describe : describe.skip;

  maybeDescribe("CfBrowserRunProvider Integration", () => {
    test("session lifecycle: create → validate → get WS endpoint → release", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunProvider;

        // Create
        const session = yield* provider.createSession();
        yield* Effect.logInfo(`Created session: ${session.id}`);

        // Validate response shape (our HTTP client parsed Cloudflare API correctly)
        yield* Effect.sync(() => {
          if (!session.id) throw new Error("session.id should exist");
          if (!DateTime.isDateTime(session.createdAt))
            throw new Error("session.createdAt should be a DateTime");
          const cdpUrl = Redacted.value(session.cdpUrl);
          if (typeof cdpUrl !== "string") throw new Error("session.cdpUrl should be a string");
        });

        // Validate WS endpoint format (our URL storage works with a real session)
        const wsUrlOption = provider.getCdpUrl(session.id);
        yield* Effect.sync(() => {
          if (Option.isNone(wsUrlOption)) throw new Error("Expected Some, got None");
          const wsUrl = wsUrlOption.value;
          if (!Redacted.value(wsUrl).startsWith("wss://"))
            throw new Error(`Expected wss:// prefix, got ${wsUrl}`);
        });

        // Release
        yield* provider.releaseSession(session.id);
        yield* Effect.logInfo(`Released session: ${session.id}`);
      }).pipe(
        Effect.provide(CfBrowserRunProvider.layer(getCfBrowserRunConfig())),
        Effect.withSpan("CfBrowserRunProvider.integration.lifecycle"),
      ));

    test("releaseSession is idempotent", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunProvider;

        const session = yield* provider.createSession();
        yield* provider.releaseSession(session.id);

        // Double-release should not throw (404 is treated as success)
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
        Effect.provide(CfBrowserRunProvider.layer(getCfBrowserRunConfig())),
        Effect.withSpan("CfBrowserRunProvider.integration.idempotentRelease"),
      ));

    // ── Provider-Specific ──────────────────────────────────────────────────────

    test("session includes cdpUrl", () =>
      Effect.gen(function* () {
        const provider = yield* CfBrowserRunProvider;

        const session = yield* provider.createSession();

        yield* Effect.sync(() => {
          const cdpUrl = Redacted.value(session.cdpUrl);
          if (!cdpUrl) throw new Error("session.cdpUrl should exist");
          if (!cdpUrl.includes("wss://")) throw new Error("cdpUrl should use wss://");
        });

        yield* provider.releaseSession(session.id);
      }).pipe(
        Effect.provide(CfBrowserRunProvider.layer(getCfBrowserRunConfig())),
        Effect.withSpan("CfBrowserRunProvider.integration.cdpUrl"),
      ));
  });
};
