/**
 * Unit tests for CfBrowserRunBindingSdk factory.
 *
 * Tests verify that:
 * - The factory correctly creates the binding SDK with endpoint
 * - Binding operations are properly wired
 * - The raw endpoint is accessible
 */

import { assert, describe, it } from "@effect/vitest";

import {
  makeCfBrowserRunBindingSdk,
  type CfBrowserRunBindingSdk,
} from "@effect-libs/browser-providers/cf-browser-run-binding/CfBrowserRunBindingSdk";

// ── Test Helpers ──────────────────────────────────────────────────────────────

/**
 * Create a mock BrowserEndpoint.
 * In production, this would be env.MYBROWSER from Cloudflare Workers.
 */
const createMockEndpoint = () =>
  ({
    toString: () => "mock-browser-endpoint",
  }) as any;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("makeCfBrowserRunBindingSdk", () => {
  describe("SDK composition", () => {
    it("exposes the raw endpoint", () => {
      const endpoint = createMockEndpoint();
      const sdk = makeCfBrowserRunBindingSdk(endpoint);

      assert.strictEqual(sdk.endpoint, endpoint);
    });

    it("includes binding-specific operations", () => {
      const endpoint = createMockEndpoint();
      const sdk = makeCfBrowserRunBindingSdk(endpoint);

      assert.isFunction(sdk.limits);
      assert.isFunction(sdk.sessions);
      assert.isFunction(sdk.history);
      assert.isFunction(sdk.acquire);
    });
  });

  describe("type correctness", () => {
    it("CfBrowserRunBindingSdk has endpoint and operations", () => {
      const endpoint = createMockEndpoint();
      const sdk = makeCfBrowserRunBindingSdk(endpoint);

      const _typed: CfBrowserRunBindingSdk = sdk;
      assert.isOk(_typed);
    });
  });
});
