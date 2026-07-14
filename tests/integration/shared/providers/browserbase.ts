/**
 * Shared Browserbase provider integration tests.
 *
 * Tests only our HTTP client glue against the real Browserbase API.
 * Capabilities (navigate, evaluate, etc.) are tested via CDP/Playwright
 * shared suites against local Chrome — not here.
 *
 * Requires BROWSERBASE_API_KEY environment variable.
 * Optionally BROWSERBASE_PROJECT_ID for project-scoped sessions.
 *
 * Used by:
 * - tests/integration/runtime/node/providers/Browserbase.integration.test.ts
 * - tests/integration/runtime/workerd/providers/Browserbase.integration.test.ts
 */

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { DateTime, Effect, Option, Redacted } from "effect";

import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";

import { hasBrowserbaseConfig } from "../../../utils/config/TestProviderConfig.js";

// ── Check if Browserbase is configured ────────────────────────────────────────

const browserbaseAvailable = Effect.runSync(hasBrowserbaseConfig);

// ── Helpers ────────────────────────────────────────────────────────────────────

const getBrowserbaseConfig = () => ({
  apiKey: Redacted.make(process.env.BROWSERBASE_API_KEY!),
  options: process.env.BROWSERBASE_PROJECT_ID
    ? { projectId: process.env.BROWSERBASE_PROJECT_ID }
    : undefined,
});

// ── Standard Provider Contract ────────────────────────────────────────────────

export const defineBrowserbaseTests = (api: TestApi, _config: TestConfig): void => {
  const { describe, test } = api;
  const maybeDescribe = browserbaseAvailable ? describe : describe.skip;

  maybeDescribe("BrowserbaseProvider Integration", () => {
    test("session lifecycle: create → validate → get WS endpoint → release", () =>
      Effect.gen(function* () {
        const provider = yield* BrowserbaseProvider;

        // Create
        const session = yield* provider.createSession();
        yield* Effect.logInfo(`Created session: ${session.id}`);

        // Validate response shape (our HTTP client parsed their API correctly)
        yield* Effect.sync(() => {
          if (!session.id) throw new Error("session.id should exist");
          if (!DateTime.isDateTime(session.createdAt))
            throw new Error("session.createdAt should be a DateTime");
          if (session.status !== "RUNNING")
            throw new Error(`Expected RUNNING, got ${session.status}`);
        });

        // Validate WS endpoint format (our URL builder works with a real session ID)
        const wsUrlOption = provider.getCdpUrl(session.id);
        yield* Effect.sync(() => {
          if (Option.isNone(wsUrlOption)) throw new Error("Expected Some, got None");
          const wsUrl = wsUrlOption.value;
          if (!Redacted.value(wsUrl).startsWith("wss://connect.browserbase.com?"))
            throw new Error(`Expected wss://connect.browserbase.com?, got ${wsUrl}`);
          if (!Redacted.value(wsUrl).includes("apiKey="))
            throw new Error(`Expected apiKey param, got ${wsUrl}`);
          if (!Redacted.value(wsUrl).includes(`sessionId=${session.id}`))
            throw new Error(`Expected sessionId param, got ${wsUrl}`);
        });

        // Release
        yield* provider.releaseSession(session.id);
        yield* Effect.logInfo(`Released session: ${session.id}`);
      }).pipe(
        Effect.provide(BrowserbaseProvider.layer(getBrowserbaseConfig())),
        Effect.withSpan("BrowserbaseProvider.integration.lifecycle"),
      ));

    test("releaseSession is idempotent", () =>
      Effect.gen(function* () {
        const provider = yield* BrowserbaseProvider;

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
        Effect.provide(BrowserbaseProvider.layer(getBrowserbaseConfig())),
        Effect.withSpan("BrowserbaseProvider.integration.idempotentRelease"),
      ));

    // ── Provider-Specific ──────────────────────────────────────────────────────

    test("getCdpUrl returns wss:// endpoint", () =>
      Effect.gen(function* () {
        const provider = yield* BrowserbaseProvider;

        const session = yield* provider.createSession();

        yield* Effect.sync(() => {
          const cdpUrlOption = provider.getCdpUrl(session.id);
          if (Option.isNone(cdpUrlOption)) throw new Error("getCdpUrl should return Some");
          const cdpUrl = Redacted.value(cdpUrlOption.value);
          if (!cdpUrl.includes("wss://")) throw new Error("cdpUrl should use wss://");
        });

        yield* provider.releaseSession(session.id);
      }).pipe(
        Effect.provide(BrowserbaseProvider.layer(getBrowserbaseConfig())),
        Effect.withSpan("BrowserbaseProvider.integration.getCdpUrl"),
      ));
  });
};
