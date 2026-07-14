/**
 * Drag-and-drop interaction between two elements.
 *
 * Mirrors Playwright's `page.dragAndDrop(source, target)`. Uses
 * `Input.dispatchMouseEvent` for a sequence of mouse events:
 * mousemove → mousedown → mousemove → mouseup.
 *
 * Computes element center coordinates via `getBoundingClientRect()`,
 * performs the move in steps (CDP needs intermediate events to trigger
 * `dragenter`/`dragover`/`drop` correctly).
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, isCdpError, SelectorError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

/** Map errors to SelectorError for dragAndDrop operations. */
const mapError = (source: string, target: string) =>
  Effect.mapError((cause: unknown) => {
    let description = getErrorMessage(cause);
    if (isCdpError(cause) && "description" in cause.reason) {
      description = cause.reason.description;
    }
    return new CdpError({
      module: "CdpPage",
      method: "dragAndDrop",
      reason: new SelectorError({
        selector: `${source} -> ${target}`,
        description,
      }),
    });
  });

interface ElementCenter {
  readonly x: number;
  readonly y: number;
}

const failDragAndDrop = (selector: string, role: "source" | "target", description: string) =>
  Effect.fail(
    new CdpError({
      module: "CdpPage",
      method: "dragAndDrop",
      reason: new SelectorError({
        selector: role === "source" ? selector : `(target) ${selector}`,
        description,
      }),
    }),
  );

const getElementCenter = (
  conn: CdpConnection["Service"],
  state: PageState,
  selector: string,
): Effect.Effect<ElementCenter | null, CdpError> =>
  Effect.gen(function* () {
    yield* ensureSession(state);
    const selectorJson = JSON.stringify(selector);
    // Pass body as third arg to `new Function` (no params here) — wrapping in
    // an arrow function expression would make it a no-op statement in the
    // generated anonymous function body.
    const bodyCode = `
      const el = document.querySelector(${selectorJson});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    `;
    const wrapper = new Function(bodyCode) as () => ElementCenter | null;
    const result = yield* evaluatePage<ElementCenter | null>(conn, state, wrapper);
    return result;
  });

/**
 * Drags the source element to the target element.
 *
 * Performs a series of mouse events:
 * 1. Move to source center
 * 2. Mouse down (button: left)
 * 3. Move to target center (in steps to trigger `dragenter`/`dragover`)
 * 4. Mouse up
 *
 * Note: This uses *mouse events* (mousedown/mousemove/mouseup). For full
 * HTML5 drag-and-drop with `dataTransfer`, you may need to combine this
 * with `dispatchEvent('dragstart')` / `'drop'` calls.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param source - CSS selector for the source element (what to drag)
 * @param target - CSS selector for the target element (where to drop)
 */
export const dragAndDrop = Effect.fn("CdpPage.dragAndDrop")(function (
  conn: CdpConnection["Service"],
  state: PageState,
  source: string,
  target: string,
) {
  return Effect.gen(function* () {
    const sessionId = yield* ensureSession(state);

    const sourcePos = yield* getElementCenter(conn, state, source).pipe(mapError(source, target));
    if (!sourcePos) {
      return yield* failDragAndDrop(
        source,
        "source",
        `No element matches source selector "${source}"`,
      );
    }

    const targetPos = yield* getElementCenter(conn, state, target).pipe(mapError(source, target));
    if (!targetPos) {
      return yield* failDragAndDrop(
        target,
        "target",
        `No element matches target selector "${target}"`,
      );
    }

    const fire = (
      type: "mousePressed" | "mouseReleased" | "mouseMoved",
      x: number,
      y: number,
      button: "none" | "left" | "middle" | "right",
    ) =>
      conn.cdp.Input.dispatchMouseEvent(
        {
          type,
          x,
          y,
          button,
          clickCount: type === "mousePressed" ? 1 : 0,
          buttons: type === "mouseReleased" ? 0 : 1,
        },
        sessionId,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new CdpError({
              module: "CdpPage",
              method: "dragAndDrop",
              reason: new SelectorError({
                selector: `${source} -> ${target}`,
                description: `Failed to dispatch ${type}: ${getErrorMessage(cause)}`,
              }),
            }),
        ),
      );

    // Step 1: Move to source
    yield* fire("mouseMoved", sourcePos.x, sourcePos.y, "none");

    // Step 2: Mouse down at source
    yield* fire("mousePressed", sourcePos.x, sourcePos.y, "left");

    // Step 3: Move to target in steps (for dragenter/dragover).
    // 5 intermediate steps so the browser fires the right drag events.
    const STEPS = 5;
    yield* Effect.forEach(
      Array.from({ length: STEPS }, (_, i) => i + 1),
      (i) => {
        const t = i / STEPS;
        const x = sourcePos.x + (targetPos.x - sourcePos.x) * t;
        const y = sourcePos.y + (targetPos.y - sourcePos.y) * t;
        return fire("mouseMoved", x, y, "left");
      },
      { concurrency: 1, discard: true },
    );

    // Step 4: Mouse up at target
    yield* fire("mouseReleased", targetPos.x, targetPos.y, "left");
  });
});
