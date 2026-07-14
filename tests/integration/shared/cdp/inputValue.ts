/**
 * Organic tests for `browser-cdp` page.inputValue().
 *
 * No dedicated upstream spec exists. Tests cover:
 * - Reading value from input, textarea, and select elements
 * - Reading value after user input (fill/type)
 * - Error when element is not found
 * - Value for disabled inputs
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Duration, Effect, Result } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineInputValueTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.inputValue", () => {
    // ── Input element ────────────────────────────────────────────────────

    test.live("page-input-value.spec.ts - should return value of an input element", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<input id="name" type="text" value="Hello World">`);
            const value = yield* page.inputValue("#name");
            yield* assertEqual(value, "Hello World");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Empty input ──────────────────────────────────────────────────────

    test.live("page-input-value.spec.ts - should return empty string for empty input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<input id="empty" type="text">`);
            const value = yield* page.inputValue("#empty");
            yield* assertEqual(value, "");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── After fill ───────────────────────────────────────────────────────

    test.live("page-input-value.spec.ts - should return value after fill", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<input id="field" type="text">`);
            yield* page.fill("#field", "typed value");
            const value = yield* page.inputValue("#field");
            yield* assertEqual(value, "typed value");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Textarea element ─────────────────────────────────────────────────

    test.live("page-input-value.spec.ts - should return value of a textarea", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<textarea id="desc">Multi\nline\ntext</textarea>`);
            const value = yield* page.inputValue("#desc");
            yield* assertEqual(value, "Multi\nline\ntext");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Select element ───────────────────────────────────────────────────

    test.live("page-input-value.spec.ts - should return value of a select element", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`
              <select id="choice">
                <option value="a">Alpha</option>
                <option value="b" selected>Beta</option>
                <option value="c">Gamma</option>
              </select>
            `);
            const value = yield* page.inputValue("#choice");
            yield* assertEqual(value, "b");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Disabled input ───────────────────────────────────────────────────

    test.live("page-input-value.spec.ts - should return value of a disabled input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<input id="disabled" type="text" value="readonly" disabled>`);
            const value = yield* page.inputValue("#disabled");
            yield* assertEqual(value, "readonly");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Missing element ──────────────────────────────────────────────────

    test.live("page-input-value.spec.ts - should fail when element is not found", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const result = yield* Effect.result(
              page.inputValue("#nonexistent", { timeout: Duration.millis(1000) }),
            );
            yield* assertTrue(Result.isFailure(result));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Checkbox value ───────────────────────────────────────────────────

    test.live("page-input-value.spec.ts - should return value attribute of a checkbox", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<input id="agree" type="checkbox" value="yes">`);
            const value = yield* page.inputValue("#agree");
            yield* assertEqual(value, "yes");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
