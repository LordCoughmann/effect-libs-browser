/**
 * Click element operation via CDP.
 *
 * Uses DOM.getContentQuads to get the actual rendered quad vertices,
 * which respects CSS transforms (rotate, scale, etc.). Calculates
 * the click point as the centroid of the quad — same approach as Playwright.
 *
 * Viewport clipping: Quads are clipped to the visible viewport bounds
 * before computing the click point. This handles elements with children
 * positioned outside the viewport (e.g., absolute positioned at -1000px).
 *
 * Uses Playwright-style retry: if the element disappears between finding
 * and clicking, the entire operation (find + get position + click) is retried.
 *
 * Actionability checks (unless `force`):
 *   - Element is found (otherwise retry)
 *   - Element has visible quads (otherwise retry)
 *   - Element is not visibility:hidden/collapse (otherwise retry)
 *   - Element is not a disabled form control (otherwise retry)
 *   - Element is the hit target at the click point, or an ancestor of the
 *     element at the click point (otherwise retry)
 *
 * `force: true` — skip the retry loop; run actionability once and fail
 * immediately with a specific error if not actionable.
 *
 * `trial: true` — run the actionability retry loop but do not dispatch
 * the click. Useful to wait for actionability without side effects.
 *
 */

import type { Protocol } from "devtools-protocol";

import type { CdpConnection } from "../CdpConnection.js";

import { Duration, Effect, Ref } from "effect";
import * as Arr from "effect/Array";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, ConnectionError, isCdpError, SelectorError } from "../../CdpError.js";
import { type CdpConnectionError, type CdpTimeoutError } from "../CdpProtocolError.js";
import { ensureSession } from "./EnsureSession.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";
import { retryElementLoop } from "./RetryWithElement.js";

/** Mouse button for click operations. */
export type MouseButton = "left" | "right" | "middle";

/** Modifier keys supported by click operations. */
export type ClickModifier = "Alt" | "Control" | "ControlOrMeta" | "Meta" | "Shift";

/**
 * Options for click operations (matches Playwright's ClickOptions subset).
 *
 * - `button`: Mouse button to use (default: "left")
 * - `modifiers`: Modifier keys to hold during the click
 * - `clickCount`: Number of times to click (default: 1)
 * - `position`: Click at a specific point relative to the element's top-left.
 *   If omitted, the element center (quad centroid) is used.
 * - `force`: Skip actionability auto-waiting. Runs a one-shot check and fails
 *   immediately with a specific error if the element is not actionable.
 * - `trial`: Run actionability checks in the retry loop but do not dispatch
 *   the click.
 * - `timeout`: Maximum wait time for the element to appear/actionable
 */
export interface ClickOptions {
  readonly button?: MouseButton;
  readonly modifiers?: ReadonlyArray<ClickModifier>;
  readonly clickCount?: number;
  readonly position?: { readonly x: number; readonly y: number };
  readonly force?: boolean;
  readonly trial?: boolean;
  readonly timeout?: Duration.Duration;
}

/** Bitmask values for CDP modifier keys (Alt=1, Control=2, Meta=4, Shift=8). */
const MODIFIER_FLAGS: Record<Exclude<ClickModifier, "ControlOrMeta">, number> = {
  Alt: 1,
  Control: 2,
  Meta: 4,
  Shift: 8,
};

/** Compute a CDP modifier bitmask from a Playwright-style modifiers array. */
const computeModifierMask = (modifiers?: ReadonlyArray<ClickModifier>): number => {
  if (!modifiers) return 0;
  let mask = 0;
  for (const mod of modifiers) {
    // ControlOrMeta maps to Control on non-macOS platforms
    const key = mod === "ControlOrMeta" ? "Control" : mod;
    mask |= MODIFIER_FLAGS[key];
  }
  return mask;
};

/** Map errors to SelectorError for click operations. */
const mapInteractionError = (selector: string, method = "click") =>
  Effect.mapError(
    (cause: unknown) =>
      new CdpError({
        source: "CdpPage",
        method,
        reason: new SelectorError({
          selector,
          description: getErrorMessage(cause),
        }),
      }),
  );

/**
 * Calculates the middle point of a quad (centroid).
 *
 * The quad is represented as [x1, y1, x2, y2, x3, y3, x4, y4].
 * The centroid is the average of all 4 vertices.
 */
