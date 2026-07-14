# Hacker News Stagehand Scraper - CDP

A Hacker News scraper running on Cloudflare Workers using Stagehand with a custom CDP URL.

## Cost Warning

This example calls an **LLM provider** for navigation and extraction; each scrape consumes tokens. Check your LLM provider's pricing before running.

## Quick Start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set your CDP URL and LLM config:

   ```bash
   echo "CDP_URL=ws://your-browser:9222" > .dev.vars
   echo "LLM_MODEL=mistral/mistral-medium-2508" >> .dev.vars
   echo "LLM_API_KEY=your-llm-api-key" >> .dev.vars
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

## LLM Models

Supported model formats:

- `mistral/mistral-medium-2508` - Mistral (recommended for cost/performance)
- `openai/gpt-4o` - OpenAI
- `anthropic/claude-sonnet-4-6` - Anthropic
- `google/gemini-2.5-flash` - Google

## See Also

- `hackernews-stagehand-playwright/` - Stagehand + Playwright mixing pattern

## How It Works

- `GET /` - HTML page with CDP URL input and "Scrape" button
- `GET /config` - Returns env CDP_URL if set (for pre-filling the input)
- `GET /scrape?url=...` - Returns scraped stories as JSON

The scraper uses Stagehand to:

1. Connect to a browser via CDP WebSocket
2. Use AI to navigate to Hacker News
3. Use AI to extract the top 5 stories
4. Return them as JSON

Stagehand uses AI-powered operations, which requires an LLM API key.

**Note**: You are responsible for managing the browser lifecycle. The worker only connects to an already-running browser.

## Deploy & Destroy

Secrets in `.dev.vars` are uploaded automatically. Then:

```bash
pnpm run deploy
pnpm run destroy  # Clean up after testing
```