/**
 * Hacker News scraper - Stagehand with CDP on Cloudflare Workers.
 *
 * Set CDP_URL, LLM_MODEL, and LLM_API_KEY in your .dev.vars to configure.
 *
 * NOTE: This example connects to an existing browser via CDP WebSocket.
 * You are responsible for managing the browser lifecycle (starting/stopping).
 *
 * The browser can be running anywhere:
 * - Local machine (tunneled via ngrok, cloudflare tunnel, etc.)
 * - VPS or cloud server
 * - Provider WebSocket URL (e.g., ws://steel.dev/...?apikey=...)
 *
 * The CDP URL is read from the CDP_URL env var server-side and never exposed
 * to the browser, since WebSocket URLs may contain API keys or tokens.
 *
 * To use Stagehand with Playwright on the same session, see:
 *   - hackernews-stagehand-playwright
 */

import { Effect, Schema, Match, Cause } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import { Stagehand, toZodSchema } from "@effect-libs/browser-stagehand";

export interface Env {
  CDP_URL: string;
  LLM_MODEL: string;
  LLM_API_KEY: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

class Story extends Schema.Class<Story>("Story")({
  title: Schema.String,
  url: Schema.String.pipe(Schema.optional),
  score: Schema.String.pipe(Schema.optional),
  author: Schema.String.pipe(Schema.optional),
}) {}

class StoriesResult extends Schema.Class<StoriesResult>("StoriesResult")({
  stories: Schema.Array(Story),
}) {}

/** Schema for optional override URL in request body */
const ScrapeRequest = Schema.Struct({
  url: Schema.NullOr(Schema.String).pipe(Schema.optional),
});

// ─────────────────────────────────────────────────────────────────────────────
// Scraper logic using our library
// ─────────────────────────────────────────────────────────────────────────────

const scrapeHackerNews = (cdpUrl: string, llmModel: string, llmApiKey: string) =>
  Effect.gen(function* () {
    const stagehand = yield* Stagehand;

    // Convert Effect Schema to Zod for Stagehand
    const zodSchema = yield* toZodSchema(StoriesResult);

    const result = yield* stagehand.withConnection({ url: cdpUrl }, ({ instance }) =>
      Effect.gen(function* () {
        // Use AI-powered navigation
        yield* instance.use((s) => s.act("go to https://news.ycombinator.com"));

        // Use AI-powered extraction
        const stories = yield* instance.use((s) =>
          s.extract(
            `Extract the top 5 stories from Hacker News. For each story: title is the headline text, url is the external link URL (the actual article link, not the HN page - use null for Ask HN or internal posts), score is the points number, author is the username`,
            zodSchema,
          ),
        );

        return stories;
      }),
    );

    return result;
  }).pipe(Effect.provide(Stagehand.layer({ model: llmModel, apiKey: llmApiKey })));

// ─────────────────────────────────────────────────────────────────────────────
// HTML UI
// ─────────────────────────────────────────────────────────────────────────────

const html = (hasCdpUrl: boolean) => `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<title>Hacker News Scraper</title>
	<style>
		body { font-family: system-ui; padding: 2rem; max-width: 800px; }
		input { width: 100%; padding: 0.5rem; margin-bottom: 1rem; font-family: monospace; }
		button { padding: 0.5rem 1rem; cursor: pointer; }
		pre { background: #f5f5f5; padding: 1rem; overflow: auto; }
		.status { padding: 0.5rem; border-radius: 4px; margin-bottom: 1rem; }
		.status.ok { background: #d1fae5; }
		.status.warn { background: #fef3c7; }
		.hint { color: #666; font-size: 0.85rem; margin-bottom: 1rem; }
	</style>
</head>
<body>
	<h1>Hacker News Scraper</h1>
	<p>Cloudflare Workers example using Stagehand with custom URL</p>
	<p style="background: #fde68a; padding: 0.5rem; border-radius: 4px;">
		⚠️ Warning: This example uses Stagehand with LLM API calls and browser sessions. Running the scraper may incur usage fees for both. Check your provider's pricing before proceeding.
	</p>
	${
    hasCdpUrl
      ? `<p class="status ok">✅ CDP URL configured (from .dev.vars)</p>`
      : `<p class="status warn">⚠️ No CDP_URL configured. Set it in .dev.vars or enter a URL below.</p>`
  }
	<label for="override-url">Override URL (optional):</label>
	<input type="text" id="override-url" placeholder="ws://localhost:9222">
	<p class="hint">Leave empty to use configured URL, or enter a different CDP WebSocket URL.</p>
	<p><button onclick="scrape()">Scrape</button></p>
	<pre id="results">Click button to scrape...</pre>
	<script>
		function scrape() {
			const overrideUrl = document.getElementById('override-url').value.trim();
			document.getElementById('results').textContent = 'Scraping...';
			fetch('/scrape', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: overrideUrl || null })
			})
				.then(r => r.json())
				.then(data => {
					document.getElementById('results').textContent = JSON.stringify(data, null, 2);
				})
				.catch(err => {
					document.getElementById('results').textContent = 'Error: ' + err.message;
				});
		}
	</script>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Worker handler
// ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Check if CDP URL is configured
    const hasCdpUrl = Boolean(env.CDP_URL);

    // UI endpoint
    if (url.pathname === "/") {
      return new Response(html(hasCdpUrl), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Scrape endpoint (POST only — URL stays server-side unless override provided)
    if (url.pathname === "/scrape" && request.method === "POST") {
      const serverRequest = HttpServerRequest.fromWeb(request);

      const body = await Effect.runPromise(
        HttpServerRequest.schemaBodyJson(ScrapeRequest).pipe(
          Effect.orElseSucceed(() => ({ url: undefined })),
          Effect.provideService(HttpServerRequest.HttpServerRequest, serverRequest),
        ),
      );

      // Use override URL if provided, otherwise use configured URL
      const cdpUrl = body.url ?? env.CDP_URL;

      if (!cdpUrl) {
        return new Response(
          JSON.stringify({ error: "CDP_URL not configured and no override provided" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      if (!env.LLM_MODEL) {
        return new Response(JSON.stringify({ error: "LLM_MODEL not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!env.LLM_API_KEY) {
        return new Response(JSON.stringify({ error: "LLM_API_KEY not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const exit = await Effect.runPromiseExit(
        scrapeHackerNews(cdpUrl, env.LLM_MODEL, env.LLM_API_KEY),
      );

      return Match.value(exit).pipe(
        Match.tag(
          "Success",
          (e) =>
            new Response(JSON.stringify(e.value, null, 2), {
              headers: { "Content-Type": "application/json" },
            }),
        ),
        Match.tag(
          "Failure",
          (e) =>
            new Response(JSON.stringify({ error: Cause.pretty(e.cause) }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }),
        ),
        Match.exhaustive,
      );
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
