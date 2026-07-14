/**
 * Vitest configuration for integration tests running in workerd.
 */

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject, mergeConfig } from "vitest/config";

import sharedConfig, { wsAlias } from "./vitest.shared.config.ts";

// Forward all process.env vars as miniflare bindings.
const bindings: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined),
);

export default mergeConfig(
  mergeConfig(sharedConfig, { resolve: { alias: wsAlias } }),
  defineProject({
    resolve: {
      mainFields: ["module", "main"],
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.test.jsonc" },
        miniflare: { bindings },
      }),
    ],
    test: {
      name: "integration-workerd",
      include: ["tests/integration/runtime/workerd/**/*.test.ts"],
      exclude: [
        "tests/integration/runtime/workerd/providers/**",
        "tests/integration/runtime/workerd/stagehand/worker-test/**",
        "tests/integration/runtime/workerd/stagehand/StagehandBrowser.integration.test.ts",
      ],
      testTimeout: 10_000,
      hookTimeout: 30_000,
      globalSetup: ["./tests/integration/runtime/workerd/setup.ts"],
      isolate: false,
      fileParallelism: false,
      deps: {
        optimizer: {
          ssr: {
            enabled: true,
            include: [
              // `ws` is the polyfill replaced by the Stagehand package's
              // `src/polyfills/ws.ts` via the workerd `alias` config.
              // Stagehand v3 on workerd is exercised via `wrangler dev`
              // (see tests/integration/runtime/workerd/stagehand/driver.ts)
              // — NOT vitest-pool-workers — because of the @smithy/* dual-
              // format module resolution bug tracked at
              // cloudflare/workers-sdk#13037. The @smithy/* entries that
              // used to live here were vestigial: they caused Vite SSR's
              // pre-bundle step to fail (the packages don't resolve from
              // the worker bundle context) without enabling anything in
              // the actual test path. Removed.
              "ws",
            ],
          },
        },
      },
    },
  }),
);
