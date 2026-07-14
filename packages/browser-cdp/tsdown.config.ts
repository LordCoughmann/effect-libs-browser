import { resolve } from "node:path";
import { defineConfig } from "tsdown";

const src = (...s: string[]) => resolve(import.meta.dirname, "src", ...s);

export default defineConfig({
  entry: {
    index: src("index.ts"),
    "internal/Page/Evaluate/serialization/index": src(
      "internal",
      "Page",
      "Evaluate",
      "serialization",
      "index.ts",
    ),
    "internal/Page/WaitForNetworkIdle": src("internal", "Page", "WaitForNetworkIdle.ts"),
  },
  format: "esm",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  platform: "neutral",
  target: "esnext",
  shims: false,
  deps: { neverBundle: ["effect", "devtools-protocol", "@effect-libs/browser"] },
});
