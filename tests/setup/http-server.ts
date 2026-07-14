/**
 * HTTP test server for serving test fixtures.
 *
 * Uses Effect HttpApi for a clean, declarative HTTP server.
 * Serves test pages from tests/integration/fixtures/pages.ts.
 *
 * When run via the orchestrator, multiple child processes may try to start
 * this server. The layer checks if the port is already in use and skips
 * starting if so (graceful port share).
 *
 * @module tests/setup/http-server
 */

import { NodeHttpServer } from "@effect/platform-node";
import { allTestPages as testPages } from "@test/integration/fixtures/registry.ts";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { join } from "node:path";

import { AdminGroup } from "./http-server/Admin.ts";
import {
  TestServerClient,
  HTTP_PORT,
  HTTPS_PORT,
  WS_PORT,
  CROSS_PROCESS_PREFIX,
  HTTPS_CROSS_PROCESS_PREFIX,
} from "./http-server/Client.ts";
import {
  getRoute,
  handleDynamicRoute,
  setRoute,
  hasPendingRequest,
  registerWaiter,
  releasePending,
  clearAll,
  setCSP as setCSPState,
  getCSP,
  getRequestHeaders,
  notifyRequestArrived,
  type PendingRequest,
} from "./http-server/State.ts";
import { attachWebSocketHandler, type WebSocketHandler } from "./WebSocketServer.ts";
export {
  TestServerClient,
  HTTP_PORT,
  HTTPS_PORT,
  WS_PORT,
  CROSS_PROCESS_PREFIX,
  HTTPS_CROSS_PROCESS_PREFIX,
};

/** Base URL for the HTTP test server (e.g. http://localhost:9322). */
export const PREFIX = `http://localhost:${HTTP_PORT}`;

/** Base URL for the HTTPS test server (e.g. https://localhost:9765). */
export const HTTPS_PREFIX = `https://localhost:${HTTPS_PORT}`;

/** URL for the empty test page. */
export const EMPTY_PAGE = `${PREFIX}/empty`;

// ── HTTP API Definition ──────────────────────────────────────────────────────

const Api = HttpApi.make("TestPages")
  .add(AdminGroup)
  .add(
    HttpApiGroup.make("Pages")
      .add(
        // Catch-all endpoint for serving test pages (GET)
        HttpApiEndpoint.get("page", "*", {
          success: Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/html" })),
        }),
      )
      .add(
        // Catch-all endpoint for POST requests (dynamic routes)
        HttpApiEndpoint.post("postPage", "*", {
          success: Schema.String,
        }),
      )
      .add(
        // Catch-all endpoint for PUT requests (dynamic routes)
        HttpApiEndpoint.put("putPage", "*", {
          success: Schema.String,
        }),
      )
      .add(
        // Catch-all endpoint for PATCH requests (dynamic routes)
        HttpApiEndpoint.patch("patchPage", "*", {
          success: Schema.String,
        }),
      )
      .add(
        // Catch-all endpoint for DELETE requests (dynamic routes)
        HttpApiEndpoint.delete("deletePage", "*", {
          success: Schema.String,
        }),
      )
      .add(
        // Health check endpoint
        HttpApiEndpoint.get("health", "/health", {
          success: Schema.String,
        }),
      ),
  )
  .add(
    HttpApiGroup.make("Api").add(
      // Echo endpoint — returns request method and body as JSON
      HttpApiEndpoint.post("echo", "/api/echo", {
        payload: Schema.Struct({ body: Schema.String }),
        success: Schema.Struct({
          method: Schema.String,
          body: Schema.String,
          cookies: Schema.NullOr(Schema.String),
          headers: Schema.Unknown,
        }),
      }),
    ),
  );

// ── HTTP API Implementation ─────────────────────────────────────────────────

