/**
 * Chrome management utilities for tests.
 *
 * Provides functions to find, start, wait for, and kill Chrome
 * with remote debugging enabled.
 */

import { NodeHttpClient, NodeServices } from "@effect/platform-node";
import {
  Effect,
  Layer,
  Console,
  FileSystem,
  Schedule,
  Schema,
  Array as Arr,
  Option,
  Order,
  Predicate,
} from "effect";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess } from "effect/unstable/process";
import { spawn } from "node:child_process";

import { ChromeVersionResponse } from "../../packages/browser-cdp/src/internal/CdpSchema.js";

/** Default Chrome remote debugging port. */
const CHROME_PORT = 9222;

/**
 * Dedicated user-data-dir for the test Chrome instance.
 *
 * Doubles as a searchable marker: every Chrome process spawned by these
 * tests (including renderer/GPU/utility children, which inherit the flag)
 * carries this path in its command line. `killTestChrome` matches on it so
 * only OUR test Chrome is ever reaped — the user's personal Chrome is never
 * touched, even on a hard kill -9.
 */
export const TEST_USER_DATA_DIR = `/tmp/effect-libs-browser-test-chrome`;

// ── Chrome Path Discovery ────────────────────────────────────────────────────

/**
 * Find Chrome or Chromium binary on the system.
 *
 * Checks environment variables and common installation paths.
 */
export const getChromePath = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const home = process.env.HOME ?? "/home/user";
  const username = process.env.USER ?? "user";

  // Discover latest installed Playwright chromium version dynamically
  const findLatestPlaywrightChromium = (prefix: string, suffix: string) =>
    Effect.gen(function* () {
      const dir = prefix;
      if (!(yield* fs.exists(dir))) return null;
      const entries = yield* fs.readDirectory(dir);
      const versions = Arr.fromIterable(
        entries
          .filter((e) => e.startsWith("chromium-"))
          .map((e) => [parseInt(e.replace("chromium-", ""), 10), e] as const)
          .filter(([v]) => !isNaN(v)),
      );
      const sorted = Arr.sort(
        versions,
        Order.flip(Order.mapInput(Order.Number, ([v]: readonly [number, string]) => v)),
      );
      const candidates = yield* Effect.forEach(
        sorted,
        ([, name]) =>
          fs
            .exists(`${prefix}/${name}/${suffix}`)
            .pipe(Effect.map((exists) => (exists ? `${prefix}/${name}/${suffix}` : null))),
        { concurrency: 1 },
      );
      return Arr.findFirst(candidates, Predicate.isNotNull).pipe(Option.getOrElse(() => null));
    });

  const playwrightLinux = yield* findLatestPlaywrightChromium(
    `${home}/.cache/ms-playwright`,
    "chrome-linux64/chrome",
  );
  const playwrightWindows = yield* findLatestPlaywrightChromium(
    `/mnt/c/Users/${username}/AppData/Local/ms-playwright`,
    "chrome-win/chrome.exe",
  );

  const paths = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    playwrightLinux,
    playwrightWindows,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Predicate.isString);

  const found = yield* Effect.forEach(
    paths,
    (path) => fs.exists(path).pipe(Effect.map((exists) => (exists ? path : null))),
    { concurrency: 1 },
  );
  return Arr.findFirst(found, Predicate.isNotNull).pipe(Option.getOrElse(() => null));
});

// ── Chrome Process Management ───────────────────────────────────────────────

/**
 * Kill any process listening on the given port.
 */
export const killChromeOnPort = (port: number) =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make`lsof -ti:${port} | xargs -r kill -9`;
    yield* handle.exitCode.pipe(Effect.catch(() => Effect.void));
  });

/**
 * Kill all test-Chrome processes (main + children) by matching the
 * `--user-data-dir` marker in their command line.
 *
 * Unlike `killChromeOnPort`, this is identity-based: it only ever touches
 * Chrome instances we launched (identifiable by `TEST_USER_DATA_DIR`),
 * leaving the user's personal Chrome untouched. Safe to call even when no
 * test Chrome is running — `pkill` simply exits with no match. Never fails:
 * used as a scope finalizer where the error channel must be `never`.
 */
