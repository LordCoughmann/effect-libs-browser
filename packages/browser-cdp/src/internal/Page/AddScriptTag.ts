/**
 * Inject a `<script>` element into the current page.
 *
 * Mirrors Playwright's `page.addScriptTag({ url, path, content, type })` but
 * runs in the current document (not on every new document like `addInitScript`).
 *
 * Supports:
 * - `url`: load from a remote URL
 * - `content`: inline script body
 * - `type`: `type` attribute (e.g. `"module"`)
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, EvaluationError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

/** Options for `addScriptTag`. */
export interface AddScriptTagOptions {
  /** URL of the script to load. */
  readonly url?: string;
  /** Inline script body. */
  readonly content?: string;
  /** `type` attribute (e.g. `"module"`). */
  readonly type?: string;
}

const failAddScriptTag = (description: string) =>
  Effect.fail(
    new CdpError({
      module: "CdpPage",
      method: "addScriptTag",
      reason: new EvaluationError({ description }),
    }),
  );

/**
 * Injects a `<script>` element into the current page and waits for it to load.
 *
 * Exactly one of `url` or `content` must be provided. The script is appended
 * to `document.head`. If `url` is used, the function resolves when the script
 * has finished loading (or rejects on load error).
 *
 * ```typescript
 * // From URL
 * yield* page.addScriptTag({ url: "https://example.com/lib.js" });
 *
 * // Inline
 * yield* page.addScriptTag({ content: "window.MY_VAR = 42;" });
 *
 * // ES module
 * yield* page.addScriptTag({ url: "/mod.js", type: "module" });
 * ```
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param options - Script source options
 */
export const addScriptTag = Effect.fn("CdpPage.addScriptTag")(function (
  conn: CdpConnection["Service"],
  state: PageState,
  options: AddScriptTagOptions,
) {
  return Effect.gen(function* () {
    if (!options.url && !options.content) {
      return yield* failAddScriptTag("addScriptTag: provide either 'url' or 'content'");
    }
    if (options.url && options.content) {
      return yield* failAddScriptTag("addScriptTag: provide only one of 'url' or 'content'");
    }

    yield* ensureSession(state);

    // Self-contained wrapper — no closure refs shipped to browser.
    // We pass `args` as a named parameter to `new Function` rather than
    // wrapping in an arrow function. Otherwise the arrow becomes a no-op
    // statement inside the generated anonymous function body.
    //
    // Inline scripts (`textContent` set, no `src`) execute synchronously
    // upon insertion and do NOT fire `load` or `error` events per the HTML5
    // spec (those events are reserved for resources fetched over the
    // network). Waiting for `load` on an inline script hangs forever.
    // Mirror `AddStyleTag`'s branching: resolve immediately for inline.
    const bodyCode = `
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        if (args.type) {
          script.type = args.type;
        }
        if (args.url) {
          // External script: wait for load/error events.
          const onLoad = () => { script.removeEventListener('error', onError); resolve(true); };
          const onError = () => { script.removeEventListener('load', onLoad); reject(new Error('Failed to load script: ' + args.url)); };
          script.addEventListener('load', onLoad);
          script.addEventListener('error', onError);
          script.src = args.url;
          (document.head || document.documentElement).appendChild(script);
        } else {
          // Inline script: executes synchronously on insert, no events fire.
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

    const result = yield* evaluatePage<Promise<boolean>>(conn, state, wrapper, {
      type: options.type ?? "",
      url: options.url ?? "",
      content: options.content ?? "",
    }).pipe(
      Effect.mapError(
        (cause) =>
          new CdpError({
            module: "CdpPage",
            method: "addScriptTag",
            reason: new EvaluationError({
              description: getErrorMessage(cause),
            }),
          }),
      ),
    );
    return result;
  });
});
