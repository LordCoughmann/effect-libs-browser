import { resolve } from "node:path";
import { defineConfig } from "tsdown";

const src = (...segments: string[]) => resolve(import.meta.dirname, "src", ...segments);

export default defineConfig({
  entry: {
    index: src("index.ts"),
    cdp: src("cdp", "index.ts"),
    playwright: src("playwright", "index.ts"),
    stagehand: src("stagehand", "index.ts"),
    "stagehand/ws": src("stagehand", "polyfills", "ws.ts"),
    "providers/steel": src("providers", "steel", "index.ts"),
    "providers/browserbase": src("providers", "browserbase", "index.ts"),
    "providers/cf-browser-run": src("providers", "cf-browser-run", "index.ts"),
    "providers/cf-browser-run-binding": src("providers", "cf-browser-run-binding", "index.ts"),
  },
  format: "esm",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  platform: "neutral",
  target: "esnext",
  deps: {
    neverBundle: [
      // Effect ecosystem — peer dependency
      "effect",

      // Browser automation libraries — peer (and now direct) dependencies.
      // @cloudflare/playwright is the unpatched upstream; left here for
      // legacy imports / type references. @effect-libs/cloudflare-playwright
      // is our vendored fork and is a direct dependency of browser-playwright
      // — ship as a runtime require, don't inline 6MB of vendored playwright.
      "@cloudflare/playwright",
      "@effect-libs/cloudflare-playwright",
      "@browserbasehq/stagehand",

      // Providers — optional peer dependencies
      "steel-sdk",
      "@browserbasehq/sdk",

      // CDP types — used in src/cdp/
      "devtools-protocol",

      // Schema — used in src/stagehand/SchemaConverter.ts
      "zod",

      // Node.js polyfill — used in src/stagehand/polyfills/asyncLocalStorage.ts
      "node:async_hooks",
    ],
  },
  inputOptions: {
    resolve: {
      alias: {
        "@effect-libs/browser/playwright": src("playwright", "index.ts"),
        "@effect-libs/browser/cdp": src("cdp", "index.ts"),
        "@effect-libs/browser/stagehand": src("stagehand", "index.ts"),
        "@effect-libs/browser": src("index.ts"),
        "@effect-libs/browser/providers/cf-browser-run": src(
          "providers",
          "cf-browser-run",
          "index.ts",
        ),
        "@effect-libs/browser/providers/cf-browser-run-binding": src(
          "providers",
          "cf-browser-run-binding",
          "index.ts",
        ),
        "@effect-libs/browser/providers/browserbase": src("providers", "browserbase", "index.ts"),
      },
    },
  },
  shims: false,
});
