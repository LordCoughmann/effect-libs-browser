/**
 * Cloudflare Browser Run HTTP provider integration tests for workerd runtime.
 *
 * Uses shared test definitions from integration/shared/providers/cf-browser-run.ts
 * to ensure consistency across Node and workerd runtimes.
 */

import { getEnv } from "@test/integration/runtime/workerd/env.js";
import { defineCfBrowserRunProviderTests } from "@test/integration/shared/providers/cf-browser-run.js";
import { make } from "@test/utils/effect-test/Vitest.js";

const { wsUrl, httpUrl } = getEnv();

defineCfBrowserRunProviderTests(make(), { wsUrl, httpUrl });
