/**
 * FrameLocator — `page.frameLocator(selector)` returns a `CdpFrameLocator`
 * that resolves an `<iframe>` element via CSS selector and exposes a
 * `.locator(inner)` method to chain a regular `CdpLocator` scoped to the
 * iframe's content frame.
 *
 * Mirrors Playwright's `page.frameLocator(selector)` API. The returned
 * `CdpLocator` is lazy and immutable — the iframe is resolved at *action*
 * time (just like a regular `CdpLocator`), not at construction time.
 *
 * ## Architecture
 *
 * - The frame chain is an ordered `ReadonlyArray<string>` of CSS selectors.
 *   Each link is resolved at action time: the previous link's content frame
 *   is the parent for the next link's iframe lookup.
 * - The chain starts from the page's *current* main frame ID, resolved
 *   dynamically via the `getMainFrameId` thunk (so navigations that give
 *   the page a new main frame don't break resolution).
 * - All actions evaluate in the iframe's main context via `evaluateFrame`
 *   using an `acquireUseRelease` pattern: tag the matched element, run the
 *   user function, clean up the tag — with cleanup guaranteed to run on
 *   success, failure, *and* fiber interruption.
 *
 * ## Trade-offs (v1)
 *
 * - Actions use injected DOM operations (`el.click()`, `el.value = ...`)
 *   rather than CDP `Input.dispatchMouseEvent` with coordinate translation.
 *   This is an untrusted-synthetic-event approach — Playwright's eventual
 *   end-state plumbs `frameId` through `Click.ts`, `Fill.ts`, etc. for
 *   trusted CDP inputs. See `docs/contributing/cdp/upstream-integration-test-coverage.md`.
 * - No auto-wait for actionability inside the iframe (visibility, hit
 *   target, disabled state). The locator *does* auto-wait for the iframe
 *   to attach (via the resolve chain's retry loop) and for the target
 *   element to be present.
 */

import type { CdpError } from "../../CdpError.js";
import type { CdpConnection } from "../CdpConnection.js";
import type { BoundingBox } from "./BoundingBox.js";
import type { FrameManager } from "./FrameManager.js";
import type { ByRoleOptions, CdpLocator, LocatorOptions, TextMatchOptions } from "./Locator.js";
import type { PageState } from "./PageState.js";

import { Duration, Effect, Option, Predicate, Schedule } from "effect";
import * as Arr from "effect/Array";

import { getErrorMessage } from "@effect-libs/browser";

import {
  CdpError as CdpErrorClass,
  EvaluationError,
  isCdpError,
  isSelectorError,
  SelectorError,
} from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { evaluateFrame } from "./Evaluate.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A FrameLocator — chainable into an iframe's content frame.
 *
 * Constructed via `page.frameLocator(selector)`.
 */
export interface CdpFrameLocator {
  /** CSS selector that matches the `<iframe>` element in the parent frame. */
  readonly selector: string;