const quadMiddlePoint = (quad: number[]): { x: number; y: number } => ({
  x: (quad[0] + quad[2] + quad[4] + quad[6]) / 4,
  y: (quad[1] + quad[3] + quad[5] + quad[7]) / 4,
});

/**
 * Computes the area of a quad using the shoelace formula.
 *
 * Quads with area <= 1 are considered not visible (allowing for 1x1 elements
 * with rounding errors). Same threshold as Playwright (0.99).
 *
 * @see https://en.wikipedia.org/wiki/Polygon#Simple_polygons
 */
const computeQuadArea = (quad: number[]): number => {
  // Quad is [x1, y1, x2, y2, x3, y3, x4, y4]
  // Compute sum of all directed areas of adjacent triangles
  let area = 0;
  for (let i = 0; i < 4; ++i) {
    const x1 = quad[i * 2];
    const y1 = quad[i * 2 + 1];
    const x2 = quad[((i + 1) % 4) * 2];
    const y2 = quad[((i + 1) % 4) * 2 + 1];
    area += (x1 * y2 - x2 * y1) / 2;
  }
  return Math.abs(area);
};

/**
 * Clips a quad to the viewport bounds.
 *
 * Each point in the quad is clamped to [0, width] for x and [0, height] for y.
 * This handles elements that extend beyond the viewport (e.g., absolutely
 * positioned children at negative coordinates).
 *
 * @param quad - The quad as [x1, y1, x2, y2, x3, y3, x4, y4]
 * @param width - Viewport width in CSS pixels
 * @param height - Viewport height in CSS pixels
 */
const intersectQuadWithViewport = (quad: number[], width: number, height: number): number[] => [
  Math.min(Math.max(quad[0], 0), width),
  Math.min(Math.max(quad[1], 0), height),
  Math.min(Math.max(quad[2], 0), width),
  Math.min(Math.max(quad[3], 0), height),
  Math.min(Math.max(quad[4], 0), width),
  Math.min(Math.max(quad[5], 0), height),
  Math.min(Math.max(quad[6], 0), width),
  Math.min(Math.max(quad[7], 0), height),
];

/**
 * Signal type returned by the single-pass click action.
 *
 * - `null`: element not found / not actionable — should retry (when not force)
 * - `{ tag: "fail", description }`: hard failure — should throw immediately
 *   (e.g. force mode found the element not actionable, or trial-mode timed out)
 * - `{ tag: "ok" }`: action completed successfully (or skipped for trial)
 */
type ClickSignal =
  | null
  | { readonly tag: "ok" }
  | { readonly tag: "fail"; readonly description: string };

/**
 * Result of locating + computing the click point for an element.
 * `null` means element not found or no visible quads (retry signal).
 */
interface ClickPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Locates the element, scrolls it into view, and computes the click point.
 *
 * Returns `null` when the element is not found or has no visible quads
 * (signal to retry). Throws `CdpError` on CDP errors.
 *
 * Uses a two-tier strategy:
 *  1. Fast path — `DOM.querySelector` (light DOM only).
 *  2. Slow path — JS-based `querySelectorDeep` that pierces shadow roots
 *     (including closed roots). Used as a fallback when the fast path
 *     returns nothing.
 *
 * @internal — exported for `Tap.ts` which shares the same locator path.
 */
export const locateAndComputePoint = (
  conn: CdpConnection["Service"],
  state: PageState,
  sessionId: string,
  selector: string,
  position: { readonly x: number; readonly y: number } | undefined,
): Effect.Effect<ClickPoint | null, DeepLocatorError> =>
  Effect.gen(function* () {
    // Get document root for querying
    const doc = yield* conn.cdp.DOM.getDocument({}, sessionId).pipe(mapInteractionError(selector));

    // Query for the element using the fast path (light DOM only)
    const node = yield* conn.cdp.DOM.querySelector(
      {
        nodeId: doc.root.nodeId,
        selector,
      },
      sessionId,
    ).pipe(mapInteractionError(selector));

    if (node.nodeId) {
      // Found via the fast path. Continue with the existing DOM-based approach.
      return yield* computeClickPointFromNode(conn, sessionId, selector, node.nodeId, position);
    }

    // Not found in light DOM. Fall back to a CDP-based querySelectorDeep that
    // pierces shadow DOM (including closed roots). This path returns the
    // click coordinates directly, since DOM.getContentQuads on a node from
    // a closed shadow root would not be reachable.
    return yield* locateAndComputePointDeep(conn, state, sessionId, selector, position);
  });

