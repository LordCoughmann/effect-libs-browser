/**
 * Shared Vitest configuration with source aliases.
 *
 * All test configs merge this config to get consistent module resolution.
 * Aliases point to package source files (packages/<pkg>/src) instead of dist,
 * allowing tests to run without building first.
 *
 * NOTE: these mirror each package's `exports` → `source` condition. If a
 * package gains a new entry, add the matching alias here.
 */

import { defineConfig } from "vitest/config";

/**
 * Source aliases for the @effect-libs/browser-* workspace packages.
 *
 * IMPORTANT: More specific aliases must come BEFORE less specific ones.
 * A bare `@effect-libs/browser` alias must come LAST so that more specific
 * aliases like `@effect-libs/browser-providers/steel` match first.
 */
export const sourceAliases = {
  "@test": "./tests",
  // CDP internals (for tests) — must come before @effect-libs/browser-cdp
  "@effect-libs/browser-cdp/serialization":
    "./packages/browser-cdp/src/internal/Page/Evaluate/serialization/index.ts",
  "@effect-libs/browser-cdp/WaitForNetworkIdle":
    "./packages/browser-cdp/src/internal/Page/WaitForNetworkIdle.ts",
  "@effect-libs/browser-cdp": "./packages/browser-cdp/src/index.ts",
  // Playwright
  "@effect-libs/browser-playwright": "./packages/browser-playwright/src/index.ts",
  // Stagehand internals (for tests)
  "@effect-libs/browser-stagehand/ws": "./packages/browser-stagehand/src/polyfills/ws.ts",
  "@effect-libs/browser-stagehand": "./packages/browser-stagehand/src/index.ts",
  // Providers — cf-browser-run internals (for tests), before the package alias
  "@effect-libs/browser-providers/cf-browser-run/CfBrowserRunSdk":
    "./packages/browser-providers/src/cf-browser-run/CfBrowserRunSdk.ts",
  "@effect-libs/browser-providers/cf-browser-run-binding/CfBrowserRunBindingSdk":
    "./packages/browser-providers/src/cf-browser-run-binding/CfBrowserRunBindingSdk.ts",
  "@effect-libs/browser-providers/steel": "./packages/browser-providers/src/steel/index.ts",
  "@effect-libs/browser-providers/browserbase":
    "./packages/browser-providers/src/browserbase/index.ts",
  "@effect-libs/browser-providers/cf-browser-run":
    "./packages/browser-providers/src/cf-browser-run/index.ts",
  "@effect-libs/browser-providers/cf-browser-run-binding":
    "./packages/browser-providers/src/cf-browser-run-binding/index.ts",
  // Core (must come LAST so more specific aliases match first)
  "@effect-libs/browser": "./packages/browser/src/index.ts",
};

/**
 * WebSocket polyfill for Cloudflare Workers.
 * Stagehand imports 'ws' which fails in workerd.
 */
export const wsAlias = {
  ws: "./packages/browser-stagehand/src/polyfills/ws.ts",
};

export default defineConfig({
  resolve: {
    alias: sourceAliases,
  },
  test: {
    // Tags must be registered in the config before they can be applied to a
    // test (Vitest 4 requirement). The `cleanup` tag is a documentation
    // marker used by the Resource Cleanup tests in the playwright suite.
    // These tests assert that scoped APIs (`withConnection`, `withContext`,
    // `withPage`) actually close their resources when the scope exits.
    // A failed `cleanup`-tagged test fails the run via vitest's normal
    // failure handling — there is no separate gate.
    tags: [
      {
        name: "cleanup",
        description:
          "Resource-cleanup contract test. Asserts that a scoped API " +
          "(e.g. withPage, withContext) actually closes its resources " +
          "when the scope exits. Failures fail the run normally via vitest.",
      },
    ],
  },
});
