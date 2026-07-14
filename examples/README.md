# Examples

Runnable Cloudflare Workers apps that scrape Hacker News using every module
and provider combination. See [Getting started →](../docs/getting-started.md)
to install the library first.

## Cloudflare Workers

### CDP

Zero-dependency, no runtime requirements. Limited Playwright-compatible API
with full raw CDP access.

| Example | Description |
| --- | --- |
| [hackernews-cdp-wsUrl](./cf-workers/hackernews-cdp-wsUrl/) | CDP with custom WebSocket URL |
| [hackernews-cdp-steel](./cf-workers/hackernews-cdp-steel/) | CDP with Steel.dev |
| [hackernews-cdp-browserbase](./cf-workers/hackernews-cdp-browserbase/) | CDP with Browserbase |
| [hackernews-cdp-cfBrowserRun](./cf-workers/hackernews-cdp-cfBrowserRun/) | CDP with Browser Run (HTTP) |

### Playwright

Full Playwright API on Workers, based on `@cloudflare/playwright`.

| Example | Description |
| --- | --- |
| [hackernews-playwright-wsUrl](./cf-workers/hackernews-playwright-wsUrl/) | Playwright with custom WebSocket URL |
| [hackernews-playwright-cfBrowserRunBinding](./cf-workers/hackernews-playwright-cfBrowserRunBinding/) | Playwright with Browser Run (native binding) |
| [hackernews-playwright-steel](./cf-workers/hackernews-playwright-steel/) | Playwright with Steel.dev |
| [hackernews-playwright-browserbase](./cf-workers/hackernews-playwright-browserbase/) | Playwright with Browserbase |

### Stagehand

LLM-based browser automation with natural language.

| Example | Description |
| --- | --- |
| [hackernews-stagehand-cdp](./cf-workers/hackernews-stagehand-cdp/) | Stagehand with CDP (no Playwright) |
| [hackernews-stagehand-playwright](./cf-workers/hackernews-stagehand-playwright/) | Stagehand + Playwright mixing pattern |

## Cloudflare Workers with Alchemy

Same scrapers, deployed via [Alchemy](https://alchemy.run)
infrastructure-as-Effects. Each Alchemy example has a wrangler-based twin in
the `cf-workers/` directory (see the "See Also" section of each alchemy
README).

| Example | Description |
| --- | --- |
| [hackernews-cdp-wsUrl](./cf-workers-alchemy/hackernews-cdp-wsUrl/) | CDP with custom WebSocket URL |
| [hackernews-playwright-wsUrl](./cf-workers-alchemy/hackernews-playwright-wsUrl/) | Playwright with custom WebSocket URL |

## Run an example

Each example is a self-contained Workers app. Install dependencies once at
the repo root, then:

```bash
# Pick an example
cd examples/cf-workers/hackernews-cdp-wsUrl

# For ws URL examples, write the URL
echo "CDP_URL=ws://localhost:9222" > .dev.vars

# For provider examples, write the API key
echo "STEEL_API_KEY=your-key" > .dev.vars

pnpm install
pnpm run dev      # local dev server
pnpm run deploy   # deploy to Cloudflare
```

To prepare all examples at once:

```bash
pnpm examples:prepare        # copy root .env into every example
pnpm examples:typecheck      # typecheck every example
```

Examples use `catalog:*` in their `package.json` to reference versions from
the root catalog, so no separate sync step is needed.

## See also

- [Client + provider → Choosing a client](../docs/concepts/client-and-provider.md#choosing-a-client) — which client to pick
- [Providers →](../docs/providers/index.md) — provider install + swap patterns
- [Cloudflare Workers guide →](../docs/guides/cloudflare-workers.md) — `wrangler.toml`, `nodejs_compat`, runtime gotchas