/**
 * Workerd smoke test — verify modules load in Cloudflare Workers runtime.
 *
 * No external services. Runs via @cloudflare/vitest-pool-workers.
 */

import { make } from "@test/utils/effect-test/Vitest.js";
import { Effect } from "effect";
import { it, expect } from "vitest";

const { test, describe } = make();

describe("@effect-libs/browser-cdp", () => {
  test("module loads", () => Effect.promise(() => import("@effect-libs/browser-cdp")));
});

describe("@effect-libs/browser-playwright", () => {
  test("module loads", () => Effect.promise(() => import("@effect-libs/browser-playwright")));
});

describe("@effect-libs/browser-stagehand", () => {
  test("module loads", () => Effect.promise(() => import("@effect-libs/browser-stagehand")));

  /**
   * AsyncLocalStorage.enterWith polyfill for workerd.
   *
   * Workerd's nodejs_compat provides AsyncLocalStorage but omits enterWith()
   * because it mutates context for the entire async chain (unsafe for concurrent requests).
   * The stagehand module import triggers the polyfill, which stubs enterWith()
   * to a no-op so Stagehand's FlowLogger.init() doesn't throw.
   *
   * Context propagation uses run() which works natively in workerd.
   *
   * @see {@link ../../src/stagehand/polyfills/asyncLocalStorage.ts}
   * @see https://github.com/browserbase/stagehand/issues/2055
   */
  it("AsyncLocalStorage.enterWith does not throw (polyfill)", async () => {
    const { AsyncLocalStorage } = await import("node:async_hooks");
    const als = new AsyncLocalStorage<string>();

    // The polyfill stubs enterWith() to a no-op so it doesn't throw
    expect(() => als.enterWith("test-value")).not.toThrow();
  });

  it("AsyncLocalStorage.run/getStore work natively in workerd", async () => {
    const { AsyncLocalStorage } = await import("node:async_hooks");
    const als = new AsyncLocalStorage<string>();

    // run() and getStore() are natively supported in workerd
    const result = als.run("inside-run", () => als.getStore());
    expect(result).toBe("inside-run");
  });
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
// EXPECTED FAILURES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Unpatched playwright requires Node.js APIs not available in workerd.
 *
 * @throws "No such module 'node:process'" at import time
 * @see {@link https://www.npmjs.com/package/@cloudflare/playwright} — patched version for Workers
 */
it.fails("playwright loads (unpatched)", async () => {
  await import("playwright");
});
