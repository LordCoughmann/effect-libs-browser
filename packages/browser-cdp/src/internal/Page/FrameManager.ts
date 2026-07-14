/**
 * FrameManager — per-frame navigation state tracking.
 *
 * Manages a `Map<frameId, SubscriptionRef<NavigationState>>` populated by
 * background CDP event fibers. Provides epoch-based navigation waiting
 * that matches Playwright's behavior: call `waitForNavigation` AFTER the
 * triggering action, and it works regardless of timing.
 *
 * ## Epoch Pattern
 *
 * Each `Page.frameNavigated` increments `navCount` and resets lifecycle events.
 * `waitForNavigation` snapshots the current epoch, computes a target:
 * - **Idle** (lifecycle already reached): target = `navCount + 1`
 * - **Navigating** (lifecycle not reached): target = `navCount`
 *
 * Then streams changes until `navCount >= target && lifecycleEvents.has(waitUntil)`.
 *
 * ## Shared Wait Mechanism
 *
 * `waitForNavEpoch` is the core primitive that handles stream filtering,
 * timeout, and error detection. `waitForNavigationFrame` and `setContent`
 * are policy wrappers that compute the target epoch and delegate.
 *
 * ## Frame Hierarchy
 *
 * The FrameManager also tracks frame hierarchy (parent/child relationships)
 * and frame metadata (name, URL, detached state). This supports the
 * `page.frames()` API.
 *
 */

import type { CdpError } from "../../CdpError.js";
import type { WaitUntil, UrlMatch } from "../types.js";
import type { NavigationState, NavigationError } from "./NavigationState.js";

import { Deferred, Duration, Effect, Fiber, Option, Ref, Stream, SubscriptionRef } from "effect";

import {
  CdpError as CdpErrorClass,
  CommandError,
  PageTimeoutError,
  NavigationError as NavError,
} from "../../CdpError.js";
import { matchUrl } from "../utils.js";

// ── Types ──────────────────────────────────────────────────────────────────────

/** The name used for our utility isolated world. Must be unique per page instance. */
export const UTILITY_WORLD_NAME = "__effect_browser_utility_world__";

const LIFECYCLE_MAP: Record<string, WaitUntil | null> = {
  load: "load",
  DOMContentLoaded: "domcontentloaded",
};

const LIFECYCLE_WAIT_UNTIL: ReadonlySet<string> = new Set(["load", "domcontentloaded", "commit"]);

/**
 * Compute the target navigation epoch eagerly (synchronous).
 *
 * Reads the current `NavigationState` from the frame's `SubscriptionRef`
 * and computes what `targetNav` value `waitForNavigationFrame` would use.
 * This is used by `page.waitForNavigation()` and `page.waitForURL()` to
 * capture the snapshot at call time (not yield time), enabling the
 * Playwright-style handle pattern:
 * ```ts
 * const nav = page.waitForNavigation(); // snapshot taken HERE
 * yield* page.click("a");                  // trigger navigation
 * yield* nav;                              // wait for nav >= snapshot
 * ```
 */
export const snapshotTargetNav = (
  manager: FrameManager,
  frameId: string,
  waitUntil: WaitUntil,
  urlMatch?: UrlMatch,
): {
  readonly state: SubscriptionRef.SubscriptionRef<NavigationState>;
  readonly targetNav: number;
} => {
  const state = manager.getFrameState(frameId);
  if (!state) throw new Error(`Frame not found: ${frameId}`);
  const lifecycleTarget: WaitUntil = waitUntil === "networkidle" ? "load" : waitUntil;
  const snapshot = (state as { readonly value: NavigationState }).value;
  const lifecycleFired =
    LIFECYCLE_WAIT_UNTIL.has(lifecycleTarget) && snapshot.lifecycleEvents.has(lifecycleTarget);
  const urlMatches = urlMatch ? matchUrl(urlMatch, snapshot.url) : false;
  // If URL already matches AND lifecycle has fired, return current navCount
  // so waitForNavEpoch resolves immediately. Otherwise, wait for next nav.
  const targetNav =
    lifecycleFired && urlMatches
      ? snapshot.navCount
      : lifecycleFired
        ? snapshot.navCount + 1
        : snapshot.navCount;
  return { state, targetNav } as const;
};

