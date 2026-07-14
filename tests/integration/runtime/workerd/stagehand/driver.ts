/**
 * Stagehand + CDP workerd integration test driver.
 *
 * WORKAROUND for: https://github.com/cloudflare/workers-sdk/issues/13037
 * Fix in progress: https://github.com/cloudflare/workers-sdk/pull/13062
 *
 * Uses `wrangler dev` (not vitest-pool-workers) because vitest-pool-workers
 * has a module-resolution bug with @smithy/* dual-format packages.
 *
 * Flow:
 * 1. Kill any existing process on port 8788 (cleanup from previous crashed run)
 * 2. Verify env vars (CHROME_WS_URL, HTTP_BASE_URL, LLM_API_KEY)
 * 3. Start wrangler dev (serves test-worker/)
 * 4. Poll until worker is ready
 * 5. Run 3 HTTP tests against the worker: connect / act / extract
 * 6. Cleanup is automatic via Effect.scoped
 *
 * Run via:
 *   pnpm test:stagehand:workerd
 *
 * Standalone entry point — reads env vars directly, no in-process invocation.
 * If LLM_API_KEY is absent, exits 0 (skips).
 *
 * CLEANUP NOTE: if interrupted (Ctrl+C) or crashed, port 8788 may be left in
 * use. The script kills it on startup, but if startup itself fails:
 *   lsof -ti:8788 | xargs kill -9
 */

import "@dotenvx/dotenvx/config";
import type { Scope } from "effect";

import {
  NodeChildProcessSpawner,
  NodeFileSystem,
  NodePath,
  NodeRuntime,
  NodeServices,
} from "@effect/platform-node";
import { Console, Duration, Effect, Layer, Schema } from "effect";
import { ChildProcess, type ChildProcessSpawner } from "effect/unstable/process";

const WORKER_PORT = 8788;
const WORKER_URL = `http://localhost:${WORKER_PORT}`;
const READY_TIMEOUT_MS = 30_000; // 30 seconds to start wrangler
const POLL_INTERVAL_MS = 500;
const WORKER_CONFIG = "tests/integration/runtime/workerd/stagehand/test-worker/wrangler.jsonc";
const LLM_MODEL_DEFAULT = "mistral/mistral-medium-2508";

// =============================================================================
// Schemas
// =============================================================================

const WorkerResponse = Schema.Struct({
  success: Schema.Boolean,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String),
});

// =============================================================================
// Pieces
// =============================================================================

/** Kill any process holding the worker port (cleanup from previous crashed run). */
const cleanupPort = (
  port: number,
): Effect.Effect<void, never, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> =>
  ChildProcess.make({
    stdout: "pipe",
    stderr: "pipe",
  })`sh -c "lsof -ti:${port} | xargs kill -9 2>/dev/null || true"`.pipe(
    Effect.flatMap((p) => p.exitCode),
    Effect.asVoid,
    Effect.ignore({ log: false }),
  );

/** Start wrangler dev as a background child process. Stdout/stderr inherited. */
const startWrangler = (
  port: number,
): Effect.Effect<void, never, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> =>
  ChildProcess.make({
    stdout: "inherit",
    stderr: "inherit",
  })`pnpm wrangler dev --config ${WORKER_CONFIG} --port ${port} --ip 127.0.0.1`.pipe(
    Effect.asVoid,
    Effect.ignore({ log: false }),
  );

/** POST a JSON body to the worker and return the parsed response. */
const postWorker = <T>(body: unknown): Effect.Effect<T, string> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await res.json()) as T;
    },
    catch: (err) => `worker-request-failed: ${String(err)}`,
  });

/** Poll the worker URL until it responds successfully, or time out. */
const waitForWorker = Effect.gen(function* () {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ok = yield* Effect.tryPromise({
      try: () =>
        fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }).then((res) => res.status === 200),
      catch: () => false,
    }).pipe(Effect.orElseSucceed(() => false));
    if (ok) return;
    yield* Effect.sleep(Duration.millis(POLL_INTERVAL_MS));
  }
  return yield* Effect.fail(`worker-timeout after ${READY_TIMEOUT_MS}ms`);
});