  /**
   * Returns a CdpLocator scoped to the iframe's content frame.
   *
   * The returned Locator resolves `innerSelector` within the iframe's
   * document. Supports the standard Locator API (click, fill, textContent,
   * isVisible, etc.). v1 actions are runtime-DOM based; see the file-level
   * Trade-offs note.
   */
  readonly locator: (
    innerSelector: string | CdpLocator,
    options?: { readonly hasText?: string | RegExp },
  ) => CdpLocator;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context for building a FrameLocator.
 *
 * `getMainFrameId` is a *thunk*, not a value — it reads the current main
 * frame ID at action time. This matters because:
 *
 * - `page.goto(...)` can change the main frame ID (cross-origin Site
 *   Isolation may give a brand-new target).
 * - If we captured the frame ID at FrameLocator construction time, the
 *   captured ID would be stale by the time the user actually clicks.
 */
export interface FrameLocatorCtx {
  readonly connection: CdpConnection["Service"];
  readonly state: PageState;
  readonly frameManager: FrameManager;
  /** Read the current main frame's CDP frame ID. Throws if the page is closed. */
  readonly getMainFrameId: () => Effect.Effect<string, CdpError>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Frame resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a unique attribute name for tagging the matched element. */
const generateTag = (): string =>
  `__cdp_fslocator_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e12).toString(36)}__`;

/** Default timeout for frame-scoped operations. Matches Playwright's default. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Wrap a non-CdpError into a CdpError. */
const wrapCdpError =
  (method: string) =>
  (cause: unknown): CdpError =>
    isCdpError(cause)
      ? cause
      : new CdpErrorClass({
          source: "CdpPage",
          method,
          reason: new EvaluationError({ description: getErrorMessage(cause) }),
        });

/** Enable the DOM domain, swallowing the "already enabled" response. */
const connectionEnableDom = (
  conn: CdpConnection["Service"],
  sid: string,
): Effect.Effect<void, never> => conn.cdp.DOM.enable({}, sid).pipe(Effect.ignore);

/**
 * Find the iframe element matching `iframeSelector` inside `parentFrameId`
 * and return its content frame's CDP `frameId`. Used by
 * `resolveFrameIdFromSelector` to translate a CSS selector to a frame.
 *
 * Strategy: query the iframe in the parent frame's context, then call
 * `DOM.describeNode` to read the `frameId` property that CDP attaches to
 * frame-owner `<iframe>` elements. The `frameId` is then used to look up
 * the `CdpFrame` via `FrameManager`.
 *
 * `DOM.describeNode` populates `node.frameId` for frame owner elements per
 * the CDP spec — this is the canonical, race-free way to map a CSS
 * selector on an `<iframe>` to its content frame.
 *
 * Returns `Option.none()` if no iframe matches the selector.
 */
const resolveIframeFrameId = (
  ctx: FrameLocatorCtx,
  parentFrameId: string,
  iframeSelector: string,
): Effect.Effect<Option.Option<string>, CdpError> =>
  Effect.gen(function* () {
    yield* ctx.frameManager.waitForExecutionContext(parentFrameId, "main");
    const ctxId = yield* ctx.frameManager.getMainContextId(parentFrameId);
    if (ctxId === null) {
      return yield* new CdpErrorClass({
        source: "CdpPage",
        method: "frameLocator",
        reason: new EvaluationError({
          description: `No execution context for parent frame ${parentFrameId}`,
        }),
      });
    }

    const sid = yield* ensureSession(ctx.state);
    yield* connectionEnableDom(ctx.connection, sid);

    const tag = `__cdp_fl_${Math.random().toString(36).slice(2)}__`;

    const tagged = yield* evaluateFrame<{ readonly matched: number }>(
      ctx.connection,
      ctx.state,
      ctxId,
      parentFrameId,
      (args: { sel: string; tag: string }) => {
        const els = document.querySelectorAll(args.sel);
        let iframes = 0;
        for (const el of Array.from(els)) {
          if (el instanceof HTMLIFrameElement) {
            el.setAttribute(args.tag, "1");
            iframes++;
          }
        }
        return { matched: iframes };
      },
      { sel: iframeSelector, tag },
    ).pipe(Effect.mapError(wrapCdpError("frameLocator")));

    if (tagged.matched === 0) {
      return Option.none();
    }
    if (tagged.matched > 1) {
      // Clean up the tags we just set on the matches.
      yield* evaluateFrame<number>(
        ctx.connection,
        ctx.state,
        ctxId,
        parentFrameId,
        (args: { tag: string }) => {
          const taggedEls = document.querySelectorAll(`[${args.tag}]`);
          for (const el of Array.from(taggedEls)) {
            el.removeAttribute(args.tag);
          }
          return taggedEls.length;
        },
        { tag },
      ).pipe(Effect.ignore);
      return yield* new CdpErrorClass({
        source: "CdpPage",
        method: "frameLocator",
        reason: new SelectorError({
          selector: iframeSelector,
          description:
            `strict mode violation: iframe selector "${iframeSelector}" resolved to ${tagged.matched} elements. ` +
            `Use .first, .last, .nth(i), or .filter() to narrow to one.`,
        }),
      });
    }

    const doc = yield* ctx.connection.cdp.DOM.getDocument({ depth: -1, pierce: true }, sid).pipe(
      Effect.mapError(wrapCdpError("frameLocator")),
    );

    const queryResult = yield* ctx.connection.cdp.DOM.querySelector(
      { nodeId: doc.root.nodeId, selector: `iframe[${tag}]` },
      sid,
    ).pipe(Effect.mapError(wrapCdpError("frameLocator")));

    // Cleanup the tag (best-effort).
    yield* evaluateFrame<number>(
      ctx.connection,
      ctx.state,
      ctxId,
      parentFrameId,
      (args: { tag: string }) => {
        const taggedEls = document.querySelectorAll(`[${args.tag}]`);
        for (const el of Array.from(taggedEls)) {
          el.removeAttribute(args.tag);
        }
        return taggedEls.length;
      },
      { tag },
    ).pipe(Effect.ignore);

    if (queryResult.nodeId === 0) {
      return Option.none();
    }

    const described = yield* ctx.connection.cdp.DOM.describeNode(
      { nodeId: queryResult.nodeId, depth: 0 },
      sid,
    ).pipe(Effect.mapError(wrapCdpError("frameLocator")));

    const frameId = described.node.frameId;
    if (!Predicate.isString(frameId)) {
      return Option.none();
    }
    return Option.some(frameId);
  });

/**
 * Resolve an iframe selector in the parent frame to the iframe's CDP frame ID.
 */
export const resolveFrameIdFromSelector = (
  ctx: FrameLocatorCtx,
  parentFrameId: string,
  iframeSelector: string,
): Effect.Effect<Option.Option<string>, CdpError> =>
  resolveIframeFrameId(ctx, parentFrameId, iframeSelector);

// ─────────────────────────────────────────────────────────────────────────────
// Frame-chain resolution (with retry)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve one link in the frame chain: find the iframe matching `sel` in
 * the current parent frame, return its content frame ID.
 *
 * Auto-waits via exponential backoff (capped at 250ms intervals) until
 * either the iframe resolves or the timeout hits. The iframe may be in
 * the DOM but not yet attached to a CDP frame (race during page load);
 * the retry handles that.
 *
 * Early-exits with a clear error if the parent frame is detached.
 */
const resolveLink = (
  ctx: FrameLocatorCtx,
  parentFrameId: string,
  sel: string,
  timeoutMs: number,
): Effect.Effect<string, CdpError> => {
  if (ctx.frameManager.isFrameDetached(parentFrameId)) {
    return Effect.fail(
      new CdpErrorClass({
        source: "CdpPage",
        method: "frameLocator",
        reason: new EvaluationError({
          description: `Parent frame ${parentFrameId} is detached`,
        }),
      }),
    );
  }

  const tryResolve = (): Effect.Effect<Option.Option<string>, CdpError> =>
    resolveFrameIdFromSelector(ctx, parentFrameId, sel);

  return tryResolve().pipe(
    Effect.flatMap((opt) =>
      Option.isSome(opt)
        ? Effect.succeed(opt.value)
        : Effect.fail(
            // Tag with a sentinel so retry skips it; resolves to a
            // user-visible error after `retryWhile`.
            new CdpErrorClass({
              source: "CdpPage",
              method: "frameLocator",
              reason: new SelectorError({
                selector: sel,
                description: `<iframe-not-found> Iframe matching "${sel}" not yet resolved`,
              }),
            }),
          ),
    ),
    Effect.retry({
      schedule: Schedule.max([Schedule.exponential(Duration.millis(10), 2), Schedule.recurs(40)]),
      // Only retry while the iframe is genuinely missing (sentinel
      // error). Any other CdpError — including the strict-mode
      // violation produced by `resolveIframeFrameId` when multiple
      // iframes match — propagates immediately instead of being
      // retried until the timeout.
      while: (e) =>
        isCdpError(e) &&
        isSelectorError(e.reason) &&
        e.reason.description.startsWith("<iframe-not-found>"),
    }),
    Effect.timeoutOrElse({
      duration: Duration.millis(timeoutMs),
      orElse: () =>
        Effect.fail(
          new CdpErrorClass({
            source: "CdpPage",
            method: "frameLocator",
            reason: new EvaluationError({
              description: `Frame for selector "${sel}" not found after ${timeoutMs}ms`,
            }),
          }),
        ),
    }),
  );
};

/**
 * Resolve an entire frame chain to the innermost content frame's ID.
 *
 * Recursive: each link's resolved frame ID is the parent for the next.
 * No yield-in-for-loop lint issue. Chains are short (typically 1-2 links).
 */
const resolveFrameChain = (
  ctx: FrameLocatorCtx,
  frameChain: ReadonlyArray<string>,
  startFrameId: string,
  timeoutMs: number,
): Effect.Effect<string, CdpError> => {
  const go = (
    remaining: ReadonlyArray<string>,
    parentId: string,
  ): Effect.Effect<string, CdpError> =>
    Arr.match(remaining, {
      onEmpty: () => Effect.succeed(parentId),
      onNonEmpty: (xs) =>
        Effect.gen(function* () {
          const next = yield* resolveLink(ctx, parentId, xs[0] as string, timeoutMs);
          return yield* go(xs.slice(1), next);
        }),
    });

  return go(frameChain, startFrameId);
};

// ─────────────────────────────────────────────────────────────────────────────
// The core primitive: runInFrame
// ─────────────────────────────────────────────────────────────────────────────

interface RunInFrameOptions<V = never> {
  readonly timeoutMs: number;
  readonly index?: number;
  readonly value?: V;
}

/**
 * Args passed to a frame-scoped action function. The action receives a
 * SINGLE object (not positional args) because `evaluateFrame` serializes
 * its `arg` parameter and passes it as one argument. The action is
 * expected to destructure:
 *
 * ```ts
 * (args) => {
 *   const els = Array.from(document.querySelectorAll(`[${args.tag}]`));
 *   const el = els[0];
 *   el.value = args.value;
 * }
 * ```
 *
 * `tag` is the unique attribute set on the matched element(s) by the
 * `runInFrame` acquire step. `value` is present for value actions
 * (fill, type, press, setChecked) and `undefined` for plain actions
 * (click, hover, ...).
 *
 * The action function MUST be self-contained (only reference its
 * parameter) so it can be serialized via `toString()` and `eval`'d in
 * the iframe. Closure variables from the surrounding Effect code are
 * NOT available inside the iframe.
 */
interface FrameActionArgs<V> {
  readonly tag: string;
  readonly value: V;
}

/**
 * Core primitive for frame-scoped Locator actions.
 *
 * Resolves the frame chain, waits for the innermost frame's main execution
 * context, then runs the user function in that context using
 * `acquireUseRelease`:
 *
 *   1. **Acquire**: tag the matched element with a unique attribute
 *   2. **Use**:     pass the unique selector to the user function
 *   3. **Release**:  remove the tag (guaranteed on success/failure/interrupt)
 *
 * The cleanup runs even if the action throws, the timeout fires, or the
 * fiber is interrupted. Cleanup errors are swallowed via `Effect.ignore` —
 * the action's exit status takes priority.
 */
const runInFrame = <A, V>(
  ctx: FrameLocatorCtx,
  frameChain: ReadonlyArray<string>,
  innerSelector: string,
  options: RunInFrameOptions<V>,
  // The user function receives a single object containing `els` (matched
  // elements in the iframe) and `value` (the value-action payload, or
  // `undefined` for plain actions). It returns a serializable result.
  //
  // The function MUST be self-contained (only reference its parameter) so
  // it can be serialized via `toString()` and `eval`'d in the iframe.
  // Closure variables from the surrounding Effect code are NOT available
  // inside the iframe.
  fn: (args: FrameActionArgs<V>) => unknown,
): Effect.Effect<A, CdpError> =>
  Effect.gen(function* () {
    // 1. Resolve frame chain (with auto-wait retries per link).
    const mainFrameId = yield* ctx.getMainFrameId();
    const contentFrameId = yield* resolveFrameChain(
      ctx,
      frameChain,
      mainFrameId,
      options.timeoutMs,
    );

    // 2. Wait for the innermost frame's main world context.
    yield* ctx.frameManager.waitForExecutionContext(contentFrameId, "main");
    const ctxId = yield* ctx.frameManager.getMainContextId(contentFrameId);
    if (ctxId === null) {
      return yield* new CdpErrorClass({
        source: "CdpPage",
        method: "frameLocator",
        reason: new EvaluationError({
          description: `No execution context for frame ${contentFrameId}`,
        }),
      });
    }

    // 3. Tag + act + cleanup via acquireUseRelease.
    const tag = generateTag();

    return yield* Effect.acquireUseRelease(
      // ACQUIRE: tag the matched element.
      Effect.gen(function* () {
        const tagged = yield* evaluateFrame<{
          readonly ok: boolean;
          readonly count: number;
        }>(
          ctx.connection,
          ctx.state,
          ctxId,
          contentFrameId,
          (args: { tag: string; sel: string; index: number | null }) => {
            const els = Array.from(document.querySelectorAll(args.sel));
            if (args.index === null) {
              const el = els[0];
              if (!el) return { ok: false, count: 0 };
              el.setAttribute(args.tag, "1");
              return { ok: true, count: els.length };
            }
            const idx = args.index === -1 ? els.length - 1 : args.index;
            const el = els[idx];
            if (!el) return { ok: false, count: els.length };
            el.setAttribute(args.tag, "1");
            return { ok: true, count: 1 };
          },
          { tag, sel: innerSelector, index: options.index ?? null },
        ).pipe(Effect.mapError(wrapCdpError("frameLocator")));

        if (!tagged.ok && options.index !== undefined) {
          return yield* new CdpErrorClass({
            source: "CdpPage",
            method: "frameLocator",
            reason: new SelectorError({
              selector: innerSelector,
              description: `No element at index ${options.index} for selector "${innerSelector}" (matched ${tagged.count})`,
            }),
          });
        }
        // Returns the tag — acquirer's value is the tag string.
        return tag;
      }),
      // USE: run the user function with the tag. The user function is
      // self-contained: it receives `{ tag, value }` and is responsible
      // for resolving the tagged elements via `document.querySelectorAll`
      // inside the iframe. This avoids any closure references that
      // wouldn't survive `eval()` in the iframe context.
      (acquiredTag) =>
        Effect.gen(function* () {
          const result = yield* evaluateFrame<unknown>(
            ctx.connection,
            ctx.state,
            ctxId,
            contentFrameId,
            fn,
            {
              tag: acquiredTag,
              value: options.value as V,
            },
          ).pipe(Effect.mapError(wrapCdpError("frameLocator")));
          return result as A;
        }) as Effect.Effect<A, CdpError, never>,
      // RELEASE: clean up the tag (guaranteed, errors swallowed).
      (acquiredTag) =>
        evaluateFrame<number>(
          ctx.connection,
          ctx.state,
          ctxId,
          contentFrameId,
          (args: { tag: string }) => {
            const tagged = document.querySelectorAll(`[${args.tag}]`);
            for (const el of Array.from(tagged)) {
              el.removeAttribute(args.tag);
            }
            return tagged.length;
          },
          { tag: acquiredTag },
        ).pipe(Effect.ignore),
    );
  });

/** Map an evaluate error description to a user-meaningful CdpError. */
const mapActionError =
  (_selector: string, method: string) =>
  (cause: unknown): CdpError => {
    if (isCdpError(cause)) return cause;
    const desc = getErrorMessage(cause);
    if (desc.includes("not attached") || desc.includes("detached")) {
      return new CdpErrorClass({
        source: "CdpPage",
        method: `frameLocator.${method}`,
        reason: new EvaluationError({
          description: `Frame or element detached during ${method}: ${desc}`,
        }),
      });
    }
    return new CdpErrorClass({
      source: "CdpPage",
      method: `frameLocator.${method}`,
      reason: new EvaluationError({ description: desc }),
    });
  };

// ─────────────────────────────────────────────────────────────────────────────
// Per-action bodies (tiny: 1-5 lines of DOM manipulation each)
// ─────────────────────────────────────────────────────────────────────────────

/** Build a single-action method (no args beyond selector). */
const buildAction =
  (
    ctx: FrameLocatorCtx,
    frameChain: ReadonlyArray<string>,
    sel: string,
    index: number | undefined,
    methodName: string,
  ) =>
  <A>(fn: (els: ReadonlyArray<Element>) => A): Effect.Effect<A, CdpError> =>
    runInFrame<A, undefined>(
      ctx,
      frameChain,
      sel,
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        ...(index !== undefined ? { index } : {}),
      },
      // The user fn is serialized via `toString()` and eval'd in the
      // iframe, so it must be self-contained. We construct a wrapper
      // function whose source string embeds the user fn's source, so
      // the resulting function has no closure references.
      buildSelfContainedActionFn(fn.toString()),
    ).pipe(
      Effect.mapError(mapActionError(sel, methodName)),
      Effect.map((a) => a as A),
    );

/** Build a value-action method (takes one value arg). */
const buildValueAction =
  (
    ctx: FrameLocatorCtx,
    frameChain: ReadonlyArray<string>,
    sel: string,
    index: number | undefined,
    methodName: string,
  ) =>
  <A, V>(value: V, fn: (els: ReadonlyArray<Element>, v: V) => A): Effect.Effect<A, CdpError> =>
    runInFrame<A, V>(
      ctx,
      frameChain,
      sel,
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        ...(index !== undefined ? { index } : {}),
        value,
      } satisfies RunInFrameOptions<V>,
      buildSelfContainedActionFn(fn.toString()),
    ).pipe(
      Effect.mapError(mapActionError(sel, methodName)),
      Effect.map((a) => a as A),
    );

