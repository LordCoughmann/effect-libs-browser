/**
 * Download handling — fires when the browser initiates a file download.
 *
 * Mirrors Playwright's `page.on('download', handler)` event stream.
 * CDP events:
 * - `Browser.downloadWillBegin` — emitted when a download starts
 * - `Browser.downloadProgress`  — emitted during/after completion
 *
 * Configuration: `Browser.setDownloadBehavior` with `behavior: "allow"` and
 * `eventsEnabled: true`. Requires `downloadPath` to be a path accessible to
 * the browser process.
 *
 */

import type { Scope } from "effect";

import type { CdpConnection } from "../CdpConnection.js";

import { Effect, PubSub, Ref, Stream } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, CommandError } from "../../CdpError.js";
import { type PageState } from "./PageState.js";

/**
 * A browser-initiated file download.
 *
 * Consumers SHOULD call `path()` (or `failure()`) to determine the final
 * state. The download is complete when `Browser.downloadProgress` reports
 * `state: "completed"`.
 */
export interface CdpDownload {
  /** CDP global unique identifier for the download. */
  readonly guid: string;
  /** URL the download was initiated from. */
  readonly url: string;
  /** Filename suggested by the response's Content-Disposition header. */
  readonly suggestedFilename: string;
  /** Frame ID that triggered the download. */
  readonly frameId: string;

  /**
   * The local file system path to the downloaded file.
   *
   * Only meaningful after the download completes. May throw if the
   * download failed.
   */
  readonly path: () => Effect.Effect<string, CdpError>;

  /**
   * Cancel the download.
   */
  readonly cancel: () => Effect.Effect<void, CdpError>;
}

/**
 * Build a CdpDownload handle from a Browser.downloadWillBegin event.
 */
const makeDownloadFromCdp = (
  conn: CdpConnection["Service"],
  state: PageState,
  params: {
    guid?: string;
    url?: string;
    suggestedFilename?: string;
    frameId?: string;
  },
): Effect.Effect<CdpDownload, never> =>
  Effect.gen(function* () {
    const stateRef = yield* Ref.make<"inProgress" | "completed" | "canceled">("inProgress");
    const finalPath = yield* Ref.make<string | null>(null);
    const failure = yield* Ref.make<string | null>(null);

    const path = (): Effect.Effect<string, CdpError> =>
      Effect.gen(function* () {
        const f = yield* Ref.get(failure);
        if (f !== null) {
          return yield* new CdpError({
            module: "CdpPage",
            method: "download.path",
            reason: new CommandError({
              method: "Browser.downloadProgress",
              description: f,
            }),
          });
        }
        const p = yield* Ref.get(finalPath);
        if (p === null) {
          return yield* new CdpError({
            module: "CdpPage",
            method: "download.path",
            reason: new CommandError({
              method: "Browser.downloadProgress",
              description: "Download not yet completed",
            }),
          });
        }
        return p;
      });

    const cancel = (): Effect.Effect<void, CdpError> =>
      Effect.gen(function* () {
        if (!params.guid) return;
        yield* conn.cdp.Browser.cancelDownload({ guid: params.guid }).pipe(
          Effect.mapError(
            (cause) =>
              new CdpError({
                module: "CdpPage",
                method: "download.cancel",
                reason: new CommandError({
                  method: "Browser.cancelDownload",
                  description: getErrorMessage(cause),
                }),
              }),
          ),
        );
        yield* Ref.set(stateRef, "canceled");
      });

    // Cache the state in page state so downloadProgress can update it.
    const guid = params.guid;
    if (guid !== undefined) {
      yield* Ref.update(state.downloads, (m) => {
        const next = new Map(m);
        next.set(guid, {
          guid,
          state: stateRef,
          finalPath,
          failure,
        });
        return next;
      });
    }

    return {
      guid: params.guid ?? "",
      url: params.url ?? "",
      suggestedFilename: params.suggestedFilename ?? "",
      frameId: params.frameId ?? "",
      path,
      cancel,
    } satisfies CdpDownload;
  });

/**
 * Configure the browser to allow downloads and emit events.
 *
 * @param conn - CDP connection service
 * @param downloadPath - Directory where downloaded files will be saved
 */
export const configureDownloads = (
  conn: CdpConnection["Service"],
  downloadPath: string,
): Effect.Effect<void, CdpError> =>
  conn.cdp.Browser.setDownloadBehavior({
    behavior: "allow",
    downloadPath,
    eventsEnabled: true,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new CdpError({
          module: "CdpPage",
          method: "configureDownloads",
          reason: new CommandError({
            method: "Browser.setDownloadBehavior",
            description: getErrorMessage(cause),
          }),
        }),
    ),
  );

/**
 * Build an `onDownload` stream view of a download PubSub.
 */
export const onDownloadStream = (
  downloadPubSub: PubSub.PubSub<CdpDownload>,
): Effect.Effect<Stream.Stream<CdpDownload>, never, Scope.Scope> =>
  Effect.map(PubSub.subscribe(downloadPubSub), (subscription) =>
    Stream.fromSubscription(subscription),
  );

/** Helper: handle a Browser.downloadProgress event, updating cached download state. */
export const handleDownloadProgress = (
  state: PageState,
  params: {
    guid?: string;
    state?: "inProgress" | "completed" | "canceled";
    filePath?: string;
    error?: string;
  },
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    if (!params.guid) return;
    const downloads = yield* Ref.get(state.downloads);
    const entry = downloads.get(params.guid);
    if (!entry) return;
    if (params.state) {
      yield* Ref.set(entry.state, params.state);
    }
    if (params.filePath) {
      yield* Ref.set(entry.finalPath, params.filePath);
    }
    if (params.error) {
      yield* Ref.set(entry.failure, params.error);
    }
  });

export { makeDownloadFromCdp };
