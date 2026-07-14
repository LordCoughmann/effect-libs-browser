/**
 * Organic tests for `browser-cdp` page state check methods: isDisabled, isEditable, isEnabled.
 *
 * No dedicated upstream specs exist. Tests cover:
 * - Form element states (input, button, select, textarea)
 * - aria-disabled attribute
 * - contentEditable
 * - readonly inputs
 * - Missing elements (error)
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

export const defineElementStateTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.isEnabled parity", () => {
    test.live("page-element-state.spec.ts - isEnabled: should return true for enabled input", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<input id="field" type="text">`);
            const enabled = yield* page.isEnabled("#field");
            yield* assertEqual(enabled, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isEnabled: should return false for disabled input",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`<input id="field" type="text" disabled>`);
              const enabled = yield* page.isEnabled("#field");
              yield* assertEqual(enabled, false);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });

  describe("page.isDisabled parity", () => {
    test.live(
      "page-element-state.spec.ts - isDisabled: should return true for disabled button",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`<button id="btn" disabled>Click</button>`);
              const disabled = yield* page.isDisabled("#btn");
              yield* assertEqual(disabled, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isDisabled: should return false for enabled button",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`<button id="btn">Click</button>`);
              const disabled = yield* page.isDisabled("#btn");
              yield* assertEqual(disabled, false);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-element-state.spec.ts - isDisabled: should detect aria-disabled on div", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<div id="custom" aria-disabled="true">Custom</div>`);
            const disabled = yield* page.isDisabled("#custom");
            yield* assertEqual(disabled, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isDisabled: should return false for element without aria-disabled",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`<div id="custom">Custom</div>`);
              const disabled = yield* page.isDisabled("#custom");
              yield* assertEqual(disabled, false);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-element-state.spec.ts - isDisabled: should detect disabled select", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<select id="sel" disabled><option>a</option></select>`);
            const disabled = yield* page.isDisabled("#sel");
            yield* assertEqual(disabled, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-element-state.spec.ts - isDisabled: should detect disabled textarea", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<textarea id="ta" disabled>text</textarea>`);
            const disabled = yield* page.isDisabled("#ta");
            yield* assertEqual(disabled, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });

  describe("page.isEditable parity", () => {
    test.live(
      "page-element-state.spec.ts - isEditable: should return true for enabled text input",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`<input id="field" type="text">`);
              const editable = yield* page.isEditable("#field");
              yield* assertEqual(editable, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isEditable: should return false for disabled input",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`<input id="field" type="text" disabled>`);
              const editable = yield* page.isEditable("#field");
              yield* assertEqual(editable, false);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isEditable: should return false for readonly input",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`<input id="field" type="text" readonly>`);
              const editable = yield* page.isEditable("#field");
              yield* assertEqual(editable, false);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isEditable: should return true for contentEditable div",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setContent(`<div id="editor" contenteditable="true">Edit me</div>`);
              const editable = yield* page.isEditable("#editor");
              yield* assertEqual(editable, true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });

  describe("page state checks - missing elements", () => {
    test.live("page-element-state.spec.ts - isEnabled: should fail when element is not found", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const result = yield* Effect.result(
              page.isEnabled("#nonexistent", { timeout: Duration.millis(1000) }),
            );
            yield* assertTrue(Result.isFailure(result));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isDisabled: should fail when element is not found",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const result = yield* Effect.result(
                page.isDisabled("#nonexistent", { timeout: Duration.millis(1000) }),
              );
              yield* assertTrue(Result.isFailure(result));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-element-state.spec.ts - isEditable: should fail when element is not found",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const result = yield* Effect.result(
                page.isEditable("#nonexistent", { timeout: Duration.millis(1000) }),
              );
              yield* assertTrue(Result.isFailure(result));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
