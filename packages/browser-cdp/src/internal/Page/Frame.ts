/**
 * CdpFrame factory — creates frame objects for the Frames API.
 *
 * Provides a factory function to create CdpFrame objects with all their
 * properties (url, name, isDetached, parentFrame, childFrames, evaluate).
 *
 */

import type { CdpConnectionService } from "../CdpConnection.js";
import type { CdpFrame as CdpFrameType, EvaluateFn } from "../CdpPage.js";
import type { WaitUntil, UrlMatch } from "../types.js";
import type { FrameManager, NetworkIdleProvider } from "./FrameManager.js";
import type { NetworkResponseTracker } from "./NetworkResponseTracker.js";
import type { PageState } from "./PageState.js";

import { Effect, Option, SubscriptionRef, type Duration } from "effect";
import { type Input as DurationInput } from "effect/Duration";

import {
  CdpError as CdpErrorClass,
  ContentUnavailableError,
  EvaluationError,
  NavigationError,
} from "../../CdpError.js";
import { evaluateFrame, evaluatePage } from "./Evaluate.js";
import { buildFrameExtensionMethods } from "./FrameExtensions.js";
import { snapshotTargetNav, waitForLoadStateFrame, waitForNavEpoch } from "./FrameManager.js";
import { gotoPage } from "./Goto.js";
import { pageContent } from "./PageContent.js";
import { makeResponse, type Response } from "./Response.js";
import { waitForFunctionFrame, waitForFunctionPage } from "./WaitForFunction.js";
import { waitForSelectorElement, type WaitForSelectorState } from "./WaitForSelector.js";

// Type alias kept for clarity within Frame.ts — the runtime type comes
// from CdpPage.ts via the CdpFrame type re-export.
type CdpFrame = CdpFrameType;

/**
 * Context needed to create a CdpFrame.
 */
export interface FrameContext {
  /** The CDP connection for evaluate operations */
  connection: CdpConnectionService;
  /** The frame manager for frame state and metadata */
  frameManager: FrameManager;
  /** The page state for evaluate operations */
  state: PageState;
  /** Function to get all frames array (for parent/child lookups) */
  getAllFrames: () => ReadonlyArray<CdpFrame>;
  /** Resolve timeout with page defaults */
  resolveTimeout: (timeout?: DurationInput) => Effect.Effect<Duration.Duration>;
  /** Network idle provider for networkidle waitUntil */
  networkIdle: NetworkIdleProvider;
  /** Network response tracker for goto response tracking */
  responseTracker: NetworkResponseTracker;
  /** The CDP target ID for session management */
  targetId: string;
  /**
   * The parent CdpPageService. Used by `frame.page` and `frame.frameLocator`
   * which need to delegate back to the page for cross-cutting concerns.
   *
   * Typed loosely (`{ readonly [k: string]: any }`) to avoid a circular
   * import between Frame.ts and CdpPage.ts. The actual type is
   * `CdpPageService` — see `CdpPage.ts`.
   */
  readonly page: { readonly [k: string]: any };
}

/**
 * Creates a CdpFrame object for a given frame ID.
 *
 * This is a synchronous factory that creates the frame object structure.
 * The evaluate property is lazily executed when called.
 *
 * @param frameId - The CDP frame identifier
 * @param ctx - The frame context (frameManager, state, getAllFrames)
 * @returns A CdpFrame object, or null if the frame doesn't exist
 */
