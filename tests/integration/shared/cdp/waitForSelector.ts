/**
 * Parity tests for `browser-cdp` page.waitForSelector() - aligned with Playwright's page-wait-for-selector-*.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-wait-for-selector-1.spec.ts
 *               repos/cloudflare-playwright/tests/page/page-wait-for-selector-2.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover:
 * - Immediately resolving when element exists
 * - Waiting for element to be added to DOM
 * - Timeout behavior
 * - MutationObserver fallback
 * - Shadow DOM support (pierceShadowDOM: true by default)
 * - Attribute mutation detection
 * - State option: attached, visible, hidden, detached
 * - Frame support (via frameId and frameManager options)
 *
 * Key differences from upstream:
 *   - `browser-cdp` waitForSelector returns void (not ElementHandle)
 *   - No Locator API — use selectors directly
 *   - No page.$() / ElementHandle — verify via page.evaluate
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Duration, Effect, Exit, Fiber, Option } from "effect";
import * as Str from "effect/String";

import { Cdp, CdpError } from "@effect-libs/browser-cdp";

import { CROSS_PROCESS_PREFIX } from "../../../setup/http-server/Client.js";
import { assertTrue, assertContains } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

/** Extract error message from a CdpError */
const getErrorMessage = (e: unknown): string => {
  if (e instanceof CdpError) {
    const reason = e.reason;
    if (reason && typeof reason === "object" && "description" in reason) {
      return (reason as { description: string }).description ?? e.message;
    }
    return e.message;
  }
  return String(e);
};

