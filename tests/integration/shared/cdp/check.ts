/**
 * Parity tests for `browser-cdp` page.check/uncheck/setChecked — aligned with Playwright's page-check.spec.ts
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-check.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Tests cover:
 * - page.check() on checkboxes and radios (native + ARIA roles)
 * - page.uncheck() on checkboxes (native + ARIA roles)
 * - page.setChecked() for toggle via boolean parameter
 * - Error handling: non-checkbox, unchecking radio
 * - Trial mode: validates without modifying
 * - Idempotency: no-op when already in desired state
 *
 * Gap map (upstream tests → classification):
 *
 *   Live tests (this file):
 *     - "should check the box" (smoke)
 *     - "should not check the checked box"
 *     - "should uncheck the box"
 *     - "should not uncheck the unchecked box"
 *     - "should check radio"
 *     - "should check radio by aria role"
 *     - "should uncheck radio by aria role"
 *     - "should check the box by aria role" (7 ARIA roles)
 *     - "should uncheck the box by aria role" (7 ARIA roles)
 *     - "should throw when not a checkbox"
 *     - "should throw when not a checkbox 2"
 *     - "should check the box inside a button"
 *     - "trial run should not check"
 *     - "trial run should not uncheck"
 *     - "should check the box using setChecked"
 *     - "should throw when trying to uncheck radio button"
 *     - isChecked tests (5 existing tests, renamed to spec prefix format)
 *
 *   NOT_PLANNED (requires APIs not in `browser-cdp`):
 *     - "should check the label with position" — requires text= selector,
 *       position option on check, page.$() and boundingBox()
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Cause, Effect, Exit, Option } from "effect";

import { Cdp, CdpError } from "@effect-libs/browser-cdp";

import { assertContains, assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

/** Extract error message from an Effect Exit failure. */
const getErrorMsg = (exit: Exit.Exit<unknown, unknown>): string => {
  if (Exit.isFailure(exit)) {
    const failure = Cause.findErrorOption(exit.cause);
    if (Option.isSome(failure)) {
      const error = failure.value;
      if (error instanceof CdpError) return error.message;
      return String(error);
    }
  }
  return "";
};

