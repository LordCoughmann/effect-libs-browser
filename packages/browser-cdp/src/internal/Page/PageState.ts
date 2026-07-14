/**
 * Internal page state for CDP page operations.
 */

import type { Duration, Ref } from "effect";

import type { PageBinding } from "./Bindings.js";
import type { FrameManager } from "./FrameManager.js";
import type { MouseState } from "./Mouse.js";
import type { CdpPageError } from "./PageErrors.js";
import type { ViewportSize } from "./SetViewportSize.js";
import type { NetworkIdleDetector } from "./WaitForNetworkIdle.js";

/**
 * Internal tracker for a download in progress. Used by `handleDownloadProgress`
 * to update the final path and failure state.
 */
export interface DownloadTracker {
  readonly guid: string;
  readonly state: Ref.Ref<"inProgress" | "completed" | "canceled">;
  readonly finalPath: Ref.Ref<string | null>;
  readonly failure: Ref.Ref<string | null>;
}

/**
 * Mutable page state tracked via Effect Refs.
 *
 * @property sessionId - CDP session ID for this page target (null until attached)
 * @property mainFrameId - CDP frame ID of the main frame (initialized with targetId)
 * @property networkDetector - Network idle detector for tracking in-flight requests
 */
export interface PageState {
  sessionId: Ref.Ref<string | null>;
  mainFrameId: Ref.Ref<string>;
  networkDetector: NetworkIdleDetector;
  /** Monotonic counter for setContent tag generation. */
  setContentCounter: Ref.Ref<number>;
  /**
   * Default timeout in milliseconds for operations that don't specify one.
   * `undefined` means "use the hardcoded default (30 seconds)".
   * Set via `page.setDefaultTimeout(ms)`.
   */
  defaultTimeout: Ref.Ref<Duration.Duration | undefined>;
  /**
   * Default timeout for navigation operations (goto, setContent, waitForNavigation, etc.).
   * `undefined` means "fall back to defaultTimeout or hardcoded default".
   * Set via `page.setDefaultNavigationTimeout(ms)`.
   * This takes precedence over `defaultTimeout` for navigation operations.
   */
  defaultNavigationTimeout: Ref.Ref<Duration.Duration | undefined>;
  /**
   * Extra HTTP headers set via `page.setExtraHTTPHeaders()`.
   * Used to detect conflicts with `goto({ referer })` option.
   * `undefined` means no extra headers have been set.
   */
  extraHTTPHeaders: Ref.Ref<Record<string, string> | undefined>;
  /**
   * Current modifier mask for keyboard operations.
   * Tracks which modifier keys (Shift, Control, Alt, Meta) are currently pressed.
   * Used by keyboardDown/keyboardUp to maintain consistent modifier state.
   */
  currentModifierMask: Ref.Ref<number>;
  /**
   * Set of keys currently pressed (for repeat property).
   * Tracks which keys have been pressed via keyboardDown but not yet released.
   * Used to determine if a keydown event should have autoRepeat=true.
   */
  pressedKeys: Ref.Ref<Set<string>>;
  /**
   * Mouse state for low-level mouse operations (`page.mouse.*`).
   * Tracks the current pointer position and held buttons across calls,
   * matching Playwright's Mouse class behavior.
   */
  mouse: Ref.Ref<MouseState>;
  /**
   * Registry of `exposeFunction` / `exposeBinding` callbacks keyed by
   * binding name. Populated by `registerBinding`, drained by
   * `handleBindingCall` when a `Runtime.bindingCalled` event fires.
   */
  bindings: Ref.Ref<ReadonlyMap<string, PageBinding>>;
  /**
   * Current viewport size, set by `setViewportSize`. `undefined` if not
   * explicitly set (use CDP default). Read by `viewportSize()`.
   */
  viewportSize: Ref.Ref<ViewportSize | undefined>;
  /**
   * `true` once `close()` has been called. Read by `isClosed()`.
   */
  closed: Ref.Ref<boolean>;
  /**
   * Map of in-flight downloads keyed by CDP `guid`. Populated when
   * `Browser.downloadWillBegin` fires, drained when the download completes.
   * Read by `handleDownloadProgress` to update final path / failure.
   */
  downloads: Ref.Ref<ReadonlyMap<string, DownloadTracker>>;
  /**
   * Accumulated uncaught JavaScript errors since the page was created.
   * Mirrors Playwright's `page.pageErrors()` semantics — non-destructive
   * snapshot accessor that runs alongside `onPageError` (which is the
   * live event stream). Errors are appended on every
   * `Runtime.exceptionThrown` event and stay until the page closes.
   */
  pageErrors: Ref.Ref<readonly CdpPageError[]>;
  /**
   * FrameManager instance for this page. Cached so evaluate paths
   * (Phase P6) can look up / cache utility-script object IDs without
   * needing a separate parameter at every call site.
   */
  frameManager: Ref.Ref<FrameManager>;
  /**
   * HTTP credentials for responding to `Fetch.authRequired` events.
   * Populated by `page.setHTTPCredentials` (and fanned out from
   * `context.setHTTPCredentials`). `undefined` means "no credentials
   * configured — let the browser show the auth prompt".
   *
   * Used by the page-level Route manager (`packages/browser-cdp/src/internal/Page/Route.ts`).
   */
  credentials: Ref.Ref<
    { readonly username: string; readonly password: string; readonly origin?: string } | undefined
  >;
}