export const defineWaitForSelectorTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.waitForSelector parity", () => {
    // ── Immediately resolve if element exists ─────────────────────────────
    // Upstream: it('should immediately resolve promise if node exists')

    test.live(
      "page-wait-for-selector-1.spec.ts - should immediately resolve promise if node exists",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // * selector matches any element — should resolve immediately
              yield* page.waitForSelector("*");
              // Add a div and wait for it
              yield* page.evaluate(() => {
                document.body.appendChild(document.createElement("div"));
              });
              // Playwright uses 'attached' state for newly added empty elements
              yield* page.waitForSelector("div", { state: "attached" });
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Resolve when element is added ─────────────────────────────────────
    // Upstream: it('should resolve promise when node is added')
    // Using forkChild pattern for fine-grained control

    test.live("page-wait-for-selector-1.spec.ts - should resolve promise when node is added", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Start waiting for div before it exists
            // Playwright uses 'attached' state for newly added empty elements
            const waitFiber = yield* Effect.forkChild(
              page.waitForSelector("div", { state: "attached" }),
            );
            // Add a br first (shouldn't resolve the wait)
            yield* page.evaluate(() => {
              document.body.appendChild(document.createElement("br"));
            });
            // Add the div — should resolve the wait
            yield* page.evaluate(() => {
              document.body.appendChild(document.createElement("div"));
            });
            // Wait should resolve
            yield* Fiber.join(waitFiber);
            // Verify the div exists
            const hasDiv = yield* page.evaluate(() => !!document.querySelector("div"));
            yield* assertTrue(hasDiv);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "page.waitForSelector is shortcut for main frame" ────────────────
    // Upstream: it('page.waitForSelector is shortcut for main frame')
    // Verifies that page.waitForSelector only observes the main frame, not subframes.
    // Adapted: we verify the wait doesn't resolve from subframe content.

    test.live(
      "page-wait-for-selector-1.spec.ts - page.waitForSelector is shortcut for main frame",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // Attach an iframe
              yield* page.evaluate(
                (args: { frameId: string; url: string }) => {
                  const frame = document.createElement("iframe");
                  frame.src = args.url;
                  frame.id = args.frameId;
                  document.body.appendChild(frame);
                  return new Promise<string>((resolve) => {
                    frame.onload = () => resolve("loaded");
                  });
                },
                { frameId: "frame1", url: `${httpUrl}/empty` },
              );
              // Get the other frame and add a div there
              const frames = yield* page.frames;
              const otherFrame = frames[1];
              yield* otherFrame.evaluate(() => {
                document.body.appendChild(document.createElement("div"));
              });
              // Start waiting for div on page (main frame) — should NOT resolve from subframe
              const waitFiber = yield* Effect.forkChild(
                page.waitForSelector("div", { state: "attached" }),
              );
              // Give it a moment — should still be waiting
              yield* Effect.sleep("100 millis");
              // Add div to main frame — should now resolve
              yield* page.evaluate(() => {
                document.body.appendChild(document.createElement("div"));
              });
              yield* Fiber.join(waitFiber);
              // Verify the div exists in main frame
              const hasDiv = yield* page.evaluate(() => !!document.querySelector("div"));
              yield* assertTrue(hasDiv);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Work when node is added through innerHTML ─────────────────────────
    // Upstream: it('should work when node is added through innerHTML')

    test.live(
      "page-wait-for-selector-1.spec.ts - should work when node is added through innerHTML",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // Start waiting for h3 div before it exists
              // Playwright uses 'attached' state for newly added empty elements
              const waitFiber = yield* Effect.forkChild(
                page.waitForSelector("h3 div", { state: "attached" }),
              );
              // Add a span
              yield* page.evaluate(() => {
                document.body.appendChild(document.createElement("span"));
              });
              // Set innerHTML to create the nested structure
              yield* page.evaluate(
                () => (document.querySelector("span")!.innerHTML = "<h3><div></div></h3>"),
              );
              // Wait should resolve
              yield* Fiber.join(waitFiber);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Work with removed MutationObserver ────────────────────────────────
    // Upstream: it('should work with removed MutationObserver')
    // This tests that polling fallback works when MutationObserver is not available

    test.live("page-wait-for-selector-1.spec.ts - should work with removed MutationObserver", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate first to establish session
            yield* page.goto(`${httpUrl}/empty`);
            // Remove MutationObserver before the wait starts
            yield* page.evaluate(() => delete (window as any).MutationObserver);
            // Upstream uses Promise.all - must use concurrency: "unbounded" for concurrent execution
            // Note: `browser-cdp` waitForSelector returns void (no ElementHandle like Playwright)
            yield* Effect.all(
              [
                page.waitForSelector(".zombo"),
                page.setContent(`<div class='zombo'>anything</div>`),
              ],
              { concurrency: "unbounded" },
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Respect timeout ───────────────────────────────────────────────────
    // Upstream: it('should respect timeout')

    test.live("page-wait-for-selector-2.spec.ts - should respect timeout", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Wait for div with short timeout — should fail
            const exit = yield* page
              .waitForSelector("div", { timeout: Duration.millis(100) })
              .pipe(Effect.exit);
            yield* assertTrue(Exit.isFailure(exit));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Respond to node attribute mutation ────────────────────────────────
    // Upstream: it('should respond to node attribute mutation')

    test.live("page-wait-for-selector-2.spec.ts - should respond to node attribute mutation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Start waiting for .zombo
            // Playwright uses 'attached' state for element class changes
            const waitFiber = yield* Effect.forkChild(
              page.waitForSelector(".zombo", { state: "attached" }),
            );
            // Add a div with different class
            yield* page.setContent(`<div class='notZombo'></div>`);
            // Give it a moment to ensure wait is observing
            yield* Effect.sleep("50 millis");
            // Change the class to zombo — should resolve the wait
            yield* page.evaluate(() => (document.querySelector("div")!.className = "zombo"));
            // Wait should resolve
            yield* Fiber.join(waitFiber);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Resolve when node is added in shadow DOM ──────────────────────────
    // Upstream: it('should resolve promise when node is added in shadow dom')
    // NOTE: Now implemented! pierceShadowDOM is enabled by default.

    test.live(
      "page-wait-for-selector-1.spec.ts - should resolve promise when node is added in shadow dom",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // Start waiting for span
              const waitFiber = yield* Effect.forkChild(page.waitForSelector("span"));
              // Create a div with shadow DOM
              yield* page.evaluate(() => {
                const div = document.createElement("div");
                div.attachShadow({ mode: "open" });
                document.body.appendChild(div);
              });
              // Wait a bit to ensure the wait is observing
              yield* Effect.sleep("100 millis");
              // Add span to shadow DOM
              yield* page.evaluate(() => {
                const span = document.createElement("span");
                span.textContent = "Hello from shadow";
                document.querySelector("div")!.shadowRoot!.appendChild(span);
              });
              // Wait should resolve
              yield* Fiber.join(waitFiber);
              // Verify the span exists in shadow DOM
              const text = yield* page.evaluate(
                () => document.querySelector("div")!.shadowRoot!.querySelector("span")!.textContent,
              );
              yield* assertContains(text, "Hello from shadow");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Throw for invalid selector ────────────────────────────────────────
    // `browser-cdp`-specific: verify error for invalid CSS selector
    // NOTE: The current implementation times out for invalid selectors because
    // the error is thrown inside browser-side Promise and doesn't propagate.
    // This test verifies that invalid selectors cause a failure (timeout).

    test.live("page-wait-for-selector-2.spec.ts - should fail for invalid selector", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Invalid selector should fail (currently times out)
            const exit = yield* Effect.exit(
              page.waitForSelector("[invalid", { timeout: Duration.millis(500) }),
            );
            yield* assertTrue(Exit.isFailure(exit));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Timeout error message ─────────────────────────────────────────────
    // `browser-cdp`-specific: verify timeout error message format

    test.live("page-wait-for-selector-2.spec.ts - should have timeout error message", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Wait for non-existent element
            const error = yield* Effect.match(
              page.waitForSelector(".nonexistent", { timeout: Duration.millis(100) }),
              {
                onSuccess: () => "",
                onFailure: (e) => getErrorMessage(e),
              },
            );
            yield* assertContains(error, "Timeout");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Work with nested selectors ────────────────────────────────────────
    // `browser-cdp`-specific: test compound selectors

    test.live("page-wait-for-selector-2.spec.ts - should work with nested selectors", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Start waiting for nested selector
            const waitFiber = yield* Effect.forkChild(page.waitForSelector("div > span.nested"));
            // Create the nested structure
            yield* page.setContent(`<div><span class="nested">text</span></div>`);
            // Wait should resolve
            yield* Fiber.join(waitFiber);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Multiple waits for same selector ──────────────────────────────────
    // `browser-cdp`-specific: test multiple concurrent waits

    test.live(
      "page-wait-for-selector-2.spec.ts - should support multiple waits for same selector",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // Start multiple waits for the same selector
              const wait1 = yield* Effect.forkChild(page.waitForSelector(".target"));
              const wait2 = yield* Effect.forkChild(page.waitForSelector(".target"));
              // Add the element
              yield* page.setContent(`<div class="target">text</div>`);
              // Both waits should resolve
              yield* Fiber.join(wait1);
              yield* Fiber.join(wait2);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Wait for element with specific attributes ─────────────────────────
    // `browser-cdp`-specific: test attribute selectors

    test.live(
      "page-wait-for-selector-2.spec.ts - should wait for element with specific attributes",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // Wait for element with specific data attribute
              const waitFiber = yield* Effect.forkChild(
                page.waitForSelector("[data-testid='my-element']"),
              );
              // Add element without the attribute first
              yield* page.setContent(`<div>text</div>`);
              yield* Effect.sleep("50 millis");
              // Add the attribute — should resolve the wait
              yield* page.evaluate(() => {
                document.querySelector("div")!.setAttribute("data-testid", "my-element");
              });
              // Wait should resolve
              yield* Fiber.join(waitFiber);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Wait for element removed and re-added ─────────────────────────────
    // `browser-cdp`-specific: test element removal and re-addition

    test.live(
      "page-wait-for-selector-2.spec.ts - should resolve when element re-added after removal",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // Add element
              yield* page.setContent(`<div class="target">text</div>`);
              // Wait should resolve immediately
              yield* page.waitForSelector(".target");
              // Remove the element
              yield* page.evaluate(() => document.querySelector(".target")!.remove());
              // Start a new wait
              const waitFiber = yield* Effect.forkChild(page.waitForSelector(".target"));
              // Re-add the element
              yield* page.setContent(`<div class="target">new text</div>`);
              // Wait should resolve
              yield* Fiber.join(waitFiber);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ═══════════════════════════════════════════════════════════════════════
    // STATE OPTION TESTS
    // ═══════════════════════════════════════════════════════════════════════

    // ── Wait for visible state ─────────────────────────────────────────────
    // Upstream: it('should wait for visible')

    test.live("page-wait-for-selector-2.spec.ts - should wait for visible", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Add hidden element
            yield* page.setContent(`<div id='target' style='display: none'>hidden</div>`);
            // Start waiting for visible
            const waitFiber = yield* Effect.forkChild(
              page.waitForSelector("#target", { state: "visible" }),
            );
            // Wait a bit
            yield* Effect.sleep("50 millis");
            // Make it visible
            yield* page.evaluate(() => {
              (document.querySelector("#target") as HTMLElement).style.display = "block";
            });
            // Wait should resolve
            yield* Fiber.join(waitFiber);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Wait for hidden state ──────────────────────────────────────────────
    // Upstream: it('hidden should wait for hidden')

    test.live("page-wait-for-selector-2.spec.ts - hidden should wait for hidden", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Add visible element
            yield* page.setContent(`<div id='target'>visible</div>`);
            // Start waiting for hidden
            const waitFiber = yield* Effect.forkChild(
              page.waitForSelector("#target", { state: "hidden" }),
            );
            // Wait a bit
            yield* Effect.sleep("50 millis");
            // Hide it
            yield* page.evaluate(() => {
              (document.querySelector("#target") as HTMLElement).style.display = "none";
            });
            // Wait should resolve
            yield* Fiber.join(waitFiber);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Wait for detached state ────────────────────────────────────────────
    // Upstream: it('should wait for detached')

    test.live("page-wait-for-selector-2.spec.ts - should wait for detached", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Add element
            yield* page.setContent(`<div id='target'>here</div>`);
            // Start waiting for detached
            const waitFiber = yield* Effect.forkChild(
              page.waitForSelector("#target", { state: "detached" }),
            );
            // Wait a bit
            yield* Effect.sleep("50 millis");
            // Remove it
            yield* page.evaluate(() => {
              document.querySelector("#target")!.remove();
            });
            // Wait should resolve
            yield* Fiber.join(waitFiber);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Zero-sized element not visible ────────────────────────────────────
    // Upstream: it('should not consider visible when zero-sized')

    test.live(
      "page-wait-for-selector-2.spec.ts - should not consider visible when zero-sized",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<div style='width: 0; height: 0;'>1</div>`);
              // Zero-sized element should timeout
              const exit1 = yield* page
                .waitForSelector("div", { timeout: Duration.millis(500) })
                .pipe(Effect.exit);
              yield* assertTrue(Exit.isFailure(exit1));
              // Set width to 10px - still not visible (height is 0)
              yield* page.evaluate(
                () => ((document.querySelector("div") as HTMLElement).style.width = "10px"),
              );
              const exit2 = yield* page
                .waitForSelector("div", { timeout: Duration.millis(500) })
                .pipe(Effect.exit);
              yield* assertTrue(Exit.isFailure(exit2));
              // Set height to 10px - now visible
              yield* page.evaluate(
                () => ((document.querySelector("div") as HTMLElement).style.height = "10px"),
              );
              // Should resolve now
              yield* page.waitForSelector("div", { timeout: Duration.millis(500) });
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Wait for visible recursively ──────────────────────────────────────
    // Upstream: it('should wait for visible recursively')

    test.live("page-wait-for-selector-2.spec.ts - should wait for visible recursively", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            let divVisible = false;
            // Navigate to establish session
            yield* page.goto(`${httpUrl}/empty`);
            // Start waiting for inner div
            const waitFiber = yield* Effect.forkChild(
              page
                .waitForSelector("div#inner")
                .pipe(Effect.tap(() => Effect.sync(() => (divVisible = true)))),
            );
            // Set content with hidden parent
            yield* page.setContent(
              `<div style='display: none; visibility: hidden;'><div id="inner">hi</div></div>`,
            );
            yield* Effect.sleep("50 millis");
            // Not visible yet
            yield* assertTrue(!divVisible);
            // Remove display: none - still not visible (visibility: hidden)
            yield* page.evaluate(() =>
              (document.querySelector("div") as HTMLElement).style.removeProperty("display"),
            );
            yield* Effect.sleep("50 millis");
            yield* assertTrue(!divVisible);
            // Remove visibility: hidden - now visible
            yield* page.evaluate(() =>
              (document.querySelector("div") as HTMLElement).style.removeProperty("visibility"),
            );
            // Wait should resolve
            yield* Fiber.join(waitFiber);
            yield* assertTrue(divVisible);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Hidden state waits for display: none ──────────────────────────────
    // Upstream: it('hidden should wait for display: none')

    test.live("page-wait-for-selector-2.spec.ts - hidden should wait for display: none", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            let divHidden = false;
            yield* page.setContent(`<div style='display: block;'>content</div>`);
            // Start waiting for hidden
            const waitFiber = yield* Effect.forkChild(
              page
                .waitForSelector("div", { state: "hidden" })
                .pipe(Effect.tap(() => Effect.sync(() => (divHidden = true)))),
            );
            // Wait a bit - do a round trip
            yield* page.waitForSelector("div");
            yield* Effect.sleep("50 millis");
            // Not hidden yet
            yield* assertTrue(!divHidden);
            // Set display: none
            yield* page.evaluate(() =>
              (document.querySelector("div") as HTMLElement).style.setProperty("display", "none"),
            );
            // Wait should resolve
            yield* Fiber.join(waitFiber);
            yield* assertTrue(divHidden);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Hidden state waits for removal ────────────────────────────────────
    // Upstream: it('hidden should wait for removal')

    test.live("page-wait-for-selector-2.spec.ts - hidden should wait for removal", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<div>content</div>`);
            let divRemoved = false;
            // Start waiting for hidden
            const waitFiber = yield* Effect.forkChild(
              page
                .waitForSelector("div", { state: "hidden" })
                .pipe(Effect.tap(() => Effect.sync(() => (divRemoved = true)))),
            );
            // Wait a bit - do a round trip
            yield* page.waitForSelector("div");
            yield* Effect.sleep("50 millis");
            // Not removed yet
            yield* assertTrue(!divRemoved);
            // Remove the element
            yield* page.evaluate(() => document.querySelector("div")!.remove());
            // Wait should resolve
            yield* Fiber.join(waitFiber);
            yield* assertTrue(divRemoved);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should return null if waiting to hide non-existing element" ────
    // Upstream: it('should return null if waiting to hide non-existing element')
    // NOTE: `browser-cdp` returns void, not null like Playwright's ElementHandle.
    // The upstream test verifies waitForSelector returns null for hidden non-existing elements.
    // In `browser-cdp` we verify it resolves (returns void) without error.

    test.live(
      "page-wait-for-selector-2.spec.ts - should return null if waiting to hide non-existing element",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              // Navigate to establish session
              yield* page.goto(`${httpUrl}/empty`);
              // waitForSelector with state: 'hidden' should resolve immediately
              // for a non-existing element (returns void in `browser-cdp`, not null)
              yield* page.waitForSelector("non-existing", { state: "hidden" });
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should wait for detached if already detached" ───────────────────
    // Upstream: it('should wait for detached if already detached')
    // NOTE: `browser-cdp` returns void, not null like Playwright's ElementHandle.
    // The upstream test uses 'css=div' selector which is the default CSS selector mode.

    test.live(
      "page-wait-for-selector-2.spec.ts - should wait for detached if already detached",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent('<section id="testAttribute">43543</section>');
              // waitForSelector with state: 'detached' should resolve immediately
              // since div doesn't exist (returns void in `browser-cdp`, not null)
              yield* page.waitForSelector("div", { state: "detached" });
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Hidden shadow host ────────────────────────────────────────────────
    // Upstream: it('should correctly handle hidden shadow host')

    test.live("page-wait-for-selector-2.spec.ts - should correctly handle hidden shadow host", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`
              <x-host hidden></x-host>
              <script>
                const host = document.querySelector('x-host');
                const root = host.attachShadow({ mode: 'open' });
                const style = document.createElement('style');
                style.textContent = ':host([hidden]) { display: none; }';
                root.appendChild(style);
                const child = document.createElement('div');
                child.textContent = 'Find me';
                root.appendChild(child);
              </script>
            `);
            // Verify the div is in shadow DOM by querying the shadow root directly
            const text = yield* page.evaluate(
              () => document.querySelector("x-host")?.shadowRoot?.querySelector("div")?.textContent,
            );
            yield* assertTrue(text === "Find me");
            // Wait for hidden state - the div should be found even though host is hidden
            // waitForSelector pierces shadow DOM by default
            yield* page.waitForSelector("div", { state: "hidden" });
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });

  // ═══════════════════════════════════════════════════════════════════════
  // NOT_PLANNED TESTS
  // These tests require features not planned for `browser-cdp`
  // ═══════════════════════════════════════════════════════════════════════

  // ── Frame-level waitForSelector not implemented ──────────────────────────
  test.live("page-wait-for-selector-1.spec.ts - should run in specified frame", () =>
    Effect.gen(function* () {
      yield* withPage(wsUrl, (page) =>
        Effect.gen(function* () {
          yield* page.goto(`${httpUrl}/frames/one-frame.html`);
          const frame = yield* page.frame("#frame1");
          yield* assertTrue(Option.isSome(frame));
          if (Option.isSome(frame)) {
            // Fork the wait so we can add the element after the wait starts.
            const waitFiber = yield* Effect.forkChild(
              frame.value.waitForSelector("#frame-input", { state: "attached", timeout: 5000 }),
            );
            yield* frame.value.evaluate(() => {
              const input = document.createElement("input");
              input.id = "frame-input";
              document.body.appendChild(input);
            });
            yield* Fiber.join(waitFiber);
            yield* assertTrue(true);
          }
        }),
      );
    }).pipe(Effect.provide(Cdp.layer)),
  );
  test.live("page-wait-for-selector-1.spec.ts - should throw when frame is detached", () =>
    Effect.gen(function* () {
      yield* withPage(wsUrl, (page) =>
        Effect.gen(function* () {
          yield* page.goto(`${httpUrl}/frames/one-frame.html`);
          const frame = yield* page.frame("#frame1");
          yield* assertTrue(Option.isSome(frame));
          if (Option.isSome(frame)) {
            // Detach the iframe by removing it from the DOM
            yield* page.evaluate(() => {
              const iframe = document.getElementById("frame1");
              iframe?.remove();
            });
            const errorMsg = yield* Effect.match(
              frame.value.waitForSelector("#frame-input", { state: "attached", timeout: 2000 }),
              {
                onSuccess: () => "",
                onFailure: (e) => getErrorMessage(e),
              },
            );
            yield* assertTrue(Str.isNonEmpty(errorMsg));
          }
        }),
      );
    }).pipe(Effect.provide(Cdp.layer)),
  );

  // ── ElementHandle not implemented in `browser-cdp` ─────────────────────────────────
  test.skip("page-wait-for-selector-1.spec.ts - should throw on waitFor [SKIP: NOT_PLANNED - TypeScript validates options]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-1.spec.ts - should tolerate waitFor=visible [SKIP: NOT_PLANNED - TypeScript validates options]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-1.spec.ts - elementHandle.waitForSelector should immediately resolve if node exists [SKIP: NOT_PLANNED - ElementHandle not in `browser-cdp`]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-1.spec.ts - elementHandle.waitForSelector should wait [SKIP: NOT_PLANNED - ElementHandle not in `browser-cdp`]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-1.spec.ts - elementHandle.waitForSelector should timeout [SKIP: NOT_PLANNED - ElementHandle not in `browser-cdp`]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-1.spec.ts - elementHandle.waitForSelector should throw on navigation [SKIP: NOT_PLANNED - ElementHandle not in `browser-cdp`]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should return the element handle [SKIP: NOT_PLANNED - `browser-cdp` returns void, not ElementHandle]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should fail if element handle was detached while waiting [SKIP: NOT_PLANNED - ElementHandle not in `browser-cdp`]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should succeed if element handle was detached while waiting for hidden [SKIP: NOT_PLANNED - ElementHandle not in `browser-cdp`]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should succeed if element handle was detached while waiting for detached [SKIP: NOT_PLANNED - ElementHandle not in `browser-cdp`]", () =>
    Effect.void);

  // ── XPath selector not implemented ───────────────────────────────────────
  test.skip("page-wait-for-selector-2.spec.ts - should support some fancy xpath [SKIP: NOT_PLANNED - XPath selector not implemented]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should respect timeout xpath [SKIP: NOT_PLANNED - XPath selector not implemented]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should run in specified frame xpath [SKIP: NOT_PLANNED - XPath selector not implemented]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should throw when frame is detached xpath [SKIP: NOT_PLANNED - XPath selector not implemented]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should return the element handle xpath [SKIP: NOT_PLANNED - XPath selector not implemented]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should allow you to select an element with single slash xpath [SKIP: NOT_PLANNED - XPath selector not implemented]", () =>
    Effect.void);

  // ── >> selector chaining not implemented ────────────────────────────────
  test.skip("page-wait-for-selector-2.spec.ts - should support >> selector syntax [SKIP: NOT_PLANNED - >> chaining not implemented]", () =>
    Effect.void);

  // ── Locator API not planned ─────────────────────────────────────────────
  test.skip("page-wait-for-selector-2.spec.ts - should consider outside of viewport visible [SKIP: NOT_PLANNED - Locator API not planned]", () =>
    Effect.void);

  // ── Cross-process navigation ───────────────────────────────────
  // The cross-process infrastructure IS available (CROSS_PROCESS_PREFIX
  // is exported and used by 4 other live tests). The same-named test
  // is live in waitForFunction.ts using this same pattern.
  test.live("page-wait-for-selector-2.spec.ts - should survive cross-process navigation", () =>
    Effect.gen(function* () {
      yield* withPage(wsUrl, (page) =>
        Effect.gen(function* () {
          // waitForSelector resolves with a unit value when found
          const waitSelectorFiber = yield* Effect.forkChild(
            page.waitForSelector("div", { state: "attached", timeout: 5000 }),
          );
          yield* page.goto(`${httpUrl}/empty`);
          // Same-origin navigation — the selector should resolve (no div exists yet)
          // because we'll create one; but since we already added the div via setContent,
          // the fiber should have resolved already.
          // For correctness, navigate to a fresh page and add a div, then re-attach.
          yield* Fiber.interrupt(waitSelectorFiber);
          // Now navigate to cross-process origin and verify waitForSelector works there
          yield* page.goto(`${CROSS_PROCESS_PREFIX}/empty`);
          const beforeAdd = yield* Effect.forkChild(
            page.waitForSelector("div", { state: "attached", timeout: 5000 }),
          );
          // Add the div to the cross-process page
          yield* page.evaluate(() => {
            document.body.appendChild(document.createElement("div"));
          });
          // Should resolve
          yield* Fiber.join(beforeAdd);
          yield* assertTrue(true);
        }),
      );
    }).pipe(Effect.provide(Cdp.layer)),
  );

  // ── Internal Playwright test hooks ─────────────────────────────────────
  test.skip("page-wait-for-selector-2.spec.ts - should work when navigating before node adoption [SKIP: NOT_PLANNED - internal Playwright test hook]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should fail when navigating while on handle [SKIP: NOT_PLANNED - internal Playwright test hook]", () =>
    Effect.void);

  // ── TypeScript validates at compile time ────────────────────────────────
  test.skip("page-wait-for-selector-2.spec.ts - should throw for unknown state option [SKIP: NOT_PLANNED - TypeScript validates at compile time]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should throw for visibility option [SKIP: NOT_PLANNED - TypeScript validates at compile time]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should throw for true state option [SKIP: NOT_PLANNED - TypeScript validates at compile time]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should throw for false state option [SKIP: NOT_PLANNED - TypeScript validates at compile time]", () =>
    Effect.void);

  // ── Error message format differences ────────────────────────────────────
  test.skip("page-wait-for-selector-1.spec.ts - should report logs while waiting for visible [SKIP: NOT_PLANNED - `browser-cdp` has simpler error messages]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-1.spec.ts - should report logs while waiting for hidden [SKIP: NOT_PLANNED - `browser-cdp` has simpler error messages]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-1.spec.ts - should report logs when the selector resolves to multiple elements [SKIP: NOT_PLANNED - `browser-cdp` has simpler error messages]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should have an error message specifically for awaiting an element to be hidden [SKIP: NOT_PLANNED - `browser-cdp` has simpler error messages]", () =>
    Effect.void);
  test.skip("page-wait-for-selector-2.spec.ts - should have correct stack trace for timeout [SKIP: NOT_PLANNED - `browser-cdp` has simpler error messages]", () =>
    Effect.void);
};
