import { resolve } from "node:path";
import { defineConfig } from "tsdown";

const src = (...p: string[]) => resolve(import.meta.dirname, "src", ...p);

export default defineConfig({
  entry: {
    "steel/index": src("steel", "index.ts"),
    "browserbase/index": src("browserbase", "index.ts"),
    "cf-browser-run/index": src("cf-browser-run", "index.ts"),
    "cf-browser-run/CfBrowserRunSdk": src("cf-browser-run", "CfBrowserRunSdk.ts"),
    "cf-browser-run-binding/index": src("cf-browser-run-binding", "index.ts"),
    "cf-browser-run-binding/CfBrowserRunBindingSdk": src(
      "cf-browser-run-binding",
      "CfBrowserRunBindingSdk.ts",
    ),
  },
  format: "esm",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  platform: "neutral",
  target: "esnext",
  shims: false,
  deps: {
    neverBundle: [
      "effect",
      "steel-sdk",
      "@browserbasehq/sdk",
      "cloudflare",
      "@effect-libs/browser",
      "@effect-libs/browser-playwright",
      "@effect-libs/cloudflare-playwright",
    ],
  },
});