const AdminLive = HttpApiBuilder.group(Api, "Admin", (handlers) =>
  handlers
    .handle("setRoute", (ctx) =>
      Effect.sync(() => {
        const { path, action, delayMs, body, status, contentType, redirectUrl } = ctx.payload;
        setRoute(path, { action, delayMs, body, status, contentType, redirectUrl });
        return { success: true, message: `Route registered: ${path}` };
      }),
    )
    .handle("setCSP", (ctx) =>
      Effect.sync(() => {
        const { path, policy } = ctx.payload;
        setCSPState(path, policy);
        return { success: true, message: `CSP set for: ${path}` };
      }),
    )
    .handle("waitForRequest", (ctx) =>
      Effect.gen(function* () {
        const reqPath = ctx.payload.path;

        const waitEffect = Effect.callback<
          { success: boolean; message?: string; headers?: Record<string, string> },
          never,
          never
        >((resume) => {
          if (hasPendingRequest(reqPath)) {
            const headers = getRequestHeaders(reqPath);
            resume(
              Effect.succeed({ success: true, message: `Request arrived: ${reqPath}`, headers }),
            );
            return;
          }
          registerWaiter(reqPath, () => {
            const headers = getRequestHeaders(reqPath);
            resume(
              Effect.succeed({ success: true, message: `Request arrived: ${reqPath}`, headers }),
            );
          });
        });

        const result = yield* waitEffect.pipe(
          Effect.timeout("10 seconds"),
          Effect.catchTag("TimeoutError", () =>
            Effect.succeed({
              success: false as const,
              message: `Timeout waiting for: ${reqPath}`,
            }),
          ),
        );

        return result;
      }),
    )
    .handle("release", (ctx) =>
      Effect.sync(() => {
        const { path, body } = ctx.payload;
        releasePending(path, body);
        return { success: true, message: `Released: ${path}` };
      }),
    )
    .handle("clear", () =>
      Effect.sync(() => {
        clearAll();
        return { success: true, message: "All routes cleared" };
      }),
    ),
);

