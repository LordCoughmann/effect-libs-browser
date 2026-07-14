/**
 * Hacker News scraper - CDP with Cloudflare Browser Run HTTP provider on Cloudflare Workers.
 *
 * This example demonstrates how to use CDP (lightweight, no dependencies)
 * with Cloudflare Browser Run HTTP API for browser automation.
 *
 * ## Requirements
 *
 * - Cloudflare Account ID
 * - Cloudflare API Token with Browser Run permissions
 *
 * ## Setup
 *
 * 1. Copy `.dev.vars.example` to `.dev.vars`
 * 2. Add your Cloudflare credentials:
 *    - CF_ACCOUNT_ID: Your Cloudflare account ID
 *    - CF_API_TOKEN: API token with Browser Run permissions
 *
 * For the binding-based approach (faster, Workers only), see the
 * `hackernews-playwright-cfBrowserRun` example.
 */

import { Effect, Schema, Layer, Match, Cause, Config } from "effect";

import { Cdp } from "@effect-libs/browser-cdp";
import { CfBrowserRunProvider } from "@effect-libs/browser-providers/cf-browser-run";

export interface Env {
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
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
  const cdp = yield* Cdp;
  const provider = yield* CfBrowserRunProvider;

  const stories = yield* cdp.withSession({ provider }, ({ page, session }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo(`Session ID: ${session.id}`);

      yield* page.goto("https://news.ycombinator.com");

      const stories = yield* page
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

      yield* page.close();
      return stories;
    }),
  );

  return stories;
}).pipe(
  Effect.provide(
    Layer.merge(
      Cdp.layer,
      CfBrowserRunProvider.layerConfig({
        accountId: Config.string("CF_ACCOUNT_ID"),
        apiKey: Config.redacted("CF_API_TOKEN"),
      }),
    ),
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
	<p>Cloudflare Workers example using CDP + Browser Run (HTTP API)</p>
	<p style="background: #fde68a; padding: 0.5rem; border-radius: 4px;">
		⚠️ Warning: This example uses Cloudflare Browser Run. Running the scraper may incur usage fees. <a href="https://developers.cloudflare.com/browser-run/pricing/" target="_blank">Check pricing & limits</a> before proceeding.
	</p>
	${
    hasConfig
      ? `<p class="status ok">✅ CF_ACCOUNT_ID & CF_API_TOKEN configured (from .dev.vars)</p>`
      : `<p class="status warn">⚠️ CF_ACCOUNT_ID and/or CF_API_TOKEN not configured. Set them in .dev.vars.</p>`
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
      return new Response(html(Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN)), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Scrape endpoint
    if (url.pathname === "/scrape") {
      if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
        return new Response(
          JSON.stringify({
            error: "CF_ACCOUNT_ID and CF_API_TOKEN must be configured",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
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