/** POST a test action to the worker; parse the response with schema validation. */
const runWorkerTest = (action: {
  readonly cdpUrl: string;
  readonly llm: { readonly model: string; readonly apiKey: string };
  readonly action: "connect" | "act" | "extract";
  readonly navigateUrl?: string;
  readonly input?: string;
}) => postWorker(action).pipe(Effect.flatMap(Schema.decodeUnknownEffect(WorkerResponse)));

// =============================================================================
// Program
// =============================================================================

Effect.gen(function* () {
  yield* Console.log(`[stagehand-workerd] Cleaning up port ${WORKER_PORT}...`);
  yield* cleanupPort(WORKER_PORT);

  const cdpUrl = process.env.CHROME_WS_URL;
  const httpUrl = process.env.HTTP_BASE_URL;
  const llmApiKey = process.env.LLM_API_KEY;

  if (!cdpUrl || !httpUrl) {
    yield* Console.error("[stagehand-workerd] Missing CHROME_WS_URL or HTTP_BASE_URL");
    return yield* Effect.fail("missing-env");
  }

  if (!llmApiKey) {
    yield* Console.log("[stagehand-workerd] SKIP: No LLM_API_KEY in environment");
    return;
  }

  const llm = {
    model: process.env.LLM_MODEL ?? LLM_MODEL_DEFAULT,
    apiKey: llmApiKey,
  };

  yield* Console.log(`[stagehand-workerd] CDP=${cdpUrl}`);
  yield* Console.log(`[stagehand-workerd] HTTP=${httpUrl}`);
  yield* Console.log(`[stagehand-workerd] LLM=${llm.model}`);
  yield* Console.log(`[stagehand-workerd] Starting wrangler dev on port ${WORKER_PORT}...`);

  yield* startWrangler(WORKER_PORT);

  yield* Console.log("[stagehand-workerd] Waiting for worker to be ready...");
  yield* waitForWorker;
  yield* Console.log("[stagehand-workerd] Worker is ready!");

  // Test 1: connect
  yield* Console.log("\n[stagehand-workerd] Test 1: Connect to browser via CDP");
  const connect = yield* runWorkerTest({ cdpUrl, llm, action: "connect" });
  yield* Console.log("[stagehand-workerd] Connect result:", JSON.stringify(connect, null, 2));
  if (!connect.success) {
    yield* Console.error("[stagehand-workerd] FAIL: Connect test failed");
    return yield* Effect.fail("connect-test-failed");
  }
  yield* Console.log("[stagehand-workerd] PASS: Connect");

  // Test 2: navigate + act
  yield* Console.log("\n[stagehand-workerd] Test 2: Navigate and act");
  const act = yield* runWorkerTest({
    cdpUrl,
    llm,
    action: "act",
    navigateUrl: httpUrl,
    input: "describe the page",
  });
  yield* Console.log("[stagehand-workerd] Act result:", JSON.stringify(act, null, 2));
  if (!act.success) {
    yield* Console.error("[stagehand-workerd] FAIL: Act test failed");
    return yield* Effect.fail("act-test-failed");
  }
  yield* Console.log("[stagehand-workerd] PASS: Act");

  // Test 3: extract
  yield* Console.log("\n[stagehand-workerd] Test 3: Extract data");
  const extract = yield* runWorkerTest({
    cdpUrl,
    llm,
    action: "extract",
    navigateUrl: httpUrl,
    input: "extract the page title",
  });
  yield* Console.log("[stagehand-workerd] Extract result:", JSON.stringify(extract, null, 2));
  if (!extract.success) {
    yield* Console.error("[stagehand-workerd] FAIL: Extract test failed");
    return yield* Effect.fail("extract-test-failed");
  }
  yield* Console.log("[stagehand-workerd] PASS: Extract");

  yield* Console.log("\n[stagehand-workerd] All tests passed!");
}).pipe(
  Effect.scoped,
  Effect.provide(
    NodeChildProcessSpawner.layer.pipe(
      Layer.provide(NodeFileSystem.layer),
      Layer.provide(NodePath.layer),
      Layer.provideMerge(NodeServices.layer),
    ),
  ),
  NodeRuntime.runMain,
);
