/**
 * Viewport size control via CDP.
 *
 * Uses CDP `Emulation.setDeviceMetricsOverride` to resize the viewport.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect, Option, Ref } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, ViewportError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";

/** Viewport dimensions. */
export interface ViewportSize {
  /** Width in pixels */
  readonly width: number;
  /** Height in pixels */
  readonly height: number;
}

/** Helper to fail with CdpError wrapping ViewportError. */
const failViewport = (description: string) =>
  Effect.fail(
    new CdpError({
      source: "CdpPage",
      method: "setViewportSize",
      reason: new ViewportError({ description }),
    }),
  );

/**
 * Sets the viewport size for the page.
 *
 * Uses CDP `Emulation.setDeviceMetricsOverride` to resize the viewport.
 * This affects:
 * - `window.innerWidth` / `window.innerHeight`
 * - `window.outerWidth` / `window.outerHeight`
 * - `screen.width` / `screen.height` (when device emulation is active)
 * - CSS media queries based on viewport size
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param viewport - Viewport dimensions { width, height }
 */
export const setViewportSize = Effect.fn("CdpPage.setViewportSize")(
  (conn: CdpConnection["Service"], state: PageState, viewport: ViewportSize) =>
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);

      yield* conn.cdp.Emulation.setDeviceMetricsOverride(
        {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: false,
          screenWidth: viewport.width,
          screenHeight: viewport.height,
        },
        sessionId,
      ).pipe(
        Effect.catch((cause) =>
          failViewport(`Failed to set viewport size: ${getErrorMessage(cause)}`),
        ),
      );

      // Record the viewport size in state so `viewportSize()` can read it back.
      yield* Ref.set(state.viewportSize, viewport);
    }),
);

/**
 * Gets the current viewport size.
 *
 * Returns the dimensions set via {@link setViewportSize}, or `Option.none()`
 * if no device metrics override is active (e.g. before any `setViewportSize`
 * call).
 *
 * Uses CDP `Emulation.getOverriddenSensorInformation` is not sufficient;
 * we read it from internal state set by `setViewportSize`.
 *
 * @param state - Mutable page state
 * @returns Current viewport size, or `Option.none()` if not explicitly set
 */
export const getViewportSize = (
  state: PageState,
): Effect.Effect<Option.Option<ViewportSize>, never> =>
  Effect.map(Ref.get(state.viewportSize), (size) =>
    size === undefined ? Option.none() : Option.some(size),
  );
