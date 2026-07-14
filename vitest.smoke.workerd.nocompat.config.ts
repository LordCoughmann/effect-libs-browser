/**
 * Vitest configuration for workerd smoke tests **without `nodejs_compat`**.
 *
 * Verifies that the CDP module's import graph is Node-API-free. The
 * runtime is locked to workerd by the wrangler config; the test file
 * itself only imports `@effect-libs/browser-cdp`.
 *
 * @see wrangler.test.nocompat.jsonc - Wrangler config without nodejs_compat
 * @see tests/integration/runtime/workerd/cdp/CdpNoCompat.smoke.test.ts - Test entry point
 */

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject, mergeConfig } from "vitest/config";

import sharedConfig, { wsAlias } from "./vitest.shared.config.ts";

export default mergeConfig(
  mergeConfig(sharedConfig, { resolve: { alias: wsAlias } }),
  defineProject({
    resolve: {
      mainFields: ["module", "main"],
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.test.nocompat.jsonc" },
      }),
    ],
    test: {
      name: "smoke-workerd-nocompat",
      include: ["tests/integration/runtime/workerd/cdp/CdpNoCompat.smoke.test.ts"],
      testTimeout: 10_000,
      hookTimeout: 10_000,
    },
  }),
);