/**
 * Interface for network idle detection, injected into FrameManager methods.
 * This keeps network tracking orthogonal to document lifecycle.
 */
export interface NetworkIdleProvider {
  readonly waitForIdle: (idleTimeMs?: number) => Effect.Effect<void>;
  readonly waitForIdleNoInitial: (idleTimeMs?: number) => Effect.Effect<void>;
}

/**
 * Frame metadata tracked by FrameManager.
 *
 * Updated from CDP events: Page.frameAttached, Page.frameNavigated, Page.frameDetached.
 */
export interface FrameMetadata {
  /** Frame name (iframe name attribute or empty for main frame). */
  readonly name: string;
  /** Parent frame ID (None for main frame). */
  readonly parentId: Option.Option<string>;
  /** Whether the frame has been detached (iframe removed from DOM). */
  readonly isDetached: boolean;
}

// ── Error Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = Duration.seconds(30);

export const makeTimeoutError = (method: string, timeout: Duration.Duration): CdpError =>
  new CdpErrorClass({
    module: "CdpPage",
    method,
    reason: new PageTimeoutError({ timeout }),
  });

const makeFrameNotFoundError = (method: string, frameId: string): CdpError =>
  new CdpErrorClass({
    module: "CdpPage",
    method,
    reason: new NavError({ url: "frame", description: `Frame ${frameId} not found` }),
  });

// ── FrameManager Class ─────────────────────────────────────────────────────────

/**
 * Manages per-frame navigation state using SubscriptionRef-backed epochs.
 *
 * Also tracks execution context availability per frame via Deferred promises.
 * This mirrors Playwright's `contextPromise` pattern — `Runtime.evaluate`
 * calls must wait for the execution context to be created after navigation.
 */
export class FrameManager {
  readonly frames = new Map<string, SubscriptionRef.SubscriptionRef<NavigationState>>();
  // Tracks the main frame's current URL. Updated from CDP events
  // (Page.frameNavigated, Page.navigatedWithinDocument). Read synchronously
  // via getUrl() to match Playwright's `page.url()` API.
  private currentUrl: string = "about:blank";

  // Frame metadata: name, parentId, isDetached.
  // Used by page.frames() API.
  private readonly frameMetadata = new Map<string, FrameMetadata>();

  // Main frame ID — the root of the frame tree.
  // Set in makeFrameManager factory function.
  private mainFrameId: string = "";

  // Main world execution context tracking per frame. Mirrors Playwright's
  // contextPromise for the 'main' world.
  // - Created (unresolved) when a frame is registered
  // - Reset (new unresolved Deferred) on frameNavigated (new document)
  // - Resolved on Runtime.executionContextCreated for that frame (isDefault=true)
  private readonly executionContexts = new Map<string, Deferred.Deferred<void>>();

  // Utility world execution context tracking per frame. Mirrors Playwright's
  // contextPromise for the 'utility' world.
  // - Created (unresolved) when a frame is registered
  // - Reset (new unresolved Deferred) on frameNavigated (new document)
  // - Resolved when we detect Runtime.executionContextCreated with
  //   context.name === UTILITY_WORLD_NAME for that frame
  private readonly utilityContexts = new Map<string, Deferred.Deferred<void>>();

  // Maps (frameId) → utility world execution context ID.
  // Needed for Runtime.callFunctionOn to target the utility world.
  private readonly utilityContextIds = new Map<string, Ref.Ref<number | null>>();

  // Maps (frameId) → main world execution context ID.
  // Needed for frame.evaluate() to target specific frames.
  private readonly mainContextIds = new Map<string, Ref.Ref<number | null>>();

  // Maps (frameId) → CDP remote object ID of the injected script in the
  // utility world. Null until injected, reset on navigation.
  // This is a string like "{-8589934592}" used as the `objectId` parameter
  // in Runtime.callFunctionOn.
  private readonly injectedScriptObjectIds = new Map<string, Ref.Ref<string | null>>();

