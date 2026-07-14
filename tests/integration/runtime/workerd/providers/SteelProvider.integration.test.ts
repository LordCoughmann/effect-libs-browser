/**
 * Steel provider integration tests for workerd runtime.
 *
 * Uses shared test definitions from integration/shared/providers/steel.ts
 * to ensure consistency across Node and workerd runtimes.
 */

import { getEnv } from "@test/integration/runtime/workerd/env.js";
import { defineSteelProviderTests } from "@test/integration/shared/providers/steel.js";
import { make } from "@test/utils/effect-test/Vitest.js";

const { wsUrl, httpUrl } = getEnv();

defineSteelProviderTests(make(), { wsUrl, httpUrl });
