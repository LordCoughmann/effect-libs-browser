/**
 * Phase P3 — frame-parity methods for `CdpFrame`.
 *
 * Builds the full set of new methods (click, fill, getBy*, frameLocator,
 * page, title, setContent, addScriptTag, addStyleTag, evaluateHandle,
 * plus all query/state checks) for a given `CdpFrame` factory invocation.
 *
 * Strategy: every new method delegates to a frame-scoped `CdpLocator`
 * built via `makeFrameScopedCdpLocator` from `FrameLocator.ts` with an
 * empty frame chain (the frameId is already known, so no iframe-selector
 * walk is needed — `resolveFrameChain` short-circuits). The locator handles
 * element resolution, auto-wait, and the action dispatch in the iframe's
 * main world. Query methods use `evaluateFrame` directly for read-only
 * operations (textContent, getAttribute, is*, etc.).
 *
 * Trade-off: locator-based actions dispatch **synthetic DOM events**
 * (`el.click()`, `el.value = ...`) inside the iframe's main world. These
 * are NOT trusted (`event.isTrusted === false`). Some sites detect this
 * and reject the events. See `FrameLocator.ts` for the full discussion.
 */

import type { CdpError } from "../../CdpError.js";
import type { CdpConnection } from "../CdpConnection.js";
import type { WaitUntil } from "../types.js";
import type { AddScriptTagOptions } from "./AddScriptTag.js";
import type { AddStyleTagOptions } from "./AddStyleTag.js";
import type { FrameManager, NetworkIdleProvider } from "./FrameManager.js";
import type { PageState } from "./PageState.js";
import type { InputFile } from "./SetInputFiles.js";

import { Duration, Effect, Option, Predicate } from "effect";

import { CdpError as CdpErrorClass } from "../../CdpError.js";
import { evaluateFrame } from "./Evaluate.js";
import { evaluateHandleFrame, type CdpHandle } from "./EvaluateHandle.js";
import { makeFrameScopedCdpLocator } from "./FrameLocator.js";
import {
  getByLabelSelector,
  getByRoleSelector,
  getByTestIdSelector,
  getByTextSelector,
  type ByRoleOptions,
  type CdpLocator,
  type TextMatchOptions,
} from "./Locator.js";
import { setContentPage } from "./SetContent.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Generate a simple attribute selector for `name="value"`. */
const attrSel = (name: string, value: string | RegExp): string => {
  if (value instanceof RegExp) return `[${name}]`;
  return `[${name}="${value.replace(/["\\]/g, "\\$&")}"]`;
};

const makeCtx = (
  connection: CdpConnection["Service"],
  state: PageState,
  frameManager: FrameManager,
  frameId: string,
) => ({
  connection,
  state,
  frameManager,
  getMainFrameId: () => Effect.succeed(frameId),
});

const buildLocator = (
  connection: CdpConnection["Service"],
  state: PageState,
  frameManager: FrameManager,
  frameId: string,
  selector: string,
): CdpLocator =>
  makeFrameScopedCdpLocator(makeCtx(connection, state, frameManager, frameId), [], selector);

/** Resolve the frame's main world contextId, or fail with CdpError. */
const getMainContextIdOrFail = (
  frameManager: FrameManager,
  frameId: string,
): Effect.Effect<number, CdpError> =>
  Effect.gen(function* () {
    yield* frameManager.waitForExecutionContext(frameId, "main");
    const contextId = yield* frameManager.getMainContextId(frameId);
    if (contextId === null) {
      return yield* new CdpErrorClass({
        source: "CdpPage",
        method: "frame",
        reason: {
          _tag: "EvaluationError",
          description: `No execution context for frame ${frameId}`,
        },
      } as never);
    }
    return contextId;
  });

/** Build an options object that includes only the keys that are defined. */
const filterDefined = <T extends Record<string, unknown>>(input: T | undefined): Partial<T> => {
  if (!input) return {};
  const out: Partial<T> = {};
  for (const key of Object.keys(input) as Array<keyof T>) {
    const value = input[key];
    if (value !== undefined) {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic property assignment
      (out as any)[key] = value;
    }
  }
  return out;
};

