/**
 * Playwright Worker — runs inside Cloudflare Workers via Alchemy.
 *
 * This file is the worker entry point. It contains only runtime code
 * (no plantime Stack/infrastructure declarations).
 *
 * The CDP URL is read from the CDP_URL env var server-side and never exposed
 * to the browser, since WebSocket URLs may contain API keys or tokens.
 */

import * as Cloudflare from "alchemy/Cloudflare";
import { Config, Schema } from "effect";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { Playwright } from "@effect-libs/browser-playwright";

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
// Scraper logic
// ─────────────────────────────────────────────────────────────────────────────

const scrapeHackerNews = (cdpUrl: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;

    return yield* playwright.withConnection({ url: cdpUrl }, ({ page }) =>
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
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Stories)));
      }),
    );
  }).pipe(Effect.provide(Playwright.layer));

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
	<p>Cloudflare Workers + Alchemy example using Playwright with custom URL</p>
	<p style="background: #fde68a; padding: 0.5rem; border-radius: 4px;">
		⚠️ Warning: This example connects to a remote browser. If using a managed browser service, usage fees may apply — check your provider's pricing.
	</p>
	${
    hasCdpUrl
      ? `<p class="status ok">✅ CDP URL configured (from .env)</p>`
      : `<p class="status warn">⚠️ No CDP_URL configured. Set it in .env or enter a URL below.</p>`
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
// Alchemy Worker (class-based, separate file)
// ─────────────────────────────────────────────────────────────────────────────

export default class HnPlaywrightWorker extends Cloudflare.Worker<HnPlaywrightWorker>()(
  "HnPlaywrightWorker",
  {
    main: import.meta.filename!,
    env: {
      CDP_URL: Config.redacted("CDP_URL").pipe(Config.withDefault(Redacted.make(""))),
    },
  },
  Effect.gen(function* () {
    // Init: read config once per cold start
    const cdpUrl = Redacted.value(
      yield* Config.redacted("CDP_URL").pipe(Config.withDefault(Redacted.make(""))),
    );

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;

        // UI endpoint
        if (request.url === "/" || request.url === "") {
          return HttpServerResponse.text(html(cdpUrl !== ""), {
            headers: { "content-type": "text/html" },
          });
        }

        // Scrape endpoint
        if (request.url === "/scrape" && request.method === "POST") {
          const bodyText = yield* request.text;
          const body: { url?: string | null } = (() => {
            try {
              return JSON.parse(bodyText);
            } catch {
              return {};
            }
          })();

          const effectiveUrl = body.url ?? cdpUrl;

          if (!effectiveUrl) {
            return yield* HttpServerResponse.json(
              { error: "CDP_URL not configured and no override provided" },
              { status: 400 },
            );
          }

          return yield* scrapeHackerNews(effectiveUrl).pipe(
            Effect.flatMap((stories) => HttpServerResponse.json({ stories })),
            Effect.catch(() =>
              Effect.succeed(HttpServerResponse.text("Scraping failed", { status: 500 })),
            ),
          );
        }

        return HttpServerResponse.empty({ status: 404 });
      }),
    };
  }),
) {}
