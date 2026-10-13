/**
 * Vitest configuration for workerd smoke tests.
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
        wrangler: { configPath: "./wrangler.test.jsonc" },
      }),
    ],
    test: {
      name: "smoke-workerd",
      // Vitest 5 enables `fsModuleCache` by default, caching transformed modules
      // under `node_modules/.vitest-cache`. The plugin's workerd runner cannot read
      // those host-FS cache entries, so every test file fails before running with
      // "readAll: no such file or directory". Remove once cloudflare/workers-sdk#16163 ships.
      fsModuleCache: false,
      include: ["tests/integration/runtime/workerd/smoke.test.ts"],
      testTimeout: 10_000,
      hookTimeout: 10_000,
    },
  }),
);
