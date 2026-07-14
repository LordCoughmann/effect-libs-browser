# Hacker News Stagehand + Playwright Scraper

A Hacker News scraper running on Cloudflare Workers showing how to mix Stagehand (AI-powered) with Playwright (direct control) on the same browser session.

## Cost Warning

This example calls an **LLM provider** for navigation and extraction; each scrape consumes tokens. Check your LLM provider's pricing before running.

## Pattern

This example demonstrates mixing Playwright and Stagehand on the same browser session:

- **Playwright** for reliable navigation (no LLM cost, deterministic).
- **Stagehand** for AI-powered extraction (handles dynamic content, natural language queries).

```typescript
// Playwright for reliable navigation
yield* page.goto("https://news.ycombinator.com");

// Stagehand for AI-powered extraction on the same browser
yield* stagehand.withConnection({ url: cdpUrl }, ({ instance }) =>
  instance.use((s) => s.extract("get the stories", schema)),
);
```

To use with a provider that gives both a Playwright page and CDP URL:

```typescript
import { Steel } from "@effect-libs/browser-providers/steel";

yield* steel.withSession(({ page, session }) =>
  stagehand.withConnection(session.cdpUrl, ({ instance }) =>
    Effect.gen(function* () {
      yield* page.goto(...);                     // Playwright
      yield* instance.use((s) => s.act(...));   // Stagehand
    }),
  ),
);
```

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

## LLM Models

Supported model formats:

- `mistral/mistral-medium-2508` - Mistral (recommended for cost/performance)
- `openai/gpt-4o` - OpenAI
- `anthropic/claude-sonnet-4-6` - Anthropic
- `google/gemini-2.5-flash` - Google

## See Also

- `hackernews-stagehand-cdp/` - Stagehand only (no Playwright)

## How It Works

- `GET /` - HTML page with CDP URL input and "Scrape" button
- `GET /config` - Returns env CDP_URL if set (for pre-filling the input)
- `GET /scrape?url=...` - Returns scraped stories as JSON

The scraper uses Playwright for navigation and Stagehand for extraction:

1. Playwright connects to a browser via CDP WebSocket
2. Playwright navigates to Hacker News
3. Stagehand uses AI to extract the top 5 stories
4. Return them as JSON

**Note**: You are responsible for managing the browser lifecycle. The worker only connects to an already-running browser.

## Deploy & Destroy

Secrets in `.dev.vars` are uploaded automatically. Then:

```bash
pnpm run deploy
pnpm run destroy  # Clean up after testing
```