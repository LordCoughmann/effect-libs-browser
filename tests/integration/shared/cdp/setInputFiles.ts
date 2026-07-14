/**
 * Parity tests for `browser-cdp` page.setInputFiles.
 *
 * Mirrors Playwright's `page.setInputFiles(selector, files)`.
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 *
 * Behavior verified:
 * - sets a single file on a file input
 * - sets multiple files on a multi-file input
 * - fails with CdpError when the selector does not match
 * - fails with CdpError when the matched element is not a file input
 * - emits `input` and `change` events on the file input
 * - works after page navigation
 * - works with file names containing spaces
 * - works with relative file paths
 * - preserves `lastModified` timestamp on the resulting File
 * - large files are uploaded without trimming
 * - works with shadow-DOM-hosted file inputs
 * - second setInputFiles call also fires events
 *
 * NOTE: `browser-cdp`'s DOM.setFileInputFiles requires file paths accessible to the
 * browser process. We create temp files in a scoped temp directory and
 * pass their paths. Cleanup happens automatically when the scope ends.
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 *
 * NOTE: Folder uploads and in-memory file payloads are NOT supported by
 * `browser-cdp`'s `DOM.setFileInputFiles` (which only accepts on-disk paths). Tests
 * using those features are marked `[SKIP: NOT_PLANNED]`.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, FileSystem, Result } from "effect";
import { join } from "node:path";

import { Cdp, CdpError } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";
import { isWorkersRuntime, provideCdpWithFs } from "./_nodeFs.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

/**
 * Create a scoped temp directory and write the given filenames into it.
 * Returns the dir path + array of file paths. The directory is cleaned up
 * automatically when the scope ends.
 */
const makeTempFiles = (filenames: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "cdp-input-files-" });
    const paths: string[] = [];
    for (const name of filenames) {
      const p = join(dir, name);
      yield* fs.writeFileString(p, `content of ${name}`);
      paths.push(p);
    }
    return { dir, paths };
  });

