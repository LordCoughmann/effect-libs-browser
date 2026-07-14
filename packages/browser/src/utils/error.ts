/**
 * Utilities for safely extracting properties from unknown error causes.
 *
 * When errors wrap unknown causes (e.g., from external libraries or network errors),
 * we need to safely extract properties without type assertions at every call site.
 *
 * @category utilities
 * @since 0.1.0
 */

import { Option, Predicate } from "effect";

/**
 * Safely extract a string message from an unknown cause.
 *
 * @param cause - The unknown cause to extract from
 * @returns The message string if it exists and is a string, undefined otherwise
 *
 * @example
 * ```typescript
 * class MyError extends Error {
 *   get message() {
 *     return getCauseMessage(this.cause) ?? "Unknown error"
 *   }
 * }
 * ```
 */
export const getCauseMessage = (cause: unknown): Option.Option<string> =>
  Option.fromNullishOr(cause).pipe(
    Option.filter((u): u is { readonly message: unknown } => Predicate.hasProperty(u, "message")),
    Option.map((obj) => obj.message),
    Option.filter(Predicate.isString),
  );

/**
 * Convert an unknown cause to a string message.
 *
 * - If cause is an object with a string `message` property, returns that message
 * - Otherwise, returns `String(cause)`
 *
 * This is more robust than `instanceof Error` because it works across
 * realms (iframes, workers) and with error-like objects.
 *
 * @param cause - The unknown cause to convert
 * @returns A string message
 *
 * @example
 * ```typescript
 * getErrorMessage(new Error("foo"))     // "foo"
 * getErrorMessage({ message: "bar" })   // "bar"
 * getErrorMessage("baz")                // "baz"
 * getErrorMessage(null)                 // "null"
 * ```
 */
export const getErrorMessage = (cause: unknown): string =>
  Option.getOrElse(getCauseMessage(cause), () => String(cause));
