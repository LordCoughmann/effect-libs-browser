/**
 * Parity tests for `browser-cdp` page-level cookies API: `page.cookies()`,
 * `page.addCookies()`, `page.clearCookies()`.
 *
 * Cookies are scoped to the *context* in Playwright, but the natural API
 * for scrapers ("what cookies does this page see?") and agents ("what's
 * the auth state right now?") is per-page. These tests verify the page-level
 * API delegates correctly to the same browser-cdp calls as the context-level API.
 *
 * Behavior reference:
 *   - context.cookies/addCookies/clearCookies (existing impl)
 *   - Playwright page.cookies/addCookies/clearCookies (round-trip semantics)
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertExists, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const definePageCookiesTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page-level cookies API", () => {
    test.live(
      "page.cookies() - should return an array [CDP-EXTENSION: page-level cookies (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/`);
              const cookies = yield* page.cookies();
              yield* assertTrue(Array.isArray(cookies));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page.addCookies() / page.cookies() - round-trip a single cookie [CDP-EXTENSION: page-level cookies (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/`);
              yield* page.addCookies([
                { name: "page-cookie", value: "page-value", url: `${httpUrl}/` },
              ]);
              const cookies = yield* page.cookies();
              const found = cookies.find((c) => c.name === "page-cookie");
              const cookie = yield* assertExists(found);
              yield* assertEqual(cookie.value, "page-value");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page.clearCookies() - should remove all cookies when called without options [CDP-EXTENSION: page-level cookies (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/`);
              yield* page.addCookies([{ name: "to-clear", value: "x", url: `${httpUrl}/` }]);
              // Sanity: cookie is present
              const before = yield* page.cookies();
              yield* assertTrue(before.some((c) => c.name === "to-clear"));
              // Clear all
              yield* page.clearCookies();
              const after = yield* page.cookies();
              yield* assertTrue(!after.some((c) => c.name === "to-clear"));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page.clearCookies({ name }) - should only remove the matching cookie [CDP-EXTENSION: page-level cookies (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/`);
              yield* page.addCookies([
                { name: "keep-me", value: "1", url: `${httpUrl}/` },
                { name: "delete-me", value: "2", url: `${httpUrl}/` },
              ]);
              // `browser-cdp`'s Network.deleteCookies requires url/domain in addition to name
              yield* page.clearCookies({
                name: "delete-me",
                domain: new URL(`${httpUrl}/`).hostname,
              });
              const cookies = yield* page.cookies();
              yield* assertTrue(cookies.some((c) => c.name === "keep-me"));
              yield* assertTrue(!cookies.some((c) => c.name === "delete-me"));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page.cookies(urls) - should filter to the given URLs [CDP-EXTENSION: page-level cookies (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/`);
              yield* page.addCookies([{ name: "filtered", value: "yes", url: `${httpUrl}/` }]);
              const cookies = yield* page.cookies(`${httpUrl}/`);
              yield* assertTrue(cookies.some((c) => c.name === "filtered"));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-level and context-level cookies should agree within the same context [CDP-EXTENSION: page-level cookies (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;
          yield* cdp.withConnection({ url: wsUrl }, ({ page, context }) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/`);
              yield* page.addCookies([{ name: "shared", value: "v", url: `${httpUrl}/` }]);
              const pageCookies = yield* page.cookies();
              const contextCookies = yield* context.cookies();
              const fromPage = pageCookies.find((c) => c.name === "shared");
              const fromContext = contextCookies.find((c) => c.name === "shared");
              yield* assertEqual(
                (yield* assertExists(fromPage)).value,
                (yield* assertExists(fromContext)).value,
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