export const killTestChrome = () =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make`pkill -9 -f -- ${TEST_USER_DATA_DIR}`;
    yield* handle.exitCode.pipe(Effect.ignore);
  }).pipe(Effect.ignore);

/**
 * Wait for Chrome's CDP endpoint to be ready.
 *
 * Polls the /json/version endpoint until it returns a WebSocket URL.
 */
export const waitForChrome = (port: number): Effect.Effect<string, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const fetchWsUrl = () =>
      Effect.gen(function* () {
        const response = yield* client.get(`http://localhost:${port}/json/version`);
        const body = yield* response.text;
        const data = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(ChromeVersionResponse),
        )(body);
        return data.webSocketDebuggerUrl;
      }).pipe(Effect.mapError(() => "not ready" as const));

    return yield* fetchWsUrl().pipe(
      Effect.retry(Schedule.max([Schedule.exponential("250 millis"), Schedule.recurs(60)])),
      Effect.orDie,
    );
  });

/**
 * Spawn Chrome with remote debugging enabled.
 *
 * Uses a dedicated `--user-data-dir` (TEST_USER_DATA_DIR) which both isolates
 * the test profile and serves as a killable marker (see `killTestChrome`).
 *
 * Spawns Chrome directly via Node.js without Effect scope management,
 * allowing Chrome to persist for the entire test run.
 */
export const spawnChrome = (chromePath: string, port: number = CHROME_PORT) =>
  Effect.sync(() => {
    console.log(`[chrome] Starting Chrome on port ${port}...`);
    const child = spawn(
      chromePath,
      [
        "--headless",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--no-first-run",
        "--ignore-certificate-errors",
        `--user-data-dir=${TEST_USER_DATA_DIR}`,
        `--remote-debugging-port=${port}`,
      ],
      { detached: true, stdio: ["ignore", "ignore", "pipe"] },
    );

    // Log DevTools messages from stderr
    child.stderr?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString();
      if (msg.includes("DevTools")) {
        console.log(`[chrome] ${msg.trim()}`);
      }
    });

    // Unref to allow parent process to exit independently
    child.unref();

    return child.pid;
  });

// ── Combined Chrome Setup ────────────────────────────────────────────────────

/**
 * Start Chrome and wait for it to be ready.
 *
 * Kills stale test Chrome from a previous (possibly crashed) run, frees the
 * port, spawns a fresh instance marked with `--user-data-dir`, and waits for
 * the CDP endpoint to become available.
 *
 * Chrome is NOT tied to a scope - it stays alive until explicitly killed.
 * Use `killTestChrome()` to clean up, or let the next run's startup cleanup
 * handle it.
 *
 * Returns the WebSocket URL for CDP connection.
 */
export const startChrome = (port: number = CHROME_PORT) =>
  Effect.gen(function* () {
    const chromePath = yield* getChromePath;

    if (chromePath === null) {
      return yield* Effect.die("Chrome not found. Set CHROME_PATH or CHROMIUM_PATH.");
    }

    // Kill stale test Chrome from a previous run. Marker-based so unrelated
    // Chrome is never touched. Also free the port as a fallback for any
    // pre-marker or orphaned instance lingering on it.
    yield* killTestChrome().pipe(Effect.scoped);
    yield* killChromeOnPort(port).pipe(Effect.scoped);

    // Spawn Chrome without tying to a scope - it will be cleaned up by
    // killTestChrome() at the start of the next run or manually.
    yield* spawnChrome(chromePath, port);

    const wsUrl = yield* waitForChrome(port);
    yield* Console.log(`[chrome] Ready on port ${port}`);

    return wsUrl;
  });

// ── Layers ───────────────────────────────────────────────────────────────────

/**
 * Layer providing Node services needed for Chrome management.
 */
export const ChromeServicesLive = Layer.merge(NodeServices.layer, NodeHttpClient.layerFetch);
