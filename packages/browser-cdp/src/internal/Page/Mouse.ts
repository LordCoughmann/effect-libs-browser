/**
 * Low-level mouse operations via CDP.
 *
 * Provides Playwright-compatible `page.mouse.*` namespace for direct
 * mouse control at coordinates (no selector resolution or actionability).
 *
 * Unlike `page.click(selector)` which finds an element and clicks its center,
 * `page.mouse.*` operates on raw viewport coordinates — useful for:
 * - Drag and drop sequences (hover → down → move → up)
 * - Mouse wheel scrolling at specific coordinates
 * - Custom click patterns (e.g., multi-step gestures)
 *
 * Tracks mouse state (position, held buttons) across calls, matching
 * Playwright's Mouse class behavior.
 *
 * Modifier keys: all events reflect the current keyboard modifier state
 * (tracked in `state.currentModifierMask`, updated via `keyboard.down`/
 * `keyboard.up`). This lets you do Shift+click by holding Shift via
 * `keyboard.down('Shift')` before `mouse.click(...)`, matching Playwright.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";
import type { MouseButton } from "./Click.js";

import { Effect, Ref } from "effect";

import { CdpError, CommandError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";

// ── Types ────────────────────────────────────────────────────────────────────

/** Options for `mouse.move`. */
export interface MouseMoveOptions {
  /** Number of intermediate steps for the move (default: 1 = direct). */
  readonly steps?: number;
}

/** Options for `mouse.down` and `mouse.up`. */
export interface MouseToggleOptions {
  /** Mouse button (default: "left"). */
  readonly button?: MouseButton;
  /** Click count (default: 1). */
  readonly clickCount?: number;
}

/** Options for `mouse.click` and `mouse.dblclick`. */
export interface MouseClickOptions {
  /** Mouse button (default: "left"). */
  readonly button?: MouseButton;
  /** Click count (default: 1 for click, 2 for dblclick). */
  readonly clickCount?: number;
  /** Delay in ms between mouse down and up (default: 0). */
  readonly delay?: number;
  /** Number of intermediate move steps (default: 1). */
  readonly steps?: number;
}

/** Mutable mouse state tracked across calls. */
export interface MouseState {
  x: number;
  y: number;
  lastButton: MouseButton | "none";
  buttons: Set<MouseButton>;
}

// ── Error Helper ─────────────────────────────────────────────────────────────

const mapMouseError = (method: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new CdpError({
        source: "CdpPage",
        method: `mouse.${method}`,
        reason: new CommandError({
          method: `mouse.${method}`,
          description: String(cause),
        }),
      }),
  );

// ── Mouse Operations ─────────────────────────────────────────────────────────

/**
 * Move the mouse to the given viewport coordinates.
 *
 * If `steps` > 1, interpolates intermediate positions (useful for
 * triggering drag events in the browser).
 *
 * Passes current keyboard modifier state (from `keyboard.down`/`keyboard.up`)
 * to CDP so that mouse move events reflect held modifier keys.
 */
export const mouseMove = (
  conn: CdpConnection["Service"],
  state: PageState,
  x: number,
  y: number,
  options?: MouseMoveOptions,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    const sessionId = yield* ensureSession(state).pipe(mapMouseError("move"));
    const mouseState = yield* Ref.get(state.mouse);
    const modifierMask = yield* Ref.get(state.currentModifierMask);

    const steps = options?.steps ?? 1;
    const fromX = mouseState.x;
    const fromY = mouseState.y;

    yield* Effect.forEach(
      Array.from({ length: steps }, (_, i) => i + 1),
      (step) => {
        const midX = fromX + (x - fromX) * (step / steps);
        const midY = fromY + (y - fromY) * (step / steps);
        return conn.cdp.Input.dispatchMouseEvent(
          {
            type: "mouseMoved",
            x: midX,
            y: midY,
            button: mouseState.lastButton,
            buttons: buttonsMask(mouseState.buttons),
            modifiers: modifierMask,
          },
          sessionId,
        ).pipe(mapMouseError("move"));
      },
      { concurrency: 1 },
    );

    yield* Ref.update(state.mouse, (s) => ({ ...s, x, y }));
  });

/**
 * Press a mouse button at the current mouse position.
 *
 * Passes current keyboard modifier state (from `keyboard.down`/`keyboard.up`)
 * to CDP so that mouse press events reflect held modifier keys (e.g.,
 * Shift+click). This mirrors how `page.click(selector)` works in Click.ts.
 */
