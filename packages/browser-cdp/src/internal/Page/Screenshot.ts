/**
 * Screenshot capture operation via CDP.
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, ScreenshotError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

/** Options for screenshot capture. */
export interface ScreenshotOptions {
  /** Image format (default: "png") */
  readonly format?: "jpeg" | "png" | "webp";
  /** Quality for jpeg (1-100, default: 80) */
  readonly quality?: number;
  /** Capture only this element */
  readonly selector?: string;
}

/** Helper to fail with CdpError wrapping ScreenshotError. */
const failScreenshot = (description: string) =>
  Effect.fail(
    new CdpError({
      module: "CdpPage",
      method: "screenshot",
      reason: new ScreenshotError({ description }),
    }),
  );

/**
 * Captures a screenshot of the page.
 *
 * Uses CDP Page.captureScreenshot for reliable capture.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param options - Screenshot options (format, quality, selector)
 */
export const captureScreenshot = Effect.fn("CdpPage.screenshot")(
  (conn: CdpConnection["Service"], state: PageState, options?: ScreenshotOptions) =>
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);

      const format = options?.format ?? "png";
      const quality = options?.quality ?? (format === "jpeg" ? 80 : undefined);

      // If selector specified, clip to that element
      let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined;
      if (options?.selector) {
        const bounds = yield* evaluatePage(
          conn,
          state,
          ([sel]: [string]) => {
            const el = document.querySelector(sel);
            if (!el) throw new Error(`Element not found: ${sel}`);
            const rect = el.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          },
          [options.selector],
        );
        clip = { ...bounds, scale: 1 };
      }

      const result = yield* conn.cdp.Page.captureScreenshot(
        {
          format,
          quality,
          clip,
        },
        sessionId,
      ).pipe(
        Effect.catch((cause) =>
          failScreenshot(`CDP Page.captureScreenshot failed: ${getErrorMessage(cause)}`),
        ),
      );

      // Decode base64 to Uint8Array
      const base64 = result.data;
      if (!base64) {
        return yield* failScreenshot("Screenshot: missing data");
      }

      // Wrap atob in Effect.try for proper error handling
      const bytes = yield* Effect.try({
        try: () => {
          const binary = atob(base64);
          const arr = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            arr[i] = binary.charCodeAt(i);
          }
          return arr;
        },
        catch: (cause) =>
          new CdpError({
            module: "CdpPage",
            method: "screenshot",
            reason: new ScreenshotError({
              description: `Failed to decode screenshot: ${String(cause)}`,
            }),
          }),
      });
      return bytes;
    }),
);
