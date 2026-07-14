/**
 * Vitest configuration for workerd smoke tests.
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
        wrangler: { configPath: "./wrangler.test.jsonc" },
      }),
    ],
    test: {
      name: "smoke-workerd",
      include: ["tests/integration/runtime/workerd/smoke.test.ts"],
      testTimeout: 10_000,
      hookTimeout: 10_000,
    },
  }),
);
