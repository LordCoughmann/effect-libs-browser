/**
 * JavaScript dialog handling — alert, confirm, prompt, beforeunload.
 *
 * Mirrors Playwright's `page.on('dialog', handler)` event stream.
 * CDP emits `Page.javascriptDialogOpening` when a dialog appears, and the
 * consumer MUST call `accept()` or `dismiss()` (CDP auto-dismisses after
 * ~30s otherwise).
 *
 */

import type { Scope } from "effect";

import type { CdpConnection } from "../CdpConnection.js";

import { Effect, PubSub, Stream } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, CommandError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";

/** Type of JavaScript dialog. */
export type DialogType = "alert" | "beforeunload" | "confirm" | "prompt";

/**
 * A JavaScript dialog emitted by the page.
 *
 * Consumers MUST call `accept()` or `dismiss()` within ~30 seconds, or
 * CDP will auto-dismiss the dialog.
 */
export interface CdpDialog {
  /** Dialog type. */
  readonly type: DialogType;
  /** Message text shown in the dialog. */
  readonly message: string;
  /** Default value for `prompt` dialogs (the placeholder text). */
  readonly defaultValue: string;
  /** URL of the page that triggered the dialog. */
  readonly url: string;

  /**
   * Accept the dialog. For `prompt`, optionally provide a text response.
   */
  readonly accept: (promptText?: string) => Effect.Effect<void, CdpError>;

  /**
   * Dismiss/cancel the dialog. Equivalent to clicking Cancel.
   */
  readonly dismiss: () => Effect.Effect<void, CdpError>;
}

/**
 * Build a CdpDialog from raw CDP `Page.javascriptDialogOpening` event params.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param params - Raw CDP event params
 */
export const makeDialogFromCdp = (
  conn: CdpConnection["Service"],
  state: PageState,
  params: {
    type?: string;
    message?: string;
    defaultPrompt?: string;
    url?: string;
  },
): Effect.Effect<CdpDialog, CdpError> =>
  Effect.gen(function* () {
    yield* ensureSession(state);

    const accept = (promptText?: string): Effect.Effect<void, CdpError> =>
      Effect.gen(function* () {
        const sid = yield* ensureSession(state);
        yield* conn.cdp.Page.handleJavaScriptDialog(
          { accept: true, promptText: promptText ?? "" },
          sid,
        ).pipe(
          Effect.mapError(
            (cause) =>
              new CdpError({
                module: "CdpPage",
                method: "dialog.accept",
                reason: new CommandError({
                  method: "Page.handleJavaScriptDialog",
                  description: getErrorMessage(cause),
                }),
              }),
          ),
        );
      });

    const dismiss = (): Effect.Effect<void, CdpError> =>
      Effect.gen(function* () {
        const sid = yield* ensureSession(state);
        yield* conn.cdp.Page.handleJavaScriptDialog({ accept: false }, sid).pipe(
          Effect.mapError(
            (cause) =>
              new CdpError({
                module: "CdpPage",
                method: "dialog.dismiss",
                reason: new CommandError({
                  method: "Page.handleJavaScriptDialog",
                  description: getErrorMessage(cause),
                }),
              }),
          ),
        );
      });

    return {
      type: (params.type as DialogType) ?? "alert",
      message: params.message ?? "",
      defaultValue: params.defaultPrompt ?? "",
      url: params.url ?? "",
      accept,
      dismiss,
    } satisfies CdpDialog;
  });

/**
 * Build an `onDialog` stream view of a dialog PubSub.
 *
 * Returns an `Effect` that acquires a scoped subscription to the pubsub.
 * The subscription is eager — events emitted before the stream is pulled
 * are buffered.
 */
export const onDialogStream = (
  dialogPubSub: PubSub.PubSub<CdpDialog>,
): Effect.Effect<Stream.Stream<CdpDialog>, never, Scope.Scope> =>
  Effect.map(PubSub.subscribe(dialogPubSub), (subscription) =>
    Stream.fromSubscription(subscription),
  );
