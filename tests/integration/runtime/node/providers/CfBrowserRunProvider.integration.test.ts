/**
 * Cloudflare Browser Run HTTP provider integration tests for Node.js runtime.
 *
 * Uses shared test definitions from integration/shared/providers/cf-browser-run.ts
 * to ensure consistency across Node and workerd runtimes.
 */

import { defineCfBrowserRunProviderTests } from "@test/integration/shared/providers/cf-browser-run.js";
import { make } from "@test/utils/effect-test/Vitest.js";

defineCfBrowserRunProviderTests(make(), {
  wsUrl: process.env.CHROME_WS_URL!,
  httpUrl: process.env.HTTP_BASE_URL!,
});
