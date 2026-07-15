/**
 * `browser-stagehand` — AI-powered browser automation (Stagehand v3)
 * on Cloudflare Workers.
 *
 * **AI / LLM usage.** This package is a thin wrapper around upstream
 * `@browserbasehq/stagehand`. The wrapper code is LLM-assisted but small in
 * volume and human-reviewed. The package calls an LLM at runtime for
 * `act` / `extract` / `observe` — every call costs money and adds latency.
 *
 * Install:
 *
 * ```bash
 * pnpm add @effect-libs/browser-stagehand @browserbasehq/stagehand
 * ```
 *
 * @since 0.1.0
 */

/** @since 0.1.0 */
export * from "./Stagehand.js";

/** @since 0.1.0 */
export * from "./StagehandTypes.js";

/** @since 0.1.0 */
export * from "./StagehandError.js";

/** @since 0.1.0 */
export * from "./SchemaConverter.js";

// Re-export provider primitives from core so consumers don't need a
// direct dependency on @effect-libs/browser.
/**
 * @since 0.1.0
 */
export {
  /**
   * @since 0.1.0
   */
  BrowserProvider,
  /**
   * @since 0.1.0
   */
  BrowserProviderError,
  /**
   * @since 0.1.0
   */
  type BrowserProviderService,
  /**
   * @since 0.1.0
   */
  type BrowserProviderOptions,
  /**
   * @since 0.1.0
   */
  type BrowserProviderSession,
  /**
   * @since 0.1.0
   */
  type BrowserProviderSessionBase,
  /**
   * @since 0.1.0
   */
  type SessionId,
  /**
   * @since 0.1.0
   */
  type UrlString,
} from "@effect-libs/browser";
