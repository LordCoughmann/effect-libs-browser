/**
 * Parity tests for `browser-cdp` `context.setOffline()`.
 *
 * Mirrors Playwright's `BrowserContext.setOffline(offline)` semantics: the
 * override is owned by the context and applies to every page in it. While
 * offline, in-flight and new network requests on every page in the context
 * fail with `net::ERR_INTERNET_DISCONNECTED`.
 *
 * Verifies:
 * - Setting offline to `true` makes `fetch()` reject.
 * - Toggling back to `false` restores connectivity.
 * - The override applies to subsequent pages opened via `context.withPage`.
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

export const defineSetOfflineTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("context.setOffline()", () => {
    test.live(
      "should make fetch() fail when offline is true [CDP-EXTENSION: page-level setOffline (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              // First navigate so the page has a session attached.
              yield* page.goto(`${httpUrl}/empty`);

              // Verify connectivity works initially.
              const beforeResult = yield* page.evaluate(async () => {
                try {
                  const r = await fetch("/simple.json");
                  return { ok: r.ok, status: r.status };
                } catch (e) {
                  return { ok: false, error: String(e) };
                }
              });
              yield* assertEqual(beforeResult.ok, true);
              yield* assertEqual(beforeResult.status, 200);

              // Toggle offline.
              yield* context.setOffline(true);

              // Fetch should now fail.
              const afterResult = yield* page.evaluate(async () => {
                try {
                  const r = await fetch("/simple.json");
                  return { ok: r.ok, status: r.status };
                } catch (e) {
                  return { ok: false, error: String(e) };
                }
              });
              yield* assertEqual(afterResult.ok, false);
              // Chrome reports the failure with `TypeError` and a message
              // mentioning `Failed to fetch` (the underlying error code is
              // `net::ERR_INTERNET_DISCONNECTED`, but `fetch` exposes it as
              // a generic TypeError).
              yield* assertTrue(
                afterResult.error !== undefined && afterResult.error.includes("Failed to fetch"),
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should restore connectivity when offline is toggled back to false [CDP-EXTENSION: page-level setOffline (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          yield* withPageAndContext(wsUrl, (page, context) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);

              yield* context.setOffline(true);
              const offlineResult = yield* page.evaluate(async () => {
                try {
                  const r = await fetch("/simple.json");
                  return { ok: r.ok };
                } catch {
                  return { ok: false };
                }
              });
              yield* assertEqual(offlineResult.ok, false);

              // Toggle offline back to false.
              yield* context.setOffline(false);

              const onlineResult = yield* page.evaluate(async () => {
                try {
                  const r = await fetch("/simple.json");
                  return { ok: r.ok, status: r.status };
                } catch {
                  return { ok: false };
                }
              });
              yield* assertEqual(onlineResult.ok, true);
              yield* assertEqual(onlineResult.status, 200);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "should apply the override to pages opened via context.withPage [CDP-EXTENSION: page-level setOffline (upstream context-only)]",
      () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;
          yield* cdp.withConnection({ url: wsUrl }, ({ context, page }) =>
            Effect.gen(function* () {
              // Navigate the default page first (before going offline), so
              // we can verify connectivity was working.
              yield* page.goto(`${httpUrl}/empty`);
              const beforeResult = yield* page.evaluate(async () => {
                try {
                  const r = await fetch("/simple.json");
                  return { ok: r.ok };
                } catch {
                  return { ok: false };
                }
              });
              yield* assertEqual(beforeResult.ok, true);

              // Apply offline on the default context.
              yield* context.setOffline(true);

              // Open a new page in the same context. The override is
              // applied via applyContextOfflineIfSet, so this page is also
              // offline. We verify by attempting to navigate — it should
              // fail with net::ERR_INTERNET_DISCONNECTED.
              yield* context.withPage((page2) =>
                Effect.gen(function* () {
                  const gotoResult = yield* page2.goto(`${httpUrl}/empty`).pipe(Effect.flip);
                  // The error description should mention the offline error code.
                  yield* assertTrue(
                    gotoResult !== undefined &&
                      gotoResult.message.includes("ERR_INTERNET_DISCONNECTED"),
                  );
                }),
              );

              // Restore connectivity. A new page can now navigate.
              yield* context.setOffline(false);
              yield* context.withPage((page3) =>
                Effect.gen(function* () {
                  yield* page3.goto(`${httpUrl}/empty`);
                  const result = yield* page3.evaluate(async () => {
                    try {
                      const r = await fetch("/simple.json");
                      return { ok: r.ok, status: r.status };
                    } catch {
                      return { ok: false };
                    }
                  });
                  yield* assertEqual(result.ok, true);
                }),
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
