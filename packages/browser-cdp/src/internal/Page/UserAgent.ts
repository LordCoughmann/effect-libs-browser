/**
 * User Agent override types for CDP.
 *
 * Mirrors Playwright's `BrowserContext.setUserAgent()` semantics. Context
 * owns the override; every page in the context receives it via
 * `Emulation.setUserAgentOverride`.
 *
 * @see https://wicg.github.io/ua-client-hints/ for the underlying
 *   User-Agent Client Hints spec.
 */

/** A single brand entry in `Sec-CH-UA` / `Sec-CH-UA-Full-Version-List`. */
export interface UserAgentBrandVersion {
  /** Brand identifier, e.g. `"Chromium"`, `"Google Chrome"`. */
  readonly brand: string;
  /** Brand version string, e.g. `"120"`. */
  readonly version: string;
}

/**
 * User Agent Client Hints metadata sent in `Sec-CH-UA-*` headers.
 *
 * Mirrors the protocol shape `Emulation.UserAgentMetadata`. The browser fills
 * in any omitted fields with sensible defaults matching the user agent string.
 */
export interface UserAgentMetadata {
  /** Brands appearing in `Sec-CH-UA`. */
  readonly brands?: ReadonlyArray<UserAgentBrandVersion>;
  /** Brands appearing in `Sec-CH-UA-Full-Version-List`. */
  readonly fullVersionList?: ReadonlyArray<UserAgentBrandVersion>;
  readonly fullVersion?: string;
  readonly platform: string;
  readonly platformVersion: string;
  readonly architecture: string;
  readonly model: string;
  readonly mobile: boolean;
  readonly bitness?: string;
  readonly wow64?: boolean;
}

/**
 * Stored context-level user-agent override.
 *
 * `userAgentMetadata` is optional — set it to match `Sec-CH-UA-*` client hints
 * to a specific browser fingerprint. Without it, the browser sends the
 * metadata it would normally send for the configured user agent.
 */
export interface UserAgentOverride {
  readonly userAgent: string;
  readonly userAgentMetadata?: UserAgentMetadata;
}