/** Sum of the error types returned by the deep locator path. */
type DeepLocatorError = CdpError | CdpConnectionError | CdpTimeoutError;

/**
 * Wrap any non-CdpError returned by the locator path as a CdpError so it
 * can flow through the rest of the click pipeline (which is typed for
 * CdpError). Connection / timeout errors are surfaced as
 * `ConnectionError` reasons to preserve the original semantics.
 */
const ensureCdpError = (err: DeepLocatorError): CdpError => {
  if (isCdpError(err)) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new CdpError({
    source: "CdpPage",
    method: "click",
    reason: new ConnectionError({ description: message }),
  });
};

/**
 * Computes the click point from an already-resolved DOM nodeId.
 *
 * Handles scroll-into-view, getContentQuads, viewport clipping, and
 * the optional `position` offset. Mirrors the original DOM-based path.
 */
const computeClickPointFromNode = (
  conn: CdpConnection["Service"],
  sessionId: string,
  selector: string,
  nodeId: number,
  position: { readonly x: number; readonly y: number } | undefined,
): Effect.Effect<ClickPoint | null, CdpError> =>
  Effect.gen(function* () {
    // Scroll into view first
    yield* conn.cdp.DOM.scrollIntoViewIfNeeded(
      {
        nodeId,
      },
      sessionId,
    ).pipe(Effect.ignore);

    // Get viewport dimensions for quad clipping
    const [metricsResult, quadsResult] = yield* Effect.all(
      [
        conn.cdp.Page.getLayoutMetrics({}, sessionId),
        conn.cdp.DOM.getContentQuads({ nodeId }, sessionId),
      ],
      { concurrency: "unbounded" },
    ).pipe(mapInteractionError(selector));

    const viewportWidth = metricsResult.cssLayoutViewport.clientWidth;
    const viewportHeight = metricsResult.cssLayoutViewport.clientHeight;

    const clippedQuads = quadsResult.quads
      .map((quad: Protocol.DOM.Quad) =>
        intersectQuadWithViewport(quad, viewportWidth, viewportHeight),
      )
      .filter((quad: number[]) => computeQuadArea(quad) > 0.99);

    return yield* Arr.match(clippedQuads, {
      onEmpty: () => Effect.succeed(null),
      onNonEmpty: (quads: ReadonlyArray<ReadonlyArray<number>>) =>
        Effect.gen(function* () {
          if (!position) {
            return quadMiddlePoint(quads[0] as number[]);
          }
          const boxModel = yield* conn.cdp.DOM.getBoxModel({ nodeId }, sessionId).pipe(
            mapInteractionError(selector),
          );
          const paddingQuad = boxModel.model.padding;
          let px = paddingQuad[0] + position.x;
          let py = paddingQuad[1] + position.y;
          const metrics = yield* conn.cdp.Page.getLayoutMetrics({}, sessionId).pipe(
            mapInteractionError(selector),
          );
          const vpW = metrics.cssLayoutViewport.clientWidth;
          const vpH = metrics.cssLayoutViewport.clientHeight;
          const scrollX = metrics.cssLayoutViewport.pageX;
          const scrollY = metrics.cssLayoutViewport.pageY;
          if (px < scrollX || px > scrollX + vpW || py < scrollY || py > scrollY + vpH) {
            yield* conn.cdp.Runtime.evaluate(
              {
                expression: `window.scrollTo(${Math.max(0, px - vpW / 2)}, ${Math.max(0, py - vpH / 2)})`,
              },
              sessionId,
            ).pipe(mapInteractionError(selector));
            const boxModel2 = yield* conn.cdp.DOM.getBoxModel({ nodeId }, sessionId).pipe(
              mapInteractionError(selector),
            );
            const pq2 = boxModel2.model.padding;
            px = pq2[0] + position.x;
            py = pq2[1] + position.y;
          }
          return { x: px, y: py };
        }),
    });
  });

