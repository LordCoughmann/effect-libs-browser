/**
 * Set files on an `<input type="file">` element.
 *
 * Mirrors Playwright's `page.setInputFiles(selector, files, options?)`.
 * Uses CDP `DOM.setFileInputFiles` directly with the resolved input's
 * `nodeId`. Supports local file paths and synthetic in-memory files.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, isCdpError, SelectorError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

/**
 * A file path to set on an input element.
 *
 * CDP's `DOM.setFileInputFiles` only supports file paths (the path must be
 * accessible to the browser process). For in-memory file uploads, use
 * `page.evaluate` to programmatically populate the input's `files` property
 * via a `File` constructor.
 */
export type InputFile = string;

/** Map errors to SelectorError for setInputFiles operations. */
const mapError = (selector: string) =>
  Effect.mapError((cause: unknown) => {
    let description = getErrorMessage(cause);
    if (isCdpError(cause) && "description" in cause.reason) {
      description = cause.reason.description;
    }
    return new CdpError({
      source: "CdpPage",
      method: "setInputFiles",
      reason: new SelectorError({ selector, description }),
    });
  });

/**
 * Sets files on the file input element matching the selector.
 *
 * The selector must match a single `<input type="file">` element. Does NOT
 * wait for the element to appear — fails immediately if not found.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param selector - CSS selector for the file input
 * @param files - Array of files (paths or in-memory data)
 */
export const setInputFiles = Effect.fn("CdpPage.setInputFiles")(function (
  conn: CdpConnection["Service"],
  state: PageState,
  selector: string,
  files: ReadonlyArray<InputFile>,
) {
  return Effect.gen(function* () {
    const sessionId = yield* ensureSession(state);

    // Step 1: Resolve the input element to a DOM nodeId via the browser.
    // We use evaluatePage to find the input and get the backendNodeId.
    // The backendNodeId is stable across DOM mutations, unlike nodeId.
    //
    // We pass the body as the third arg to `new Function` (no params here)
    // rather than wrapping in an arrow function. Otherwise the arrow becomes
    // a no-op statement inside the generated anonymous function body.
    const selectorJson = JSON.stringify(selector);
    const bodyCode = `
      const el = document.querySelector(${selectorJson});
      if (!el) return { ok: false, reason: 'not found' };
      if (!(el instanceof HTMLInputElement) || el.type !== 'file') {
        return { ok: false, reason: 'not a file input' };
      }
      return { ok: true };
    `;
    const wrapper = new Function(bodyCode) as () => { ok: boolean; reason?: string };

    const result = yield* evaluatePage<{ ok: boolean; reason?: string }>(conn, state, wrapper).pipe(
      mapError(selector),
    );

    if (!result.ok) {
      return yield* new CdpError({
        source: "CdpPage",
        method: "setInputFiles",
        reason: new SelectorError({
          selector,
          description:
            result.reason === "not found"
              ? `No element matches selector "${selector}"`
              : `Element matching "${selector}" is not a file input`,
        }),
      });
    }

    // Step 2: Get the document and find the input's backendNodeId via
    // DOM.getDocument + DOM.querySelector. This is the most reliable way
    // to get a stable identifier for CDP DOM operations.
    yield* conn.cdp.DOM.enable({}, sessionId).pipe(
      Effect.mapError(
        (cause) =>
          new CdpError({
            source: "CdpPage",
            method: "setInputFiles",
            reason: new SelectorError({
              selector,
              description: `Failed to enable DOM domain: ${getErrorMessage(cause)}`,
            }),
          }),
      ),
    );

    const doc = yield* conn.cdp.DOM.getDocument({ depth: -1, pierce: true }, sessionId).pipe(
      Effect.mapError(
        (cause) =>
          new CdpError({
            source: "CdpPage",
            method: "setInputFiles",
            reason: new SelectorError({
              selector,
              description: `Failed to get document: ${getErrorMessage(cause)}`,
            }),
          }),
      ),
    );

    const found = yield* conn.cdp.DOM.querySelector(
      { nodeId: doc.root.nodeId, selector },
      sessionId,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new CdpError({
            source: "CdpPage",
            method: "setInputFiles",
            reason: new SelectorError({
              selector,
              description: `Failed to find input: ${getErrorMessage(cause)}`,
            }),
          }),
      ),
    );

    // Step 3: Call setFileInputFiles with the nodeId and file paths.
    yield* conn.cdp.DOM.setFileInputFiles(
      { nodeId: found.nodeId, files: [...files] },
      sessionId,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new CdpError({
            source: "CdpPage",
            method: "setInputFiles",
            reason: new SelectorError({
              selector,
              description: `Failed to set files: ${getErrorMessage(cause)}`,
            }),
          }),
      ),
    );
  });
});
