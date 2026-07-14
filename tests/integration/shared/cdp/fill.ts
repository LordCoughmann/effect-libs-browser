/**
 * Parity tests for `browser-cdp` page.fill() - aligned with Playwright's page-fill.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-fill.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover:
 * - Basic fill on textarea, input, contenteditable
 * - Clear existing value before fill
 * - Input type validation (unsupported types throw)
 * - Special input types (number, range, date, time, color)
 * - Value validation (malformed values throw)
 * - Error handling (element not found, non-fillable element)
 *
 * Key differences from upstream:
 *   - `browser-cdp` fill uses evaluate to set value directly (no auto-wait for actionability)
 *   - No browserName filtering (single Chromium engine)
 *   - No locator API — use selectors directly
 *   - page.$eval not available — use page.evaluate for DOM queries
 *   - Effect fibers replace Promise.all for concurrent operations
 *
 * Gap map (upstream tests not adapted → reason):
 *
 *   Requires actionability waiting (not implemented in `browser-cdp` fill):
 *     - "should retry on disabled element"
 *     - "should retry on readonly element"
 *     - "should retry on invisible element"
 *
 *   Requires Locator API (not planned for `browser-cdp`):
 *     - "input event.composed should be true and cross shadow dom boundary" variants
 *     - "fill back to back" (uses id= selector)
 *
 *   Requires frame API (not planned for `browser-cdp`):
 *     - "should be able to fill when focus is in the wrong frame"
 *
 *   Platform-specific (not applicable):
 *     - "should fill color input case insensitive" (browser-specific behavior)
 *     - "should fill contenteditable with new lines" (Firefox fixme)
 *     - "should not double-fill in contenteditable with beforeinput handler in Firefox"
 *
 *   Requires special test page:
 *     - "should not throw when fill causes navigation" (needs JS redirect setup)
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect } from "effect";

import { Cdp, CdpError, EvaluationError } from "@effect-libs/browser-cdp";

import { assertEqual, assertContains } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

/** Extract error description from a CdpError */
const getErrorDescription = (e: unknown): string => {
  if (e instanceof CdpError && e.reason instanceof EvaluationError) {
    return e.reason.description;
  }
  return String(e);
};

