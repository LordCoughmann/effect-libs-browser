/**
 * Playwright integration tests for Node.js runtime.
 *
 * Uses shared test definitions from integration/shared/playwright/playwright.ts
 * to ensure consistency across Node and workerd runtimes.
 */

import { definePlaywrightTests } from "@test/integration/shared/playwright/playwright.js";
import { make } from "@test/utils/effect-test/Vitest.js";

const api = make();
const config = {
  wsUrl: process.env.CHROME_WS_URL!,
  httpUrl: process.env.HTTP_BASE_URL!,
};

definePlaywrightTests(api, config);
