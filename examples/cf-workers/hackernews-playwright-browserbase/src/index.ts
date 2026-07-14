/**
 * Hacker News scraper - Playwright with Browserbase provider on Cloudflare Workers.
 *
 * This example demonstrates how to use the browser automation library
 * in a Cloudflare Worker environment with Browserbase provider.
 *
 * ## Browserbase SDK Features
 *
 * Browserbase provides additional features beyond basic browser automation:
 *
 * - **Persistent Contexts**: Sessions maintain state across runs
 * - **Proxies**: Built-in proxy support for geo-targeting
 * - **Region Selection**: Choose browser region for lower latency
 *
 * To configure proxies or regions, use the Browserbase dashboard or API:
 * https://docs.browserbase.com/reference/sessions
 *
 * The session object includes Browserbase SDK fields:
 * - `session.connectUrl` - WebSocket URL for direct connection
 * - `session.region` - Browser region (e.g., "us-west-2")
 * - `session.projectId` - Project ID for organization
 */

import { Effect, Schema, Match, Cause, Config } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";

export interface Env {
  BROWSERBASE_API_KEY: string;
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

const scrapeHackerNews = Effect.gen(function* () {
  const playwright = yield* Playwright;
  const provider = yield* BrowserbaseProvider;

  const stories = yield* playwright.withSession({ provider }, ({ page, session }) =>
    Effect.gen(function* () {
      // Browserbase SDK feature: Log session details
      // The session object includes Browserbase SDK fields (connectUrl, region, etc.)
      yield* Effect.logInfo(`Session ID: ${session.id}`);

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
}).pipe(
  Effect.provide(Playwright.layer),
  Effect.provide(
    BrowserbaseProvider.layerConfig({ apiKey: Config.redacted("BROWSERBASE_API_KEY") }),
  ),
);

// ─────────────────────────────────────────────────────────────────────────────
// HTML UI
// ─────────────────────────────────────────────────────────────────────────────

const html = (hasConfig: boolean) => `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<title>Hacker News Scraper</title>
	<style>
		body { font-family: system-ui; padding: 2rem; max-width: 800px; }
		button { padding: 0.5rem 1rem; cursor: pointer; }
		button:disabled { opacity: 0.5; cursor: not-allowed; }
		pre { background: #f5f5f5; padding: 1rem; overflow: auto; }
		.status { padding: 0.5rem; border-radius: 4px; margin-bottom: 1rem; }
		.status.ok { background: #d1fae5; }
		.status.warn { background: #fef3c7; }
	</style>
</head>
<body>
	<h1>Hacker News Scraper</h1>
	<p>Cloudflare Workers example using Playwright + Browserbase</p>
	<p style="background: #fde68a; padding: 0.5rem; border-radius: 4px;">
		⚠️ Warning: This example uses a real Browserbase browser session. Running the scraper may incur usage fees. <a href="https://browserbase.com/pricing" target="_blank">Check pricing & limits</a> before proceeding.
	</p>
	${
    hasConfig
      ? `<p class="status ok">✅ BROWSERBASE_API_KEY configured (from .dev.vars)</p>`
      : `<p class="status warn">⚠️ No BROWSERBASE_API_KEY configured. Set it in .dev.vars.</p>`
  }
	<p><button id="scrape-btn" onclick="scrape()" ${hasConfig ? "" : "disabled"}>Scrape</button></p>
	<pre id="results">${
    hasConfig ? "Click button to scrape..." : "Configure credentials to enable scraping."
  }</pre>
	<script>
		function scrape() {
			document.getElementById('results').textContent = 'Scraping... check wrangler logs for progress...';
			fetch('/scrape')
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

    // UI endpoint
    if (url.pathname === "/") {
      return new Response(html(Boolean(env.BROWSERBASE_API_KEY)), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Scrape endpoint
    if (url.pathname === "/scrape") {
      if (!env.BROWSERBASE_API_KEY) {
        return new Response(JSON.stringify({ error: "BROWSERBASE_API_KEY not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const exit = await Effect.runPromiseExit(scrapeHackerNews);

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
