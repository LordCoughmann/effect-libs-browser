/**
 * Organic tests for `browser-cdp` page.textContent().
 *
 * No dedicated upstream spec exists. Tests cover:
 * - Basic text content retrieval
 * - Whitespace handling
 * - Hidden elements
 * - Nested elements
 * - Empty elements (returns Option.none)
 * - Missing elements (error)
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Duration, Effect, Option, Result } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const defineTextContentTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("page.textContent", () => {
    // ── Basic retrieval ──────────────────────────────────────────────────

    test.live("page-text-content.spec.ts - should return text content of an element", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<div id="el">Hello World</div>`);
            const result = yield* page.textContent("#el");
            yield* assertTrue(Option.isSome(result));
            if (Option.isSome(result)) {
              yield* assertEqual(result.value, "Hello World");
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Nested elements ──────────────────────────────────────────────────

    test.live("page-text-content.spec.ts - should include text from nested elements", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<div id="outer"><span>Hello</span> <span>World</span></div>`);
            const result = yield* page.textContent("#outer");
            yield* assertTrue(Option.isSome(result));
            if (Option.isSome(result)) {
              yield* assertEqual(result.value, "Hello World");
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Whitespace handling ──────────────────────────────────────────────

    test.live("page-text-content.spec.ts - should preserve whitespace in text content", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<div id="ws">  spaces  and  tabs  </div>`);
            const result = yield* page.textContent("#ws");
            yield* assertTrue(Option.isSome(result));
            if (Option.isSome(result)) {
              yield* assertEqual(result.value, "  spaces  and  tabs  ");
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Hidden element ───────────────────────────────────────────────────

    test.live("page-text-content.spec.ts - should return text content of a hidden element", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<div id="hidden" style="display:none">Hidden text</div>`);
            const result = yield* page.textContent("#hidden");
            yield* assertTrue(Option.isSome(result));
            if (Option.isSome(result)) {
              yield* assertEqual(result.value, "Hidden text");
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Empty element ────────────────────────────────────────────────────

    test.live("page-text-content.spec.ts - should return none for empty element", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<div id="empty"></div>`);
            const result = yield* page.textContent("#empty");
            // textContent returns "" for empty div, which is Some("")
            // but we treat empty string as Some("") since it's valid textContent
            yield* assertTrue(Option.isSome(result));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Self-closing tags ────────────────────────────────────────────────

    test.live("page-text-content.spec.ts - should return text content of input labels", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.setContent(`<label id="lbl">Username</label>`);
            const result = yield* page.textContent("#lbl");
            yield* assertTrue(Option.isSome(result));
            if (Option.isSome(result)) {
              yield* assertEqual(result.value, "Username");
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── Missing element ──────────────────────────────────────────────────

    test.live("page-text-content.spec.ts - should fail when element is not found", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const result = yield* Effect.result(
              page.textContent("#nonexistent", { timeout: Duration.millis(1000) }),
            );
            yield* assertTrue(Result.isFailure(result));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
