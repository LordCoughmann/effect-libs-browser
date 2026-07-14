/**
 * Timer-based sleep that works in all runtime contexts.
 *
 * Uses `setTimeout` directly instead of `Effect.sleep` because `Effect.sleep`
 * may not work properly in `@effect/vitest`'s `it.effect` test context.
 * The fiber scheduler in test contexts can have issues with sleep resumption.
 *
 */

import { Effect } from "effect";

/**
 * Sleep for the specified duration using host runtime timers.
 *
 * This uses `setTimeout` directly, which works reliably across all contexts
 * including Vitest's test runtime.
 *
 * @param ms - Duration in milliseconds
 */
export const sleep = (ms: number): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const timer = setTimeout(() => resume(Effect.void), ms);
    return Effect.sync(() => clearTimeout(timer));
  });
