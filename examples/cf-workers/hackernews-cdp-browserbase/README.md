# Hacker News CDP Scraper - Browserbase

A Hacker News scraper running on Cloudflare Workers using CDP with Browserbase provider.

## Cost Warning

This example uses **Browserbase**, which charges per browser session. Check [Browserbase pricing](https://docs.browserbase.com/pricing) before running.

## Quick Start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Get a Browserbase API key at [browserbase.com](https://browserbase.com).

3. Set your Browserbase API key:

   ```bash
   echo "BROWSERBASE_API_KEY=your-api-key" > .dev.vars
   ```

4. Start the dev server:

   ```bash
   pnpm run dev
   ```

5. Open the URL shown in the output (e.g., `http://localhost:8787`)
6. Click the "Scrape" button to scrape Hacker News

You'll see the JSON results in the browser. Check the wrangler logs for progress updates.

## See Also

- `hackernews-cdp-steel/` - Steel.dev provider
- `hackernews-cdp-wsUrl/` - Custom CDP URL (no SDK)
- `hackernews-playwright-browserbase/` - Same example using Playwright instead of raw CDP

## How It Works

- `GET /` - HTML page with a "Scrape" button
- `GET /scrape` - Returns scraped stories as JSON

The scraper uses CDP (Chrome DevTools Protocol) with Browserbase as the browser provider to:

1. Connect to a remote browser
2. Navigate to Hacker News
3. Extract the top 5 stories
4. Return them as JSON

## Deploy & Destroy

Secrets in `.dev.vars` are uploaded automatically. Then:

```bash
pnpm run deploy
pnpm run destroy  # Clean up after testing
```
