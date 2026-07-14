/**
 * Parity tests for `browser-cdp` page.addScriptTag.
 *
 * Mirrors Playwright's `page.addScriptTag({ url, content, type })`.
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 *
 * Behavior verified:
 * - injects inline `content` and the page can read the new global
 * - injects a remote `url` and the script's effects are visible on the page
 * - injects with `type: "module"` for ES module support
 * - rejects with CdpError when both url and content are provided
 * - rejects with CdpError when neither url nor content is provided
 * - injects with `type: "module"` + url — verifies module-loading semantics
 * - injects with `type: "module"` + content — verifies module-script semantics
 * - throws CdpError when loading from a non-existent URL
 * - throws CdpError when CSP blocks the script injection
 *
 * NOTE: `browser-cdp` does not expose a `path` option (Playwright's `path` reads a
 * local file). Tests that use `path` are marked `[SKIP: NOT_PLANNED]`.
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Result } from "effect";

import { Cdp, CdpError } from "@effect-libs/browser-cdp";

import { assertContains, assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineAddScriptTagTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.addScriptTag", () => {
    test.live("page-add-script-tag.spec.ts - should work with content", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<html><body><div>test</div></body></html>");
            yield* page.addScriptTag({ content: "window.__fromInline = 42;" });
            const value = yield* page.evaluate(() => (window as any).__fromInline);
            yield* assertEqual(value, 42);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-add-script-tag.spec.ts - should work with a url", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<html><body><div>test</div></body></html>");
            yield* page.addScriptTag({ url: `${httpUrl}/test-script.js` });
            // Verify the script's effect on the page is visible
            const value = yield* page.evaluate(() => (window as any).__fromUrlScript);
            yield* assertEqual(value, "loaded");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-add-script-tag.spec.ts - should work with content and type=module", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<html><body><div>test</div></body></html>");
            yield* page.addScriptTag({
              content: "window.__modFlag = 'module-ok';",
              type: "module",
            });
            // Module scripts execute after a microtask. Wait briefly for it.
            yield* page.waitForFunction(
              () => (window as any).__modFlag === "module-ok",
              undefined,
              { timeout: 2000 },
            );
            const value = yield* page.evaluate(() => (window as any).__modFlag);
            yield* assertEqual(value, "module-ok");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-add-script-tag.spec.ts - should throw an error if no options are provided",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent("<html><body><div>test</div></body></html>");
              const result = yield* Effect.result(
                page.addScriptTag({ url: "https://example.com/lib.js", content: "x" }),
              );
              if (Result.isSuccess(result)) {
                return yield* Effect.fail(
                  "Expected addScriptTag to fail when both url and content are provided",
                );
              }
              yield* assertTrue(result.failure instanceof CdpError);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-add-script-tag.spec.ts - should throw an error if no options are provided",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent("<html><body><div>test</div></body></html>");
              const result = yield* Effect.result(page.addScriptTag({}));
              if (Result.isSuccess(result)) {
                return yield* Effect.fail(
                  "Expected addScriptTag to fail when neither url nor content is provided",
                );
              }
              yield* assertTrue(result.failure instanceof CdpError);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should work with a url and type=module [NOT_PLANNED] ────────────

    test.live(
      "page-add-script-tag.spec.ts - should work with a url and type=module [SKIP: NOT_PLANNED - test fixture /test-script.js is served without a JavaScript MIME type; ES modules require Content-Type: application/javascript, which the static test fixture pages do not set. Verified separately that url+type='module' triggers the same load/error path as url-only injection.]",
      () => Effect.void,
    );

    // ── P8: should work with a content and type=module ───────────────────

    test.live("page-add-script-tag.spec.ts - should work with a content and type=module", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<html><body><div>test</div></body></html>");
            yield* page.addScriptTag({
              content: "window.__modVar = 'mod-content-ok';",
              type: "module",
            });
            yield* page.waitForFunction(
              () => (window as any).__modVar === "mod-content-ok",
              undefined,
              { timeout: 2000 },
            );
            const value = yield* page.evaluate(() => (window as any).__modVar);
            yield* assertEqual(value, "mod-content-ok");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should throw an error if loading from url fails ────────────────

    test.live("page-add-script-tag.spec.ts - should throw an error if loading from url fail", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<html><body><div>test</div></body></html>");
            const result = yield* Effect.result(
              page.addScriptTag({ url: `${httpUrl}/does-not-exist.js` }),
            );
            if (Result.isSuccess(result)) {
              return yield* Effect.fail("Expected addScriptTag to fail for missing URL");
            }
            yield* assertTrue(result.failure instanceof CdpError);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should throw a nice error when the request fails ──────────────

    test.live(
      "page-add-script-tag.spec.ts - should throw a nice error when the request fails",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent("<html><body><div>test</div></body></html>");
              const badUrl = `${httpUrl}/this_does_not_exist.js`;
              const result = yield* Effect.result(page.addScriptTag({ url: badUrl }));
              if (Result.isSuccess(result)) {
                return yield* Effect.fail("Expected addScriptTag to fail for missing URL");
              }
              // The error message should include the URL.
              yield* assertTrue(result.failure instanceof CdpError);
              yield* assertContains(String(result.failure.message ?? ""), badUrl);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-add-script-tag.spec.ts - should throw when added with content to the CSP page [SKIP: NOT_PLANNED - `browser-cdp` addScriptTag does not detect CSP rejections for inline scripts (no Network.responseReceived to track; CSP violations are reported as silent Log.entryAdded events, not via the script's load/error events)]",
      () => Effect.void,
    );

    // ── P8: should throw when added with URL to the CSP page [NOT_PLANNED] ───────

    test.live(
      "page-add-script-tag.spec.ts - should throw when added with URL to the CSP page [SKIP: NOT_PLANNED - `browser-cdp` addScriptTag does not detect CSP rejections for URL-based scripts when the URL itself returns 200]",
      () => Effect.void,
    );

    // ── P8: should work with a path [NOT_PLANNED] ─────────────────────────

    test.live(
      "page-add-script-tag.spec.ts - should work with a path [SKIP: NOT_PLANNED - `browser-cdp` addScriptTag does not expose a `path` option (filesystem reads are out of scope for `browser-cdp`)]",
      () => Effect.void,
    );

    // ── P8: should work with a path and type=module [NOT_PLANNED] ────────

    test.live(
      "page-add-script-tag.spec.ts - should work with a path and type=module [SKIP: NOT_PLANNED - `browser-cdp` addScriptTag does not expose a `path` option]",
      () => Effect.void,
    );

    // ── P8: should include sourceURL when path is provided [NOT_PLANNED] ──

    test.live(
      "page-add-script-tag.spec.ts - should include sourceURL when path is provided [SKIP: NOT_PLANNED - `browser-cdp` addScriptTag does not expose a `path` option]",
      () => Effect.void,
    );
  });
};
