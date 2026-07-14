/**
 * `browser-playwright` — Effect-friendly wrapper around
 * `@effect-libs/cloudflare-playwright` (our maintained fork of
 * `@cloudflare/playwright@1.3.0`).
 *
 * The fork ships with all four patches baked in:
 * 1. Lazy `cloudflare:workers` import (module loads in non-Worker runtimes)
 * 2. External CDP support (connects to any `ws://`/`wss://` endpoint)
 * 3. ESM type resolution (`.d.ts` extensions)
 * 4. Orphaned-session handling (no `assert` failures from extension workers)
 *
 * Install:
 *
 * ```bash
 * pnpm add @effect-libs/browser-playwright @effect-libs/cloudflare-playwright
 * ```
 *
 * See {@link https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/cloudflare-playwright the fork's README}
 *   for what we patch and why, and {@link https://github.com/LordCoughmann/effect-libs-browser/tree/main/packages/cloudflare-playwright/patches/CHECKLIST.md patches/CHECKLIST.md}
 *   for the maintainer-internal rebase workflow
 *
 * @since 0.1.0
 */

/** @since 0.1.0 */
export * from "./Playwright.js";

/** @since 0.1.0 */
export * from "./PlaywrightTypes.js";

/** @since 0.1.0 */
export * from "./PlaywrightError.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  Browser,
  /**
   * @since 0.1.0
   */
  BrowserContext,
  /**
   * @since 0.1.0
   */
  Page,
} from "@effect-libs/cloudflare-playwright";

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

/**
 * Wrap a raw `@effect-libs/cloudflare-playwright` `Page` in the library's
 * `PlaywrightPage` abstraction. Exposed so providers that bootstrap a page
 * from a non-standard source (e.g. the Cloudflare Browser Binding) can produce
 * the same wrapped page as a normal Playwright session.
 *
 * @category constructors
 * @since 0.1.0
 */
export {
  /**
   * @category constructors
   * @since 0.1.0
   */
  makePage,
} from "./internal/PlaywrightPage.js";
