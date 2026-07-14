/**
 * Workerd no-compat smoke test — verify the CDP module loads in Cloudflare
 * Workers runtime **without** `nodejs_compat`.
 *
 * ## What this proves
 *
 * The CDP module is documented as zero-dependency and runtime-agnostic
 * ("works on workerd without `nodejs_compat`"). This file is the
 * **runtime half** of that promise: a positive import-time test that
 * the module loads cleanly under workerd without `nodejs_compat`. If
 * the import ever throws, the no-compat gate is broken.
 *
 * ## What this does NOT prove (and why)
 *
 * We deliberately do **not** include negative-control tests via
 * `it.fails(...)` for modules that need `nodejs_compat` (playwright,
 * stagehand, providers, unpatched `playwright`, `node:async_hooks`).
 *
 * Reason: the workerd loader **hard-crashes** (signal #11, segmentation
 * fault) when it encounters a `node:` import or a module that
 * transitively uses Node-only globals like `Buffer` without the compat
 * shim. That's not a JS exception — it's a native crash — and vitest
 * cannot observe it as a test failure. The negative-control imports
 * would kill the worker before `it.fails` could mark them as expected,
 * and the segfault would also pollute every other test in the file.
 *
 * ## Where the negative control lives instead
 *
 * See `tests/unit/wrangler-config/NoNodeCompatFlag.test.ts` — a Node
 * runtime test that parses `wrangler.test.nocompat.jsonc` and asserts
 * the `compatibility_flags` array does NOT include `"nodejs_compat"`
 * (or any variant thereof). This is the deterministic half of the gate:
 * even if workerd's compat behaviour changed silently, the config file
 * itself can't lie.
 *
 * Combined, these two checks give strong evidence:
 *
 * 1. **Config static check** — proves `nodejs_compat` is not enabled
 *    in the test config (Node unit test, deterministic, sub-second).
 * 2. **CDP module loads** — proves the CDP module's import graph is
 *    Node-API-free at runtime (this file, workerd, ~1s).
 * 3. **CDP integration suite** — proves the CDP module's runtime path
 *    (not just imports) is Node-API-free over 823 tests against a
 *    real Chrome (vitest.integration.workerd.nocompat.config.ts, ~3 min).
 *
 * @see wrangler.test.nocompat.jsonc - Wrangler config without nodejs_compat
 * @see vitest.smoke.workerd.nocompat.config.ts - Vitest config for this file
 * @see tests/unit/wrangler-config/NoNodeCompatFlag.test.ts - Static config check
 */

import { make } from "@test/utils/effect-test/Vitest.js";
import { Effect } from "effect";

const { test, describe } = make();

describe("@effect-libs/browser-cdp (no nodejs_compat)", () => {
  test("module loads", () => Effect.promise(() => import("@effect-libs/browser-cdp")));
});
