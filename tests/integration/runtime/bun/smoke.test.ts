/**
 * Bun smoke test — verify modules load in Bun runtime.
 *
 * No external services. Runs via bun test.
 */

import { test as bunTest, expect } from "bun:test";
import { Effect } from "effect";

import { make } from "./Bun.js";

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
 * Bun has excellent Node.js compatibility and playwright loads successfully.
 */
bunTest("playwright loads (unpatched)", async () => {
  const playwright = await import("playwright");
  expect(playwright).toBeDefined();
});
