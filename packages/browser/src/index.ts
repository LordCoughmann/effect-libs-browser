/**
 * `@effect-libs/browser` core package — the abstract provider interface
 * and shared types every concrete `@effect-libs/browser-playwright`,
 * `@effect-libs/browser-cdp`, `@effect-libs/browser-stagehand`, and
 * `@effect-libs/browser-providers` package builds on.
 *
 * Install (only needed if you're writing a custom provider or driving the
 * provider interface directly — most consumers depend on one of the
 * client packages instead):
 *
 * ```bash
 * pnpm add @effect-libs/browser
 * ```
 *
 * @since 0.1.0
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core Package (Abstract Provider + Types)
// ─────────────────────────────────────────────────────────────────────────────

/** @since 0.1.0 */
export * from "./BrowserProvider.js";

/** @since 0.1.0 */
export * from "./utils/error.js";

/** @since 0.1.0 */
export * from "./shared/FetchSchemas.js";
