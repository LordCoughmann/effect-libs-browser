/**
 * Hacker News scraper - Playwright with custom URL, deployed via Alchemy.
 *
 * Set CDP_URL in your .env to configure your connection.
 *
 * This is the Stack definition (plantime). The runtime Worker code lives in
 * src/worker.ts, which is the entry point that gets bundled for Cloudflare Workers.
 */

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";

import Worker from "./src/worker.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Alchemy Stack
// ─────────────────────────────────────────────────────────────────────────────

export default Alchemy.Stack(
  "HackerNewsPlaywrightWsUrl",
  {
    providers: Cloudflare.providers(),
    state: State.localState(),
  },
  Effect.gen(function* () {
    const worker = yield* Worker;
    return { url: worker.url.as<string>() };
  }),
);