export const makeCdpFrame = (frameId: string, ctx: FrameContext): CdpFrame | null => {
  const { frameManager, getAllFrames } = ctx;
  const metadata = frameManager.getFrameMetadata(frameId);

  if (!metadata) {
    return null;
  }

  const frame: CdpFrame = {
    frameId,

    url: Effect.sync(() => {
      const frameState = frameManager.getFrameState(frameId);
      if (!frameState) return "about:blank";
      return SubscriptionRef.getUnsafe(frameState).url;
    }),

    name: Effect.sync(() => metadata.name),

    isDetached: Effect.sync(() => {
      const m = frameManager.getFrameMetadata(frameId);
      return m?.isDetached ?? false;
    }),

    parentFrame: Effect.sync(() =>
      Option.match(metadata.parentId, {
        onNone: () => Option.none(),
        onSome: (parentId) => {
          const allFrames = getAllFrames();
          const parent = allFrames.find((f) => f.frameId === parentId);
          return parent ? Option.some(parent) : Option.none();
        },
      }),
    ),

    childFrames: Effect.sync(() => {
      const childIds = frameManager.getChildFrameIds(frameId);
      const allFrames = getAllFrames();
      return childIds
        .map((id) => allFrames.find((f) => f.frameId === id))
        .filter((f): f is CdpFrame => f !== undefined);
    }),

    content: Effect.gen(function* () {
      // Check if navigation is in progress - if we only have "commit" without
      // domcontentloaded or load, the page is actively navigating.
      const frameState = ctx.frameManager.getFrameState(frameId);
      if (frameState) {
        const state = SubscriptionRef.getUnsafe(frameState);
        if (!state.lifecycleEvents.has("domcontentloaded") && !state.lifecycleEvents.has("load")) {
          return yield* new CdpErrorClass({
            module: "CdpFrame",
            method: "content",
            reason: new ContentUnavailableError({
              description:
                "Unable to retrieve content because the page is navigating and changing the content.",
            }),
          });
        }
      }
      // Wait for utility execution context
      yield* ctx.frameManager.waitForExecutionContext(frameId, "utility");
      const contextId = yield* ctx.frameManager.getUtilityContextId(frameId);
      if (contextId === null) {
        // Fall back to main world if utility context not available
        yield* ctx.frameManager.waitForExecutionContext(frameId, "main");
        const mainContextId = yield* ctx.frameManager.getMainContextId(frameId);
        if (mainContextId === null) {
          return yield* new CdpErrorClass({
            module: "CdpFrame",
            method: "content",
            reason: new EvaluationError({
              description: "No execution context for frame",
            }),
          });
        }
        return yield* evaluateFrame(
          ctx.connection,
          ctx.state,
          mainContextId,
          frameId,
          () => document.documentElement.outerHTML,
        );
      }
      return yield* pageContent(ctx.connection, ctx.state, contextId);
    }),

    evaluate: <T>(pageFunction: EvaluateFn<T>, arg?: unknown) =>
      Effect.gen(function* () {
        // Check for detachment
        const currentMetadata = ctx.frameManager.getFrameMetadata(frameId);
        if (currentMetadata?.isDetached) {
          return yield* new CdpErrorClass({
            module: "CdpFrame",
            method: "evaluate",
            reason: new NavigationError({
              url: "frame",
              description: `Frame ${frameId} was detached`,
            }),
          });
        }

        // Wait for main world execution context
        yield* ctx.frameManager.waitForExecutionContext(frameId, "main");

        // Get the main world context ID
        const contextId = yield* ctx.frameManager.getMainContextId(frameId);
        if (contextId === null) {
          return yield* new CdpErrorClass({
            module: "CdpFrame",
            method: "evaluate",
            reason: new EvaluationError({
              description: "No execution context for frame",
            }),
          });
        }

        // Evaluate in the frame's context
        return yield* evaluateFrame(
          ctx.connection,
          ctx.state,
          contextId,
          frameId,
          pageFunction,
          arg,
        );
      }),

    waitForNavigation: (options?: {
      waitUntil?: WaitUntil;
      timeout?: DurationInput;
      url?: UrlMatch;
    }) => {
      // Eager snapshot: capture targetNav NOW (at call time), not when yielded.
      const waitUntil = options?.waitUntil ?? "load";
      const { state: stateRef, targetNav } = snapshotTargetNav(
        ctx.frameManager,
        frameId,
        waitUntil,
      );
      const lifecycleTarget: WaitUntil = waitUntil === "networkidle" ? "load" : waitUntil;

      return Effect.gen(function* () {
        const timeout = yield* ctx.resolveTimeout(options?.timeout);
        const finalState = yield* waitForNavEpoch(stateRef, {
          method: "waitForNavigation",
          targetNav,
          lifecycleTarget,
          timeout,
          urlMatch: options?.url,
        });

        // At commit phase, the request hasn't been issued yet — no response.
        if (lifecycleTarget === "commit") {
          return Option.none<Response>();
        }

        // Same-document navigations (pushState, replaceState, hash) clear
        // the loaderId in FrameManager.onNavigatedWithinDocument, so the
        // absence of a loaderId correctly maps to "no network response".
        const loaderId = Option.getOrNull(finalState.loaderId);
        if (!loaderId) {
          return Option.none<Response>();
        }

        // Wait for the response correlated by loaderId.
        const responseData = yield* ctx.responseTracker
          .waitForNavigationResponse(loaderId, finalState.url)
          .pipe(
            Effect.timeout("1 second"),
            Effect.catchTag("TimeoutError", () => Effect.void),
          );

        if (!responseData) {
          return Option.none<Response>();
        }

        return Option.some(
          makeResponse(ctx.connection, ctx.state, ctx.responseTracker, responseData),
        );
      });
    },

    waitForLoadState: (state?: WaitUntil, options?: { timeout?: DurationInput }) =>
      Effect.gen(function* () {
        const timeout = yield* ctx.resolveTimeout(options?.timeout);
        yield* waitForLoadStateFrame(ctx.frameManager, frameId, state ?? "load", {
          timeout,
        });
      }),

    waitForURL: (url: UrlMatch, options?: { waitUntil?: WaitUntil; timeout?: DurationInput }) => {
      // Eager snapshot: capture targetNav NOW (at call time), not when yielded.
      const waitUntil = options?.waitUntil ?? "load";
      const { state: stateRef, targetNav } = snapshotTargetNav(
        ctx.frameManager,
        frameId,
        waitUntil,
        url,
      );
      const lifecycleTarget: WaitUntil = waitUntil === "networkidle" ? "load" : waitUntil;

      return Effect.gen(function* () {
        const timeout = yield* ctx.resolveTimeout(options?.timeout);
        yield* waitForNavEpoch(stateRef, {
          method: "waitForURL",
          targetNav,
          lifecycleTarget,
          timeout,
          urlMatch: url,
        });
      });
    },

    goto: (url: string, options?: { waitUntil?: WaitUntil; timeout?: DurationInput }) =>
      Effect.gen(function* () {
        return yield* gotoPage(
          ctx.connection,
          ctx.state,
          ctx.frameManager,
          ctx.networkIdle,
          ctx.responseTracker,
          ctx.targetId,
          url,
          {
            waitUntil: options?.waitUntil,
            timeout: yield* ctx.resolveTimeout(options?.timeout),
            frameId,
          },
        );
      }),

    waitForFunction: <T, Arg = void>(
      pageFunction: EvaluateFn<T>,
      arg?: Arg,
      options?: { timeout?: DurationInput; polling?: number | "raf" },
    ) =>
      Effect.gen(function* () {
        // Check for detachment
        const currentMetadata = ctx.frameManager.getFrameMetadata(frameId);
        if (currentMetadata?.isDetached) {
          return yield* new CdpErrorClass({
            module: "CdpFrame",
            method: "waitForFunction",
            reason: new NavigationError({
              url: "frame",
              description: `Frame ${frameId} was detached`,
            }),
          });
        }

        // Wait for main world execution context
        yield* ctx.frameManager.waitForExecutionContext(frameId, "main");

        // Get the main world context ID
        const contextId = yield* ctx.frameManager.getMainContextId(frameId);
        if (contextId === null) {
          return yield* new CdpErrorClass({
            module: "CdpFrame",
            method: "waitForFunction",
            reason: new EvaluationError({
              description: "No execution context for frame",
            }),
          });
        }

        const timeout = yield* ctx.resolveTimeout(options?.timeout);
        return yield* waitForFunctionFrame(
          ctx.connection,
          ctx.state,
          frameId,
          contextId,
          pageFunction,
          arg,
          { timeout, polling: options?.polling },
        );
      }),

    waitForSelector: (
      selector: string,
      options?: { state?: WaitForSelectorState; timeout?: DurationInput },
    ) =>
      Effect.gen(function* () {
        // Check for detachment
        const currentMetadata = ctx.frameManager.getFrameMetadata(frameId);
        if (currentMetadata?.isDetached) {
          return yield* new CdpErrorClass({
            module: "CdpFrame",
            method: "waitForSelector",
            reason: new NavigationError({
              url: "frame",
              description: `Frame ${frameId} was detached`,
            }),
          });
        }

        // Wait for main world execution context
        yield* ctx.frameManager.waitForExecutionContext(frameId, "main");

        const timeout = yield* ctx.resolveTimeout(options?.timeout);
        return yield* waitForSelectorElement(ctx.connection, ctx.state, selector, {
          state: options?.state,
          timeout,
          frameId,
          frameManager: ctx.frameManager,
        });
      }),

    // ─── Phase P3 methods ────────────────────────────────────────────────────
    ...(buildFrameExtensionMethods({
      connection: ctx.connection,
      state: ctx.state,
      frameManager: ctx.frameManager,
      frameId,
      targetId: ctx.targetId,
      networkIdle: ctx.networkIdle,
      page: ctx.page,
    }) as any),
  };

  return frame;
};

