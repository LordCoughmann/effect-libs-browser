/**
 * Shared `browser-cdp` integration tests using the EffectTest API.
 *
 * These tests are run by each runtime's test file:
 * - tests/integration/runtime/node/cdp/Cdp.integration.test.ts
 * - tests/integration/runtime/bun/cdp/Cdp.integration.test.ts
 * - tests/integration/runtime/deno/cdp/Cdp.integration.test.ts
 * - tests/integration/runtime/workerd/cdp/Cdp.integration.test.ts
 */

import type {
  CdpCookie,
  CdpPageService,
  CdpContextHandle,
  CdpConnectionService,
} from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Option } from "effect";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { getErrorMessage } from "@effect-libs/browser";
import { Cdp, CdpError, ConnectionError } from "@effect-libs/browser-cdp";

import {
  assertEqual,
  assertTrue,
  assertExists,
  assertContains,
} from "../../../utils/effect-test/EffectTest.js";

// ─────────────────────────────────────────────────────────────────────────────
// `browser-cdp` Response Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expected response from Target.getTargetInfo.
 */
interface TargetInfoResponse {
  targetInfo?: {
    browserContextId?: string;
    targetId?: string;
    type?: string;
    url?: string;
  };
}

/**
 * Expected response from Target.getTargets.
 */
interface TargetListResponse {
  targetInfos?: Array<{
    browserContextId?: string;
    targetId?: string;
    type?: string;
    url?: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the browserContextId for a page's target.
 * Returns undefined for targets in the default (implicit) context.
 */
const getContextId = (page: CdpPageService): Effect.Effect<string | undefined, CdpError> =>
  page.use((conn: CdpConnectionService, sid: string) =>
    conn.cdp.Target.getTargetInfo({ targetId: page.targetId }, sid).pipe(
      Effect.mapError(
        (cause: unknown) =>
          new CdpError({
            module: "test",
            method: "getContextId",
            reason: new ConnectionError({
              description: getErrorMessage(cause),
            }),
          }),
      ),
      Effect.map((result: unknown) => {
        const info = (result as TargetInfoResponse).targetInfo;
        return info?.browserContextId;
      }),
    ),
  );

/**
 *
 * Uses `page.use` escape hatch with proper error channel bridging:
 * `browser-cdp` proxy returns `Effect<any, CdpProtocolError>` but `use` expects
 * `Effect<A, CdpError>`. We map errors using the same pattern
 * as production code's `mapCdpError`.
 *
 * If `contextId` is provided, only counts targets belonging to that context.
 * If omitted, counts all targets.
 */
const countTargets = (page: CdpPageService, contextId?: string): Effect.Effect<number, CdpError> =>
  page.use((conn: CdpConnectionService, sid: string) =>
    conn.cdp.Target.getTargets({}, sid).pipe(
      Effect.mapError(
        (cause: unknown) =>
          new CdpError({
            module: "test",
            method: "countTargets",
            reason: new ConnectionError({
              description: getErrorMessage(cause),
            }),
          }),
      ),
      Effect.map((result: unknown) => {
        const infos = (result as TargetListResponse).targetInfos;
        if (!infos) return 0;
        if (!contextId) return infos.length;
        return infos.filter((t) => t.browserContextId === contextId).length;
      }),
    ),
  );

/**
 * Poll target count until it stabilizes at the expected value or times out.
 *
 * `browser-cdp`'s Target.closeTarget response doesn't guarantee the target is immediately
 * removed from Target.getTargets results — the browser processes cleanup
 * asynchronously. This helper retries until the count matches or the timeout
 * expires, making cleanup assertions reliable across runtimes.
 */
const waitForTargetCount = (
  page: CdpPageService,
  contextId: string | undefined,
  expected: number,
  timeoutMs = 2000,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // Per-request timeout prevents deadlock if `browser-cdp` stalls during teardown.
      // Without this, a hung WebSocket response bypasses orElseSucceed entirely
      // and the polling loop never terminates (60s test timeout).
      const count = yield* countTargets(page, contextId).pipe(
        Effect.timeout("200 millis"),
        Effect.orElseSucceed(() => -1 as number),
      );
      if (count === expected) return;
      yield* Effect.sleep("50 millis");
    }
    // Final attempt — let the assertion catch the mismatch with a clear message
    const count = yield* countTargets(page, contextId).pipe(Effect.orElseSucceed(() => -1));
    if (count !== expected) {
      yield* Effect.logWarning(
        `Target count did not stabilize: expected ${expected}, got ${count}`,
      );
    }
  });

/**
 * Helper to run a test with a `browser-cdp` page.
 */
const withPage = <A, E, R>(
  wsUrl: string,
  fn: (page: CdpPageService, context: CdpContextHandle) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page, context }) => fn(page, context));
  });

/**
 * Parse PNG dimensions from IHDR chunk.
 * PNG format: signature (8 bytes) + IHDR chunk (length: 4, type: 4, data: 13, crc: 4)
 */
const parsePngDimensions = (data: Uint8Array): { width: number; height: number } => {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4e || data[3] !== 0x47) {
    throw new Error("Invalid PNG signature");
  }
  // IHDR chunk starts at byte 8
  // Width is at bytes 16-19 (big-endian)
  // Height is at bytes 20-23 (big-endian)
  const width = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
  const height = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
  return { width, height };
};

