/**
 * Unit tests for CDP Configuration.
 *
 * Tests CdpConfig service layer creation and defaults.
 */

import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { CdpConfig } from "../../../packages/browser-cdp/src/internal/CdpConfig.js";

// ── Layer Tests ──────────────────────────────────────────────────────────────

describe("CdpConfig layers", () => {
  it.effect("layerTest provides fast timeout values", () =>
    Effect.gen(function* () {
      const config = yield* CdpConfig;

      assert.strictEqual(config.commandTimeoutMs, 5_000);
      assert.strictEqual(config.connectTimeoutMs, 2_000);
      assert.strictEqual(config.debug, false);
      // endpoint defaults to Steel
      assert.isTrue(config.endpoint.includes("steel.dev"));
    }).pipe(Effect.provide(CdpConfig.layerTest)),
  );

  it.effect("layerCustom allows overriding all values", () =>
    Effect.gen(function* () {
      const config = yield* CdpConfig;

      assert.strictEqual(config.endpoint, "ws://custom:9222");
      assert.strictEqual(config.commandTimeoutMs, 10_000);
      assert.strictEqual(config.connectTimeoutMs, 5_000);
      assert.strictEqual(config.debug, true);
    }).pipe(
      Effect.provide(
        CdpConfig.layerCustom({
          endpoint: "ws://custom:9222",
          commandTimeoutMs: 10_000,
          connectTimeoutMs: 5_000,
          debug: true,
        }),
      ),
    ),
  );

  it.effect("layerCustom uses defaults for missing values", () =>
    Effect.gen(function* () {
      const config = yield* CdpConfig;

      // Only override endpoint
      assert.strictEqual(config.endpoint, "ws://override:9222");
      // Others use defaults
      assert.strictEqual(config.commandTimeoutMs, 30_000);
      assert.strictEqual(config.connectTimeoutMs, 20_000);
      assert.strictEqual(config.debug, false);
    }).pipe(Effect.provide(CdpConfig.layerCustom({ endpoint: "ws://override:9222" }))),
  );
});

// ── Service Interface ────────────────────────────────────────────────────────

describe("CdpConfigService interface", () => {
  it.effect("provides all required fields", () =>
    Effect.gen(function* () {
      const config = yield* CdpConfig;

      assert.isString(config.endpoint);
      assert.isNumber(config.commandTimeoutMs);
      assert.isNumber(config.connectTimeoutMs);
      assert.isBoolean(config.debug);
    }).pipe(Effect.provide(CdpConfig.layerTest)),
  );

  it.effect("endpoint is WebSocket URL", () =>
    Effect.gen(function* () {
      const config = yield* CdpConfig;

      // Default is wss://connect.steel.dev
      assert.isTrue(config.endpoint.startsWith("wss://"));
    }).pipe(Effect.provide(CdpConfig.layerTest)),
  );
});

// ── Config Validation ────────────────────────────────────────────────────────

describe("CdpConfig timeout values", () => {
  it.effect("commandTimeoutMs is reasonable range", () =>
    Effect.gen(function* () {
      const config = yield* CdpConfig;

      // Should be between 1s and 60s for reasonable timeouts
      assert.isTrue(config.commandTimeoutMs >= 1_000);
      assert.isTrue(config.commandTimeoutMs <= 60_000);
    }).pipe(Effect.provide(CdpConfig.layerTest)),
  );

  it.effect("connectTimeoutMs is reasonable range", () =>
    Effect.gen(function* () {
      const config = yield* CdpConfig;

      // Should be between 1s and 30s
      assert.isTrue(config.connectTimeoutMs >= 1_000);
      assert.isTrue(config.connectTimeoutMs <= 30_000);
    }).pipe(Effect.provide(CdpConfig.layerTest)),
  );
});
