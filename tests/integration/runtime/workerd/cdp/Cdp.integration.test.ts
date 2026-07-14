/**
 * CDP integration tests for workerd runtime.
 */

import { getEnv } from "@test/integration/runtime/workerd/env.js";
import { defineAllCdpTests } from "@test/integration/shared/cdp/index.js";
import { make } from "@test/utils/effect-test/Vitest.js";

const { wsUrl, httpUrl } = getEnv();
const api = make();
const config = { wsUrl, httpUrl };

defineAllCdpTests(api, config);
