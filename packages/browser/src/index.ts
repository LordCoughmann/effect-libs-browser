/**
 * @effect-libs/browser core module — the abstract provider interface and
 * shared types every concrete provider and driver module builds on.
 *
 * Install (only needed if you're writing a custom provider or driving the
 * provider interface directly — most consumers depend on one of the
 * driver modules instead):
 *
 * ```bash
 * pnpm add @effect-libs/browser
 * ```
 *
 * @since 0.1.0
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core Module (Abstract Provider + Types)
// ─────────────────────────────────────────────────────────────────────────────

/** @since 0.1.0 */
export * from "./BrowserProvider.js";

/** @since 0.1.0 */
export * from "./utils/error.js";

/** @since 0.1.0 */
export * from "./shared/FetchSchemas.js";