  // Maps (frameId) → CDP remote object ID of the utility script in the
  // main world. Phase P6 — for evaluate paths that need main-world
  // handles (e.g. `page.evaluate(fn, handle)` where the handle is
  // created in the main world).
  private readonly mainWorldUtilityScriptObjectIds = new Map<string, Ref.Ref<string | null>>();

  // Console message tag handlers for setContent lifecycle management.
  // Mirrors Playwright's _consoleMessageTags Map.
  private readonly consoleMessageTags = new Map<string, () => void>();

  getFrameState(frameId: string): SubscriptionRef.SubscriptionRef<NavigationState> | undefined {
    return this.frames.get(frameId);
  }

  /**
   * Get frame metadata (name, parentId, isDetached).
   * Returns null if frame is not tracked.
   */
  getFrameMetadata(frameId: string): FrameMetadata | null {
    return this.frameMetadata.get(frameId) ?? null;
  }

  /**
   * Get all frame IDs (including detached frames).
   */
  getAllFrameIds(): ReadonlyArray<string> {
    return Array.from(this.frames.keys());
  }

  /**
   * Get child frame IDs for a given frame.
   */
  getChildFrameIds(parentId: string): ReadonlyArray<string> {
    const children: string[] = [];
    for (const [frameId, metadata] of this.frameMetadata) {
      if (Option.isSome(metadata.parentId) && metadata.parentId.value === parentId) {
        children.push(frameId);
      }
    }
    return children;
  }

  /**
   * Get the main frame ID.
   */
  getMainFrameId(): string {
    return this.mainFrameId;
  }

  /**
   * Check if a frame is detached.
   */
  isFrameDetached(frameId: string): boolean {
    const metadata = this.frameMetadata.get(frameId);
    return metadata?.isDetached ?? true; // Unknown frames are treated as detached
  }

  getUrl(): string {
    return this.currentUrl;
  }

  setUrl(url: string): void {
    this.currentUrl = url;
  }

