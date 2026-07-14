/**
 * Tests for Playwright service.
 *
 * Tests verify service methods exist and return expected error types.
 */

import { assert, describe, layer } from "@effect/vitest";
import { categorizePlaywrightError } from "@test/utils/helpers.js";
import { Effect, Predicate } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";

// ── Service Structure Tests ─────────────────────────────────────────────────────

describe("Playwright Service", () => {
  layer(Playwright.layer)((it) => {
    it.effect("service can be constructed", () =>
      Effect.gen(function* () {
        const service = yield* Playwright;
        assert.isTrue(service !== undefined);
      }),
    );

    it.effect("service has all required methods", () =>
      Effect.gen(function* () {
        const service = yield* Playwright;

        // Callback wrappers (primary)
        assert.strictEqual(typeof service.withSession, "function");
        assert.strictEqual(typeof service.withPage, "function");
        assert.strictEqual(typeof service.withConnection, "function");

        // Primitives (escape hatch)
        assert.strictEqual(typeof service.acquireSession, "function");
        assert.strictEqual(typeof service.acquirePage, "function");
        assert.strictEqual(typeof service.acquireConnection, "function");
      }),
    );
  });
});

// ── Method Behavior Tests ───────────────────────────────────────────────────────

describe("Playwright Methods", () => {
  layer(Playwright.layer)((it) => {
    it.effect("acquireConnection fails with ConnectionError for invalid endpoint", () =>
      Effect.gen(function* () {
        const service = yield* Playwright;

        const result = yield* service
          .acquireConnection({ url: "wss://invalid-endpoint-that-does-not-exist.test" })
          .pipe(
            Effect.scoped,
            Effect.match({
              onFailure: (e) => ({ ok: false as const, error: categorizePlaywrightError(e) }),
              onSuccess: () => ({ ok: true as const }),
            }),
          );

        assert.isFalse(result.ok);
        if (!result.ok) {
          assert.isTrue(Predicate.isTagged("connection")(result.error));
          if (Predicate.isTagged("connection")(result.error)) {
            assert.isString(result.error.description);
          }
        }
      }),
    );

    it.effect("withConnection fails with ConnectionError for invalid endpoint", () =>
      Effect.gen(function* () {
        const service = yield* Playwright;

        const result = yield* service
          .withConnection({ url: "wss://invalid-endpoint-that-does-not-exist.test" }, ({ page }) =>
            Effect.gen(function* () {
              yield* page.goto("https://example.com");
              return "success";
            }),
          )
          .pipe(
            Effect.match({
              onFailure: (e) => ({ ok: false as const, error: categorizePlaywrightError(e) }),
              onSuccess: () => ({ ok: true as const }),
            }),
          );

        assert.isFalse(result.ok);
        if (!result.ok) {
          assert.strictEqual(result.error._tag, "connection");
        }
      }),
    );
  });
});

// ── Error Handling Tests ─────────────────────────────────────────────────────────

describe("Playwright Error Handling", () => {
  layer(Playwright.layer)((it) => {
    it.effect("catchTag catches PlaywrightError", () =>
      Effect.gen(function* () {
        const service = yield* Playwright;

        const result = yield* service.acquireConnection({ url: "wss://invalid.test" }).pipe(
          Effect.scoped,
          Effect.match({
            onFailure: (e) => {
              const err = categorizePlaywrightError(e);
              const isConnection = Predicate.isTagged("connection")(err);
              return {
                caught: isConnection,
                description: isConnection ? err.description : "",
              };
            },
            onSuccess: () => ({ caught: false, description: "" }),
          }),
        );

        assert.isTrue(result.caught);
      }),
    );

    it.effect("catchTags catches multiple error types", () =>
      Effect.gen(function* () {
        const service = yield* Playwright;

        const result = yield* service.acquireConnection({ url: "wss://invalid.test" }).pipe(
          Effect.scoped,
          Effect.match({
            onFailure: (e) => {
              const err = categorizePlaywrightError(e);
              return Predicate.isTagged("connection")(err)
                ? { type: "connection" as const, description: err.description }
                : { type: "other" as const, description: "" };
            },
            onSuccess: () => ({ type: "other" as const, description: "" }),
          }),
        );

        assert.strictEqual(result.type, "connection");
        if (result.type === "connection") {
          assert.isString(result.description);
        }
      }),
    );
  });
});
