/**
 * Tests for Schema conversion (Effect Schema → Zod v4).
 *
 * Tests verify:
 * - Happy path: common schema patterns convert correctly
 * - Validation: converted schemas parse data correctly
 * - Unhappy path: conversion failures are defects
 */

import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { toZodSchema, SchemaConversionError } from "@effect-libs/browser-stagehand";

// =============================================================================
// Happy Path: Common Schema Patterns
// =============================================================================

describe("toZodSchema - happy path", () => {
  describe("primitive types", () => {
    it.effect("converts string schema", () =>
      Effect.gen(function* () {
        const zodSchema = yield* toZodSchema(Schema.String);

        assert.isTrue(zodSchema.safeParse("hello").success);
        assert.isFalse(zodSchema.safeParse(123).success);
      }),
    );

    it.effect("converts number schema", () =>
      Effect.gen(function* () {
        // @effect-diagnostics schemaNumber:off
        const zodSchema = yield* toZodSchema(Schema.Number);

        assert.isTrue(zodSchema.safeParse(42).success);
        assert.isFalse(zodSchema.safeParse("hello").success);
      }),
    );

    it.effect("converts boolean schema", () =>
      Effect.gen(function* () {
        const zodSchema = yield* toZodSchema(Schema.Boolean);

        assert.isTrue(zodSchema.safeParse(true).success);
        assert.isTrue(zodSchema.safeParse(false).success);
        assert.isFalse(zodSchema.safeParse("true").success);
      }),
    );
  });

  describe("object schemas", () => {
    it.effect("converts simple struct", () =>
      Effect.gen(function* () {
        const effectSchema = Schema.Struct({
          name: Schema.String,
          age: Schema.Finite,
        });

        const zodSchema = yield* toZodSchema(effectSchema);

        // Valid data
        const valid = zodSchema.safeParse({ name: "Alice", age: 30 });
        assert.isTrue(valid.success);

        // Missing field
        const missing = zodSchema.safeParse({ name: "Alice" });
        assert.isFalse(missing.success);

        // Extra field (should fail - additionalProperties: false)
        const extra = zodSchema.safeParse({ name: "Alice", age: 30, extra: "field" });
        assert.isFalse(extra.success);
      }),
    );

    it.effect("converts nested structs", () =>
      Effect.gen(function* () {
        const effectSchema = Schema.Struct({
          user: Schema.Struct({
            name: Schema.String,
            email: Schema.String,
          }),
          metadata: Schema.Struct({
            createdAt: Schema.String,
          }),
        });

        const zodSchema = yield* toZodSchema(effectSchema);

        const valid = zodSchema.safeParse({
          user: { name: "Alice", email: "alice@example.com" },
          metadata: { createdAt: "2024-01-01" },
        });
        assert.isTrue(valid.success);
      }),
    );
  });

  describe("optional fields", () => {
    it.effect("converts optional fields", () =>
      Effect.gen(function* () {
        const effectSchema = Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          email: Schema.optional(Schema.String),
        });

        const zodSchema = yield* toZodSchema(effectSchema);

        // Without optional field
        const without = zodSchema.safeParse({ id: "1", name: "Alice" });
        assert.isTrue(without.success);

        // With optional field
        const withEmail = zodSchema.safeParse({ id: "1", name: "Alice", email: "a@b.com" });
        assert.isTrue(withEmail.success);
      }),
    );
  });

  describe("enums (literals)", () => {
    it.effect("converts Literals to enum", () =>
      Effect.gen(function* () {
        const effectSchema = Schema.Struct({
          status: Schema.Literals(["active", "inactive", "pending"]),
        });

        const zodSchema = yield* toZodSchema(effectSchema);

        // Valid values
        assert.isTrue(zodSchema.safeParse({ status: "active" }).success);
        assert.isTrue(zodSchema.safeParse({ status: "inactive" }).success);

        // Invalid value
        assert.isFalse(zodSchema.safeParse({ status: "unknown" }).success);
      }),
    );
  });

  describe("arrays", () => {
    it.effect("converts array of primitives", () =>
      Effect.gen(function* () {
        const effectSchema = Schema.Struct({
          tags: Schema.Array(Schema.String),
        });

        const zodSchema = yield* toZodSchema(effectSchema);

        assert.isTrue(zodSchema.safeParse({ tags: ["a", "b", "c"] }).success);
        assert.isTrue(zodSchema.safeParse({ tags: [] }).success);
        assert.isFalse(zodSchema.safeParse({ tags: [1, 2, 3] }).success);
      }),
    );

    it.effect("converts array of objects", () =>
      Effect.gen(function* () {
        const effectSchema = Schema.Struct({
          items: Schema.Array(
            Schema.Struct({
              id: Schema.Finite,
              name: Schema.String,
            }),
          ),
        });

        const zodSchema = yield* toZodSchema(effectSchema);

        const valid = zodSchema.safeParse({
          items: [
            { id: 1, name: "Item 1" },
            { id: 2, name: "Item 2" },
          ],
        });
        assert.isTrue(valid.success);
      }),
    );
  });

  describe("records", () => {
    it.effect("converts record type", () =>
      Effect.gen(function* () {
        const effectSchema = Schema.Struct({
          availability: Schema.Record(Schema.String, Schema.String),
        });

        const zodSchema = yield* toZodSchema(effectSchema);

        const valid = zodSchema.safeParse({
          availability: { J: "9", W: "5", Y: "1" },
        });
        assert.isTrue(valid.success);
      }),
    );
  });
});

// =============================================================================
// Real-World Schema: FlightWithInfo
// =============================================================================