  /**
   * Wait for an execution context to be available for the given frame.
   *
   * This is the Effect equivalent of Playwright's `frame._context(world)`
   * which awaits the `contextPromise`. Must be called before `Runtime.evaluate`
   * or `Runtime.callFunctionOn` to ensure the JS execution environment exists.
   *
   * @param frameId - The frame to wait for
   * @param world - 'main' or 'utility' (default: 'main')
   * @param timeout - Maximum wait time (default: 30s)
   */
  waitForExecutionContext(
    frameId: string,
    world: "main" | "utility" = "main",
    timeout: Duration.Duration = DEFAULT_TIMEOUT,
  ): Effect.Effect<void, CdpError> {
    const contexts = world === "utility" ? this.utilityContexts : this.executionContexts;
    const deferred = contexts.get(frameId);
    if (!deferred) {
      // Frame not tracked — this shouldn't happen for the main frame,
      // but for iframes the frame may not be registered yet.
      return Effect.void;
    }
    // Already resolved — return immediately
    if (Deferred.isDoneUnsafe(deferred)) {
      return Effect.void;
    }
    return Deferred.await(deferred).pipe(
      Effect.timeout(timeout),
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(
          new CdpErrorClass({
            module: "CdpPage",
            method: "waitForExecutionContext",
            reason: new PageTimeoutError({ timeout }),
          }),
        ),
      ),
    );
  }

  /**
   * Get utility context ID — synchronous access via Effect.
   * Use when you've already waited for the context via waitForExecutionContext.
   */
  getUtilityContextId(frameId: string): Effect.Effect<number | null> {
    const ref = this.utilityContextIds.get(frameId);
    if (!ref) return Effect.succeed(null);
    return Ref.get(ref);
  }

  /**
   * Get main world context ID — synchronous access via Effect.
   * Use when you've already waited for the context via waitForExecutionContext.
   */
  getMainContextId(frameId: string): Effect.Effect<number | null> {
    const ref = this.mainContextIds.get(frameId);
    if (!ref) return Effect.succeed(null);
    return Ref.get(ref);
  }

  /**
   * Get the CDP remote object ID of the injected script for a frame.
   * Returns null if not yet injected (will be created lazily).
   */
  getInjectedScriptObjectId(frameId: string): Effect.Effect<string | null> {
    const ref = this.injectedScriptObjectIds.get(frameId);
    if (!ref) return Effect.succeed(null);
    return Ref.get(ref);
  }

  /**
   * Set the CDP remote object ID of the injected script for a frame.
   * Called after successful injection.
   */
  setInjectedScriptObjectId(frameId: string, objectId: string): Effect.Effect<void> {
    const ref = this.injectedScriptObjectIds.get(frameId);
    if (ref) return Ref.set(ref, objectId);
    return Effect.void;
  }

  /**
   * Get the CDP remote object ID of the main-world utility script for
   * a frame. Returns null if not yet injected (will be created lazily).
   * Phase P6 — used by `evaluatePage` so that handles created in the
   * main world can be passed via the `arguments` field.
   */
  getMainWorldUtilityScriptObjectId(frameId: string): Effect.Effect<string | null> {
    const ref = this.mainWorldUtilityScriptObjectIds.get(frameId);
    if (!ref) return Effect.succeed(null);
    return Ref.get(ref);
  }

  /**
   * Set the CDP remote object ID of the main-world utility script.
   */
  setMainWorldUtilityScriptObjectId(frameId: string, objectId: string): Effect.Effect<void> {
    const ref = this.mainWorldUtilityScriptObjectIds.get(frameId);
    if (ref) return Ref.set(ref, objectId);
    return Effect.void;
  }

  /**
   * Register a handler for a console.debug tag message.
   * Used by setContent to detect when document.open() fires.
   * Returns an unregister function.
   */
  // fallow-ignore-next-line unused-class-member
  registerConsoleTag(tag: string, handler: () => void): () => void {
    this.consoleMessageTags.set(tag, handler);
    return () => {
      this.consoleMessageTags.delete(tag);
    };
  }

  /**
   * Handle a Runtime.consoleAPICalled event.
   * Checks for registered tag messages (type='debug') and invokes handlers.
   * Returns true if the message was handled (should not be further processed).
   */
  handleConsoleMessage(type: string, text: string): boolean {
    if (type !== "debug") return false;
    const handler = this.consoleMessageTags.get(text);
    if (!handler) return false;
    this.consoleMessageTags.delete(text);
    handler();
    return true;
  }

  /**
   * Handle Runtime.executionContextsCleared — all contexts are invalidated.
   * Resets main and utility context IDs and deferreds. Called during real navigations
   * (goto, reload) but NOT during document.open() (setContent).
   */
  onExecutionContextsCleared(): Effect.Effect<void> {
    const utilityContextIds = this.utilityContextIds;
    const mainContextIds = this.mainContextIds;
    const utilityContexts = this.utilityContexts;
    const executionContexts = this.executionContexts;
    const injectedScriptObjectIds = this.injectedScriptObjectIds;
    return Effect.gen(function* () {
      // Reset all utility context IDs to null
      const utilityRefs = Array.from(utilityContextIds.values());
      yield* Effect.forEach(utilityRefs, (ref) => Ref.set(ref, null), { concurrency: "unbounded" });
      // Reset all main context IDs to null
      const mainRefs = Array.from(mainContextIds.values());
      yield* Effect.forEach(mainRefs, (ref) => Ref.set(ref, null), { concurrency: "unbounded" });
      // Reset all injected script object IDs to null — they become invalid
      // when the execution context is destroyed by navigation.
      const scriptRefs = Array.from(injectedScriptObjectIds.values());
      yield* Effect.forEach(scriptRefs, (ref) => Ref.set(ref, null), { concurrency: "unbounded" });
      // Create new unresolved deferreds for all frames — they will be
      // resolved when Runtime.executionContextCreated fires for the new document.
      // This matches Playwright's _setContext(world, null) pattern.
      for (const frameId of utilityContexts.keys()) {
        utilityContexts.set(frameId, Deferred.makeUnsafe<void>());
      }
      for (const frameId of executionContexts.keys()) {
        executionContexts.set(frameId, Deferred.makeUnsafe<void>());
      }
    });
  }

  /**
   * Handle Runtime.executionContextDestroyed — a specific context is invalidated.
   */
  // fallow-ignore-next-line unused-class-member
  onExecutionContextDestroyed(_frameId: string, _world: "main" | "utility"): void {
    // For now, no-op. executionContextsCleared handles the full reset.
    // Individual context destruction is rare and typically followed by
    // executionContextsCleared.
  }

  /**
   * Clear lifecycle events for a frame, matching Playwright's _onClearLifecycle.
   * Called before document.open() in setContent to reset lifecycle tracking.
   */
  onClearLifecycle(frameId: string): Effect.Effect<void> {
    const state = this.frames.get(frameId);
    if (!state) return Effect.void;
    return SubscriptionRef.update(state, (s) => ({
      ...s,
      lifecycleEvents: new Set<WaitUntil>(["commit"]),
      lastError: Option.none(),
    }));
  }

  /**
   * Register a new frame (main frame or iframe).
   *
   * Called from Page.frameAttached (iframes) or Page.frameNavigated (main frame).
   *
   * @param frameId - The CDP frame identifier
   * @param options - Optional metadata (parentId, name)
   */
  onFrameCreated(
    frameId: string,
    options?: { parentId?: string; name?: string },
  ): Effect.Effect<void> {
    const frames = this.frames;
    const frameMetadata = this.frameMetadata;
    const utilityContextIds = this.utilityContextIds;
    const mainContextIds = this.mainContextIds;
    const injectedScriptObjectIds = this.injectedScriptObjectIds;
    if (frames.has(frameId)) {
      // Frame already exists — update metadata if provided
      if (options) {
        const existing = frameMetadata.get(frameId);
        if (existing) {
          frameMetadata.set(frameId, {
            name: options.name ?? existing.name,
            parentId:
              options.parentId !== undefined ? Option.some(options.parentId) : existing.parentId,
            isDetached: false,
          });
        }
      }
      return Effect.void;
    }
    return Effect.gen(function* () {
      const state = yield* SubscriptionRef.make<NavigationState>({
        navCount: 0,
        loaderId: Option.none(),
        lifecycleEvents: new Set(),
        lastError: Option.none(),
        url: "about:blank",
      });
      frames.set(frameId, state);
      // Initialize utility world context ID ref for this frame
      const ctxIdRef = yield* Ref.make<number | null>(null);
      utilityContextIds.set(frameId, ctxIdRef);
      // Initialize main world context ID ref for this frame
      const mainCtxIdRef = yield* Ref.make<number | null>(null);
      mainContextIds.set(frameId, mainCtxIdRef);
      // Initialize injected script object ID ref for this frame
      const scriptObjRef = yield* Ref.make<string | null>(null);
      injectedScriptObjectIds.set(frameId, scriptObjRef);
      // Store frame metadata
      frameMetadata.set(frameId, {
        name: options?.name ?? "",
        parentId: options?.parentId !== undefined ? Option.some(options.parentId) : Option.none(),
        isDetached: false,
      });
    });
  }

  /**
   * Register an execution context for a frame.
   *
   * Called from CDP `Runtime.executionContextCreated` events.
   * Resolves the pending Deferred so that `waitForExecutionContext` unblocks.
   *
   * For main world: called when `auxData.isDefault === true`
   * For utility world: called when `context.name === UTILITY_WORLD_NAME`
   *
   * Playwright equivalent: `frame._contextCreated(worldName, context)`
   */
  onExecutionContextCreated(
    frameId: string,
    world: "main" | "utility",
    contextId?: number,
  ): Effect.Effect<void> {
    const contexts = world === "utility" ? this.utilityContexts : this.executionContexts;
    const utilityContextIds = this.utilityContextIds;
    const mainContextIds = this.mainContextIds;
    const deferred = contexts.get(frameId);
    if (!deferred) {
      // Frame not tracked — create a new deferred and immediately resolve it
      // This handles the case where Runtime.executionContextCreated fires
      // before Page.frameNavigated (e.g., initial page load)
      return Effect.gen(function* () {
        const d = Deferred.makeUnsafe<void>();
        yield* Deferred.succeed(d, undefined);
        contexts.set(frameId, d);
        if (contextId !== undefined) {
          if (world === "utility") {
            const ref = yield* Ref.make<number | null>(contextId);
            utilityContextIds.set(frameId, ref);
          } else {
            const ref = yield* Ref.make<number | null>(contextId);
            mainContextIds.set(frameId, ref);
          }
        }
      });
    }
    // Always resolve the deferred (idempotent) and always update context ID.
    // Playwright's _contextCreated always calls _setContext(world, context).
    // This is critical for setContent which destroys contexts silently (no Runtime
    // events) — we explicitly call this after recreating the utility world.
    return Effect.gen(function* () {
      if (contextId !== undefined) {
        if (world === "utility") {
          const ref = utilityContextIds.get(frameId);
          if (ref) {
            yield* Ref.set(ref, contextId);
          }
        } else {
          const ref = mainContextIds.get(frameId);
          if (ref) {
            yield* Ref.set(ref, contextId);
          }
        }
      }
      // Resolve deferred AFTER setting contextId — awaiters read contextId upon wakeup.
      if (!Deferred.isDoneUnsafe(deferred)) {
        yield* Deferred.succeed(deferred, undefined);
      }
    });
  }

  onFrameDetached(frameId: string): Effect.Effect<void> {
    const state = this.frames.get(frameId);
    const frameMetadata = this.frameMetadata;
    if (!state) return Effect.void;
    const error: NavigationError = { _tag: "FrameDetached", frameId };
    return Effect.gen(function* () {
      yield* SubscriptionRef.update(state, (s) => ({ ...s, lastError: Option.some(error) }));
      // Mark frame as detached in metadata (don't delete so isDetached() works)
      const metadata = frameMetadata.get(frameId);
      if (metadata) {
        frameMetadata.set(frameId, { ...metadata, isDetached: true });
      }
    });
  }

  /**
   * Handle Page.frameNavigated — update frame URL and name.
   *
   * Also registers frames that weren't seen in frameAttached (e.g., main frame).
   */
  onFrameNavigated(event: {
    frameId: string;
    loaderId: string;
    url?: string;
    name?: string;
    parentId?: string;
  }): Effect.Effect<void> {
    // Only update currentUrl for main frame (parentId undefined)
    if (event.url !== undefined && event.parentId === undefined) {
      this.currentUrl = event.url;
    }
    const state = this.frames.get(event.frameId);
    if (!state) {
      return Effect.void;
    }
    // Update frame metadata
    const metadata = this.frameMetadata.get(event.frameId);
    if (metadata) {
      this.frameMetadata.set(event.frameId, {
        name: event.name ?? metadata.name,
        parentId: event.parentId !== undefined ? Option.some(event.parentId) : metadata.parentId,
        isDetached: false,
      });
    }
    // Don't reset utility context IDs here. Context lifecycle is managed
    // by Runtime events (executionContextsCleared/Created). document.open()
    // triggers Page.documentOpened (onFrameNavigated) but doesn't destroy
    // contexts — resetting here would lose valid context IDs.
    return Effect.gen(function* () {
      yield* SubscriptionRef.update(state, (s) => ({
        navCount: s.navCount + 1,
        loaderId: Option.some(event.loaderId),
        lifecycleEvents: new Set<WaitUntil>(["commit"]),
        lastError: Option.none(),
        url: event.url ?? s.url,
      }));
    });
  }

  onNavigatedWithinDocument(frameId: string, url?: string): Effect.Effect<void> {
    // Only update currentUrl for main frame
    if (url !== undefined && frameId === this.mainFrameId) {
      this.currentUrl = url;
    }
    const state = this.frames.get(frameId);
    if (!state) return Effect.void;
    // Same-document navigations (pushState, replaceState, hash change) do
    // not issue a network request, so there is no Response to look up.
    // Clear loaderId so `waitForNavigation` can distinguish same-document
    // from cross-document navigations and return `Option.none<Response>`.
    return SubscriptionRef.update(state, (s) => ({
      ...s,
      navCount: s.navCount + 1,
      loaderId: Option.none<string>(),
      lifecycleEvents: new Set(["commit", "domcontentloaded", "load"]),
      url: url ?? s.url,
    }));
  }

  onLifecycleReached(frameId: string, name: string): Effect.Effect<void> {
    const state = this.frames.get(frameId);
    if (!state) {
      return Effect.void;
    }
    const mapped = LIFECYCLE_MAP[name];
    if (!mapped) return Effect.void;

    return Effect.gen(function* () {
      yield* SubscriptionRef.update(state, (s) => ({
        ...s,
        lifecycleEvents: new Set([...s.lifecycleEvents, mapped]),
      }));
    });
  }

  // fallow-ignore-next-line unused-class-member
  onNavigationError(frameId: string, error: NavigationError): Effect.Effect<void> {
    const state = this.frames.get(frameId);
    if (!state) return Effect.void;
    return SubscriptionRef.update(state, (s) => ({ ...s, lastError: Option.some(error) }));
  }
}

