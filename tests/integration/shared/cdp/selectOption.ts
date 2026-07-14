/**
 * Parity tests for `browser-cdp` page.selectOption() - aligned with Playwright's page-select-option.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-select-option.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover:
 * - Basic selectOption by value, label, index
 * - Single vs multiple select behavior
 * - Event firing (input, change, bubbling)
 * - Error handling (not a select element, no match)
 * - Return values (array of selected option values)
 * - Deselect behavior (null, empty array)
 *
 * Key differences from upstream:
 *   - `browser-cdp` selectOption uses evaluateUtilityWorld (no auto-wait for actionability)
 *   - No ElementHandle API — cannot select by element handle (page.$())
 *   - No Locator API — use selectors directly
 *   - Effect fibers replace Promise.all for concurrent operations
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   Requires ElementHandle API (not planned for `browser-cdp`):
 *     - "should select single option by handle"
 *
 *   Requires actionability waiting (not implemented in `browser-cdp` selectOption):
 *     - "should wait for option to be present"
 *     - "should wait for option index to be present"
 *     - "should wait for multiple options to be present"
 *     - "should wait for select to be enabled"
 *     - "should wait for option to be enabled"
 *     - "should wait for optgroup to be enabled"
 *     - "should wait for select to be swapped"
 *
 *   Requires shadow DOM setup (complex fixture):
 *     - "input event.composed should be true and cross shadow dom boundary" — NOW IMPLEMENTED
 *
 *   Runtime type validation (TS prevents at compile time, not runtime focus):
 *     - "should throw if passed wrong types" — partial coverage via error tests
 *     - "should not allow null items" — TS prevents null in array
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect } from "effect";

import { Cdp, CdpError, SelectorError } from "@effect-libs/browser-cdp";

import {
  assertEqual,
  assertContains,
  assertDeepEqual,
} from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

/** Extract error description from a CdpError */
const getErrorDescription = (e: unknown): string => {
  if (e instanceof CdpError && e.reason instanceof SelectorError) {
    return e.reason.description;
  }
  return String(e);
};

