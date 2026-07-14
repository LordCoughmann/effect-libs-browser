/**
 * Vitest configuration for provider tests (real APIs).
 */

import "@dotenvx/dotenvx/config";
import { defineProject, mergeConfig } from "vitest/config";

import sharedConfig from "./vitest.shared.config.ts";

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      name: "providers",
      include: ["tests/integration/runtime/node/providers/**/*.test.ts"],
      testTimeout: 120_000,
      hookTimeout: 60_000,
      fileParallelism: false,
    },
  }),
);
