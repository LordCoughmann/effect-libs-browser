/**
 * Vitest configuration for unit tests.
 *
 * Unit tests run in Node.js runtime with mocked dependencies.
 */

import { defineProject, mergeConfig } from "vitest/config";

import sharedConfig from "./vitest.shared.config.ts";

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      name: "unit",
      include: ["tests/unit/**/*.test.ts"],
      exclude: ["repos/**"],
      setupFiles: ["./tests/unit/setup.ts"],
      testTimeout: 10_000,
    },
  }),
);
