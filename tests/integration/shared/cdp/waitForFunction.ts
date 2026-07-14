/**
 * `browser-cdp` parity tests for waitForFunction.
 *
 * Adapted from: repos/cloudflare-playwright/tests/page/page-wait-for-function.spec.ts
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 * Behavior reference: upstream Playwright test suite
 *
 * Key differences from upstream:
 *   - `browser-cdp` waitForFunction returns the value directly (no JSHandle wrapper)
 *     No `.jsonValue()` needed — just `yield* page.waitForFunction(() => 5)` returns 5
 *   - Errors are `CdpError` with `PageTimeoutError` or `EvaluationError` reason
 *   - Timeout tests assert `instanceof PageTimeoutError` (not string match) because
 *     the browser-side `__reject(new Error('poll timeout'))` races with the outer
 *     `Effect.timeout`. The mapping fix lives in WaitForFunction.ts (see the
 *     "Timeout race" footgun there).
 *
 * Gap map (skipped tests → missing `browser-cdp` feature):
 *   - page.on('console')      → ✅ Implemented as page.onConsole Stream
 *                                "avoid side effects after timeout",
 *                                "not be called after finishing (success/failure)"
 *   - page.$() ElementHandle  → "accept ElementHandle arguments"
 *   - setCSP route helper     → ✅ CSP test passing — predicate compiled synchronously
 *                                during CDP execution (allowUnsafeEvalBlockedByCSP active),
 *                                async polling loop only calls pre-compiled function.
 *   - CROSS_PROCESS_PREFIX    → ✅ Implemented — http://127.0.0.1:<HTTP_PORT>
 *   - frame support           → ✅ Implemented — "should throw when frame is detached"
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect injects
 * TestClock, which prevents Effect.timeout from firing with real time.
 * waitForFunction uses Effect.timeout internally, so all tests involving
 * timeout waiting require real time.
 */

import type { CdpPageService } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Fiber, Ref, Result, Stream } from "effect";
import * as Str from "effect/String";

import {
  Cdp,
  CdpError,
  EvaluationError,
  NavigationError,
  PageTimeoutError,
} from "@effect-libs/browser-cdp";

import { TestServerClient, CROSS_PROCESS_PREFIX } from "../../../setup/http-server/Client.js";
import { assertTrue, assertEqual } from "../../../utils/effect-test/EffectTest.js";

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

/**
 * Extract the error message from a CdpError's reason.
 * Returns empty string if not a CdpError.
 *
 * ## Footgun: Must handle ALL reason types
 * Each reason type has a different shape. `EvaluationError` and `NavigationError`
 * both have a `.description` field with the human-readable message. But if you
 * only check `EvaluationError`, then `NavigationError` falls through to
 * `reason._tag` which is just "NavigationError" — it won't contain the expected
 * substring like "detached". Always add a case for each reason type that can
 * reach this helper.
 */
const getErrorMsg = (e: unknown): string => {
  if (e instanceof CdpError) {
    if (e.reason instanceof EvaluationError) return e.reason.description;
    if (e.reason instanceof NavigationError) return e.reason.description;
    return e.reason._tag;
  }
  return String(e);
};

