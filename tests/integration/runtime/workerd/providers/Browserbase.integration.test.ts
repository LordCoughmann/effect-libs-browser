/**
 * Browserbase provider integration tests for workerd runtime.
 *
 * Uses shared test definitions from integration/shared/providers/browserbase.ts
 * to ensure consistency across Node and workerd runtimes.
 */

import { getEnv } from "@test/integration/runtime/workerd/env.js";
import { defineBrowserbaseTests } from "@test/integration/shared/providers/browserbase.js";
import { make } from "@test/utils/effect-test/Vitest.js";

const { wsUrl, httpUrl } = getEnv();

defineBrowserbaseTests(make(), { wsUrl, httpUrl });
