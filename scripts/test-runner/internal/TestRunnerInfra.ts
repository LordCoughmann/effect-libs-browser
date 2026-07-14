/**
 * Shared infrastructure setup for integration tests + manual infra CLI.
 *
 * Library exports:
 * - {@link InfraLayer}: the layer providing Chrome + HTTP server + NodeServices
 * - {@link ensureInfra}: one-shot Effect that ensures infra is running
 * - {@link runInfraForever}: long-running Effect for manual infra startup
 *
 * CLI: when this file is the direct entry point (`pnpm tsx .../TestRunnerInfra.ts`),
 * runs `runInfraForever` so a developer can start infra in one terminal and
 * run tests in another.
 *
 * Used by `TestRunner.ts` (programmatic) and humans (manual CLI).
 */

import "@dotenvx/dotenvx/config";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { startChrome, ChromeServicesLive } from "@test/setup/chrome.ts";
import { TestHttpServerLive, TestWebSocketServerLive, HTTP_PORT } from "@test/setup/http-server.ts";
import { DEFAULT_CHROME_PORT } from "@test/utils/config/TestBrowserConfig.js";
import { Effect, Layer, Console } from "effect";

export const InfraLayer = Layer.mergeAll(
  TestHttpServerLive,
  TestWebSocketServerLive,
  ChromeServicesLive,
  NodeServices.layer,
);

/**
 * One-shot: ensure Chrome + HTTP server are running. Sets `CHROME_WS_URL` and
 * `HTTP_BASE_URL` env vars if they aren't already set, so downstream code can
 * pick them up.
 *
 * Used by `runSubcommand` when a `SubcommandSpec.requiresInfra` is true.
 */
export const ensureInfra = Effect.gen(function* () {
  if (!process.env.CHROME_WS_URL || !process.env.HTTP_BASE_URL) {
    yield* Console.log("[infra] Starting test infrastructure...\n");

    const wsUrl = yield* startChrome(DEFAULT_CHROME_PORT);

    process.env.CHROME_WS_URL = wsUrl;
    process.env.HTTP_BASE_URL = `http://localhost:${HTTP_PORT}`;

    yield* Console.log(`[infra] CHROME_WS_URL=${wsUrl}`);
    yield* Console.log(`[infra] HTTP_BASE_URL=http://localhost:${HTTP_PORT}\n`);
  } else {
    yield* Console.log("[infra] Using existing infrastructure from env vars");
  }
});

/**
 * Long-running: start Chrome + HTTP server and run forever.
 *
 * Prints `CHROME_WS_URL` and `HTTP_BASE_URL` so the developer can copy them
 * into another terminal that runs the actual tests. Press Ctrl+C to stop.
 */
export const runInfraForever = Effect.gen(function* () {
  yield* Console.log("[infra] Starting test infrastructure...\n");
  yield* Console.log(`[infra] HTTP server started on port ${HTTP_PORT}`);

  const wsUrl = yield* startChrome(DEFAULT_CHROME_PORT);

  yield* Console.log("");
  yield* Console.log(`[infra] CHROME_WS_URL=${wsUrl}`);
  yield* Console.log(`[infra] HTTP_BASE_URL=http://localhost:${HTTP_PORT}`);
  yield* Console.log("");
  yield* Console.log("[infra] Infrastructure running. Press Ctrl+C to stop.");

  return yield* Effect.never;
}).pipe(
  Effect.onInterrupt(() =>
    Effect.gen(function* () {
      yield* Console.log("\n[infra] Cleaning up...");
      yield* Console.log("[infra] Chrome stopped (via Scope)");
      yield* Console.log("[infra] HTTP server stopped (via Scope)");
    }),
  ),
  Effect.scoped,
);

// =============================================================================
// CLI: only runs when this file is the direct entry point
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runInfraForever.pipe(Effect.provide(InfraLayer), NodeRuntime.runMain);
}
