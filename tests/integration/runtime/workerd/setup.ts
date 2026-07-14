/**
 * Global setup for workerd integration tests.
 *
 * Runs in Node.js. Validates that the orchestrator has set up
 * the required infrastructure (Chrome + HTTP server).
 *
 * Env vars are forwarded as miniflare bindings by the vitest config,
 * so no provide/inject is needed here.
 */

export default async function () {
  console.log("[workerd Setup] Verifying test infrastructure...");

  const chromeWsUrl = process.env.CHROME_WS_URL;
  const httpBaseUrl = process.env.HTTP_BASE_URL;

  if (!chromeWsUrl) {
    console.error("[workerd Setup] CHROME_WS_URL not set. Run via orchestrator or set manually.");
    throw new Error("CHROME_WS_URL not set");
  }

  if (!httpBaseUrl) {
    console.error("[workerd Setup] HTTP_BASE_URL not set. Run via orchestrator or set manually.");
    throw new Error("HTTP_BASE_URL not set");
  }

  console.log(`[workerd Setup] chromeWsUrl=${chromeWsUrl}`);
  console.log(`[workerd Setup] httpBaseUrl=${httpBaseUrl}`);
  console.log("[workerd Setup] Ready!");
}

export async function teardown() {
  console.log("[workerd Setup] Teardown (no-op, orchestrator handles cleanup)");
}