export const defineCheckTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl } = config;

  describe("page-check.spec.ts parity", () => {
    // ── isChecked() tests (bonus — not in upstream page-check.spec.ts, but
    //    verify isChecked() reports state correctly after check/uncheck) ──

    test.live("page-check.spec.ts - isChecked detects checked state after click", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input id='checkbox' type='checkbox'></input>`);
            yield* assertTrue((yield* page.isChecked("#checkbox")) === false);
            yield* page.click("#checkbox");
            yield* assertTrue((yield* page.isChecked("#checkbox")) === true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-check.spec.ts - isChecked detects pre-checked state", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input id='checkbox' type='checkbox' checked></input>`);
            yield* assertTrue((yield* page.isChecked("#checkbox")) === true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-check.spec.ts - isChecked detects radio button checked state", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`
              <input type='radio' name='group'>one</input>
              <input id='two' type='radio' name='group'>two</input>
              <input type='radio' name='group'>three</input>
            `);
            yield* assertTrue((yield* page.isChecked("#two")) === false);
            yield* page.click("#two");
            yield* assertTrue((yield* page.isChecked("#two")) === true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-check.spec.ts - isChecked matches direct DOM inspection", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input id='cb' type='checkbox'></input>`);
            yield* page.click("#cb");
            const viaIsChecked = yield* page.isChecked("#cb");
            const viaDom = yield* page.evaluate(
              () => (document.getElementById("cb") as HTMLInputElement).checked,
            );
            yield* assertEqual(viaIsChecked, viaDom);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should check the box" @smoke ──────────────────────────────────
    // Upstream: page.check('input') → window['checkbox'].checked === true

    test.live("page-check.spec.ts - should check the box", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input id='checkbox' type='checkbox'></input>`);
            yield* page.check("input");
            const checked = yield* page.evaluate(() => (window as any)["checkbox"].checked);
            yield* assertEqual(checked, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should not check the checked box" ──────────────────────────────
    // Upstream: check already-checked box → remains checked (idempotent)

    test.live("page-check.spec.ts - should not check the checked box", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input id='checkbox' type='checkbox' checked></input>`);
            yield* page.check("input");
            const checked = yield* page.evaluate(() => (window as any)["checkbox"].checked);
            yield* assertEqual(checked, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should uncheck the box" ────────────────────────────────────────

    test.live("page-check.spec.ts - should uncheck the box", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input id='checkbox' type='checkbox' checked></input>`);
            yield* page.uncheck("input");
            const checked = yield* page.evaluate(() => (window as any)["checkbox"].checked);
            yield* assertEqual(checked, false);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should not uncheck the unchecked box" ──────────────────────────

    test.live("page-check.spec.ts - should not uncheck the unchecked box", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input id='checkbox' type='checkbox'></input>`);
            yield* page.uncheck("input");
            const checked = yield* page.evaluate(() => (window as any)["checkbox"].checked);
            yield* assertEqual(checked, false);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should check radio" ────────────────────────────────────────────

    test.live("page-check.spec.ts - should check radio", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`
              <input type='radio'>one</input>
              <input id='two' type='radio'>two</input>
              <input type='radio'>three</input>
            `);
            yield* page.check("#two");
            const checked = yield* page.evaluate(() => (window as any)["two"].checked);
            yield* assertEqual(checked, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should check radio by aria role" ───────────────────────────────
    // Upstream: div role=radio, click handler sets aria-checked=true

    test.live("page-check.spec.ts - should check radio by aria role", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<div role='radio' id='checkbox'>CHECKBOX</div>`);
            yield* page.check("div");
            const ariaChecked = yield* page.evaluate(() =>
              (window as any)["checkbox"].getAttribute("aria-checked"),
            );
            yield* assertEqual(ariaChecked, "true");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should uncheck radio by aria role" ──────────────────────────────

    test.live("page-check.spec.ts - should uncheck radio by aria role", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(
              `<div role='radio' id='checkbox' aria-checked="true">CHECKBOX</div>`,
            );
            yield* page.uncheck("div");
            const ariaChecked = yield* page.evaluate(() =>
              (window as any)["checkbox"].getAttribute("aria-checked"),
            );
            yield* assertEqual(ariaChecked, "false");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should check the box by aria role" (7 roles) ────────────────────
    // Upstream uses it.step() for each role — we loop inline

    test.live("page-check.spec.ts - should check the box by aria role", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            const roles = [
              "checkbox",
              "menuitemcheckbox",
              "option",
              "radio",
              "switch",
              "menuitemradio",
              "treeitem",
            ];
            for (const role of roles) {
              yield* page.setContent(`<div role='${role}' id='checkbox'>CHECKBOX</div>`);
              yield* page.check("div");
              const ariaChecked = yield* page.evaluate(() =>
                (window as any)["checkbox"].getAttribute("aria-checked"),
              );
              yield* assertEqual(ariaChecked, "true");
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should uncheck the box by aria role" (7 roles) ──────────────────

    test.live("page-check.spec.ts - should uncheck the box by aria role", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            const roles = [
              "checkbox",
              "menuitemcheckbox",
              "option",
              "radio",
              "switch",
              "menuitemradio",
              "treeitem",
            ];
            for (const role of roles) {
              yield* page.setContent(
                `<div role='${role}' id='checkbox' aria-checked="true">CHECKBOX</div>`,
              );
              yield* page.uncheck("div");
              const ariaChecked = yield* page.evaluate(() =>
                (window as any)["checkbox"].getAttribute("aria-checked"),
              );
              yield* assertEqual(ariaChecked, "false");
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should throw when not a checkbox" ───────────────────────────────

    test.live("page-check.spec.ts - should throw when not a checkbox", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<div>Check me</div>`);
            const exit = yield* page.check("div").pipe(Effect.exit);
            const msg = getErrorMsg(exit);
            yield* assertContains(msg, "Not a checkbox or radio button");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should throw when not a checkbox 2" ─────────────────────────────
    // div with role=button is not a checkable role

    test.live("page-check.spec.ts - should throw when not a checkbox 2", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<div role=button>Check me</div>`);
            const exit = yield* page.check("div").pipe(Effect.exit);
            const msg = getErrorMsg(exit);
            yield* assertContains(msg, "Not a checkbox or radio button");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should check the box inside a button" ───────────────────────────
    // Upstream also verifies page.isChecked and element.isChecked — we use evaluate

    test.live("page-check.spec.ts - should check the box inside a button", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<div role='button'><input type='checkbox'></div>`);
            yield* page.check("input");
            const checked = yield* page.evaluate(
              () => (document.querySelector("input") as HTMLInputElement).checked,
            );
            yield* assertEqual(checked, true);
            const isChecked = yield* page.isChecked("input");
            yield* assertTrue(isChecked === true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "trial run should not check" ─────────────────────────────────────

    test.live("page-check.spec.ts - trial run should not check", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input id='checkbox' type='checkbox'></input>`);
            yield* page.check("input", { trial: true });
            const checked = yield* page.evaluate(() => (window as any)["checkbox"].checked);
            yield* assertEqual(checked, false);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "trial run should not uncheck" ───────────────────────────────────

    test.live("page-check.spec.ts - trial run should not uncheck", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input id='checkbox' type='checkbox' checked></input>`);
            yield* page.uncheck("input", { trial: true });
            const checked = yield* page.evaluate(() => (window as any)["checkbox"].checked);
            yield* assertEqual(checked, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should check the box using setChecked" ──────────────────────────

    test.live("page-check.spec.ts - should check the box using setChecked", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input id='checkbox' type='checkbox'></input>`);
            yield* page.setChecked("input", true);
            let checked = yield* page.evaluate(() => (window as any)["checkbox"].checked);
            yield* assertEqual(checked, true);
            yield* page.setChecked("input", false);
            checked = yield* page.evaluate(() => (window as any)["checkbox"].checked);
            yield* assertEqual(checked, false);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should throw when trying to uncheck radio button" ───────────────

    test.live("page-check.spec.ts - should throw when trying to uncheck radio button", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent(`<input type='radio' name='test' checked id='radio'>`);
            const exit = yield* page.uncheck("#radio").pipe(Effect.exit);
            const msg = getErrorMsg(exit);
            yield* assertContains(msg, "Cannot uncheck radio button");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── NOT_PLANNED skip markers ─────────────────────────────────────────

    test.skip("page-check.spec.ts - should check the label with position [SKIP: NOT_PLANNED - requires text= selector, position option on check, page.$() and boundingBox()]", () =>
      Effect.void);
  });
};
