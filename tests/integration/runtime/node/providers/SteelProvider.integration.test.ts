/**
 * Steel provider integration tests for Node.js runtime.
 *
 * Uses shared test definitions from integration/shared/providers/steel.ts
 * to ensure consistency across Node and workerd runtimes.
 */

import { defineSteelProviderTests } from "@test/integration/shared/providers/steel.js";
import { make } from "@test/utils/effect-test/Vitest.js";

defineSteelProviderTests(make(), {
  wsUrl: process.env.CHROME_WS_URL!,
  httpUrl: process.env.HTTP_BASE_URL!,
});
