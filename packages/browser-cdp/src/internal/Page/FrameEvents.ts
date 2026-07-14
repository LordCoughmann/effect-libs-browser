/**
 * Frame event streams for observing frame lifecycle events.
 *
 * Provides Effect Stream-based access to frame events similar to
 * Playwright's `page.on('framenavigated')`, `page.on('framedetached')`,
 * `page.on('framestoppedloading')`, and `page.on('frameattached')`.
 *
 * Uses PubSub hubs to broadcast events to multiple subscribers.
 *
 */

import type { CdpFrame } from "../CdpPage.js";

import { Effect, PubSub } from "effect";

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Creates PubSub hubs for frame event broadcasting.
 *
 * Each hub broadcasts events to all subscribers. The streams complete
 * when the page scope closes (automatic cleanup).
 *
 * @returns Object with PubSubs for each frame event type
 */
export const makeFrameEventHubs = Effect.gen(function* () {
  const frameAttachedHub = yield* PubSub.unbounded<CdpFrame>();
  const frameNavigatedHub = yield* PubSub.unbounded<CdpFrame>();
  const frameDetachedHub = yield* PubSub.unbounded<CdpFrame>();
  const frameStoppedLoadingHub = yield* PubSub.unbounded<CdpFrame>();

  return {
    frameAttachedHub,
    frameNavigatedHub,
    frameDetachedHub,
    frameStoppedLoadingHub,
  } as const;
});

/**
 * Type for frame event hubs returned by makeFrameEventHubs.
 * @internal
 */
export interface FrameEventHubs {
  readonly frameAttachedHub: PubSub.PubSub<CdpFrame>;
  readonly frameNavigatedHub: PubSub.PubSub<CdpFrame>;
  readonly frameDetachedHub: PubSub.PubSub<CdpFrame>;
  readonly frameStoppedLoadingHub: PubSub.PubSub<CdpFrame>;
}