export const defineWaitForFunctionTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("WaitForFunction", () => {
    // ── "should timeout" ─────────────────────────────────────────────────────────
    // Tests page.waitForTimeout, not waitForFunction

    test.live("page-wait-for-function.spec.ts - should timeout", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            const startTime = Date.now();
            const timeout = 42;
            yield* page.waitForTimeout(timeout);
            yield* assertTrue(Date.now() - startTime >= timeout / 2);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should accept a string" ─────────────────────────────────────────────────
    // NOTE: Added page.goto because CDP needs an execution context before evaluating.
    // Playwright always has a blank page loaded; `browser-cdp` requires explicit navigation.

    test.live("page-wait-for-function.spec.ts - should accept a string", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const fiber = yield* Effect.forkChild(page.waitForFunction("window.__FOO === 1"));
            yield* page.evaluate(() => {
              (window as any).__FOO = 1;
            });
            yield* Fiber.join(fiber);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work when resolved right before execution context disposal" ──────

    test.live(
      "page-wait-for-function.spec.ts - should work when resolved right before execution context disposal",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.addInitScript(() => {
                (window as any).__RELOADED = true;
              });
              yield* page.waitForFunction(() => {
                if (!(window as any).__RELOADED) {
                  window.location.reload();
                  return false;
                }
                return true;
              });
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should poll on interval" ────────────────────────────────────────────────

    test.live("page-wait-for-function.spec.ts - should poll on interval", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const polling = 100;
            const timeDelta = yield* page.waitForFunction(
              () => {
                if (!(window as any).__startTime) {
                  (window as any).__startTime = Date.now();
                  return false;
                }
                return Date.now() - (window as any).__startTime;
              },
              undefined,
              { polling },
            );
            // `browser-cdp` returns the value directly, not a JSHandle
            yield* assertTrue(Number(timeDelta) >= polling);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should avoid side effects after timeout" ────────────────────────────────
    // Uses page.onConsole stream to count console.log invocations and verify
    // that waitForFunction stops polling after timeout.

    test.live("page-wait-for-function.spec.ts - should avoid side effects after timeout", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const counter = yield* Ref.make(0);

            // Fork a fiber that consumes the console stream and increments the counter
            const consoleStream = yield* page.onConsole;
            yield* Effect.forkChild(
              consoleStream.pipe(Stream.runForEach(() => Ref.update(counter, (n) => n + 1))),
            );

            const errorMsg = yield* Effect.match(
              page.waitForFunction(
                () => {
                  (window as any).counter = ((window as any).counter || 0) + 1;
                  console.log((window as any).counter);
                },
                undefined,
                { polling: 1, timeout: 1000 },
              ),
              {
                onSuccess: () => "",
                onFailure: (e) => getErrorMsg(e),
              },
            );
            yield* assertTrue(Str.isNonEmpty(errorMsg));

            // Drain the console stream before measuring. Stream delivery has
            // variable latency (CDP WebSocket → PubSub → fiber), so a fixed
            // 50ms wait is not always enough. Poll until two consecutive reads
            // match — that means no more events are arriving.
            //
            // Footgun: don't use a fixed timeout here. On bun, the stream can
            // take 200+ ms to deliver all events from a 1ms-interval polling
            // burst. A stabilization loop is deterministic and runtime-agnostic.
            const MAX_DRAIN_ATTEMPTS = 40; // 40 × 50ms = 2s cap
            let savedCounter = -1;
            let current = yield* Ref.get(counter);
            for (let i = 0; i < MAX_DRAIN_ATTEMPTS && current !== savedCounter; i++) {
              savedCounter = current;
              yield* page.waitForTimeout(50);
              current = yield* Ref.get(counter);
            }

            yield* page.waitForTimeout(2000);

            // After timeout, the function should stop polling — no more console logs
            yield* assertEqual(yield* Ref.get(counter), savedCounter);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should throw on polling:mutation" ────────────────────────────────────────

    test.live("page-wait-for-function.spec.ts - should throw on polling:mutation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const errorMsg = yield* Effect.match(
              page.waitForFunction(() => true, undefined, {
                polling: "mutation" as unknown as number,
              }),
              {
                onSuccess: () => "",
                onFailure: (e) => getErrorMsg(e),
              },
            );
            yield* assertTrue(errorMsg.includes("Unknown polling option: mutation"));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should poll on raf" ──────────────────────────────────────────────────────

    test.live("page-wait-for-function.spec.ts - should poll on raf", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const fiber = yield* Effect.forkChild(
              page.waitForFunction(() => (window as any).__FOO === "hit", undefined, {
                polling: "raf" as any,
              }),
            );
            yield* page.evaluate(() => {
              (window as any).__FOO = "hit";
            });
            yield* Fiber.join(fiber);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should fail with predicate throwing on first call" ──────────────────────

    test.live(
      "page-wait-for-function.spec.ts - should fail with predicate throwing on first call",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const errorMsg = yield* Effect.match(
                page.waitForFunction(() => {
                  throw new Error("oh my");
                }),
                {
                  onSuccess: () => "",
                  onFailure: (e) => getErrorMsg(e),
                },
              );
              yield* assertTrue(errorMsg.includes("oh my"));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should fail with predicate throwing sometimes" ──────────────────────────

    test.live(
      "page-wait-for-function.spec.ts - should fail with predicate throwing sometimes",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const errorMsg = yield* Effect.match(
                page.waitForFunction(() => {
                  (window as any).counter = ((window as any).counter || 0) + 1;
                  if ((window as any).counter === 3) throw new Error("Bad counter!");
                  return (window as any).counter === 5 ? "result" : false;
                }),
                {
                  onSuccess: () => "",
                  onFailure: (e) => getErrorMsg(e),
                },
              );
              yield* assertTrue(errorMsg.includes("Bad counter!"));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should fail with ReferenceError on wrong page" ──────────────────────────

    test.live(
      "page-wait-for-function.spec.ts - should fail with ReferenceError on wrong page",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // globalVar intentionally undefined — the function is evaluated
              // in the browser context where it doesn't exist, testing ReferenceError
              const globalVar: unknown = undefined;
              const errorMsg = yield* Effect.match(
                page.waitForFunction(() => (globalVar as unknown as number) === 123),
                {
                  onSuccess: () => "",
                  onFailure: (e) => getErrorMsg(e),
                },
              );
              yield* assertTrue(errorMsg.includes("globalVar"));
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with strict CSP policy" ──────────────────────────────────────
    // CSP-safe: The predicate is compiled synchronously during CDP execution
    // (when allowUnsafeEvalBlockedByCSP is active). The async polling loop
    // only calls the pre-compiled function — no eval() after yielding to
    // the browser event loop, so CSP is bypassed.

    test.live("page-wait-for-function.spec.ts - should work with strict CSP policy", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Set CSP header that allows scripts from same origin
            yield* TestServerClient.setCSP(httpUrl, "/empty", `script-src ${httpUrl}`);
            yield* page.goto(`${httpUrl}/empty`);
            let error: unknown = null;
            const fiber = yield* Effect.forkChild(
              page
                .waitForFunction(() => (window as any).__FOO === "hit", undefined, {
                  polling: "raf" as unknown as number,
                })
                .pipe(
                  Effect.catch(() =>
                    Effect.sync(() => {
                      error = 1;
                    }),
                  ),
                ),
            );
            yield* page.waitForTimeout(1000);
            yield* page.evaluate(() => {
              (window as any).__FOO = "hit";
            });
            yield* Fiber.join(fiber);
            yield* assertEqual(error, null);
            // Clean up CSP policy so it doesn't affect subsequent tests
            yield* TestServerClient.clear(httpUrl);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should throw on bad polling value" ───────────────────────────────────────

    test.live("page-wait-for-function.spec.ts - should throw on bad polling value", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const errorMsg = yield* Effect.match(
              page.waitForFunction(() => !!document.body, undefined, {
                polling: "unknown" as unknown as number,
              }),
              {
                onSuccess: () => "",
                onFailure: (e) => getErrorMsg(e),
              },
            );
            yield* assertTrue(errorMsg.includes("polling"));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should throw negative polling interval" ──────────────────────────────────

    test.live("page-wait-for-function.spec.ts - should throw negative polling interval", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const errorMsg = yield* Effect.match(
              page.waitForFunction(() => !!document.body, undefined, { polling: -10 }),
              {
                onSuccess: () => "",
                onFailure: (e) => getErrorMsg(e),
              },
            );
            yield* assertTrue(errorMsg.includes("Cannot poll with non-positive interval"));
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should return the success value as a JSHandle" ───────────────────────────
    // Adapted: `browser-cdp` returns the value directly (no JSHandle), so we compare directly.

    test.live(
      "page-wait-for-function.spec.ts - should return the success value as a JSHandle",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              // `browser-cdp` returns the value directly — no .jsonValue() needed
              const result = yield* page.waitForFunction(() => 5);
              yield* assertEqual(result, 5);
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should return the window as a success value" ─────────────────────────────

    test.live("page-wait-for-function.spec.ts - should return the window as a success value", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            // Window is non-serializable; CDP serialization returns truthy object
            const result = yield* page.waitForFunction(() => window);
            yield* assertTrue(result !== undefined);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should accept ElementHandle arguments" ───────────────────────────────────
    // GAP: requires page.$() returning ElementHandle (not implemented in `browser-cdp`)

    test.skip("page-wait-for-function.spec.ts - should accept ElementHandle arguments [SKIP: NOT_PLANNED - ElementHandle API]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (_page) =>
          Effect.gen(function* () {
            // See upstream page-wait-for-function.spec.ts for the full body
            // (uses page.$('div') returning an ElementHandle, which `browser-cdp` does not expose).
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── "should respect timeout" ──────────────────────────────────────────────────
    // Asserts the error is a CdpError with a PageTimeoutError reason
    // (`instanceof`) rather than a string-substring check, matching the
    // setContent timeout assertion and upstream Playwright's
    // `expect(error).toBeInstanceOf(playwright.errors.TimeoutError)`. This
    // survives the browser-side/outer-timeout race fixed in WaitForFunction
    // (see POLL_TIMEOUT_DESCRIPTION footgun in src/cdp/internal/Page/WaitForFunction.ts).

    test.live(
      "page-wait-for-function.spec.ts - should respect timeout",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const result = yield* Effect.result(
                page.waitForFunction("false", undefined, { timeout: 100 }),
              );
              yield* assertTrue(Result.isFailure(result));
              if (Result.isFailure(result)) {
                const cause = result.failure;
                yield* assertTrue(cause instanceof CdpError);
                if (cause instanceof CdpError) {
                  yield* assertTrue(cause.reason instanceof PageTimeoutError);
                }
              }
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 5_000 },
    );

    // ── "should respect default timeout" ──────────────────────────────────────────
    // Same `instanceof` pattern as "should respect timeout" above.

    test.live(
      "page-wait-for-function.spec.ts - should respect default timeout",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              yield* page.setDefaultTimeout(1);
              const result = yield* Effect.result(page.waitForFunction("false"));
              yield* assertTrue(Result.isFailure(result));
              if (Result.isFailure(result)) {
                const cause = result.failure;
                yield* assertTrue(cause instanceof CdpError);
                if (cause instanceof CdpError) {
                  yield* assertTrue(cause.reason instanceof PageTimeoutError);
                }
              }
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 5_000 },
    );

    // ── "should disable timeout when its set to 0" ────────────────────────────────
    // Playwright convention: timeout: 0 disables the timeout.
    // Fixed by handling timeout: 0 → Duration.infinity in resolveTimeout.

    test.live("page-wait-for-function.spec.ts - should disable timeout when its set to 0", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const watchdogFiber = yield* Effect.forkChild(
              page.waitForFunction(
                () => {
                  (window as any).counter = ((window as any).counter || 0) + 1;
                  return Boolean((window as any).__injected);
                },
                undefined,
                { timeout: 0, polling: 10 },
              ),
            );
            // Wait until counter > 10 (proves polling continued without timeout)
            yield* page.waitForFunction(() => (window as any).counter > 10);
            yield* page.evaluate(() => {
              (window as any).__injected = true;
            });
            yield* Fiber.join(watchdogFiber);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should survive cross-process navigation" ─────────────────────────────────

    test.live("page-wait-for-function.spec.ts - should survive cross-process navigation", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            let fooFound = false;
            const fiber = yield* Effect.forkChild(
              page.waitForFunction("window.__FOO === 1").pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    fooFound = true;
                  }),
                ),
              ),
            );
            yield* page.goto(`${httpUrl}/empty`);
            yield* assertEqual(fooFound, false);
            yield* page.reload();
            yield* assertEqual(fooFound, false);
            // Navigate to cross-process origin (different hostname, same port)
            yield* page.goto(`${CROSS_PROCESS_PREFIX}/grid`);
            yield* assertEqual(fooFound, false);
            yield* page.evaluate(() => {
              (window as any).__FOO = 1;
            });
            yield* Fiber.join(fiber);
            yield* assertEqual(fooFound, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should survive navigations" ──────────────────────────────────────────────
    // Fixed: waitForFunction now catches "Page not attached to session" errors
    // and retries, matching Playwright behavior.

    test.live("page-wait-for-function.spec.ts - should survive navigations", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            const watchdogFiber = yield* Effect.forkChild(
              page.waitForFunction(() => Boolean((window as any).__done)),
            );
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.goto(`${httpUrl}/consolelog`);
            yield* page.evaluate(() => {
              (window as any).__done = true;
            });
            yield* Fiber.join(watchdogFiber);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should work with multiline body" ─────────────────────────────────────────

    test.live("page-wait-for-function.spec.ts - should work with multiline body", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            const result = yield* page.waitForFunction(`
              (() => true)()
            `);
            yield* assertEqual(result, true);
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should wait for predicate with arguments" ────────────────────────────────

    test.live("page-wait-for-function.spec.ts - should wait for predicate with arguments", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.goto(`${httpUrl}/empty`);
            yield* page.waitForFunction(
              (args: { arg1: number; arg2: number }) => args.arg1 + args.arg2 === 3,
              { arg1: 1, arg2: 2 },
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should not be called after finishing successfully" ───────────────────────
    // Uses page.onConsole stream to collect console messages and verify that
    // each waitForFunction only fires its callback once (no extra invocations
    // after resolving).

    test.live(
      "page-wait-for-function.spec.ts - should not be called after finishing successfully",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const messages: string[] = [];

              // Fork a fiber that collects console messages matching the pattern
              const consoleStream = yield* page.onConsole;
              yield* Effect.forkChild(
                consoleStream.pipe(
                  Stream.filter((msg) => msg.text.startsWith("waitForFunction")),
                  Stream.runForEach((msg) => Effect.sync(() => messages.push(msg.text))),
                ),
              );

              yield* page.waitForFunction(() => {
                console.log("waitForFunction1");
                return true;
              });
              yield* page.reload();
              yield* page.waitForFunction(() => {
                console.log("waitForFunction2");
                return true;
              });
              yield* page.reload();
              yield* page.waitForFunction(() => {
                console.log("waitForFunction3");
                return true;
              });

              yield* assertEqual(
                messages.join("|"),
                "waitForFunction1|waitForFunction2|waitForFunction3",
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should not be called after finishing unsuccessfully" ─────────────────────
    // Uses page.onConsole stream to collect console messages and verify that
    // each waitForFunction only fires its callback once (no extra invocations
    // after rejecting).

    test.live(
      "page-wait-for-function.spec.ts - should not be called after finishing unsuccessfully",
      () =>
        Effect.gen(function* () {
          yield* withPage(wsUrl, (page) =>
            Effect.gen(function* () {
              yield* page.goto(`${httpUrl}/empty`);
              const messages: string[] = [];

              // Fork a fiber that collects console messages matching the pattern
              const consoleStream = yield* page.onConsole;
              yield* Effect.forkChild(
                consoleStream.pipe(
                  Stream.filter((msg) => msg.text.startsWith("waitForFunction")),
                  Stream.runForEach((msg) => Effect.sync(() => messages.push(msg.text))),
                ),
              );

              yield* page
                .waitForFunction(() => {
                  console.log("waitForFunction1");
                  throw new Error("waitForFunction1");
                })
                .pipe(Effect.ignore);
              yield* page.reload();
              yield* page
                .waitForFunction(() => {
                  console.log("waitForFunction2");
                  throw new Error("waitForFunction2");
                })
                .pipe(Effect.ignore);
              yield* page.reload();
              yield* page
                .waitForFunction(() => {
                  console.log("waitForFunction3");
                  throw new Error("waitForFunction3");
                })
                .pipe(Effect.ignore);

              yield* assertEqual(
                messages.join("|"),
                "waitForFunction1|waitForFunction2|waitForFunction3",
              );
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should throw when frame is detached" ─────────────────────────────────────

    test.live(
      "page-wait-for-function.spec.ts - should throw when frame is detached",
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

              // Get the iframe frame
              const frames = yield* page.frames;
              yield* assertEqual(frames.length, 2);
              const iframe = frames[1];

              // Start waitForFunction in a fiber
              const fiber = yield* Effect.forkChild(
                iframe.waitForFunction(() => false, undefined, { timeout: 5000 }),
              );

              // Give the waitForFunction time to start polling
              yield* page.waitForTimeout(100);

              // Detach the iframe
              yield* page.evaluate((id: string) => {
                const frame = document.getElementById(id);
                if (frame) frame.remove();
              }, "frame1");

              // Wait for the fiber to complete - should get an error
              const result = yield* Effect.result(Fiber.join(fiber));

              // Should have failed with "Frame was detached" error
              yield* assertTrue(Result.isFailure(result));
              if (Result.isFailure(result)) {
                const errorMsg = getErrorMsg(result.failure);
                yield* assertTrue(
                  errorMsg.includes("detached") || errorMsg.includes("context was destroyed"),
                );
              }
            }),
          );
        }).pipe(Effect.provide(Cdp.layer)),
      { timeoutMs: 15_000 },
    );
  });
};
