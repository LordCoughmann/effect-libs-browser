/**
 * Stagehand integration tests for workerd runtime.
 *
 * WORKAROUND: This file is EXCLUDED from vitest-pool-workers due to upstream bug.
 * @see https://github.com/cloudflare/workers-sdk/issues/13037
 * @fix https://github.com/cloudflare/workers-sdk/pull/13062
 *
 * Root cause: Vite 8's rolldown resolver doesn't correctly honor isRequire: true
 * when resolving dual-format packages (@smithy/*), causing CJS require() to
 * resolve ESM files with "Unexpected token 'export".
 *
 * Alternative test using wrangler dev is in ./driver.ts (standalone script).
 * Run via: pnpm test:stagehand:workerd
 *
 * The driver serves the ./test-worker/ worker over wrangler dev and exercises
 * the Stagehand ops via HTTP. Delete this file + driver + test-worker when
 * PR #13062 lands upstream.
 */

import { getEnv } from "@test/integration/runtime/workerd/env.js";
import { defineStagehandTests } from "@test/integration/shared/stagehand/stagehand.js";
import { make } from "@test/utils/effect-test/Vitest.js";

const { wsUrl, httpUrl } = getEnv();

defineStagehandTests(make(), { wsUrl, httpUrl });
