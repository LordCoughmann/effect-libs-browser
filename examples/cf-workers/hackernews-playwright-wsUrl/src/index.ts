/**
 * Hacker News scraper - Playwright with custom URL on Cloudflare Workers.
 *
 * Set CDP_URL in your .dev.vars to configure your connection.
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
 * For provider-managed browser sessions, see:
 *   - hackernews-playwright-steel
 *   - hackernews-playwright-browserbase
 *   - hackernews-playwright-cfBrowserRun (Cloudflare native binding)
 */

import { Effect, Schema, Match, Cause } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import { Playwright } from "@effect-libs/browser-playwright";

export interface Env {
  CDP_URL: string;
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

const Stories = Schema.Array(Story);

// ─────────────────────────────────────────────────────────────────────────────
// Scraper logic using our library
// ─────────────────────────────────────────────────────────────────────────────

const scrapeHackerNews = (cdpUrl: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;

    const stories = yield* playwright.withConnection({ url: cdpUrl }, ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto("https://news.ycombinator.com");

        return yield* page
          .evaluate(() => {
            const rows = document.querySelectorAll("tr.athing");
            return Array.from(rows)
              .slice(0, 5)
              .map((row) => {
                const titleEl = row.querySelector(".titleline > a");
                const subtext = row.nextElementSibling;
                return {
                  title: titleEl?.textContent || "",
                  url: titleEl?.getAttribute("href") || undefined,
                  score: subtext?.querySelector(".score")?.textContent || undefined,
                  author: subtext?.querySelector(".hnuser")?.textContent || undefined,
                };
              });
          })
          .pipe(
            // Validate the extracted data against the Story schema
            Effect.flatMap(Schema.decodeUnknownEffect(Stories)),
          );
      }),
    );

    return stories;
  }).pipe(Effect.provide(Playwright.layer));

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

/** Schema for optional override URL in request body */
const ScrapeRequest = Schema.Struct({
  url: Schema.NullOr(Schema.String).pipe(Schema.optional),
});

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
	<p>Cloudflare Workers example using Playwright with custom URL</p>
	<p style="background: #fde68a; padding: 0.5rem; border-radius: 4px;">
		⚠️ Warning: This example connects to a remote browser. If using a managed browser service, usage fees may apply — check your provider's pricing.
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

      // Use override URL if provided, otherwise use env var
      const cdpUrl = body.url ?? env.CDP_URL;

      if (!cdpUrl) {
        return new Response(
          JSON.stringify({ error: "CDP_URL not configured and no override provided" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const exit = await Effect.runPromiseExit(scrapeHackerNews(cdpUrl));

      return Match.value(exit).pipe(
        Match.tag(
          "Success",
          (e) =>
            new Response(JSON.stringify({ stories: e.value }, null, 2), {
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
