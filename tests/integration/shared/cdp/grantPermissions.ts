/**
 * Parity tests for `browser-cdp` `context.grantPermissions()` and
 * `context.clearPermissions()`.
 *
 * Mirrors Playwright's `BrowserContext.grantPermissions(permissions, options?)`
 * and `BrowserContext.clearPermissions()` semantics. The grant is at the
 * context level (via CDP `Browser.grantPermissions`) and applies to every
 * page in the context.
 *
 * Verifies:
 * - Granting a permission makes `navigator.permissions.query({ name })` report
 *   `"granted"`.
 * - `clearPermissions()` resets all grants back to `"prompt"`.
 * - The grant is scoped per-context (default vs isolated).
 * - Granting an unknown permission name fails with a `CdpError`.
 * - Web Platform names (kebab-case) are mapped to CDP `PermissionType`
 *   strings (camelCase) before sending.
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

export const defineGrantPermissionsTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("context.grantPermissions()", () => {
    test.live(
      "should grant geolocation and surface as 'granted' in permissions.query [CDP-EXTENSION: page-level context grantPermissions]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* context.grantPermissions(["geolocation"]);
              yield* page.goto(`${httpUrl}/empty`);
              const state = yield* page.evaluate(async () => {
                const result = await navigator.permissions.query({ name: "geolocation" });
                return result.state;
              });
              yield* assertEqual(state, "granted");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should grant multiple permissions in one call [CDP-EXTENSION: page-level context grantPermissions]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* context.grantPermissions(["geolocation", "notifications"]);
              yield* page.goto(`${httpUrl}/empty`);
              const geoState = yield* page.evaluate(async () => {
                const r = await navigator.permissions.query({ name: "geolocation" });
                return r.state;
              });
              const notifState = yield* page.evaluate(async () => {
                const r = await navigator.permissions.query({ name: "notifications" });
                return r.state;
              });
              yield* assertEqual(geoState, "granted");
              yield* assertEqual(notifState, "granted");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should grant clipboard-read and surface as 'granted' [CDP-EXTENSION: page-level context grantPermissions]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* context.grantPermissions(["clipboard-read"]);
              yield* page.goto(`${httpUrl}/empty`);
              const state = yield* page.evaluate(async () => {
                // Chrome-specific permission name; cast through unknown since
                // the DOM `PermissionName` union doesn't include kebab-case
                // clipboard names.
                const r = await navigator.permissions.query({
                  name: "clipboard-read",
                } as unknown as PermissionDescriptor);
                return r.state;
              });
              yield* assertEqual(state, "granted");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should map kebab-case to CDP PermissionType (clipboard-write) [CDP-EXTENSION: page-level context grantPermissions]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              // The public API uses the Web Platform name "clipboard-write"
              // (kebab-case). Internally this maps to the CDP type
              // `clipboardSanitizedWrite` (camelCase). The grant is reflected
              // in permissions.query as 'granted'.
              yield* context.grantPermissions(["clipboard-write"]);
              yield* page.goto(`${httpUrl}/empty`);
              const state = yield* page.evaluate(async () => {
                // Chrome-specific permission name; cast through unknown since
                // the DOM `PermissionName` union doesn't include kebab-case
                // clipboard names.
                const r = await navigator.permissions.query({
                  name: "clipboard-write",
                } as unknown as PermissionDescriptor);
                return r.state;
              });
              yield* assertEqual(state, "granted");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should fail with CdpError when given an unknown permission name [CDP-EXTENSION: page-level context grantPermissions]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (_page, context) =>
            Effect.gen(function* () {
              // Cast through unknown to bypass the type system and verify the
              // runtime validation in toCdpPermissionType.
              const err = yield* context
                .grantPermissions(["not-a-real-permission"] as unknown as Parameters<
                  typeof context.grantPermissions
                >[0])
                .pipe(Effect.flip);
              yield* assertTrue(err !== undefined);
              yield* assertTrue(err.message.includes("not-a-real-permission"));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "clearPermissions() should reset grants back to default state [CDP-EXTENSION: page-level context grantPermissions]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* context.grantPermissions(["geolocation"]);
              yield* page.goto(`${httpUrl}/empty`);
              const grantedState = yield* page.evaluate(async () => {
                const r = await navigator.permissions.query({ name: "geolocation" });
                return r.state;
              });
              yield* assertEqual(grantedState, "granted");

              // Capture the default state (before any grant).
              yield* context.clearPermissions();
              yield* page.goto(`${httpUrl}/empty`);
              const defaultState = yield* page.evaluate(async () => {
                const r = await navigator.permissions.query({ name: "geolocation" });
                return r.state;
              });
              // After clearPermissions the grant is removed. The state
              // returns to either "prompt" (browser default) or "denied"
              // (when the browser policy denies by default). Either is a
              // valid "no longer granted" outcome.
              yield* assertTrue(defaultState === "prompt" || defaultState === "denied");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should be scoped per-context (default vs isolated) [CDP-EXTENSION: page-level context grantPermissions]",
      () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;
          yield* cdp.withConnection({ url: wsUrl }, ({ connection, context, page }) =>
            Effect.gen(function* () {
              yield* context.grantPermissions(["geolocation"]);

              // Verify default context has the grant.
              yield* page.goto(`${httpUrl}/empty`);
              const defaultState = yield* page.evaluate(async () => {
                const r = await navigator.permissions.query({ name: "geolocation" });
                return r.state;
              });
              yield* assertEqual(defaultState, "granted");

              // Open an isolated context via connection.withContext. This
              // creates a real isolated browser context (different from the
              // default), so the grant in the default context does NOT leak.
              //
              // Note: navigating the OUTER page after this scope exits is
              // unreliable (pre-existing Cdp issue), so we verify isolation
              // only from the isolated side here.
              yield* connection.withContext(({ context: isoContext, page: isoPage }) =>
                Effect.gen(function* () {
                  // Without a grant in this isolated context, the permission
                  // defaults to either "prompt" (browser default) or
                  // "denied" (when the browser policy denies by default
                  // for that permission). Either is a valid "no grant"
                  // outcome.
                  yield* isoPage.goto(`${httpUrl}/empty`);
                  const isoState = yield* isoPage.evaluate(async () => {
                    const r = await navigator.permissions.query({ name: "geolocation" });
                    return r.state;
                  });
                  yield* assertTrue(isoState === "prompt" || isoState === "denied");

                  // Grant geolocation in the isolated context. The grant is
                  // scoped to the isolated browser context only.
                  yield* isoContext.grantPermissions(["geolocation"]);
                  yield* isoPage.goto(`${httpUrl}/empty`);
                  const isoGrantedState = yield* isoPage.evaluate(async () => {
                    const r = await navigator.permissions.query({ name: "geolocation" });
                    return r.state;
                  });
                  yield* assertEqual(isoGrantedState, "granted");
                }),
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