// ── Core Wait Primitive ────────────────────────────────────────────────────────

/**
 * Wait for a navigation epoch to reach the target state.
 *
 * This is the shared mechanism for all navigation waiting. It handles:
 * - Stream filtering for target epoch + lifecycle events
 * - Terminal error detection (frame detach, crash)
 * - Timeout with proper error construction
 *
 * Callers compute `targetNav` based on their own policy (snapshot-before vs
 * snapshot-after) and delegate to this function.
 */
export const waitForNavEpoch = (
  stateRef: SubscriptionRef.SubscriptionRef<NavigationState>,
  options: {
    readonly method: string;
    readonly targetNav: number;
    readonly lifecycleTarget: string;
    readonly timeout: Duration.Duration;
    readonly urlMatch?: UrlMatch;
  },
): Effect.Effect<NavigationState, CdpError> => {
  const { method, targetNav, lifecycleTarget, timeout, urlMatch } = options;
  const timeoutError = makeTimeoutError(method, timeout);

  const matchesUrl = urlMatch
    ? (state: NavigationState) => matchUrl(urlMatch, state.url)
    : () => true;

  const matchesCriteria = (s: NavigationState) =>
    Option.isSome(s.lastError) ||
    (s.navCount >= targetNav && s.lifecycleEvents.has(lifecycleTarget) && matchesUrl(s));

  return Effect.gen(function* () {
    // Subscribe FIRST to eliminate race condition.
    // This ensures the subscription is active before we check the current state,
    // so no changes can be missed even if they happen during the gap.
    // The subscription will receive the current state upon subscription.
    const subscriptionFiber = yield* Effect.forkChild(
      SubscriptionRef.changes(stateRef).pipe(
        Stream.filter(matchesCriteria),
        Stream.take(1),
        Stream.runHead,
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(timeoutError),
            onSome: (s: NavigationState) => Effect.succeed(s),
          }),
        ),
        Effect.timeout(timeout),
        Effect.mapError(() => timeoutError),
      ),
    );

    // Now check current state - subscription is already active, so no race.
    const currentState = yield* SubscriptionRef.get(stateRef);
    if (matchesCriteria(currentState)) {
      // Current state matches - interrupt subscription and return immediately
      yield* Fiber.interrupt(subscriptionFiber).pipe(Effect.ignore);
      if (Option.isSome(currentState.lastError)) {
        return yield* new CdpErrorClass({
          module: "CdpPage",
          method,
          reason: new NavError({
            url: "frame",
            description: `Navigation failed: ${currentState.lastError.value._tag}`,
          }),
        });
      }
      return currentState;
    }

    // Current state doesn't match - wait for subscription fiber to receive matching state
    const result = yield* Fiber.join(subscriptionFiber).pipe(Effect.mapError(() => timeoutError));
    return result;
  });
};

