# Hacker News Playwright Scraper - Alchemy Cloudflare Worker

A Hacker News scraper running on Cloudflare Workers via [Alchemy](https://alchemy.run) using Playwright with a custom WebSocket URL.

Uses the class-based Effect-style Worker pattern — runtime code lives in `src/worker.ts`, infrastructure (Stack) in `alchemy.run.ts`.

## Quick Start

1. Install dependencies (from repo root):

   ```bash
   pnpm install
   ```

2. Set your CDP URL:

   ```bash
   echo "CDP_URL=ws://your-browser:9222" > .env
   ```

3. Start the dev server:

   ```bash
   pnpm run dev
   ```

4. Open the URL shown in the output (e.g., `http://localhost:1337`)
5. Enter your CDP URL in the input field (or use the pre-filled value from .env)
6. Click the "Scrape" button to scrape Hacker News

## CDP URL Options

The `CDP_URL` can point to:

- **Local Chrome**: Start Chrome with `--remote-debugging-port=9222` and tunnel it (ngrok, cloudflare tunnel)
- **VPS/Cloud server**: A browser running on a remote server
- **Provider URL**: Some providers expose direct WebSocket URLs (e.g., `ws://steel.dev/...?apikey=...`)

## See Also

- Wrangler variant: [`../cf-workers/hackernews-playwright-wsUrl/`](../cf-workers/hackernews-playwright-wsUrl/) — same scraper, deployed via plain `wrangler` (no Alchemy)
- `hackernews-cdp-wsUrl/` - Same example using raw CDP instead of Playwright

## How It Works

- `GET /` - HTML page with CDP URL input and "Scrape" button
- `POST /scrape` - Scrapes Hacker News, returns stories as JSON

The scraper uses Playwright to:

1. Connect to a browser via CDP WebSocket
2. Navigate to Hacker News
3. Extract the top 5 stories
4. Return them as JSON

**Note**: You are responsible for managing the browser lifecycle. The worker only connects to an already-running browser.

## Architecture

```
alchemy.run.ts     ← Alchemy Stack (plantime infrastructure)
src/worker.ts      ← Worker runtime (bundled for Cloudflare Workers)
```

The Worker and Stack are in **separate files** so that alchemy's bundler (rolldown) only includes runtime code in the worker bundle. This prevents plantime dependencies (jiti, postcss, vite) from being bundled into the worker, which would cause `createRequire(undefined)` errors in the workerd runtime.

## Deploy & Destroy

Secrets are read from `.env` automatically. Then:

```bash
pnpm run deploy
pnpm run destroy  # Clean up after testing
```