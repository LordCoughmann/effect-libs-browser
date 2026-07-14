/**
 * CDP integration tests for Bun runtime.
 *
 * Run with: bun test tests/integration/bun/
 */

import { defineAllCdpTests } from "../../../shared/cdp/index.js";
import { make } from "../Bun.js";

const api = make();
const config = {
  wsUrl: Bun.env.CHROME_WS_URL!,
  httpUrl: Bun.env.HTTP_BASE_URL!,
};

defineAllCdpTests(api, config);