const PagesLive = HttpApiBuilder.group(Api, "Pages", (handlers) =>
  handlers
    .handle("page", (ctx) => {
      const url = new URL(ctx.request.url, `http://localhost:${HTTP_PORT}`);
      const pathname = url.pathname;
      const headers = ctx.request.headers as Record<string, string>;

      // Check for dynamic route first
      const routeConfig = getRoute(pathname);

      if (routeConfig) {
        return handleDynamicRoute(pathname, routeConfig, headers);
      }

      // Check for CSP policy
      const cspPolicy = getCSP(pathname);

      // Fall back to static pages
      const page = testPages[pathname];
      if (page) {
        // Basic auth gate for /auth/* paths. When the Authorization header
        // is missing or wrong, return 401 + WWW-Authenticate so the browser
        // fires a `Fetch.authRequired` event (consumed by the page's Route
        // manager when `setHTTPCredentials` is configured).
        if (pathname.startsWith("/auth/")) {
          const auth = headers["authorization"] ?? "";
          const expected = "Basic " + Buffer.from("user:pass").toString("base64");
          if (auth !== expected) {
            return Effect.succeed(
              HttpServerResponse.text("Unauthorized", {
                status: 401,
                headers: {
                  "WWW-Authenticate": 'Basic realm="test"',
                  "Content-Type": "text/plain",
                },
              }),
            );
          }
        }

        // Notify waiters that a request arrived
        const pending: PendingRequest = {
          timestamp: Date.now(),
          release: () => {},
          released: Promise.resolve(),
          done: true,
          _body: undefined,
        };
        notifyRequestArrived(pathname, pending, headers);

        if (cspPolicy) {
          return Effect.succeed(
            HttpServerResponse.text(page, {
              headers: { "Content-Security-Policy": cspPolicy },
            }),
          );
        }
        // Special case: /download/* paths are served with
        // Content-Disposition: attachment so the browser triggers a download.
        if (pathname.startsWith("/download/")) {
          const filename = pathname.slice("/download/".length);
          return Effect.succeed(
            HttpServerResponse.text(page, {
              headers: {
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Content-Type": "application/octet-stream",
              },
            }),
          );
        }
        return Effect.succeed(page);
      }

      // 404
      const notFoundPage = `<!DOCTYPE html><html><body><h1>404 - Not Found</h1><p>Path: ${pathname}</p></body></html>`;

      // Notify waiters that a request arrived (even for 404)
      const pending: PendingRequest = {
        timestamp: Date.now(),
        release: () => {},
        released: Promise.resolve(),
        done: true,
        _body: undefined,
      };
      notifyRequestArrived(pathname, pending, headers);

      if (cspPolicy) {
        return Effect.succeed(
          HttpServerResponse.text(notFoundPage, {
            headers: { "Content-Security-Policy": cspPolicy },
          }),
        );
      }
      return Effect.succeed(notFoundPage);
    })
    // Handler for POST catch-all - checks dynamic routes
    .handle("postPage", (ctx) => {
      const url = new URL(ctx.request.url, `http://localhost:${HTTP_PORT}`);
      const pathname = url.pathname;
      const headers = ctx.request.headers as Record<string, string>;

      const routeConfig = getRoute(pathname);
      if (routeConfig) {
        return handleDynamicRoute(pathname, routeConfig, headers);
      }

      // Notify waiters for non-dynamic routes
      const pending: PendingRequest = {
        timestamp: Date.now(),
        release: () => {},
        released: Promise.resolve(),
        done: true,
        _body: undefined,
      };
      notifyRequestArrived(pathname, pending, headers);

      return Effect.succeed(JSON.stringify({ error: "Not Found", path: pathname }));
    })
    // Handler for PUT catch-all - checks dynamic routes
    .handle("putPage", (ctx) => {
      const url = new URL(ctx.request.url, `http://localhost:${HTTP_PORT}`);
      const pathname = url.pathname;
      const headers = ctx.request.headers as Record<string, string>;

      const routeConfig = getRoute(pathname);
      if (routeConfig) {
        return handleDynamicRoute(pathname, routeConfig, headers);
      }

      // Notify waiters for non-dynamic routes
      const pending: PendingRequest = {
        timestamp: Date.now(),
        release: () => {},
        released: Promise.resolve(),
        done: true,
        _body: undefined,
      };
      notifyRequestArrived(pathname, pending, headers);

      return Effect.succeed(JSON.stringify({ error: "Not Found", path: pathname }));
    })
    // Handler for PATCH catch-all - checks dynamic routes
    .handle("patchPage", (ctx) => {
      const url = new URL(ctx.request.url, `http://localhost:${HTTP_PORT}`);
      const pathname = url.pathname;
      const headers = ctx.request.headers as Record<string, string>;

      const routeConfig = getRoute(pathname);
      if (routeConfig) {
        return handleDynamicRoute(pathname, routeConfig, headers);
      }

      // Notify waiters for non-dynamic routes
      const pending: PendingRequest = {
        timestamp: Date.now(),
        release: () => {},
        released: Promise.resolve(),
        done: true,
        _body: undefined,
      };
      notifyRequestArrived(pathname, pending, headers);

      return Effect.succeed(JSON.stringify({ error: "Not Found", path: pathname }));
    })
    // Handler for DELETE catch-all - checks dynamic routes
    .handle("deletePage", (ctx) => {
      const url = new URL(ctx.request.url, `http://localhost:${HTTP_PORT}`);
      const pathname = url.pathname;
      const headers = ctx.request.headers as Record<string, string>;

      const routeConfig = getRoute(pathname);
      if (routeConfig) {
        return handleDynamicRoute(pathname, routeConfig, headers);
      }

      // Notify waiters for non-dynamic routes
      const pending: PendingRequest = {
        timestamp: Date.now(),
        release: () => {},
        released: Promise.resolve(),
        done: true,
        _body: undefined,
      };
      notifyRequestArrived(pathname, pending, headers);

      return Effect.succeed(JSON.stringify({ error: "Not Found", path: pathname }));
    })
    .handle("health", () => Effect.succeed("ok")),
);

const ApiLive = HttpApiBuilder.group(Api, "Api", (handlers) =>
  handlers.handle("echo", (ctx) =>
    Effect.sync(() => {
      const method = ctx.request.method;
      const payload = ctx.payload as { body: string };
      const body = payload.body;
      const headers = ctx.request.headers as Record<string, string>;
      const cookieHeader = headers["cookie"] ?? headers["Cookie"] ?? null;
      return { method, body, cookies: cookieHeader, headers };
    }),
  ),
);

// ── WebSocket Echo Handler ──────────────────────────────────────────────────

/**
 * WebSocket handler that echoes text and binary messages back to the
 * client. Also handles `__test_command__` text messages (a control
 * protocol used by integration tests to drive the server in ways that
 * a real echo server can't, e.g. close with a specific code, send a
 * custom message, etc.).
 *
 * `__test_command__` payloads are JSON objects with a `cmd` field:
 * - `{cmd: "send", message: "..."}` — server sends a text frame
 * - `{cmd: "send-binary", data: "base64..."}` — server sends a binary frame
 * - `{cmd: "close", code: number, reason: string}` — server sends a close frame
 * - `{cmd: "echo", message: "..."}` — server echoes a different message back
 *
 * The command is consumed and never echoed back.
 */
