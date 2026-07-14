/**
 * Playwright integration tests for workerd runtime.
 *
 * Uses shared test definitions from integration/shared/playwright/playwright.ts
 * to ensure consistency across Node and workerd runtimes.
 */

import { getEnv } from "@test/integration/runtime/workerd/env.js";
import { definePlaywrightTests } from "@test/integration/shared/playwright/playwright.js";
import { make } from "@test/utils/effect-test/Vitest.js";

const { wsUrl, httpUrl } = getEnv();
const api = make();
const config = { wsUrl, httpUrl };

definePlaywrightTests(api, config);
