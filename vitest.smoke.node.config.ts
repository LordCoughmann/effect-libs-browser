/**
 * Vitest configuration for Node.js smoke tests.
 *
 * Lightweight tests that verify modules load in Node.js runtime.
 */

import { defineProject, mergeConfig } from "vitest/config";

import sharedConfig from "./vitest.shared.config.ts";

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      name: "smoke-node",
      include: ["tests/integration/runtime/node/smoke.test.ts"],
      testTimeout: 10_000,
      hookTimeout: 10_000,
    },
  }),
);
