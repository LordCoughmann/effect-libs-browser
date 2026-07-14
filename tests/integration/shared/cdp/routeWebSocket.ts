/**
 * Parity tests for `browser-cdp` WebSocket route interception.
 *
 * Mirrors Playwright's `page.routeWebSocket()` API (from
 * repos/cloudflare-playwright/tests/library/route-web-socket.spec.ts).
 * Subject under test: `browser-cdp` (`@effect-libs/browser-cdp`)
 *
 * Behavior verified:
 * - `routeWebSocket(url, handler)` intercepts WebSocket creation in the page
 * - Handler receives a `CdpWebSocketRoute` with the URL
 * - Mocked mode (no `connectToServer()`): handler can send/receive
 *   messages via `ws.send()` and `ws.onPageMessage()`
 * - After the handler returns, the page-side WebSocket is opened
 *   automatically (Playwright semantics)
 * - `routeWebSocket('/ws', ...)` + `ws.send('response')` — the page
 *   receives the message
 * - The page's `ws.send('request')` — the handler's `onPageMessage`
 *   receives it
 * - Unrouted WebSockets pass through transparently (no mock)
 * - `unrouteWebSocket` removes a specific handler
 *
 * Implementation:
 *
 * - The page-side mock replaces `globalThis.WebSocket` and posts events
 *   to Node via the `__pwWebSocketBinding` CDP binding. See
 *   `src/cdp/internal/Page/RouteWebSocket.ts` for the full architecture.
 * - The Node-side test server in `tests/setup/http-server.ts` exposes a
 *   standalone WebSocket echo server on port WS_PORT at `/ws`. The WS server
 *   runs on its own port (separate from the HTTP test server) to
 *   avoid a request/upgrade double-response conflict with the Effect HTTP
 *   API's request handler — see `TestWebSocketServerLive` in
 *   `tests/setup/http-server.ts` for the full explanation.
 * - The WS port is passed as a serialized arg to `page.evaluate(...)` —
 *   Vite SSR rewrites any imported symbol referenced inside an
 *   evaluate-payload arrow body into `__vite_ssr_import_0__.X` (which
 *   doesn't exist in browser eval context). Per ADR-0006, every
 *   import-referencing arrow body breaks the workerd runtime. Passing
 *   `WS_PORT` as an arg keeps the arrow body closure-free of imports.
 *   See ADR-0006 for the full SSR-rewriting rationale.
 *
 * NOTE: All tests use test.live because @effect/vitest's test.effect
 * injects TestClock, which prevents Effect.timeout from firing with
 * real time.
 */

// onPageMessage handlers are fire-and-forget by design; they need
// onPageMessage / onMessage callbacks are sync fire-and-forget by design.
// They use Effect.runPromiseWith(context)(effect) to spawn a child Effect
// without losing the parent's services (see the makeRouteHandler helper).

import type { Context } from "effect";

import type { CdpPageService, CdpWebSocketRouteHandlerCallback } from "@effect-libs/browser-cdp";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Option, Ref } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";

import { WS_PORT } from "../../../setup/http-server/Client.js";
import { assertContains, assertTrue } from "../../../utils/effect-test/EffectTest.js";

/** Page-side type for our test scripts — `window.log` and `window.ws` are attached. */
interface RouteWebSocketTestWindow {
  log?: string[];
  ws?: WebSocket;
  ws2?: WebSocket;
}
declare global {
  interface Window {
    log?: string[];
    ws?: WebSocket;
    ws2?: WebSocket;
  }
}

const withPage = <A, E, R>(wsUrl: string, fn: (page: CdpPageService) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const cdp = yield* Cdp;
    return yield* cdp.withConnection({ url: wsUrl }, ({ page }) => fn(page));
  });

