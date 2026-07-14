/**
 * Stagehand integration tests for Node.js runtime.
 *
 * Uses shared test definitions from integration/shared/stagehand/stagehand.ts
 * to ensure consistency across Node and workerd runtimes.
 */

import { defineStagehandTests } from "@test/integration/shared/stagehand/stagehand.js";
import { make } from "@test/utils/effect-test/Vitest.js";

defineStagehandTests(make(), {
  wsUrl: process.env.CHROME_WS_URL!,
  httpUrl: process.env.HTTP_BASE_URL!,
});

// WebSocket polyfill test — Node-specific
import { describe, it } from "@effect/vitest";
import { assert } from "vitest";

describe("WebSocket Polyfill Integration", () => {
  it("polyfill is compatible with Stagehand's ws import", async () => {
    const { default: WebSocketPolyfill } = await import("@effect-libs/browser-stagehand/ws");

    assert.strictEqual(typeof WebSocketPolyfill, "function");
    assert.isTrue(WebSocketPolyfill.prototype.on !== undefined);
    assert.isTrue(WebSocketPolyfill.prototype.send !== undefined);
    assert.isTrue(WebSocketPolyfill.prototype.close !== undefined);
  });
});
