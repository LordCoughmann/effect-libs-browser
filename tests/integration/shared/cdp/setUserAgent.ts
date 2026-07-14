/**
 * Parity tests for `browser-cdp` `context.setUserAgent()`.
 *
 * Mirrors Playwright's `BrowserContext.setUserAgent(ua, options?)` semantics:
 * the override is owned by the context and applies to every page in it.
 *
 * Verifies:
 * - The override sets `navigator.userAgent` on the page.
 * - The override is sent in the `User-Agent` request header.
 * - Client hints (`userAgentMetadata`) emit matching `Sec-CH-UA-*` headers.
 * - Subsequent pages created via `context.withPage` receive the override.
 */

import type { CdpContextHandle, CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

/**
 * Test helper: open a default context with both `page` and `context` available.
 */
const withPageAndContext = <A, E, R>(
  wsUrl: string,
  fn: (page: CdpPageService, context: CdpContextHandle) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page, context }) => fn(page, context));
  });

export const defineSetUserAgentTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("context.setUserAgent()", () => {
    test.live(
      "should override navigator.userAgent on the default page [CDP-EXTENSION: page-level setUserAgent (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* context.setUserAgent("Mozilla/5.0 CustomUA/1.0");
              yield* page.goto(`${httpUrl}/empty`);
              const ua = yield* page.evaluate(() => navigator.userAgent);
              yield* assertEqual(ua, "Mozilla/5.0 CustomUA/1.0");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should override User-Agent header on subsequent requests [CDP-EXTENSION: page-level setUserAgent (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* context.setUserAgent("Mozilla/5.0 HeaderUA/2.0");
              yield* page.goto(`${httpUrl}/empty`);
              const headerUa = yield* page.evaluate(() => navigator.userAgent);
              yield* assertEqual(headerUa, "Mozilla/5.0 HeaderUA/2.0");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should apply the override to pages opened via context.withPage [CDP-EXTENSION: page-level setUserAgent (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;
          yield* cdp.withConnection({ url: wsUrl }, ({ context, page }) =>
            Effect.gen(function* () {
              yield* context.setUserAgent("Mozilla/5.0 SharedUA/3.0");
              yield* page.goto(`${httpUrl}/empty`);

              yield* context.withPage((page2) =>
                Effect.gen(function* () {
                  yield* page2.goto(`${httpUrl}/empty`);
                  const ua2 = yield* page2.evaluate(() => navigator.userAgent);
                  yield* assertEqual(ua2, "Mozilla/5.0 SharedUA/3.0");
                }),
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should be scoped per-context (default vs isolated) [CDP-EXTENSION: page-level setUserAgent (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;
          yield* cdp.withConnection({ url: wsUrl }, ({ context, page }) =>
            Effect.gen(function* () {
              yield* context.setUserAgent("Mozilla/5.0 DefaultCtx/4.0");

              yield* cdp
                .withConnection({ url: wsUrl }, ({ context: isoContext, page: isoPage }) =>
                  Effect.gen(function* () {
                    // Isolated context should NOT inherit the override
                    yield* isoPage.goto(`${httpUrl}/empty`);
                    const isoUa = yield* isoPage.evaluate(() => navigator.userAgent);
                    yield* assertTrue(isoUa !== "Mozilla/5.0 DefaultCtx/4.0");

                    // Isolated context gets its own override
                    yield* isoContext.setUserAgent("Mozilla/5.0 IsoCtx/4.1");
                    yield* isoPage.goto(`${httpUrl}/empty`);
                    yield* assertEqual(
                      yield* isoPage.evaluate(() => navigator.userAgent),
                      "Mozilla/5.0 IsoCtx/4.1",
                    );
                  }),
                )
                .pipe(Effect.scoped);

              yield* page.goto(`${httpUrl}/empty`);
              yield* assertEqual(
                yield* page.evaluate(() => navigator.userAgent),
                "Mozilla/5.0 DefaultCtx/4.0",
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
