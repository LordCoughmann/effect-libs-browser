/**
 * Tests for Cdp service structure.
 *
 * Verifies the service can be constructed and has the expected method surface.
 * Error behavior is tested in CdpError.test.ts.
 */

import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

describe("Cdp Service", () => {
  layer(Cdp.layer)((it) => {
    it.effect("service can be constructed", () =>
      Effect.gen(function* () {
        const service = yield* Cdp;
        assert.isTrue(service !== undefined);
      }),
    );

    it.effect("service has all required methods", () =>
      Effect.gen(function* () {
        const service = yield* Cdp;

        assert.strictEqual(typeof service.withSession, "function");
        assert.strictEqual(typeof service.withConnection, "function");
        assert.strictEqual(typeof service.withPage, "function");
        assert.strictEqual(typeof service.acquireSession, "function");
        assert.strictEqual(typeof service.acquireConnection, "function");
        assert.strictEqual(typeof service.acquirePage, "function");
      }),
    );
  });
});
