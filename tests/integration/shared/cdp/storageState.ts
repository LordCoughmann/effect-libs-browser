/**
 * Parity tests for `browser-cdp` `context.storageState()` and `context.addStorageState()`.
 *
 * Mirrors Playwright's `BrowserContext.storageState()` semantics:
 * - Save: capture cookies + per-origin localStorage as a JSON-serializable struct.
 * - Load: restore cookies + localStorage on a fresh context.
 *
 * Verifies:
 * - Round-trip preserves cookies (name/value).
 * - Round-trip preserves localStorage entries.
 * - State is per-context (not shared across contexts).
 * - Output is JSON-serializable (mirrors Playwright's storageState).
 *
 * sessionStorage is intentionally NOT covered — it is per-tab and not
 * persistable across browser restarts (Playwright excludes it too).
 */

import type { CdpContextHandle, CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertExists, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withContext = <A, E, R>(
  wsUrl: string,
  fn: (page: CdpPageService, context: CdpContextHandle) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page, context }) => fn(page, context));
  });

export const defineStorageStateTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("context.storageState() / addStorageState()", () => {
    test.live(
      "storageState() - should return cookies and origins arrays [CDP-EXTENSION: page-level storageState (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const state = yield* context.storageState();
              yield* assertTrue(Array.isArray(state.cookies));
              yield* assertTrue(Array.isArray(state.origins));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "storageState() - should be JSON-serializable [CDP-EXTENSION: page-level storageState (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setLocalStorageItem("foo", "bar");
              const state = yield* context.storageState();
              const json = JSON.stringify(state);
              const parsed = JSON.parse(json);
              yield* assertEqual(parsed.cookies.length, state.cookies.length);
              yield* assertEqual(parsed.origins.length, state.origins.length);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "storageState() - should capture localStorage entries for the current origin [CDP-EXTENSION: page-level storageState (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setLocalStorageItem("alpha", "1");
              yield* page.setLocalStorageItem("beta", "2");
              const state = yield* context.storageState();

              const originEntry = state.origins.find(
                (o) => o.origin === new URL(`${httpUrl}/empty`).origin,
              );
              const origin = yield* assertExists(originEntry);
              const alpha = origin.localStorage.find((e) => e.name === "alpha");
              const beta = origin.localStorage.find((e) => e.name === "beta");
              yield* assertEqual((yield* assertExists(alpha)).value, "1");
              yield* assertEqual((yield* assertExists(beta)).value, "2");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "storageState() / addStorageState() - round-trip cookies on a new context [CDP-EXTENSION: page-level storageState (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;
          // Save state from the first context
          const originalState = yield* cdp.withConnection({ url: wsUrl }, ({ page, context }) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* context.addCookies([
                { name: "round-trip", value: "rt-value", url: `${httpUrl}/` },
              ]);
              return yield* context.storageState();
            }),
          );

          // Apply state on a fresh context (cookies test)
          yield* cdp.withConnection({ url: wsUrl }, ({ page, context }) =>
            Effect.gen(function* () {
              // Navigate first so setCookies via the default page's session works
              yield* page.goto(`${httpUrl}/empty`);
              yield* context.addStorageState(originalState);
              const cookiesAfter = yield* context.cookies();
              const found = cookiesAfter.find((c) => c.name === "round-trip");
              const cookie = yield* assertExists(found);
              yield* assertEqual(cookie.value, "rt-value");
            }),
          );

          // Verify cookies were restored in a third context
          yield* cdp.withConnection({ url: wsUrl }, ({ page, context }) =>
            Effect.gen(function* () {
              // Navigate to the cookie domain before checking
              yield* page.goto(`${httpUrl}/empty`);
              const cookies = yield* context.cookies();
              const found = cookies.find((c) => c.name === "round-trip");
              const cookie = yield* assertExists(found);
              yield* assertEqual(cookie.value, "rt-value");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "storageState() / addStorageState() - round-trip localStorage on a new context [CDP-EXTENSION: page-level storageState (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;
          const httpOrigin = new URL(`${httpUrl}/empty`).origin;

          // Save state from the first context
          const originalState = yield* cdp.withConnection({ url: wsUrl }, ({ page, context }) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setLocalStorageItem("persist-me", "yes");
              return yield* context.storageState();
            }),
          );

          // Apply state on a fresh context
          yield* cdp.withConnection({ url: wsUrl }, ({ context }) =>
            Effect.gen(function* () {
              yield* context.addStorageState(originalState);
            }),
          );

          // Verify localStorage was restored
          yield* cdp.withConnection({ url: wsUrl }, ({ page }) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const value = yield* page.evaluate(() => localStorage.getItem("persist-me"));
              yield* assertEqual(value, "yes");
            }),
          );

          // Confirm state.origins was populated
          yield* assertTrue(originalState.origins.some((o) => o.origin === httpOrigin));
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "storageState() - state is per-context (not shared across isolated contexts) [CDP-EXTENSION: page-level storageState (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;
          // Use isolated contexts (via withContext) so localStorage is genuinely separate
          yield* cdp.withConnection({ url: wsUrl }, ({ connection }) =>
            Effect.gen(function* () {
              yield* connection.withContext(({ context: ctxA, page: pageA }) =>
                Effect.gen(function* () {
                  yield* pageA.goto(`${httpUrl}/empty`);
                  yield* pageA.setLocalStorageItem("only-in-a", "A");

                  const stateA = yield* ctxA.storageState();

                  yield* connection.withContext(({ context: ctxB, page: pageB }) =>
                    Effect.gen(function* () {
                      yield* pageB.goto(`${httpUrl}/empty`);
                      yield* pageB.setLocalStorageItem("only-in-b", "B");

                      const stateB = yield* ctxB.storageState();

                      const aEntries = stateA.origins.flatMap((o) => o.localStorage);
                      const bEntries = stateB.origins.flatMap((o) => o.localStorage);

                      // Isolated contexts have completely separate localStorage
                      yield* assertTrue(aEntries.some((e) => e.name === "only-in-a"));
                      yield* assertTrue(!aEntries.some((e) => e.name === "only-in-b"));
                      yield* assertTrue(bEntries.some((e) => e.name === "only-in-b"));
                      yield* assertTrue(!bEntries.some((e) => e.name === "only-in-a"));
                    }),
                  );
                }),
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