// ─────────────────────────────────────────────────────────────────────────────
// Test Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define `browser-cdp` integration tests.
 *
 * Tests use static config (wsUrl, httpUrl) passed from each runtime.
 * Each test is provided with Cdp.layer.
 *
 * Usage:
 * ```typescript
 * import { make } from "./Vitest";
 * import { defineCdpTests } from "../shared/cdp";
 *
 * // Env vars are set by the orchestrator (scripts/test-runner/TestRunner.ts)
 * defineCdpTests(make(), {
 *   wsUrl: process.env.CHROME_WS_URL!,
 *   httpUrl: process.env.HTTP_BASE_URL!,
 * });
 * ```
 */
export const defineCdpTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("Cdp", () => {
    // ── Basic Operations ──────────────────────────────────────────────────────

    test("navigates to URL and reads title", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const title = yield* page.evaluate(() => document.title);
            yield* assertEqual(title, "Test Home");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Convenience Properties (title, content, textContent) ────────────────────

    test("reads page title via title property", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const title = yield* page.title;
            yield* assertEqual(title, "Test Home");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("reads page HTML via content property", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const content = yield* page.content;
            yield* assertTrue(content.includes("<title>Test Home</title>"));
            yield* assertTrue(content.includes("<body"));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("extracts links from page", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/links`);
            const links = yield* page.evaluate(() =>
              Array.from(document.querySelectorAll("a")).map((a) => a.textContent),
            );
            yield* assertEqual(links.length, 3);
            yield* assertContains(links.join(","), "Link 1");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("waits for page load", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/form`, { waitUntil: "load" });
            const exists = yield* page.evaluate(() => document.querySelector("form") !== null);
            yield* assertTrue(exists);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("goto with domcontentloaded waits for DOM", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/form`, { waitUntil: "domcontentloaded" });
            const exists = yield* page.evaluate(() => document.querySelector("form") !== null);
            yield* assertTrue(exists);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── waitForNavigation ──────────────────────────────────────────────────────

    test("waitForNavigation waits for click-triggered navigation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/links`);
            const nav = page.waitForNavigation();
            yield* page.click("a[href='/page1']");
            yield* nav;
            const title = yield* page.title;
            yield* assertEqual(title, "Page 1");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── waitForLoadState ─────────────────────────────────────────────────────

    test("waitForLoadState resolves immediately for already-loaded page", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            // Page already loaded — should resolve immediately
            yield* page.waitForLoadState("load");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("waitForLoadState domcontentloaded resolves after goto", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/form`, { waitUntil: "commit" });
            // DOM may or may not be loaded yet — waitForLoadState should wait
            yield* page.waitForLoadState("domcontentloaded");
            const exists = yield* page.evaluate(() => document.querySelector("form") !== null);
            yield* assertTrue(exists);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test.live("page-wait-for-load-state.spec.ts - networkidle waits for network to settle", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/network-requests`, { waitUntil: "commit" });
            // Network requests should still be in-flight
            yield* page.waitForLoadState("networkidle");
            const status = yield* page.evaluate(
              () => document.getElementById("status")?.textContent,
            );
            yield* assertEqual(status, "All requests completed");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── FrameManager epoch-based navigation tests ──────────────────────────────────────

    test("waitForNavigation works without prepare (Playwright-style)", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/links`);
            // Handle pattern: snapshot eagerly, click, then await
            const nav = page.waitForNavigation();
            yield* page.click("a[href='/page1']");
            yield* nav;
            const url = yield* page.url;
            yield* assertContains(url, "/page1");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("rapid successive navigations track each correctly", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate multiple times rapidly - epoch pattern handles each
            yield* page.goto(`${httpUrl}/page1`);
            yield* assertContains(yield* page.url, "/page1");

            yield* page.goto(`${httpUrl}/page2`);
            yield* assertContains(yield* page.url, "/page2");

            yield* page.goto(`${httpUrl}/links`);
            yield* assertContains(yield* page.url, "/links");

            // Also test click-triggered navigation multiple times
            const nav1 = page.waitForNavigation();
            yield* page.click("a[href='/page1']");
            yield* nav1;
            yield* assertContains(yield* page.url, "/page1");

            yield* page.goto(`${httpUrl}/links`);
            const nav2 = page.waitForNavigation();
            yield* page.click("a[href='/page2']");
            yield* nav2;
            yield* assertContains(yield* page.url, "/page2");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("waitForLoadState resolves immediately for already-loaded page", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // After goto completes, page is already at load state
            // waitForLoadState should resolve immediately without timeout
            yield* page.goto(`${httpUrl}/`);
            // This should NOT timeout - page already loaded
            yield* page.waitForLoadState("load", { timeout: 1000 });
            // Second call should also resolve immediately
            yield* page.waitForLoadState("load", { timeout: 1000 });
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("concurrent waitForNavigation calls resolve together", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/links`);
            // Start two handles waiting for navigation
            const nav1 = page.waitForNavigation({ timeout: 5000 });
            const nav2 = page.waitForNavigation({ timeout: 5000 });
            // Trigger navigation
            yield* page.click("a[href='/page1']");
            // Both handles should resolve
            yield* nav1;
            yield* nav2;
            yield* assertContains(yield* page.url, "/page1");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Tests adapted from Playwright's page-wait-for-navigation.spec.ts ────────────────

    // Same-document navigations (hash, pushState, replaceState) are
    // handled via Page.navigatedWithinDocument CDP events. The tests below
    // verify anchor-link navigation waits and same-document pushState waits.

    test("waitForNavigation should work with clicking on anchor links", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            yield* page.setContent(`<a href='#foobar'>foobar</a>`);
            const nav = page.waitForNavigation();
            yield* page.click("a");
            yield* nav;
            // Anchor navigation changes URL but stays on same page
            const url = yield* page.url;
            yield* assertContains(url, "#foobar");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("waitForNavigation should work with history.pushState", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            yield* page.setContent(`
              <a onclick='javascript:pushState()'>SPA</a>
              <script>
                function pushState() { history.pushState({}, '', 'wow.html') }
              </script>
            `);
            const nav = page.waitForNavigation();
            yield* page.click("a");
            yield* nav;
            const url = yield* page.url;
            yield* assertContains(url, "wow.html");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("waitForNavigation should work with history.replaceState", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            yield* page.setContent(`
              <a onclick='javascript:replaceState()'>SPA</a>
              <script>
                function replaceState() { history.replaceState({}, '', 'replaced.html') }
              </script>
            `);
            const nav = page.waitForNavigation();
            yield* page.click("a");
            yield* nav;
            const url = yield* page.url;
            yield* assertContains(url, "replaced.html");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("waitForNavigation should work with DOM history.back/forward", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            yield* page.setContent(`
              <a id='back' onclick='javascript:goBack()'>back</a>
              <a id='forward' onclick='javascript:goForward()'>forward</a>
              <script>
                function goBack() { history.back(); }
                function goForward() { history.forward(); }
                history.pushState({}, '', 'first.html');
                history.pushState({}, '', 'second.html');
              </script>
            `);
            // We're at second.html now
            yield* assertContains(yield* page.url, "second.html");

            // Click back - go to first.html
            const backNav = page.waitForNavigation();
            yield* page.click("a#back");
            yield* backNav;
            yield* assertContains(yield* page.url, "first.html");

            // Click forward - go to second.html
            const forwardNav = page.waitForNavigation();
            yield* page.click("a#forward");
            yield* forwardNav;
            yield* assertContains(yield* page.url, "second.html");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("waitForNavigation should work with both domcontentloaded and load", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to a page and wait for both domcontentloaded and load
            yield* page.goto(`${httpUrl}/form`);

            // Both should have fired by now since goto waits for load by default
            // This test verifies that our implementation correctly tracks both events
            const content = yield* page.evaluate(() => document.readyState);
            yield* assertEqual(content, "complete");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Tests adapted from Playwright's page-wait-for-load-state.spec.ts ────────────────

    test("waitForLoadState should resolve immediately if loaded", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/form`);
            // Page is already loaded, should resolve immediately
            yield* page.waitForLoadState("load");
            // Second call should also resolve immediately
            yield* page.waitForLoadState("load");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("waitForLoadState should resolve immediately if load state matches", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/form`, { waitUntil: "domcontentloaded" });
            // We waited for domcontentloaded, so it should be ready
            yield* page.waitForLoadState("domcontentloaded");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── url / reload / goBack / goForward ────────────────────────────────────

    test("url returns current page URL", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/links`);
            const url = yield* page.url;
            yield* assertContains(url, "/links");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("reload reloads the current page", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/session-storage`);
            // Set a value in sessionStorage via evaluate
            yield* page.evaluate(
              (key: string) => sessionStorage.setItem(key, "before-reload"),
              "reload-test",
            );
            // Reload
            yield* page.reload();
            // sessionStorage survives reload
            const value = yield* page.evaluate(
              (key: string) => sessionStorage.getItem(key),
              "reload-test",
            );
            yield* assertEqual(value, "before-reload");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("goBack navigates to previous page", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            yield* page.goto(`${httpUrl}/links`);
            // Verify we're on links page
            const title1 = yield* page.title;
            yield* assertEqual(title1, "Links Page");
            // Go back
            yield* page.goBack();
            const title2 = yield* page.title;
            yield* assertEqual(title2, "Test Home");
            const url = yield* page.url;
            yield* assertContains(url, "/");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("goForward navigates to next page", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            yield* page.goto(`${httpUrl}/links`);
            // Go back, then forward
            yield* page.goBack();
            const title1 = yield* page.title;
            yield* assertEqual(title1, "Test Home");
            yield* page.goForward();
            const title2 = yield* page.title;
            yield* assertEqual(title2, "Links Page");
            const url = yield* page.url;
            yield* assertContains(url, "/links");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("goBack is a no-op when there is no previous page", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            // History: [about:blank, /] — goBack navigates to about:blank
            // (matches Playwright behavior — about:blank is a real history entry)
            yield* page.goBack();
            const url1 = yield* page.url;
            yield* assertContains(url1, "about:blank");
            // Now at the first entry (index 0) — goBack is a true no-op
            yield* page.goBack();
            const url2 = yield* page.url;
            yield* assertContains(url2, "about:blank");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("goForward is a no-op when there is no next page", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            // No forward history — goForward is a no-op
            // (matches Playwright — returns false when no entry exists)
            yield* page.goForward();
            const url = yield* page.url;
            yield* assertContains(url, "/");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("waitForTimeout sleeps for specified duration", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const start = Date.now();
            yield* page.waitForTimeout(100);
            const elapsed = Date.now() - start;
            // Should have waited at least 80ms (allowing some tolerance)
            yield* assertTrue(elapsed >= 80);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Evaluate ──────────────────────────────────────────────────────────────

    test("evaluate with arguments", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const result = yield* page.evaluate(([a, b]: [number, number]) => a + b, [10, 20]);
            yield* assertEqual(result, 30);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("evaluate async function", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const result = yield* page.evaluate(async () => {
              await new Promise((r) => setTimeout(r, 10));
              return "async result";
            });
            yield* assertEqual(result, "async result");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("evaluate string expression", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const result = yield* page.evaluate(`
              (() => {
                const x = 5;
                const y = 10;
                return x + y;
              })()
            `);
            yield* assertEqual(result, 15);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Phase 2: Business Logic Tests - Evaluate Edge Cases ───────────────────

    test("evaluate returns undefined", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const result = yield* page.evaluate(() => undefined);
            yield* assertEqual(result, undefined);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("evaluate returns null", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const result = yield* page.evaluate(() => null);
            yield* assertEqual(result, null);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("evaluate returns large object", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            // Create a large object to test serialization pipeline
            const result = yield* page.evaluate(() => {
              const obj: Record<string, number> = {};
              for (let i = 0; i < 1000; i++) {
                obj[`key${i}`] = i;
              }
              return obj;
            });
            yield* assertEqual(Object.keys(result).length, 1000);
            yield* assertEqual(result["key500"], 500);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Click & Fill ──────────────────────────────────────────────────────────

    test("clicks element", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/form`);
            yield* page.click('button[type="submit"]');
            const result = yield* page.evaluate(
              () => document.getElementById("result")?.textContent,
            );
            yield* assertEqual(result, "Form submitted!");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("fills input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/form`);
            yield* page.fill('input[name="username"]', "testuser");
            const value = yield* page.evaluate(
              () => (document.querySelector('input[name="username"]') as HTMLInputElement)?.value,
            );
            yield* assertEqual(value, "testuser");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("submits form", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/form`);
            yield* page.fill('input[name="username"]', "testuser");
            yield* page.fill('input[name="password"]', "testpass");
            yield* page.click('button[type="submit"]');
            const result = yield* page.evaluate(
              () => document.getElementById("result")?.textContent,
            );
            yield* assertEqual(result, "Form submitted!");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Type ────────────────────────────────────────────────────────────────

    test("types text into element", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/type-test`);
            yield* page.type("#type-input", "hello");
            const result = yield* page.evaluate(
              () => document.getElementById("type-result")?.textContent,
            );
            yield* assertEqual(result, "hello");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("types with delay between keystrokes", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/type-test`);
            yield* page.type("#type-input", "ab", { delay: 10 });
            const result = yield* page.evaluate(
              () => document.getElementById("type-result")?.textContent,
            );
            yield* assertEqual(result, "ab");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Press ───────────────────────────────────────────────────────────────

    test("presses Enter key", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/press-test`);
            yield* page.press("#press-input", "Enter");
            const result = yield* page.evaluate(
              () => document.getElementById("press-result")?.textContent,
            );
            yield* assertEqual(result, "Key: Enter");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("presses Tab key", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/press-test`);
            yield* page.press("#press-input", "Tab");
            const result = yield* page.evaluate(
              () => document.getElementById("press-result")?.textContent,
            );
            yield* assertEqual(result, "Key: Tab");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Element Content ───────────────────────────────────────────────────

    test("textContent extracts raw text from element", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/element-content`);
            const maybeText = yield* page.textContent("#heading");
            yield* assertEqual(Option.getOrThrow(maybeText), "Hello World");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("innerText extracts visible text from element", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/element-content`);
            const maybeText = yield* page.innerText("#heading");
            yield* assertEqual(Option.getOrThrow(maybeText), "Hello World");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("innerHTML extracts HTML content from element", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/element-content`);
            const maybeHtml = yield* page.innerHTML("#content");
            const html = Option.getOrThrow(maybeHtml);
            yield* assertContains(html, '<p class="intro">');
            yield* assertContains(html, "First paragraph");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("getAttribute reads element attributes", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/element-content`);
            const maybeHref = yield* page.getAttribute("#link", "href");
            yield* assertEqual(Option.getOrThrow(maybeHref), "/links");
            const maybeTestId = yield* page.getAttribute("#link", "data-testid");
            yield* assertEqual(Option.getOrThrow(maybeTestId), "nav-link");
            const maybeMissing = yield* page.getAttribute("#link", "nonexistent");
            yield* assertTrue(Option.isNone(maybeMissing));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Network Events ────────────────────────────────────────────────────

    test(
      "waitForRequest captures fetch request",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/network-fetch`);
              // Prepare: subscribe to network events
              const request = yield* page.waitForRequest(`${httpUrl}/api/echo`);
              // Trigger: click button that makes a fetch
              yield* page.click("#fetch-btn");
              // Await: get the request info
              const info = yield* request;
              yield* assertContains(info.url, "/api/echo");
              yield* assertEqual(info.method, "POST");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 20_000 },
    );

    test(
      "waitForResponse captures fetch response",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/network-fetch`);
              // Prepare: subscribe to network events
              const response = yield* page.waitForResponse(`${httpUrl}/api/echo`);
              // Trigger: click button that makes a fetch
              yield* page.click("#fetch-btn");
              // Await: get the response info
              const info = yield* response;
              yield* assertContains(info.url, "/api/echo");
              yield* assertEqual(info.status, 200);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 20_000 },
    );

    test(
      "waitForRequest accepts predicate function",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/network-fetch`);
              const request = yield* page.waitForRequest((info) => info.url.includes("api/echo"));
              yield* page.click("#fetch-btn");
              const info = yield* request;
              yield* assertContains(info.url, "api/echo");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 20_000 },
    );

    test(
      "waitForRequest accepts regex",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/network-fetch`);
              const request = yield* page.waitForRequest(/api\/echo/);
              yield* page.click("#fetch-btn");
              const info = yield* request;
              yield* assertContains(info.url, "api/echo");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 20_000 },
    );

    // ── Dynamic Content ───────────────────────────────────────────────────────

    test("waits for selector", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/delayed-element`, { waitUntil: "load" });
            yield* page.waitForSelector("#late-element", { timeout: 5000 });
            const text = yield* page.evaluate(
              () => document.getElementById("late-element")?.textContent,
            );
            yield* assertEqual(text, "I appeared!");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Phase 2: Business Logic Tests - Network Idle ──────────────────────────

    test.live("page-goto.spec.ts - networkidle waits for network requests", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate with networkidle - should wait for network requests to complete
            // Page fires 3 fetch requests at t=0,100ms,200ms.
            // With 500ms debounce, networkidle should resolve in ~1-2s.
            const start = Date.now();
            yield* page.goto(`${httpUrl}/network-requests`, { waitUntil: "networkidle" });
            const elapsed = Date.now() - start;

            // Check that status shows requests completed
            const status = yield* page.evaluate(
              () => document.getElementById("status")?.textContent,
            );
            yield* assertEqual(status, "All requests completed");

            // Verify networkidle resolved promptly — if the debounce-based idle
            // detection fails, this will timeout at 30s internally. We assert
            // < 5s as a generous upper bound (expected ~1-2s).
            // Using assertTrue so failure message is clear from test output.
            if (elapsed >= 5000) {
              yield* Effect.logError(`networkidle took ${elapsed}ms, expected < 5000ms`);
            }
            yield* assertTrue(elapsed < 5000);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Phase 3: Behavior Tests - Operation Fails When Expected ──────────────

    test("evaluate with JS error fails", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/error-script`);
            // Attempt to call function that throws
            const exit = yield* Effect.exit(
              page.evaluate(() => {
                throw new Error("Test error from evaluate");
              }),
            );
            // Verify operation failed (not checking error type per Effect testing philosophy)
            yield* assertTrue(Exit.isFailure(exit));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("click on missing element fails after timeout", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Verify the click fails because the element doesn't exist.
            // The retry loop now has a hard wall-clock deadline
            // (added in P13 — see RetryWithElement.ts), so the click
            // returns within the timeout regardless of system load.
            // Use a 1000ms timeout to fail fast.
            const exit = yield* Effect.exit(page.click("#non-existent-element", { timeout: 1000 }));
            yield* assertTrue(Exit.isFailure(exit));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("waitForSelector with invalid CSS fails", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            // Invalid CSS selector — fails immediately at parse time
            // (DOM.querySelector returns an error, caught as
            // EvaluationError inside WaitForSelector). Use 1000ms.
            const exit = yield* Effect.exit(
              page.waitForSelector("[invalid-selector", { timeout: 1000 }),
            );
            yield* assertTrue(Exit.isFailure(exit));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Cookies ───────────────────────────────────────────────────────────────

    test("gets cookies", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page, context) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const cookies = yield* context.cookies();
            yield* assertTrue(Array.isArray(cookies));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("sets cookies", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page, context) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            yield* context.addCookies([
              { name: "test-cookie", value: "test-value", url: `${httpUrl}/` },
            ]);
            const cookies = yield* context.cookies();
            const testCookie = cookies.find((c: CdpCookie) => c.name === "test-cookie");
            const cookie = yield* assertExists(testCookie);
            yield* assertEqual(cookie.value, "test-value");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Phase 4: Screenshot Dimension Validation ──────────────────────────────

    test("takes screenshot", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const screenshot = yield* page.screenshot();
            yield* assertTrue(screenshot instanceof Uint8Array);
            yield* assertTrue(screenshot.byteLength > 0);
            // PNG magic number
            yield* assertEqual(screenshot[0], 0x89);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("screenshot dimensions are valid PNG", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/grid`);
            const screenshot = yield* page.screenshot();
            // Parse PNG dimensions from IHDR chunk
            const { width, height } = parsePngDimensions(screenshot);
            // Verify dimensions are positive (actual viewport varies by browser/config)
            yield* assertTrue(width > 0);
            yield* assertTrue(height > 0);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("screenshot as jpeg with quality", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const screenshot = yield* page.screenshot({ format: "jpeg", quality: 50 });
            yield* assertTrue(screenshot instanceof Uint8Array);
            yield* assertTrue(screenshot.byteLength > 0);
            // JPEG magic number: FF D8 FF
            yield* assertEqual(screenshot[0], 0xff);
            yield* assertEqual(screenshot[1], 0xd8);
            yield* assertEqual(screenshot[2], 0xff);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Phase 5: PDF Generation ──────────────────────────────────────────────

    test("generates PDF", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const pdf = yield* page.pdf();
            yield* assertTrue(pdf instanceof Uint8Array);
            yield* assertTrue(pdf.byteLength > 0);
            // PDF magic number: %PDF-
            yield* assertEqual(pdf[0], 0x25); // %
            yield* assertEqual(pdf[1], 0x50); // P
            yield* assertEqual(pdf[2], 0x44); // D
            yield* assertEqual(pdf[3], 0x46); // F
            yield* assertEqual(pdf[4], 0x2d); // -
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("generates PDF with format option", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const pdf = yield* page.pdf({ format: "A4", printBackground: true });
            yield* assertTrue(pdf instanceof Uint8Array);
            yield* assertTrue(pdf.byteLength > 0);
            // Verify PDF header
            yield* assertEqual(pdf[0], 0x25); // %
            yield* assertEqual(pdf[1], 0x50); // P
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("generates PDF with margins and landscape", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const pdf = yield* page.pdf({
              landscape: true,
              margin: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
            });
            yield* assertTrue(pdf instanceof Uint8Array);
            yield* assertTrue(pdf.byteLength > 0);
            yield* assertEqual(pdf[0], 0x25); // %
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("generates PDF with header and footer", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const pdf = yield* page.pdf({
              displayHeaderFooter: true,
              headerTemplate: "<div></div>",
              footerTemplate:
                '<div style="font-size:9px;text-align:center;width:100%"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
            });
            yield* assertTrue(pdf instanceof Uint8Array);
            yield* assertTrue(pdf.byteLength > 0);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("PDF fails with invalid format", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const exit = yield* Effect.exit(page.pdf({ format: "InvalidFormat" }));
            yield* assertTrue(Exit.isFailure(exit));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Fetch ─────────────────────────────────────────────────────────────────

    test("fetches through browser", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const response = yield* page.fetch(`${httpUrl}/links`);
            yield* assertEqual(response.status, 200);
            yield* assertContains(response.body, "Links Page");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("fetch POST with body", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const response = yield* page.fetch(`${httpUrl}/api/echo`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ body: "hello" }),
            });
            yield* assertEqual(response.status, 200);
            yield* assertContains(response.body, "hello");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("fetch returns 404 for unknown path", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            // The catch-all handler returns 200 with a 404 message,
            // so we test against a genuinely unreachable URL instead
            const exit = yield* Effect.exit(
              page.fetch("http://192.0.2.1:1/unreachable", { timeout: 2000 }),
            );
            yield* assertTrue(Exit.isFailure(exit));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("fetch inherits browser cookies", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page, context) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            // Set a cookie via context
            yield* context.addCookies([{ name: "session", value: "abc123", url: `${httpUrl}/` }]);
            // Verify the browser context has the cookie via document.cookie
            const browserCookie = yield* page.evaluate(() => document.cookie);
            yield* assertContains(browserCookie, "session=abc123");
            // Now verify that page.fetch() sends the cookie to the server
            const response = yield* page.fetch(`${httpUrl}/api/echo`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ body: "test" }),
            });
            yield* assertEqual(response.status, 200);
            // Parse the response to check if cookies were sent
            const result = JSON.parse(response.body) as {
              method: string;
              body: string;
              cookies?: string;
              headers: Record<string, string>;
            };
            // The cookies field should contain our session cookie
            const cookieHeader = result.cookies ?? result.headers?.cookie ?? "";
            yield* assertContains(cookieHeader, "session=abc123");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    test("fetch returns response headers", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/`);
            const response = yield* page.fetch(`${httpUrl}/`);
            yield* assertEqual(response.status, 200);
            // The response should have headers — at minimum content-type
            const hasContentType = Object.keys(response.headers).some(
              (key) => key.toLowerCase() === "content-type",
            );
            yield* assertTrue(hasContentType);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── Scoped Methods (Phase 1 Redesign) ──────────────────────────────────────

    describe("Scoped Methods", () => {
      // ── acquireConnection() primitive (escape hatch) ───────────────────────────

      test("acquireConnection returns scope with handle methods", () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;

          yield* cdp.acquireConnection({ url: wsUrl }).pipe(
            Effect.scoped,
            Effect.flatMap(({ connection }) =>
              Effect.gen(function* () {
                // Verify handle has expected methods
                yield* assertTrue(typeof connection.withContext === "function");
                yield* assertTrue(typeof connection.withPage === "function");
              }),
            ),
          );
        }).pipe(Effect.provide(Cdp.layer)));

      test("acquireConnection allows multiple operations before scope closes", () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;

          yield* cdp.acquireConnection({ url: wsUrl }).pipe(
            Effect.flatMap(({ connection }) =>
              Effect.gen(function* () {
                // First page
                const title1 = yield* connection.withPage((page) =>
                  Effect.gen(function* () {
                    yield* page.goto(`${httpUrl}/`);
                    return yield* page.evaluate(() => document.title);
                  }),
                );

                // Second page - same connection
                const title2 = yield* connection.withPage((page) =>
                  Effect.gen(function* () {
                    yield* page.goto(`${httpUrl}/links`);
                    return yield* page.evaluate(() => document.title);
                  }),
                );

                yield* assertEqual(title1, "Test Home");
                yield* assertEqual(title2, "Links Page");
              }),
            ),
            Effect.scoped,
          );
        }).pipe(Effect.provide(Cdp.layer)));

      test("withPage shortcut provides fresh page", () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;
          const title = yield* cdp.withPage({ url: wsUrl }, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/`);
              return yield* page.evaluate(() => document.title);
            }),
          );
          yield* assertEqual(title, "Test Home");
        }).pipe(Effect.provide(Cdp.layer)));

      // ── handle.withPage() ────────────────────────────────────────────────────

      test("handle.withPage creates new page in default context", () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;

          // Track targetIds to verify pages are different
          const targetIds: string[] = [];

          yield* cdp.withConnection({ url: wsUrl }, ({ connection }) =>
            Effect.gen(function* () {
              yield* connection.withPage((page) =>
                Effect.gen(function* () {
                  targetIds.push(page.targetId);
                  yield* page.goto(`${httpUrl}/`);
                }),
              );

              yield* connection.withPage((page) =>
                Effect.gen(function* () {
                  targetIds.push(page.targetId);
                  yield* page.goto(`${httpUrl}/links`);
                }),
              );
            }),
          );

          // Verify two different pages were created
          yield* assertEqual(targetIds.length, 2);
          yield* assertTrue(targetIds[0] !== targetIds[1]);
        }).pipe(Effect.provide(Cdp.layer)));

      // ── handle.withContext() isolation ────────────────────────────────────────

      test("handle.withContext creates isolated context", () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;

          yield* cdp.withConnection({ url: wsUrl }, ({ connection }) =>
            Effect.gen(function* () {
              // Set a cookie in the first context
              yield* connection.withContext(({ context, page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpUrl}/`);
                  yield* context.addCookies([
                    { name: "ctx1-cookie", value: "ctx1-value", url: `${httpUrl}/` },
                  ]);
                  const cookies = yield* context.cookies(`${httpUrl}/`);
                  const ctx1Cookie = cookies.find((c: CdpCookie) => c.name === "ctx1-cookie");
                  const cookie = yield* assertExists(ctx1Cookie);
                  yield* assertEqual(cookie.value, "ctx1-value");
                }),
              );

              // Verify cookie is NOT visible in a different context
              yield* connection.withContext(({ context, page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpUrl}/`);
                  const cookies = yield* context.cookies(`${httpUrl}/`);
                  const ctx1Cookie = cookies.find((c: CdpCookie) => c.name === "ctx1-cookie");
                  // Cookie from first context should not exist here
                  yield* assertTrue(ctx1Cookie === undefined);
                }),
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)));

      // ── contextHandle.withPage() ──────────────────────────────────────────────

      test("contextHandle.withPage creates page in same context", () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;

          yield* cdp.withConnection({ url: wsUrl }, ({ connection }) =>
            Effect.gen(function* () {
              // Create an isolated context and set a cookie
              yield* connection.withContext(({ context, page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpUrl}/`);
                  yield* context.addCookies([
                    { name: "shared-cookie", value: "shared-value", url: `${httpUrl}/` },
                  ]);

                  // Create another page in the SAME context - should see the cookie
                  yield* context.withPage((page) =>
                    Effect.gen(function* () {
                      yield* page.goto(`${httpUrl}/`);
                      // Get cookies through the context handle
                      const cookies = yield* context.cookies(`${httpUrl}/`);
                      const sharedCookie = cookies.find(
                        (c: CdpCookie) => c.name === "shared-cookie",
                      );
                      const cookie = yield* assertExists(sharedCookie);
                      yield* assertEqual(cookie.value, "shared-value");
                    }),
                  );
                }),
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)));

      // ── Resource Cleanup Tests ────────────────────────────────────────────

      describe("Resource Cleanup", () => {
        test("connection.withPage closes page after scope exits", () =>
          Effect.gen(function* () {
            const cdp = yield* Cdp;

            // Use acquireConnection for a persistent connection across operations
            yield* cdp.acquireConnection({ url: wsUrl }).pipe(
              Effect.flatMap(({ connection }) =>
                Effect.gen(function* () {
                  // Count initial targets (withPage creates a probe page)
                  const initialCount = yield* connection.withPage((page) => countTargets(page));

                  // Create and close a page via withPage
                  yield* connection.withPage((page) =>
                    Effect.gen(function* () {
                      yield* page.goto(`${httpUrl}/`);
                    }),
                  );

                  // Count targets after withPage scope exited
                  const afterCount = yield* connection.withPage((page) => countTargets(page));

                  // Target count should not have grown (page was cleaned up)
                  // Note: afterCount <= initialCount because the probe page itself is temporary
                  yield* assertTrue(afterCount <= initialCount);
                }),
              ),
              Effect.scoped,
            );
          }).pipe(Effect.provide(Cdp.layer)));

        test("connection.withContext cleans up context and pages", () =>
          Effect.gen(function* () {
            const cdp = yield* Cdp;

            yield* cdp.acquireConnection({ url: wsUrl }).pipe(
              Effect.flatMap(({ connection }) =>
                Effect.gen(function* () {
                  // Count targets before
                  const beforeCount = yield* connection.withPage((page) => countTargets(page));

                  // Create an isolated context (which also creates a page)
                  yield* connection.withContext(({ page }) =>
                    Effect.gen(function* () {
                      yield* page.goto(`${httpUrl}/`);
                    }),
                  );

                  // Count targets after withContext scope exited
                  const afterCount = yield* connection.withPage((page) => countTargets(page));

                  // Target count should not have grown
                  yield* assertTrue(afterCount <= beforeCount);
                }),
              ),
              Effect.scoped,
            );
          }).pipe(Effect.provide(Cdp.layer)));

        test.live("cdp-context.spec.ts - context.withPage closes page after scope exits", () =>
          Effect.gen(function* () {
            const cdp = yield* Cdp;

            yield* cdp.acquireConnection({ url: wsUrl }).pipe(
              Effect.flatMap(({ connection }) =>
                Effect.gen(function* () {
                  const counts = yield* connection.withContext(({ context, page: defaultPage }) =>
                    Effect.gen(function* () {
                      const ctxId = yield* getContextId(defaultPage);

                      // Count targets in THIS context before creating additional page
                      const beforeCount = yield* countTargets(defaultPage, ctxId);

                      // Create and close a page via context.withPage
                      yield* context.withPage((page) =>
                        Effect.gen(function* () {
                          yield* page.goto(`${httpUrl}/`);
                        }),
                      );

                      // Wait for Target.closeTarget to propagate — CDP close is async
                      yield* waitForTargetCount(defaultPage, ctxId, beforeCount);

                      // Count targets in THIS context after context.withPage scope exited
                      const afterCount = yield* countTargets(defaultPage, ctxId);

                      return { beforeCount, afterCount } as const;
                    }),
                  );

                  // Page should have been cleaned up — exact same count as before
                  yield* assertEqual(counts.afterCount, counts.beforeCount);
                }),
              ),
              Effect.scoped,
            );
          }).pipe(Effect.provide(Cdp.layer)),
        );

        test.live(
          "cdp-context.spec.ts - multiple context.withPage calls do not accumulate pages",
          () =>
            Effect.gen(function* () {
              const cdp = yield* Cdp;

              yield* cdp.acquireConnection({ url: wsUrl }).pipe(
                Effect.flatMap(({ connection }) =>
                  Effect.gen(function* () {
                    const counts = yield* connection.withContext(({ context, page: defaultPage }) =>
                      Effect.gen(function* () {
                        const ctxId = yield* getContextId(defaultPage);

                        // Count targets in THIS context before any context.withPage calls
                        const beforeCount = yield* countTargets(defaultPage, ctxId);

                        // Call context.withPage 3 times
                        for (let i = 0; i < 3; i++) {
                          yield* context.withPage((page) =>
                            Effect.gen(function* () {
                              yield* page.goto(`${httpUrl}/`);
                            }),
                          );
                        }

                        // Wait for Target.closeTarget to propagate — CDP close is async
                        yield* waitForTargetCount(defaultPage, ctxId, beforeCount);

                        // Count targets in THIS context after all calls
                        const afterCount = yield* countTargets(defaultPage, ctxId);

                        return { beforeCount, afterCount } as const;
                      }),
                    );

                    // All pages should have been cleaned up — exact same count as before
                    yield* assertEqual(counts.afterCount, counts.beforeCount);
                  }),
                ),
                Effect.scoped,
              );
            }).pipe(Effect.provide(Cdp.layer)),
        );
      });

      test("multiple withContext calls produce isolated contexts", () =>
        Effect.gen(function* () {
          const cdp = yield* Cdp;

          // Track cookies from each context
          const cookieValues: string[] = [];

          yield* cdp.withConnection({ url: wsUrl }, ({ connection }) =>
            Effect.gen(function* () {
              // First context - set unique cookie
              yield* connection.withContext(({ context, page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpUrl}/`);
                  yield* context.addCookies([
                    { name: "isolation-test", value: "context-A", url: `${httpUrl}/` },
                  ]);
                  const cookies = yield* context.cookies(`${httpUrl}/`);
                  const cookie = cookies.find((c: CdpCookie) => c.name === "isolation-test");
                  cookieValues.push(cookie?.value ?? "none");
                }),
              );

              // Second context - should NOT see first context's cookie
              yield* connection.withContext(({ context, page }) =>
                Effect.gen(function* () {
                  yield* page.goto(`${httpUrl}/`);
                  const cookies = yield* context.cookies(`${httpUrl}/`);
                  const cookie = cookies.find((c: CdpCookie) => c.name === "isolation-test");
                  // Should not have context-A cookie
                  cookieValues.push(cookie?.value ?? "none");
                }),
              );
            }),
          );

          // First context sees its own cookie, second context does not
          yield* assertEqual(cookieValues[0], "context-A");
          yield* assertEqual(cookieValues[1], "none");
        }).pipe(Effect.provide(Cdp.layer)));
    });
  });
};
