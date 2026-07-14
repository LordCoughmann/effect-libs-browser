# Working with Pages

Once you have a `page` (from any `withX` / `acquirePage`), what do you do with it? Three recipes for the most common interactions.

## Fill and submit a form

Locate fields by selector, fill them, submit. The Playwright locator API works identically through this library.

<!-- verify:stubs -->

```typescript
import { Effect, Layer, Redacted } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { BrowserbaseProvider } from "@effect-libs/browser-providers/browserbase";

const fillForm = (apiKey: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;
    const provider = yield* BrowserbaseProvider;

    return yield* playwright.withSession({ provider }, ({ page, session }) =>
      Effect.gen(function* () {
        console.log(`Session: ${session.id}`);

        yield* page.goto("https://forms.example.com/contact");

        // Fill text fields
        yield* page.fill('input[name="name"]', "Jane Doe");
        yield* page.fill('input[name="email"]', "jane@example.com");

        // Select a radio button
        yield* page.locator('[role="radio"][data-value="support"]').click();

        // Check a checkbox
        yield* page.locator('[role="checkbox"][aria-label="Newsletter"]').click();

        // Submit
        yield* page.locator('button[type="submit"]').click();

        // Wait for confirmation
        yield* page.waitForSelector(".confirmation");
        return yield* page.locator(".confirmation").textContent;
      }),
    );
  }).pipe(
    Effect.provide(
      Layer.merge(Playwright.layer, BrowserbaseProvider.layer({ apiKey: Redacted.make(apiKey) })),
    ),
  );
```

> **See also:** [`@effect-libs/browser-playwright` → Page API](../packages/playwright/index.md#added-apis), [Playwright — Input](../packages/playwright/input.md)

---

## Validate scraped data with schemas

Scraped data is unstructured — validate it with Effect Schema before returning. This catches missing selectors, changed page structure, and malformed data at the boundary.

<!-- verify:stubs -->

```typescript
import { Effect, Layer, Schema, Redacted } from "effect";

import { Playwright } from "@effect-libs/browser-playwright";
import { SteelProvider } from "@effect-libs/browser-providers/steel";

// Define the expected shape
class Story extends Schema.Class<Story>("Story")({
  title: Schema.String,
  url: Schema.String.pipe(Schema.optional),
  score: Schema.Finite.pipe(Schema.optional),
}) {}

const Stories = Schema.Array(Story);

const scrapeStories = (apiKey: string) =>
  Effect.gen(function* () {
    const playwright = yield* Playwright;
    const provider = yield* SteelProvider;

    return yield* playwright.withSession({ provider }, ({ page }) =>
      Effect.gen(function* () {
        yield* page.goto("https://news.ycombinator.com");

        // Extract raw data from the page
        const raw = yield* page.evaluate(() =>
          Array.from(document.querySelectorAll("tr.athing"))
            .slice(0, 5)
            .map((row) => {
              const titleEl = row.querySelector(".titleline > a");
              const scoreEl = row.nextElementSibling?.querySelector(".score");
              return {
                title: titleEl?.textContent || "",
                url: titleEl?.getAttribute("href") || undefined,
                score: scoreEl ? parseInt(scoreEl.textContent || "0") : undefined,
              };
            }),
        );

        // Validate — fails with a typed error if the page structure changed
        return yield* Schema.decodeUnknownEffect(Stories)(raw);
      }),
    );
  }).pipe(
    Effect.provide(
      Layer.merge(Playwright.layer, SteelProvider.layer({ apiKey: Redacted.make(apiKey) })),
    ),
  );
```

The `Schema.decodeUnknownEffect` step gives you a typed `Story[]` or a parse error — no `any` types, no runtime surprises.

> **See also:** [Effect Schema documentation](https://effect.website/docs/schema/introduction/)

---

## Navigate and extract with Stagehand

Stagehand uses natural language instructions instead of selectors. Good for pages with dynamic layouts, generated class names, or complex interactions.

```typescript
import { Effect, Config } from "effect";
import { z } from "zod";

import { Stagehand } from "@effect-libs/browser-stagehand";

const extractWithAI = Effect.gen(function* () {
  const stagehand = yield* Stagehand;

  return yield* stagehand.withConnection({ url: "wss://..." }, ({ instance }) =>
    Effect.gen(function* () {
      // Natural language actions — no selectors needed
      yield* instance.use((s) => s.act("go to the pricing page"));
      yield* instance.use((s) => s.act("click the 'Enterprise' tab"));

      // Structured extraction with a Zod schema
      const data = yield* instance.use((s) =>
        s.extract(
          "get the enterprise plan details",
          z.object({
            plan: z.string(),
            price: z.string(),
            features: z.array(z.string()),
          }),
        ),
      );

      return data; // typed: { plan: string; price: string; features: string[] }
    }),
  );
}).pipe(
  Effect.provide(
    Stagehand.layerConfig({
      model: Config.succeed("openai/gpt-4o"),
      apiKey: Config.redacted("OPENAI_API_KEY"),
    }),
  ),
);
```

Combine with `browser-playwright` for deterministic control + AI extraction on the same session — see the [`browser-stagehand` docs](../packages/stagehand/index.md).

> **Note:** Stagehand calls an LLM at runtime. Every `act`/`extract`/`observe` call costs money and adds latency.

> **See also:** [`browser-stagehand`](../packages/stagehand/index.md)

## See also

- [Concepts → Errors are typed](../concepts/errors.md) — `OperationError` when selectors change
- [Retries and timeouts](./retries-and-timeouts.md) — the page load is flaky