export const mouseDown = (
  conn: CdpConnection["Service"],
  state: PageState,
  options?: MouseToggleOptions,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    const sessionId = yield* ensureSession(state).pipe(mapMouseError("down"));
    const mouseState = yield* Ref.get(state.mouse);
    const modifierMask = yield* Ref.get(state.currentModifierMask);
    const button = options?.button ?? "left";
    const clickCount = options?.clickCount ?? 1;

    const buttons = new Set(mouseState.buttons);
    buttons.add(button);

    yield* conn.cdp.Input.dispatchMouseEvent(
      {
        type: "mousePressed",
        x: mouseState.x,
        y: mouseState.y,
        button,
        clickCount,
        buttons: buttonsMask(buttons),
        modifiers: modifierMask,
        force: buttons.size > 0 ? 0.5 : 0,
      },
      sessionId,
    ).pipe(mapMouseError("down"));

    yield* Ref.update(state.mouse, (s) => ({
      ...s,
      lastButton: button,
      buttons,
    }));
  });

/**
 * Release a mouse button at the current mouse position.
 *
 * Passes current keyboard modifier state (from `keyboard.down`/`keyboard.up`)
 * to CDP so that mouse release events reflect held modifier keys.
 */
export const mouseUp = (
  conn: CdpConnection["Service"],
  state: PageState,
  options?: MouseToggleOptions,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    const sessionId = yield* ensureSession(state).pipe(mapMouseError("up"));
    const mouseState = yield* Ref.get(state.mouse);
    const modifierMask = yield* Ref.get(state.currentModifierMask);
    const button = options?.button ?? "left";
    const clickCount = options?.clickCount ?? 1;

    const buttons = new Set(mouseState.buttons);
    buttons.delete(button);

    yield* conn.cdp.Input.dispatchMouseEvent(
      {
        type: "mouseReleased",
        x: mouseState.x,
        y: mouseState.y,
        button,
        clickCount,
        buttons: buttonsMask(buttons),
        modifiers: modifierMask,
      },
      sessionId,
    ).pipe(mapMouseError("up"));

    yield* Ref.update(state.mouse, (s) => ({
      ...s,
      lastButton: "none" as const,
      buttons,
    }));
  });

/**
 * Click (move + down + up) at the given viewport coordinates.
 */
export const mouseClick = (
  conn: CdpConnection["Service"],
  state: PageState,
  x: number,
  y: number,
  options?: MouseClickOptions,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    const button = options?.button ?? "left";
    const clickCount = options?.clickCount ?? 1;
    const delay = options?.delay ?? 0;
    const steps = options?.steps;

    if (delay) {
      // Sequential: move, then down, wait, up (one at a time per clickCount)
      yield* mouseMove(conn, state, x, y, { steps });
      yield* Effect.forEach(
        Array.from({ length: clickCount }, (_, i) => i + 1),
        (cc) =>
          Effect.gen(function* () {
            yield* mouseDown(conn, state, { button, clickCount: cc });
            yield* Effect.sleep(delay);
            yield* mouseUp(conn, state, { button, clickCount: cc });
            if (cc < clickCount) {
              yield* Effect.sleep(delay);
            }
          }),
        { concurrency: 1 },
      );
    } else {
      // Sequential: move + all down/up pairs (one at a time per clickCount)
      yield* mouseMove(conn, state, x, y, { steps });
      yield* Effect.forEach(
        Array.from({ length: clickCount }, (_, i) => i + 1),
        (cc) =>
          Effect.gen(function* () {
            yield* mouseDown(conn, state, { button, clickCount: cc });
            yield* mouseUp(conn, state, { button, clickCount: cc });
          }),
        { concurrency: 1 },
      );
    }
  });

/**
 * Dispatch a mouse wheel event at the current mouse position.
 */
export const mouseWheel = (
  conn: CdpConnection["Service"],
  state: PageState,
  deltaX: number,
  deltaY: number,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    const sessionId = yield* ensureSession(state).pipe(mapMouseError("wheel"));
    const mouseState = yield* Ref.get(state.mouse);

    yield* conn.cdp.Input.dispatchMouseEvent(
      {
        type: "mouseWheel",
        x: mouseState.x,
        y: mouseState.y,
        deltaX,
        deltaY,
        modifiers: yield* Ref.get(state.currentModifierMask),
      },
      sessionId,
    ).pipe(mapMouseError("wheel"));
  });

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Compute CDP buttons bitmask from a set of pressed buttons. */
const buttonsMask = (buttons: Set<MouseButton>): number => {
  let mask = 0;
  if (buttons.has("left")) mask |= 1;
  if (buttons.has("right")) mask |= 2;
  if (buttons.has("middle")) mask |= 4;
  return mask;
};

/** Create the initial mouse state. */
export const makeMouseState = (): MouseState => ({
  x: 0,
  y: 0,
  lastButton: "none",
  buttons: new Set(),
});
