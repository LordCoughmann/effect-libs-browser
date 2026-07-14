/**
 * Deno smoke test — verify modules load in Deno runtime.
 *
 * No external services. Runs via deno test.
 */

import { it } from "@std/testing/bdd";
import { Effect } from "effect";

import { make } from "./Deno.ts";

const { test, describe } = make();

describe("@effect-libs/browser-cdp", () => {
  test("module loads", () => Effect.promise(() => import("@effect-libs/browser-cdp")));
});

describe("@effect-libs/browser-playwright", () => {
  test("module loads", () => Effect.promise(() => import("@effect-libs/browser-playwright")));
});

describe("@effect-libs/browser-stagehand", () => {
  test("module loads", () => Effect.promise(() => import("@effect-libs/browser-stagehand")));
});

describe("@effect-libs/browser-providers/steel", () => {
  test("module loads", () => Effect.promise(() => import("@effect-libs/browser-providers/steel")));
});

describe("@effect-libs/browser-providers/browserbase", () => {
  test("module loads", () =>
    Effect.promise(() => import("@effect-libs/browser-providers/browserbase")));
});

describe("@effect-libs/browser-providers/cf-browser-run", () => {
  test("module loads", () =>
    Effect.promise(() => import("@effect-libs/browser-providers/cf-browser-run")));
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYWRIGHT IMPORT TEST
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Playwright loads successfully in Deno with --allow-node flag.
 * Deno BDD doesn't have it.fails/it.failing, so we use a simple test that
 * reports the result.
 */
it({
  name: "playwright loads",
  fn: async () => {
    await import("playwright");
    console.log("playwright import succeeded");
  },
});
