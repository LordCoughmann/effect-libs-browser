/**
 * Global setup for Node.js integration tests.
 *
 * Expects the orchestrator to have started Chrome + HTTP server.
 * Verifies that CHROME_WS_URL and HTTP_BASE_URL environment variables are set.
 *
 * If running tests directly (without orchestrator), ensure these are set:
 * - CHROME_WS_URL=ws://localhost:9222
 * - HTTP_BASE_URL=http://localhost:9322
 */

export async function setup() {
  console.log("[Node.js Setup] Verifying test infrastructure...");

  const chromeWsUrl = process.env.CHROME_WS_URL;
  const httpBaseUrl = process.env.HTTP_BASE_URL;

  if (!chromeWsUrl) {
    console.error("[Node.js Setup] CHROME_WS_URL not set. Run via orchestrator or set manually.");
    throw new Error("CHROME_WS_URL not set");
  }

  if (!httpBaseUrl) {
    console.error("[Node.js Setup] HTTP_BASE_URL not set. Run via orchestrator or set manually.");
    throw new Error("HTTP_BASE_URL not set");
  }

  console.log(`[Node.js Setup] CHROME_WS_URL=${chromeWsUrl}`);
  console.log(`[Node.js Setup] HTTP_BASE_URL=${httpBaseUrl}`);
  console.log("[Node.js Setup] Ready!");
}

export async function teardown() {
  console.log("[Node.js Setup] Teardown (no-op, orchestrator handles cleanup)");
}
