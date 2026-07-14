/**
 * Inject a `<style>` element into the current page.
 *
 * Mirrors Playwright's `page.addStyleTag({ url?, path?, content? })` but
 * only supports `content` (inline CSS) and `url` (remote CSS file).
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, EvaluationError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

/** Options for `addStyleTag`. */
export interface AddStyleTagOptions {
  /** URL of the stylesheet to load. */
  readonly url?: string;
  /** Inline CSS content. */
  readonly content?: string;
}

const failAddStyleTag = (description: string): CdpError =>
  new CdpError({
    module: "CdpPage",
    method: "addStyleTag",
    reason: new EvaluationError({ description }),
  });

/**
 * Injects a `<style>` element into the current page.
 *
 * Exactly one of `url` or `content` must be provided. The style element is
 * appended to `document.head`. If `url` is used, the function resolves when
 * the stylesheet has loaded (or rejects on load error).
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param options - Style source options
 */
export const addStyleTag = Effect.fn("CdpPage.addStyleTag")(function (
  conn: CdpConnection["Service"],
  state: PageState,
  options: AddStyleTagOptions,
) {
  return Effect.gen(function* () {
    if (!options.url && !options.content) {
      return yield* failAddStyleTag("addStyleTag: provide either 'url' or 'content'");
    }
    if (options.url && options.content) {
      return yield* failAddStyleTag("addStyleTag: provide only one of 'url' or 'content'");
    }

    yield* ensureSession(state);

    // Self-contained wrapper — no closure refs shipped to browser.
    // We pass `args` as a named parameter to `new Function` rather than
    // wrapping in an arrow function. Otherwise the arrow becomes a no-op
    // statement inside the generated anonymous function body.
    const bodyCode = `
      return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        const cleanup = () => {
          link.removeEventListener('load', onLoad);
          link.removeEventListener('error', onError);
        };
        const onLoad = () => { cleanup(); resolve(true); };
        const onError = () => { cleanup(); reject(new Error('Failed to load stylesheet: ' + args.url)); };
        link.addEventListener('load', onLoad);
        link.addEventListener('error', onError);
        if (args.url) {
          link.href = args.url;
        } else {
          // Inline content — wrap in a <style> element directly.
          const style = document.createElement('style');
          style.textContent = args.content;
          (document.head || document.documentElement).appendChild(style);
          resolve(true);
          return;
        }
        (document.head || document.documentElement).appendChild(link);
      });
    `;
    const wrapper = new Function("args", bodyCode) as (args: {
      url: string;
      content: string;
    }) => Promise<boolean>;

    yield* evaluatePage<Promise<boolean>>(conn, state, wrapper, {
      url: options.url ?? "",
      content: options.content ?? "",
    }).pipe(Effect.mapError((cause) => failAddStyleTag(getErrorMessage(cause))));
  });
});
