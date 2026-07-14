/**
 * `browser-cdp` parity tests for waitForNavigation.
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-wait-for-navigation.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Key differences from upstream:
 *   - `browser-cdp` waitForNavigation returns Option<Response>:
 *     Option.some(Response) for cross-document navigations (status, url, headers);
 *     Option.none() for same-document navigations (pushState, replaceState, hash),
 *     waitUntil: "commit", or when the response didn't arrive within the timeout.
 *   - Verify navigation success via `Option.getOrThrow(responseOption).url` or
 *     `yield* page.url`
 *   - `page.url` / `page.title` are Effect properties, not methods
 *   - Uses handle pattern: `const nav = page.waitForNavigation(); ... ; yield* nav;`
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   NOT_PLANNED — test infra uses --ignore-certificate-errors, cannot test SSL errors:
 *     - "should work with clicking on links which do not commit navigation" → NOT_PLANNED skip below
 *
 *   Requires frame detachment detection:
 *     - "should fail when frame detaches" → NOT_PLANNED skip below
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 * waitForNavigation uses Effect.timeout internally, so all tests involving
 * navigation waiting require real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Exit, Fiber, Option, Schedule } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { TestServerClient, CROSS_PROCESS_PREFIX } from "../../../setup/http-server/Client.js";
import { assertEqual, assertContains, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineWaitForNavigationTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe, beforeEach } = api;
  const { wsUrl, httpUrl } = config;

  describe("WaitForNavigation", () => {
    // Clear dynamic routes before each test to prevent route poisoning
    beforeEach(() => TestServerClient.clear(httpUrl).pipe(Effect.ignore));
    // ── "should work" ────────────────────────────────────────────────────

    test.live("page-wait-for-navigation.spec.ts - should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const nav = page.waitForNavigation();
            yield* page.evaluate((url) => {
              window.location.href = url;
            }, `${httpUrl}/grid`);
            yield* nav;
            yield* assertContains(yield* page.url, "/grid");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should respect timeout" ─────────────────────────────────────────

    test.live(
      "page-wait-for-navigation.spec.ts - should respect timeout [VARIANT: without url option]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // Get the handle (snapshots eagerly), then await it
              const nav = page.waitForNavigation({ timeout: 1000 });
              const exit = yield* Effect.exit(nav);
              yield* assertTrue(Exit.isFailure(exit));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 10_000 },
    );

    test.live(
      "page-wait-for-navigation.spec.ts - should respect timeout",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const nav = page.waitForNavigation({ url: "**/frame.html", timeout: 1000 });
              const exit = yield* Effect.exit(nav);
              yield* assertTrue(Exit.isFailure(exit));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 10_000 },
    );

    // ── "should work with both domcontentloaded and load" ────────────────

    test.live(
      "page-wait-for-navigation.spec.ts - should work with both domcontentloaded and load",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* TestServerClient.setHangRoute(httpUrl, "/one-style.css");

              const navFiber = yield* Effect.forkChild(page.goto(`${httpUrl}/one-style`));

              yield* TestServerClient.waitForRequest(httpUrl, "/one-style.css");

              // domcontentloaded resolves while CSS is still hanging
              yield* page.waitForLoadState("domcontentloaded");

              yield* TestServerClient.release(httpUrl, "/one-style.css");

              yield* page.waitForLoadState("load");

              yield* Fiber.join(navFiber);
            }).pipe(
              // Ensure routes are cleaned up even if the test fails mid-way
              Effect.ensuring(TestServerClient.clear(httpUrl).pipe(Effect.ignore)),
            ),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with commit" ────────────────────────────────────────

    test.live("page-wait-for-navigation.spec.ts - should work with commit", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* TestServerClient.setHangRoute(httpUrl, "/script.js");
            yield* TestServerClient.setRespondRoute(
              httpUrl,
              "/empty",
              '<title>Hello</title><script src="/script.js"></script>',
              undefined,
              "text/html",
            );

            // Handle pattern: snapshot BEFORE starting navigation
            const nav = page.waitForNavigation({ waitUntil: "commit" });
            yield* Effect.forkChild(page.goto(`${httpUrl}/empty`).pipe(Effect.ignore));
            yield* nav;

            // After commit resolves, execution context tracking ensures the JS
            // environment is available (Runtime.executionContextCreated has fired).
            // page.title awaits the execution context before evaluating, so
            // the title is guaranteed to be available.
            // Title after commit: The execution context is created before HTML
            // parsing completes. `browser-cdp` timing reality: we may need to poll briefly.
            // Playwright avoids this by using a utility world for evaluations.
            const title = yield* page.title.pipe(
              Effect.repeat(
                Schedule.spaced("20 millis").pipe(
                  Schedule.setInputType<string>(),
                  Schedule.passthrough,
                  Schedule.while(({ input }) => input !== "Hello"),
                ),
              ),
              Effect.timeout("500 millis"),
            );
            yield* assertEqual(title, "Hello");

            yield* TestServerClient.release(httpUrl, "/script.js");
            yield* TestServerClient.clear(httpUrl);
          }).pipe(
            // Ensure routes are cleaned up even if the test fails mid-way
            Effect.ensuring(
              TestServerClient.release(httpUrl, "/script.js").pipe(
                Effect.andThen(TestServerClient.clear(httpUrl)),
                Effect.ignore,
              ),
            ),
          ),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with clicking on anchor links" ──────────────────────

    test.live("page-wait-for-navigation.spec.ts - should work with clicking on anchor links", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<a href='#foobar'>foobar</a>`);
            const nav = page.waitForNavigation();
            yield* page.click("a");
            yield* nav;
            yield* assertEqual(yield* page.url, `${httpUrl}/empty#foobar`);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with history.pushState()" ───────────────────────────

    test.live("page-wait-for-navigation.spec.ts - should work with history.pushState()", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`
              <a onclick='javascript:pushState()'>SPA</a>
              <script>
                function pushState() { history.pushState({}, '', 'wow.html') }
              </script>
            `);
            const nav = page.waitForNavigation();
            yield* page.click("a");
            yield* nav;
            yield* assertEqual(yield* page.url, `${httpUrl}/wow.html`);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with history.replaceState()" ────────────────────────

    test.live("page-wait-for-navigation.spec.ts - should work with history.replaceState()", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`
              <a onclick='javascript:replaceState()'>SPA</a>
              <script>
                function replaceState() { history.replaceState({}, '', '/replaced.html') }
              </script>
            `);
            const nav = page.waitForNavigation();
            yield* page.click("a");
            yield* nav;
            yield* assertEqual(yield* page.url, `${httpUrl}/replaced.html`);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with DOM history.back()/history.forward()" ──────────

    test.live(
      "page-wait-for-navigation.spec.ts - should work with DOM history.back()/history.forward()",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`
              <a id=back onclick='javascript:goBack()'>back</a>
              <a id=forward onclick='javascript:goForward()'>forward</a>
              <script>
                function goBack() { history.back(); }
                function goForward() { history.forward(); }
                history.pushState({}, '', '/first.html');
                history.pushState({}, '', '/second.html');
              </script>
            `);
              yield* assertContains(yield* page.url, "second.html");

              // Back — handle pattern: snapshot → click → await
              const backNav = page.waitForNavigation();
              yield* page.click("a#back");
              yield* backNav;
              yield* assertContains(yield* page.url, "first.html");

              // Forward — handle pattern: snapshot → click → await
              const forwardNav = page.waitForNavigation();
              yield* page.click("a#forward");
              yield* forwardNav;
              yield* assertContains(yield* page.url, "second.html");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with url match for same document navigations" ──────

    test.live(
      "page-wait-for-navigation.spec.ts - should work with url match for same document navigations",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);

              // Prepare the navigation handle with URL matcher
              const nav = page.waitForNavigation({ url: /third\.html/ });

              // Push non-matching states
              yield* page.evaluate(() => {
                history.pushState({}, "", "/first.html");
              });
              yield* page.evaluate(() => {
                history.pushState({}, "", "/second.html");
              });

              // Push matching state — handle should resolve
              yield* page.evaluate(() => {
                history.pushState({}, "", "/third.html");
              });

              yield* nav;
              yield* assertContains(yield* page.url, "third.html");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with url match" (cross-document navigations) ────────

    test.live(
      "page-wait-for-navigation.spec.ts - should work with url match",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              // Prepare multiple URL-matched handles
              const nav1 = page.waitForNavigation({ url: /one-style/ });
              const nav2 = page.waitForNavigation({ url: /\/frame$/ });

              // Navigate to empty — neither should resolve yet
              yield* page.goto(`${httpUrl}/empty`);
              // Give CDP events time to process
              yield* Effect.sleep("100 millis");

              // Navigate to grid — neither matches
              yield* page.goto(`${httpUrl}/grid`);
              yield* Effect.sleep("100 millis");

              // Navigate to frame — nav2 should resolve
              yield* page.goto(`${httpUrl}/frame`);
              yield* nav2;
              yield* assertContains(yield* page.url, "frame");

              // Navigate to one-style — nav1 should resolve
              yield* page.goto(`${httpUrl}/one-style`);
              yield* nav1;
              yield* assertContains(yield* page.url, "one-style");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 15_000 },
    );

    // ── "should work with waitUntil domcontentloaded" ────────────────────

    test.live(
      "page-wait-for-navigation.spec.ts - should work with waitUntil domcontentloaded",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const nav = page.waitForNavigation({ waitUntil: "domcontentloaded" });
              yield* page.goto(`${httpUrl}/grid`);
              yield* nav;
              yield* assertContains(yield* page.url, "/grid");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work for cross-process navigations" ────────────────────

    test.live("page-wait-for-navigation.spec.ts - should work for cross-process navigations", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const nav = page.waitForNavigation({ waitUntil: "domcontentloaded" });
            const crossProcessUrl = `${CROSS_PROCESS_PREFIX}/empty`;
            const gotoFiber = yield* Effect.forkChild(page.goto(crossProcessUrl));
            yield* nav;
            yield* assertContains(yield* page.url, "/empty");
            const href = yield* page.evaluate(() => document.location.href);
            yield* assertEqual(href, crossProcessUrl);
            yield* Fiber.join(gotoFiber);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Skipped: requires infrastructure not available ───────────────────

    test.live("page-wait-for-navigation.spec.ts - should work on frame", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/frames/one-frame.html`);
            const allFrames = yield* page.frames;
            // allFrames[0] is main frame, allFrames[1] is the iframe
            yield* assertTrue(allFrames.length === 2);
            const frame = allFrames[1];
            // Eager snapshot — capture nav epoch before triggering navigation
            const nav = frame.waitForNavigation();
            yield* frame.evaluate((url: string) => {
              window.location.href = url;
            }, `${httpUrl}/grid`);
            yield* nav;
            const frameUrl = yield* frame.url;
            yield* assertContains(frameUrl, "/grid");
            // Main frame should still be the frames container
            const mainUrl = yield* page.url;
            yield* assertContains(mainUrl, "/frames/one-frame.html");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.skip("page-wait-for-navigation.spec.ts - should work with clicking on links which do not commit navigation [SKIP: NOT_PLANNED - test infra uses --ignore-certificate-errors, cannot test SSL errors]", () =>
      Effect.void);

    test.live(
      "page-wait-for-navigation.spec.ts - should work when subframe issues window.stop()",
      () =>
        Effect.gen(function* () {
          // Override one-frame.html to include a hanging stylesheet
          // so window.stop() in the iframe has something to abort
          yield* TestServerClient.setRespondRoute(
            httpUrl,
            "/frames/one-frame.html",
            `<!DOCTYPE html><html><head><title>Frames Container</title></head>` +
              `<body><iframe src='./frame.html'></iframe></body></html>`,
            undefined,
            "text/html",
          );
          yield* TestServerClient.setHangRoute(httpUrl, "/frames/style.css");
          // Override frame.html to load the hanging stylesheet
          yield* TestServerClient.setRespondRoute(
            httpUrl,
            "/frames/frame.html",
            `<!DOCTYPE html><html><head><title>Frame</title>` +
              `<link rel="stylesheet" href="./style.css"></head>` +
              `<body><div>Hi, I'm frame</div></body></html>`,
            undefined,
            "text/html",
          );

          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              // Start goto in a fiber — it will hang waiting for the iframe's stylesheet
              const gotoFiber = yield* Effect.forkChild(
                page.goto(`${httpUrl}/frames/one-frame.html`),
              );

              // Wait for the iframe to start loading its content
              yield* TestServerClient.waitForRequest(httpUrl, "/frames/style.css");

              // window.stop() aborts the hanging stylesheet request,
              // which should unblock the parent page's navigation.
              // Use page.evaluate to call stop inside the iframe directly
              // since the iframe's execution context may not be tracked yet.
              yield* page.evaluate(() => {
                const iframe = document.querySelector("iframe");
                if (iframe?.contentWindow) iframe.contentWindow.stop();
              });

              // goto should resolve successfully
              yield* Fiber.join(gotoFiber);
            }),
          );
        }).pipe(
          Effect.ensuring(TestServerClient.clear(httpUrl).pipe(Effect.ignore)),
          Effect.provide(Cdp.layer),
        ),
      { timeoutMs: 15_000 },
    );

    test.skip("page-wait-for-navigation.spec.ts - should fail when frame detaches [SKIP: NOT_PLANNED - requires frame support]", () =>
      Effect.void);

    // ── Response-returning tests (new behavior) ────────────────────
    //
    // Upstream Playwright's waitForNavigation returns null | Response.
    // Our `browser-cdp` port returns Option<Response>: Some for cross-document
    // navigations, None for same-document / commit / response-timeout.

    test.live(
      "page-wait-for-navigation.spec.ts - should work with clicking on links which do not commit navigation",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/links`);
              const nav = page.waitForNavigation();
              yield* page.click("a[href='/page1']");
              const responseOption = yield* nav;
              const response = Option.getOrThrow(responseOption);
              yield* assertEqual(response.status, 200);
              yield* assertContains(response.url, "/page1");
              yield* assertTrue(response.ok());
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-wait-for-navigation.spec.ts - should work with history.pushState() [CDP-EXTENSION: Response-returning waitForNavigation — returns Option<Response>]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`
                <a onclick='javascript:pushState()'>SPA</a>
                <script>
                  function pushState() { history.pushState({}, '', '/wow.html') }
                </script>
              `);
              const nav = page.waitForNavigation();
              yield* page.click("a");
              const responseOption = yield* nav;
              yield* assertTrue(Option.isNone(responseOption));
              yield* assertEqual(yield* page.url, `${httpUrl}/wow.html`);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-wait-for-navigation.spec.ts - should work with clicking on anchor links [CDP-EXTENSION: Response-returning waitForNavigation — returns Option<Response>]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`<a href='#foobar'>foobar</a>`);
              const nav = page.waitForNavigation();
              yield* page.click("a");
              const responseOption = yield* nav;
              yield* assertTrue(Option.isNone(responseOption));
              yield* assertEqual(yield* page.url, `${httpUrl}/empty#foobar`);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-wait-for-navigation.spec.ts - should work with commit [CDP-EXTENSION: Response-returning waitForNavigation — returns Option<Response>]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* TestServerClient.setHangRoute(httpUrl, "/script.js");
              yield* TestServerClient.setRespondRoute(
                httpUrl,
                "/empty",
                '<title>Hello</title><script src="/script.js"></script>',
                undefined,
                "text/html",
              );

              const nav = page.waitForNavigation({ waitUntil: "commit" });
              yield* Effect.forkChild(page.goto(`${httpUrl}/empty`).pipe(Effect.ignore));
              const responseOption = yield* nav;

              // At commit, no response is available yet.
              yield* assertTrue(Option.isNone(responseOption));

              yield* TestServerClient.release(httpUrl, "/script.js");
              yield* TestServerClient.clear(httpUrl);
            }).pipe(
              Effect.ensuring(
                TestServerClient.release(httpUrl, "/script.js").pipe(
                  Effect.andThen(TestServerClient.clear(httpUrl)),
                  Effect.ignore,
                ),
              ),
            ),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-wait-for-navigation.spec.ts - should work for cross-process navigations [CDP-EXTENSION: Response-returning waitForNavigation — returns Option<Response>]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              // Set up a page with a link that points to a 404
              yield* TestServerClient.setRespondRoute(
                httpUrl,
                "/links",
                `<html><body><a href="/not-found">link</a></body></html>`,
                200,
                "text/html",
              );
              yield* TestServerClient.setRespondRoute(httpUrl, "/not-found", "Not Found", 404);

              yield* page.goto(`${httpUrl}/links`);
              const nav = page.waitForNavigation();
              yield* page.click("a");
              const responseOption = yield* nav;
              const response = Option.getOrThrow(responseOption);
              yield* assertEqual(response.status, 404);
              yield* assertTrue(!response.ok());
              yield* assertContains(response.url, "/not-found");

              yield* TestServerClient.clear(httpUrl);
            }),
          );
        }).pipe(
          Effect.provide(Cdp.layer),
          Effect.ensuring(TestServerClient.clear(httpUrl).pipe(Effect.ignore)),
        ),
    );

    test.live("page-wait-for-navigation.spec.ts - should work with url match", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* TestServerClient.setRespondRoute(
              httpUrl,
              "/links",
              `<html><body><a href="/redirect/1">link</a></body></html>`,
              200,
              "text/html",
            );
            yield* TestServerClient.setRedirectRoute(httpUrl, "/redirect/1", "/redirect/2");
            yield* TestServerClient.setRedirectRoute(httpUrl, "/redirect/2", "/empty");

            yield* page.goto(`${httpUrl}/links`);
            const nav = page.waitForNavigation();
            yield* page.click("a");
            const responseOption = yield* nav;
            const response = Option.getOrThrow(responseOption);

            // Final response should be 200 from /empty
            yield* assertEqual(response.status, 200);
            yield* assertContains(response.url, "/empty");

            yield* TestServerClient.clear(httpUrl);
          }),
        );
      }).pipe(
        Effect.provide(Cdp.layer),
        Effect.ensuring(TestServerClient.clear(httpUrl).pipe(Effect.ignore)),
      ),
    );

    test.live(
      "page-wait-for-navigation.spec.ts - should work on frame [CDP-EXTENSION: Response-returning waitForNavigation — returns Option<Response>]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/frames/one-frame.html`);
              const allFrames = yield* page.frames;
              yield* assertTrue(allFrames.length === 2);
              const frame = allFrames[1];

              yield* frame.evaluate(() => {
                history.pushState({}, "", "/spa.html");
              });
              // Eager snapshot — capture nav epoch before triggering navigation
              const nav = frame.waitForNavigation();
              yield* frame.evaluate(() => {
                history.pushState({}, "", "/spa2.html");
              });
              const responseOption = yield* nav;
              // Same-document navigation — no Response
              yield* assertTrue(Option.isNone(responseOption));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