export const defineFillTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.fill parity", () => {
    // ── Basic fill ──────────────────────────────────────────────────────
    // Upstream: it('should fill textarea @smoke')

    test.live("page-fill.spec.ts - should fill textarea", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/textarea`);
            yield* page.fill("textarea", "some value");
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertEqual(result, "some value");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should fill input')

    test.live("page-fill.spec.ts - should fill input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/textarea`);
            yield* page.fill("input", "some value");
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertEqual(result, "some value");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should fill contenteditable')

    test.live("page-fill.spec.ts - should fill contenteditable", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/textarea`);
            yield* page.fill("div[contenteditable]", "some value");
            const text = yield* page.evaluate(
              () => document.querySelector("div[contenteditable]")!.textContent,
            );
            yield* assertEqual(text, "some value");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should be able to clear using fill()')

    test.live("page-fill.spec.ts - should be able to clear using fill()", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/textarea`);
            yield* page.fill("input", "some value");
            const result1 = yield* page.evaluate(() => (window as any).result);
            yield* assertEqual(result1, "some value");
            yield* page.fill("input", "");
            const result2 = yield* page.evaluate(() => (window as any).result);
            yield* assertEqual(result2, "");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should fill elements with existing value and selection')
    // Simplified: just test fill overwrites existing value

    test.live("page-fill.spec.ts - should fill elements with existing value and selection", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/textarea`);
            yield* page.evaluate(() => {
              (document.querySelector("input") as HTMLInputElement).value = "value one";
            });
            yield* page.fill("input", "another value");
            const result = yield* page.evaluate(() => (window as any).result);
            yield* assertEqual(result, "another value");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Input type validation ───────────────────────────────────────────
    // Upstream: it('should throw on unsupported inputs')

    test.live("page-fill.spec.ts - should throw on unsupported inputs", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/textarea`);
            const unsupportedTypes = [
              "button",
              "checkbox",
              "file",
              "image",
              "radio",
              "reset",
              "submit",
            ];
            for (const type of unsupportedTypes) {
              yield* page.evaluate((t) => {
                (document.querySelector("input") as HTMLInputElement).setAttribute("type", t);
              }, type);
              const error = yield* Effect.match(page.fill("input", ""), {
                onSuccess: () => "",
                onFailure: (e) => getErrorDescription(e),
              });
              yield* assertContains(error, type);
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should fill different input types')

    test.live("page-fill.spec.ts - should fill different input types", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/textarea`);
            const types = ["password", "search", "tel", "text", "url"];
            for (const type of types) {
              yield* page.evaluate((t) => {
                (document.querySelector("input") as HTMLInputElement).setAttribute("type", t);
              }, type);
              yield* page.fill("input", `text ${type}`);
              const result = yield* page.evaluate(() => (window as any).result);
              yield* assertEqual(result, `text ${type}`);
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Number input ────────────────────────────────────────────────────
    // Upstream: it('should be able to fill the input[type=number]')

    test.live("page-fill.spec.ts - should be able to fill the input[type=number]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input id="num" type="number"></input>`);
            yield* page.fill("input", "42");
            const value = yield* page.evaluate(
              () => (document.getElementById("num") as HTMLInputElement).value,
            );
            yield* assertEqual(value, "42");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should be able to fill exponent into the input[type=number]')

    test.live(
      "page-fill.spec.ts - should be able to fill exponent into the input[type=number]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<input id="num" type="number"></input>`);
              yield* page.fill("input", "-10e5");
              const value = yield* page.evaluate(
                () => (document.getElementById("num") as HTMLInputElement).value,
              );
              yield* assertEqual(value, "-10e5");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should be able to fill input[type=number] with empty string')

    test.live(
      "page-fill.spec.ts - should be able to fill input[type=number] with empty string",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<input id="num" type="number" value="123"></input>`);
              yield* page.fill("input", "");
              const value = yield* page.evaluate(
                () => (document.getElementById("num") as HTMLInputElement).value,
              );
              yield* assertEqual(value, "");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should not be able to fill text into the input[type=number]')

    test.live(
      "page-fill.spec.ts - should not be able to fill text into the input[type=number]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<input id="num" type="number"></input>`);
              const error = yield* Effect.match(page.fill("input", "abc"), {
                onSuccess: () => "",
                onFailure: (e) => getErrorDescription(e),
              });
              yield* assertContains(error, "number");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Range input ─────────────────────────────────────────────────────
    // Upstream: it('should fill range input')

    test.live("page-fill.spec.ts - should fill range input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="range" min="0" max="100" value="50">`);
            yield* page.fill("input", "42");
            const value = yield* page.evaluate(
              () => (document.querySelector("input") as HTMLInputElement).value,
            );
            yield* assertEqual(value, "42");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should throw on incorrect range value')
    // Simplified: test one malformed value

    test.live("page-fill.spec.ts - should throw on incorrect range value", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="range" min="0" max="100" value="50">`);
            const error = yield* Effect.match(page.fill("input", "foo"), {
              onSuccess: () => "",
              onFailure: (e) => getErrorDescription(e),
            });
            yield* assertContains(error, "Malformed");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Date/time inputs ────────────────────────────────────────────────
    // Upstream: it('should fill date input after clicking')

    test.live("page-fill.spec.ts - should fill date input after clicking", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="date">`);
            yield* page.click("input");
            yield* page.fill("input", "2020-03-02");
            const value = yield* page.evaluate(
              () => (document.querySelector("input") as HTMLInputElement).value,
            );
            yield* assertEqual(value, "2020-03-02");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should throw on incorrect date')

    test.live("page-fill.spec.ts - should throw on incorrect date", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="date">`);
            const error = yield* Effect.match(page.fill("input", "2020-13-05"), {
              onSuccess: () => "",
              onFailure: (e) => getErrorDescription(e),
            });
            yield* assertContains(error, "Malformed");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should fill time input')

    test.live("page-fill.spec.ts - should fill time input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="time">`);
            yield* page.fill("input", "13:15");
            const value = yield* page.evaluate(
              () => (document.querySelector("input") as HTMLInputElement).value,
            );
            yield* assertEqual(value, "13:15");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should throw on incorrect time')

    test.live("page-fill.spec.ts - should throw on incorrect time", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="time">`);
            const error = yield* Effect.match(page.fill("input", "25:05"), {
              onSuccess: () => "",
              onFailure: (e) => getErrorDescription(e),
            });
            yield* assertContains(error, "Malformed");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should fill month input')

    test.live("page-fill.spec.ts - should fill month input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="month">`);
            yield* page.fill("input", "2020-07");
            const value = yield* page.evaluate(
              () => (document.querySelector("input") as HTMLInputElement).value,
            );
            yield* assertEqual(value, "2020-07");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should fill week input')

    test.live("page-fill.spec.ts - should fill week input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="week">`);
            yield* page.fill("input", "2020-W50");
            const value = yield* page.evaluate(
              () => (document.querySelector("input") as HTMLInputElement).value,
            );
            yield* assertEqual(value, "2020-W50");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should fill datetime-local input')

    test.live("page-fill.spec.ts - should fill datetime-local input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="datetime-local">`);
            yield* page.fill("input", "2020-03-02T05:15");
            const value = yield* page.evaluate(
              () => (document.querySelector("input") as HTMLInputElement).value,
            );
            yield* assertEqual(value, "2020-03-02T05:15");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Color input ─────────────────────────────────────────────────────
    // Upstream: it('should fill color input')

    test.live("page-fill.spec.ts - should fill color input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="color" value="#e66465">`);
            yield* page.fill("input", "#aaaaaa");
            const value = yield* page.evaluate(
              () => (document.querySelector("input") as HTMLInputElement).value,
            );
            yield* assertEqual(value, "#aaaaaa");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should throw on incorrect color value')

    test.live("page-fill.spec.ts - should throw on incorrect color value", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="color" value="#e66465">`);
            const error = yield* Effect.match(page.fill("input", "badvalue"), {
              onSuccess: () => "",
              onFailure: (e) => getErrorDescription(e),
            });
            yield* assertContains(error, "Malformed");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Error handling ──────────────────────────────────────────────────
    // Upstream: it('should throw nice error without injected script stack when element is not an <input>')

    test.live(
      "page-fill.spec.ts - should throw nice error without injected script stack when element is not an <input>",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(`<select><option>value1</option></select>`);
              const error = yield* Effect.match(page.fill("select", ""), {
                onSuccess: () => "",
                onFailure: (e) => getErrorDescription(e),
              });
              yield* assertContains(error, "not");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should throw if passed a non-string value')
    // Note: TypeScript prevents this at compile time, but runtime check is still good

    // ── Edge cases ──────────────────────────────────────────────────────
    // Upstream: it('should fill fixed position input')

    test.live("page-fill.spec.ts - should fill fixed position input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input style="position: fixed;" />`);
            yield* page.fill("input", "some value");
            const value = yield* page.evaluate(
              () => (document.querySelector("input") as HTMLInputElement).value,
            );
            yield* assertEqual(value, "some value");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should be able to fill the body')

    test.live("page-fill.spec.ts - should be able to fill the body", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<body contentEditable="true"></body>`);
            yield* page.fill("body", "some value");
            const text = yield* page.evaluate(() => document.body.textContent);
            yield* assertEqual(text, "some value");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── NOT_PLANNED tests ───────────────────────────────────────────────

    // Actionability waiting not implemented in `browser-cdp` fill
    test.skip("page-fill.spec.ts - should retry on disabled element [SKIP: NOT_PLANNED - actionability waiting not implemented]", () =>
      Effect.void);
    test.skip("page-fill.spec.ts - should retry on readonly element [SKIP: NOT_PLANNED - actionability waiting not implemented]", () =>
      Effect.void);
    test.skip("page-fill.spec.ts - should retry on invisible element [SKIP: NOT_PLANNED - actionability waiting not implemented]", () =>
      Effect.void);

    // Locator API not planned for `browser-cdp`
    test.skip("page-fill.spec.ts - input event.composed should be true and cross shadow dom boundary - ${type} [SKIP: NOT_PLANNED - Locator API not in `browser-cdp`]", () =>
      Effect.void);
    test.skip("page-fill.spec.ts - fill back to back [SKIP: NOT_PLANNED - Locator API not in `browser-cdp`]", () =>
      Effect.void);

    // Frame API is now available (commit 94bcc5b) — un-skipped.
    test.live("page-fill.spec.ts - should be able to fill when focus is in the wrong frame", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/frames/one-frame.html`);
            // Focus is in the main frame, not the iframe
            yield* page.evaluate(() => {
              (document.activeElement as HTMLElement | null)?.blur();
              document.body.focus();
            });
            // Fill into the iframe even though focus is elsewhere
            const input = page.frameLocator("#frame1").locator("#frame-input");
            yield* input.fill("hello from main");
            const value = yield* input.inputValue();
            yield* assertEqual(value, "hello from main");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Platform-specific behavior
    test.skip("page-fill.spec.ts - should fill color input case insensitive [SKIP: NOT_PLANNED - browser-specific behavior]", () =>
      Effect.void);
    test.skip("page-fill.spec.ts - should fill contenteditable with new lines [SKIP: NOT_PLANNED - Firefox fixme]", () =>
      Effect.void);
    test.skip("page-fill.spec.ts - should not double-fill in contenteditable with beforeinput handler in Firefox [SKIP: NOT_PLANNED - Firefox-specific]", () =>
      Effect.void);

    // ── Additional input-type tests (date, week, month, etc.) ────────────

    // Upstream: it('should throw on incorrect month')
    test.live("page-fill.spec.ts - should throw on incorrect month", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="month">`);
            const error = yield* Effect.match(page.fill("input", "2020-13"), {
              onSuccess: () => "",
              onFailure: (e) => getErrorDescription(e),
            });
            yield* assertContains(error, "Malformed");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should throw on incorrect week')
    test.live("page-fill.spec.ts - should throw on incorrect week", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="week">`);
            const error = yield* Effect.match(page.fill("input", "2020-123"), {
              onSuccess: () => "",
              onFailure: (e) => getErrorDescription(e),
            });
            yield* assertContains(error, "Malformed");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should throw on incorrect datetime-local')
    test.live("page-fill.spec.ts - should throw on incorrect datetime-local", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type="datetime-local">`);
            const error = yield* Effect.match(page.fill("input", "abc"), {
              onSuccess: () => "",
              onFailure: (e) => getErrorDescription(e),
            });
            yield* assertContains(error, "Malformed");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should throw if passed a non-string value')
    // Note: TypeScript prevents this at compile time, but runtime check is still good
    test.live("page-fill.spec.ts - should throw if passed a non-string value", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/textarea`);
            // Cast to any to bypass TypeScript check (runtime should still validate)
            const error = yield* Effect.match(page.fill("textarea", 123 as any), {
              onSuccess: () => "",
              onFailure: (e) => getErrorDescription(e),
            });
            yield* assertContains(error, "string");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // Upstream: it('should not throw when fill causes navigation')
    test.live("page-fill.spec.ts - should not throw when fill causes navigation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/input/textarea`);
            yield* page.setContent(`<input type="date">`);
            yield* page.evaluate(() => {
              const input = document.querySelector("input")!;
              input.addEventListener("input", () => {
                window.location.href = "/empty";
              });
            });
            // Fill triggers navigation via input event listener
            yield* Effect.all([page.fill("input", "2020-03-02"), page.waitForNavigation()], {
              concurrency: 2,
            });
            const url = yield* page.evaluate(() => window.location.href);
            yield* assertContains(url, "/empty");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