export const defineSelectOptionTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.selectOption parity", () => {
    // ── Basic selectOption ──────────────────────────────────────────────────
    // Upstream: it('should select single option @smoke')

    test.live("page-select-option.spec.ts - should select single option", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            yield* page.selectOption("select", "blue");
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertDeepEqual(result.onInput, ["blue"]);
            yield* assertDeepEqual(result.onChange, ["blue"]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should select single option by value')

    test.live("page-select-option.spec.ts - should select single option by value", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            yield* page.selectOption("select", { value: "blue" });
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertDeepEqual(result.onInput, ["blue"]);
            yield* assertDeepEqual(result.onChange, ["blue"]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should fall back to selecting by label')

    test.live("page-select-option.spec.ts - should fall back to selecting by label", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            yield* page.selectOption("select", "Blue");
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertDeepEqual(result.onInput, ["blue"]);
            yield* assertDeepEqual(result.onChange, ["blue"]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should select single option by label')

    test.live("page-select-option.spec.ts - should select single option by label", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            yield* page.selectOption("select", { label: "Indigo" });
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertDeepEqual(result.onInput, ["indigo"]);
            yield* assertDeepEqual(result.onChange, ["indigo"]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should select single option by index')

    test.live("page-select-option.spec.ts - should select single option by index", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            yield* page.selectOption("select", { index: 2 });
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertDeepEqual(result.onInput, ["brown"]);
            yield* assertDeepEqual(result.onChange, ["brown"]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should select single option by multiple attributes')

    test.live(
      "page-select-option.spec.ts - should select single option by multiple attributes",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/input/select`);
              yield* page.selectOption("select", { value: "green", label: "Green" });
              const result = yield* page.evaluate(() => (window as any).result);
              yield* assertDeepEqual(result.onInput, ["green"]);
              yield* assertDeepEqual(result.onChange, ["green"]);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should not select single option when some attributes do not match')
    // Note: `browser-cdp` implementation doesn't find a match when attributes conflict,
    // and since there's no match, no selection is made. The behavior is that
    // selectOption returns empty array when no options match.

    test.live(
      "page-select-option.spec.ts - should not select single option when some attributes do not match",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/input/select`);
              yield* page.evaluate(() => {
                (document.querySelector("select") as HTMLSelectElement).value = "";
              });
              // When attributes don't match, no option is selected
              // The `browser-cdp` implementation doesn't wait for a match, it just returns empty
              const result = yield* page.selectOption("select", { value: "green", label: "Brown" });
              yield* assertDeepEqual(result, []);
              const value = yield* page.evaluate(
                () => (document.querySelector("select") as HTMLSelectElement).value,
              );
              yield* assertEqual(value, "");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should select only first option')

    test.live("page-select-option.spec.ts - should select only first option", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            yield* page.selectOption("select", ["blue", "green", "red"]);
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertDeepEqual(result.onInput, ["blue"]);
            yield* assertDeepEqual(result.onChange, ["blue"]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Multiple select ────────────────────────────────────────────────────
    // Upstream: it('should select multiple options')

    test.live("page-select-option.spec.ts - should select multiple options", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            yield* page.evaluate(() => (window as any).makeMultiple());
            yield* page.selectOption("select", ["blue", "green", "red"]);
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertDeepEqual(result.onInput, ["blue", "green", "red"]);
            yield* assertDeepEqual(result.onChange, ["blue", "green", "red"]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should select multiple options with attributes')

    test.live("page-select-option.spec.ts - should select multiple options with attributes", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            yield* page.evaluate(() => (window as any).makeMultiple());
            yield* page.selectOption("select", [
              { value: "blue" },
              { label: "Green" },
              { index: 4 },
            ]);
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertDeepEqual(result.onInput, ["blue", "gray", "green"]);
            yield* assertDeepEqual(result.onChange, ["blue", "gray", "green"]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Event bubbling ──────────────────────────────────────────────────────
    // Upstream: it('should respect event bubbling')

    test.live("page-select-option.spec.ts - should respect event bubbling", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            yield* page.selectOption("select", "blue");
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertDeepEqual(result.onBubblingInput, ["blue"]);
            yield* assertDeepEqual(result.onBubblingChange, ["blue"]);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Error handling ──────────────────────────────────────────────────────
    // Upstream: it('should throw when element is not a <select>')

    test.live("page-select-option.spec.ts - should throw when element is not a <select>", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            const error = yield* Effect.match(page.selectOption("body", ""), {
              onSuccess: () => "",
              onFailure: (e) => getErrorDescription(e),
            });
            yield* assertContains(error, "Element is not a <select> element");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Return values ───────────────────────────────────────────────────────
    // Upstream: it('should return [] on no matched values')

    test.live("page-select-option.spec.ts - should return [] on no matched values", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            const result = yield* page.selectOption("select", []);
            yield* assertDeepEqual(result, []);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should return an array of matched values')

    test.live("page-select-option.spec.ts - should return an array of matched values", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            yield* page.evaluate(() => (window as any).makeMultiple());
            const result = yield* page.selectOption("select", ["blue", "black", "magenta"]);
            // Verify all returned values are in the expected set
            yield* assertEqual(
              result.every((v) => ["blue", "black", "magenta"].includes(v)),
              true,
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should return an array of one element when multiple is not set')

    test.live(
      "page-select-option.spec.ts - should return an array of one element when multiple is not set",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/input/select`);
              const result = yield* page.selectOption("select", ["42", "blue", "black", "magenta"]);
              yield* assertEqual(result.length, 1);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should return [] on no values')

    test.live("page-select-option.spec.ts - should return [] on no values", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            const result = yield* page.selectOption("select", []);
            yield* assertDeepEqual(result, []);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Deselect behavior ───────────────────────────────────────────────────
    // Upstream: it('should unselect with null')
    // Playwright API: null unselects all options

    test.live("page-select-option.spec.ts - should unselect with null", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/select`);
            yield* page.evaluate(() => (window as any).makeMultiple());
            const result1 = yield* page.selectOption("select", ["blue", "black", "magenta"]);
            yield* assertEqual(
              result1.every((v) => ["blue", "black", "magenta"].includes(v)),
              true,
            );
            yield* page.selectOption("select", null);
            const allUnselected = yield* page.evaluate(() =>
              Array.from((document.querySelector("select") as HTMLSelectElement).options).every(
                (option) => !option.selected,
              ),
            );
            yield* assertEqual(allUnselected, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should deselect all options when passed no values for a multiple select')

    test.live(
      "page-select-option.spec.ts - should deselect all options when passed no values for a multiple select",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/input/select`);
              yield* page.evaluate(() => (window as any).makeMultiple());
              yield* page.selectOption("select", ["blue", "black", "magenta"]);
              yield* page.selectOption("select", []);
              const allUnselected = yield* page.evaluate(() =>
                Array.from((document.querySelector("select") as HTMLSelectElement).options).every(
                  (option) => !option.selected,
                ),
              );
              yield* assertEqual(allUnselected, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should deselect all options when passed no values for a select without multiple')

    test.live(
      "page-select-option.spec.ts - should deselect all options when passed no values for a select without multiple",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/input/select`);
              yield* page.selectOption("select", ["blue", "black", "magenta"]);
              yield* page.selectOption("select", []);
              const allUnselected = yield* page.evaluate(() =>
                Array.from((document.querySelector("select") as HTMLSelectElement).options).every(
                  (option) => !option.selected,
                ),
              );
              yield* assertEqual(allUnselected, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Edge cases ──────────────────────────────────────────────────────────
    // Upstream: it('should work when re-defining top-level Event class')

    test.live(
      "page-select-option.spec.ts - should work when re-defining top-level Event class",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/input/select`);
              yield* page.evaluate(() => {
                (window as any).Event = null;
              });
              yield* page.selectOption("select", "blue");
              const result = yield* page.evaluate(() => (window as any).result);
              yield* assertDeepEqual(result.onInput, ["blue"]);
              yield* assertDeepEqual(result.onChange, ["blue"]);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should not throw when select causes navigation')
    // Now implemented: callInjectedScript races CDP call against navigation detection.
    // When navigation wins the race, returns NavigationInterrupt instead of hanging.
    // The selectOption implementation handles this by returning an empty array.
    test.live("page-select-option.spec.ts - should not throw when select causes navigation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Navigate to the select page
            yield* page.goto(`${httpUrl}/input/select`);

            // Add an event listener that navigates on input
            yield* page.evaluate(() => {
              const select = document.querySelector("select");
              if (select) {
                select.addEventListener("input", () => {
                  window.location.href = "/empty";
                });
              }
            });

            // Run selectOption and waitForNavigation concurrently
            // selectOption triggers the input event which navigates
            // waitForNavigation catches the navigation
            yield* Effect.all(
              [page.selectOption("select", { value: "blue" }), page.waitForNavigation()],
              { concurrency: 2 },
            );

            // Verify we navigated to empty.html
            const pageUrl = yield* page.url;
            yield* assertContains(pageUrl, "/empty");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── NOT_PLANNED: ElementHandle API ────────────────────────────────────────
    // `browser-cdp` does not implement ElementHandle API (page.$(), page.$eval())

    test.skip("page-select-option.spec.ts - should select single option by handle [SKIP: NOT_PLANNED - ElementHandle API]", () =>
      Effect.void);

    // ── NOT_PLANNED: Actionability waiting ────────────────────────────────────
    // `browser-cdp` does not implement auto-wait actionability like Playwright.
    // selectOption runs directly via evaluate without retry loops.

    test.skip("page-select-option.spec.ts - should wait for option to be present [SKIP: NOT_PLANNED - actionability waiting]", () =>
      Effect.void);

    test.skip("page-select-option.spec.ts - should wait for option index to be present [SKIP: NOT_PLANNED - actionability waiting]", () =>
      Effect.void);

    test.skip("page-select-option.spec.ts - should wait for multiple options to be present [SKIP: NOT_PLANNED - actionability waiting]", () =>
      Effect.void);

    test.skip("page-select-option.spec.ts - should wait for select to be enabled [SKIP: NOT_PLANNED - actionability waiting]", () =>
      Effect.void);

    test.skip("page-select-option.spec.ts - should wait for option to be enabled [SKIP: NOT_PLANNED - actionability waiting]", () =>
      Effect.void);

    test.skip("page-select-option.spec.ts - should wait for optgroup to be enabled [SKIP: NOT_PLANNED - actionability waiting]", () =>
      Effect.void);

    test.skip("page-select-option.spec.ts - should wait for select to be swapped [SKIP: NOT_PLANNED - actionability waiting]", () =>
      Effect.void);

    // ── NOT_PLANNED: Shadow DOM ──────────────────────────────────────────────
    // ── Shadow DOM event propagation ───────────────────────────────────────
    // Upstream: it('input event.composed should be true and cross shadow dom boundary')
    // Issue: https://github.com/microsoft/playwright/issues/28726

    test.live(
      "page-select-option.spec.ts - input event.composed should be true and cross shadow dom boundary",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`<body><script>
  const div = document.createElement('div');
  const shadowRoot = div.attachShadow({mode: 'open'});
  shadowRoot.innerHTML = \`<select>
    <option value="black">Black</option>
    <option value="blue">Blue</option>
  </select>\`;
  document.body.appendChild(div);
</script></body>`);

              // Set up event listeners on body (for bubbling)
              yield* page.evaluate(() => {
                (window as any).firedBodyEvents = [];
                for (const event of ["input", "change"]) {
                  document.body.addEventListener(
                    event,
                    (e) => {
                      (window as any).firedBodyEvents.push(e.type + ":" + e.composed);
                    },
                    false,
                  );
                }
              });

              // Set up event listeners on select element
              yield* page.evaluate(() => {
                const select = document.querySelector("div")!.shadowRoot!.querySelector("select")!;
                (window as any).firedEvents = [];
                for (const event of ["input", "change"]) {
                  select.addEventListener(
                    event,
                    (e) => {
                      (window as any).firedEvents.push(e.type + ":" + e.composed);
                    },
                    false,
                  );
                }
              });

              yield* page.selectOption("select", "blue");

              const firedEvents = yield* page.evaluate(() => (window as any).firedEvents);
              yield* assertDeepEqual(firedEvents, ["input:true", "change:false"]);

              const firedBodyEvents = yield* page.evaluate(() => (window as any).firedBodyEvents);
              yield* assertDeepEqual(firedBodyEvents, ["input:true"]);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── NOT_PLANNED: TypeScript coverage ──────────────────────────────────────
    // TypeScript prevents these at compile time

    test.skip("page-select-option.spec.ts - should not allow null items [SKIP: NOT_PLANNED - TypeScript prevents at compile time]", () =>
      Effect.void);

    test.skip("page-select-option.spec.ts - should throw if passed wrong types [SKIP: NOT_PLANNED - TypeScript prevents at compile time]", () =>
      Effect.void);
  });
};
