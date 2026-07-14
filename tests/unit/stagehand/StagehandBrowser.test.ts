/**
 * Tests for Stagehand service error handling.
 *
 * Tests verify error paths and edge cases without requiring
 * a real Stagehand instance or CDP connection.
 */

import { assert, describe, it, layer } from "@effect/vitest";
import { Effect } from "effect";

import {
  Stagehand,
  StagehandError,
  ConnectionError,
  OperationError,
} from "@effect-libs/browser-stagehand";

// ── Error Type Tests ───────────────────────────────────────────────────────────

describe("StagehandError (new model)", () => {
  it("wraps ConnectionError reason", () => {
    const error = new StagehandError({
      module: "Stagehand",
      method: "withConnection",
      reason: new ConnectionError({
        description: "Connection failed",
      }),
    });

    assert.strictEqual(error._tag, "effect-libs/browser/StagehandError");
    assert.strictEqual(error.reason._tag, "effect-libs/browser/StagehandError/ConnectionError");
    assert.isTrue(error.isRetryable);
  });

  it("wraps OperationError reason", () => {
    const error = new StagehandError({
      module: "StagehandInstance",
      method: "use",
      reason: new OperationError({
        action: "act",
        description: "Action failed",
      }),
    });

    assert.strictEqual(error.reason._tag, "effect-libs/browser/StagehandError/OperationError");
    assert.isTrue(error.isRetryable);
  });

  it("message includes module and method", () => {
    const error = new StagehandError({
      module: "Stagehand",
      method: "withConnection",
      reason: new ConnectionError({
        description: "test",
      }),
    });

    assert.isTrue(error.message.includes("Stagehand"));
    assert.isTrue(error.message.includes("withConnection"));
  });

  it.effect("can be caught with catchTag", () =>
    Effect.gen(function* () {
      const result = yield* Effect.fail(
        new StagehandError({
          module: "test",
          method: "test",
          reason: new ConnectionError({ description: "test" }),
        }),
      ).pipe(
        Effect.catchTag("effect-libs/browser/StagehandError", (e) => Effect.succeed(e.message)),
      );

      assert.isTrue(result.includes("test"));
    }),
  );

  it.effect("catchTag catches StagehandError in a pipeline", () =>
    Effect.gen(function* () {
      const result = yield* Effect.fail(
        new StagehandError({
          module: "test",
          method: "test",
          reason: new OperationError({ action: "act", description: "op failed" }),
        }),
      ).pipe(
        Effect.catchTag("effect-libs/browser/StagehandError", (e) =>
          Effect.succeed({ caught: true as const, reason: e.reason._tag }),
        ),
      );

      assert.isTrue(result.caught);
    }),
  );
});

// ── Service Structure Tests ─────────────────────────────────────────────────────

describe("Stagehand Service", () => {
  layer(Stagehand.layer({ model: "openai/gpt-4o", apiKey: "test-key" }))((it) => {
    it.effect("service can be constructed", () =>
      Effect.gen(function* () {
        const service = yield* Stagehand;
        assert.isTrue(service !== undefined);
      }),
    );

    it.effect("service has required methods", () =>
      Effect.gen(function* () {
        const service = yield* Stagehand;

        assert.strictEqual(typeof service.withSession, "function");
        assert.strictEqual(typeof service.withConnection, "function");
      }),
    );

    it.effect("withConnection returns an Effect (lazy)", () =>
      Effect.gen(function* () {
        const service = yield* Stagehand;

        // Creating the Effect doesn't throw - it's lazy
        const program = service.withConnection({ url: "ws://localhost:9222" }, () =>
          Effect.succeed("success"),
        );

        // Verify it's an Effect (has pipe method)
        assert.strictEqual(typeof program.pipe, "function");
      }),
    );
  });
});

// ── Error Propagation Tests ────────────────────────────────────────────────────

describe("Stagehand error propagation", () => {
  layer(Stagehand.layer({ model: "openai/gpt-4o", apiKey: "test-key" }))((it) => {
    it.effect("user errors in callback are propagated", () =>
      Effect.gen(function* () {
        const service = yield* Stagehand;

        const program = service.withConnection({ url: "ws://localhost:9222" }, () =>
          Effect.fail(
            new StagehandError({
              module: "test",
              method: "test",
              reason: new ConnectionError({ description: "User error" }),
            }),
          ),
        );

        const result = yield* program.pipe(
          Effect.match({
            onFailure: (e) => ({ caught: true, error: e }),
            onSuccess: () => ({ caught: false }),
          }),
        );

        assert.isTrue(result.caught);
      }),
    );
  });
});
