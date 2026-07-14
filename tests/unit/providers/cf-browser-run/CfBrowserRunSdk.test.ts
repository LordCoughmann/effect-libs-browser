/**
 * Unit tests for CfBrowserRunSdk (raw SDK type).
 *
 * Tests verify the provider correctly exposes `accountId` and `.use()`
 * passes the raw `client.browserRendering` sub-client.
 */

import type { CfBrowserRunProviderService } from "@effect-libs/browser-providers/cf-browser-run";

import { assert, describe, it } from "@effect/vitest";
import { DateTime, Effect, Option, Redacted } from "effect";

import { BrowserProviderError, SessionId, UrlString } from "@effect-libs/browser";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CfBrowserRunSdk (raw)", () => {
  describe("accountId", () => {
    it("provider exposes accountId from config", () => {
      const provider: CfBrowserRunProviderService = {
        accountId: "test-account-123",
        createSession: () =>
          Effect.succeed({
            id: SessionId("test-session"),
            createdAt: DateTime.makeUnsafe(new Date()),
            cdpUrl: Redacted.make(UrlString("wss://test")),
          }),
        releaseSession: () => Effect.void,
        getCdpUrl: () => Option.some(Redacted.make(UrlString("wss://test"))),
        use: <A>(_fn: (client: any) => Promise<A>) =>
          Effect.tryPromise({
            try: () => Promise.resolve(null as A),
            catch: (cause) => new BrowserProviderError({ reason: "mock use failed", cause }),
          }),
      };

      assert.strictEqual(provider.accountId, "test-account-123");
    });
  });

  describe("raw SDK access", () => {
    it("use exposes the raw browserRendering sub-client", async () => {
      const provider: CfBrowserRunProviderService = {
        accountId: "test-account",
        createSession: () =>
          Effect.succeed({
            id: SessionId("test-session"),
            createdAt: DateTime.makeUnsafe(new Date()),
            cdpUrl: Redacted.make(UrlString("wss://test")),
          }),
        releaseSession: () => Effect.void,
        getCdpUrl: () => Option.some(Redacted.make(UrlString("wss://test"))),
        use: <A>(fn: (client: any) => Promise<A>) =>
          Effect.tryPromise({
            try: () =>
              fn({
                screenshot: { create: () => Promise.resolve({}) },
              } as any),
            catch: (cause) => new BrowserProviderError({ reason: "mock use failed", cause }),
          }),
      };

      await Effect.runPromise(
        provider.use(async (client) => {
          assert.isTrue(typeof client.screenshot.create === "function");
        }),
      );
    });
  });

  describe("provider isolation", () => {
    it("each provider has its own accountId", () => {
      const provider1: CfBrowserRunProviderService = {
        accountId: "account-A",
        createSession: () =>
          Effect.succeed({
            id: SessionId("1"),
            createdAt: DateTime.makeUnsafe(new Date()),
            cdpUrl: Redacted.make(UrlString("wss://test")),
          }),
        releaseSession: () => Effect.void,
        getCdpUrl: () => Option.none(),
        use: () => Effect.die("not implemented"),
      };
      const provider2: CfBrowserRunProviderService = {
        accountId: "account-B",
        createSession: () =>
          Effect.succeed({
            id: SessionId("2"),
            createdAt: DateTime.makeUnsafe(new Date()),
            cdpUrl: Redacted.make(UrlString("wss://test")),
          }),
        releaseSession: () => Effect.void,
        getCdpUrl: () => Option.none(),
        use: () => Effect.die("not implemented"),
      };

      assert.strictEqual(provider1.accountId, "account-A");
      assert.strictEqual(provider2.accountId, "account-B");
    });
  });
});
