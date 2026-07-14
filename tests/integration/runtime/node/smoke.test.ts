/**
 * Node smoke test — verify modules load in Node.js runtime.
 *
 * No external services. Runs via vitest.
 */

import { make } from "@test/utils/effect-test/Vitest.js";
import { Effect } from "effect";

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
