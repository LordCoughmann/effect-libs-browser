/**
 * Dev script for running this example with local Chrome.
 *
 * Uses Effect + @effect/platform-node consistently for all operations.
 * ChildProcess.make handles acquire/release automatically via Scope.
 *
 * Usage:
 *   pnpm dev:chrome
 *
 * From the example directory, starts Chrome with remote debugging
 * and runs wrangler dev with the WebSocket URL.
 */

import { NodeServices, NodeRuntime, NodeHttpClient } from "@effect/platform-node";
import { Effect, Schedule, Console, FileSystem, Stream, Layer, Schema } from "effect";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess } from "effect/unstable/process";

// Minimal local schema for Chrome's /json/version response.
// (The full CDP `ChromeVersionResponse` schema is an internal implementation
// detail of @effect-libs/browser-cdp and not part of its public API.)
const ChromeVersion = Schema.Struct({
  webSocketDebuggerUrl: Schema.String,
});

const CHROME_PORT = 9222;

// ── Chrome Path ──────────────────────────────────────────────────────────────

const getChromePath = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const home = process.env.HOME ?? "/home/user";
  const username = process.env.USER ?? "user";

  const paths = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    `${home}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`,
    `/mnt/c/Users/${username}/AppData/Local/ms-playwright/chromium-1208/chrome-win/chrome.exe`,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean) as string[];

  for (const path of paths) {
    const exists = yield* fs.exists(path);
    if (exists) return path;
  }
  return null;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Kill any Chrome process listening on the given port */
const killChromeOnPort = (port: number) =>
  Effect.gen(function* () {
    // Run lsof to find processes on the port, then kill them
    // This is a one-shot command - scope closes immediately after
    const handle = yield* ChildProcess.make`lsof -ti:${port} | xargs -r kill -9`;

    // Wait for the command to complete (ignore errors)
    yield* handle.exitCode.pipe(Effect.catch(() => Effect.void));
  });

/** Wait for Chrome to be ready and return the WebSocket URL */
const waitForChrome = (port: number): Effect.Effect<string, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const fetchWsUrl = () =>
      Effect.gen(function* () {
        const response = yield* client.get(`http://localhost:${port}/json/version`);
        const body = yield* response.text;
        const data = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ChromeVersion))(body);
        return data.webSocketDebuggerUrl;
      }).pipe(Effect.catch(() => Effect.fail("not ready" as const)));

    return yield* fetchWsUrl().pipe(
      Effect.retry(Schedule.exponential("250 millis").pipe(Schedule.upTo({ times: 60 }))),
      Effect.orDie,
    );
  });

// ── Managed Resources using ChildProcess ──────────────────────────────────────

/**
 * Spawn Chrome using Effect's ChildProcess API.
 * Process is automatically killed when the Scope closes (on interrupt).
 */
const spawnChrome = (chromePath: string) =>
  Effect.gen(function* () {
    yield* Console.log(`[dev] Starting Chrome on port ${CHROME_PORT}...`);

    // ChildProcess.make handles acquire/release automatically
    const handle =
      yield* ChildProcess.make`${chromePath} --headless --disable-gpu --disable-dev-shm-usage --no-sandbox --remote-debugging-port=${CHROME_PORT}`;

    // Log DevTools messages from stderr
    yield* handle.stderr.pipe(
      Stream.tap((chunk: Uint8Array) => {
        const msg = new TextDecoder().decode(chunk);
        if (msg.includes("DevTools")) {
          return Console.log(`[chrome] ${msg.trim()}`);
        }
        return Effect.void;
      }),
      Stream.runDrain,
      Effect.forkChild, // Run in background
    );

    return handle;
  });

/**
 * Spawn wrangler dev server using Effect's ChildProcess API.
 * Process is automatically killed when the Scope closes (on interrupt).
 */
const spawnWrangler = (wsUrl: string) =>
  Effect.gen(function* () {
    yield* Console.log("[dev] Starting wrangler dev...");

    // ChildProcess.make with inherited stdio for interactive output
    const handle = yield* ChildProcess.make({
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })`pnpm wrangler dev --var CDP_URL:${wsUrl}`;

    return handle;
  });

// ── Program ──────────────────────────────────────────────────────────────────

const program = Effect.gen(function* () {
  const chromePath = yield* getChromePath;
  if (chromePath === null) {
    return yield* Effect.die("Chrome not found. Set CHROME_PATH.");
  }

  // Kill any existing Chrome on the port (scoped - one-shot command)
  yield* killChromeOnPort(CHROME_PORT).pipe(Effect.scoped);

  // Start Chrome (auto-cleanup on scope exit via interrupt)
  yield* spawnChrome(chromePath);

  // Wait for Chrome to be ready
  const wsUrl = yield* waitForChrome(CHROME_PORT);
  yield* Console.log(`[dev] Chrome ready: ${wsUrl.slice(0, 50)}...`);
  yield* Console.log("[dev] Open http://localhost:8787 to test");
  yield* Console.log("[dev] Press Ctrl+C to stop\n");

  // Run wrangler (auto-cleanup on scope exit via interrupt)
  yield* spawnWrangler(wsUrl);

  // Keep running forever - cleanup happens on interrupt
  // When interrupted, Effect.scoped closes the Scope, killing both processes
  yield* Effect.never;
}).pipe(Effect.scoped);

// ── Entry Point ───────────────────────────────────────────────────────────────

program.pipe(
  Effect.provide(Layer.merge(NodeServices.layer, NodeHttpClient.layerFetch)),
  NodeRuntime.runMain,
);
