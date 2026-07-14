/**
 * Parity tests for `browser-cdp` `context.setGeolocation()`.
 *
 * Mirrors Playwright's `BrowserContext.setGeolocation()` semantics: the
 * override is owned by the context and applies to every page in it.
 *
 * Verifies:
 * - The override sets `navigator.geolocation` to the configured coordinates
 *   on the default page.
 * - Subsequent pages created via `context.withPage` receive the override.
 * - Passing `undefined` clears the override.
 * - The override is scoped per-context (default vs isolated).
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

export const defineSetGeolocationTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("context.setGeolocation()", () => {
    test.live(
      "should override navigator.geolocation on the default page [CDP-EXTENSION: page-level setGeolocation (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* context.grantPermissions(["geolocation"]);
              yield* context.setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
              yield* page.goto(`${httpUrl}/geolocation`);
              yield* page.evaluate(() => (window as any).__geoReady);
              const geo = yield* page.evaluate(() => (window as any).__geo);
              yield* assertEqual(geo.status, "ok");
              yield* assertEqual(geo.latitude, 37.7749);
              yield* assertEqual(geo.longitude, -122.4194);
              // When accuracy is omitted, the implementation defaults to 0.
              yield* assertEqual(geo.accuracy, 0);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should pass the configured accuracy to getCurrentPosition [CDP-EXTENSION: page-level setGeolocation (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* context.grantPermissions(["geolocation"]);
              yield* context.setGeolocation({
                latitude: 51.5074,
                longitude: -0.1278,
                accuracy: 50,
              });
              yield* page.goto(`${httpUrl}/geolocation`);
              yield* page.evaluate(() => (window as any).__geoReady);
              const geo = yield* page.evaluate(() => (window as any).__geo);
              yield* assertEqual(geo.status, "ok");
              yield* assertEqual(geo.latitude, 51.5074);
              yield* assertEqual(geo.longitude, -0.1278);
              yield* assertEqual(geo.accuracy, 50);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should apply the override to pages opened via context.withPage [CDP-EXTENSION: page-level setGeolocation (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;
          yield* cdp.withConnection({ url: wsUrl }, ({ context, page }) =>
            Effect.gen(function* () {
              yield* context.grantPermissions(["geolocation"]);
              yield* context.setGeolocation({ latitude: 40.7128, longitude: -74.006 });
              yield* page.goto(`${httpUrl}/geolocation`);
              yield* page.evaluate(() => (window as any).__geoReady);
              const defaultGeo = yield* page.evaluate(() => (window as any).__geo);
              yield* assertEqual(defaultGeo.status, "ok");
              yield* assertEqual(defaultGeo.latitude, 40.7128);

              yield* context.withPage((page2) =>
                Effect.gen(function* () {
                  yield* page2.goto(`${httpUrl}/geolocation`);
                  yield* page2.evaluate(() => (window as any).__geoReady);
                  const geo2 = yield* page2.evaluate(() => (window as any).__geo);
                  yield* assertEqual(geo2.status, "ok");
                  yield* assertEqual(geo2.latitude, 40.7128);
                  yield* assertEqual(geo2.longitude, -74.006);
                }),
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should clear the override when called with undefined [CDP-EXTENSION: page-level setGeolocation (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* context.grantPermissions(["geolocation"]);
              yield* context.setGeolocation({ latitude: 1, longitude: 2 });
              yield* context.setGeolocation(undefined);
              yield* page.goto(`${httpUrl}/geolocation`);
              yield* page.evaluate(() => (window as any).__geoReady);
              const geo = yield* page.evaluate(() => (window as any).__geo);
              yield* assertEqual(geo.status, "error");
              // Position-unavailable errors have code 2 (PERMISSION_DENIED is 1).
              yield* assertEqual(geo.code, 2);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should be scoped per-context (default vs isolated) [CDP-EXTENSION: page-level setGeolocation (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;
          yield* cdp.withConnection({ url: wsUrl }, ({ context, page }) =>
            Effect.gen(function* () {
              yield* context.grantPermissions(["geolocation"]);
              yield* context.setGeolocation({ latitude: 35.6762, longitude: 139.6503 });
              // Verify the default-context override works.
              yield* page.goto(`${httpUrl}/geolocation`);
              yield* page.evaluate(() => (window as any).__geoReady);
              const defaultGeo = yield* page.evaluate(() => (window as any).__geo);
              yield* assertEqual(defaultGeo.status, "ok");
              yield* assertEqual(defaultGeo.latitude, 35.6762);

              // Open an isolated context via a separate connection (matches the
              // established setUserAgent pattern). The isolated context has
              // its own state — the default override does not leak into it.
              yield* cdp
                .withConnection({ url: wsUrl }, ({ context: isoContext, page: isoPage }) =>
                  Effect.gen(function* () {
                    // Without an override, getCurrentPosition fails with
                    // PERMISSION_DENIED (code 1) since the isolated context
                    // hasn't been granted the geolocation permission.
                    yield* isoPage.goto(`${httpUrl}/geolocation`);
                    yield* isoPage.evaluate(() => (window as any).__geoReady);
                    const isoGeo = yield* isoPage.evaluate(() => (window as any).__geo);
                    yield* assertEqual(isoGeo.status, "error");

                    // Isolated context gets its own override.
                    yield* isoContext.grantPermissions(["geolocation"]);
                    yield* isoContext.setGeolocation({ latitude: -33.8688, longitude: 151.2093 });
                    yield* isoPage.goto(`${httpUrl}/geolocation`);
                    yield* isoPage.evaluate(() => (window as any).__geoReady);
                    const isoGeo2 = yield* isoPage.evaluate(() => (window as any).__geo);
                    yield* assertEqual(isoGeo2.status, "ok");
                    yield* assertEqual(isoGeo2.latitude, -33.8688);
                    yield* assertEqual(isoGeo2.longitude, 151.2093);
                  }),
                )
                .pipe(Effect.scoped);

              // The default context's override is unchanged (each connection
              // has its own state).
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should fail for an unknown permission name [CDP-EXTENSION: page-level setGeolocation (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (_page, context) =>
            Effect.gen(function* () {
              // Cast through unknown to bypass the type system and verify the
              // runtime validation in toCdpPermissionType.
              const result = yield* context
                .grantPermissions(["not-a-real-permission"] as unknown as Parameters<
                  typeof context.grantPermissions
                >[0])
                .pipe(Effect.flip);
              yield* assertTrue(result !== undefined);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
