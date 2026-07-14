import { resolve } from "node:path";
import { defineConfig } from "tsdown";

const src = (...s: string[]) => resolve(import.meta.dirname, "src", ...s);

export default defineConfig({
  entry: { index: src("index.ts") },
  format: "esm",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  platform: "neutral",
  target: "esnext",
  shims: false,
  deps: { neverBundle: ["effect", "@effect-libs/cloudflare-playwright", "@effect-libs/browser"] },
});
