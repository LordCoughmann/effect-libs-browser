# Hacker News Scraper - Playwright + Browser Run (Native Binding)

A Hacker News scraper running on Cloudflare Workers using Playwright with Cloudflare Browser Run's native binding (fastest path on Workers).

## Cost Warning

This example uses **Cloudflare Browser Run**, which has separate usage fees from Workers. Check [Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/) before running.

## Quick Start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the dev server:

   ```bash
   pnpm run dev
   ```

3. Open the URL shown in the output (e.g., `http://localhost:8787`)
4. Click the "Scrape" button to scrape Hacker News

## See Also

- `hackernews-cdp-cfBrowserRun/` - Same example using CDP with the Browser Run HTTP API (works anywhere, not just Cloudflare Workers)
- `hackernews-playwright-steel/` - Playwright with Steel.dev
- `hackernews-playwright-browserbase/` - Playwright with Browserbase

## How It Works

- `GET /` - HTML page with a "Scrape" button
- `GET /scrape` - Returns scraped stories as JSON

The scraper uses Playwright with Cloudflare Browser Run's native binding:

1. Launch browser via `env.MYBROWSER` binding (configured in `wrangler.jsonc`)
2. Navigate to Hacker News
3. Extract the top 5 stories
4. Return them as JSON

## Deploy & Destroy

```bash
pnpm run deploy
pnpm run destroy  # Clean up after testing
```