/**
 * Wait for selector element to reach desired state.
 *
 * Uses polling-only approach (like Playwright) for maximum reliability:
 * - No MutationObserver semantic gaps (shadow DOM, iframes, fragments)
 * - First poll at 0ms is synchronous within CDP Runtime.evaluate
 * - No setup phase = no race condition with concurrent Effect.all
 * - Polling intervals: [0, 20, 50, 100, 100, 500] ms
 *
 * ## State Option
 *
 * The `state` option determines what condition we're waiting for:
 * - `'attached'`: Element exists in DOM
 * - `'visible'`: Element is visible (not hidden by CSS, has non-zero dimensions) **(default)**
 * - `'hidden'`: Element is hidden (display: none, visibility: hidden, or no dimensions)
 * - `'detached'`: Element is removed from DOM (must have been attached first)
 *
 * ## Shadow DOM Piercing
 *
 * By default, selectors pierce shadow DOM (like Playwright's default behavior).
 * This uses a recursive query that traverses all shadow roots.
 */

import type { CdpConnection } from "../CdpConnection.js";
import type { FrameManager } from "./FrameManager.js";
import type { PageState } from "./PageState.js";

import { Duration, Effect, Match, Schema } from "effect";

import {
  CdpError,
  EvaluationError,
  NavigationError,
  PageTimeoutError,
  SelectorError,
} from "../../CdpError.js";
import { evaluateFrame, evaluatePage } from "./Evaluate.js";

/**
 * State to wait for when using waitForSelector.
 *
 * - `'attached'`: Element exists in DOM
 * - `'visible'`: Element is visible (not hidden, has dimensions) **(default)**
 * - `'hidden'`: Element is hidden (display:none, visibility:hidden, or no size)
 * - `'detached'`: Element is removed from DOM
 */
export type WaitForSelectorState = "attached" | "visible" | "hidden" | "detached";

/**
 * Options for waitForSelector.
 */
export interface WaitForSelectorOptions {
  /** State to wait for: attached, visible, hidden, or detached */
  state?: WaitForSelectorState;
  /** Maximum wait time */
  timeout?: Duration.Duration;
  /** Whether to pierce shadow DOM (default: true, matches Playwright) */
  pierceShadowDOM?: boolean;
  /** Frame ID to wait in (optional, for frame-specific waits) */
  frameId?: string;
  /** Frame manager (required if frameId is specified) */
  frameManager?: FrameManager;
}

// ── Browser-side Helper Functions ─────────────────────────────────────────────

/**
 * Check if an element is visible.
 * Matches Playwright's isElementVisible implementation.
 */
const isVisibleCheck = `
function isVisible(element) {
  // Check if element is connected to the document
  if (!element.isConnected) return false;
  
  const style = getComputedStyle(element);
  if (!style) return true; // No style means visible (matches Playwright)
  
  // display: contents elements are not rendered themselves, but children may be visible
  if (style.display === 'contents') {
    // Check if any children are visible
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1 && isVisible(child)) return true;
      if (child.nodeType === 3) {
        const range = document.createRange();
        range.selectNode(child);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return true;
      }
    }
    return false;
  }
  
  if (style.display === 'none') return false;
  if (style.visibility !== 'visible') return false;
  
  const rect = element.getBoundingClientRect();
  // Playwright: visible only if both dimensions are > 0
  if (rect.width <= 0 || rect.height <= 0) return false;
  return true;
}`;

/**
 * Recursively query selector piercing shadow DOM.
 */
const querySelectorDeepFn = `
function querySelectorDeep(selector, root = document) {
  try {
    const el = root.querySelector(selector);
    if (el) return el;
  } catch (e) {
    return null;
  }
  const elements = root.querySelectorAll('*');
  for (const el of elements) {
    if (el.shadowRoot) {
      const found = querySelectorDeep(selector, el.shadowRoot);
      if (found) return found;
    }
  }
  return null;
}`;

// ── Main Implementation ──────────────────────────────────────────────────────

export const waitForSelectorElement = Effect.fn("CdpPage.waitForSelector")(
  (
    conn: CdpConnection["Service"],
    state: PageState,
    selector: string,
    options?: WaitForSelectorOptions,
  ) =>
    Effect.gen(function* () {
      // Resolve options with defaults
      const stateOption: WaitForSelectorState = options?.state ?? "visible";
      const timeout = options?.timeout ?? Duration.seconds(30);
      const pierceShadowDOM = options?.pierceShadowDOM ?? true;
      const frameId = options?.frameId;
      const frameManager = options?.frameManager;

      // Convert to millis for embedding in browser-side JavaScript
      const timeoutMs = Duration.toMillis(timeout);

      // Embed selector directly in the expression
      const selJson = yield* Schema.encodeUnknownEffect(Schema.UnknownFromJsonString)(
        selector,
      ).pipe(Effect.orDie);

      // Build the browser-side code based on state and shadow DOM options
      const browserCode = buildBrowserCode(selJson, timeoutMs, stateOption, pierceShadowDOM);

      // Determine which evaluate function to use
      if (frameId && frameManager) {
        // Frame-specific wait
        yield* waitForSelectorInFrame(
          conn,
          state,
          frameManager,
          frameId,
          browserCode,
          selector,
          timeout,
          stateOption,
        );
      } else {
        // Page-level wait (main frame or no frame specified)
        yield* evaluatePage(conn, state, browserCode).pipe(
          Effect.catchReason(
            "effect-libs/browser/CdpError",
            "effect-libs/browser/CdpError/EvaluationError",
            (reason) =>
              Effect.gen(function* () {
                const description = reason.description;

                if (description.includes("Invalid selector")) {
                  return yield* new CdpError({
                    source: "CdpPage",
                    method: "waitForSelector",
                    reason: new SelectorError({
                      selector,
                      description: `Invalid CSS selector: ${selector}`,
                    }),
                  });
                }

                if (description.includes("Timeout waiting for selector")) {
                  return yield* new CdpError({
                    source: "CdpPage",
                    method: "waitForSelector",
                    reason: new PageTimeoutError({
                      selector,
                      timeout,
                      state: stateOption,
                    }),
                  });
                }

                // Non-selector/timeout EvaluationError — re-wrap to surface from waitForSelector.
                return yield* new CdpError({
                  source: "CdpPage",
                  method: "waitForSelector",
                  reason,
                });
              }),
          ),
        );
      }
    }),
);