/** Polls `page.evaluate` until the predicate returns truthy or timeout. */
const pollUntil = <T>(
  _page: CdpPageService,
  evaluate: () => Effect.Effect<T, unknown, never>,
  isDone: (value: T) => boolean,
  timeoutMs = 5000,
): Effect.Effect<T, unknown, never> =>
  Effect.gen(function* () {
    const start = Date.now();
    let value: T = yield* evaluate();
    // eslint-disable-next-line effect/prefer-while — explicit retry loop with deadline
    while (Date.now() - start < timeoutMs) {
      if (isDone(value)) return value;
      yield* Effect.sleep("20 millis");
      value = yield* evaluate();
    }
    return value;
  });

/**
 * Build a route handler that captures the current Effect runtime and
 * uses it to fire-and-forget Effect-returning calls (like `ws.send`)
 * from inside sync callbacks (like `ws.onPageMessage`).
 *
 * The proper Effect v4 pattern is `Effect.runPromiseWith(context)(effect)`
 * rather than `Effect.run*` directly. We need the context because we're
 * spawning a child Effect from a callback that doesn't have its own
 * Effect context.
 *
 * Usage:
 * ```ts
 * yield* page.routeWebSocket(/\/ws$/, makeRouteHandler((context) => (ws) => {
 *   ws.onPageMessage((message) => {
 *     if (message === "request") {
 *       void Effect.runPromiseWith(context)(ws.send("response"));
 *     }
 *   });
 * }));
 * ```
 */
const makeRouteHandler = <R = never>(
  setup: (context: Context.Context<R>) => CdpWebSocketRouteHandlerCallback,
): Effect.Effect<CdpWebSocketRouteHandlerCallback, never, R> =>
  Effect.gen(function* () {
    const context = yield* Effect.context<R>();
    return setup(context);
  });

