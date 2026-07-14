/**
 * `browser-cdp` — zero-dependency, native-WebSocket Chrome
 * DevTools Protocol client with a Playwright-compatible API.
 *
 * **Experimental.** The API surface is stable; awaiting human review for a
 * v1 release. Prefer `Playwright` for production use; use `Cdp` when you need
 * a minimal footprint or raw CDP access.
 *
 * Install:
 *
 * ```bash
 * pnpm add @effect-libs/browser-cdp
 * ```
 *
 * @since 0.1.0
 */

/**
 * @since 0.1.0
 */
export {
  /**
   * @since 0.1.0
   */
  Cdp,
  /**
   * @since 0.1.0
   */
  type CdpService,
} from "./Cdp.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  CdpPageService,
  /**
   * @since 0.1.0
   */
  CdpFrame,
  /**
   * @since 0.1.0
   */
  CdpLocator,
  /**
   * @since 0.1.0
   */
  ByRoleOptions,
  /**
   * @since 0.1.0
   */
  LocatorOptions,
  /**
   * @since 0.1.0
   */
  TextMatchOptions,
  /**
   * @since 0.1.0
   */
  ClickOptions,
  /**
   * @since 0.1.0
   */
  EvaluateFn,
} from "./internal/CdpPage.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  CdpHandle,
} from "./internal/Page/EvaluateHandle.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  CdpDialog,
  /**
   * @since 0.1.0
   */
  DialogType,
} from "./internal/Page/Dialogs.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  CdpDownload,
} from "./internal/Page/Downloads.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  CdpFrameLocator,
} from "./internal/Page/FrameLocator.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  FrameSelector,
} from "./internal/Page/FrameSelector.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  CdpPageError,
} from "./internal/Page/PageErrors.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  CdpCookie,
  /**
   * @since 0.1.0
   */
  CookieData,
} from "./internal/Page/Cookies.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  UserAgentBrandVersion,
  /**
   * @since 0.1.0
   */
  UserAgentMetadata,
  /**
   * @since 0.1.0
   */
  UserAgentOverride,
} from "./internal/Page/UserAgent.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  Geolocation,
} from "./internal/Page/Geolocation.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  GrantPermissionsOptions,
  /**
   * @since 0.1.0
   */
  PermissionName,
} from "./internal/Page/Permissions.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  OriginState,
  /**
   * @since 0.1.0
   */
  StorageState,
} from "./internal/Page/StorageState.js";

/**
 * @since 0.1.0
 */
export type {
  /**
   * @since 0.1.0
   */
  CdpWebSocketRoute,
  /**
   * @since 0.1.0
   */
  CdpWebSocketServerRoute,
  /**
   * @since 0.1.0
   */
  CdpWebSocketRouteHandlerCallback,
  /**
   * @since 0.1.0
   */
  CdpWebSocketMessageHandler,
  /**
   * @since 0.1.0
   */
  CdpWebSocketCloseHandler,
} from "./internal/Page/RouteWebSocket.js";

/** @since 0.1.0 */
export * from "./CdpTypes.js";

/** @since 0.1.0 */
export * from "./CdpError.js";

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
