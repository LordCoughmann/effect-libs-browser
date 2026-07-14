/**
 * Schema conversion utilities for Stagehand integration.
 *
 * Provides helpers to convert Effect v4 Schemas to Zod v4 schemas
 * for use with Stagehand's `extract()` method.
 *
 * Stagehand's `extract()` method requires Zod schemas, but your application
 * may define schemas using Effect Schema for validation elsewhere. This helper
 * bridges the gap by converting Effect Schemas to Zod v4 via JSON Schema.
 *
 * Conversion is fast (<1ms for most schemas) and negligible compared to LLM
 * API call overhead (500-2000ms).
 *
 * @category converting
 * @since 0.1.0
 */

import { Effect, Schema } from "effect";
import { z } from "zod";

import { getErrorMessage } from "@effect-libs/browser";

// =============================================================================
// Types
// =============================================================================

/**
 * Effect Schema that can be converted to Zod.
 *
 * @category types
 * @since 0.1.0
 */
export type EffectSchema<T> = Schema.Schema<T>;

/**
 * Zod schema type.
 *
 * @category types
 * @since 0.1.0
 */
export type ZodSchema<T> = z.ZodType<T>;

// =============================================================================
// Error
// =============================================================================

/**
 * Error during schema conversion.
 *
 * This error indicates that an Effect Schema could not be converted to Zod.
 * This typically happens when:
 * - The schema uses types that cannot be represented in JSON Schema
 * - Zod's `fromJSONSchema` encounters an unsupported JSON Schema feature
 *
 * In practice, this error should rarely occur for common schema patterns.
 *
 * @category errors
 * @since 0.1.0
 */
export class SchemaConversionError extends Schema.TaggedErrorClass<SchemaConversionError>()(
  "effect-libs/browser/SchemaConversionError",
  Schema.Struct({
    /** The error that occurred during conversion */
    cause: Schema.Defect(),
    /** Human-readable description of what failed */
    reason: Schema.String,
  }),
) {
  override get message(): string {
    const causeStr = getErrorMessage(this.cause);
    return `Schema conversion failed: ${this.reason} - ${causeStr}`;
  }
}

// =============================================================================
// Conversion
// =============================================================================

/**
 * Convert an Effect v4 Schema to a Zod v4 schema for Stagehand.
 *
 * Uses JSON Schema (draft-2020-12) as the intermediate format:
 * Effect Schema → JSON Schema → Zod v4
 *
 * Returns an Effect that succeeds with the Zod schema, or fails with
 * a defect if conversion is impossible (e.g., unsupported schema types).
 *
 * @param effectSchema - The Effect Schema to convert
 * @returns An Effect that succeeds with a Zod v4 schema
 *
 * @example
 * ```typescript
 * import { Schema } from "effect";
 * import { toZodSchema } from "@effect-libs/browser-stagehand";
 *
 * // Define your schema in Effect Schema
 * const ProductEffect = Schema.Struct({
 *   name: Schema.String,
 *   price: Schema.Number,
 *   inStock: Schema.Boolean,
 * });
 *
 * // Convert to Zod for Stagehand
 * const program = Effect.gen(function* () {
 *   const ProductZod = yield* toZodSchema(ProductEffect);
 *
 *   // Use with Stagehand
 *   const data = yield* instance.use((s) =>
 *     s.extract("extract product details", ProductZod)
 *   );
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Inline usage
 * const program = Effect.gen(function* () {
 *   const data = yield* instance.use((s) =>
 *     s.extract("extract the price", yield* toZodSchema(Schema.Struct({ price: Schema.Number })))
 *   );
 * });
 * ```
 *
 * @remarks
 * - `z.fromJSONSchema()` is experimental in Zod v4
 * - Effect's JSON Schema includes NaN/Infinity handling for numbers
 *   (creates `anyOf` unions), but this doesn't affect Stagehand's usage
 * - Conversion overhead is <1ms, negligible compared to LLM API calls
 * - Errors are typed `SchemaConversionError` - callers can catch or orDie as needed
 * - Use `Effect.orDie` at the call site if you want the old behavior (defect on failure)
 *
 * @category converting
 * @since 0.1.0
 */
export function toZodSchema<T>(
  effectSchema: EffectSchema<T>,
): Effect.Effect<ZodSchema<T>, SchemaConversionError> {
  return Effect.try({
    try: () => {
      // Step 1: Effect Schema → JSON Schema Document
      const jsonSchemaDoc = Schema.toJsonSchemaDocument(effectSchema);

      // Step 2: Merge definitions into schema (rename "definitions" to "$defs" for draft-2020-12)
      // Schema.Class uses $ref: "#/$defs/ClassName" but toJsonSchemaDocument stores them under "definitions"
      const fullSchema = {
        ...jsonSchemaDoc.schema,
        $defs: jsonSchemaDoc.definitions,
      };

      // Step 3: JSON Schema → Zod v4
      return z.fromJSONSchema(fullSchema) as ZodSchema<T>;
    },
    catch: (cause) =>
      new SchemaConversionError({
        cause,
        reason: "Failed to convert Effect Schema to Zod via JSON Schema",
      }),
  }).pipe(
    // Add tracing span for observability
    Effect.withSpan("stagehand.toZodSchema"),
  );
}

// =============================================================================
// Aliases
// =============================================================================

/**
 * Alias for `toZodSchema` - converts Effect Schema to Zod v4.
 *
 * Named explicitly for clarity when importing alongside other utilities.
 *
 * @category utilities
 * @since 0.1.0
 */
export const effectSchemaToZod = toZodSchema;
