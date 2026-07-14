/**
 * Provider API keys configuration.
 *
 * Simple skip checks for browser provider integration tests.
 * Tests read env vars directly when they run.
 *
 * .env loading is handled by the orchestrator (scripts/test-runner/TestRunner.ts), not here.
 */

import { Config, Effect, Redacted, String } from "effect";

// ── Skip Checks ────────────────────────────────────────────────────────────────

/**
 * Check if Steel API key is configured.
 */
export const hasSteelConfig = Effect.gen(function* () {
  const apiKey = yield* Config.redacted("STEEL_API_KEY").pipe(
    Config.withDefault(Redacted.make("")),
  );
  return String.isNonEmpty(Redacted.value(apiKey));
});

/**
 * Check if Browserbase API key is configured.
 */
export const hasBrowserbaseConfig = Effect.gen(function* () {
  const apiKey = yield* Config.redacted("BROWSERBASE_API_KEY").pipe(
    Config.withDefault(Redacted.make("")),
  );
  return String.isNonEmpty(Redacted.value(apiKey));
});

/**
 * Check if Cloudflare Browser Run credentials are configured.
 */
export const hasCfBrowserRunConfig = Effect.gen(function* () {
  const accountId = yield* Config.redacted("CF_ACCOUNT_ID").pipe(
    Config.withDefault(Redacted.make("")),
  );
  const apiKey = yield* Config.redacted("CF_API_TOKEN").pipe(Config.withDefault(Redacted.make("")));
  return String.isNonEmpty(Redacted.value(accountId)) && String.isNonEmpty(Redacted.value(apiKey));
});
