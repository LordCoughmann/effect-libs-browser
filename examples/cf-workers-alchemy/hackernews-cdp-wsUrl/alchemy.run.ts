/**
 * Hacker News scraper - CDP with custom URL, deployed via Alchemy (Bun runtime).
 *
 * Set CDP_URL in your .env to configure your connection.
 *
 * This is the Stack definition (plantime). The runtime Worker code lives in
 * src/worker.ts, which is the entry point that gets bundled for Cloudflare Workers.
 *
 * This is the Bun-native version using `import.meta.filename` and `bun run alchemy`.
 * For the Node/pnpm version, see:
 *   - examples/cf-workers-alchemy/hackernews-cdp-wsUrl/
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
  "HackerNewsCdpWsUrlBun",
  {
    providers: Cloudflare.providers(),
    state: State.localState(),
  },
  Effect.gen(function* () {
    const worker = yield* Worker;
    return { url: worker.url.as<string>() };
  }),
);
