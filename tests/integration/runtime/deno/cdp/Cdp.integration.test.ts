/**
 * CDP integration tests for Deno runtime.
 *
 * Run with: deno test tests/integration/deno/
 */

import { defineAllCdpTests } from "../../../shared/cdp/index.js";
import { make } from "../Deno.js";

const api = make();
const config = {
  wsUrl: Deno.env.get("CHROME_WS_URL")!,
  httpUrl: Deno.env.get("HTTP_BASE_URL")!,
};

defineAllCdpTests(api, config);