/**
 * Build a self-contained action function whose source string embeds the
 * user function's source. The resulting function:
 *
 * 1. Resolves the tagged elements from `args.tag` via `querySelectorAll`
 * 2. Invokes the user function with the resolved elements (and `value`
 *    for value actions) using the embedded source
 *
 * Because the user function's body is inlined as a string, the result
 * has NO closure references — it can be safely serialized and eval'd
 * in the iframe.
 */
const buildSelfContainedActionFn = (userFnSource: string) =>
  // biome-ignore lint/suspicious/noExplicitAny: dynamic construction
  new Function(
    "args",
    `const els = Array.from(document.querySelectorAll('[' + args.tag + ']')); return ((${userFnSource}))(els, args.value);`,
  ) as (args: FrameActionArgs<any>) => unknown;

// ─────────────────────────────────────────────────────────────────────────────
// Frame-scoped CdpLocator factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a CdpLocator scoped to an iframe's content frame.
 *
 * `frameChain` is the ordered list of iframe selectors from outermost to
 * innermost (e.g., `["#outer", "#inner"]` for nested iframes). The
 * `innerSelector` is resolved in the innermost frame's document.
 *
 * Actions evaluate in the iframe's main context using the `runInFrame`
 * primitive. See the file-level doc for the trade-offs.
 */