// ─── builder ──────────────────────────────────────────────────────────────────

/**
 * Build all Phase P3 methods for a given `CdpFrame`.
 */
export const buildFrameExtensionMethods = (params: {
  readonly connection: CdpConnection["Service"];
  readonly state: PageState;
  readonly frameManager: FrameManager;
  readonly frameId: string;
  readonly targetId: string;
  readonly networkIdle: NetworkIdleProvider;
  readonly page: { readonly [k: string]: any };
}): Readonly<Record<string, unknown>> => {
  const { connection, state, frameManager, frameId, targetId, networkIdle, page } = params;
  const locator = (selector: string): CdpLocator =>
    buildLocator(connection, state, frameManager, frameId, selector);

  // ─── Page reference ─────────────────────────────────────────────────────────

  const pageRef: Effect.Effect<unknown, never> = Effect.succeed(page);

  // ─── Title ──────────────────────────────────────────────────────────────────

  const title: Effect.Effect<string, CdpError> = Effect.gen(function* () {
    const contextId = yield* getMainContextIdOrFail(frameManager, frameId);
    return yield* evaluateFrame<string>(
      connection,
      state,
      contextId,
      frameId,
      () => document.title,
    );
  });

  // ─── evaluateHandle ────────────────────────────────────────────────────────

  const evaluateHandle = <T>(
    pageFunction: string | ((...args: any[]) => T),
    arg?: unknown,
  ): Effect.Effect<CdpHandle, CdpError> =>
    Effect.gen(function* () {
      const contextId = yield* getMainContextIdOrFail(frameManager, frameId);
      return yield* evaluateHandleFrame(connection, state, contextId, frameId, pageFunction, arg);
    });

  // ─── Element actions (delegate to locator) ─────────────────────────────────

  const click = (
    selector: string,
    options?: {
      button?: "left" | "right" | "middle";
      modifiers?: ReadonlyArray<"Alt" | "Control" | "ControlOrMeta" | "Meta" | "Shift">;
      clickCount?: number;
      position?: { readonly x: number; readonly y: number };
      force?: boolean;
      trial?: boolean;
      timeout?: unknown;
    },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.click signature mismatch
    locator(selector).click(filterDefined(options ?? {}) as any);

  const dblclick = (
    selector: string,
    options?: { trial?: boolean; timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.dblclick signature mismatch
    locator(selector).dblclick(filterDefined(options ?? {}) as any);

  const tap = (
    selector: string,
    options?: {
      position?: { readonly x: number; readonly y: number };
      force?: boolean;
      trial?: boolean;
      timeout?: unknown;
    },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.tap signature mismatch
    locator(selector).tap(filterDefined(options ?? {}) as any);

  const hover = (
    selector: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.hover signature mismatch
    locator(selector).hover(filterDefined(options ?? {}) as any);

  const fill = (
    selector: string,
    value: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.fill signature mismatch
    locator(selector).fill(value, filterDefined(options ?? {}) as any);

  const focus = (
    selector: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.focus signature mismatch
    locator(selector).focus(filterDefined(options ?? {}) as any);

  const blur = (selector: string, options?: { timeout?: unknown }): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.blur signature mismatch
    locator(selector).blur(filterDefined(options ?? {}) as any);

  const type = (
    selector: string,
    text: string,
    options?: { delay?: number; timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.type signature mismatch
    locator(selector).type(text, filterDefined(options ?? {}) as any);

  const press = (
    selector: string,
    key: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.press signature mismatch
    locator(selector).press(key, filterDefined(options ?? {}) as any);

  const check = (
    selector: string,
    options?: { trial?: boolean; timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.check signature mismatch
    locator(selector).check(filterDefined(options ?? {}) as any);

  const uncheck = (
    selector: string,
    options?: { trial?: boolean; timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.uncheck signature mismatch
    locator(selector).uncheck(filterDefined(options ?? {}) as any);

  const setChecked = (
    selector: string,
    checked: boolean,
    options?: { trial?: boolean; timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.setChecked signature mismatch
    locator(selector).setChecked(checked, filterDefined(options ?? {}) as any);

  const selectOption = <T extends string | { value?: string; label?: string; index?: number }>(
    selector: string,
    values: T | T[] | null,
    options?: { timeout?: unknown },
  ): Effect.Effect<readonly string[], CdpError> =>
    locator(selector).selectOption(
      values as T | T[],
      // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.selectOption signature mismatch
      filterDefined(options ?? {}) as any,
    );

  const setInputFiles = (
    selector: string,
    files: ReadonlyArray<InputFile>,
    options?: { timeout?: unknown },
  ): Effect.Effect<void, CdpError> => {
    const names = files.map((f) => (Predicate.isString(f) ? f : f));
    return locator(selector).setInputFiles(
      names,
      // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.setInputFiles signature mismatch
      filterDefined(options ?? {}) as any,
    );
  };

  // dragAndDrop — dispatch synthetic dragstart/drop events via the locator path.
  // CDP doesn't yet implement trusted coordinate-translation drag (matches
  // the synthetic-event trade-off used elsewhere by FrameLocator). For v1
  // we fire a dragstart on the source and a drop on the target — the
  // listener for HTML5 dnd will pick them up.
  const dragAndDrop = (
    source: string,
    target: string,
    _options?: { timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    Effect.gen(function* () {
      yield* locator(source).dispatchEvent("dragstart", { dataTransfer: {} });
      yield* locator(target).dispatchEvent("drop", { dataTransfer: {} });
    });

  const dispatchEvent = (
    selector: string,
    type: string,
    eventInit?: Record<string, unknown>,
    options?: { timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.dispatchEvent signature mismatch
    locator(selector).dispatchEvent(type, eventInit, filterDefined(options ?? {}) as any);

  // ─── Queries (delegate to locator or evaluateFrame for closure-bound) ─────

  const textContent = (
    selector: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<Option.Option<string>, CdpError> =>
    Effect.map(
      // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.textContent signature mismatch
      locator(selector).textContent(filterDefined(options ?? {}) as any),
      (v): Option.Option<string> => (v === null ? Option.none() : Option.some(v as string)),
    );

  const innerText = (
    selector: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<Option.Option<string>, CdpError> =>
    Effect.map(
      // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.innerText signature mismatch
      locator(selector).innerText(filterDefined(options ?? {}) as any),
      (v): Option.Option<string> => Option.some(v),
    );

  const innerHTML = (
    selector: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<Option.Option<string>, CdpError> =>
    Effect.map(
      // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.innerHTML signature mismatch
      locator(selector).innerHTML(filterDefined(options ?? {}) as any),
      (v): Option.Option<string> => Option.some(v),
    );

  const getAttribute = (
    selector: string,
    name: string,
    _options?: { timeout?: unknown },
  ): Effect.Effect<Option.Option<string>, CdpError> =>
    Effect.gen(function* () {
      const contextId = yield* getMainContextIdOrFail(frameManager, frameId);
      const attr = yield* evaluateFrame<string | null>(
        connection,
        state,
        contextId,
        frameId,
        (args: { sel: string; attr: string }) => {
          const el = document.querySelector(args.sel);
          return el ? el.getAttribute(args.attr) : null;
        },
        { sel: selector, attr: name },
      );
      return attr === null ? Option.none() : Option.some(attr);
    });

  const inputValue = (
    selector: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<string, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.inputValue signature mismatch
    locator(selector).inputValue(filterDefined(options ?? {}) as any);

  const isChecked = (
    selector: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<boolean, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.isChecked signature mismatch
    locator(selector).isChecked(filterDefined(options ?? {}) as any);

  const isDisabled = (
    selector: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<boolean, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.isDisabled signature mismatch
    locator(selector).isDisabled(filterDefined(options ?? {}) as any);

  const isEditable = (
    selector: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<boolean, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.isEditable signature mismatch
    locator(selector).isEditable(filterDefined(options ?? {}) as any);

  const isEnabled = (
    selector: string,
    options?: { timeout?: unknown },
  ): Effect.Effect<boolean, CdpError> =>
    // biome-ignore lint/suspicious/noExplicitAny: filterDefined + locator.isEnabled signature mismatch
    locator(selector).isEnabled(filterDefined(options ?? {}) as any);

  const isHidden = (
    selector: string,
    _options?: { timeout?: unknown },
  ): Effect.Effect<boolean, CdpError> => locator(selector).isHidden();

  const isVisible = (
    selector: string,
    _options?: { timeout?: unknown },
  ): Effect.Effect<boolean, CdpError> => locator(selector).isVisible();

  // ─── Locator helpers ────────────────────────────────────────────────────────

  const getByRole = (role: string, options?: ByRoleOptions): CdpLocator =>
    locator(getByRoleSelector(role, options));

  const getByText = (text: string | RegExp, _options?: TextMatchOptions): CdpLocator =>
    locator(getByTextSelector(text, _options));

  const getByLabel = (text: string | RegExp, _options?: TextMatchOptions): CdpLocator =>
    locator(getByLabelSelector(text, _options));

  const getByTestId = (testId: string | RegExp): CdpLocator => locator(getByTestIdSelector(testId));

  const getByPlaceholder = (text: string | RegExp, _options?: TextMatchOptions): CdpLocator =>
    locator(attrSel("placeholder", text));

  const getByAltText = (text: string | RegExp, _options?: TextMatchOptions): CdpLocator =>
    locator(attrSel("alt", text));

  const getByTitle = (text: string | RegExp, _options?: TextMatchOptions): CdpLocator =>
    locator(attrSel("title", text));

  // frameLocator — delegate to page.frameLocator for the iframe resolution chain.
  // The user can chain `.locator(inner)` to scope into the iframe's content frame.
  const frameLocator = (selector: string): unknown => page.frameLocator(selector);

  // ─── Content / scripts ─────────────────────────────────────────────────────

  const setContent = (
    html: string,
    options?: { waitUntil?: WaitUntil; timeout?: unknown },
  ): Effect.Effect<void, CdpError> =>
    Effect.gen(function* () {
      const timeoutMs = options?.timeout
        ? Duration.toMillis(options.timeout as Duration.Duration)
        : 30_000;
      return yield* setContentPage(connection, state, frameManager, networkIdle, targetId, html, {
        waitUntil: options?.waitUntil,
        timeout: Duration.millis(timeoutMs),
      });
    });

  const addScriptTag = (options: AddScriptTagOptions): Effect.Effect<void, CdpError> =>
    Effect.gen(function* () {
      if (!options.url && !options.content) {
        return yield* new CdpErrorClass({
          source: "CdpPage",
          method: "frame.addScriptTag",
          reason: {
            _tag: "EvaluationError",
            description: "addScriptTag: provide either 'url' or 'content'",
          },
        } as never);
      }
      if (options.url && options.content) {
        return yield* new CdpErrorClass({
          source: "CdpPage",
          method: "frame.addScriptTag",
          reason: {
            _tag: "EvaluationError",
            description: "addScriptTag: provide only one of 'url' or 'content'",
          },
        } as never);
      }
      const contextId = yield* getMainContextIdOrFail(frameManager, frameId);
      const bodyCode = `
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          if (args.type) script.type = args.type;
          if (args.url) {
            const onLoad = () => { script.removeEventListener('error', onError); resolve(true); };
            const onError = () => { script.removeEventListener('load', onLoad); reject(new Error('Failed to load script: ' + args.url)); };
            script.addEventListener('load', onLoad);
            script.addEventListener('error', onError);
            script.src = args.url;
            (document.head || document.documentElement).appendChild(script);
          } else {
            script.textContent = args.content;
            (document.head || document.documentElement).appendChild(script);
            resolve(true);
          }
        });
      `;
      const wrapper = new Function("args", bodyCode) as (args: {
        type: string;
        url: string;
        content: string;
      }) => Promise<boolean>;
      return yield* evaluateFrame<Promise<boolean>>(
        connection,
        state,
        contextId,
        frameId,
        wrapper,
        {
          type: options.type ?? "",
          url: options.url ?? "",
          content: options.content ?? "",
        },
      );
    });

  const addStyleTag = (options: AddStyleTagOptions): Effect.Effect<void, CdpError> =>
    Effect.gen(function* () {
      if (!options.url && !options.content) {
        return yield* new CdpErrorClass({
          source: "CdpPage",
          method: "frame.addStyleTag",
          reason: {
            _tag: "EvaluationError",
            description: "addStyleTag: provide either 'url' or 'content'",
          },
        } as never);
      }
      if (options.url && options.content) {
        return yield* new CdpErrorClass({
          source: "CdpPage",
          method: "frame.addStyleTag",
          reason: {
            _tag: "EvaluationError",
            description: "addStyleTag: provide only one of 'url' or 'content'",
          },
        } as never);
      }
      const contextId = yield* getMainContextIdOrFail(frameManager, frameId);
      const bodyCode = `
        return new Promise((resolve, reject) => {
          if (args.url) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = args.url;
            const onLoad = () => { link.removeEventListener('error', onError); resolve(true); };
            const onError = () => { link.removeEventListener('load', onLoad); reject(new Error('Failed to load style: ' + args.url)); };
            link.addEventListener('load', onLoad);
            link.addEventListener('error', onError);
            (document.head || document.documentElement).appendChild(link);
          } else {
            const el = document.createElement('style');
            el.textContent = args.content;
            (document.head || document.documentElement).appendChild(el);
            resolve(true);
          }
        });
      `;
      const wrapper = new Function("args", bodyCode) as (args: {
        url: string;
        content: string;
      }) => Promise<boolean>;
      return yield* evaluateFrame<Promise<boolean>>(
        connection,
        state,
        contextId,
        frameId,
        wrapper,
        {
          url: options.url ?? "",
          content: options.content ?? "",
        },
      );
    });

  // ─── $eval / $$eval ─────────────────────────────────────────────────────────

  const $eval = <T, Arg = unknown>(
    selector: string,
    pageFunction: (element: Element, arg: Arg) => T,
    arg?: Arg,
  ): Effect.Effect<Awaited<T>, CdpError> =>
    Effect.gen(function* () {
      const contextId = yield* getMainContextIdOrFail(frameManager, frameId);
      const fnSource = pageFunction.toString();
      const wrapper = new Function(
        "sel",
        "arg",
        `const el = document.querySelector(sel);
        if (!el) throw new Error('No element matches selector: ' + sel);
        return (${fnSource})(el, arg);`,
      ) as (sel: string, arg: unknown) => T;
      return yield* evaluateFrame<T>(
        connection,
        state,
        contextId,
        frameId,
        wrapper,
        arg !== undefined
          ? ([selector, arg] as unknown as [string, Arg])
          : (selector as unknown as [string, Arg]),
      );
    });

  const $$eval = <T, Arg = unknown>(
    selector: string,
    pageFunction: (elements: ReadonlyArray<Element>, arg: Arg) => T,
    arg?: Arg,
  ): Effect.Effect<Awaited<T>, CdpError> =>
    Effect.gen(function* () {
      const contextId = yield* getMainContextIdOrFail(frameManager, frameId);
      const fnSource = pageFunction.toString();
      const wrapper = new Function(
        "sel",
        "arg",
        `const els = [...document.querySelectorAll(sel)];
        return (${fnSource})(els, arg);`,
      ) as (sel: string, arg: unknown) => T;
      return yield* evaluateFrame<T>(
        connection,
        state,
        contextId,
        frameId,
        wrapper,
        arg !== undefined
          ? ([selector, arg] as unknown as [string, Arg])
          : (selector as unknown as [string, Arg]),
      );
    });

  return {
    page: pageRef,
    title,
    evaluateHandle,
    click,
    dblclick,
    tap,
    hover,
    fill,
    focus,
    blur,
    type,
    press,
    check,
    uncheck,
    setChecked,
    selectOption,
    setInputFiles,
    dragAndDrop,
    dispatchEvent,
    textContent,
    innerText,
    innerHTML,
    getAttribute,
    inputValue,
    isChecked,
    isDisabled,
    isEditable,
    isEnabled,
    isHidden,
    isVisible,
    locator,
    getByRole,
    getByText,
    getByLabel,
    getByTestId,
    getByPlaceholder,
    getByAltText,
    getByTitle,
    frameLocator,
    setContent,
    addScriptTag,
    addStyleTag,
    $eval,
    $$eval,
  };
};