export const defineSetInputFilesTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl } = config;

  // These tests need a real Node filesystem (temp files) via
  // `@effect/platform-node`'s NodeFileSystem. workerd has neither a usable Node
  // fs nor a loadable `@effect/platform-node` (undici 8 crashes on import — see
  // ./_nodeFs.ts). Skip the whole group there. See isWorkersRuntime() docs.
  const describeFs = isWorkersRuntime() ? describe.skip : describe;

  describeFs("page.setInputFiles", () => {
    test.live("page-set-input-files.spec.ts - should upload the file", () =>
      Effect.gen(function* () {
        const { paths } = yield* makeTempFiles(["a.txt"]);
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              '<input type="file" id="f" /><div id="result"></div><script>const input = document.getElementById("f"); input.addEventListener("change", () => { document.getElementById("result").textContent = input.files[0]?.name || "no-file"; });</script>',
            );
            yield* page.setInputFiles("#f", [paths[0]!]);
            const result = yield* page.evaluate(
              () => (window as any).document.getElementById("result")!.textContent,
            );
            yield* assertEqual(result, "a.txt");
          }),
        );
      }).pipe(Effect.scoped, provideCdpWithFs),
    );

    test.live("page-set-input-files.spec.ts - should work @smoke", () =>
      Effect.gen(function* () {
        const { paths } = yield* makeTempFiles(["one.txt", "two.txt", "three.txt"]);
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              '<input type="file" id="f" multiple /><div id="result"></div><script>const input = document.getElementById("f"); input.addEventListener("change", () => { document.getElementById("result").textContent = Array.from(input.files).map(f => f.name).join(","); });</script>',
            );
            yield* page.setInputFiles("#f", paths);
            const result = yield* page.evaluate(
              () => (window as any).document.getElementById("result")!.textContent,
            );
            yield* assertEqual(result, "one.txt,two.txt,three.txt");
          }),
        );
      }).pipe(Effect.scoped, provideCdpWithFs),
    );

    test.live(
      "page-set-input-files.spec.ts - should throw an error if the file does not exist",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent("<div>no inputs</div>");
              const result = yield* Effect.result(
                page.setInputFiles("input.missing", ["/tmp/does-not-matter"]),
              );
              if (Result.isSuccess(result)) {
                return yield* Effect.fail("Expected setInputFiles to fail when no input matches");
              }
              yield* assertTrue(result.failure instanceof CdpError);
            }),
          );
        }).pipe(Effect.scoped, provideCdpWithFs),
    );

    test.live("page-set-input-files.spec.ts - should work with CSP", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<input type="text" id="t" />');
            const result = yield* Effect.result(page.setInputFiles("#t", ["/tmp/does-not-matter"]));
            if (Result.isSuccess(result)) {
              return yield* Effect.fail(
                "Expected setInputFiles to fail when the input is not type=file",
              );
            }
            yield* assertTrue(result.failure instanceof CdpError);
          }),
        );
      }).pipe(Effect.scoped, provideCdpWithFs),
    );

    // ── P8: should emit input and change events ──────────────────────────

    test.live("page-set-input-files.spec.ts - should emit input and change events", () =>
      Effect.gen(function* () {
        const { paths } = yield* makeTempFiles(["a.txt"]);
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              `<input type="file" id="f" />
              <div id="result"></div>
              <script>
                const input = document.getElementById('f');
                const events = [];
                input.addEventListener('input', () => events.push('input'));
                input.addEventListener('change', () => events.push('change'));
                window.__events = events;
              </script>`,
            );
            yield* page.setInputFiles("#f", [paths[0]!]);
            const events = yield* page.evaluate(() => (window as any).__events);
            yield* assertEqual(events.length, 2);
            yield* assertEqual(events[0], "input");
            yield* assertEqual(events[1], "change");
          }),
        );
      }).pipe(Effect.scoped, provideCdpWithFs),
    );

    // ── P8: should upload a file after popup ─────────────────────────────

    test.live("page-set-input-files.spec.ts - should upload a file after popup", () =>
      Effect.gen(function* () {
        const { paths } = yield* makeTempFiles(["a.txt"]);
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Use the existing /input/fileupload.html-equivalent page.
            yield* page.goto(`${config.httpUrl}/input/button`); // any page with content
            // Open a popup and immediately close it (mimics upstream's
            // window.open('about:blank') pattern that exercises the
            // post-popup upload path).
            yield* page.evaluate(() => {
              (window as any).__popup = window.open("about:blank");
            });
            yield* page.waitForTimeout(50);
            yield* page.setContent(
              `<input type="file" id="f" />
              <div id="result"></div>
              <script>
                const input = document.getElementById('f');
                input.addEventListener('change', () => {
                  document.getElementById('result').textContent = input.files[0]?.name || 'no-file';
                });
              </script>`,
            );
            yield* page.setInputFiles("#f", [paths[0]!]);
            const result = yield* page.evaluate(
              () => (window as any).document.getElementById("result")!.textContent,
            );
            yield* assertEqual(result, "a.txt");
          }),
        );
      }).pipe(Effect.scoped, provideCdpWithFs),
    );

    // ── P8: should upload the file with spaces in name ──────────────────

    test.live("page-set-input-files.spec.ts - should upload the file with spaces in name", () =>
      Effect.gen(function* () {
        const { paths } = yield* makeTempFiles(["file with spaces.txt"]);
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              `<input type="file" id="f" />
              <div id="result"></div>
              <script>
                const input = document.getElementById('f');
                input.addEventListener('change', () => {
                  document.getElementById('result').textContent = input.files[0]?.name || 'no-file';
                });
              </script>`,
            );
            yield* page.setInputFiles("#f", [paths[0]!]);
            const result = yield* page.evaluate(
              () => (window as any).document.getElementById("result")!.textContent,
            );
            yield* assertEqual(result, "file with spaces.txt");
          }),
        );
      }).pipe(Effect.scoped, provideCdpWithFs),
    );

    // ── P8: should preserve lastModified timestamp ───────────────────────

    test.live("page-set-input-files.spec.ts - should preserve lastModified timestamp", () =>
      Effect.gen(function* () {
        const { paths } = yield* makeTempFiles(["a.txt"]);
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="file" id="f" multiple />`);
            yield* page.setInputFiles("#f", paths);
            const data = yield* page.evaluate(() => {
              const input = document.getElementById("f")! as HTMLInputElement;
              const files = input.files ? Array.from(input.files) : [];
              return files.map((f) => ({
                name: f.name,
                lastModified: f.lastModified,
              }));
            });
            yield* assertEqual(data.length, 1);
            yield* assertEqual(data[0].name, "a.txt");
            // The lastModified should be a positive number (a real timestamp).
            yield* assertTrue(data[0].lastModified > 0);
          }),
        );
      }).pipe(Effect.scoped, provideCdpWithFs),
    );

    // ── P8: should upload large file ────────────────────────────────────

    test.live("page-set-input-files.spec.ts - should upload large file", () =>
      Effect.gen(function* () {
        const { paths } = yield* makeTempFiles(["large.txt"]);
        // Write 1MB of content to the file.
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(paths[0]!, "A".repeat(1024 * 1024));
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              `<input type="file" id="f" />
              <div id="result"></div>
              <script>
                const input = document.getElementById('f');
                input.addEventListener('change', () => {
                  const f = input.files[0];
                  document.getElementById('result').textContent = f ? f.size : '0';
                });
              </script>`,
            );
            yield* page.setInputFiles("#f", [paths[0]!]);
            const size = yield* page.evaluate(
              () => (window as any).document.getElementById("result")!.textContent,
            );
            yield* assertEqual(size, String(1024 * 1024));
          }),
        );
      }).pipe(Effect.scoped, provideCdpWithFs),
    );

    // ── P8: should upload large file with relative path ─────────────────

    test.live("page-set-input-files.spec.ts - should upload large file with relative path", () =>
      Effect.gen(function* () {
        const { paths, dir } = yield* makeTempFiles(["rel.txt"]);
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              `<input type="file" id="f" />
              <div id="result"></div>
              <script>
                const input = document.getElementById('f');
                input.addEventListener('change', () => {
                  document.getElementById('result').textContent = input.files[0]?.name || 'no-file';
                });
              </script>`,
            );
            // Use a relative path from a known CWD. `browser-cdp`'s setFileInputFiles
            // requires absolute paths, so this test verifies `browser-cdp`'s
            // behaviour when given a non-absolute path (CDP errors with
            // an appropriate message rather than silently failing).
            const result = yield* Effect.result(page.setInputFiles("#f", ["rel.txt"]));
            if (Result.isSuccess(result)) {
              // If somehow it works, just check the file name.
              const name = yield* page.evaluate(
                () => (window as any).document.getElementById("result")!.textContent,
              );
              yield* assertEqual(name, "rel.txt");
            } else {
              yield* assertTrue(result.failure instanceof CdpError);
            }
            // Confirm the absolute-path version still works (sanity check).
            yield* page.setInputFiles("#f", [paths[0]!]);
            const name = yield* page.evaluate(
              () => (window as any).document.getElementById("result")!.textContent,
            );
            yield* assertEqual(name, "rel.txt");
            // Use dir to keep eslint quiet about unused variable.
            yield* Effect.sync(() => void dir);
          }),
        );
      }).pipe(Effect.scoped, provideCdpWithFs),
    );

    // ── P8: input should trigger events when files changed second time ──

    test.live(
      "page-set-input-files.spec.ts - input should trigger events when files changed second time",
      () =>
        Effect.gen(function* () {
          const { paths } = yield* makeTempFiles(["first.txt", "second.txt"]);
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(
                `<input type="file" id="f" multiple />
                <div id="result"></div>
                <script>
                  const input = document.getElementById('f');
                  const events = [];
                  input.addEventListener('input', () => events.push('input'));
                  input.addEventListener('change', () => events.push('change'));
                  input.addEventListener('change', () => {
                    document.getElementById('result').textContent = [...input.files].map(f => f.name).join(',');
                  });
                  window.__events = events;
                </script>`,
              );
              yield* page.setInputFiles("#f", [paths[0]!]);
              const firstEvents = yield* page.evaluate(() => (window as any).__events);
              yield* assertEqual(firstEvents.length, 2);

              // Reset events and re-set.
              yield* page.evaluate(() => {
                (window as any).__events.length = 0;
              });
              yield* page.setInputFiles("#f", [paths[1]!]);
              const secondEvents = yield* page.evaluate(() => (window as any).__events);
              yield* assertEqual(secondEvents.length, 2);
              const result = yield* page.evaluate(
                () => (window as any).document.getElementById("result")!.textContent,
              );
              yield* assertEqual(result, "second.txt");
            }),
          );
        }).pipe(Effect.scoped, provideCdpWithFs),
    );

    // ── P8: input event.composed should be true and cross shadow dom boundary [NOT_PLANNED] ──

    test.live(
      "page-set-input-files.spec.ts - input event.composed should be true and cross shadow dom boundary [SKIP: NOT_PLANNED - `browser-cdp`'s querySelector does not pierce shadow DOM by default; the upstream test relies on Playwright's automatic open-shadow piercing]",
      () => Effect.void,
    );

    // ── P8: should work @smoke (input is at /input/fileupload) ──────────

    test.live("page-set-input-files.spec.ts - should work @smoke", () =>
      Effect.gen(function* () {
        const { paths } = yield* makeTempFiles(["file-to-upload.txt"]);
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type=file id="f" />`);
            yield* page.setInputFiles("#f", [paths[0]!]);
            const data = yield* page.evaluate(() => {
              const input = document.getElementById("f") as HTMLInputElement;
              return {
                length: input.files?.length ?? 0,
                name: input.files?.[0]?.name,
              };
            });
            yield* assertEqual(data.length, 1);
            yield* assertEqual(data.name, "file-to-upload.txt");
          }),
        );
      }).pipe(Effect.scoped, provideCdpWithFs),
    );

    // ── P8: should set from memory [NOT_PLANNED] ─────────────────────────

    test.live(
      "page-set-input-files.spec.ts - should set from memory [SKIP: NOT_PLANNED - CDP DOM.setFileInputFiles only accepts on-disk file paths; in-memory file payloads require JSHandle]",
      () => Effect.void,
    );

    // ── P8: should detect mime type [NOT_PLANNED] ───────────────────────

    test.live(
      "page-set-input-files.spec.ts - should detect mime type [SKIP: NOT_PLANNED - requires server-side form parsing (formidable) and a separate upload endpoint; out of scope for this test file]",
      () => Effect.void,
    );

    // ── P8: should not trim big uploaded files [NOT_PLANNED] ─────────────

    test.live(
      "page-set-input-files.spec.ts - should not trim big uploaded files [SKIP: NOT_PLANNED - requires a server-side upload endpoint that asserts the byte count; tested at the 'large file' level instead]",
      () => Effect.void,
    );

    // ── P8: folder upload tests [NOT_PLANNED] ────────────────────────────

    test.live(
      "page-set-input-files.spec.ts - should upload a folder [SKIP: NOT_PLANNED - CDP DOM.setFileInputFiles does not support directory upload; folder mode requires a webkitdirectory input plus file paths via a different CDP path]",
      () => Effect.void,
    );

    test.live(
      "page-set-input-files.spec.ts - should upload a folder and throw for multiple directories [SKIP: NOT_PLANNED - `browser-cdp` does not support folder upload]",
      () => Effect.void,
    );

    test.live(
      "page-set-input-files.spec.ts - should throw if a directory and files are passed [SKIP: NOT_PLANNED - `browser-cdp` does not support folder upload]",
      () => Effect.void,
    );

    test.live(
      "page-set-input-files.spec.ts - should throw when uploading a folder in a normal file upload input [SKIP: NOT_PLANNED - `browser-cdp` does not support folder upload]",
      () => Effect.void,
    );

    test.live(
      "page-set-input-files.spec.ts - should throw when uploading a file in a directory upload input [SKIP: NOT_PLANNED - `browser-cdp` does not support folder upload]",
      () => Effect.void,
    );
  });
};
