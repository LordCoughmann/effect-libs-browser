/**
 * Vitest configuration for workerd integration tests **without `nodejs_compat`**.
 *
 * Runs the full CDP integration suite (`defineAllCdpTests`) under workerd
 * with `nodejs_compat` disabled. This is the dynamic half of the
 * "CDP module works on workerd without `nodejs_compat`" claim — the
 * smoke config (`vitest.smoke.workerd.nocompat.config.ts`) is the static
 * half (import-time check).
 *
 * If a future commit introduces a Node-only API in the CDP module's
 * runtime path (e.g. `Buffer.from`, `process.env`, `require`), this
 * suite fails at the affected test instead of silently passing under
 * the `nodejs_compat` flag in `wrangler.test.jsonc`.
 *
 * Excludes (CDP-only is the scope of the no-compat claim):
 * - `providers/**` — provider SDKs use Node APIs
 * - `playwright/**` — bundles `@cloudflare/playwright`, which requires Node
 * - `stagehand/**` — polyfills `node:async_hooks`
 *
 * @see wrangler.test.nocompat.jsonc - Wrangler config without nodejs_compat
 * @see vitest.integration.workerd.config.ts - Main workerd integration config
 * @see tests/integration/runtime/workerd/cdp/Cdp.integration.test.ts - Test entry point
 */

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject, mergeConfig } from "vitest/config";

import sharedConfig, { wsAlias } from "./vitest.shared.config.ts";

// Forward all process.env vars as miniflare bindings (parity with the
// main workerd config — env vars are how the orchestrator passes
// CHROME_WS_URL and HTTP_BASE_URL to workerd tests).
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
        wrangler: { configPath: "./wrangler.test.nocompat.jsonc" },
        miniflare: { bindings },
      }),
    ],
    test: {
      name: "integration-workerd-nocompat",
      // Reuse the shared CDP entry point — same tests as the main workerd
      // config, different runtime settings. Anything that passes here but
      // fails under nodejs_compat would be a real claim violation.
      include: ["tests/integration/runtime/workerd/cdp/Cdp.integration.test.ts"],
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
