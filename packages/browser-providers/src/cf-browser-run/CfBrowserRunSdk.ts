/**
 * Cloudflare Browser Run SDK wrapper.
 *
 * Centralizes type definitions and SDK engine namespaces to prevent
 * leaky third-party imports across the provider package layer. See the
 * {@link CfBrowserRunProvider} class for the consumer-facing documentation.
 *
 * @category providers
 * @since 0.1.0
 */

import Cloudflare from "cloudflare";

/**
 * Raw Cloudflare Browser Rendering SDK client type.
 *
 * @category models
 * @since 0.1.0
 */
export type CfBrowserRunSdk = Cloudflare["browserRendering"];

/**
 * Centralized SDK engine namespace for error catching and client initialization.
 *
 * @since 0.1.0
 */
export {
  /**
   * @since 0.1.0
   */
  Cloudflare,
};