/**
 * Wait for selector in a specific frame.
 */
const waitForSelectorInFrame = (
  conn: CdpConnection["Service"],
  state: PageState,
  frameManager: FrameManager,
  frameId: string,
  browserCode: string,
  selector: string,
  timeout: Duration.Duration,
  stateOption: WaitForSelectorState,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    // Check if frame exists and is not detached
    const metadata = frameManager.getFrameMetadata(frameId);
    if (!metadata) {
      return yield* new CdpError({
        source: "CdpPage",
        method: "waitForSelector",
        reason: new NavigationError({
          url: "frame",
          description: `Frame ${frameId} not found`,
        }),
      });
    }

    if (metadata.isDetached) {
      return yield* new CdpError({
        source: "CdpPage",
        method: "waitForSelector",
        reason: new NavigationError({
          url: "frame",
          description: `Frame ${frameId} is detached`,
        }),
      });
    }

    // Wait for frame's execution context
    yield* frameManager.waitForExecutionContext(frameId, "main", timeout);

    // Get the context ID for this frame
    const contextId = yield* frameManager.getMainContextId(frameId);
    if (contextId === null) {
      return yield* new CdpError({
        source: "CdpPage",
        method: "waitForSelector",
        reason: new EvaluationError({
          description: `No execution context for frame ${frameId}`,
        }),
      });
    }

    // Evaluate in the frame's context
    yield* evaluateFrame(conn, state, contextId, frameId, browserCode).pipe(
      Effect.catchReason(
        "effect-libs/browser/CdpError",
        "effect-libs/browser/CdpError/EvaluationError",
        (reason) =>
          Effect.gen(function* () {
            const description = reason.description;

            if (description.includes("Invalid selector")) {
              return yield* new CdpError({
                source: "CdpPage",
                method: "waitForSelector",
                reason: new SelectorError({
                  selector,
                  description: `Invalid CSS selector: ${selector}`,
                }),
              });
            }

            if (description.includes("Timeout waiting for selector")) {
              return yield* new CdpError({
                source: "CdpPage",
                method: "waitForSelector",
                reason: new PageTimeoutError({
                  selector,
                  timeout,
                  state: stateOption,
                }),
              });
            }

            // Non-selector/timeout EvaluationError — re-wrap to surface from waitForSelector.
            return yield* new CdpError({
              source: "CdpPage",
              method: "waitForSelector",
              reason,
            });
          }),
      ),
    );
  });

/**
 * Build browser-side JavaScript code for waitForSelector.
 */
function buildBrowserCode(
  selJson: string,
  timeoutMs: number,
  state: WaitForSelectorState,
  pierceShadowDOM: boolean,
): string {
  // Include helper functions based on options
  const helperCode = pierceShadowDOM ? isVisibleCheck + "\n" + querySelectorDeepFn : isVisibleCheck;

  // Choose query function based on shadow DOM option
  const queryFn = pierceShadowDOM ? "querySelectorDeep" : "document.querySelector";

  // Build state-specific check logic
  const stateCheck = buildStateCheck(state, queryFn);

  return `(() => {
    ${helperCode}

    const sel = ${selJson};
    const timeout = ${timeoutMs};
    const intervals = [0, 20, 50, 100, 100, 500];
    let attempt = 0;
    const startTime = Date.now();
    
    let wasAttached = false;
    let attachedElement = null;

    return new Promise((resolve, reject) => {
      const poll = () => {
        try {
          ${stateCheck}
        } catch (e) {
          return reject(new Error('Invalid selector: ' + sel));
        }

        if (Date.now() - startTime >= timeout) {
          return reject(new Error('Timeout waiting for selector: ' + sel + ' (state: ${state})'));
        }

        if (attempt >= intervals.length) {
          setTimeout(poll, 500);
        } else {
          const delay = intervals[attempt++];
          if (delay === 0) {
            poll();
          } else {
            setTimeout(poll, delay);
          }
        }
      };

      poll();
    });
  })()`;
}

/**
 * Build state-specific check logic for the browser code.
 */
function buildStateCheck(state: WaitForSelectorState, queryFn: string): string {
  return Match.value(state).pipe(
    Match.when("attached", () => `const el = ${queryFn}(sel); if (el) return resolve();`),
    Match.when(
      "visible",
      () => `const el = ${queryFn}(sel); if (el && isVisible(el)) return resolve();`,
    ),
    Match.when(
      "hidden",
      () => `const el = ${queryFn}(sel); if (!el || !isVisible(el)) return resolve();`,
    ),
    Match.when(
      "detached",
      () => `
        const el = ${queryFn}(sel);
        // If element never existed, resolve immediately (already detached)
        if (!el && !wasAttached) return resolve();
        // Track when element first appears
        if (el && !wasAttached) { wasAttached = true; attachedElement = el; }
        // Element was attached and now is gone
        if (wasAttached && !el) return resolve();
        // Element was removed from document
        if (attachedElement && !document.contains(attachedElement)) return resolve();`,
    ),
    Match.exhaustive,
  );
}
