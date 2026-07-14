/**
 * Parity tests for `browser-cdp` page.onDownload.
 *
 * Mirrors Playwright's `page.on('download', handler)` event stream.
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 *
 * Behavior verified:
 * - clicking a link with `download` attribute triggers a CdpDownload event
 *   with the right suggestedFilename and a resolvable final path
 * - download cancellation via CdpDownload.cancel() does not throw
 * - the CdpDownload has a non-empty guid and the right url
 *
 * NOTE: The download path must be accessible to the *browser process*, not
 * just Node. We create a scoped temp directory which Chrome can read on
 * Linux/macOS.
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, FileSystem, Fiber, Option, Stream } from "effect";
import * as Str from "effect/String";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";
import { isWorkersRuntime, provideCdpWithFs } from "./_nodeFs.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

/** Create a scoped temp directory for the browser to download into. */
const makeDownloadDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: "cdp-downloads-" });
});

/**
 * Wait for the browser to finish a download by polling the directory.
 * Returns the path of the first file that appears, or null if timed out.
 */
const waitForFile = (
  dir: string,
  filename: string,
  timeoutMs: number,
): Effect.Effect<string | null, never> =>
  Effect.gen(function* () {
    const target = join(dir, filename);
    const stepMs = 50;
    const steps = Math.ceil(timeoutMs / stepMs);
    for (let i = 0; i < steps; i++) {
      if (existsSync(target)) {
        return target;
      }
      yield* Effect.sleep(`${stepMs} millis`);
    }
    return null;
  });

export const defineDownloadTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  // These tests need a real Node filesystem (temp dirs, file reads) via
  // `@effect/platform-node`'s NodeFileSystem. workerd has neither a usable Node
  // fs nor a loadable `@effect/platform-node` (undici 8 crashes on import — see
  // ./_nodeFs.ts). Skip the whole group there. See isWorkersRuntime() docs.
  const describeFs = isWorkersRuntime() ? describe.skip : describe;

  describeFs("page.onDownload", () => {
    test.live(
      "onDownload - should emit a CdpDownload when a link with download attr is clicked [CDP-EXTENSION: page-level onDownload stream (upstream uses filechooser callback)]",
      () =>
        Effect.gen(function* () {
          const downloadDir = yield* makeDownloadDir;
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/download-test.html`);

              const downloads = yield* page.onDownload({ downloadPath: downloadDir });
              const collectFiber = yield* Effect.forkChild(
                downloads.pipe(
                  Stream.take(1),
                  Stream.runCollect,
                  Effect.map((chunk) => Array.from(chunk)),
                ),
              );

              // Click the link
              yield* page.click("#dl");

              const collected = yield* Fiber.join(collectFiber);
              const dl = collected[0]!;
              yield* assertEqual(dl.suggestedFilename, "test.csv");

              // Wait for the file to land in the download dir
              const path = yield* waitForFile(downloadDir, "test.csv", 5000);
              yield* assertTrue(path !== null);
              if (path) {
                const content = readFileSync(path, "utf-8");
                yield* assertEqual(content.startsWith("id,name"), true);
              }
            }),
          );
        }).pipe(Effect.scoped, provideCdpWithFs),
    );

    test.live(
      "onDownload - CdpDownload.cancel() should not throw [CDP-EXTENSION: page-level onDownload stream (upstream uses filechooser callback)]",
      () =>
        Effect.gen(function* () {
          const downloadDir = yield* makeDownloadDir;
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/download-test.html`);

              const downloads = yield* page.onDownload({ downloadPath: downloadDir });
              const cancelFiber = yield* Effect.forkChild(
                Effect.gen(function* () {
                  const d = yield* downloads.pipe(Stream.take(1), Stream.runHead);
                  if (Option.isSome(d)) {
                    yield* d.value.cancel();
                  }
                }),
              );

              yield* page.click("#dl");
              yield* Fiber.join(cancelFiber);

              // Give the browser a moment to process the cancel
              yield* page.waitForTimeout(500);

              // Cancellation timing is racy; the important thing is that the
              // API didn't error and cancel() returned successfully.
            }),
          );
        }).pipe(Effect.scoped, provideCdpWithFs),
    );

    test.live(
      "onDownload - should expose guid and url on the CdpDownload [CDP-EXTENSION: page-level onDownload stream (upstream uses filechooser callback)]",
      () =>
        Effect.gen(function* () {
          const downloadDir = yield* makeDownloadDir;
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/download-test.html`);

              const downloads = yield* page.onDownload({ downloadPath: downloadDir });
              const collectedFiber = yield* Effect.forkChild(
                downloads.pipe(
                  Stream.take(1),
                  Stream.runCollect,
                  Effect.map((chunk) => Array.from(chunk)),
                ),
              );

              yield* page.click("#dl");
              const collected = yield* Fiber.join(collectedFiber);
              const dl = collected[0]!;
              // guid is non-empty
              yield* assertTrue(Str.isNonEmpty(dl.guid));
              // url is the original request URL
              yield* assertTrue(dl.url.includes("/download/test.csv"));
            }),
          );
        }).pipe(Effect.scoped, provideCdpWithFs),
    );
  });
};