export const makeFrameScopedCdpLocator = (
  ctx: FrameLocatorCtx,
  frameChain: ReadonlyArray<string>,
  innerSelector: string,
  options?: { readonly hasText?: string | RegExp },
  index?: number,
): CdpLocator => {
  const composedSelector = options
    ? `${innerSelector}${options.hasText instanceof RegExp ? ` >> text=/${options.hasText.source}/${options.hasText.flags}` : options.hasText !== undefined ? ` >> text="${options.hasText}"` : ""}`
    : innerSelector;

  const sel = composedSelector;
  const idx = index;

  const doAction = buildAction(ctx, frameChain, sel, idx, "action");
  const doValueAction = buildValueAction(ctx, frameChain, sel, idx, "action");

  const chain = (next: string, opts?: typeof options): CdpLocator =>
    makeFrameScopedCdpLocator(ctx, frameChain, `${sel} >> ${next}`, opts, idx);

  return {
    selector: composedSelector,
    locator: (next: string | CdpLocator, opts?: LocatorOptions) => {
      const nextStr = Predicate.isString(next) ? next : next.selector;
      return chain(nextStr, opts);
    },
    getByRole: (role: string, _opts?: ByRoleOptions) =>
      chain(`[role="${role.replace(/["\\]/g, "\\$&")}"]`),
    getByText: (text: string | RegExp, _opts?: TextMatchOptions) => {
      const t = text instanceof RegExp ? `text=/${text.source}/${text.flags}` : `text="${text}"`;
      return chain(t);
    },
    getByLabel: (text: string | RegExp, _opts?: TextMatchOptions) =>
      chain(text instanceof RegExp ? `[aria-label]` : `[aria-label="${text}"]`),
    getByTestId: (testId: string | RegExp) =>
      chain(testId instanceof RegExp ? `[data-testid]` : `[data-testid="${testId}"]`),
    getByPlaceholder: (text: string | RegExp, _opts?: TextMatchOptions) =>
      chain(text instanceof RegExp ? `[placeholder]` : `[placeholder="${text}"]`),
    getByAltText: (text: string | RegExp, _opts?: TextMatchOptions) =>
      chain(text instanceof RegExp ? `[alt]` : `[alt="${text}"]`),
    getByTitle: (text: string | RegExp, _opts?: TextMatchOptions) =>
      chain(text instanceof RegExp ? `[title]` : `[title="${text}"]`),
    filter: (_opts?: LocatorOptions) =>
      makeFrameScopedCdpLocator(ctx, frameChain, sel, undefined, idx),
    // and / or / describe / frameLocator on frame-scoped locator: not
    // supported in v1. Compose selectors are not implemented in the
    // frame scope. The upstream Playwright error would say:
    //   "Frame locators are not allowed inside composite locators".
    // We throw a clear error if called.
    and: () => {
      throw new Error("locator.and() is not supported on frame-scoped locators");
    },
    or: () => {
      throw new Error("locator.or() is not supported on frame-scoped locators");
    },
    describe: () => {
      throw new Error("locator.describe() is not supported on frame-scoped locators");
    },
    frameLocator: () => {
      throw new Error(
        "frameLocator() chaining is not supported on a frame-scoped locator — use page.frameLocator(...) instead",
      );
    },
    // contentFrame is not supported on a frame-scoped locator (the
    // locator is already inside an iframe, so there's no parent iframe
    // to chain into). Throw a clear error.
    contentFrame: () => {
      throw new Error(
        "contentFrame() is not supported on a frame-scoped locator — use page.frameLocator(...) instead",
      );
    },
    // `first` and `last` are getters (not methods) to match upstream Playwright's
    // `FrameLocator.first` / `FrameLocator.last` properties. They return a fresh
    // locator on each access, mirroring the CDP `CdpLocator.first` / `.last`
    // lazy-getter pattern.
    get first() {
      return makeFrameScopedCdpLocator(ctx, frameChain, sel, undefined, 0);
    },
    get last() {
      return makeFrameScopedCdpLocator(ctx, frameChain, sel, undefined, -1);
    },
    nth: (i: number) => makeFrameScopedCdpLocator(ctx, frameChain, sel, undefined, i),

    // ── Actions ─────────────────────────────────────────────────────────────
    click: () =>
      doAction<void>((els) => {
        const el = els[0];
        if (el instanceof HTMLElement) el.click();
      }),
    dblclick: () =>
      doAction<void>((els) => {
        const el = els[0];
        if (el instanceof HTMLElement) {
          el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
        }
      }),
    hover: () =>
      doAction<void>((els) => {
        const el = els[0];
        if (el instanceof HTMLElement) {
          el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
        }
      }),
    fill: (value: string) =>
      doValueAction<void, string>(value, (els, v) => {
        const el = els[0];
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.focus();
          el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }),
    type: (text: string) =>
      doValueAction<void, string>(text, (els, t) => {
        const el = els[0];
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.focus();
          el.value = t;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }),
    press: (key: string) =>
      doValueAction<void, string>(key, (els, k) => {
        const el = els[0];
        if (el instanceof HTMLElement) {
          el.focus();
          el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true }));
        }
      }),
    focus: () =>
      doAction<void>((els) => {
        const el = els[0];
        if (el instanceof HTMLElement) el.focus();
      }),
    blur: () =>
      doAction<void>((els) => {
        const el = els[0];
        if (el instanceof HTMLElement) el.blur();
      }),
    check: () =>
      doAction<void>((els) => {
        const el = els[0];
        if (el instanceof HTMLInputElement && el.type === "checkbox" && !el.checked) {
          el.checked = true;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }),
    uncheck: () =>
      doAction<void>((els) => {
        const el = els[0];
        if (el instanceof HTMLInputElement && el.type === "checkbox" && el.checked) {
          el.checked = false;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }),
    setChecked: (checked: boolean) =>
      doValueAction<void, boolean>(checked, (els, c) => {
        const el = els[0];
        if (el instanceof HTMLInputElement && el.type === "checkbox" && el.checked !== c) {
          el.checked = c;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }),
    selectOption: (values) =>
      doValueAction<
        readonly string[],
        | string
        | { readonly value?: string; readonly label?: string; readonly index?: number }
        | ReadonlyArray<
            string | { readonly value?: string; readonly label?: string; readonly index?: number }
          >
      >(values, (els, vs) => {
        const el = els[0];
        if (!(el instanceof HTMLSelectElement)) return [];
        const arr = Array.isArray(vs) ? vs : [vs];
        const selected: string[] = [];
        for (const opt of Array.from(el.options)) {
          const match = arr.some((v) => {
            if (Predicate.isString(v)) return v === opt.value;
            return v.value === opt.value;
          });
          opt.selected = match;
          if (match) selected.push(opt.value);
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return selected;
      }),

    // ── Queries ─────────────────────────────────────────────────────────────
    textContent: () => doAction<string | null>((els) => els[0]?.textContent ?? null),
    innerText: () =>
      doAction<string>((els) => {
        const el = els[0];
        return el instanceof HTMLElement ? el.innerText : "";
      }),
    innerHTML: () => doAction<string>((els) => els[0]?.innerHTML ?? ""),
    getAttribute: (name: string) =>
      doAction<string | null>((els) => els[0]?.getAttribute(name) ?? null),
    inputValue: () =>
      doAction<string | null>((els) => {
        const el = els[0];
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          return el.value;
        }
        return null;
      }),

    selectText: () =>
      doAction<void>((els) => {
        const el = els[0];
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.focus();
          try {
            el.setSelectionRange(0, el.value.length);
          } catch {
            document.execCommand("selectall", false, undefined);
          }
        }
      }),

    // Description / toString / page on frame-scoped locator: these
    // don't carry compose state (the frame chain + inner selector is
    // already in `composedSelector`), so we synthesize minimal
    // implementations.
    description: () => null,
    toString: () => `frameLocator('${composedSelector}')`,
    // page: the underlying page is exposed via FrameLocatorCtx — the
    // user has it from the original `page.frameLocator(...)` call.
    // We return a Promise-resolved page via `Effect.succeed` would
    // require a thunk; instead, callers typically use the page from
    // the original chain. Stub the shape; this method is rarely used
    // on a FrameLocator-scoped locator.
    page: () => {
      throw new Error(
        "page() on a frame-scoped locator is not supported — use the page from page.frameLocator(...)",
      );
    },

    // ── State checks ────────────────────────────────────────────────────────
    isVisible: () =>
      doAction<boolean>((els) => {
        const el = els[0];
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }),
    isHidden: () =>
      doAction<boolean>((els) => {
        const el = els[0];
        if (!el) return true;
        const r = el.getBoundingClientRect();
        return r.width === 0 && r.height === 0;
      }),
    isChecked: () =>
      doAction<boolean>((els) => (els[0] instanceof HTMLInputElement ? els[0].checked : false)),
    isDisabled: () =>
      doAction<boolean>((els) => (els[0] instanceof HTMLInputElement ? els[0].disabled : false)),
    isEditable: () =>
      doAction<boolean>((els) => {
        const el = els[0];
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          return !el.disabled && el.type !== "hidden";
        }
        return false;
      }),
    isEnabled: () =>
      doAction<boolean>((els) => (els[0] instanceof HTMLInputElement ? !els[0].disabled : true)),

    // ── Evaluation ──────────────────────────────────────────────────────────
    evaluate: <T, Arg = void>(pageFunction: (element: Element, arg: Arg) => T, arg?: Arg) =>
      doValueAction<Awaited<T>, { fnSource: string; arg: Arg }>(
        { fnSource: pageFunction.toString(), arg: arg as Arg },
        (els, payload) => {
          const el = els[0];
          if (!el) return undefined as Awaited<T>;
          // Construct a Function from the serialized source. The user's
          // pageFunction is self-contained (only references its params),
          // so evaluating it here in the iframe is safe.
          // biome-ignore lint/suspicious/noExplicitAny: dynamic construction
          const fn = new Function("el", "arg", `return (${payload.fnSource})(el, arg);`) as (
            el: Element,
            arg: Arg,
          ) => T;
          return fn(el, payload.arg) as Awaited<T>;
        },
      ),
    evaluateAll: <T, Arg = void>(
      pageFunction: (elements: ReadonlyArray<Element>, arg: Arg) => T,
      arg?: Arg,
    ) =>
      doValueAction<Awaited<T>, { fnSource: string; arg: Arg }>(
        { fnSource: pageFunction.toString(), arg: arg as Arg },
        (els, payload) => {
          // Same pattern as `evaluate`, but called with the full array.
          // biome-ignore lint/suspicious/noExplicitAny: dynamic construction
          const fn = new Function("els", "arg", `return (${payload.fnSource})(els, arg);`) as (
            els: ReadonlyArray<Element>,
            arg: Arg,
          ) => T;
          return fn(els, payload.arg) as Awaited<T>;
        },
      ),

    // Frame-scoped stub for waitFor — waits for the element to be present.
    waitFor: () =>
      doAction<void>((els) => {
        Arr.match(els, {
          onEmpty: () => {
            throw new Error(
              `Frame-scoped waitFor timed out: no element matches selector "${composedSelector}"`,
            );
          },
          onNonEmpty: () => undefined,
        });
      }),

    // Frame-scoped stub for dispatchEvent — fires a synthetic event on
    // the resolved element. Untrusted events (CDP's events are
    // untrusted — isTrusted=false) but matches upstream behavior for
    // the kinds of tests that exercise this path.
    dispatchEvent: (type: string, eventInit?: Record<string, unknown>) =>
      doAction<void>((els) => {
        const el = els[0];
        if (!el) return;
        el.dispatchEvent(new Event(type, eventInit ?? {}));
      }),

    // Frame-scoped stub for scrollIntoViewIfNeeded — calls
    // scrollIntoView on the resolved element.
    scrollIntoViewIfNeeded: () =>
      doAction<void>((els) => {
        const el = els[0];
        if (el instanceof HTMLElement) {
          el.scrollIntoView();
        }
      }),

    // Frame-scoped stub for setInputFiles — file inputs in iframes
    // require CDP DOM.setFileInputFiles with the iframe's
    // backendNodeId. v1 is unsupported (file picker scope is
    // page-wide in CDP, not frame-scoped).
    setInputFiles: () => {
      throw new Error("locator.setInputFiles() is not supported on frame-scoped locators");
    },

    // Frame-scoped stub for all() — returns a list of frame-scoped
    // locators, each pinned to an index.
    all: () =>
      doAction<ReadonlyArray<CdpLocator>>((els) => {
        const out: CdpLocator[] = [];
        for (let i = 0; i < els.length; i++) {
          out.push(makeFrameScopedCdpLocator(ctx, frameChain, sel, undefined, i));
        }
        return out;
      }),

    // Frame-scoped stub for allInnerTexts.
    allInnerTexts: () =>
      doAction<ReadonlyArray<string>>((els) =>
        els.map((el) => (el instanceof HTMLElement ? el.innerText : "")),
      ),

    // Frame-scoped stub for allTextContents.
    allTextContents: () =>
      doAction<ReadonlyArray<string>>((els) => els.map((el) => el.textContent ?? "")),

    // Frame-scoped stub for screenshot — clip-to-element screenshots
    // across frames are not supported in v1 (Page.captureScreenshot
    // is page-wide, not frame-scoped). Throw a clear error.
    screenshot: () => {
      throw new Error("locator.screenshot() is not supported on frame-scoped locators");
    },

    // Frame-scoped stub for boundingBox — measure the element's
    // bounding box relative to the iframe's viewport.
    boundingBox: () =>
      doAction<BoundingBox | null>((els) => {
        const el = els[0];
        if (!(el instanceof HTMLElement)) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),

    // Frame-scoped stub for pressSequentially — alias of type().
    pressSequentially: (text: string) =>
      doValueAction<void, string>(text, (els, t) => {
        const el = els[0];
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.focus();
          el.value = t;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }),

    // Frame-scoped stub for clear — equivalent to fill("").
    clear: () =>
      doAction<void>((els) => {
        const el = els[0];
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.focus();
          el.value = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }),

    // Frame-scoped stub for tap — fires a touchstart/touchend pair.
    tap: () =>
      doAction<void>((els) => {
        const el = els[0];
        if (el instanceof HTMLElement) {
          el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
          el.dispatchEvent(new TouchEvent("touchend", { bubbles: true }));
        }
      }),

    evaluateHandle: <T, Arg = void>(
      _pageFunction: (element: Element, arg: Arg) => T,
      _arg?: Arg,
    ) => {
      // Frame-scoped evaluateHandle not implemented in v1 — would
      // require page-side Runtime.callFunctionOn against the iframe's
      // execution context, plus a returned objectId handle registry.
      throw new Error("locator.evaluateHandle() is not supported on frame-scoped locators");
    },

    count: () => doAction<number>((els) => els.length),
  } as CdpLocator;
};

// ─────────────────────────────────────────────────────────────────────────────
// FrameLocator factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a CdpFrameLocator bound to a page.
 *
 * The returned CdpFrameLocator is lazy — its `.locator(inner)` returns a
 * CdpLocator that resolves the iframe on first use, with retry/auto-wait.
 */
export const makeCdpFrameLocator = (
  ctx: FrameLocatorCtx,
  initialSelector: string,
): CdpFrameLocator => ({
  selector: initialSelector,
  locator: (inner: string | CdpLocator, _options) => {
    // Accept both string and CdpLocator for the inner argument (the
    // latter is used by `Locator.locator() and FrameLocator.locator()
    // should accept locator` from upstream). Extract the inner
    // .selector so the composed chain stays string-only.
    const innerStr: string = Predicate.isString(inner) ? inner : inner.selector;
    return makeFrameScopedCdpLocator(ctx, [initialSelector], innerStr, undefined);
  },
});
