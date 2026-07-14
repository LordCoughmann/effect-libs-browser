/**
 * CDP integration tests for Node/Vitest runtime.
 */

import { defineAllCdpTests } from "@test/integration/shared/cdp/index.js";
import { make } from "@test/utils/effect-test/Vitest.js";

const api = make();
const config = {
  wsUrl: process.env.CHROME_WS_URL!,
  httpUrl: process.env.HTTP_BASE_URL!,
};

defineAllCdpTests(api, config);