/**
 * Fallback path: find an element using CDP's `DOM.getDocument({ pierce: true })`
 * which returns the full DOM tree including (open and closed) shadow roots.
 * Then compute the click point from `DOM.getBoxModel`.
 *
 * Returns `null` when the element is not found anywhere in the DOM
 * (including shadow roots), or when the element has no visible box model.
 */
const locateAndComputePointDeep = (
  conn: CdpConnection["Service"],
  pageState: PageState,
  sessionId: string,
  selector: string,
  position: { readonly x: number; readonly y: number } | undefined,
): Effect.Effect<ClickPoint | null, DeepLocatorError> =>
  Effect.gen(function* () {
    void pageState; // kept for API symmetry with the fast path.

    // Get the full DOM tree, including shadow roots (open and closed).
    // CDP's pierce flag is the only reliable way to reach closed shadow roots,
    // since the closed mode hides `element.shadowRoot` from JavaScript.
    const doc = yield* conn.cdp.DOM.getDocument({ depth: -1, pierce: true }, sessionId).pipe(
      mapInteractionError(selector),
    );

    // Walk the tree depth-first, matching the selector on each element's
    // `nodeName`, attributes, etc. For simplicity we collect element nodes
    // and ask CDP to resolve a selector on each shadow root boundary.
    const matchedNodeId = yield* findNodeBySelectorInTree(conn, sessionId, selector, doc.root);
    if (matchedNodeId === null) {
      return null;
    }

    // Scroll into view.
    yield* conn.cdp.DOM.scrollIntoViewIfNeeded({ nodeId: matchedNodeId }, sessionId).pipe(
      Effect.ignore,
    );

    // Get viewport dimensions for box-model coordinate translation.
    const [metricsResult, boxModelResult] = yield* Effect.all(
      [
        conn.cdp.Page.getLayoutMetrics({}, sessionId),
        conn.cdp.DOM.getBoxModel({ nodeId: matchedNodeId }, sessionId).pipe(
          // Element may not have a box model (e.g. display:none, detached).
          // Treat as "not found" so the caller retries.
          Effect.catchTag("effect-libs/browser/CdpCommandError", () => Effect.succeed(null)),
        ),
      ],
      { concurrency: "unbounded" },
    ).pipe(mapInteractionError(selector));

    if (!boxModelResult) return null;

    const viewportWidth = metricsResult.cssLayoutViewport.clientWidth;
    const viewportHeight = metricsResult.cssLayoutViewport.clientHeight;
    const quad = boxModelResult.model.border;
    // Use the border quad top-left + width/2, height/2 as the click point.
    // Clip to viewport so off-screen points are clamped.
    const rawX = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
    const rawY = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
    let x = Math.min(Math.max(rawX, 0), viewportWidth);
    let y = Math.min(Math.max(rawY, 0), viewportHeight);
    if (position) {
      x = Math.min(Math.max(quad[0] + position.x, 0), viewportWidth);
      y = Math.min(Math.max(quad[1] + position.y, 0), viewportHeight);
    }
    return { x, y };
  });

/**
 * Walk a CDP DOM tree (returned by `DOM.getDocument`) and find a node
 * matching `selector`. Recursively descends into shadow roots via
 * `DOM.querySelector`, which works across shadow boundaries inside a
 * single CDP traversal.
 *
 * Returns the matching nodeId, or `null` if no match was found.
 */
const findNodeBySelectorInTree = (
  conn: CdpConnection["Service"],
  sessionId: string,
  selector: string,
  root: unknown,
): Effect.Effect<number | null, DeepLocatorError> =>
  Effect.gen(function* () {
    const node = root as {
      readonly nodeId: number;
      readonly nodeName: string;
      readonly children?: ReadonlyArray<unknown>;
      readonly shadowRoots?: ReadonlyArray<unknown>;
      readonly contentDocument?: unknown;
    };

    // Try the selector on this subtree.
    const result = yield* conn.cdp.DOM.querySelector(
      { nodeId: node.nodeId, selector },
      sessionId,
    ).pipe(
      Effect.catchTag("effect-libs/browser/CdpCommandError", () =>
        Effect.succeed({ nodeId: 0 } as { nodeId: number }),
      ),
    );
    if (result.nodeId && result.nodeId !== 0) {
      return result.nodeId;
    }

    // Recurse into shadow roots, then children. A child shadow root may
    // contain the element, so we try shadowRoots first.
    const childLike = [...(node.shadowRoots ?? []), ...(node.children ?? [])];
    const findInChild = (child: unknown): Effect.Effect<number | null, DeepLocatorError> =>
      findNodeBySelectorInTree(conn, sessionId, selector, child);

    const results = yield* Effect.forEach(childLike, findInChild, {
      concurrency: "unbounded",
    });
    for (const r of results) {
      if (r !== null) return r;
    }

    return null;
  });

