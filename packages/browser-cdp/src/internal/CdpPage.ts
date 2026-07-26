/**
 * Effect-based CDP Page implementation for browser automation.
 * Uses Effect v4 primitives for resource safety and type-safe async operations.
 */

import type { Scope } from "effect";
import type { Input as DurationInput } from "effect/Duration";
import type { HttpClient } from "effect/unstable/http";

import type { CdpError } from "../CdpError.js";
import type { CdpContextHandle } from "../CdpTypes.js";
import type { CdpConnectionService } from "./CdpConnection.js";
import type { CdpMessage } from "./CdpSchema.js";
import type { CdpPageError } from "./Page/PageErrors.js";
import type { WaitUntil, UrlMatch } from "./types.js";

import {
  Context,
  Duration,
  Effect,
  Option,
  PubSub,
  Layer,
  Match,
  Predicate,
  Ref,
  Stream,
} from "effect";

import { CdpError as CdpErrorClass, EvaluationError, NavigationError } from "../CdpError.js";
import { CdpConnection } from "./CdpConnection.js";
import { makePageHttpClient } from "./CdpHttpClient.js";
import { addScriptTag, type AddScriptTagOptions } from "./Page/AddScriptTag.js";
import { addStyleTag, type AddStyleTagOptions } from "./Page/AddStyleTag.js";
import { attachToTarget } from "./Page/AttachToTarget.js";
import {
  GLOBAL_BINDING_NAME,
  handleBindingCall,
  registerBinding,
  type PageBinding,
} from "./Page/Bindings.js";
import { checkElement, uncheckElement, setCheckedElement } from "./Page/Check.js";
import { clickElement, type ClickModifier, type MouseButton } from "./Page/Click.js";
import {
  addCookies,
  clearCookies,
  type CookieData,
  type CdpCookie,
  getCookies,
} from "./Page/Cookies.js";
import { dblclickElement } from "./Page/Dblclick.js";
import { makeDialogFromCdp, onDialogStream, type CdpDialog } from "./Page/Dialogs.js";
import { dispatchEvent } from "./Page/DispatchEvent.js";
import {
  configureDownloads,
  handleDownloadProgress,
  makeDownloadFromCdp,
  onDownloadStream,
  type CdpDownload,
} from "./Page/Downloads.js";
import { dragAndDrop } from "./Page/DragAndDrop.js";
import {
  getElementAttribute,
  innerHtmlElement,
  innerTextElement,
  inputValueElement,
  textContentElement,
} from "./Page/ElementContent.js";
import {
  isCheckedElement,
  isDisabledElement,
  isEditableElement,
  isEnabledElement,
} from "./Page/ElementState.js";
import { emulateMedia, type EmulateMediaOptions } from "./Page/EmulateMedia.js";
import { ensureSession } from "./Page/EnsureSession.js";
import { $evalElement, $$evalElements } from "./Page/EvalOnSelector.js";
import { evaluatePage } from "./Page/Evaluate.js";
import { evaluateHandlePage, type CdpHandle } from "./Page/EvaluateHandle.js";
import { setExtraHTTPHeaders } from "./Page/ExtraHttpHeaders.js";
import { fetchPage, type FetchOptions, type FetchResponse } from "./Page/Fetch.js";
import { fillElement } from "./Page/Fill.js";
import { focusElement, blurElement } from "./Page/Focus.js";
import { makeCdpFrame, makeMainFrame, type FrameContext } from "./Page/Frame.js";
import { makeFrameEventHubs } from "./Page/FrameEvents.js";
import {
  makeCdpFrameLocator,
  resolveFrameIdFromSelector,
  type FrameLocatorCtx,
  type CdpFrameLocator,
} from "./Page/FrameLocator.js";
import {
  makeFrameManager,
  waitForLoadStateFrame,
  waitForNavEpoch,
  snapshotTargetNav,
  makeTimeoutError,
  UTILITY_WORLD_NAME,
  type NetworkIdleProvider,
} from "./Page/FrameManager.js";
import {
  frameSelectorMatchesName,
  frameSelectorMatchesUrl,
  type FrameSelector,
} from "./Page/FrameSelector.js";
import { gotoPage, type Response } from "./Page/Goto.js";
import { goBackPage, goForwardPage } from "./Page/HistoryNavigation.js";
import { hoverElement } from "./Page/Hover.js";
import { selectOptionViaInjectedScript } from "./Page/InjectedScript.js";
import {
  makeCdpLocator,
  type ByRoleOptions,
  type CdpLocator,
  type LocatorOptions,
  type TextMatchOptions,
} from "./Page/Locator.js";
import {
  makeMouseState,
  mouseClick,
  mouseDown,
  mouseMove,
  mouseUp,
  mouseWheel,
  type MouseClickOptions,
  type MouseMoveOptions,
  type MouseToggleOptions,
} from "./Page/Mouse.js";
import {
  makeNetworkEventHubs,
  makeNetworkEventProcessor,
  type FrameFactory,
  type NetworkRequest,
  type NetworkResponse,
  type NetworkRequestFinished,
  type NetworkRequestFailed,
} from "./Page/NetworkEvents.js";
import { makeNetworkResponseTracker } from "./Page/NetworkResponseTracker.js";
import { pageTitle, pageContent } from "./Page/PageContent.js";
import { type PageState, type DownloadTracker } from "./Page/PageState.js";
import { generatePdf, type PdfOptions } from "./Page/Pdf.js";
import {
  pressKey,
  keyboardDown,
  keyboardUp,
  keyboardPress,
  keyboardType,
  insertText,
} from "./Page/Press.js";
import { reloadPage } from "./Page/Reload.js";
import { makeCdpRequestClient } from "./Page/Request.js";
import { makeResponse } from "./Page/Response.js";
import {
  makeRouteManager,
  type RouteUrlMatch,
  type RouteHandlerCallback,
  type RouteOptions,
} from "./Page/Route.js";
import {
  makeRouteWebSocketManager,
  type CdpWebSocketRouteHandlerCallback,
  WS_BINDING_NAME,
} from "./Page/RouteWebSocket.js";
import { captureScreenshot, type ScreenshotOptions } from "./Page/Screenshot.js";
import { setContentPage } from "./Page/SetContent.js";
import { setInputFiles, type InputFile } from "./Page/SetInputFiles.js";
import { getViewportSize, setViewportSize, type ViewportSize } from "./Page/SetViewportSize.js";
import { clearStorage, getStorage, setStorageItem } from "./Page/Storage.js";
import { tapElement } from "./Page/Tap.js";
import { touchscreenTap } from "./Page/Touchscreen.js";
import { typeIntoElement } from "./Page/Type.js";
import { isHiddenElement, isVisibleElement } from "./Page/Visibility.js";
import { waitForFunctionPage } from "./Page/WaitForFunction.js";
import {
  waitForRequestPage,
  waitForResponsePage,
  waitForRequestFailed,
  type RequestInfo,
  type ResponseInfo,
  type RequestFailedInfo,
  type RequestUrlOrPredicate,
  type ResponseUrlOrPredicate,
  type RequestFailedUrlOrPredicate,
} from "./Page/WaitForNetworkEvent.js";
import {
  makeNetworkIdleDetector,
  isNetworkCompletionEvent,
  getRequestId as getRequestIdFromParams,
  NetworkEvent,
} from "./Page/WaitForNetworkIdle.js";
import { waitForSelectorElement, type WaitForSelectorState } from "./Page/WaitForSelector.js";
import { sleep } from "./sleep.js";

export type { ScreenshotOptions } from "./Page/Screenshot.js";
export type { PdfOptions } from "./Page/Pdf.js";
export type { FetchOptions } from "./Page/Fetch.js";
export { FetchResponse } from "./Page/Fetch.js";
export type { ViewportSize } from "./Page/SetViewportSize.js";
export type { CookieData, CdpCookie } from "./Page/Cookies.js";
export type {
  UserAgentBrandVersion,
  UserAgentMetadata,
  UserAgentOverride,
} from "./Page/UserAgent.js";
export type { Geolocation } from "./Page/Geolocation.js";
export type { GrantPermissionsOptions, PermissionName } from "./Page/Permissions.js";
export type { OriginState, StorageState } from "./Page/StorageState.js";
export type {
  RequestInfo,
  ResponseInfo,
  RequestFailedInfo,
  RequestUrlOrPredicate,
  ResponseUrlOrPredicate,
  RequestFailedUrlOrPredicate,
} from "./Page/WaitForNetworkEvent.js";
export type {
  RouteUrlMatch,
  RouteHandlerCallback,
  RouteOptions,
  RouteHandle,
  InterceptedRequest,
  ContinueOverrides,
  FulfillResponse,
} from "./Page/Route.js";
// fallow-ignore-next-line unused-type
export type { CdpWebSocketRoute } from "./Page/RouteWebSocket.js";
// fallow-ignore-next-line unused-type
export type { CdpWebSocketServerRoute } from "./Page/RouteWebSocket.js";
export type { CdpWebSocketRouteHandlerCallback } from "./Page/RouteWebSocket.js";
// fallow-ignore-next-line unused-type
export type { CdpWebSocketMessageHandler } from "./Page/RouteWebSocket.js";
// fallow-ignore-next-line unused-type
export type { CdpWebSocketCloseHandler } from "./Page/RouteWebSocket.js";
export type { Response } from "./Page/Goto.js";
export type {
  CdpLocator,
  ByRoleOptions,
  LocatorOptions,
  TextMatchOptions,
  ClickOptions,
} from "./Page/Locator.js";
export type {
  NetworkRequest,
  NetworkResponse,
  NetworkRequestFinished,
  NetworkRequestFailed,
} from "./Page/NetworkEvents.js";

// ── Console Message Type ─────────────────────────────────────────────────────

/**
 * A console message emitted by the page via `console.log`, `console.error`, etc.
 *
 * Mirrors Playwright's `ConsoleMessage` — provides the type and text content.
 * The `type` corresponds to the console method used (log, warn, error, etc.).
 */
export interface ConsoleMessage {
  /** The console method type (log, warn, error, debug, info, etc.) */
  readonly type: string;
  /** The text content of the console message */
  readonly text: string;
}

/**
 * A frame (main or iframe) within a page.
 *
 * Provides frame-level operations and metadata. Mirrors Playwright's `Frame` class
 * for `browser-cdp`.
 */
export interface CdpFrame {
  /** The CDP frame identifier for this frame. */
  readonly frameId: string;

  /**
   * The frame's current URL.
   *
   * Resolves synchronously from FrameManager's cached state.
   */
  readonly url: Effect.Effect<string, never, never>;

  /**
   * The frame's name (iframe name attribute or empty for main frame).
   */
  readonly name: Effect.Effect<string, never, never>;

  /**
   * Whether this frame has been detached (iframe removed from DOM).
   */
  readonly isDetached: Effect.Effect<boolean, never, never>;

  /**
   * The parent frame, or `Option.none()` for the main frame.
   */
  readonly parentFrame: Effect.Effect<Option.Option<CdpFrame>, CdpError>;

  /**
   * Child frames (iframes nested within this frame).
   */
  readonly childFrames: Effect.Effect<ReadonlyArray<CdpFrame>, CdpError>;

  /**
   * The frame's full HTML content.
   *
   * Returns the serialized HTML including doctype (if present) and
   * the document element's outerHTML.
   *
   * @returns Effect that resolves to the frame's HTML content
   */
  readonly content: Effect.Effect<string, CdpError>;

  /**
   * Executes a JavaScript function or expression in the frame context.
   *
   * @param pageFunction - A function to execute, or a string expression
   * @param arg - Optional argument to pass to the function
   * @returns The result of the evaluation
   */
  readonly evaluate: <T>(
    pageFunction: EvaluateFn<T>,
    arg?: unknown,
  ) => Effect.Effect<Awaited<T>, CdpError>;

  /**
   * Waits for a navigation within this frame.
   *
   * Uses the eager snapshot pattern — captures the navigation epoch at call time,
   * enabling the Playwright-style handle pattern:
   * ```ts
   * const nav = frame.waitForNavigation();
   * yield* frame.evaluate(() => window.location.href = url);
   * const responseOption = yield* nav;
   * ```
   *
   * Resolves to `Option<Response>`:
   * - `Option.some(Response)` for cross-frame navigations that have a
   *   network response (response status, url, headers available).
   * - `Option.none()` for same-document navigations (pushState,
   *   replaceState, hash changes), `waitUntil: "commit"`, or when the
   *   response didn't arrive within the timeout.
   *
   * @param options - Navigation options
   */
  readonly waitForNavigation: (options?: {
    waitUntil?: WaitUntil;
    timeout?: DurationInput;
    url?: UrlMatch;
  }) => Effect.Effect<Option.Option<Response>, CdpError>;

