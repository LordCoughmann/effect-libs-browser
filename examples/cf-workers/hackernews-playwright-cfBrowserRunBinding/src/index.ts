/**
 * Hacker News scraper - Playwright with Cloudflare Browser Run on Cloudflare Workers.
 *
 * This example uses the native Browser Run binding (fastest path).
 * Requires browser binding in wrangler.toml:
 *
 * ```toml
 * [browser]
 * binding = "MYBROWSER"
 * ```
 *
 * For HTTP CDP access (works anywhere), see the provider docs.
 */

import { Effect, Schema, Match, Cause } from "effect";

import { CfBrowserRunBindingProvider } from "@effect-libs/browser-providers/cf-browser-run-binding";

export interface Env {
  MYBROWSER: Fetcher;
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

const scrapeHackerNews = (env: Env) =>
  Effect.gen(function* () {
    const provider = yield* CfBrowserRunBindingProvider;

    const stories = yield* provider.withSession((page) =>
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
  }).pipe(
    Effect.provide(
      CfBrowserRunBindingProvider.layer({
        endpoint: env.MYBROWSER,
      }),
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
	<p>Cloudflare Workers example using Playwright + Browser Run (native binding)</p>
	<p style="background: #fde68a; padding: 0.5rem; border-radius: 4px;">
		⚠️ Warning: This example uses Cloudflare Browser Run. Running the scraper may incur usage fees. <a href="https://developers.cloudflare.com/browser-run/pricing/" target="_blank">Check pricing & limits</a> before proceeding.
	</p>
	${
    hasConfig
      ? `<p class="status ok">✅ MYBROWSER binding configured</p>`
      : `<p class="status warn">⚠️ No MYBROWSER binding configured. Add [browser] binding to wrangler.toml.</p>`
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
      return new Response(html(Boolean(env.MYBROWSER)), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Scrape endpoint
    if (url.pathname === "/scrape") {
      if (!env.MYBROWSER) {
        return new Response(
          JSON.stringify({
            error: "MYBROWSER binding not configured. Add [browser] binding to wrangler.toml",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      const exit = await Effect.runPromiseExit(scrapeHackerNews(env));

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
