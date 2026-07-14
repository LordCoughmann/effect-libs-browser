# Hacker News Scraper - CDP + Cloudflare Browser Run (HTTP API)

A Hacker News scraper running on Cloudflare Workers using CDP with Cloudflare Browser Run's HTTP API.

## Cost Warning

This example uses **Cloudflare Browser Run**, which has separate usage fees from Workers. Check [Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/) before running.

## Quick Start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy `.dev.vars.example` to `.dev.vars`:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Add your Cloudflare credentials to `.dev.vars`:
   - `CF_ACCOUNT_ID`: Your Cloudflare account ID
   - `CF_API_TOKEN`: API token with Browser Run permissions

   Create a token at the [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) with Browser Run permissions. See [Browser Run docs](https://developers.cloudflare.com/browser-run/) for details.

4. Start the dev server:

   ```bash
   pnpm run dev
   ```

5. Open the URL shown in the output (e.g., `http://localhost:8787`)
6. Click the "Scrape" button to scrape Hacker News

## See Also

- `hackernews-playwright-cfBrowserRunBinding/` - Same example using Playwright with the native Browser Run binding (faster path on Cloudflare Workers)

## How It Works

1. User clicks "Scrape" button in the HTML UI
2. Worker calls Browser Run HTTP API to create a browser session
3. CDP connects via WebSocket URL from the session
4. Page navigates to Hacker News and extracts top 5 stories
5. Data is validated against Schema and returned as JSON

## Deploy & Destroy

Secrets in `.dev.vars` are uploaded automatically. Then:

```bash
pnpm run deploy
pnpm run destroy  # Clean up after testing
```