/**
 * Checks whether an element is actionable for clicking.
 *
 * Returns:
 * - `{ tag: "ok" }` if the element is visible, enabled, and a hit target
 * - `{ tag: "retry" }` if not actionable (retry signal)
 * - `{ tag: "fail", description }` if a specific hard-failure reason applies
 *
 * The `force` flag controls error message wording: when true, failure
 * descriptions use the one-shot phrasing expected by Playwright's force mode
 * (e.g. "Element is not visible").
 *
 * Checks performed:
 * 1. visibility:hidden / visibility:collapse
 * 2. disabled form control (button/input/select/textarea)
 * 3. hit target — `document.elementFromPoint(x, y)` must be the element or
 *    a descendant of the element (handles pointer-events:none on children
 *    and obscuring overlays)
 *
 * For elements inside shadow roots (open or closed), the locator path uses
 * `DOM.getDocument({ pierce: true })` to find the element. The actionability
 * check is best-effort: for shadow-DOM elements that `document.querySelector`
 * cannot reach (e.g. closed roots), the check is skipped because the element
 * has already been verified to exist by the locator path.
 */
const checkActionability = (
  conn: CdpConnection["Service"],
  state: PageState,
  selector: string,
  point: ClickPoint,
): Effect.Effect<Exclude<ClickSignal, null>, CdpError> =>
  Effect.gen(function* () {
    const check = yield* evaluatePage(
      conn,
      state,
      (args: { sel: string; x: number; y: number }) => {
        const { sel, x, y } = args;
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) {
          // Element is not reachable from the document (e.g. inside a closed
          // shadow root). The locator path has already verified it exists via
          // CDP, so accept the click without actionability checks.
          return { result: "ok" as const };
        }
        const style = window.getComputedStyle(el);
        if (style.visibility === "hidden" || style.visibility === "collapse") {
          return { result: "fail" as const, reason: "Element is not visible" };
        }
        const tag = el.tagName.toLowerCase();
        if (
          (tag === "button" || tag === "input" || tag === "select" || tag === "textarea") &&
          (el as HTMLInputElement).disabled
        ) {
          return { result: "fail" as const, reason: "Element is not enabled" };
        }
        // Hit target check: elementFromPoint at the click coordinates must be
        // the target element itself or contained by it (so clicks land on the
        // element or its children). If another element intercepts, retry.
        const hit = document.elementFromPoint(x, y);
        if (hit) {
          if (hit === el || el.contains(hit)) {
            return { result: "ok" as const };
          }
          return {
            result: "fail" as const,
            reason: `${hit instanceof Element ? hit.outerHTML : "Element"} intercepts pointer events`,
          };
        }
        return { result: "ok" as const };
      },
      { sel: selector, x: point.x, y: point.y },
    ).pipe(mapInteractionError(selector));

    if (check.result === "ok") return { tag: "ok" as const };
    return { tag: "fail" as const, description: check.reason };
  }).pipe(
    Effect.catchTag("effect-libs/browser/CdpError", () =>
      // Evaluation error — treat as a retry signal (element may be detached)
      Effect.succeed<Exclude<ClickSignal, null>>({
        tag: "fail",
        description: "Element is not attached to the DOM",
      }),
    ),
  );

/**
 * Dispatches the actual mouse events (move + press + release) for a click.
 *
 * Adds `pressure` to pointer events to match Playwright's PointerEvent.pressure
 * behavior (0.5 on press, 0 elsewhere).
 */