  /**
   * Waits for the given load state to be reached.
   *
   * If the load state has already been reached, resolves immediately.
   * Otherwise waits until the specified lifecycle event fires.
   *
   * @param state - Load state to wait for (default: "load")
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly waitForLoadState: (
    state?: WaitUntil,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Waits for the frame to navigate to a URL matching the given pattern.
   *
   * This is a convenience method that wraps `waitForNavigation` with a required
   * URL pattern. Useful for waiting for specific URL changes within a frame.
   *
   * @param url - URL pattern to wait for (string, glob, RegExp, or predicate)
   * @param options - Options
   *   - `waitUntil`: Load state to wait for (default: "load")
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns An Effect that resolves when the URL matches
   */
  readonly waitForURL: (
    url: UrlMatch,
    options?: { waitUntil?: WaitUntil; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Navigates the frame to a URL and waits for the specified load strategy.
   *
   * Uses CDP's `Page.navigate` with `frameId` to target a specific frame.
   * This is the frame-level equivalent of `page.goto()`.
   *
   * @param url - The URL to navigate to
   * @param options - Navigation options
   *   - `waitUntil`: When to consider navigation complete (default: "load")
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   *   - `referer`: Referer header to send with the request (optional)
   * @returns `Option<Response>` - Some for HTTP navigations, None for internal URLs
   */
  readonly goto: (
    url: string,
    options?: { waitUntil?: WaitUntil; timeout?: DurationInput; referer?: string },
  ) => Effect.Effect<Option.Option<Response>, CdpError>;

  /**
   * Waits for a function to return a truthy value in the frame context.
   *
   * Polls the function until it returns a truthy value or the timeout is reached.
   * If the frame is detached during polling, throws a "Frame was detached" error.
   *
   * @param pageFunction - A function to poll, or a string expression
   * @param arg - Optional argument to pass to the function
   * @param options - Polling options
   *   - `polling`: Interval in ms or 'raf' for requestAnimationFrame (default: 100)
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns The truthy value returned by the function
   */
  readonly waitForFunction: <T, Arg = void>(
    pageFunction: EvaluateFn<T>,
    arg?: Arg,
    options?: {
      timeout?: DurationInput;
      polling?: number | "raf";
    },
  ) => Effect.Effect<Awaited<T>, CdpError>;

  /**
   * Waits for the selector to resolve to one or more elements in this
   * frame's main world.
   *
   * Mirrors `page.waitForSelector` but operates on the frame's execution
   * context. Polls the selector until the requested state is reached or
   * the timeout expires.
   *
   * @param selector - CSS selector to wait for
   * @param options - Options
   *   - `state`: Element state (default: "visible")
   *   - `timeout`: Maximum wait time (default: page default)
   */
  readonly waitForSelector: (
    selector: string,
    options?: {
      state?: "attached" | "visible" | "hidden" | "detached";
      timeout?: DurationInput;
    },
  ) => Effect.Effect<void, CdpError>;

  // ── Phase P3 additions: frame parity methods ───────────────────────────────────

  /**
   * The page that owns this frame.
   *
   * Mirrors Playwright's `frame.page()`. Returns the parent
   * `CdpPageService`. For the main frame, this is the same page that
   * created the frame; for child frames (iframes), it is the same page
   * that owns the iframe.
   */
  readonly page: Effect.Effect<CdpPageService, never>;

  /**
   * The frame's `<title>` element.
   *
   * Mirrors Playwright's `frame.title()`. Convenience wrapper around
   * `evaluate(() => document.title)`.
   */
  readonly title: Effect.Effect<string, CdpError>;

  /**
   * Evaluates a JavaScript function or expression and returns a
   * `CdpHandle` referencing the result.
   *
   * Mirrors Playwright's `frame.evaluateHandle`. See
   * {@link CdpPageService.evaluateHandle} for full semantics.
   */
  readonly evaluateHandle: <T>(
    pageFunction: EvaluateFn<T>,
    arg?: unknown,
  ) => Effect.Effect<CdpHandle, CdpError>;

  // ── Element actions ──────────────────────────────────────────────────────────

  /** Clicks an element matching the selector inside the frame. */
  readonly click: (
    selector: string,
    options?: {
      button?: MouseButton;
      modifiers?: ReadonlyArray<ClickModifier>;
      clickCount?: number;
      position?: { readonly x: number; readonly y: number };
      force?: boolean;
      trial?: boolean;
      timeout?: DurationInput;
    },
  ) => Effect.Effect<void, CdpError>;

  /** Double-clicks an element matching the selector inside the frame. */
  readonly dblclick: (
    selector: string,
    options?: { trial?: boolean; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Taps an element matching the selector inside the frame. */
  readonly tap: (
    selector: string,
    options?: {
      position?: { readonly x: number; readonly y: number };
      force?: boolean;
      trial?: boolean;
      timeout?: DurationInput;
    },
  ) => Effect.Effect<void, CdpError>;

  /** Hovers over an element matching the selector inside the frame. */
  readonly hover: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Fills an input element matching the selector inside the frame. */
  readonly fill: (
    selector: string,
    value: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Focuses an element matching the selector inside the frame. */
  readonly focus: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Blurs (un-focuses) an element matching the selector inside the frame. */
  readonly blur: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Types text into an element matching the selector inside the frame. */
  readonly type: (
    selector: string,
    text: string,
    options?: { delay?: number; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Presses a key on an element matching the selector inside the frame. */
  readonly press: (
    selector: string,
    key: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Checks a checkbox/radio element matching the selector inside the frame. */
  readonly check: (
    selector: string,
    options?: { trial?: boolean; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Unchecks a checkbox element matching the selector inside the frame. */
  readonly uncheck: (
    selector: string,
    options?: { trial?: boolean; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Sets the checked state of a checkbox/radio element inside the frame. */
  readonly setChecked: (
    selector: string,
    checked: boolean,
    options?: { trial?: boolean; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Selects options in a `<select>` element inside the frame. */
  readonly selectOption: <T extends string | { value?: string; label?: string; index?: number }>(
    selector: string,
    values: T | T[] | null,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<readonly string[], CdpError>;

  /** Sets files on a file input element inside the frame. */
  readonly setInputFiles: (
    selector: string,
    files: ReadonlyArray<InputFile>,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Drags the source element to the target element inside the frame. */
  readonly dragAndDrop: (
    source: string,
    target: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /** Dispatches a synthetic DOM event on the resolved element inside the frame. */
  readonly dispatchEvent: (
    selector: string,
    type: string,
    eventInit?: Record<string, unknown>,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  // ── Element queries ─────────────────────────────────────────────────────────

  /**
   * Gets the text content of an element matching the selector inside the frame.
   *
   * Mirrors Playwright's `frame.textContent(selector)`. Returns `Option.none()`
   * when the element is not found.
   */
  readonly textContent: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Option.Option<string>, CdpError>;

  /**
   * Gets the visible text content of an element matching the selector.
   *
   * Mirrors Playwright's `frame.innerText(selector)`. Returns `Option.none()`
   * when the element is not found.
   */
  readonly innerText: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Option.Option<string>, CdpError>;

  /**
   * Gets the HTML content inside an element matching the selector.
   *
   * Mirrors Playwright's `frame.innerHTML(selector)`. Returns `Option.none()`
   * when the element is not found.
   */
  readonly innerHTML: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Option.Option<string>, CdpError>;

  /**
   * Gets the value of an attribute on an element matching the selector.
   *
   * Mirrors Playwright's `frame.getAttribute(selector, name)`. Returns
   * `Option.none()` when the element or attribute is not found.
   */
  readonly getAttribute: (
    selector: string,
    name: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Option.Option<string>, CdpError>;

  /**
   * Gets the value of an input/textarea/select element matching the selector.
   *
   * Mirrors Playwright's `frame.inputValue(selector)`. Throws if the element
   * is not found or is not an input/textarea/select element.
   */
  readonly inputValue: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<string, CdpError>;

  /** Checks if an element (checkbox/radio) is checked inside the frame. */
  readonly isChecked: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<boolean, CdpError>;

  /** Checks if an element is disabled inside the frame. */
  readonly isDisabled: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<boolean, CdpError>;

  /** Checks if an element is editable (enabled and not readonly) inside the frame. */
  readonly isEditable: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<boolean, CdpError>;

  /** Checks if an element is enabled inside the frame. */
  readonly isEnabled: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<boolean, CdpError>;

  /** Checks if an element is hidden inside the frame. */
  readonly isHidden: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<boolean, CdpError>;

  /** Checks if an element is visible inside the frame. */
  readonly isVisible: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<boolean, CdpError>;

  // ── Locator helpers ────────────────────────────────────────────────────────

  /**
   * Returns a `CdpLocator` scoped to this frame's document.
   *
   * Mirrors Playwright's `frame.locator(selector)`. The returned locator's
   * actions evaluate in the frame's main world (same as `page.locator`).
   */
  readonly locator: (selector: string, options?: LocatorOptions) => CdpLocator;

  /** Mirrors Playwright's `frame.getByRole`. */
  readonly getByRole: (role: string, options?: ByRoleOptions) => CdpLocator;

  /** Mirrors Playwright's `frame.getByText`. */
  readonly getByText: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /** Mirrors Playwright's `frame.getByLabel`. */
  readonly getByLabel: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /** Mirrors Playwright's `frame.getByTestId`. */
  readonly getByTestId: (testId: string | RegExp) => CdpLocator;

  /** Mirrors Playwright's `frame.getByPlaceholder`. */
  readonly getByPlaceholder: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /** Mirrors Playwright's `frame.getByAltText`. */
  readonly getByAltText: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /** Mirrors Playwright's `frame.getByTitle`. */
  readonly getByTitle: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /**
   * Returns a `CdpFrameLocator` for chained iframe traversal.
   *
   * Mirrors Playwright's `frame.frameLocator(selector)`. The selector
   * resolves an `<iframe>` element in this frame's document; the
   * returned FrameLocator's `.locator(inner)` chains into that
   * iframe's content frame.
   */
  readonly frameLocator: (selector: string) => CdpFrameLocator;

  // ── Content / scripts ──────────────────────────────────────────────────────

  /**
   * Replaces the frame's HTML content and waits for the load state.
   *
   * Mirrors Playwright's `frame.setContent(html, options?)`.
   */
  readonly setContent: (
    html: string,
    options?: { waitUntil?: WaitUntil; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Injects a `<script>` element into the frame's document.
   *
   * Mirrors Playwright's `frame.addScriptTag(options)`. Same semantics
   * as `page.addScriptTag` but evaluated in the frame's document.
   */
  readonly addScriptTag: (options: AddScriptTagOptions) => Effect.Effect<void, CdpError>;

  /**
   * Injects a `<style>` (or `<link rel="stylesheet">`) element into the frame's document.
   *
   * Mirrors Playwright's `frame.addStyleTag(options)`. Same semantics
   * as `page.addStyleTag` but evaluated in the frame's document.
   */
  readonly addStyleTag: (options: AddStyleTagOptions) => Effect.Effect<void, CdpError>;

  /** Alias for the page's $eval: evaluates a function on the first element matching the selector. */
  readonly $eval: <T, Arg = unknown>(
    selector: string,
    pageFunction: (element: Element, arg: Arg) => T,
    arg?: Arg,
  ) => Effect.Effect<Awaited<T>, CdpError>;

  /** Alias for the page's $$eval: evaluates a function on all elements matching the selector. */
  readonly $$eval: <T, Arg = unknown>(
    selector: string,
    pageFunction: (elements: ReadonlyArray<Element>, arg: Arg) => T,
    arg?: Arg,
  ) => Effect.Effect<Awaited<T>, CdpError>;
}

/**
 * A function or string to evaluate in the browser context.
 * - String expressions are evaluated directly.
 * - Functions are serialized and invoked with the provided arguments.
 */
export type EvaluateFn<T> = string | ((...args: any[]) => T);

/**
 * Service interface for controlling a single browser page via CDP.
 *
 * Provides browser automation methods that all return `Effect.Effect`:
 * - **Navigation:** {@link goto}, {@link waitForNavigation}, {@link waitForURL}, {@link waitForSelector}, {@link waitForTimeout}
 * - **Interaction:** {@link click}, {@link fill}, {@link type}, {@link press}
 * - **Evaluation:** {@link evaluate}, {@link title}, {@link content}
 * - **Network:** {@link fetch}, {@link httpClient}, {@link request}
 * - **Queries:** {@link innerText}, {@link innerHTML}, {@link getAttribute}
 * - **Waiting:** {@link waitForRequest}, {@link waitForResponse}
 * - **Capture:** {@link screenshot}, {@link pdf}
 */
export interface CdpPageService {
  /** The CDP target identifier for this page. */
  readonly targetId: string;

  /**
   * The page's title.
   *
   * Convenience wrapper around `evaluate(() => document.title)`.
   */
  readonly title: Effect.Effect<string, CdpError>;

  /**
   * The page's full HTML content.
   *
   * Convenience wrapper around `evaluate(() => document.documentElement.outerHTML)`.
   */
  readonly content: Effect.Effect<string, CdpError>;

  /**
   * The page's current URL.
   *
   * Resolves synchronously from CDP event cache
   * (`Page.frameNavigated`, `Page.navigatedWithinDocument`)
   * — no evaluate roundtrip.
   *
   * ```typescript
   * const currentUrl = yield* page.url
   * ```
   */
  readonly url: Effect.Effect<string, never, never>;

  /**
   * The main frame of the page.
   *
   * Every page has at least one frame — the main frame.
   * Use this to access frame-level operations like `frame.evaluate()`.
   */
  readonly mainFrame: Effect.Effect<CdpFrame, CdpError>;

  /**
   * All frames in the page, including the main frame and iframes.
   *
   * Returns an array of frames, where `frames[0]` is the main frame.
   * Frames are listed in the order they were attached.
   *
   * ```typescript
   * const frames = yield* page.frames;
   * expect(frames.length).toBe(2); // main frame + 1 iframe
   * ```
   */
  readonly frames: Effect.Effect<ReadonlyArray<CdpFrame>, CdpError>;

  /**
   * Returns a frame matching the given selector.
   *
   * Mirrors Playwright's `page.frame(selector)`. Accepts three selector
   * forms:
   *
   * - **string**: CSS selector matching an `<iframe>` element in the page's
   *   main frame. The iframe's content frame is returned.
   * - **`{ name }`**: find a frame by its `name` attribute.
   * - **`{ url }`**: find a frame by its URL (glob or RegExp).
   *
   * Returns `Option.none()` if no frame matches. When multiple object-form
   * selectors match, the first frame (in attachment order) wins.
   *
   * > **Asymmetry with `frameLocator()`:** `frame()` is **eager** — it
   *   resolves the frame immediately and returns it wrapped in `Option` so
   *   the caller handles the not-found case. For action-time resolution
   *   that auto-waits, use {@link frameLocator} instead, which is lazy
   *   and returns a builder.
   *
   * @example
   * ```typescript
   * const main = yield* page.frame("#main-iframe");
   * if (Option.isSome(main)) {
   *   yield* main.value.title();
   * }
   * const named = yield* page.frame({ name: "sidebar" });
   * const byUrl = yield* page.frame({ url: "https://example.com/ad.html" });
   * ```
   *
   * @see {@link frameLocator} for the lazy alternative.
   */
  readonly frame: (selector: FrameSelector) => Effect.Effect<Option.Option<CdpFrame>, CdpError>;

  /**
   * Returns a frame locator for the given CSS selector. The locator is
   * lazy — the iframe is resolved at action time, not at construction
   * time. The returned `CdpFrameLocator` can chain `.locator(inner)` to
   * produce a `CdpLocator` scoped to the iframe's content frame.
   *
   * Mirrors Playwright's `page.frameLocator(selector)`.
   *
   * > **Asymmetry with `frame()`:** `frameLocator()` is **lazy** — it
   *   does not run a CDP command and does not return an `Option`. Instead
   *   it returns a builder (`CdpFrameLocator`) that resolves the iframe
   *   at action time (e.g. when `.click()` is called on a chained
   *   locator). Use this when you want auto-waiting and don't want to
   *   handle the not-found case at the call site.
   * >
   *   For an eager single-frame lookup with explicit not-found handling,
   *   use {@link frame} instead.
   *
   * @example
   * ```typescript
   * const button = page.frameLocator("#my-iframe").locator("button");
   * yield* button.click();
   * ```
   *
   * @see {@link frame} for the eager alternative.
   */
  readonly frameLocator: (selector: string) => CdpFrameLocator;

  /**
   * Returns the browser context this page belongs to.
   *
   * Effect-idiomatic equivalent of Playwright's `page.context()` (which
   * is a sync getter). Use this when you need to operate on the
   * context level — cookies, storage state, user agent, geolocation,
   * permissions — without plumbing the context through your function
   * signatures.
   *
   * ```typescript
   * const ctx = yield* page.context;
   * const state = yield* ctx.storageState();
   * ```
   *
   * Mirrors the `context` field on Playwright's `Page`. The returned
   * handle is the same one you would receive from `connection.withContext`
   * or `connection.withConnection` — modifying it (e.g., setting
   * geolocation, adding cookies) affects all pages in the context.
   *
   * @see {@link CdpContextHandle} for all available methods.
   */
  readonly context: Effect.Effect<CdpContextHandle, CdpError>;

  /**
   * Waits for a navigation to complete.
   *
   * Works with both sequential and concurrent patterns (like Playwright):
   *
   * ```typescript
   * // Sequential — call, trigger, await (like Playwright)
   * const nav = page.waitForNavigation();
   * yield* page.click("a.link");
   * const responseOption = yield* nav;
   * if (Option.isSome(responseOption)) {
   *   console.log(responseOption.value.status);
   * }
   *
   * // Concurrent — Effect.all (like Playwright's Promise.all)
   * yield* Effect.all(
   *   [page.waitForNavigation(), page.click("a.link")],
   *   { concurrency: "unbounded" },
   * );
   * ```
   *
   * Resolves to `Option<Response>`:
   * - `Option.some(Response)` for HTTP navigations that have a network
   *   response (the response status, url, and headers are available).
   * - `Option.none()` for same-document navigations (pushState,
   *   replaceState, hash changes — no network request fires),
   *   `waitUntil: "commit"` (too early — request hasn't been issued),
   *   or when the response didn't arrive within the timeout.
   *
   * @param options - Navigation options
   *   - `waitUntil`: When to consider navigation complete
   *     - `"load"` - Wait for the `load` event (default)
   *     - `"domcontentloaded"` - Wait for the `DOMContentLoaded` event
   *     - `"networkidle"` - Wait for no network activity
   *     - `"commit"` - Resolve when navigation starts (no response available)
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   *   - `url`: URL matcher (glob, RegExp, or predicate)
   */
  readonly waitForNavigation: (options?: {
    waitUntil?: WaitUntil;
    timeout?: DurationInput;
    url?: UrlMatch;
  }) => Effect.Effect<Option.Option<Response>, CdpError>;

  /**
   * Waits for the page to navigate to a URL matching the given pattern.
   *
   * Supports glob patterns, RegExp, or predicate functions.
   * Works for both cross-document navigations and same-document navigations
   * (pushState, replaceState, hash changes).
   *
   * Uses the prepare-then-await pattern: call first to subscribe to events
   * synchronously, then trigger the action, then await.
   *
   * @param url - URL pattern (glob string, RegExp, or predicate)
   * @param options - Options
   *   - `waitUntil`: Load state to wait for (default: "load")
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns An Effect that resolves when the URL matches
   */
  readonly waitForURL: (
    url: UrlMatch,
    options?: { waitUntil?: WaitUntil; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Waits for the page to reach the specified load state.
   *
   * For `load` and `domcontentloaded`, uses `SubscriptionRef`-backed lifecycle
   * state tracking powered by `Page.lifecycleEvent`. If the state was already
   * reached, resolves immediately.
   *
   * For `networkidle`, delegates to the network idle detector.
   *
   * @param state - The state to wait for
   *   - `"load"` - Wait for the load event (default)
   *   - `"domcontentloaded"` - Wait for the DOMContentLoaded event
   *   - `"networkidle"` - Wait for no network activity
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly waitForLoadState: (
    state?: WaitUntil,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Navigates the page to a URL and waits for the specified load strategy.
   *
   * If `waitUntil` is `"networkidle"`, the Network domain is enabled first
   * so that request tracking can begin before navigation starts.
   *
   * Returns `Option.some(Response)` for HTTP navigations with status, url, headers.
   * Returns `Option.none()` for browser-internal URLs (about:, data:, javascript:, etc.)
   * which have no network response.
   *
   * @param url - The URL to navigate to
   * @param options - Navigation options
   *   - `waitUntil`: When to consider navigation complete
   *     - `"load"` - Wait for the `load` event
   *     - `"domcontentloaded"` - Wait for the `DOMContentLoaded` event
   *     - `"networkidle"` - Wait for no network activity
   *     - `"commit"` - Resolve immediately after navigation starts
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   *   - `referer`: Referer header to send with the request (optional)
   * @returns `Option.Response>` - Some for HTTP navigations, None for internal URLs
   */
  readonly goto: (
    url: string,
    options?: { waitUntil?: WaitUntil; timeout?: DurationInput; referer?: string },
  ) => Effect.Effect<Option.Option<Response>, CdpError>;

  /**
   * Reloads the page and waits for the specified load strategy.
   *
   * @param options - Navigation options
   *   - `waitUntil`: When to consider navigation complete
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns Response object for the main document, or Option.none() for internal URLs
   */
  readonly reload: (options?: {
    waitUntil?: WaitUntil;
    timeout?: DurationInput;
  }) => Effect.Effect<Option.Option<Response>, CdpError>;

  /**
   * Sets the HTML content of the page.
   *
   * @param html - HTML content to set
   * @param options - Navigation options
   *   - `waitUntil`: When to consider navigation complete (default: "load")
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly setContent: (
    html: string,
    options?: { waitUntil?: WaitUntil; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Navigates to the previous page in browser history.
   *
   * Does nothing if there is no previous page.
   *
   * @param options - Navigation options
   *   - `waitUntil`: When to consider navigation complete
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly goBack: (options?: {
    waitUntil?: WaitUntil;
    timeout?: DurationInput;
  }) => Effect.Effect<void, CdpError>;

  /**
   * Navigates to the next page in browser history.
   *
   * Does nothing if there is no next page.
   *
   * @param options - Navigation options
   *   - `waitUntil`: When to consider navigation complete
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly goForward: (options?: {
    waitUntil?: WaitUntil;
    timeout?: DurationInput;
  }) => Effect.Effect<void, CdpError>;

  /**
   * Executes a JavaScript function or expression in the browser context
   * and returns the result.
   *
   * The function is serialized into a self-evaluating expression that
   * catches errors and returns them as structured data.
   *
   * @param pageFunction - A function to execute, or a string expression
   * @param args - Arguments to pass to the function
   * @returns The result of the evaluation
   */
  readonly evaluate: <T>(
    pageFunction: EvaluateFn<T>,
    arg?: unknown,
  ) => Effect.Effect<Awaited<T>, CdpError>;

  /**
   * Evaluates a JavaScript function or expression and returns a
   * `CdpHandle` referencing the result.
   *
   * Mirrors Playwright's `page.evaluateHandle`. The handle is a stable
   * remote object reference that can be passed as an argument to a
   * subsequent `page.evaluate` (or `Locator.evaluate`) call. This is
   * useful for working with non-serializable values like DOM elements,
   * functions, or class instances.
   *
   * ```typescript
   * const handle = yield* page.evaluateHandle(() => document.body);
   * const tagName = yield* page.evaluate((el) => el.tagName, handle);
   * ```
   *
   * The returned `CdpHandle` should be `dispose`d when no longer needed
   * to free the underlying remote object. Otherwise it is freed when the
   * page is destroyed.
   *
   * Note: CDP `Runtime.evaluate` only returns a handle for objects with
   * an `objectId`. Primitive results fail with `EvaluationError` — use
   * `page.evaluate` for those.
   *
   * @param pageFunction - A function to execute, or a string expression
   * @param arg - Optional argument to pass to the function
   * @returns A `CdpHandle` referencing the result
   */
  readonly evaluateHandle: <T>(
    pageFunction: EvaluateFn<T>,
    arg?: unknown,
  ) => Effect.Effect<CdpHandle, CdpError>;

  /**
   * Evaluates a function on the first element matching the selector.
   *
   * Queries the element using `document.querySelector`, then evaluates
   * the provided function on it. Waits for the element to appear before
   * evaluating. If no element matches, throws a SelectorError.
   *
   * This is the recommended method for scraping single elements:
   * ```typescript
   * const price = yield* page.$eval(".price", (el) => el.textContent);
   * const id = yield* page.$eval("section", (el) => el.id);
   * ```
   *
   * @param selector - CSS selector for the element
   * @param pageFunction - Function to evaluate on the element
   * @param arg - Optional argument to pass to the function (in addition to the element)
   * @param options - Options
   *   - `timeout`: Maximum wait time for element to appear (DurationInput, default: "30 seconds")
   */
  readonly $eval: <T, Arg = unknown>(
    selector: string,
    pageFunction: (element: Element, arg: Arg) => T,
    arg?: Arg,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Awaited<T>, CdpError>;

  /**
   * Evaluates a function on all elements matching the selector.
   *
   * Queries elements using `document.querySelectorAll`, converts to array,
   * then evaluates the provided function on the array. Unlike `$eval`,
   * this does NOT wait for elements to appear. If no elements match,
   * the function receives an empty array.
   *
   * ```typescript
   * const texts = yield* page.$$eval(".article h2", (els) => els.map(e => e.textContent));
   * const count = yield* page.$$eval("div", (els) => els.length);
   * ```
   *
   * @param selector - CSS selector for elements
   * @param pageFunction - Function to evaluate on the elements array
   * @param arg - Optional argument to pass to the function (in addition to elements)
   */
  readonly $$eval: <T, Arg = unknown>(
    selector: string,
    pageFunction: (elements: Array<Element>, arg: Arg) => T,
    arg?: Arg,
  ) => Effect.Effect<Awaited<T>, CdpError>;

  /**
   * Returns a Locator for elements matching the selector.
   *
   * Locators are lazy — they store a selector recipe and resolve to a DOM
   * element at action time. They auto-wait for actionability (delegated to
   * page methods) and never need disposal.
   *
   * Mirrors Playwright's `page.locator(selector, options?)`.
   *
   * ```typescript
   * const submit = page.locator("form").getByRole("button", { name: "Submit" });
   * yield* submit.click();
   *
   * const firstItem = page.locator("li").first();
   * yield* firstItem.click();
   * ```
   *
   * @param selector - CSS selector for the element(s)
   * @param options - Optional filter options (`hasText`, `has`)
   */
  readonly locator: (selector: string, options?: LocatorOptions) => CdpLocator;

  /**
   * Returns a Locator filtered to elements with the given ARIA role.
   *
   * Mirrors Playwright's `page.getByRole(role, options?)`. Filters by
   * `aria-*` attributes via CSS attribute selectors.
   */
  readonly getByRole: (role: string, options?: ByRoleOptions) => CdpLocator;

  /**
   * Returns a Locator filtered to elements containing the given text.
   *
   * Mirrors Playwright's `page.getByText(text, options?)`.
   */
  readonly getByText: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /**
   * Returns a Locator filtered to elements with matching `aria-label`.
   *
   * Mirrors Playwright's `page.getByLabel(text, options?)`. Note: matches
   * `aria-label` only — full `<label>` association is not implemented in v1.
   */
  readonly getByLabel: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /**
   * Returns a Locator filtered to elements with matching `data-testid`.
   *
   * Mirrors Playwright's `page.getByTestId(testId)`.
   */
  readonly getByTestId: (testId: string | RegExp) => CdpLocator;

  /**
   * Returns a Locator filtered to elements with matching `placeholder`.
   *
   * Mirrors Playwright's `page.getByPlaceholder(text, options?)`.
   */
  readonly getByPlaceholder: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /**
   * Returns a Locator filtered to elements with matching `alt` attribute.
   *
   * Mirrors Playwright's `page.getByAltText(text, options?)`.
   */
  readonly getByAltText: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /**
   * Returns a Locator filtered to elements with matching `title` attribute.
   *
   * Mirrors Playwright's `page.getByTitle(text, options?)`.
   */
  readonly getByTitle: (text: string | RegExp, options?: TextMatchOptions) => CdpLocator;

  /**
   * Performs an HTTP fetch request through the browser context.
   *
   * This method wraps the browser's `fetch()` API with:
   * - Automatic timeout handling via AbortController
   * - Structured error mapping to FetchError types
   * - Response serialization (body as text, headers as object)
   *
   * The request executes in the browser's JavaScript context, inheriting
   * the page's cookies, session storage, and other browser state.
   *
   * @param url - URL to fetch
   * @param options - Fetch options (method, headers, body, timeout)
   */
  readonly fetch: (url: string, options?: FetchOptions) => Effect.Effect<FetchResponse, CdpError>;

  /**
   * High-level HttpClient for browser-context requests.
   *
   * This is an Effect HttpClient that uses the browser's fetch internally,
   * allowing you to use the standard HttpClient API with browser cookies.
   */
  readonly httpClient: HttpClient.HttpClient;

  /**
   * APIRequestContext for making server-side HTTP requests with browser cookies.
   *
   * Unlike `fetch()` which runs in the browser, `request` makes requests from
   * Node/Worker context but automatically includes browser cookies synced via CDP.
   *
   * Benefits over `fetch()`:
   * - No CORS restrictions (server-side requests)
   * - Faster (no browser roundtrip)
   * - Full Effect HttpClient features (schema validation, retry, middleware)
   *
   * ```typescript
   * // Make authenticated API call with browser cookies
   * const data = yield* page.request.get("https://api.example.com/user/profile").pipe(
   *   HttpClientResponse.schemaBodyJson(UserSchema),
   * );
   * ```
   */
  readonly request: HttpClient.HttpClient;

  /**
   * Gets the text content of an element.
   *
   * Uses `element.textContent` which returns the raw text content including
   * hidden elements and whitespace (unlike `innerText` which collapses whitespace
   * and excludes hidden elements).
   *
   * Waits for the element to appear before extracting text.
   *
   * @param selector - CSS selector for the element
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns `Option.some(text)` if element found, `Option.none()` otherwise
   */
  readonly textContent: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Option.Option<string>, CdpError>;

  /**
   * Gets the visible text content of an element.
   *
   * Uses `element.innerText` which collapses whitespace and excludes
   * hidden elements. Matches Playwright's `innerText()` behavior.
   *
   * Waits for the element to appear before extracting text.
   *
   * @param selector - CSS selector for the element
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns `Option.some(text)` if element found, `Option.none()` otherwise
   */
  readonly innerText: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Option.Option<string>, CdpError>;

  /**
   * Gets the HTML content inside an element.
   *
   * Returns the HTML markup inside the element (not including the element's own tags).
   *
   * Waits for the element to appear before extracting HTML.
   *
   * @param selector - CSS selector for the element
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns `Option.some(html)` if element found, `Option.none()` otherwise
   */
  readonly innerHTML: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Option.Option<string>, CdpError>;

  /**
   * Gets the value of an attribute on an element.
   *
   * Uses `element.getAttribute()` which returns the attribute value as a string,
   * or null if the attribute does not exist.
   *
   * Waits for the element to appear before reading the attribute.
   *
   * @param selector - CSS selector for the element
   * @param name - The attribute name to retrieve
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns `Option.some(value)` if attribute exists, `Option.none()` otherwise
   */
  readonly getAttribute: (
    selector: string,
    name: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Option.Option<string>, CdpError>;

  /**
   * Gets the value of an input, textarea, or select element.
   *
   * Uses `element.value` which returns the current value of form controls.
   * Throws if the element is not found or is not an input/textarea/select element.
   *
   * @param selector - CSS selector for the element
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns The input value of the element
   */
  readonly inputValue: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<string, CdpError>;

  /**
   * Waits for a network request matching the given URL or predicate.
   *
   * Uses the prepare-then-await pattern: call first to subscribe to events
   * synchronously, then trigger the action, then await.
   *
   * ```typescript
   * const request = yield* page.waitForRequest("/api/data");
   * yield* page.click("button.load-data");
   * const info = yield* request;
   * console.log(info.url);
   * ```
   *
   * @param urlOrPredicate - URL string, regex, or predicate function
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns Nested Effect — outer allocates subscription, inner returns the request info
   *
   * @see {@link onRequest} stream for the multi-consumer / filterable
   *   alternative. The stream equivalent of this method is:
   *   ```typescript
   *   const stream = yield* page.onRequest;
   *   yield* page.click("button.load-data");
   *   const info = yield* stream.pipe(
   *     Stream.filter((req) => matches(req.url, urlOrPredicate)),
   *     Stream.take(1),
   *     Stream.runHead,
   *   );
   *   ```
   *   Use this method for a one-shot wait; use the stream for filtering,
   *   broadcasting, or composing with other event streams.
   */
  readonly waitForRequest: (
    urlOrPredicate: RequestUrlOrPredicate,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Effect.Effect<RequestInfo, CdpError>, CdpError>;

  /**
   * Waits for a network response matching the given URL or predicate.
   *
   * Uses the prepare-then-await pattern: call first to subscribe to events
   * synchronously, then trigger the action, then await.
   *
   * ```typescript
   * const response = yield* page.waitForResponse("/api/data");
   * yield* page.click("button.load-data");
   * const info = yield* response;
   * console.log(info.status, info.url);
   * ```
   *
   * @param urlOrPredicate - URL string, regex, or predicate function
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns Nested Effect — outer allocates subscription, inner returns the response info
   *
   * @see {@link onResponse} stream for the multi-consumer / filterable
   *   alternative. See {@link waitForRequest} for the stream-equivalent
   *   pattern — same shape, swap `onResponse` for `onRequest`.
   */
  readonly waitForResponse: (
    urlOrPredicate: ResponseUrlOrPredicate,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Effect.Effect<ResponseInfo, CdpError>, CdpError>;

  /**
   * Waits for a network request failure matching the given URL or predicate.
   *
   * Uses the prepare-then-await pattern: call first to subscribe to events
   * synchronously, then trigger the action, then await.
   *
   * Useful for verifying that requests were aborted or failed.
   *
   * @param urlOrPredicate - URL string, regex, or predicate function
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns Nested Effect — outer allocates subscription, inner returns the failure info
   *
   * @see {@link onRequestFailed} stream for the multi-consumer / filterable
   *   alternative. See {@link waitForRequest} for the stream-equivalent
   *   pattern — same shape, swap `onRequestFailed` for `onRequest`.
   */
  readonly waitForRequestFailed: (
    urlOrPredicate: RequestFailedUrlOrPredicate,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<Effect.Effect<RequestFailedInfo, CdpError>, CdpError>;

  /**
   * Sleeps for the given number of milliseconds.
   *
   * Uses `page.evaluate` to run a timeout in the browser context.
   *
   * @param ms - Milliseconds to wait
   */
  readonly waitForTimeout: (ms: number) => Effect.Effect<void>;

  /**
   * Waits for an element matching the given CSS selector to reach the desired state.
   *
   * Uses polling-only approach (like Playwright) for maximum reliability.
   * By default, pierces shadow DOM and waits for element to be attached to DOM.
   *
   * @param selector - CSS selector to wait for
   * @param options - Options
   *   - `state`: State to wait for: 'attached', 'visible', 'hidden', 'detached' (default: 'attached')
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   *   - `pierceShadowDOM`: Whether to pierce shadow DOM (default: true, matches Playwright)
   */
  readonly waitForSelector: (
    selector: string,
    options?: {
      state?: WaitForSelectorState;
      timeout?: DurationInput;
      pierceShadowDOM?: boolean;
    },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Waits for a function to return a truthy value.
   *
   * Polls the function at regular intervals until it returns truthy
   * or the timeout is reached.
   *
   * @param pageFunction - Function to evaluate in browser context
   * @param arg - Optional argument to pass to the function
   * @param options - Polling options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   *   - `polling`: Polling interval in milliseconds (default: 100)
   */
  readonly waitForFunction: <T, Arg = void>(
    pageFunction: EvaluateFn<T>,
    arg?: Arg,
    options?: { timeout?: DurationInput; polling?: number | "raf" },
  ) => Effect.Effect<Awaited<T>, CdpError>;

  /**
   * Clicks an element matching the selector.
   *
   * Uses CDP `Input.dispatchMouseEvent` for reliable clicking.
   * Waits for the element to appear before clicking.
   *
   * @param selector - CSS selector for the element
   * @param options - Options
   *   - `button`: Mouse button ("left" | "right" | "middle", default: "left")
   *   - `modifiers`: Modifier keys to hold ("Alt" | "Control" | "ControlOrMeta" | "Meta" | "Shift")
   *   - `clickCount`: Number of clicks (default: 1)
   *   - `position`: Click at a specific point relative to the element's top-left
   *   - `force`: Skip actionability auto-waiting (default: false)
   *   - `trial`: Run actionability checks without clicking (default: false)
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly click: (
    selector: string,
    options?: {
      button?: MouseButton;
      modifiers?: ReadonlyArray<ClickModifier>;
      clickCount?: number;
      position?: { readonly x: number; readonly y: number };
      force?: boolean;
      trial?: boolean;
      timeout?: DurationInput;
    },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Double-clicks an element matching the selector.
   *
   * Uses CDP `Input.dispatchMouseEvent` for reliable double-clicking.
   * Waits for the element to appear before clicking.
   *
   * @param selector - CSS selector for the element
   * @param options - Options
   *   - `trial`: Run actionability checks without clicking (default: false)
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly dblclick: (
    selector: string,
    options?: { trial?: boolean; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Taps an element matching the selector using touch events.
   *
   * Uses CDP `Input.dispatchTouchEvent` (`touchStart` then `touchEnd`).
   * Waits for the element to appear before tapping. Uses
   * DOM.getContentQuads for transform-aware tap coordinates.
   *
   * @param selector - CSS selector for the element
   * @param options - Options
   *   - `position`: Tap at a specific point relative to the element's top-left
   *   - `force`: Skip actionability auto-waiting
   *   - `trial`: Run actionability checks without tapping
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly tap: (
    selector: string,
    options?: {
      position?: { readonly x: number; readonly y: number };
      force?: boolean;
      trial?: boolean;
      timeout?: DurationInput;
    },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Hovers over an element matching the selector.
   *
   * Uses CDP `Input.dispatchMouseEvent` to move the mouse.
   * Waits for the element to appear before hovering.
   *
   * @param selector - CSS selector for the element
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly hover: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Fills an input element with a value.
   *
   * Clears existing content and sets the new value.
   * Works with input, textarea, and contenteditable elements.
   *
   * @param selector - CSS selector for the input element
   * @param value - Value to fill
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly fill: (
    selector: string,
    value: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Focuses an element.
   *
   * Uses `element.focus()` to set focus. Throws if the element is not found.
   *
   * @param selector - CSS selector for the element
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly focus: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Blurs (removes focus from) an element.
   *
   * @param selector - CSS selector for the element
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly blur: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Types text into an element character by character.
   *
   * Simulates real keyboard input with optional delay between characters.
   *
   * @param selector - CSS selector for the element
   * @param text - Text to type
   * @param options - Typing options
   *   - `delay`: Delay between keystrokes (DurationInput, default: 0)
   *   - `timeout`: Maximum wait time for element to appear (DurationInput, default: "30 seconds")
   */
  readonly type: (
    selector: string,
    text: string,
    options?: { delay?: number; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Presses a key on an element.
   *
   * Supports special keys like Enter, Tab, Escape, ArrowUp, etc.
   *
   * @param selector - CSS selector for the element
   * @param key - Key to press (e.g., "Enter", "Tab", "a")
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly press: (
    selector: string,
    key: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Keyboard namespace, matching Playwright's `page.keyboard` API.
   *
   * These operate on whatever element is currently focused — they do NOT
   * select or focus an element. For selector-based typing/pressing, use
   * `page.type(selector, text)` or `page.press(selector, key)`.
   */
  readonly keyboard: {
    /** Dispatch a keydown for a key (no keyup). Allows keys to be held. */
    readonly down: (key: string) => Effect.Effect<void, CdpError>;
    /** Dispatch a keyup for a key previously held with `down`. */
    readonly up: (key: string) => Effect.Effect<void, CdpError>;
    /** Shortcut for `down` + `up` on the currently focused element. */
    readonly press: (key: string) => Effect.Effect<void, CdpError>;
    /** Type text at the current cursor position (respects modifier state). */
    readonly type: (text: string, options?: { delay?: number }) => Effect.Effect<void, CdpError>;
    /** Insert text at the cursor without generating key events (only an `input` event). */
    readonly insertText: (text: string) => Effect.Effect<void, CdpError>;
  };

  /**
   * Mouse namespace, matching Playwright's `page.mouse` API.
   *
   * These operate on raw viewport coordinates — they do NOT resolve selectors
   * or run actionability checks. Useful for drag-and-drop sequences,
   * mouse-wheel scrolling, and custom click gestures.
   *
   * State (pointer position, held buttons) is tracked across calls.
   */
  readonly mouse: {
    /** Move the pointer to viewport coordinates (x, y). */
    readonly move: (
      x: number,
      y: number,
      options?: MouseMoveOptions,
    ) => Effect.Effect<void, CdpError>;
    /** Press a mouse button at the current pointer position. */
    readonly down: (options?: MouseToggleOptions) => Effect.Effect<void, CdpError>;
    /** Release a mouse button at the current pointer position. */
    readonly up: (options?: MouseToggleOptions) => Effect.Effect<void, CdpError>;
    /** Shortcut for `move` + `down` + `up` at (x, y). */
    readonly click: (
      x: number,
      y: number,
      options?: MouseClickOptions,
    ) => Effect.Effect<void, CdpError>;
    /** Double-click at (x, y). */
    readonly dblclick: (
      x: number,
      y: number,
      options?: Omit<MouseClickOptions, "clickCount">,
    ) => Effect.Effect<void, CdpError>;
    /** Dispatch a mouse wheel event at the current pointer position. */
    readonly wheel: (deltaX: number, deltaY: number) => Effect.Effect<void, CdpError>;
  };

  /**
   * Touchscreen namespace, matching Playwright's `page.touchscreen` API.
   *
   * Stateless — operates on raw viewport coordinates with no selector
   * resolution, actionability check, or retry. Use when you know the
   * exact coordinates to tap. For selector-based tapping with auto-wait,
   * use {@link tap} or `locator.tap()` instead.
   *
   * Held modifier keys (Shift / Control / Alt / Meta via
   * `page.keyboard.down`) are reflected in the dispatched touch events,
   * matching upstream Playwright behavior.
   */
  readonly touchscreen: {
    /**
     * Tap at the given viewport coordinates (x, y). Dispatches a
     * `touchStart` followed by `touchEnd` via CDP
     * `Input.dispatchTouchEvent`. The element at (x, y) (if any) will
     * receive the click — same user-observable behavior as a real
     * touch tap.
     */
    readonly tap: (x: number, y: number) => Effect.Effect<void, CdpError>;
  };

  /**
   * Checks a checkbox or radio element.
   *
   * For native `<input type="checkbox|radio">`: sets `.checked = true` and
   * dispatches `input` + `change` events.
   * For ARIA role elements (checkbox, radio, switch, etc.): sets `aria-checked="true"`.
   * Idempotent: does nothing if already checked.
   * Throws if the element is not a checkbox or radio button.
   *
   * @param selector - CSS selector for the checkbox/radio
   * @param options - Options
   *   - `trial`: If true, validates the element but does not modify it
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly check: (
    selector: string,
    options?: { trial?: boolean; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Unchecks a checkbox element.
   *
   * For native `<input type="checkbox">`: sets `.checked = false` and
   * dispatches `input` + `change` events.
   * For ARIA role elements: sets `aria-checked="false"`.
   * Throws if called on a radio button ("Cannot uncheck radio button").
   * Idempotent: does nothing if already unchecked.
   *
   * @param selector - CSS selector for the checkbox
   * @param options - Options
   *   - `trial`: If true, validates the element but does not modify it
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly uncheck: (
    selector: string,
    options?: { trial?: boolean; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Sets the checked state of a checkbox or radio element.
   *
   * Convenience method that checks or unchecks based on the boolean parameter.
   *
   * @param selector - CSS selector for the element
   * @param checked - Desired checked state (true = check, false = uncheck)
   * @param options - Options
   *   - `trial`: If true, validates the element but does not modify it
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   */
  readonly setChecked: (
    selector: string,
    checked: boolean,
    options?: { trial?: boolean; timeout?: DurationInput },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Selects options in a `<select>` element.
   *
   * Supports multiple value types:
   * - `string` — select by value
   * - `{ value: string }` — select by value
   * - `{ label: string }` — select by visible text
   * - `{ index: number }` — select by index
   *
   * @param selector - CSS selector for the select element
   * @param values - Value(s) to select
   * @param options - Options
   *   - `timeout`: Maximum wait time (DurationInput, default: "30 seconds")
   * @returns Array of selected option values
   */
  readonly selectOption: <T extends string | { value?: string; label?: string; index?: number }>(
    selector: string,
    values: T | T[] | null,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<readonly string[], CdpError>;

  /**
   * Checks if an element is hidden.
   *
   * An element is considered hidden if it has `display: none`,
   * `visibility: hidden`, `opacity: 0`, or zero dimensions.
   *
   * @param selector - CSS selector for the element
   */
  readonly isHidden: (selector: string) => Effect.Effect<boolean, CdpError>;

  /**
   * Checks if an element is visible.
   *
   * The inverse of `isHidden`.
   *
   * @param selector - CSS selector for the element
   */
  readonly isVisible: (selector: string) => Effect.Effect<boolean, CdpError>;

  /**
   * Sets the viewport size for the page.
   *
   * Affects `window.innerWidth`, `window.innerHeight`, and CSS media queries.
   *
   * @param viewport - Viewport dimensions { width, height }
   */
  readonly setViewportSize: (viewport: ViewportSize) => Effect.Effect<void, CdpError>;

  /**
   * Gets the current viewport size.
   *
   * Returns the dimensions set via {@link setViewportSize}, or `Option.none()`
   * if `setViewportSize` was never called. The values reflect the active
   * device metrics override.
   *
   * @returns Current viewport size, or `Option.none()` if `setViewportSize` was never called
   */
  readonly viewportSize: () => Effect.Effect<Option.Option<ViewportSize>, never>;

  /**
   * Checks if an element (checkbox/radio) is checked.
   *
   * @param selector - CSS selector for the element
   */
  readonly isChecked: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<boolean, CdpError>;

  /**
   * Checks if an element is disabled.
   *
   * @param selector - CSS selector for the element
   */
  readonly isDisabled: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<boolean, CdpError>;

  /**
   * Checks if an element is editable (enabled and not readonly).
   *
   * @param selector - CSS selector for the element
   */
  readonly isEditable: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<boolean, CdpError>;

  /**
   * Checks if an element is enabled.
   *
   * The inverse of `isDisabled`.
   *
   * @param selector - CSS selector for the element
   */
  readonly isEnabled: (
    selector: string,
    options?: { timeout?: DurationInput },
  ) => Effect.Effect<boolean, CdpError>;

  /**
   * Captures a screenshot of the page.
   *
   * Uses CDP `Page.captureScreenshot` for reliable capture.
   *
   * @param options - Screenshot options
   *   - `format`: Image format ("png", "jpeg", "webp")
   *   - `quality`: Quality for jpeg (1-100)
   *   - `selector`: Capture only this element
   * @returns Screenshot as Uint8Array
   */
  readonly screenshot: (options?: ScreenshotOptions) => Effect.Effect<Uint8Array, CdpError>;

  /**
   * Generates a PDF of the page.
   *
   * Uses CDP `Page.printToPDF` with streaming for efficient transfer.
   * Mirrors Playwright's `page.pdf()` API 1:1.
   *
   * `page.pdf()` generates a PDF with `print` CSS media. To generate a PDF
   * with `screen` media, call `page.emulateMedia({ media: 'screen' })` before
   * calling `page.pdf()` (available via the `use()` escape hatch).
   *
   * **NOTE** By default, `page.pdf()` generates a PDF with modified colors for
   * printing. Use the `-webkit-print-color-adjust` CSS property to force
   * rendering of exact colors.
   *
   * The `width`, `height`, and `margin` options accept values labeled with
   * units. Unlabeled values are treated as pixels.
   *
   * A few examples:
   * - `pdf({ width: 100 })` — prints with width set to 100 pixels
   * - `pdf({ width: '100px' })` — prints with width set to 100 pixels
   * - `pdf({ width: '10cm' })` — prints with width set to 10 centimeters
   *
   * All possible units are: `px` (pixel), `in` (inch), `cm` (centimeter), `mm` (millimeter).
   *
   * The `format` options are:
   * `Letter`, `Legal`, `Tabloid`, `Ledger`, `A0`, `A1`, `A2`, `A3`, `A4`, `A5`, `A6`
   *
   * **NOTE** `headerTemplate` and `footerTemplate` markup have the following
   * limitations:
   * 1. Script tags inside templates are not evaluated.
   * 2. Page styles are not visible inside templates.
   *
   * @param options - PDF options (format, margins, scale, etc.)
   * @returns PDF data as Uint8Array
   */
  readonly pdf: (options?: PdfOptions) => Effect.Effect<Uint8Array, CdpError>;

  /**
   * Closes the page target.
   *
   * Removes event subscriptions and closes the CDP target.
   */
  readonly close: () => Effect.Effect<void>;

  /**
   * Returns whether `close()` has been called on this page.
   *
   * After `close()` is called, any further method calls on the page will
   * fail with a "target closed" error from CDP. Use `isClosed()` in cleanup
   * paths to avoid duplicate-close errors.
   *
   * Note: only detects closure via `close()`. External closure (e.g. browser
   * crash, tab killed by user) is not detected.
   */
  readonly isClosed: () => Effect.Effect<boolean, never>;

  /**
   * Brings the page to the front (focuses the tab).
   *
   * Uses CDP `Page.bringToFront`. Useful when debugging multi-tab flows or
   * when a page requires focus to trigger certain actions.
   */
  readonly bringToFront: () => Effect.Effect<void, CdpError>;

  /**
   * Dispatches a synthetic DOM event on the first element matching the selector.
   *
   * Uses `element.dispatchEvent(new Event(type, eventInit))`. Does NOT wait
   * for the element to appear — fails immediately if not found. If multiple
   * elements match, dispatches on the first one.
   *
   * @param selector - CSS selector for the target element
   * @param type - DOM event type (e.g. `"click"`, `"input"`)
   * @param eventInit - Optional `EventInit` properties
   */
  readonly dispatchEvent: (
    selector: string,
    type: string,
    eventInit?: Record<string, unknown>,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Injects a `<script>` element into the current page.
   *
   * Useful for loading third-party libraries, polyfills, or analytics
   * scripts that you don't control via `addInitScript`.
   *
   * Exactly one of `url` or `content` must be provided. The script is
   * appended to `document.head` and the returned Effect resolves when the
   * script has finished loading (or fails on load error).
   *
   * @param options - `{ url?, content?, type? }`
   */
  readonly addScriptTag: (options: AddScriptTagOptions) => Effect.Effect<void, CdpError>;

  /**
   * Sets files on a file input element.
   *
   * Uses CDP `DOM.setFileInputFiles` directly. Supports local file paths
   * (with full path string) and synthetic in-memory files (name + base64 data).
   *
   * The selector must match a single `<input type="file">` element. Does NOT
   * wait for the element — fails immediately if not found.
   *
   * @param selector - CSS selector for the file input
   * @param files - Array of files
   */
  readonly setInputFiles: (
    selector: string,
    files: ReadonlyArray<InputFile>,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Drags the source element to the target element.
   *
   * Performs a mouse-based drag: mousedown on source, mousemove in steps to
   * target, mouseup on target. Triggers `dragenter`/`dragover`/`drop` events
   * on most sites.
   *
   * For full HTML5 drag-and-drop with `dataTransfer`, combine with
   * `dispatchEvent('dragstart')` / `'drop'`.
   */
  readonly dragAndDrop: (source: string, target: string) => Effect.Effect<void, CdpError>;

  /**
   * Sets the default timeout for all operations that accept a `timeout` option.
   *
   * When set, operations like `waitForFunction`, `waitForSelector`, `click`,
   * `fill`, etc. will use this timeout when no explicit `timeout` option is
   * provided. Does not affect operations where an explicit timeout is passed.
   *
   * This is per-page — each `CdpPageService` instance has its own default.
   *
   * Playwright convention: timeout of 0 means "no timeout" (infinite).
   *
   * @param timeout - Default timeout in milliseconds.
   */
  readonly setDefaultTimeout: (timeout: number) => Effect.Effect<void>;

  /**
   * Sets the default timeout for navigation operations.
   *
   * Navigation operations include: goto, setContent, waitForNavigation,
   * waitForURL, reload, goBack, goForward, waitForLoadState.
   *
   * This takes precedence over `setDefaultTimeout` for navigation operations.
   *
   * @param timeout - Default navigation timeout in milliseconds.
   */
  readonly setDefaultNavigationTimeout: (timeout: number) => Effect.Effect<void>;

  /**
   * Adds a script to be evaluated on every new document load.
   *
   * The script runs in the main world before any page scripts. This is useful
   * for setting up global variables, mocking APIs, or injecting polyfills
   * that need to be available before the page's JavaScript executes.
   *
   * The script is evaluated before the page's `DOMContentLoaded` event fires.
   *
   * @param script - A function to evaluate, or a string expression
   */
  readonly addInitScript: (script: EvaluateFn<unknown>) => Effect.Effect<void, CdpError>;

  /**
   * Exposes a Node/Worker function to the page as `window[name](...args)`.
   *
   * The page can then call the function and `await` its result. Mirrors
   * Playwright's `page.exposeFunction(name, callback)`.
   *
   * Args are serialised through the same `__serialize` codec used by
   * `page.evaluate`. The callback may return a value or a Promise; both
   * are awaited and the resolved value is returned to the page. Thrown
   * errors propagate to the page as a rejected promise.
   *
   * Duplicate registration throws with message
   * `Function "<name>" has been already registered`.
   *
   * @param name - Function name to expose on the page.
   * @param callback - User callback invoked with the page-side args.
   */
  readonly exposeFunction: <
    Args extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
    R = unknown,
  >(
    name: string,
    callback: (...args: Args) => R | Promise<R> | Effect.Effect<R, never, never>,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Exposes a binding that includes a `BindingSource` as the first arg.
   *
   * Mirrors Playwright's `page.exposeBinding(name, callback, { handle?: false })`.
   * The page calls `window[name](...args)`; the Node-side callback receives
   * `(source, ...args)` where `source` is a `BindingSource` exposing the
   * originating `frame`, `page`, and `context`.
   *
   * For `{ handle: true }`, the first page-side argument is delivered
   * un-serialised (as a plain JS value) instead of through the serialiser.
   * Subsequent arguments are validated: only `undefined` is allowed after
   * the first.
   *
   * @param name - Binding name to expose on the page.
   * @param callback - User callback invoked with `(source, ...args)`.
   * @param options - `{ handle: true }` to receive an un-serialised first arg.
   */
  readonly exposeBinding: <
    Args extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
    R = unknown,
  >(
    name: string,
    callback: (
      ...args: readonly [unknown, ...Args]
    ) => R | Promise<R> | Effect.Effect<R, never, never>,
    options?: { readonly handle?: boolean },
  ) => Effect.Effect<void, CdpError>;

  /**
   * Event stream of console messages emitted by the page.
   *
   * Returns an Effect that acquires a scoped subscription to `Runtime.consoleAPICalled`
   * CDP events. The subscription is **eager** - it happens immediately when the Effect
   * is yielded, ensuring no events are missed between subscription and consumption.
   *
   * **Design Note:** This API uses `Effect.Effect<Stream.Stream<T>, never, Scope>` instead
   * of `Stream.Stream<T>` to make resource acquisition explicit. This solves the race
   * condition inherent in lazy stream subscription (where events published before the
   * stream is pulled would be lost). The Scope requirement signals to consumers that
   * they're acquiring a resource that needs proper cleanup.
   *
   * @example
   * // Acquire subscription, then trigger events
   * const messages = yield* page.onConsole;
   * // Now subscription is active, events will be queued
   * yield* page.evaluate(() => console.log('hello'));
   * const msg = yield* messages.pipe(Stream.take(1), Stream.runHead);
   */
  readonly onConsole: Effect.Effect<Stream.Stream<ConsoleMessage>, never, Scope.Scope>;

  /**
   * Event stream of JavaScript dialogs (alert/confirm/prompt/beforeunload).
   *
   * Returns an Effect that acquires a scoped subscription to
   * `Page.javascriptDialogOpening` CDP events. The subscription is eager.
   *
   * Each dialog event includes `accept(promptText?)` and `dismiss()` methods
   * that MUST be called within ~30 seconds, or CDP will auto-dismiss.
   *
   * ```typescript
   * const dialogs = yield* page.onDialog;
   * yield* page.click("button.confirm-delete");
   * const dialog = yield* dialogs.pipe(Stream.take(1), Stream.runHead);
   * yield* Option.match(dialog, {
   *   onNone: () => Effect.void,
   *   onSome: (d) => d.accept(),
   * });
   * ```
   */
  readonly onDialog: Effect.Effect<Stream.Stream<CdpDialog>, never, Scope.Scope>;

  /**
   * Event stream of uncaught JavaScript errors on the page.
   *
   * Mirrors Playwright's `page.on('pageerror', handler)`. Returns an Effect
   * that acquires a scoped subscription to `Runtime.exceptionThrown` events.
   *
   * The subscription is eager — events emitted before the stream is pulled
   * are buffered.
   *
   * @example
   * const errors = yield* page.onPageError;
   * yield* page.click("button.broken");
   * const err = yield* errors.pipe(Stream.take(1), Stream.runHead);
   * ```
   */
  readonly onPageError: Effect.Effect<Stream.Stream<CdpPageError>, never, Scope.Scope>;

  /**
   * Snapshot of all uncaught JavaScript errors accumulated since the page
   * was created. Non-destructive — each call returns the current list
   * (including errors already delivered via `onPageError`).
   *
   * @example
   * const errors = yield* page.pageErrors;
   * console.log(`caught ${errors.length} errors so far`);
   * ```
   *
   * @deprecated Prefer the {@link onPageError} stream. The snapshot
   *   accessor exists for historical parity with Playwright's
   *   `page.pageErrors()`, but it is inconsistent with the rest of the
   *   API surface: there is no `consoleMessages()` snapshot — `consoleMessages`
   *   parity is `❌ use the onConsole stream`. To preserve consistency,
   *   collect errors from the stream and accumulate them yourself:
   *   ```typescript
   *   const stream = yield* page.onPageError;
   *   const errors: CdpPageError[] = [];
   *   yield* stream.pipe(
   *     Stream.tap((err) => Effect.sync(() => { errors.push(err); })),
   *     Stream.runDrain,
   *     Effect.forkScoped,  // or fork in your own scope
   *   );
   *   ```
   *   Removal is deferred to a v0.x release. For real-time page errors,
   *   subscribe to the `onPageError` stream — see
   *   [`docs/modules/cdp/streams.md`](../../docs/modules/cdp/streams.md).
   */
  readonly pageErrors: () => Effect.Effect<readonly CdpPageError[], never, never>;

  /**
   * Event stream of browser-initiated downloads.
   *
   * Returns an Effect that acquires a scoped subscription to
   * `Browser.downloadWillBegin` CDP events. The subscription is eager.
   *
   * Each CdpDownload has `path()` and `cancel()` methods. The first call to
   * `onDownload` automatically configures `Browser.setDownloadBehavior` with
   * the supplied `downloadPath` — you only need to configure it once per
   * page.
   *
   * **Note:** The download path must be accessible to the browser process,
   * not to Node.js. For cloud/edge runtimes, this may not be supported.
   *
   * @example
   * const downloads = yield* page.onDownload;
   * yield* page.click("a.download-csv");
   * const dl = yield* downloads.pipe(Stream.take(1), Stream.runHead);
   * const path = yield* Option.match(dl, {
   *   onNone: () => Effect.fail(new Error("no download")),
   *   onSome: (d) => d.path(),
   * });
   * ```
   */
  readonly onDownload: (options: {
    readonly downloadPath: string;
  }) => Effect.Effect<Stream.Stream<CdpDownload>, CdpError, Scope.Scope>;

  /**
   * Emulates a media type or media feature for CSS media queries.
   *
   * Mirrors Playwright's `page.emulateMedia(options)`. Each option accepts
   * `"null"` to clear the emulation for that feature. Empty object clears
   * all emulations.
   */
  readonly emulateMedia: (options: EmulateMediaOptions) => Effect.Effect<void, CdpError>;

  /**
   * Injects a `<style>` element into the current page.
   *
   * Useful for injecting custom CSS. Exactly one of `url` or `content`
   * must be provided.
   */
  readonly addStyleTag: (options: AddStyleTagOptions) => Effect.Effect<void, CdpError>;

  /**
   * Reads all entries from `localStorage` as a key-value Map.
   *
   * Useful for persisting/replaying auth state, inspecting stored data,
   * or migrating storage between sessions.
   */
  readonly localStorage: () => Effect.Effect<ReadonlyMap<string, string>, CdpError>;

  /**
   * Reads all entries from `sessionStorage` as a key-value Map.
   *
   * Same as `localStorage()` but reads from session-scoped storage that
   * is cleared when the tab/browser session ends.
   */
  readonly sessionStorage: () => Effect.Effect<ReadonlyMap<string, string>, CdpError>;

  /**
   * Sets a single key in `localStorage`.
   */
  readonly setLocalStorageItem: (key: string, value: string) => Effect.Effect<void, CdpError>;

  /**
   * Sets a single key in `sessionStorage`.
   */
  readonly setSessionStorageItem: (key: string, value: string) => Effect.Effect<void, CdpError>;

  /**
   * Clears all entries in `localStorage`.
   */
  readonly clearLocalStorage: () => Effect.Effect<void, CdpError>;

  /**
   * Clears all entries in `sessionStorage`.
   */
  readonly clearSessionStorage: () => Effect.Effect<void, CdpError>;

  /**
   * Reads cookies visible to this page's session.
   *
   * Cookies are scoped to the *context* (shared by all pages in the same
   * context), but this is the natural per-page API for both scrapers
   * ("what cookies does this page see?") and agents ("what's the auth
   * state right now?"). Delegates to the same CDP call as
   * `context.cookies()`.
   *
   * @param urls - Optional URL or list of URLs to filter cookies by.
   *
   * @see {@link CdpContextHandle.cookies} for the context-level equivalent.
   */
  readonly cookies: (urls?: string | string[]) => Effect.Effect<readonly CdpCookie[], CdpError>;

  /**
   * Adds cookies to this page's session. Cookies are stored in the
   * underlying browser context and visible to all pages in it.
   *
   * @param cookies - Cookies to set. Each entry may use `url` (derived
   *   into domain/path/secure) or `domain`/`path` directly.
   *
   * @see {@link CdpContextHandle.addCookies} for the context-level equivalent.
   */
  readonly addCookies: (cookies: ReadonlyArray<CookieData>) => Effect.Effect<void, CdpError>;

  /**
   * Clears cookies in this page's session.
   *
   * Without options, clears all cookies in the browser. With options, deletes
   * the matching cookies — CDP requires `name` when filtering.
   *
   * @see {@link CdpContextHandle.clearCookies} for the context-level equivalent.
   */
  readonly clearCookies: (options?: {
    readonly name?: string;
    readonly domain?: string;
    readonly path?: string;
  }) => Effect.Effect<void, CdpError>;

  /**
   * Event stream of network requests emitted by the page.
   *
   * Returns an Effect that acquires a scoped subscription to `Network.requestWillBeSent`
   * CDP events. The subscription is **eager** - it happens immediately when the Effect
   * is yielded, ensuring no events are missed between subscription and consumption.
   *
   * Each request includes the URL, method, headers, and frame association.
   *
   * **Design Note:** See `onConsole` for the rationale behind the
   * `Effect.Effect<Stream.Stream<T>, never, Scope>` signature.
   *
   * @example
   * const requests = yield* page.onRequest;
   * yield* page.goto(url);
   * const req = yield* requests.pipe(Stream.take(1), Stream.runHead);
   */
  readonly onRequest: Effect.Effect<Stream.Stream<NetworkRequest>, never, Scope.Scope>;

  /**
   * Event stream of network responses received by the page.
   *
   * Returns an Effect that acquires a scoped subscription to `Network.responseReceived`
   * CDP events. The subscription is **eager** - it happens immediately when the Effect
   * is yielded.
   *
   * **Design Note:** See `onConsole` for the rationale behind the
   * `Effect.Effect<Stream.Stream<T>, never, Scope>` signature.
   */
  readonly onResponse: Effect.Effect<Stream.Stream<NetworkResponse>, never, Scope.Scope>;

  /**
   * Event stream of network request finished events.
   *
   * Returns an Effect that acquires a scoped subscription to `Network.loadingFinished`
   * CDP events. The subscription is **eager** - it happens immediately when the Effect
   * is yielded.
   *
   * **Design Note:** See `onConsole` for the rationale behind the
   * `Effect.Effect<Stream.Stream<T>, never, Scope>` signature.
   */
  readonly onRequestFinished: Effect.Effect<
    Stream.Stream<NetworkRequestFinished>,
    never,
    Scope.Scope
  >;

  /**
   * Event stream of failed network requests.
   *
   * Returns an Effect that acquires a scoped subscription to `Network.loadingFailed`
   * CDP events. The subscription is **eager** - it happens immediately when the Effect
   * is yielded.
   *
   * **Design Note:** See `onConsole` for the rationale behind the
   * `Effect.Effect<Stream.Stream<T>, never, Scope>` signature.
   */
  readonly onRequestFailed: Effect.Effect<Stream.Stream<NetworkRequestFailed>, never, Scope.Scope>;

  /**
   * Event stream of frame navigation events.
   *
   * Returns an Effect that acquires a scoped subscription to `Page.frameNavigated`
   * CDP events. The subscription is **eager** - it happens immediately when the Effect
   * is yielded, ensuring events are captured even if they fire immediately after
   * navigation.
   *
   * **Design Note:** See `onConsole` for the rationale behind the
   * `Effect.Effect<Stream.Stream<T>, never, Scope>` signature.
   *
   * @example
   * const events = yield* page.onFramenavigated;
   * yield* page.goto(url);  // Triggers framenavigated event
   * const frame = yield* events.pipe(Stream.take(1), Stream.runHead);
   */
  readonly onFramenavigated: Effect.Effect<Stream.Stream<CdpFrame>, never, Scope.Scope>;

  /**
   * Event stream of frame attachment events.
   *
   * Returns an Effect that acquires a scoped subscription to `Page.frameAttached`
   * CDP events. The subscription is **eager** - it happens immediately when the
   * Effect is yielded. Fires whenever a new subframe is attached to the page
   * (initial iframe load, dynamic iframe injection, re-attaching a removed
   * iframe).
   *
   * **Design Note:** See `onConsole` for the rationale behind the
   * `Effect.Effect<Stream.Stream<T>, never, Scope>` signature.
   *
   * @example
   * const events = yield* page.onFrameAttached;
   * const fiber = yield* Effect.fork(events.pipe(Stream.take(1), Stream.runHead));
   * yield* page.evaluate(() => {
   *   const f = document.createElement('iframe');
   *   f.src = 'about:blank';
   *   document.body.appendChild(f);
   * });
   * const frameOption = yield* fiber.pipe(Effect.flatten);
   */
  readonly onFrameAttached: Effect.Effect<Stream.Stream<CdpFrame>, never, Scope.Scope>;

  /**
   * Event stream of frame detachment events.
   *
   * Returns an Effect that acquires a scoped subscription to `Page.frameDetached`
   * CDP events. The subscription is **eager** - it happens immediately when the Effect
   * is yielded.
   *
   * **Design Note:** See `onConsole` for the rationale behind the
   * `Effect.Effect<Stream.Stream<T>, never, Scope>` signature.
   */
  readonly onFramedetached: Effect.Effect<Stream.Stream<CdpFrame>, never, Scope.Scope>;

  /**
   * Event stream of frame load completion events.
   *
   * Returns an Effect that acquires a scoped subscription to `Page.frameStoppedLoading`
   * CDP events. The subscription is **eager** - it happens immediately when the Effect
   * is yielded.
   *
   * `Page.frameStoppedLoading` fires when a frame has finished loading (the load
   * event has fired or the document failed to load). It is distinct from
   * `framenavigated` — `framenavigated` fires when navigation commits, while
   * `framestoppedloading` fires when loading actually completes.
   *
   * **Design Note:** See `onConsole` for the rationale behind the
   * `Effect.Effect<Stream.Stream<T>, never, Scope>` signature.
   */
  readonly onFramestoppedloading: Effect.Effect<Stream.Stream<CdpFrame>, never, Scope.Scope>;

  /**
   * Sets extra HTTP headers that will be sent with every request.
   *
   * Uses CDP `Network.setExtraHTTPHeaders` to add headers to all
   * subsequent requests. Overrides any previously set extra headers.
   *
   * @param headers - Record of header name-value pairs
   */
  readonly setExtraHTTPHeaders: (headers: Record<string, string>) => Effect.Effect<void, CdpError>;

  /**
   * Configures HTTP credentials for `Fetch.authRequired` responses.
   *
   * When the server returns a `401 Unauthorized` with `WWW-Authenticate`,
   * CDP fires a `Fetch.authRequired` event. The Route manager consumes
   * those events and responds with these credentials (subject to the
   * optional `origin` filter — see below).
   *
   * Pass `undefined` to clear the credentials; the browser will then
   * show its default auth prompt on subsequent challenges.
   *
   * Mirrors Playwright's `page.setHTTPCredentials` (per-page override of
   * context-level credentials).
   *
   * @param httpCredentials - Username/password plus optional origin filter
   */
  readonly setHTTPCredentials: (
    httpCredentials:
      | { readonly username: string; readonly password: string; readonly origin?: string }
      | undefined,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Registers a route handler for matching URLs.
   *
   * When a request's URL matches `url`, the request is paused and `handler`
   * is called with a `RouteHandle` and `InterceptedRequest`. The handler must
   * call exactly one of:
   * - `route.continue()` — let the request proceed (with optional overrides)
   * - `route.abort()` — block the request
   * - `route.fulfill()` — respond with synthetic data
   * - `route.fallback()` — skip to the next handler
   *
   * Routes are checked last-registered-first. If no handler matches or all
   * handlers call fallback(), the request continues normally.
   *
   * @param url - URL matching pattern: glob string, RegExp, or predicate
   * @param handler - Callback receiving RouteHandle and InterceptedRequest
   * @param options - Options
   *   - `times`: Auto-unroute after N matches
   */
  readonly route: (
    url: RouteUrlMatch,
    handler: RouteHandlerCallback,
    options?: RouteOptions,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Removes a route handler.
   *
   * If `handler` is provided, only removes handlers with both matching URL
   * and the exact same handler function reference. If omitted, removes all
   * handlers matching the URL pattern.
   *
   * @param url - URL matching pattern (must match the one used in `route()`)
   * @param handler - Optional specific handler to remove
   */
  readonly unroute: (
    url: RouteUrlMatch,
    handler?: RouteHandlerCallback,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Removes all route handlers.
   *
   * Clears all registered routes and disables Fetch interception.
   * Useful for cleanup before navigating to a new page or closing.
   */
  readonly unrouteAll: () => Effect.Effect<void, CdpError>;

  /**
   * Routes WebSocket connections matching `url` to `handler`.
   *
   * When the page creates a `new WebSocket(url)` whose URL matches, the
   * connection is intercepted and `handler` is called with a
   * `CdpWebSocketRoute`. The handler can:
   * - Call `ws.connectToServer()` to forward to the real server
   * - Mock the entire conversation via `ws.send()` and `ws.onPageMessage()`
   *
   * WebSockets whose URL doesn't match any registered pattern are passed
   * through to the real server transparently.
   *
   * @param url - URL matching pattern: glob string, RegExp, or predicate
   * @param handler - Callback receiving CdpWebSocketRoute
   */
  readonly routeWebSocket: (
    url: RouteUrlMatch,
    handler: CdpWebSocketRouteHandlerCallback,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Removes a WebSocket route handler.
   *
   * @param url - URL matching pattern (must match the one used in `routeWebSocket()`)
   * @param handler - Optional specific handler to remove
   */
  readonly unrouteWebSocket: (
    url: RouteUrlMatch,
    handler?: CdpWebSocketRouteHandlerCallback,
  ) => Effect.Effect<void, CdpError>;

  /**
   * Removes all WebSocket route handlers and closes all active WebSockets.
   */
  readonly unrouteAllWebSocket: () => Effect.Effect<void, CdpError>;

  /**
   * Escape hatch — raw CDP commands against this page's session.
   *
   * Use this for CDP operations not covered by curated methods.
   * The callback receives the CDP connection and the page's session ID.
   *
   * @param fn - Function receiving CDP connection and sessionId
   * @returns Effect resolving to the function result
   */
  readonly use: <A>(
    fn: (cdp: CdpConnectionService, sessionId: string) => Effect.Effect<A, CdpError>,
  ) => Effect.Effect<A, CdpError>;
}

// ── Service Implementation ────────────────────────────────────────────────────

/**
 * Subscribe to a PubSub hub and return a Stream backed by that subscription.
 *
 * Returns `Effect.Effect<Stream.Stream<T>, never, Scope.Scope>` so the
 * subscription is acquired eagerly when the Effect is yielded — no events
 * are lost between subscription and consumption. The Scope requirement
 * signals to consumers that they hold a resource that needs cleanup.
 *
 * Used by every `on*` event-stream accessor on {@link CdpPageService}.
 */
const subscribeStream = <T>(
  hub: PubSub.PubSub<T>,
): Effect.Effect<Stream.Stream<T>, never, Scope.Scope> =>
  Effect.map(PubSub.subscribe(hub), (subscription) => Stream.fromSubscription(subscription));

/**
 * Factory function that creates a {@link CdpPageService} for a specific
 * browser target. Subscribes to CDP messages and dispatches them through
 * {@link handlePageEvents}. The returned `close` method removes the
 * subscription and closes the target.
 *
 * @param targetId - The CDP target identifier for the page to control
 * @param contextTimeoutSettings - Optional context-level timeout settings (from CdpContextHandle)
 * @param contextHandle - Optional context handle. When provided, `page.context`
 *   returns this handle. When omitted (e.g., for short-lived restore pages
 *   in `addStorageState`), `page.context` fails with a clear error.
 */
export const make = (
  targetId: string,
  contextTimeoutSettings?: {
    readonly defaultTimeout: Ref.Ref<Duration.Duration | undefined>;
    readonly defaultNavigationTimeout: Ref.Ref<Duration.Duration | undefined>;
  },
  contextHandle?: CdpContextHandle,
) =>
  Effect.gen(function* () {
    const connection = yield* CdpConnection;

    // DurationInput → Duration conversion at the public API boundary.
    // All internal files receive Duration.Duration — zero fromInputUnsafe downstream.
    // Playwright convention: timeout: 0 means "no timeout" (disabled).
    //
    // Priority (matches Playwright's TimeoutSettings.timeout()):
    //   1. Explicit timeout provided → use it
    //   2. page.setDefaultTimeout(ms) was called → use it
    //   3. context.setDefaultTimeout(ms) was called → use it
    //   4. Hardcoded default → "30 seconds"
    const resolveTimeout = (timeout?: DurationInput): Effect.Effect<Duration.Duration> =>
      Effect.gen(function* () {
        if (timeout === 0) return Duration.infinity;
        if (timeout !== undefined) return Duration.fromInputUnsafe(timeout);
        const defaultTimeout = yield* Ref.get(state.defaultTimeout);
        if (defaultTimeout !== undefined) return defaultTimeout;
        // Check context-level timeout if available
        if (contextTimeoutSettings) {
          const contextDefaultTimeout = yield* Ref.get(contextTimeoutSettings.defaultTimeout);
          if (contextDefaultTimeout !== undefined) return contextDefaultTimeout;
        }
        return Duration.fromInputUnsafe("30 seconds");
      });

    // Resolve timeout for navigation operations (goto, setContent, waitForNavigation, etc.)
    // Priority (matches Playwright's TimeoutSettings.navigationTimeout()):
    //   1. Explicit timeout provided → use it
    //   2. page.setDefaultNavigationTimeout(ms) was called → use it
    //   3. page.setDefaultTimeout(ms) was called → use it
    //   4. context.setDefaultNavigationTimeout(ms) was called → use it
    //   5. context.setDefaultTimeout(ms) was called → use it
    //   6. Hardcoded default → "30 seconds"
    const resolveNavigationTimeout = (timeout?: DurationInput): Effect.Effect<Duration.Duration> =>
      Effect.gen(function* () {
        if (timeout === 0) return Duration.infinity;
        if (timeout !== undefined) return Duration.fromInputUnsafe(timeout);
        const defaultNavTimeout = yield* Ref.get(state.defaultNavigationTimeout);
        if (defaultNavTimeout !== undefined) return defaultNavTimeout;
        const defaultTimeout = yield* Ref.get(state.defaultTimeout);
        if (defaultTimeout !== undefined) return defaultTimeout;
        // Check context-level navigation timeout if available
        if (contextTimeoutSettings) {
          const contextNavTimeout = yield* Ref.get(contextTimeoutSettings.defaultNavigationTimeout);
          if (contextNavTimeout !== undefined) return contextNavTimeout;
          const contextDefaultTimeout = yield* Ref.get(contextTimeoutSettings.defaultTimeout);
          if (contextDefaultTimeout !== undefined) return contextDefaultTimeout;
        }
        return Duration.fromInputUnsafe("30 seconds");
      });

    const sessionId = yield* Ref.make<string | null>(null);
    const networkDetector = yield* makeNetworkIdleDetector;
    const mainFrameId = yield* Ref.make<string>(targetId); // CDP targetId === main frameId
    const frameManager = yield* makeFrameManager(targetId);

    // Frame cache for CdpFrame objects shared across:
    // - Network event frame() method
    // - page.mainFrame() and page.frames() properties
    // This ensures frame identity consistency (same frameId = same CdpFrame instance)
    const frameCache = new Map<string, CdpFrame>();

    // Hub for console events. Publishes ConsoleMessage events from Runtime.consoleAPICalled.
    // Scoped to the page's lifetime — cleaned up when the page scope closes.
    const consolePubSub = yield* PubSub.unbounded<ConsoleMessage>();

    // Hub for dialog events. Publishes CdpDialog events from
    // Page.javascriptDialogOpening. Consumers must call `dialog.accept(...)` /
    // `dialog.dismiss()` to respond (CDP will auto-dismiss after ~30s).
    const dialogPubSub = yield* PubSub.unbounded<CdpDialog>();

    // Hub for download events. Publishes CdpDownload events from
    // Browser.downloadWillBegin. Consumers can read the path / failure
    // via the CdpDownload.handle methods.
    const downloadPubSub = yield* PubSub.unbounded<CdpDownload>();

    // Hub for page error events. Publishes CdpPageError events from
    // Runtime.exceptionThrown. Useful for detecting silent failures in
    // scraped pages.
    const pageErrorPubSub = yield* PubSub.unbounded<CdpPageError>();

    // Hubs for network events (request, response, requestFinished, requestFailed).
    // Scoped to the page's lifetime — cleaned up when the page scope closes.
    const networkHubs = yield* makeNetworkEventHubs;

    // Hubs for frame events (frameNavigated, frameDetached).
    // Scoped to the page's lifetime — cleaned up when the page scope closes.
    const frameHubs = yield* makeFrameEventHubs;

    const state: PageState = {
      sessionId,
      mainFrameId,
      networkDetector,
      setContentCounter: yield* Ref.make(0),
      defaultTimeout: yield* Ref.make<Duration.Duration | undefined>(undefined),
      defaultNavigationTimeout: yield* Ref.make<Duration.Duration | undefined>(undefined),
      extraHTTPHeaders: yield* Ref.make<Record<string, string> | undefined>(undefined),
      currentModifierMask: yield* Ref.make(0),
      pressedKeys: yield* Ref.make(new Set<string>()),
      mouse: yield* Ref.make(makeMouseState()),
      bindings: yield* Ref.make<ReadonlyMap<string, PageBinding>>(new Map()),
      viewportSize: yield* Ref.make<ViewportSize | undefined>(undefined),
      closed: yield* Ref.make(false),
      downloads: yield* Ref.make<ReadonlyMap<string, DownloadTracker>>(new Map()),
      pageErrors: yield* Ref.make<readonly CdpPageError[]>([]),
      frameManager: yield* Ref.make(frameManager),
      credentials: yield* Ref.make<
        { username: string; password: string; origin?: string } | undefined
      >(undefined),
    };

    // Network response tracker — correlates requestWillBeSent with responseReceived
    // for goto/waitForNavigation Response objects.
    const responseTracker = yield* makeNetworkResponseTracker(connection, state.sessionId);

    // Route interception manager — handles Fetch.requestPaused events.
    const routeManager = yield* makeRouteManager(connection, state, responseTracker);

    // WebSocket route interception manager — handles WebSocket mock events
    // via the __pwWebSocketBinding CDP binding. The manager exposes a
    // `dispatch` method that the binding dispatcher calls for each
    // `Runtime.bindingCalled` event whose `name` is `WS_BINDING_NAME`.
    const routeWebSocketManager = yield* makeRouteWebSocketManager(connection, state);

    // Create a NetworkIdleProvider from the networkDetector for FrameManager composition
    const networkIdleProvider: NetworkIdleProvider = {
      waitForIdle: (idleTimeMs?: number) => networkDetector.waitForIdle(idleTimeMs),
      waitForIdleNoInitial: (idleTimeMs?: number) =>
        networkDetector.waitForIdleNoInitial(idleTimeMs),
    };

    // Frame factory function for network events.
    // Creates CdpFrame objects on-demand with proper FrameContext.
    const frameFactory: FrameFactory = (frameId: string) => {
      // Check cache first
      const cached = frameCache.get(frameId);
      if (cached) return Option.some(cached);

      // Check if frame exists in frameManager
      const metadata = frameManager.getFrameMetadata(frameId);
      if (!metadata) return Option.none();

      // Create the FrameContext with getAllFrames callback
      const ctx: FrameContext = {
        connection,
        frameManager,
        state,
        resolveTimeout,
        networkIdle: networkIdleProvider,
        responseTracker,
        targetId,
        page: pageObj,
        getAllFrames: () => Array.from(frameCache.values()),
      };

      // Create CdpFrame using factory
      const frame = makeCdpFrame(frameId, ctx);
      if (!frame) return Option.none();

      // Cache the frame
      frameCache.set(frameId, frame);
      return Option.some(frame);
    };

    // Fork network event tracker — runs as daemon so it survives scope exits.
    // The tracker must live as long as the page service, not just the make() scope.
    // Tracks in-flight requests for networkidle detection.
    // Ignores favicon requests (matches Playwright behavior).
    const tracker = connection.events.pipe(
      Stream.tap((msg) => {
        const requestId = getRequestIdFromParams(msg.params);
        if (!requestId) return Effect.void;

        const request = msg.params?.["request"];

        const isRequestForFavicon =
          Predicate.isObject(request) &&
          Predicate.hasProperty(request, "url") &&
          Predicate.isString(request.url) &&
          request.url.endsWith("/favicon.ico");
        if (isRequestForFavicon) return Effect.void;

        // Convert CDP event to NetworkEvent and handle it
        const event = Match.value(msg.method).pipe(
          Match.when("Network.requestWillBeSent", () => NetworkEvent.requestStarted({ requestId })),
          Match.when(isNetworkCompletionEvent, () => NetworkEvent.requestFinished({ requestId })),
          Match.orElse(() => null),
        );

        return event ? state.networkDetector.handleEvent(event) : Effect.void;
      }),
      Stream.runDrain,
      Effect.catchCause((cause) => Effect.logDebug("[cdp] network tracking stream ended", cause)),
    );
    // Network tracker bound to page's scope. Cleaned up when the page scope
    // closes (e.g., withPage exits). Previously used forkDetach because the
    // Layer.provide transient scope killed forkScoped fibers — now fixed by
    // using Effect.provideService instead.
    yield* Effect.forkScoped(tracker);

    // FrameTracker dispatch context — bundles all the closure-captured deps
    // that the per-event handlers below need. Keeping them in a single
    // object instead of threading 15+ params through every handler.
    const frameTrackerCtx = {
      frameManager,
      frameFactory,
      frameHubs,
      connection,
      state,
      targetId,
      mainFrameId,
      consolePubSub,
      dialogPubSub,
      downloadPubSub,
      pageErrorPubSub,
      routeWebSocketManager,
      makeDialogFromCdp,
      makeDownloadFromCdp,
      handleDownloadProgress,
      handleBindingCall,
    } as const;

    /**
     * Per-CDP-event handlers. Each one is a self-contained sub-state-machine
     * for one `msg.method` value. They're closure-scoped (not module-scope)
     * because they capture the FrameTrackerCtx and the few constants
     * (UTILITY_WORLD_NAME, GLOBAL_BINDING_NAME, WS_BINDING_NAME) from the
     * enclosing Effect.gen scope.
     */

    /** Page.frameAttached — register the frame, create its utility world. */
    const handleFrameAttached = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const params = msg.params as { frameId?: string; parentFrameId?: string } | undefined;
        if (!params?.frameId) return;
        yield* ctx.frameManager.onFrameCreated(params.frameId, {
          parentId: params.parentFrameId,
        });
        // Create utility world for this subframe (Playwright pattern)
        // Only if session is already established
        const sid = yield* Ref.get(ctx.state.sessionId);
        if (sid) {
          yield* ctx.connection.cdp.Page.createIsolatedWorld(
            {
              frameId: params.frameId,
              grantUniveralAccess: true,
              worldName: UTILITY_WORLD_NAME,
            },
            sid,
          ).pipe(Effect.catch(() => Effect.void));
        }
        // Publish to the frameAttached hub AFTER the frame is registered
        // (frameFactory would otherwise fail to resolve the CdpFrame).
        const cdpFrame = ctx.frameFactory(params.frameId);
        if (Option.isSome(cdpFrame)) {
          yield* PubSub.publish(ctx.frameHubs.frameAttachedHub, cdpFrame.value);
        }
      });

    /** Page.frameNavigated — register if unseen, increment epoch, update main-frame ref. */
    const handleFrameNavigated = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const frame = (
          msg.params as
            | {
                frame?: {
                  id?: string;
                  parentId?: string;
                  loaderId?: string;
                  url?: string;
                  name?: string;
                };
              }
            | undefined
        )?.frame;
        if (!frame) return;
        const frameId = frame.id ?? ctx.targetId;
        // Register frame if not seen (main frame doesn't send frameAttached)
        if (!ctx.frameManager.getFrameState(frameId)) {
          yield* ctx.frameManager.onFrameCreated(frameId, {
            parentId: frame.parentId,
            name: frame.name,
          });
        }
        yield* ctx.frameManager.onFrameNavigated({
          frameId,
          loaderId: frame.loaderId ?? "",
          url: frame.url,
          name: frame.name,
          parentId: frame.parentId,
        });
        // Update main frame ID for main-frame navigations
        if (frame.parentId === undefined) {
          yield* Ref.set(ctx.mainFrameId, frameId);
        }
        // Publish to frame navigation hub for event stream subscribers
        const cdpFrame = ctx.frameFactory(frameId);
        if (Option.isSome(cdpFrame)) {
          yield* PubSub.publish(ctx.frameHubs.frameNavigatedHub, cdpFrame.value);
        }
      });

    /** Page.documentOpened — setContent triggers this instead of frameNavigated. */
    const handleDocumentOpened = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const frame = (msg.params as { frame?: { id?: string; loaderId?: string } } | undefined)
          ?.frame;
        if (!frame) return;
        yield* ctx.frameManager.onFrameNavigated({
          frameId: frame.id ?? ctx.targetId,
          loaderId: frame.loaderId ?? "",
        });
      });

    /** Page.lifecycleEvent — add the lifecycle event to the frame's lifecycle set. */
    const handleLifecycleEvent = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> => {
      const params = msg.params as { frameId?: string; name?: string } | undefined;
      if (!params?.frameId || !params.name) return Effect.void;
      return ctx.frameManager.onLifecycleReached(params.frameId, params.name);
    };

    /** Page.frameDetached — resolve the CdpFrame, mark detached, publish to hub. */
    const handleFrameDetached = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const params = msg.params as { frameId?: string } | undefined;
        if (!params?.frameId) return;
        const frameId = params.frameId;
        // Get the CdpFrame before marking as detached (for event stream)
        const cdpFrame = ctx.frameFactory(frameId);
        yield* ctx.frameManager.onFrameDetached(frameId);
        if (Option.isSome(cdpFrame)) {
          yield* PubSub.publish(ctx.frameHubs.frameDetachedHub, cdpFrame.value);
        }
      });

    /**
     * Page.frameStoppedLoading — fires when a frame has finished loading.
     * Mirrors Playwright's `page.on('framestoppedloading')` event. This is
     * distinct from `framenavigated` — `framenavigated` fires on navigation
     * commit, while `framestoppedloading` fires when loading actually completes.
     */
    const handleFrameStoppedLoading = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> => {
      const params = msg.params as { frameId?: string } | undefined;
      if (!params?.frameId) return Effect.void;
      const cdpFrame = ctx.frameFactory(params.frameId);
      if (Option.isSome(cdpFrame)) {
        return PubSub.publish(ctx.frameHubs.frameStoppedLoadingHub, cdpFrame.value);
      }
      return Effect.void;
    };

    /**
     * Page.navigatedWithinDocument — same-document navigations (pushState,
     * history.back, hash). Cross-document navigations are handled by
     * Page.frameNavigated.
     */
    const handleNavigatedWithinDocument = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> => {
      const navParams = msg.params as { frameId?: string; url?: string } | undefined;
      if (!navParams?.frameId) return Effect.void;
      return ctx.frameManager.onNavigatedWithinDocument(navParams.frameId, navParams.url);
    };

    /**
     * Runtime.executionContextCreated — resolve the execution-context deferred
     * for the associated frame. Mirrors Playwright's `_onExecutionContextCreated`
     * → `frame._contextCreated()`. Both the default main world and the utility
     * world get their context IDs registered.
     */
    const handleExecutionContextCreated = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const ctxParams = msg.params as
          | {
              context?: {
                auxData?: { frameId?: string; isDefault?: boolean };
                id?: number;
                name?: string;
              };
            }
          | undefined;
        const context = ctxParams?.context;
        const auxData = context?.auxData;
        const contextName = context?.name;
        const contextId = context?.id;
        if (!auxData?.frameId) return;
        if (auxData.isDefault) {
          // Main world execution context
          yield* ctx.frameManager.onExecutionContextCreated(auxData.frameId, "main", contextId);
        }
        if (contextName === UTILITY_WORLD_NAME) {
          // Utility world execution context
          yield* ctx.frameManager.onExecutionContextCreated(auxData.frameId, "utility", contextId);
        }
      });

    /**
     * Runtime.consoleAPICalled — check for setContent tag messages and publish
     * to the console event hub. Playwright uses console.debug(tag) as a signal
     * that document.open() has fired during setContent.
     */
    const handleConsoleAPICalled = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> => {
      const consoleParams = msg.params as
        | { type?: string; args?: Array<{ value?: string; type?: string }> }
        | undefined;
      if (!consoleParams?.type) return Effect.void;
      // setContent tag handling (console.debug with string value)
      if (consoleParams?.args?.[0]?.value) {
        ctx.frameManager.handleConsoleMessage(consoleParams.type, consoleParams.args[0].value);
      }
      // Publish to console hub for page.onConsole consumers. Extract text from
      // args — matches Playwright's ConsoleMessage.text() which concatenates
      // arg values with spaces.
      const text = (consoleParams.args ?? []).map((arg) => String(arg.value ?? "")).join(" ");
      return PubSub.publish(ctx.consolePubSub, { type: consoleParams.type, text });
    };

    /**
     * Page.javascriptDialogOpening — publish CdpDialog to subscribers.
     * Subscribers MUST call dialog.accept() / dialog.dismiss() to respond.
     */
    const handleJavaScriptDialogOpening = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const dialogParams = msg.params as
          | {
              type?: string;
              message?: string;
              defaultPrompt?: string;
              url?: string;
            }
          | undefined;
        if (!dialogParams) return;
        const dialog = yield* ctx
          .makeDialogFromCdp(ctx.connection, ctx.state, dialogParams)
          .pipe(Effect.catch(() => Effect.void));
        if (dialog) {
          yield* PubSub.publish(ctx.dialogPubSub, dialog);
        }
      });

    /**
     * Browser.downloadWillBegin — publish CdpDownload. Browser.downloadProgress
     * updates the cached state which CdpDownload.path() reads.
     */
    const handleDownloadWillBegin = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const dlParams = msg.params as
          | {
              guid?: string;
              url?: string;
              suggestedFilename?: string;
              frameId?: string;
            }
          | undefined;
        if (!dlParams) return;
        const dl = yield* ctx.makeDownloadFromCdp(ctx.connection, ctx.state, dlParams);
        yield* PubSub.publish(ctx.downloadPubSub, dl);
      });

    /** Browser.downloadProgress — update the cached download state. */
    const handleDownloadProgressEvt = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> =>
      ctx.handleDownloadProgress(
        ctx.state,
        msg.params as {
          guid?: string;
          state?: "inProgress" | "completed" | "canceled";
          filePath?: string;
          error?: string;
        },
      );

    /**
     * Runtime.exceptionThrown — build a CdpPageError, publish to the page
     * error hub, and append to the snapshot ref so pageErrors() can read the
     * accumulated list.
     */
    const handleExceptionThrown = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const errParams = msg.params as
          | {
              exceptionDetails?: {
                text?: string;
                exception?: { description?: string };
                stackTrace?: {
                  callFrames?: ReadonlyArray<{
                    functionName?: string;
                    url?: string;
                    lineNumber?: number;
                    columnNumber?: number;
                  }>;
                };
              };
            }
          | undefined;
        if (!errParams?.exceptionDetails) return;
        const det = errParams.exceptionDetails;
        const frames = det.stackTrace?.callFrames ?? [];
        const stack = frames
          .map(
            (f) =>
              `    at ${f.functionName ?? "<anonymous>"} (${f.url ?? "?"}:${f.lineNumber ?? 0}:${f.columnNumber ?? 0})`,
          )
          .join("\n");
        const errorMsg: CdpPageError = {
          message: det.exception?.description ?? det.text ?? "Unknown error",
          stack: stack || undefined,
        };
        yield* PubSub.publish(ctx.pageErrorPubSub, errorMsg);
        // Also append to the snapshot ref so pageErrors() returns the
        // accumulated list. Non-destructive: both the stream (onPageError)
        // and the snapshot (pageErrors) read the same errors.
        yield* Ref.update(ctx.state.pageErrors, (xs) => [...xs, errorMsg]);
      });

    /**
     * Runtime.executionContextsCleared — all contexts are invalidated.
     * Fires during real navigations (goto, reload) but NOT during
     * document.open(). Resets context IDs and creates new unresolved
     * deferreds.
     */
    const handleExecutionContextsCleared = (
      _msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> => ctx.frameManager.onExecutionContextsCleared();

    /**
     * Runtime.bindingCalled — dispatched from the page-side bindings
     * controller when the page calls a function registered via
     * `page.exposeFunction` or `page.exposeBinding`. Routes the payload to
     * the registered callback and delivers the result back to the page.
     *
     * Two parallel binding names are handled here:
     * - GLOBAL_BINDING_NAME → handleBindingCall (user-exposed functions)
     * - WS_BINDING_NAME → routeWebSocketManager.dispatch (WebSocket mocks)
     */
    const handleBindingCalled = (
      msg: CdpMessage,
      ctx: typeof frameTrackerCtx,
    ): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const bindingParams = msg.params as
          | { name?: string; payload?: string; executionContextId?: number }
          | undefined;
        if (
          bindingParams?.name === GLOBAL_BINDING_NAME &&
          Predicate.isString(bindingParams.payload) &&
          Predicate.isNumber(bindingParams.executionContextId)
        ) {
          yield* ctx.handleBindingCall(
            ctx.connection,
            ctx.state,
            bindingParams.executionContextId,
            bindingParams.payload,
          );
        }
        // WebSocket route binding — dispatched from the page-side
        // WebSocketMock for events like onCreate, onMessageFromPage,
        // onClosePage, onMessageFromServer, onCloseServer.
        if (
          bindingParams?.name === WS_BINDING_NAME &&
          Predicate.isString(bindingParams.payload) &&
          Predicate.isNumber(bindingParams.executionContextId)
        ) {
          yield* ctx.routeWebSocketManager.dispatch(
            bindingParams.executionContextId,
            bindingParams.payload,
          );
        }
      });

    // FrameManager background fibers — route CDP events to per-frame state.
    // Replaces the old lifecycleEvents SubscriptionRef + lifecycleTracker.
    //
    // The per-event dispatch table below replaces a 320-line if-tree with a
    // single Match.value(msg.method) call. Each `Match.when("CDP.MethodName",
    // (m) => handleX(m, ctx))` delegates to the closure-scoped handler
    // defined above. Adding a new event type is a one-line change here; the
    // handler body is independently testable in its own function.
    const frameTracker = connection.events.pipe(
      Stream.tap((msg) =>
        Effect.gen(function* () {
          // Match.value(msg.method).pipe(...) returns a value (not an Effect)
          // when matched. Each `Match.when("CDP.MethodName", () => ...)` is a
          // zero-arg callback that captures `msg` from this Effect.gen scope
          // and returns an Effect. Match.exhaustive's return value is an Effect
          // (when every case returns an Effect), so we can yield* the whole
          // pipe directly.
          yield* Match.value(msg.method).pipe(
            Match.when("Page.frameAttached", () => handleFrameAttached(msg, frameTrackerCtx)),
            Match.when("Page.frameNavigated", () => handleFrameNavigated(msg, frameTrackerCtx)),
            Match.when("Page.documentOpened", () => handleDocumentOpened(msg, frameTrackerCtx)),
            Match.when("Page.lifecycleEvent", () => handleLifecycleEvent(msg, frameTrackerCtx)),
            Match.when("Page.frameDetached", () => handleFrameDetached(msg, frameTrackerCtx)),
            Match.when("Page.frameStoppedLoading", () =>
              handleFrameStoppedLoading(msg, frameTrackerCtx),
            ),
            Match.when("Page.navigatedWithinDocument", () =>
              handleNavigatedWithinDocument(msg, frameTrackerCtx),
            ),
            Match.when("Runtime.executionContextCreated", () =>
              handleExecutionContextCreated(msg, frameTrackerCtx),
            ),
            Match.when("Runtime.consoleAPICalled", () =>
              handleConsoleAPICalled(msg, frameTrackerCtx),
            ),
            Match.when("Page.javascriptDialogOpening", () =>
              handleJavaScriptDialogOpening(msg, frameTrackerCtx),
            ),
            Match.when("Browser.downloadWillBegin", () =>
              handleDownloadWillBegin(msg, frameTrackerCtx),
            ),
            Match.when("Browser.downloadProgress", () =>
              handleDownloadProgressEvt(msg, frameTrackerCtx),
            ),
            Match.when("Runtime.exceptionThrown", () =>
              handleExceptionThrown(msg, frameTrackerCtx),
            ),
            Match.when("Runtime.executionContextsCleared", () =>
              handleExecutionContextsCleared(msg, frameTrackerCtx),
            ),
            Match.when("Runtime.bindingCalled", () => handleBindingCalled(msg, frameTrackerCtx)),
            Match.orElse(() => Effect.void),
          );
        }),
      ),
      Stream.runDrain,
      Effect.catchCause((cause) => Effect.logDebug("[cdp] frame tracking stream ended", cause)),
    );
    yield* Effect.forkScoped(frameTracker);

    // Fork network event processor — publishes CDP Network events to PubSub hubs.
    // Subscribers can access onRequest, onResponse, onRequestFinished, onRequestFailed streams.
    const networkEventProcessor = makeNetworkEventProcessor(
      connection,
      networkHubs,
      frameFactory,
      targetId,
    );
    yield* Effect.forkScoped(networkEventProcessor);

    const pageObj = {
      targetId,
      // Title uses utility world (Playwright pattern). Waits for utility context
      // to be available before evaluating. The utility world is created after
      // the main world, giving the HTML parser time to process <title>.
      title: Effect.gen(function* () {
        const frameId = yield* Ref.get(mainFrameId);
        yield* frameManager.waitForExecutionContext(frameId, "utility");
        const contextId = yield* frameManager.getUtilityContextId(frameId);
        if (contextId === null) {
          // Fallback to main world if utility context ID is not available
          yield* frameManager.waitForExecutionContext(frameId, "main");
          return yield* evaluatePage(connection, state, () => document.title);
        }
        return yield* pageTitle(connection, state, contextId);
      }),
      // Content uses utility world too.
      content: Effect.gen(function* () {
        const frameId = yield* Ref.get(mainFrameId);
        yield* frameManager.waitForExecutionContext(frameId, "utility");
        const contextId = yield* frameManager.getUtilityContextId(frameId);
        if (contextId === null) {
          yield* frameManager.waitForExecutionContext(frameId, "main");
          return yield* evaluatePage(connection, state, () => document.documentElement.outerHTML);
        }
        return yield* pageContent(connection, state, contextId);
      }),
      url: Effect.sync(() => frameManager.getUrl()),
      mainFrame: Effect.gen(function* () {
        const mainId = yield* Ref.get(mainFrameId);

        // Check if main frame exists
        const metadata = frameManager.getFrameMetadata(mainId);
        if (!metadata) {
          return yield* new CdpErrorClass({
            source: "CdpPage",
            method: "mainFrame",
            reason: new NavigationError({ url: "frame", description: `Frame ${mainId} not found` }),
          });
        }

        // Cache for all frames - starts with just the main frame
        // Children are added lazily when getAllFrames is called
        const allFrames: CdpFrame[] = [];

        // Context with lazy getAllFrames
        const ctx: FrameContext = {
          connection,
          frameManager,
          state,
          resolveTimeout,
          networkIdle: networkIdleProvider,
          responseTracker,
          targetId,
          page: pageObj,
          getAllFrames: () => {
            // Lazily create child frames when first accessed
            // Only create children if we haven't already
            if (allFrames.length === 1) {
              // Create and add child frames
              for (const frameId of frameManager.getAllFrameIds()) {
                if (frameId === mainId) continue;
                const metadata = frameManager.getFrameMetadata(frameId);
                // Only include non-detached frames
                if (metadata && !metadata.isDetached) {
                  const frame = makeCdpFrame(frameId, {
                    connection,
                    frameManager,
                    state,
                    resolveTimeout,
                    networkIdle: networkIdleProvider,
                    responseTracker,
                    targetId,
                    page: pageObj,
                    getAllFrames: () => allFrames,
                  });
                  if (frame) allFrames.push(frame);
                }
              }
            }
            return allFrames;
          },
        };

        // Create the main frame (only once)
        const mainFrameObj = makeMainFrame(mainId, ctx);
        allFrames.push(mainFrameObj);

        return mainFrameObj;
      }),
      frames: Effect.gen(function* () {
        const mainId = yield* Ref.get(mainFrameId);

        // Create context with getAllFrames callback
        // allFrames will be populated as we create frames
        const allFrames: CdpFrame[] = [];
        const ctx: FrameContext = {
          connection,
          frameManager,
          state,
          resolveTimeout,
          networkIdle: networkIdleProvider,
          responseTracker,
          targetId,
          page: pageObj,
          getAllFrames: () => allFrames,
        };

        // Create main frame using the factory
        const mainFrameObj = makeMainFrame(mainId, ctx);
        allFrames.push(mainFrameObj);

        // Create child frames using the factory
        for (const frameId of frameManager.getAllFrameIds()) {
          if (frameId === mainId) continue; // Skip main frame
          const metadata = frameManager.getFrameMetadata(frameId);
          // Only include non-detached frames
          if (metadata && !metadata.isDetached) {
            const frame = makeCdpFrame(frameId, ctx);
            if (frame) {
              allFrames.push(frame);
            }
          }
        }

        return allFrames;
      }),
      frame: (selector: FrameSelector) =>
        Effect.gen(function* () {
          const mainId = yield* Ref.get(mainFrameId);

          // Build a frame-creation context (matches mainFrame / frames).
          const allFrames: CdpFrame[] = [];
          const ctx: FrameContext = {
            connection,
            frameManager,
            state,
            resolveTimeout,
            networkIdle: networkIdleProvider,
            responseTracker,
            targetId,
            page: pageObj,
            getAllFrames: () => allFrames,
          };
          const mainFrameObj = makeMainFrame(mainId, ctx);
          allFrames.push(mainFrameObj);

          // Build candidate frames from the frameManager (same source as
          // `frames()`). The local `allFrames` already holds the main frame;
          // append every non-detached child so the match loop below sees them.
          for (const frameId of frameManager.getAllFrameIds()) {
            if (frameId === mainId) continue;
            const metadata = frameManager.getFrameMetadata(frameId);
            if (metadata && !metadata.isDetached) {
              const child = makeCdpFrame(frameId, ctx);
              if (child) allFrames.push(child);
            }
          }

          // String selector: find iframe element in main frame, then map to
          // its content frame.
          if (Predicate.isString(selector)) {
            const frameId = yield* resolveFrameIdFromSelector(
              { connection, state, frameManager, getMainFrameId: () => Effect.succeed(mainId) },
              mainId,
              selector,
            );
            if (Option.isNone(frameId)) {
              return Option.none();
            }
            const childFrame = makeCdpFrame(frameId.value, ctx);
            if (!childFrame) {
              return Option.none();
            }
            // Populate allFrames with this child for downstream lookups.
            allFrames.push(childFrame);
            return Option.some(childFrame);
          }

          // Object selector ({ name?, url? }): walk the candidate frames and
          // return the first that satisfies both predicates. We can't use
          // `yield*` in a `for` loop per the linter, so reduce manually.
          const objSelector: { readonly name?: string; readonly url?: string | RegExp } = selector;
          const matched = yield* allFrames.reduce(
            (acc, candidate) =>
              Effect.flatMap(acc, (current) =>
                Option.isSome(current)
                  ? Effect.succeed(current)
                  : Effect.gen(function* () {
                      if (candidate.frameId === mainId) {
                        return Option.none<CdpFrame>();
                      }
                      const name = yield* candidate.name;
                      const url = yield* candidate.url;
                      if (
                        frameSelectorMatchesName(objSelector, name) &&
                        frameSelectorMatchesUrl(objSelector, url)
                      ) {
                        return Option.some(candidate);
                      }
                      return Option.none();
                    }),
              ),
            Effect.succeed(Option.none<CdpFrame>()),
          );
          return matched;
        }) as Effect.Effect<Option.Option<CdpFrame>, CdpError, never>,
      frameLocator: (selector: string) => {
        // Lazy: defers frame resolution until the returned FrameLocator /
        // chained CdpLocator is actually used. `getMainFrameId` is a thunk
        // (reads `Ref.get(mainFrameId)`) so the resolved frame tracks
        // post-navigation main frame changes.
        const flCtx: FrameLocatorCtx = {
          connection,
          state,
          frameManager,
          getMainFrameId: () => Ref.get(mainFrameId),
        };
        return makeCdpFrameLocator(flCtx, selector);
      },
      context: contextHandle
        ? Effect.succeed(contextHandle)
        : Effect.fail(
            new CdpErrorClass({
              source: "CdpPage",
              method: "context",
              reason: new EvaluationError({
                description: "Page was created without a context handle",
              }),
            }),
          ),
      goto: (
        url: string,
        options?: { waitUntil?: WaitUntil; timeout?: DurationInput; referer?: string },
      ) =>
        Effect.gen(function* () {
          return yield* gotoPage(
            connection,
            state,
            frameManager,
            networkIdleProvider,
            responseTracker,
            targetId,
            url,
            {
              waitUntil: options?.waitUntil,
              timeout: yield* resolveNavigationTimeout(options?.timeout),
              referer: options?.referer,
            },
          );
        }),
      reload: (options?: { waitUntil?: WaitUntil; timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* reloadPage(
            connection,
            state,
            frameManager,
            networkIdleProvider,
            responseTracker,
            targetId,
            {
              waitUntil: options?.waitUntil,
              timeout: yield* resolveNavigationTimeout(options?.timeout),
            },
          );
        }),
      setContent: (html: string, options?: { waitUntil?: WaitUntil; timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* setContentPage(
            connection,
            state,
            frameManager,
            networkIdleProvider,
            targetId,
            html,
            {
              waitUntil: options?.waitUntil,
              timeout: yield* resolveNavigationTimeout(options?.timeout),
            },
          );
        }),
      goBack: (options?: { waitUntil?: WaitUntil; timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* goBackPage(connection, state, frameManager, networkIdleProvider, targetId, {
            waitUntil: options?.waitUntil,
            timeout: yield* resolveNavigationTimeout(options?.timeout),
          });
        }),
      goForward: (options?: { waitUntil?: WaitUntil; timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* goForwardPage(
            connection,
            state,
            frameManager,
            networkIdleProvider,
            targetId,
            {
              waitUntil: options?.waitUntil,
              timeout: yield* resolveNavigationTimeout(options?.timeout),
            },
          );
        }),
      waitForNavigation: (options?: {
        waitUntil?: WaitUntil;
        timeout?: DurationInput;
        url?: UrlMatch;
      }) => {
        // Eager snapshot: capture targetNav NOW (at call time), not when yielded.
        // This enables the Playwright handle pattern where you call waitForNavigation()
        // before triggering the navigation.
        const waitUntil = options?.waitUntil ?? "load";
        const frameId = frameManager.getMainFrameId();
        const { state: stateRef, targetNav } = snapshotTargetNav(frameManager, frameId, waitUntil);
        const lifecycleTarget: WaitUntil = waitUntil === "networkidle" ? "load" : waitUntil;

        // Return Effect that waits for the already-captured target epoch
        // and resolves to the navigation's Response (Option.none for
        // same-document navigations, waitUntil: "commit", or response timeout).
        return Effect.gen(function* () {
          const timeout = yield* resolveNavigationTimeout(options?.timeout);
          const finalState = yield* waitForNavEpoch(stateRef, {
            method: "waitForNavigation",
            targetNav,
            lifecycleTarget,
            timeout,
            urlMatch: options?.url,
          });

          // For networkidle, compose with network detector AFTER load.
          if (waitUntil === "networkidle" && networkIdleProvider) {
            yield* networkIdleProvider.waitForIdleNoInitial().pipe(
              Effect.timeout(timeout),
              Effect.mapError(() => makeTimeoutError("waitForNavigation", timeout)),
            );
          }

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

          // Wait for the response correlated by loaderId. The response may
          // arrive slightly after the navigation lifecycle event, so we
          // race a short timeout — if it doesn't arrive, return Option.none.
          const responseData = yield* responseTracker
            .waitForNavigationResponse(loaderId, finalState.url)
            .pipe(
              Effect.timeout("1 second"),
              Effect.catchTag("TimeoutError", () => Effect.void),
            );

          if (!responseData) {
            return Option.none<Response>();
          }

          return Option.some(makeResponse(connection, state, responseTracker, responseData));
        });
      },
      waitForURL: (url: UrlMatch, options?: { waitUntil?: WaitUntil; timeout?: DurationInput }) => {
        // Eager snapshot: capture targetNav NOW (at call time), not when yielded.
        const waitUntil = options?.waitUntil ?? "load";
        const frameId = frameManager.getMainFrameId();
        const { state, targetNav } = snapshotTargetNav(frameManager, frameId, waitUntil, url);
        const lifecycleTarget: WaitUntil = waitUntil === "networkidle" ? "load" : waitUntil;

        return Effect.gen(function* () {
          const timeout = yield* resolveNavigationTimeout(options?.timeout);
          yield* waitForNavEpoch(state, {
            method: "waitForURL",
            targetNav,
            lifecycleTarget,
            timeout,
            urlMatch: url,
          });

          // For networkidle, compose with network detector AFTER load.
          if (waitUntil === "networkidle" && networkIdleProvider) {
            yield* networkIdleProvider.waitForIdleNoInitial().pipe(
              Effect.timeout(timeout),
              Effect.mapError(() => makeTimeoutError("waitForURL", timeout)),
            );
          }
        });
      },
      waitForLoadState: (state?: WaitUntil, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          const frameId = yield* Ref.get(mainFrameId);
          yield* waitForLoadStateFrame(frameManager, frameId, state ?? "load", {
            networkDetector: networkIdleProvider,
            timeout: yield* resolveNavigationTimeout(options?.timeout),
          });
        }),
      evaluate: <T>(pageFunction: EvaluateFn<T>, arg?: unknown) =>
        Effect.gen(function* () {
          const frameId = yield* Ref.get(mainFrameId);
          yield* frameManager.waitForExecutionContext(frameId, "main");
          const contextId = yield* frameManager.getMainContextId(frameId);
          return yield* evaluatePage(connection, state, pageFunction, arg, contextId ?? undefined);
        }),
      evaluateHandle: <T>(pageFunction: EvaluateFn<T>, arg?: unknown) =>
        Effect.gen(function* () {
          const frameId = yield* Ref.get(mainFrameId);
          yield* frameManager.waitForExecutionContext(frameId, "main");
          return yield* evaluateHandlePage(connection, state, pageFunction, arg);
        }),
      $eval: <T, Arg = unknown>(
        selector: string,
        pageFunction: (element: Element, arg: Arg) => T,
        arg?: Arg,
        options?: { timeout?: DurationInput },
      ) =>
        Effect.gen(function* () {
          return yield* $evalElement(
            connection,
            state,
            selector,
            pageFunction,
            arg as Arg,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      $$eval: <T, Arg = unknown>(
        selector: string,
        pageFunction: (elements: Array<Element>, arg: Arg) => T,
        arg?: Arg,
      ) =>
        Effect.gen(function* () {
          return yield* $$evalElements(connection, state, selector, pageFunction, arg as Arg);
        }),
      // ── Locator API ─────────────────────────────────────────────────────────
      // Each method returns a lazy CdpLocator that delegates to the existing
      // page.* methods on action. The factory closes over `connection` and
      // `state` for the few operations that need raw CDP access (e.g. resolve
      // an indexed element for nth()/first()/last()).
      locator: (selector: string, options?: LocatorOptions) => {
        const ctx = { page: pageObj, connection, state };
        const loc = makeCdpLocator(ctx, selector);
        if (!options) return loc;
        return loc.filter(options);
      },
      getByRole: (role: string, options?: ByRoleOptions) =>
        makeCdpLocator(
          { page: pageObj, connection, state },
          `[role="${role.replace(/["\\]/g, "\\$&")}"]${
            options
              ? [
                  options.checked !== undefined ? `[aria-checked="${options.checked}"]` : "",
                  options.disabled !== undefined ? `[aria-disabled="${options.disabled}"]` : "",
                  options.expanded !== undefined ? `[aria-expanded="${options.expanded}"]` : "",
                  options.pressed !== undefined ? `[aria-pressed="${options.pressed}"]` : "",
                  options.selected !== undefined ? `[aria-selected="${options.selected}"]` : "",
                  options.level !== undefined ? `[aria-level="${options.level}"]` : "",
                  options.name !== undefined
                    ? `[aria-label="${
                        options.name instanceof RegExp
                          ? ""
                          : (options.name as string).replace(/["\\]/g, "\\$&")
                      }"]`
                    : "",
                ].join("")
              : ""
          }`,
        ),
      getByText: (text: string | RegExp, _options?: TextMatchOptions) =>
        makeCdpLocator(
          { page: pageObj, connection, state },
          text instanceof RegExp
            ? `text=/${text.source}/${text.flags}`
            : `text="${text.replace(/["\\]/g, "\\$&")}"`,
        ),
      getByLabel: (text: string | RegExp, _options?: TextMatchOptions) =>
        makeCdpLocator(
          { page: pageObj, connection, state },
          text instanceof RegExp
            ? `[aria-label]`
            : `[aria-label="${text.replace(/["\\]/g, "\\$&")}"]`,
        ),
      getByTestId: (testId: string | RegExp) =>
        makeCdpLocator(
          { page: pageObj, connection, state },
          testId instanceof RegExp
            ? `[data-testid]`
            : `[data-testid="${testId.replace(/["\\]/g, "\\$&")}"]`,
        ),
      getByPlaceholder: (text: string | RegExp, _options?: TextMatchOptions) =>
        makeCdpLocator(
          { page: pageObj, connection, state },
          text instanceof RegExp
            ? `[placeholder]`
            : `[placeholder="${text.replace(/["\\]/g, "\\$&")}"]`,
        ),
      getByAltText: (text: string | RegExp, _options?: TextMatchOptions) =>
        makeCdpLocator(
          { page: pageObj, connection, state },
          text instanceof RegExp ? `[alt]` : `[alt="${text.replace(/["\\]/g, "\\$&")}"]`,
        ),
      getByTitle: (text: string | RegExp, _options?: TextMatchOptions) =>
        makeCdpLocator(
          { page: pageObj, connection, state },
          text instanceof RegExp ? `[title]` : `[title="${text.replace(/["\\]/g, "\\$&")}"]`,
        ),
      fetch: (url: string, options?: FetchOptions) => fetchPage(connection, state, url, options),
      httpClient: makePageHttpClient((url, options) => fetchPage(connection, state, url, options)),
      request: makeCdpRequestClient(connection, state),
      textContent: (selector: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* textContentElement(
            connection,
            state,
            selector,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      innerText: (selector: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* innerTextElement(
            connection,
            state,
            selector,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      innerHTML: (selector: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* innerHtmlElement(
            connection,
            state,
            selector,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      getAttribute: (selector: string, name: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* getElementAttribute(
            connection,
            state,
            selector,
            name,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      inputValue: (selector: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* inputValueElement(
            connection,
            state,
            selector,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      waitForRequest: (
        urlOrPredicate: RequestUrlOrPredicate,
        options?: { timeout?: DurationInput },
      ) =>
        Effect.gen(function* () {
          return yield* waitForRequestPage(connection, state, targetId, urlOrPredicate, {
            timeout: yield* resolveTimeout(options?.timeout),
          });
        }),
      waitForResponse: (
        urlOrPredicate: ResponseUrlOrPredicate,
        options?: { timeout?: DurationInput },
      ) =>
        Effect.gen(function* () {
          return yield* waitForResponsePage(connection, state, targetId, urlOrPredicate, {
            timeout: yield* resolveTimeout(options?.timeout),
          });
        }),
      waitForRequestFailed: (
        urlOrPredicate: RequestFailedUrlOrPredicate,
        options?: { timeout?: DurationInput },
      ) =>
        Effect.gen(function* () {
          return yield* waitForRequestFailed(connection, state, targetId, urlOrPredicate, {
            timeout: yield* resolveTimeout(options?.timeout),
          });
        }),
      waitForTimeout: (ms: number) => sleep(ms),
      waitForSelector: (
        selector: string,
        options?: {
          state?: WaitForSelectorState;
          timeout?: DurationInput;
          pierceShadowDOM?: boolean;
        },
      ) =>
        Effect.gen(function* () {
          return yield* waitForSelectorElement(connection, state, selector, {
            state: options?.state,
            timeout: yield* resolveTimeout(options?.timeout),
            pierceShadowDOM: options?.pierceShadowDOM,
          });
        }),
      waitForFunction: <T, Arg = void>(
        pageFunction: EvaluateFn<T>,
        arg?: Arg,
        options?: { timeout?: DurationInput; polling?: number | "raf" },
      ) =>
        Effect.gen(function* () {
          return yield* waitForFunctionPage(connection, state, pageFunction, arg, {
            timeout: yield* resolveTimeout(options?.timeout),
            polling: options?.polling,
          });
        }),
      click: (
        selector: string,
        options?: {
          button?: MouseButton;
          modifiers?: ReadonlyArray<ClickModifier>;
          clickCount?: number;
          position?: { readonly x: number; readonly y: number };
          force?: boolean;
          trial?: boolean;
          timeout?: DurationInput;
        },
      ) =>
        Effect.gen(function* () {
          return yield* clickElement(connection, state, selector, {
            button: options?.button,
            modifiers: options?.modifiers,
            clickCount: options?.clickCount,
            position: options?.position,
            force: options?.force,
            trial: options?.trial,
            timeout: yield* resolveTimeout(options?.timeout),
          });
        }),
      dblclick: (selector: string, options?: { trial?: boolean; timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* dblclickElement(connection, state, targetId, selector, {
            trial: options?.trial,
            timeout: yield* resolveTimeout(options?.timeout),
          });
        }),
      tap: (
        selector: string,
        options?: {
          position?: { readonly x: number; readonly y: number };
          force?: boolean;
          trial?: boolean;
          timeout?: DurationInput;
        },
      ) =>
        Effect.gen(function* () {
          return yield* tapElement(connection, state, selector, {
            position: options?.position,
            force: options?.force,
            trial: options?.trial,
            timeout: yield* resolveTimeout(options?.timeout),
          });
        }),
      hover: (selector: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* hoverElement(
            connection,
            state,
            targetId,
            selector,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      fill: (selector: string, value: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* fillElement(
            connection,
            state,
            selector,
            value,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      focus: (selector: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* focusElement(
            connection,
            state,
            selector,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      blur: (selector: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* blurElement(
            connection,
            state,
            selector,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      type: (
        selector: string,
        text: string,
        options?: { delay?: number; timeout?: DurationInput },
      ) =>
        Effect.gen(function* () {
          return yield* typeIntoElement(connection, state, selector, text, {
            delay: options?.delay,
            timeout: yield* resolveTimeout(options?.timeout),
          });
        }),
      press: (selector: string, key: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* pressKey(
            connection,
            state,
            selector,
            key,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      keyboard: {
        down: (key: string) => keyboardDown(connection, state, key),
        up: (key: string) => keyboardUp(connection, state, key),
        press: (key: string) => keyboardPress(connection, state, key),
        type: (text: string, options?: { delay?: number }) =>
          keyboardType(connection, state, text, options),
        insertText: (text: string) => insertText(connection, state, text),
      },
      mouse: {
        move: (x: number, y: number, options?: MouseMoveOptions) =>
          mouseMove(connection, state, x, y, options),
        down: (options?: MouseToggleOptions) => mouseDown(connection, state, options),
        up: (options?: MouseToggleOptions) => mouseUp(connection, state, options),
        click: (x: number, y: number, options?: MouseClickOptions) =>
          mouseClick(connection, state, x, y, options),
        dblclick: (x: number, y: number, options?: Omit<MouseClickOptions, "clickCount">) =>
          mouseClick(connection, state, x, y, { ...options, clickCount: 2 }),
        wheel: (deltaX: number, deltaY: number) => mouseWheel(connection, state, deltaX, deltaY),
      },
      touchscreen: {
        tap: (x: number, y: number) => touchscreenTap(connection, state, x, y),
      },
      check: (selector: string, options?: { trial?: boolean; timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* checkElement(connection, state, targetId, selector, {
            trial: options?.trial,
            timeout: yield* resolveTimeout(options?.timeout),
          });
        }),
      uncheck: (selector: string, options?: { trial?: boolean; timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* uncheckElement(connection, state, targetId, selector, {
            trial: options?.trial,
            timeout: yield* resolveTimeout(options?.timeout),
          });
        }),
      setChecked: (
        selector: string,
        checked: boolean,
        options?: { trial?: boolean; timeout?: DurationInput },
      ) =>
        Effect.gen(function* () {
          return yield* setCheckedElement(connection, state, targetId, selector, checked, {
            trial: options?.trial,
            timeout: yield* resolveTimeout(options?.timeout),
          });
        }),
      selectOption: <T extends string | { value?: string; label?: string; index?: number }>(
        selector: string,
        values: T | T[] | null,
        options?: { timeout?: DurationInput },
      ) =>
        Effect.gen(function* () {
          const frameId = yield* Ref.get(mainFrameId);
          yield* frameManager.waitForExecutionContext(frameId, "utility");
          const utilityContextId = yield* frameManager.getUtilityContextId(frameId);
          if (utilityContextId === null) {
            return yield* new CdpErrorClass({
              source: "CdpPage",
              method: "selectOption",
              reason: new EvaluationError({ description: "Utility context not available" }),
            });
          }
          return yield* selectOptionViaInjectedScript(
            connection,
            state,
            frameManager,
            frameId,
            selector,
            values,
            yield* resolveTimeout(options?.timeout),
            utilityContextId,
          );
        }),
      isHidden: (selector: string) => isHiddenElement(connection, state, selector),
      isVisible: (selector: string) => isVisibleElement(connection, state, selector),
      setViewportSize: (viewport: ViewportSize) => setViewportSize(connection, state, viewport),
      viewportSize: () => getViewportSize(state),
      isChecked: (selector: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* isCheckedElement(
            connection,
            state,
            selector,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      isDisabled: (selector: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* isDisabledElement(
            connection,
            state,
            selector,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      isEditable: (selector: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* isEditableElement(
            connection,
            state,
            selector,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      isEnabled: (selector: string, options?: { timeout?: DurationInput }) =>
        Effect.gen(function* () {
          return yield* isEnabledElement(
            connection,
            state,
            selector,
            yield* resolveTimeout(options?.timeout),
          );
        }),
      screenshot: (options?: ScreenshotOptions) => captureScreenshot(connection, state, options),
      pdf: (options?: PdfOptions) => generatePdf(connection, state, options),
      close: () =>
        connection.cdp.Target.closeTarget({ targetId }).pipe(
          Effect.tap(() => Ref.set(state.closed, true)),
          Effect.ignore,
        ),
      isClosed: () => Ref.get(state.closed),
      bringToFront: () => connection.cdp.Page.bringToFront().pipe(Effect.ignore),
      dispatchEvent: (selector: string, type: string, eventInit?: Record<string, unknown>) =>
        dispatchEvent(connection, state, selector, type, eventInit),
      addScriptTag: (options: AddScriptTagOptions) => addScriptTag(connection, state, options),
      setInputFiles: (selector: string, files: ReadonlyArray<InputFile>) =>
        setInputFiles(connection, state, selector, files),
      dragAndDrop: (source: string, target: string) =>
        dragAndDrop(connection, state, source, target),
      setDefaultTimeout: (timeout: number) =>
        Ref.set(state.defaultTimeout, timeout === 0 ? Duration.infinity : Duration.millis(timeout)),
      setDefaultNavigationTimeout: (timeout: number) =>
        Ref.set(
          state.defaultNavigationTimeout,
          timeout === 0 ? Duration.infinity : Duration.millis(timeout),
        ),
      addInitScript: (script: EvaluateFn<unknown>) =>
        Effect.gen(function* () {
          const sid = yield* ensureSession(state);
          const source = Predicate.isFunction(script)
            ? `(() => { (${script.toString()})(); })();`
            : `(() => { ${script} })();`;
          yield* connection.cdp.Page.addScriptToEvaluateOnNewDocument({ source }, sid).pipe(
            Effect.mapError(
              (cause) =>
                new CdpErrorClass({
                  source: "CdpPage",
                  method: "addInitScript",
                  reason: new EvaluationError({ description: String(cause) }),
                }),
            ),
          );
        }),
      exposeFunction: <Args extends ReadonlyArray<unknown>, R>(
        name: string,
        callback: (...args: Args) => R | Promise<R> | Effect.Effect<R, never, never>,
      ) =>
        Effect.gen(function* () {
          // Ensure the session is attached — `Runtime.addBinding` and
          // `Page.addScriptToEvaluateOnNewDocument` need a session ID.
          // Mirrors the pattern used by `setExtraHTTPHeaders` / `route`.
          const currentSid = yield* Ref.get(state.sessionId);
          if (!currentSid) {
            yield* attachToTarget(connection, state, targetId);
          }
          const binding: PageBinding = {
            name,
            exposeSource: false,
            needsHandle: false,
            callback: callback as PageBinding["callback"],
          };
          yield* registerBinding(connection, state, binding);
        }),
      exposeBinding: <Args extends ReadonlyArray<unknown>, R>(
        name: string,
        callback: (
          source: unknown,
          ...args: Args
        ) => R | Promise<R> | Effect.Effect<R, never, never>,
        options?: { readonly handle?: boolean },
      ) =>
        Effect.gen(function* () {
          const currentSid = yield* Ref.get(state.sessionId);
          if (!currentSid) {
            yield* attachToTarget(connection, state, targetId);
          }
          const binding: PageBinding = {
            name,
            exposeSource: true,
            needsHandle: options?.handle === true,
            callback: callback as PageBinding["callback"],
          };
          yield* registerBinding(connection, state, binding);
        }),
      onConsole: subscribeStream(consolePubSub),
      onDialog: onDialogStream(dialogPubSub),
      onPageError: subscribeStream(pageErrorPubSub),
      pageErrors: () => Ref.get(state.pageErrors),
      onDownload: (options: { readonly downloadPath: string }) =>
        Effect.gen(function* () {
          yield* configureDownloads(connection, options.downloadPath);
          return yield* onDownloadStream(downloadPubSub);
        }),
      emulateMedia: (options: EmulateMediaOptions) =>
        emulateMedia(connection, state, targetId, options),
      addStyleTag: (options: AddStyleTagOptions) => addStyleTag(connection, state, options),
      localStorage: () => getStorage(connection, state, "local"),
      sessionStorage: () => getStorage(connection, state, "session"),
      setLocalStorageItem: (key: string, value: string) =>
        setStorageItem(connection, state, "local", key, value),
      setSessionStorageItem: (key: string, value: string) =>
        setStorageItem(connection, state, "session", key, value),
      clearLocalStorage: () => clearStorage(connection, state, "local"),
      clearSessionStorage: () => clearStorage(connection, state, "session"),
      cookies: (urls?: string | string[]) =>
        Effect.gen(function* () {
          const sid = yield* ensureSession(state);
          return yield* getCookies(connection, sid, urls);
        }),
      addCookies: (cookies: ReadonlyArray<CookieData>) =>
        Effect.gen(function* () {
          const sid = yield* ensureSession(state);
          yield* addCookies(connection, sid, [...cookies]);
        }),
      clearCookies: (options?: {
        readonly name?: string;
        readonly domain?: string;
        readonly path?: string;
      }) =>
        Effect.gen(function* () {
          const sid = yield* ensureSession(state);
          yield* clearCookies(connection, sid, options);
        }),
      onRequest: subscribeStream(networkHubs.requestHub),
      onResponse: subscribeStream(networkHubs.responseHub),
      onRequestFinished: subscribeStream(networkHubs.requestFinishedHub),
      onRequestFailed: subscribeStream(networkHubs.requestFailedHub),
      onFramenavigated: subscribeStream(frameHubs.frameNavigatedHub),
      onFrameAttached: subscribeStream(frameHubs.frameAttachedHub),
      onFramedetached: subscribeStream(frameHubs.frameDetachedHub),
      onFramestoppedloading: subscribeStream(frameHubs.frameStoppedLoadingHub),
      setExtraHTTPHeaders: (headers: Record<string, string>) =>
        Effect.gen(function* () {
          const currentSid = yield* Ref.get(state.sessionId);
          if (!currentSid) {
            yield* attachToTarget(connection, state, targetId);
          }
          yield* setExtraHTTPHeaders(connection, state, headers);
        }),
      setHTTPCredentials: (
        httpCredentials:
          | { readonly username: string; readonly password: string; readonly origin?: string }
          | undefined,
      ) =>
        Effect.gen(function* () {
          const currentSid = yield* Ref.get(state.sessionId);
          if (!currentSid) {
            yield* attachToTarget(connection, state, targetId);
          }
          // Store credentials in page state. The Route manager's
          // Fetch.authRequired listener reads from this Ref on every event,
          // so `undefined` immediately stops providing credentials.
          yield* Ref.set(state.credentials, httpCredentials);
          // If credentials are now set and no routes are registered yet,
          // ensure Fetch is enabled so authRequired events start flowing.
          if (httpCredentials) {
            yield* routeManager.enableFetchForAuth();
          }
        }),
      route: (url: RouteUrlMatch, handler: RouteHandlerCallback, options?: RouteOptions) =>
        Effect.gen(function* () {
          const currentSid = yield* Ref.get(state.sessionId);
          if (!currentSid) {
            yield* attachToTarget(connection, state, targetId);
          }
          yield* routeManager.route(url, handler, options);
        }),
      unroute: (url: RouteUrlMatch, handler?: RouteHandlerCallback) =>
        Effect.gen(function* () {
          const currentSid = yield* Ref.get(state.sessionId);
          if (!currentSid) {
            yield* attachToTarget(connection, state, targetId);
          }
          yield* routeManager.unroute(url, handler);
        }),
      unrouteAll: () =>
        Effect.gen(function* () {
          const currentSid = yield* Ref.get(state.sessionId);
          if (!currentSid) {
            yield* attachToTarget(connection, state, targetId);
          }
          yield* routeManager.unrouteAll();
        }),
      routeWebSocket: (url: RouteUrlMatch, handler: CdpWebSocketRouteHandlerCallback) =>
        Effect.gen(function* () {
          const currentSid = yield* Ref.get(state.sessionId);
          if (!currentSid) {
            yield* attachToTarget(connection, state, targetId);
          }
          yield* routeWebSocketManager.routeWebSocket(url, handler);
        }),
      unrouteWebSocket: (url: RouteUrlMatch, handler?: CdpWebSocketRouteHandlerCallback) =>
        Effect.gen(function* () {
          const currentSid = yield* Ref.get(state.sessionId);
          if (!currentSid) {
            yield* attachToTarget(connection, state, targetId);
          }
          yield* routeWebSocketManager.unrouteWebSocket(url, handler);
        }),
      unrouteAllWebSocket: () =>
        Effect.gen(function* () {
          const currentSid = yield* Ref.get(state.sessionId);
          if (!currentSid) {
            yield* attachToTarget(connection, state, targetId);
          }
          yield* routeWebSocketManager.unrouteAllWebSocket();
        }),
      use: <A>(fn: (cdp: CdpConnectionService, sessionId: string) => Effect.Effect<A, CdpError>) =>
        Effect.gen(function* () {
          const currentSid = yield* Ref.get(state.sessionId);
          if (!currentSid) {
            yield* attachToTarget(connection, state, targetId);
          }
          const sid = yield* ensureSession(state);
          return yield* fn(connection, sid);
        }),
    } as const;
    return pageObj;
  });

/**
 * CDP Page service tag.
 *
 * Use `CdpPage.layer(targetId)` to create a layer for a specific browser target,
 * then provide it via `Effect.provide` to make the service available.
 */
export class CdpPage extends Context.Service<CdpPage, CdpPageService>()(
  "effect-libs/browser/CdpPage",
  { make },
) {
  /**
   * Raw layer with CdpConnection dependency in the R channel.
   * Use this when you want to provide your own CdpConnection implementation.
   *
   * @param targetId - The CDP target identifier for the page to control
   * @returns An Effect Layer that produces a `CdpPage` service, requires `CdpConnection`
   */
  static readonly layerNoDeps = (targetId: string) => Layer.effect(CdpPage, make(targetId));

  /**
   * Fully composed layer with CdpConnection provided.
   *
   * @param targetId - The CDP target identifier for the page to control
   * @param connection - The CdpConnectionService instance to use
   * @returns An Effect Layer that produces a `CdpPage` service
   */
  static readonly layer = (targetId: string, connection: CdpConnectionService) =>
    this.layerNoDeps(targetId).pipe(Layer.provide(Layer.succeed(CdpConnection, connection)));
}
