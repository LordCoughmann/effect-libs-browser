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

import { cloudflareTest } from "@cloudflare/vitest-plugin";
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
      // Vitest 5 enables `fsModuleCache` by default, caching transformed modules
      // under `node_modules/.vitest-cache`. The plugin's workerd runner cannot read
      // those host-FS cache entries, so every test file fails before running with
      // "readAll: no such file or directory". Remove once cloudflare/workers-sdk#16163 ships.
      fsModuleCache: false,
      include: ["tests/integration/runtime/workerd/cdp/CdpNoCompat.smoke.test.ts"],
      testTimeout: 10_000,
      hookTimeout: 10_000,
    },
  }),
);