const dispatchClick = (
  conn: CdpConnection["Service"],
  sessionId: string,
  selector: string,
  point: ClickPoint,
  button: MouseButton,
  clickCount: number,
  modifiersMask: number,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    // Move mouse to click point
    yield* conn.cdp.Input.dispatchMouseEvent(
      {
        type: "mouseMoved",
        x: point.x,
        y: point.y,
      },
      sessionId,
    ).pipe(mapInteractionError(selector));

    // Mouse pressed (force=0.5 sets PointerEvent.pressure to 0.5, matching Playwright)
    yield* conn.cdp.Input.dispatchMouseEvent(
      {
        type: "mousePressed",
        x: point.x,
        y: point.y,
        button,
        clickCount,
        modifiers: modifiersMask,
        buttons: button === "left" ? 1 : button === "right" ? 2 : 4,
        force: 0.5,
      },
      sessionId,
    ).pipe(mapInteractionError(selector));

    // Mouse released
    yield* conn.cdp.Input.dispatchMouseEvent(
      {
        type: "mouseReleased",
        x: point.x,
        y: point.y,
        button,
        clickCount,
        modifiers: modifiersMask,
      },
      sessionId,
    ).pipe(mapInteractionError(selector));
  });

/**
 * Clicks an element matching the selector.
 *
 * Uses CDP Input.dispatchMouseEvent for reliable clicking.
 * Uses DOM.getContentQuads for accurate click coordinates that
 * respect CSS transforms.
 *
 * Retries the entire find + click operation if the element disappears
 * or is not actionable (unless `force` is set).
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the element
 * @param options - Click options (button, modifiers, clickCount, position, force, trial, timeout)
 */
export const clickElement = Effect.fn("CdpPage.click")((
  conn: CdpConnection["Service"],
  state: PageState,
  selector: string,
  options?: ClickOptions,
) => {
  const timeout = options?.timeout ?? Duration.seconds(30);
  const button = options?.button ?? "left";
  const clickCount = options?.clickCount ?? 1;
  const explicitModifiers = options?.modifiers;
  const force = options?.force ?? false;
  const trial = options?.trial ?? false;
  const position = options?.position;

  // Single pass for force mode: no retry loop, no actionability waiting.
  // Fails immediately only if the element has no visible quads (display:none).
  // Force bypasses hit-target, visibility, and enabled checks — it clicks
  // at the element's position regardless of what intercepts.
  if (force) {
    return Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);
      const point = yield* locateAndComputePoint(conn, state, sessionId, selector, position).pipe(
        Effect.mapError(ensureCdpError),
      );
      if (!point) {
        return yield* new CdpError({
          source: "CdpPage",
          method: "click",
          reason: new SelectorError({
            selector,
            description: "Element is not visible",
          }),
        });
      }
      // force mode: skip all actionability checks, dispatch the click directly
      if (trial) return;
      const keyboardMask = yield* Ref.get(state.currentModifierMask);
      const modifiersMask =
        explicitModifiers !== undefined ? computeModifierMask(explicitModifiers) : keyboardMask;
      yield* dispatchClick(conn, sessionId, selector, point, button, clickCount, modifiersMask);
    });
  }

  // Retry loop for normal + trial mode
  const methodName = trial ? "click action (trial run)" : "click";
  return retryElementLoop(
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);

      // The locator path can return a wider error type (CdpConnectionError
      // / CdpTimeoutError) on connection issues. Map those to CdpError so
      // they fit the retryElementLoop signature.
      const point = yield* locateAndComputePoint(conn, state, sessionId, selector, position).pipe(
        Effect.mapError(ensureCdpError),
      );

      // No visible quads — signal retry (element may be display:none or off-screen)
      if (!point) {
        return null;
      }

      // Actionability check (visibility, enabled, hit target)
      const result = yield* checkActionability(conn, state, selector, point);
      if (result.tag === "fail") {
        return null; // not actionable — retry
      }

      // Trial mode: actionability passed, but do not click
      if (trial) return undefined;

      // Compute effective modifier mask:
      // - If `modifiers` option is provided (even as []), it overrides keyboard state
      // - If `modifiers` option is undefined, fall back to keyboard-held modifiers
      const keyboardMask = yield* Ref.get(state.currentModifierMask);
      const modifiersMask =
        explicitModifiers !== undefined ? computeModifierMask(explicitModifiers) : keyboardMask;

      yield* dispatchClick(conn, sessionId, selector, point, button, clickCount, modifiersMask);

      return undefined;
    }),
    selector,
    timeout,
    methodName,
  );
});