// ── Policy Wrappers ────────────────────────────────────────────────────────────

/**
 * Wait for navigation to complete on a specific frame (Playwright-style).
 *
 * Policy: snapshots current state, computes target epoch based on idle state,
 * then delegates to `waitForNavEpoch`.
 */
export const waitForNavigationFrame = (
  manager: FrameManager,
  frameId: string,
  waitUntil: WaitUntil,
  options?: { networkDetector?: NetworkIdleProvider; timeout?: Duration.Duration; url?: UrlMatch },
): Effect.Effect<void, CdpError> => {
  const state = manager.getFrameState(frameId);
  if (!state) return Effect.fail(makeFrameNotFoundError("waitForNavigation", frameId));

  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const lifecycleTarget: WaitUntil = waitUntil === "networkidle" ? "load" : waitUntil;

  // Eager snapshot: read synchronously when called (not when yielded).
  // This eliminates the race condition — the snapshot captures the nav epoch
  // before any concurrent Effect (selectOption, click, etc.) can trigger navigation.
  // Works with both Effect.all (like Playwright's Promise.all) and sequential patterns.
  const snapshot = (state as { readonly value: NavigationState }).value;
  const isIdle =
    LIFECYCLE_WAIT_UNTIL.has(lifecycleTarget) && snapshot.lifecycleEvents.has(lifecycleTarget);
  const targetNav = isIdle ? snapshot.navCount + 1 : snapshot.navCount;

  // Return single Effect — targetNav is captured in the closure
  return Effect.gen(function* () {
    yield* waitForNavEpoch(state, {
      method: "waitForNavigation",
      targetNav,
      lifecycleTarget,
      timeout,
      urlMatch: options?.url,
    });

    // For networkidle, compose with network detector AFTER load.
    if (waitUntil === "networkidle" && options?.networkDetector) {
      yield* options.networkDetector.waitForIdleNoInitial().pipe(
        Effect.timeout(timeout),
        Effect.mapError(() => makeTimeoutError("waitForNavigation", timeout)),
      );
    }
  });
};

