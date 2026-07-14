/**
 * Minimal test worker for Stagehand + CDP in workerd.
 *
 * WORKAROUND for: https://github.com/cloudflare/workers-sdk/issues/13037
 * Fix in progress: https://github.com/cloudflare/workers-sdk/pull/13062
 *
 * This worker is tested via `wrangler dev` (not vitest-pool-workers) because
 * vitest-pool-workers has a module resolution bug with @smithy/* packages.
 *
 * Exposes Stagehand operations via HTTP for integration testing:
 * - POST with { cdpUrl, llm, action: "connect" } - connect to browser
 * - POST with { cdpUrl, llm, action: "act", input, navigateUrl } - execute AI action
 * - POST with { cdpUrl, llm, action: "extract", input, navigateUrl } - extract data
 */

import { Effect, Schema } from "effect";

import { Stagehand, toZodSchema } from "@effect-libs/browser-stagehand";

// Schema for extract operation
const TitleSchema = Schema.Struct({
  title: Schema.String,
});

// Worker entry
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = (await request.json()) as {
        cdpUrl: string;
        llm: { model: string; apiKey: string };
        action: "connect" | "act" | "extract";
        input?: string;
        navigateUrl?: string;
      };

      const result = await runStagehand(body);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

// Stagehand operation
async function runStagehand(req: {
  cdpUrl: string;
  llm: { model: string; apiKey: string };
  action: "connect" | "act" | "extract";
  input?: string;
  navigateUrl?: string;
}): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const program = Effect.gen(function* () {
    const stagehand = yield* Stagehand;
    const zodSchema = yield* toZodSchema(TitleSchema);

    return yield* stagehand.withConnection({ url: req.cdpUrl }, ({ instance }) =>
      Effect.gen(function* () {
        // Navigate if URL provided
        if (req.navigateUrl) {
          const url = req.navigateUrl;
          yield* instance.use(async (s) => {
            const page = await s.context.awaitActivePage();
            await page.goto(url);
          });
        }

        switch (req.action) {
          case "connect":
            yield* instance.use(async (s) => {
              const page = await s.context.awaitActivePage();
              await page.waitForLoadState("domcontentloaded");
            });
            return { connected: true };

          case "act":
            if (!req.input) return { acted: false };
            yield* instance
              .use((s) => s.act(req.input!))
              .pipe(
                Effect.timeout("30 seconds"),
                Effect.orElseSucceed(() => null),
              );
            return { acted: true };

          case "extract":
            if (!req.input) return { extracted: false };
            const extracted = yield* instance
              .use((s) => s.extract(req.input!, zodSchema))
              .pipe(
                Effect.timeout("30 seconds"),
                Effect.orElseSucceed(() => ({ title: "" })),
              );
            return { extracted: true, data: extracted };
        }
      }),
    );
  }).pipe(Effect.provide(Stagehand.layer(req.llm)));

  try {
    const result = await Effect.runPromise(program);
    return { success: true, result };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
