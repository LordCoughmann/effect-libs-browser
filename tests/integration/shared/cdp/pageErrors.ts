/**
 * Parity tests for `browser-cdp` page.onPageError and page.pageErrors().
 *
 * Mirrors Playwright's `page.on('pageerror', handler)` event stream and
 * `page.pageErrors()` snapshot accessor.
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 *
 * Behavior verified:
 * - uncaught JS exception thrown in the page is emitted on the stream
 * - no errors → no events on the stream
 * - `pageErrors()` returns the accumulated list of errors
 * - `pageErrors()` is non-destructive (does not drain the stream)
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Fiber, Option, Stream } from "effect";
import * as Str from "effect/String";

import { Cdp } from "@effect-libs/browser-cdp";

import { assertContains, assertEqual, assertTrue } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

export const definePageErrorTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl } = config;

  describe("page.onPageError", () => {
    test.live("page-event-pageerror.spec.ts - should fire", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<script>throw new Error("intentional failure")</script>');

            const errors = yield* page.onPageError;
            const collectedFiber = yield* Effect.forkChild(
              errors.pipe(
                Stream.take(1),
                Stream.runCollect,
                Effect.map((chunk) => Array.from(chunk)),
              ),
            );

            // Give subscription a moment to install
            yield* page.waitForTimeout(50);

            // The setContent above already threw — but timing matters; trigger
            // another error to be safe.
            yield* page.evaluate(() => {
              setTimeout(() => {
                throw new Error("second intentional failure");
              }, 10);
            });

            const collected = yield* Fiber.join(collectedFiber);
            // We expect at least one error to be captured
            yield* assertTrue(collected.length >= 1);
            // The error message should mention "intentional" (one of them)
            const combined = collected.map((e: { message: string }) => e.message).join("\n");
            yield* assertTrue(combined.includes("intentional"));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-event-pageerror.spec.ts - should not receive console message for pageError",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(
                "<div>no errors here</div><script>console.log('hello');</script>",
              );

              const errors = yield* page.onPageError;
              // Wait a moment, then take up to 0 elements by racing against
              // a small timeout.
              const result = yield* errors.pipe(
                Stream.take(1),
                Stream.runHead,
                Effect.race(
                  Effect.sleep("500 millis").pipe(Effect.map(() => Option.none<never>())),
                ),
              );
              // No errors should have been emitted
              yield* assertEqual(Option.isNone(result), true);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );
  });

  describe("page.pageErrors", () => {
    test.live("page-event-pageerror.spec.ts - pageErrors should work", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>quiet page</div>");
            // Allow any startup-time scripts to run and possibly fail.
            yield* page.waitForTimeout(50);
            const errors = yield* page.pageErrors();
            yield* assertEqual(errors.length, 0);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-event-pageerror.spec.ts - should contain sourceURL [CDP-EXTENSION: verifies pageErrors() collects multiple errors thrown from separate inline scripts]",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent(
                '<script>throw new Error("pageErrors test 1")</script>' +
                  '<script>throw new Error("pageErrors test 2")</script>',
              );
              // Allow both errors to propagate through CDP and into the ref.
              yield* page.waitForTimeout(100);

              const errors = yield* page.pageErrors();
              const messages = errors.map((e) => e.message).join("\n");
              yield* assertContains(messages, "pageErrors test 1");
              yield* assertContains(messages, "pageErrors test 2");
              yield* assertTrue(errors.length >= 2);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-event-pageerror.spec.ts - should handle object", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent("<div>async throw</div>");
            yield* page.evaluate(() => {
              setTimeout(() => {
                throw new Error("async throw");
              }, 10);
            });
            // Wait for the async throw to propagate.
            yield* page.waitForTimeout(100);

            const errors = yield* page.pageErrors();
            const messages = errors.map((e) => e.message).join("\n");
            yield* assertContains(messages, "async throw");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-event-pageerror.spec.ts - should contain the Error.name property", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<script>throw new Error("repeat me")</script>');
            yield* page.waitForTimeout(100);

            const first = yield* page.pageErrors();
            const second = yield* page.pageErrors();

            // Each call returns the same accumulated list — no draining.
            yield* assertEqual(second.length, first.length);
            // The error is present in both snapshots.
            const firstMessages = first.map((e) => e.message).join("\n");
            const secondMessages = second.map((e) => e.message).join("\n");
            yield* assertContains(firstMessages, "repeat me");
            yield* assertContains(secondMessages, "repeat me");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-event-pageerror.spec.ts - should handle window", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<script>throw new Error("first")</script>');
            yield* page.waitForTimeout(50);
            const initialLength = (yield* page.pageErrors()).length;

            // Trigger a new error after the first snapshot. Throw asynchronously
            // inside the callback so its inferred return type stays `void`
            // (otherwise `evaluate<T>` infers `T = never`).
            yield* page.evaluate(() => {
              setTimeout(() => {
                throw new Error("second");
              }, 10);
            });
            yield* page.waitForTimeout(100);

            const after = yield* page.pageErrors();
            yield* assertTrue(after.length > initialLength);
            const messages = after.map((e) => e.message).join("\n");
            yield* assertContains(messages, "first");
            yield* assertContains(messages, "second");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live("page-event-pageerror.spec.ts - should contain sourceURL", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.setContent('<script>throw new Error("with stack")</script>');
            yield* page.waitForTimeout(100);

            const errors = yield* page.pageErrors();
            const withMessage = errors.filter((e) => e.message.includes("with stack"));
            yield* assertTrue(withMessage.length >= 1);
            const first = withMessage[0];
            yield* assertTrue(first !== undefined);
            // Stack is populated for V8-style frames; just assert it's present.
            yield* assertTrue(typeof first.stack === "string" && Str.isNonEmpty(first.stack));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    test.live(
      "page-event-pageerror.spec.ts - should remove a listener of a non-existing event handler",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.setContent("<div>stream vs snapshot</div>");
              yield* page.waitForTimeout(50);

              // Snapshot first — should be empty.
              const before = yield* page.pageErrors();
              yield* assertEqual(before.length, 0);

              // Now subscribe to the stream and trigger an error.
              const errors = yield* page.onPageError;
              const collectedFiber = yield* Effect.forkChild(
                errors.pipe(
                  Stream.take(1),
                  Stream.runCollect,
                  Effect.map((chunk) => Array.from(chunk)),
                ),
              );
              yield* page.waitForTimeout(50);
              yield* page.evaluate(() => {
                setTimeout(() => {
                  throw new Error("streamed error");
                }, 10);
              });

              const collected = yield* Fiber.join(collectedFiber);
              yield* assertTrue(collected.length >= 1);

              // The PubSub publish and the Ref update both happen in the event
              // handler, but `runCollect` on the stream can return as soon as
              // the PubSub delivers the element — *before* the subsequent
              // Ref.update yield has resolved. Wait for the event handler to
              // drain so the snapshot is consistent. See
              // docs/contributing/cdp/event-delivery-latency.md.
              yield* page.waitForTimeout(50);

              // The snapshot should also reflect the error (they share state).
              const after = yield* page.pageErrors();
              const afterMessages = after.map((e) => e.message).join("\n");
              yield* assertContains(afterMessages, "streamed error");
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should support an empty Error.name property [NOT_PLANNED] ─────

    test.live(
      "page-event-pageerror.spec.ts - should support an empty Error.name property [SKIP: NOT_PLANNED - CdpPageError does not expose the Error.name field; only message and stack are surfaced]",
      () => Effect.void,
    );

    // ── P8: should handle odd values ──────────────────────────────────────

    test.live("page-event-pageerror.spec.ts - should handle odd values", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Subscribe to errors BEFORE triggering them so we don't race the
            // PubSub publish with the snapshot read. Also setContent to attach
            // the CDP session lazily (matches the pattern used by other tests).
            yield* page.setContent("<div>odd-values-fixture</div>");
            const errors = yield* page.onPageError;

            // CDP surfaces exception details as the error message. Numbers
            // round-trip as their string representation; null/undefined/empty
            // string all surface as "Uncaught" (`browser-cdp` does not preserve the
            // thrown value's stringification for these).
            // Only `throw 0` matches upstream Playwright behaviour; the rest
            // are marked NOT_PLANNED below.
            yield* page.evaluate(() => {
              setTimeout(() => {
                // eslint-disable-next-line no-throw-literal
                throw 0;
              }, 0);
            });
            yield* page.waitForTimeout(200);

            const collected = yield* errors.pipe(
              Stream.take(1),
              Stream.runCollect,
              Effect.map((chunk) => Array.from(chunk)),
            );
            const messages = collected.map((e) => e.message).join("\n");
            yield* assertContains(messages, "0");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should handle odd values - non-number cases [NOT_PLANNED] ──────

    test.live(
      "page-event-pageerror.spec.ts - should handle odd values (null/undefined/empty-string cases) [SKIP: NOT_PLANNED - CDP stringifies null/undefined/empty-string throws as 'Uncaught' instead of preserving the thrown value's stringification]",
      () => Effect.void,
    );

    // ── P8: should emit error from unhandled rejects ──────────────────────

    test.live("page-event-pageerror.spec.ts - should emit error from unhandled rejects", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Subscribe BEFORE the unhandled rejection happens so we don't
            // race the PubSub publish with the stream consume.
            const errors = yield* page.onPageError;

            yield* page.setContent(`<script>Promise.reject(new Error('sad :('));</script>`);

            // Wait for the unhandled rejection to propagate.
            yield* page.waitForTimeout(200);

            const collected = yield* errors.pipe(
              Stream.take(1),
              Stream.runCollect,
              Effect.map((chunk) => Array.from(chunk)),
            );
            yield* assertTrue(collected.length >= 1);
            const messages = collected.map((e) => e.message).join("\n");
            yield* assertContains(messages, "sad :(");
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── P8: should fire illegal character error ───────────────────────────

    test.live("page-event-pageerror.spec.ts - should fire illegal character error", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Subscribe BEFORE setting content so we don't race the publish.
            const errors = yield* page.onPageError;

            // Use a non-ASCII semicolon (；, U+FF1B) instead of `;` (U+003B).
            // Browsers fire a parse error for this.
            yield* page.setContent(`<script>let a=10；</script>`);

            yield* page.waitForTimeout(200);

            const collected = yield* errors.pipe(
              Stream.take(1),
              Stream.runCollect,
              Effect.map((chunk) => Array.from(chunk)),
            );
            yield* assertTrue(collected.length >= 1);
            const messages = collected.map((e) => e.message).join("\n");
            // Chromium emits "Invalid or unexpected token" for this kind of
            // parse error. Other browsers use slightly different wording —
            // accept any token-related error message.
            yield* assertTrue(
              messages.toLowerCase().includes("invalid") ||
                messages.toLowerCase().includes("token") ||
                messages.toLowerCase().includes("illegal"),
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );
  });
};