/**
 * Creates the main frame object.
 *
 * The main frame has special handling:
 * - parentFrame is always Option.none()
 * - Uses the main frame's execution context for evaluate
 *
 * @param mainId - The main frame ID
 * @param ctx - The frame context
 * @returns A CdpFrame for the main frame
 */
export const makeMainFrame = (mainId: string, ctx: FrameContext): CdpFrame => {
  const { frameManager, state, getAllFrames, connection } = ctx;
  const metadata = frameManager.getFrameMetadata(mainId);

  const frame: CdpFrame = {
    frameId: mainId,

    url: Effect.sync(() => {
      const frameState = frameManager.getFrameState(mainId);
      if (!frameState) return "about:blank";
      return SubscriptionRef.getUnsafe(frameState).url;
    }),

    name: Effect.sync(() => metadata?.name ?? ""),

    isDetached: Effect.sync(() => metadata?.isDetached ?? false),

    parentFrame: Effect.succeed(Option.none()),

    childFrames: Effect.sync(() => {
      const childIds = frameManager.getChildFrameIds(mainId);
      const allFrames = getAllFrames();
      return childIds
        .map((id) => allFrames.find((f) => f.frameId === id))
        .filter((f): f is CdpFrame => f !== undefined);
    }),

    content: Effect.gen(function* () {
      // Check if navigation is in progress - if we only have "commit" without
      // domcontentloaded or load, the page is actively navigating.
      const frameState = frameManager.getFrameState(mainId);
      if (frameState) {
        const state = SubscriptionRef.getUnsafe(frameState);
        if (!state.lifecycleEvents.has("domcontentloaded") && !state.lifecycleEvents.has("load")) {
          return yield* new CdpErrorClass({
            module: "CdpFrame",
            method: "content",
            reason: new ContentUnavailableError({
              description:
                "Unable to retrieve content because the page is navigating and changing the content.",
            }),
          });
        }
      }
      // Wait for utility execution context
      yield* frameManager.waitForExecutionContext(mainId, "utility");
      const contextId = yield* frameManager.getUtilityContextId(mainId);
      if (contextId === null) {
        // Fall back to main world if utility context not available
        yield* frameManager.waitForExecutionContext(mainId, "main");
        return yield* evaluatePage(connection, state, () => document.documentElement.outerHTML);
      }
      return yield* pageContent(connection, state, contextId);
    }),

    evaluate: <T>(pageFunction: EvaluateFn<T>, arg?: unknown) =>
      Effect.gen(function* () {
        yield* frameManager.waitForExecutionContext(mainId, "main");
        return yield* evaluatePage(connection, state, pageFunction, arg);
      }),

    waitForNavigation: (options?: {
      waitUntil?: WaitUntil;
      timeout?: DurationInput;
      url?: UrlMatch;
    }) => {
      // Eager snapshot: capture targetNav NOW (at call time), not when yielded.
      const waitUntil = options?.waitUntil ?? "load";
      const { state: stateRef, targetNav } = snapshotTargetNav(frameManager, mainId, waitUntil);
      const lifecycleTarget: WaitUntil = waitUntil === "networkidle" ? "load" : waitUntil;

      return Effect.gen(function* () {
        const timeout = yield* ctx.resolveTimeout(options?.timeout);
        const finalState = yield* waitForNavEpoch(stateRef, {
          method: "waitForNavigation",
          targetNav,
          lifecycleTarget,
          timeout,
          urlMatch: options?.url,
        });

        // At commit phase, the request hasn't been issued yet — no response.
        if (lifecycleTarget === "commit") {
          return Option.none<Response>();
        }

        // Same-document navigations (pushState, replaceState, hash) clear
        // the loaderId in FrameManager.onNavigatedWithinDocument, so the
        // absence of a loaderId correctly maps to "no network response".
        const loaderId = Option.getOrNull(finalState.loaderId);
        if (!loaderId) {
          return Option.none<Response>();
        }

        // Wait for the response correlated by loaderId.
        const responseData = yield* ctx.responseTracker
          .waitForNavigationResponse(loaderId, finalState.url)
          .pipe(
            Effect.timeout("1 second"),
            Effect.catchTag("TimeoutError", () => Effect.void),
          );

        if (!responseData) {
          return Option.none<Response>();
        }

        return Option.some(
          makeResponse(ctx.connection, ctx.state, ctx.responseTracker, responseData),
        );
      });
    },

    waitForLoadState: (state?: WaitUntil, options?: { timeout?: DurationInput }) =>
      Effect.gen(function* () {
        const timeout = yield* ctx.resolveTimeout(options?.timeout);
        yield* waitForLoadStateFrame(frameManager, mainId, state ?? "load", {
          timeout,
        });
      }),

    waitForURL: (url: UrlMatch, options?: { waitUntil?: WaitUntil; timeout?: DurationInput }) => {
      // Eager snapshot: capture targetNav NOW (at call time), not when yielded.
      const waitUntil = options?.waitUntil ?? "load";
      const { state: stateRef, targetNav } = snapshotTargetNav(
        frameManager,
        mainId,
        waitUntil,
        url,
      );
      const lifecycleTarget: WaitUntil = waitUntil === "networkidle" ? "load" : waitUntil;

      return Effect.gen(function* () {
        const timeout = yield* ctx.resolveTimeout(options?.timeout);
        yield* waitForNavEpoch(stateRef, {
          method: "waitForURL",
          targetNav,
          lifecycleTarget,
          timeout,
          urlMatch: url,
        });
      });
    },

    goto: (url: string, options?: { waitUntil?: WaitUntil; timeout?: DurationInput }) =>
      Effect.gen(function* () {
        return yield* gotoPage(
          ctx.connection,
          ctx.state,
          ctx.frameManager,
          ctx.networkIdle,
          ctx.responseTracker,
          ctx.targetId,
          url,
          {
            waitUntil: options?.waitUntil,
            timeout: yield* ctx.resolveTimeout(options?.timeout),
            frameId: mainId,
          },
        );
      }),

    waitForFunction: <T, Arg = void>(
      pageFunction: EvaluateFn<T>,
      arg?: Arg,
      options?: { timeout?: DurationInput; polling?: number | "raf" },
    ) =>
      Effect.gen(function* () {
        yield* frameManager.waitForExecutionContext(mainId, "main");
        const timeout = yield* ctx.resolveTimeout(options?.timeout);
        return yield* waitForFunctionPage(connection, state, pageFunction, arg, {
          timeout,
          polling: options?.polling,
        });
      }),

    waitForSelector: (
      selector: string,
      options?: { state?: WaitForSelectorState; timeout?: DurationInput },
    ) =>
      Effect.gen(function* () {
        yield* frameManager.waitForExecutionContext(mainId, "main");
        const timeout = yield* ctx.resolveTimeout(options?.timeout);
        return yield* waitForSelectorElement(connection, state, selector, {
          state: options?.state,
          timeout,
        });
      }),

    // ─── Phase P3 methods ────────────────────────────────────────────────────
    ...(buildFrameExtensionMethods({
      connection,
      state,
      frameManager,
      frameId: mainId,
      targetId: ctx.targetId,
      networkIdle: ctx.networkIdle,
      page: ctx.page,
    }) as any),
  };

  return frame;
};
