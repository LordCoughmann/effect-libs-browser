/**
 * Browserbase provider integration tests for Node.js runtime.
 *
 * Uses shared test definitions from integration/shared/providers/browserbase.ts
 * to ensure consistency across Node and workerd runtimes.
 */

import { defineBrowserbaseTests } from "@test/integration/shared/providers/browserbase.js";
import { make } from "@test/utils/effect-test/Vitest.js";

defineBrowserbaseTests(make(), {
  wsUrl: process.env.CHROME_WS_URL!,
  httpUrl: process.env.HTTP_BASE_URL!,
});
