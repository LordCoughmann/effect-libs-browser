/**
 * Touchscreen operations via CDP.
 *
 * Provides Playwright-compatible `page.touchscreen.tap(x, y)` for direct
 * touch input at viewport coordinates. Stateless — no element resolution,
 * no actionability checks, no retry. Each call dispatches exactly two CDP
 * touch events: `touchStart` with a single touch point, followed by
 * `touchEnd` with empty touch points.
 *
 * Unlike `page.tap(selector)` which resolves a selector and computes a tap
 * point via DOM.getContentQuads, `page.touchscreen.tap` fires at the literal
 * viewport coordinates you give it. Use it when you need raw touch control
 * (e.g. for custom gesture sequences, mobile-style taps on a positioned
 * element, or any scenario where you already know the coordinates).
 *
 * Modifier keys (Shift / Control / Alt / Meta) held via `keyboard.down` /
 * `keyboard.up` are reflected in the dispatched touch events, mirroring
 * `page.mouse.*` and matching upstream Playwright's touchscreen behavior.
 *
 * Adapted from Playwright's `RawTouchscreenImpl.tap` in
 * `repos/cloudflare-playwright/packages/playwright-core/src/server/chromium/crInput.ts`.
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect, Ref } from "effect";

import { CdpError, CommandError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";

// ── Error Helper ─────────────────────────────────────────────────────────────

const mapTouchscreenError = (method: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new CdpError({
        module: "CdpPage",
        method: `touchscreen.${method}`,
        reason: new CommandError({
          method: `touchscreen.${method}`,
          description: String(cause),
        }),
      }),
  );

// ── Touchscreen Operations ───────────────────────────────────────────────────

/**
 * Dispatches a tap at the given viewport coordinates via CDP
 * `Input.dispatchTouchEvent`. Fires `touchStart` (with a single touch
 * point) followed by `touchEnd` (empty touch points) in parallel,
 * matching upstream Playwright's `RawTouchscreenImpl.tap`.
 *
 * Reads the current keyboard modifier mask from `state.currentModifierMask`
 * so that held modifier keys (Shift / Control / Alt / Meta) are reflected
 * in the dispatched touch events — same pattern as `page.mouse.*`.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state (used for modifier mask + session)
 * @param x - Viewport x coordinate in CSS pixels
 * @param y - Viewport y coordinate in CSS pixels
 */
export const touchscreenTap = (
  conn: CdpConnection["Service"],
  state: PageState,
  x: number,
  y: number,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    const sessionId = yield* ensureSession(state).pipe(mapTouchscreenError("tap"));
    const modifiers = yield* Ref.get(state.currentModifierMask);

    // Dispatch touchStart + touchEnd in parallel — upstream Playwright
    // uses Promise.all for the same reason (browser processes both
    // events together; no ordering benefit from serial dispatch).
    yield* Effect.all(
      [
        conn.cdp.Input.dispatchTouchEvent(
          {
            type: "touchStart",
            modifiers,
            touchPoints: [{ x, y }],
          },
          sessionId,
        ).pipe(mapTouchscreenError("tap")),
        conn.cdp.Input.dispatchTouchEvent(
          {
            type: "touchEnd",
            modifiers,
            touchPoints: [],
          },
          sessionId,
        ).pipe(mapTouchscreenError("tap")),
      ],
      { concurrency: 2 },
    );
  });