const echoWebSocketHandler: WebSocketHandler = {
  onMessage: (conn, payload, isText) => {
    if (isText) {
      const text = payload.toString("utf8");
      if (text.startsWith("__test_command__:")) {
        const json = text.slice("__test_command__:".length);
        try {
          const command = JSON.parse(json) as {
            cmd: string;
            message?: string;
            data?: string;
            code?: number;
            reason?: string;
          };
          if (command.cmd === "send" && typeof command.message === "string") {
            conn.sendText(command.message);
            return;
          }
          if (command.cmd === "send-binary" && typeof command.data === "string") {
            conn.sendBinary(Buffer.from(command.data, "base64"));
            return;
          }
          if (command.cmd === "close") {
            conn.close(command.code ?? 1000, command.reason ?? "");
            return;
          }
          if (command.cmd === "echo" && typeof command.message === "string") {
            conn.sendText(command.message);
            return;
          }
        } catch {
          /* fall through to default echo */
        }
      }
      // Default: echo back
      conn.sendText(text);
    } else {
      // Binary: echo back as binary
      conn.sendBinary(payload);
    }
  },
};

// ── HTTP Server Layer ───────────────────────────────────────────────────────

/**
 * HTTP server with fast graceful shutdown to avoid hanging after tests.
 * Default gracefulShutdownTimeout (20s) causes the process to hang.
 */
const createTestHttpServer = () => {
  const server = createHttpServer();
  // Disable per-message keep-alive idle timeout (Node's default is 5s)
  // — WebSocket connections would otherwise be closed by Node.
  server.requestTimeout = 0;
  server.keepAliveTimeout = 0;
  server.headersTimeout = 0;
  // NOTE: We deliberately do NOT call attachWebSocketHandler here.
  // The Effect HTTP API's request handler responds to upgrade requests
  // with 200, which conflicts with our 101 response (causing the WS
  // client to see malformed HTTP and close the connection with 1006).
  // The WS server is run separately on its own port — see
  // `startWebSocketServer` in this file.
  return server;
};

const HttpServerLayer = NodeHttpServer.layer(createTestHttpServer, {
  port: HTTP_PORT,
});

// ── HTTPS Server Layer ───────────────────────────────────────────────────────

/**
 * HTTPS server options with self-signed certificate for localhost testing.
 */
const httpsOptions = {
  key: readFileSync(join(import.meta.dirname, "../fixtures/certs/server.key")),
  cert: readFileSync(join(import.meta.dirname, "../fixtures/certs/server.crt")),
};

/**
 * HTTPS server with aggressive keep-alive timeout to ensure fast cleanup.
 */
const createTestHttpsServer = () => {
  const server = createHttpsServer(httpsOptions);
  server.keepAliveTimeout = 0;
  server.headersTimeout = 0;
  server.requestTimeout = 0;
  // NOTE: No attachWebSocketHandler here either — see createTestHttpServer
  return server;
};

const HttpsServerLayer = NodeHttpServer.layer(createTestHttpsServer, {
  port: HTTPS_PORT,
});

// ── Port Check ───────────────────────────────────────────────────────────────

/**
 * Check if the HTTP server is already running by making a health check request.
 */
const isHttpServerRunning = Effect.gen(function* () {
  const result = yield* Effect.tryPromise({
    try: () =>
      fetch(`http://localhost:${HTTP_PORT}/health`, {
        signal: AbortSignal.timeout(1000),
      })
        .then((res) => res.text())
        .then((text) => text === '"ok"' || text === "ok"),
    catch: () => false,
  }).pipe(
    Effect.match({
      onFailure: () => false,
      onSuccess: (ok) => ok,
    }),
  );
  return result;
});

/**
 * Check if the HTTPS server is already running by making a health check request.
 */
const isHttpsServerRunning = Effect.gen(function* () {
  const result = yield* Effect.tryPromise({
    try: () =>
      fetch(`https://localhost:${HTTPS_PORT}/health`, {
        signal: AbortSignal.timeout(1000),
        // Allow self-signed certificate for testing
      })
        .then((res) => res.text())
        .then((text) => text === '"ok"' || text === "ok"),
    catch: () => false,
  }).pipe(
    Effect.match({
      onFailure: () => false,
      onSuccess: (ok) => ok,
    }),
  );
  return result;
});