export const defineRouteWebSocketTests = (api: TestApi, config: TestConfig): void => {
  const { test, describe } = api;
  const { wsUrl, httpUrl } = config;

  describe("routeWebSocket", () => {
    // ── "should work with mocked WebSocket" ───────────────────────────────

    test.skip("route-web-socket.spec.ts - should work with mocked WebSocket [SKIP: NOT_PLANNED - mock mode is testing-ergonomics per ADR-0001]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.routeWebSocket(
              /\/ws$/,
              yield* makeRouteHandler((context) => (ws) => {
                ws.onPageMessage((message) => {
                  if (typeof message === "string" && message === "request") {
                    void Effect.runPromiseWith(context)(ws.send("response"));
                  }
                });
              }),
            );

            yield* page.goto(`${httpUrl}/empty`);

            // Open a WebSocket in the page
            yield* page.evaluate((port) => {
              window.log = [] as string[];
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.addEventListener("open", () => window.log!.push("open"));
              ws.addEventListener("message", (event) => {
                window.log!.push(`message: ${event.data}`);
              });
              window.ws = ws;
            }, WS_PORT);

            // Wait for open
            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("open"),
            );

            // Send a message from the page; the mocked server replies
            yield* page.evaluate(() => {
              (window as RouteWebSocketTestWindow).ws!.send("request");
            });

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("message: response"),
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── "should pass through unrouted WebSockets" ─────────────────────────

    test.live("route-web-socket.spec.ts - should pass through unrouted WebSockets", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Register a route for a different URL — should not match /ws
            yield* page.routeWebSocket(/\/never-matches/, () => Effect.void);

            yield* page.goto(`${httpUrl}/empty`);

            // Open a WebSocket in the page — unrouted, so it connects to
            // the real WS server (echo). Send a message; the real server
            // echoes it back, proving the connection survived.
            yield* page.evaluate((port) => {
              window.log = [] as string[];
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.addEventListener("open", () => window.log!.push("open"));
              ws.addEventListener("message", (event) => {
                window.log!.push(`message: ${event.data}`);
              });
              window.ws = ws;
            }, WS_PORT);

            // Wait for open
            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("open"),
            );

            // Echo a message via the real WS server
            yield* page.evaluate(() => {
              (window as RouteWebSocketTestWindow).ws!.send("hello");
            });

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.some((entry) => entry.startsWith("message: ")),
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)),
    );

    // ── "should expose the URL to the handler" ────────────────────────────

    test.skip("route-web-socket.spec.ts - should expose the URL to the handler [SKIP: NOT_PLANNED - mock mode is testing-ergonomics per ADR-0001]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            const capturedUrl = yield* Ref.make<Option.Option<string>>(Option.none());
            const handler: CdpWebSocketRouteHandlerCallback = yield* makeRouteHandler(
              (context) => (ws) => {
                void Effect.runPromiseWith(context)(
                  Ref.update(capturedUrl, () => Option.some(ws.url)),
                );
              },
            );
            yield* page.routeWebSocket(/\/ws$/, handler);

            yield* page.goto(`${httpUrl}/empty`);

            yield* page.evaluate((port) => {
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              window.ws = ws;
            }, WS_PORT);

            yield* pollUntil(page, () => Ref.get(capturedUrl), Option.isSome);
            const url = yield* Ref.get(capturedUrl);
            yield* assertTrue(Option.isSome(url));
            if (Option.isSome(url)) {
              yield* assertContains(url.value, "/ws");
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── "should not throw with empty handler" ─────────────────────────────

    test.skip("route-web-socket.spec.ts - should not throw with empty handler [SKIP: NOT_PLANNED - mock mode is testing-ergonomics per ADR-0001]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.routeWebSocket(/\/ws$/, () => Effect.void);
            yield* page.goto(`${httpUrl}/empty`);

            yield* page.evaluate((port) => {
              window.log = [] as string[];
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.addEventListener("open", () => window.log!.push("open"));
              window.ws = ws;
            }, WS_PORT);

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("open"),
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── "should work with connectToServer" ────────────────────────────────

    test.skip("route-web-socket.spec.ts - should work with connectToServer [SKIP: NOT_PLANNED - mock mode is testing-ergonomics per ADR-0001]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.routeWebSocket(
              /\/ws$/,
              yield* makeRouteHandler((context) => (ws) => {
                const server = ws.connectToServer();
                // Forward messages both ways
                ws.onPageMessage((message) => {
                  void Effect.runPromiseWith(context)(server.send(message));
                });
                server.onMessage((message) => {
                  void Effect.runPromiseWith(context)(ws.send(message));
                });
              }),
            );

            yield* page.goto(`${httpUrl}/empty`);

            yield* page.evaluate((port) => {
              window.log = [] as string[];
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.addEventListener("open", () => window.log!.push("open"));
              ws.addEventListener("message", (event) => {
                window.log!.push(`message: ${event.data}`);
              });
              window.ws = ws;
            }, WS_PORT);

            // Wait for open
            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("open"),
            );

            // Send a message; the real server echoes it back
            yield* page.evaluate(() => {
              (window as RouteWebSocketTestWindow).ws!.send("hello");
            });

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.some((e) => e.startsWith("message: ")),
            );

            const log = yield* page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []);
            if (Array.isArray(log)) {
              yield* assertTrue(log.some((e) => e === "message: hello"));
            }
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── "should support pattern match with two routes" ────────────────────

    test.skip("route-web-socket.spec.ts - should pattern match with two routes [SKIP: NOT_PLANNED - mock mode is testing-ergonomics per ADR-0001]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            // Two routes — last-registered first.
            yield* page.routeWebSocket(
              /\/ws$/,
              yield* makeRouteHandler((context) => (ws) => {
                ws.onPageMessage((message) => {
                  if (message === "request1") {
                    void Effect.runPromiseWith(context)(ws.send("response1"));
                  }
                });
              }),
            );
            yield* page.routeWebSocket(
              /.*/,
              yield* makeRouteHandler((context) => (ws) => {
                ws.onPageMessage((message) => {
                  if (message === "fallback") {
                    void Effect.runPromiseWith(context)(ws.send("response-all"));
                  }
                });
              }),
            );

            yield* page.goto(`${httpUrl}/empty`);

            yield* page.evaluate((port) => {
              window.log = [] as string[];
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.addEventListener("open", () => window.log!.push("open"));
              ws.addEventListener("message", (event) => {
                window.log!.push(`message: ${event.data}`);
              });
              window.ws = ws;
            }, WS_PORT);

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("open"),
            );

            // First registered (the more specific one) handles first;
            // the fallback (catch-all) handles unhandled messages.
            yield* page.evaluate(() => {
              const w = (window as RouteWebSocketTestWindow).ws!;
              w.send("request1");
              w.send("fallback");
            });

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) =>
                Array.isArray(log) &&
                log.includes("message: response1") &&
                log.includes("message: response-all"),
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── "should close the page socket on ws.close()" ──────────────────────

    test.skip("route-web-socket.spec.ts - should close the page socket on ws.close() [SKIP: NOT_PLANNED - mock mode is testing-ergonomics per ADR-0001]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.routeWebSocket(/\/ws$/, () => Effect.void);
            yield* page.goto(`${httpUrl}/empty`);

            yield* page.evaluate((port) => {
              window.log = [] as string[];
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.addEventListener("open", () => window.log!.push("open"));
              ws.addEventListener("close", (event) => {
                window.log!.push(`close: ${event.code}`);
              });
              window.ws = ws;
            }, WS_PORT);

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("open"),
            );

            yield* page.evaluate(() => {
              (window as RouteWebSocketTestWindow).ws!.close(1000, "bye");
            });

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.some((e) => e.startsWith("close: ")),
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── "should allow user to close the page from the route" ──────────────

    test.skip("route-web-socket.spec.ts - should allow user to close the page from the route [SKIP: NOT_PLANNED - mock mode is testing-ergonomics per ADR-0001]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.routeWebSocket(/\/ws$/, (ws) =>
              Effect.gen(function* () {
                // Send a message, then close with a custom code
                yield* ws.send("bye");
                yield* ws.close({ code: 4000, reason: "user-closed" });
              }),
            );

            yield* page.goto(`${httpUrl}/empty`);

            yield* page.evaluate((port) => {
              window.log = [] as string[];
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.addEventListener("open", () => window.log!.push("open"));
              ws.addEventListener("message", (event) => {
                window.log!.push(`message: ${event.data}`);
              });
              ws.addEventListener("close", (event) => {
                window.log!.push(`close: ${event.code}:${event.reason}`);
              });
              window.ws = ws;
            }, WS_PORT);

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) =>
                Array.isArray(log) &&
                log.includes("message: bye") &&
                log.some((e) => e.startsWith("close: 4000")),
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── "should support unrouteWebSocket" ─────────────────────────────────

    test.skip("route-web-socket.spec.ts - should support unrouteWebSocket [SKIP: NOT_PLANNED - mock mode is testing-ergonomics per ADR-0001]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            const handler: CdpWebSocketRouteHandlerCallback = yield* makeRouteHandler(
              (context) => (ws) => {
                ws.onPageMessage((message) => {
                  if (message === "request") {
                    void Effect.runPromiseWith(context)(ws.send("intercepted"));
                  }
                });
              },
            );
            yield* page.routeWebSocket(/\/ws$/, handler);

            yield* page.goto(`${httpUrl}/empty`);
            yield* page.evaluate((port) => {
              window.log = [] as string[];
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.addEventListener("message", (event) => {
                window.log!.push(`message: ${event.data}`);
              });
              window.ws = ws;
            }, WS_PORT);

            // Wait for the message handler to be installed
            yield* Effect.sleep("50 millis");

            // Send a message; should be intercepted
            yield* page.evaluate(() => {
              (window as RouteWebSocketTestWindow).ws!.send("request");
            });

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("message: intercepted"),
            );

            // Unroute and reset
            yield* page.unrouteWebSocket(/\/ws$/, handler);
            yield* page.evaluate(() => {
              (window as RouteWebSocketTestWindow).log = [];
            });

            // Open a new WebSocket — should pass through to the real server
            yield* page.evaluate((port) => {
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.addEventListener("message", (event) => {
                window.log!.push(`message: ${event.data}`);
              });
              window.ws2 = ws;
            }, WS_PORT);

            yield* Effect.sleep("50 millis");

            // Send a message; the real server echoes it back
            yield* page.evaluate(() => {
              (window as RouteWebSocketTestWindow).ws2!.send("passthrough");
            });

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("message: passthrough"),
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── "should support binary messages" ──────────────────────────────────

    test.skip("route-web-socket.spec.ts - should support binary messages [SKIP: NOT_PLANNED - mock mode is testing-ergonomics per ADR-0001]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.routeWebSocket(
              /\/ws$/,
              yield* makeRouteHandler((context) => (ws) => {
                ws.onPageMessage((message) => {
                  // Echo the binary message back
                  void Effect.runPromiseWith(context)(ws.send(message));
                });
              }),
            );

            yield* page.goto(`${httpUrl}/empty`);

            yield* page.evaluate((port) => {
              window.log = [] as string[];
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.binaryType = "arraybuffer";
              ws.addEventListener("open", () => window.log!.push("open"));
              ws.addEventListener("message", async (event) => {
                const view = new Uint8Array(event.data as ArrayBuffer);
                const text = new TextDecoder().decode(view);
                window.log!.push(`message: ${text}`);
              });
              window.ws = ws;
            }, WS_PORT);

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("open"),
            );

            // Send a binary message (Uint8Array)
            yield* page.evaluate(() => {
              const w = (window as RouteWebSocketTestWindow).ws!;
              const bytes = new Uint8Array([104, 105]); // "hi"
              w.send(bytes);
            });

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("message: hi"),
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));

    // ── "should unrouteAllWebSocket" ──────────────────────────────────────

    test.skip("route-web-socket.spec.ts - should unrouteAllWebSocket [SKIP: NOT_PLANNED - mock mode is testing-ergonomics per ADR-0001]", () =>
      Effect.gen(function* () {
        yield* withPage(wsUrl, (page) =>
          Effect.gen(function* () {
            yield* page.routeWebSocket(
              /\/ws$/,
              yield* makeRouteHandler((context) => (ws) => {
                ws.onPageMessage((message) => {
                  if (message === "x") {
                    void Effect.runPromiseWith(context)(ws.send("mock"));
                  }
                });
              }),
            );

            yield* page.goto(`${httpUrl}/empty`);
            yield* page.evaluate((port) => {
              window.log = [] as string[];
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.addEventListener("message", (event) => {
                window.log!.push(`message: ${event.data}`);
              });
              window.ws = ws;
            }, WS_PORT);

            yield* Effect.sleep("50 millis");

            // Send message; should be intercepted
            yield* page.evaluate(() => {
              (window as RouteWebSocketTestWindow).ws!.send("x");
            });

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("message: mock"),
            );

            // Unroute all
            yield* page.unrouteAllWebSocket();
            yield* page.evaluate(() => {
              (window as RouteWebSocketTestWindow).log = [];
            });

            // Open a new WebSocket — should pass through
            yield* page.evaluate((port) => {
              const ws = new WebSocket(`ws://localhost:${port}/ws`);
              ws.addEventListener("message", (event) => {
                window.log!.push(`message: ${event.data}`);
              });
              window.ws2 = ws;
            }, WS_PORT);

            yield* Effect.sleep("50 millis");

            yield* page.evaluate(() => {
              (window as RouteWebSocketTestWindow).ws2!.send("hello");
            });

            yield* pollUntil(
              page,
              () => page.evaluate(() => (window as RouteWebSocketTestWindow).log ?? []),
              (log) => Array.isArray(log) && log.includes("message: hello"),
            );
          }),
        );
      }).pipe(Effect.provide(Cdp.layer)));
  });
};