/**
 * Wait for a specific load state on a frame.
 * If already reached, resolves immediately.
 */
const VALID_STATES: ReadonlySet<string> = new Set([
  "load",
  "domcontentloaded",
  "networkidle",
  "commit",
]);

export const waitForLoadStateFrame = (
  manager: FrameManager,
  frameId: string,
  waitUntil: WaitUntil,
  options?: { networkDetector?: NetworkIdleProvider; timeout?: Duration.Duration },
): Effect.Effect<void, CdpError> => {
  // Validate the state parameter
  if (!VALID_STATES.has(waitUntil)) {
    return Effect.fail(
      new CdpErrorClass({
        module: "CdpPage",
        method: "waitForLoadState",
        reason: new CommandError({
          method: "waitForLoadState",
          description: `state: expected one of (load|domcontentloaded|networkidle|commit)`,
        }),
      }),
    );
  }

  const state = manager.getFrameState(frameId);
  if (!state) return Effect.fail(makeFrameNotFoundError("waitForLoadState", frameId));

  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const timeoutError = makeTimeoutError("waitForLoadState", timeout);

  if (waitUntil === "networkidle" && options?.networkDetector) {
    return options.networkDetector.waitForIdleNoInitial().pipe(
      Effect.timeout(timeout),
      Effect.mapError(() => timeoutError),
    );
  }

  return SubscriptionRef.changes(state).pipe(
    Stream.filter((s) => s.lifecycleEvents.has(waitUntil)),
    Stream.take(1),
    Stream.runDrain,
    Effect.timeout(timeout),
    Effect.mapError(() => timeoutError),
  );
};

// ── Factory ────────────────────────────────────────────────────────────────────

export const makeFrameManager = (
  mainFrameId: string,
  initialUrl: string = "about:blank",
): Effect.Effect<FrameManager> =>
  Effect.gen(function* () {
    const manager = new FrameManager();
    manager.setUrl(initialUrl);
    // Set main frame ID
    manager["mainFrameId"] = mainFrameId;
    yield* manager.onFrameCreated(mainFrameId);
    // Pre-create already-resolved deferreds for the initial about:blank page.
    // The initial page already has both main and utility contexts when we attach.
    // They will be reset on the first navigation.
    const initialMainDeferred = Deferred.makeUnsafe<void>();
    yield* Deferred.succeed(initialMainDeferred, undefined);
    manager["executionContexts"].set(mainFrameId, initialMainDeferred);

    const initialUtilityDeferred = Deferred.makeUnsafe<void>();
    yield* Deferred.succeed(initialUtilityDeferred, undefined);
    manager["utilityContexts"].set(mainFrameId, initialUtilityDeferred);

    return manager;
  });
