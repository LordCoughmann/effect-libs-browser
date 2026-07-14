# Hacker News Playwright Scraper - Steel.dev

A Hacker News scraper running on Cloudflare Workers using Playwright with Steel.dev provider.

## Cost Warning

This example uses **Steel.dev**, which charges per browser session. Check [Steel pricing](https://docs.steel.dev/overview/pricinglimits) before running.

## Quick Start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Get a Steel API key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys).

3. Set your Steel API key:

   ```bash
   echo "STEEL_API_KEY=your-api-key" > .dev.vars
   ```

4. Start the dev server:

   ```bash
   pnpm run dev
   ```

5. Open the URL shown in the output (e.g., `http://localhost:8787`)
6. Click the "Scrape" button to scrape Hacker News

## See Also

- `hackernews-playwright-browserbase/` - Browserbase provider
- `hackernews-playwright-wsUrl/` - Custom CDP URL (no SDK)
- `hackernews-cdp-steel/` - Same example using raw CDP instead of Playwright

## How It Works

- `GET /` - HTML page with a "Scrape" button
- `GET /scrape` - Returns scraped stories as JSON

The scraper uses Playwright with Steel.dev as the browser provider to:

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
