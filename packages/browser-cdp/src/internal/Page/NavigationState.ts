/**
 * Navigation state for a single frame.
 *
 * Tracks the document lifecycle using an epoch-based approach:
 * - `navCount` increments monotonically on each `Page.frameNavigated`
 * - `lifecycleEvents` resets on each new navigation (new loaderId)
 * - `loaderId` identifies the current document
 *
 */

import type { Option } from "effect";

/**
 * Terminal navigation errors.
 */
export type NavigationError =
  | { readonly _tag: "FrameDetached"; readonly frameId: string }
  | { readonly _tag: "NetworkFailed"; readonly url: string; readonly errorCode: string }
  | { readonly _tag: "Crash"; readonly reason: string };

/**
 * Per-frame navigation state tracked via SubscriptionRef.
 *
 * The epoch pattern (`navCount`) prevents stale resolution:
 * - When idle, `waitForNavigation` targets `navCount + 1` (wait for NEXT nav)
 * - When navigating, targets `navCount` (wait for CURRENT to complete)
 */
export interface NavigationState {
  /** Monotonically increasing navigation epoch */
  readonly navCount: number;
  /** Current document loader ID from CDP */
  readonly loaderId: Option.Option<string>;
  /** Lifecycle events accumulated for the current loaderId */
  readonly lifecycleEvents: ReadonlySet<string>;
  /** Terminal error (frame detach, crash, etc.) */
  readonly lastError: Option.Option<NavigationError>;
  /** URL after the most recent navigation event */
  readonly url: string;
}
