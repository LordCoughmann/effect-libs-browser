/**
 * Vitest configuration for Node.js integration tests.
 */

import { defineProject, mergeConfig } from "vitest/config";

import sharedConfig from "./vitest.shared.config.ts";

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      name: "integration-node",
      include: ["tests/integration/runtime/node/**/*.test.ts"],
      exclude: ["tests/integration/runtime/node/providers/**"],
      testTimeout: 10_000,
      hookTimeout: 30_000,
      globalSetup: ["./tests/integration/runtime/node/setup.ts"],
      isolate: false,
      fileParallelism: false,
    },
  }),
);