/**
 * Layer that provides an HTTP server serving test fixtures with dynamic route control.
 */
export const TestHttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const running = yield* isHttpServerRunning;

    if (running) {
      yield* Effect.logDebug(
        `[http-server] Port ${HTTP_PORT} already in use, skipping server start`,
      );
      return Layer.empty;
    }

    yield* Effect.logDebug(`[http-server] Starting HTTP server on port ${HTTP_PORT}`);
    return HttpApiBuilder.layer(Api).pipe(
      Layer.provide(AdminLive),
      Layer.provide(PagesLive),
      Layer.provide(ApiLive),
      HttpRouter.serve,
      Layer.provide(HttpServerLayer),
    );
  }),
);

/**
 * Layer that provides an HTTPS server serving test fixtures with dynamic route control.
 */
export const TestHttpsServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const running = yield* isHttpsServerRunning;

    if (running) {
      yield* Effect.logDebug(
        `[https-server] Port ${HTTPS_PORT} already in use, skipping server start`,
      );
      return Layer.empty;
    }

    yield* Effect.logDebug(`[https-server] Starting HTTPS server on port ${HTTPS_PORT}`);
    return HttpApiBuilder.layer(Api).pipe(
      Layer.provide(AdminLive),
      Layer.provide(PagesLive),
      Layer.provide(ApiLive),
      HttpRouter.serve,
      Layer.provide(HttpsServerLayer),
    );
  }),
);

/**
 * Layer that provides both HTTP and HTTPS test servers.
 * Use this for tests that need HTTPS support.
 */
export const TestServersLive = Layer.merge(TestHttpServerLive, TestHttpsServerLive);

// ── WebSocket Server (separate port) ───────────────────────────────────────────────────────────────

/**
 * WebSocket port for the standalone WS server.
 *
 * The WS server runs on its own port (separate from HTTP) to avoid the
 * conflict with the Effect HTTP API's request handler, which would otherwise
 * write a 200 response to the upgrade socket and cause the WS client to
 * close the connection (1006 abnormal closure).
 */
const WS_SERVER_PORT = WS_PORT;

/** Returns the WS server's base URL (e.g. `ws://localhost:9323`). */
export const WS_BASE_URL = `ws://localhost:${WS_SERVER_PORT}`;

/**
 * Layer that provides a standalone WebSocket echo server on its own port.
 *
 * Echoes text and binary messages back to the client. Mounted at `/ws`.
 * Also handles a small `__test_command__` protocol for tests that need
 * to drive the server (close with a specific code, send a custom message, etc.).
 *
 * Use {@link TestWebSocketServerLive} in tests that exercise WebSocket route
 * interception. For most tests, you don't need this layer — the default
 * test infrastructure runs both the HTTP and WS servers.
 *
 * The layer handles EADDRINUSE gracefully: if the port is already in use
 * (e.g., another orchestrator process started the WS server), it skips
 * startup instead of crashing. This mirrors the idempotent startup
 * pattern used by {@link TestHttpServerLive}.
 */
export const TestWebSocketServerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const wsServer = createHttpServer();
    wsServer.requestTimeout = 0;
    wsServer.keepAliveTimeout = 0;
    wsServer.headersTimeout = 0;
    attachWebSocketHandler(wsServer, "/ws", echoWebSocketHandler);

    yield* Effect.callback<void, never>((resume) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resume(Effect.void);
        }
      };
      wsServer.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          Effect.logDebug(
            `[ws-server] Port ${WS_SERVER_PORT} already in use, skipping server start`,
          ).pipe(Effect.runFork);
        } else {
          Effect.logError("[ws-server] listen error", err).pipe(Effect.runFork);
        }
        done();
      });
      wsServer.listen(WS_SERVER_PORT, () => done());
    });

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        wsServer.close();
        wsServer.closeAllConnections();
      }),
    );
  }),
);

/** Layer that provides HTTP, HTTPS, AND WebSocket test servers. */
export const TestServersWithWebSocketLive = Layer.merge(TestServersLive, TestWebSocketServerLive);
