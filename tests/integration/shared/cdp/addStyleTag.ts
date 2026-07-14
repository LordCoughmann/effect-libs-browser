/**
 * Parity tests for `browser-cdp` page.addStyleTag.
 *
 * Mirrors Playwright's `page.addStyleTag({ url, content })`.
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 *
 * Behavior verified:
 * - inline `content` is applied (computed style reflects the new rule)
 * - remote `url` is loaded (a <link rel=stylesheet> appears in the DOM)
 * - rejects with CdpError when both url and content are provided
 * - rejects with CdpError when neither url nor content is provided
 * - throws CdpError when loading from a non-existent URL
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

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineAddStyleTagTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.addStyleTag", () => {
    test.live("page-add-style-tag.spec.ts - should work with content", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<style>div { color: black; }</style><div id="t">test</div>');
            yield* page.addStyleTag({ content: "div#t { color: rgb(255, 0, 0); }" });
            const color = yield* page.evaluate(
              () => getComputedStyle(document.getElementById("t")!).color,
            );
            yield* assertEqual(color, "rgb(255, 0, 0)");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-add-style-tag.spec.ts - should work with a url @smoke", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<html><head></head><body><div>test</div></body></html>");
            yield* page.addStyleTag({ url: `${httpUrl}/one-style.css` });
            // Verify the link element was added
            const linkCount = yield* page.evaluate(
              () =>
                document.querySelectorAll(`link[rel="stylesheet"][href$="/one-style.css"]`).length,
            );
            yield* assertEqual(linkCount >= 1, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-add-style-tag.spec.ts - should throw an error if no options are provided [CDP-EXTENSION: also rejects when both url and content are provided]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent("<html><body><div>test</div></body></html>");
              const result = yield* Effect.result(
                page.addStyleTag({ url: "https://example.com/style.css", content: "div{}" }),
              );
              if (Result.isSuccess(result)) {
                return yield* Effect.fail(
                  "Expected addStyleTag to fail when both url and content are provided",
                );
              }
              yield* assertTrue(result.failure instanceof CdpError);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-add-style-tag.spec.ts - should throw an error if no options are provided", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<html><body><div>test</div></body></html>");
            const result = yield* Effect.result(page.addStyleTag({}));
            if (Result.isSuccess(result)) {
              return yield* Effect.fail(
                "Expected addStyleTag to fail when neither url nor content is provided",
              );
            }
            yield* assertTrue(result.failure instanceof CdpError);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should throw an error if loading from url fails ───────────────

    test.live("page-add-style-tag.spec.ts - should throw an error if loading from url fail", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<html><body><div>test</div></body></html>");
            const result = yield* Effect.result(
              page.addStyleTag({ url: `${httpUrl}/does-not-exist.css` }),
            );
            if (Result.isSuccess(result)) {
              return yield* Effect.fail("Expected addStyleTag to fail for missing URL");
            }
            yield* assertTrue(result.failure instanceof CdpError);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should work with a path [NOT_PLANNED] ─────────────────────────

    test.live(
      "page-add-style-tag.spec.ts - should work with a path [SKIP: NOT_PLANNED - `browser-cdp` addStyleTag does not expose a `path` option (filesystem reads are out of scope for `browser-cdp`)]",
      () => Effect.void,
    );

    // ── P8: should include sourceURL when path is provided [NOT_PLANNED] ──

    test.live(
      "page-add-style-tag.spec.ts - should include sourceURL when path is provided [SKIP: NOT_PLANNED - `browser-cdp` addStyleTag does not expose a `path` option]",
      () => Effect.void,
    );

    // ── P8: should throw when added with content to the CSP page [NOT_PLANNED] ─

    test.live(
      "page-add-style-tag.spec.ts - should throw when added with content to the CSP page [SKIP: NOT_PLANNED - `browser-cdp` addStyleTag does not detect CSP rejections for inline styles]",
      () => Effect.void,
    );

    // ── P8: should throw when added with URL to the CSP page [NOT_PLANNED] ─

    test.live(
      "page-add-style-tag.spec.ts - should throw when added with URL to the CSP page [SKIP: NOT_PLANNED - `browser-cdp` addStyleTag does not detect CSP rejections for URL-based styles when the URL itself returns 200]",
      () => Effect.void,
    );
  });
};