describe("toZodSchema - real-world schemas", () => {
  it.effect("converts FlightWithInfo schema (large nested schema)", () =>
    Effect.gen(function* () {
      // This is a real schema from the flights domain
      const CabinLoadSchema = Schema.Struct({
        cabin: Schema.Literals(["F", "J", "W", "Y"]),
        avStr: Schema.String,
        staffStandbyCounter: Schema.Finite,
      });

      const FlightLoadInfoSchema = Schema.Struct({
        cabins: Schema.Array(CabinLoadSchema),
        percentFilled: Schema.String,
        color: Schema.Literals(["GREEN", "YELLOW", "RED"]),
        updatedAt: Schema.String,
      });

      const FlightWithInfoSchema = Schema.Struct({
        departurePort: Schema.String,
        arrivalPort: Schema.String,
        departureTime: Schema.String,
        arrivalTime: Schema.String,
        departureDate: Schema.String,
        arrivalDate: Schema.String,
        marketingCompany: Schema.String,
        flightNo: Schema.String,
        availability: Schema.Record(Schema.String, Schema.String),
        callSign: Schema.String,
        aircraft: Schema.String,
        numberOfStops: Schema.Finite,
        duration: Schema.String,
        load: FlightLoadInfoSchema,
      });

      const zodSchema = yield* toZodSchema(FlightWithInfoSchema);

      // Valid flight data
      const flightData = {
        departurePort: "HKG",
        arrivalPort: "SIN",
        departureTime: "08:15",
        arrivalTime: "12:00",
        departureDate: "2024-05-09",
        arrivalDate: "2024-05-09",
        marketingCompany: "CX",
        flightNo: "659",
        availability: { J: "9", W: "5", Y: "1" },
        callSign: "CX659",
        aircraft: "359",
        numberOfStops: 0,
        duration: "3h 45m",
        load: {
          cabins: [
            { cabin: "J", avStr: "10+", staffStandbyCounter: 2 },
            { cabin: "Y", avStr: "40+", staffStandbyCounter: 3 },
          ],
          percentFilled: "32.14",
          color: "GREEN",
          updatedAt: "2024-05-04T12:00:00Z",
        },
      };

      const result = zodSchema.safeParse(flightData);
      assert.isTrue(result.success);

      // Invalid: wrong enum value
      const invalidData = {
        ...flightData,
        load: { ...flightData.load, color: "BLUE" },
      };
      const invalidResult = zodSchema.safeParse(invalidData);
      assert.isFalse(invalidResult.success);
    }),
  );
});

// =============================================================================
// Unhappy Path: Error Handling
// =============================================================================

describe("toZodSchema - unhappy path", () => {
  it("SchemaConversionError can be caught with catchTag", () => {
    // Verify SchemaConversionError can be created
    const error = new SchemaConversionError({
      cause: new Error("test"),
      reason: "test reason",
    });

    assert.strictEqual(error._tag, "effect-libs/browser/SchemaConversionError");
    assert.strictEqual(error.reason, "test reason");
    assert.isTrue(error.message.includes("test reason"));
  });

  it.effect("SchemaConversionError can be caught in a pipeline", () =>
    Effect.gen(function* () {
      const error = new SchemaConversionError({
        cause: "something went wrong",
        reason: "conversion failed",
      });

      const result = yield* Effect.fail(error).pipe(
        Effect.catchTag("effect-libs/browser/SchemaConversionError", (e) =>
          Effect.succeed(e.reason),
        ),
      );

      assert.strictEqual(result, "conversion failed");
    }),
  );

  it.effect("all common Effect Schema types convert without error", () =>
    Effect.gen(function* () {
      // Test that all common types convert successfully
      // This verifies our claim that conversion "should never fail"

      const schemas = {
        string: Schema.String,
        // @effect-diagnostics schemaNumber:off
        number: Schema.Number,
        boolean: Schema.Boolean,
        bigInt: Schema.BigInt,
        date: Schema.Date,
        undefined: Schema.Undefined,
        void: Schema.Void,
        any: Schema.Any,
        unknown: Schema.Unknown,
        literals: Schema.Literals(["a", "b", "c"]),
        array: Schema.Array(Schema.String),
        record: Schema.Record(Schema.String, Schema.Finite),
        struct: Schema.Struct({ name: Schema.String, age: Schema.Finite }),
        optional: Schema.optional(Schema.String),
      };

      // All should convert without throwing
      for (const [_name, schema] of Object.entries(schemas)) {
        const zodSchema = yield* toZodSchema(schema);
        assert.isTrue(zodSchema !== undefined);
        // Just verify it's a Zod schema by checking for parse method
        assert.strictEqual(typeof zodSchema.parse, "function");
      }
    }),
  );
});

// =============================================================================
// Type Safety
// =============================================================================

describe("toZodSchema - type inference", () => {
  it.effect("preserves type information through conversion", () =>
    Effect.gen(function* () {
      const ProductSchema = Schema.Struct({
        name: Schema.String,
        price: Schema.Finite,
        isInStock: Schema.Boolean,
      });

      const zodSchema = yield* toZodSchema(ProductSchema);

      // The schema should parse the expected type
      const product = { name: "Widget", price: 29.99, isInStock: true };
      const result = zodSchema.safeParse(product);

      assert.isTrue(result.success);
      if (result.success) {
        // TypeScript knows these fields exist
        assert.strictEqual(result.data.name, "Widget");
        assert.strictEqual(result.data.price, 29.99);
        assert.strictEqual(result.data.isInStock, true);
      }
    }),
  );
});
