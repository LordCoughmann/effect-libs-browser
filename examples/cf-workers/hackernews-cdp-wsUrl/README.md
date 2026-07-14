# Hacker News CDP Scraper - Cloudflare Worker

A Hacker News scraper running on Cloudflare Workers using CDP with a custom WebSocket URL.

## Quick Start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set your CDP URL:

   ```bash
   echo "CDP_URL=ws://your-browser:9222" > .dev.vars
   ```

3. Start the dev server:

   ```bash
   pnpm run dev
   ```

4. Open the URL shown in the output (e.g., `http://localhost:8787`)
5. Enter your CDP URL in the input field (or use the pre-filled value from .dev.vars)
6. Click the "Scrape" button to scrape Hacker News

## CDP URL Options

The `CDP_URL` can point to:

- **Local Chrome**: Start Chrome with `--remote-debugging-port=9222` and tunnel it (ngrok, cloudflare tunnel)
- **VPS/Cloud server**: A browser running on a remote server
- **Provider URL**: Some providers expose direct WebSocket URLs (e.g., `ws://steel.dev/...?apikey=...`)

For provider-managed sessions with SDK support, see:

- `hackernews-cdp-steel/` - Steel.dev provider
- `hackernews-cdp-browserbase/` - Browserbase provider

## See Also

- Alchemy variant: [`../cf-workers-alchemy/hackernews-cdp-wsUrl/`](../cf-workers-alchemy/hackernews-cdp-wsUrl/) — same scraper, deployed via [Alchemy](https://alchemy.run)
- `hackernews-playwright-wsUrl/` - Same example using Playwright instead of raw CDP

## How It Works

- `GET /` - HTML page with CDP URL input and "Scrape" button
- `GET /config` - Returns env CDP_URL if set (for pre-filling the input)
- `GET /scrape?url=...` - Returns scraped stories as JSON

The scraper uses CDP (Chrome DevTools Protocol) to:

1. Connect to a browser via CDP WebSocket
2. Navigate to Hacker News
3. Extract the top 5 stories
4. Return them as JSON

**Note**: You are responsible for managing the browser lifecycle. The worker only connects to an already-running browser.

## Deploy & Destroy

Secrets in `.dev.vars` are uploaded automatically. Then:

```bash
pnpm run deploy
pnpm run destroy  # Clean up after testing
```
