/**
 * Parity tests for `browser-cdp` page storage APIs.
 *
 * Covers:
 * - `page.localStorage()` / `page.sessionStorage()` — read snapshot
 * - `page.setLocalStorageItem()` / `page.setSessionStorageItem()` — write
 * - `page.clearLocalStorage()` / `page.clearSessionStorage()` — clear all
 *
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 *
 * Behavior verified:
 * - empty storage returns an empty Map
 * - set then get round-trips
 * - clear empties the storage
 * - localStorage and sessionStorage are independent
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineStorageTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page storage", () => {
    // Helper: set up the page on a real origin so localStorage is accessible.
    // (about:blank pages throw SecurityError on storage access.)
    const setupPage = (page: CdpPageService) =>
      Effect.gen(function* () {
        yield* page.goto(`${httpUrl}/empty`);
      });

    test.live(
      "localStorage - should return empty map for fresh page [CDP-EXTENSION: page-level localStorage/sessionStorage helpers]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* setupPage(page);
              yield* page.clearLocalStorage();
              const store = yield* page.localStorage();
              yield* assertEqual(store.size, 0);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "localStorage - should round-trip setItem + get [CDP-EXTENSION: page-level localStorage/sessionStorage helpers]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* setupPage(page);
              yield* page.clearLocalStorage();
              yield* page.setLocalStorageItem("user", "alice");
              yield* page.setLocalStorageItem("role", "admin");
              const store = yield* page.localStorage();
              yield* assertEqual(store.get("user"), "alice");
              yield* assertEqual(store.get("role"), "admin");
              yield* assertEqual(store.size, 2);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "localStorage - clear should empty the storage [CDP-EXTENSION: page-level localStorage/sessionStorage helpers]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* setupPage(page);
              // Clear first to ensure isolated state from previous tests
              yield* page.clearLocalStorage();
              yield* page.setLocalStorageItem("foo", "bar");
              const before = yield* page.localStorage();
              yield* assertEqual(before.size, 1);
              yield* page.clearLocalStorage();
              const after = yield* page.localStorage();
              yield* assertEqual(after.size, 0);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "sessionStorage - should round-trip independently from localStorage [CDP-EXTENSION: page-level localStorage/sessionStorage helpers]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* setupPage(page);
              yield* page.clearLocalStorage();
              yield* page.clearSessionStorage();

              yield* page.setLocalStorageItem("shared", "local-value");
              yield* page.setSessionStorageItem("shared", "session-value");

              const local = yield* page.localStorage();
              const session = yield* page.sessionStorage();
              yield* assertEqual(local.get("shared"), "local-value");
              yield* assertEqual(session.get("shared"), "session-value");
              yield* assertEqual(local.size, 1);
              yield* assertEqual(session.size, 1);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "clearSessionStorage - should not affect localStorage [CDP-EXTENSION: page-level localStorage/sessionStorage helpers]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* setupPage(page);
              // Clear first to ensure isolated state
              yield* page.clearLocalStorage();
              yield* page.clearSessionStorage();
              yield* page.setLocalStorageItem("persistent", "data");
              yield* page.setSessionStorageItem("transient", "data");
              yield* page.clearSessionStorage();
              const local = yield* page.localStorage();
              const session = yield* page.sessionStorage();
              yield* assertEqual(local.size, 1);
              yield* assertEqual(local.get("persistent"), "data");
              yield* assertEqual(session.size, 0);
              yield* assertTrue(!session.has("transient"));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
