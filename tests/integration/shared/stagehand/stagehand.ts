/**
 * Shared Stagehand integration tests using the TestApi abstraction.
 *
 * These tests verify AI-powered browser interaction via CDP.
 * They require:
 * - A browser (local Chrome or remote CDP endpoint)
 * - LLM configured via environment variables (see .env.example)
 *
 * Used by:
 * - tests/integration/runtime/node/stagehand/StagehandBrowser.integration.test.ts
 * - tests/integration/runtime/workerd/stagehand/StagehandBrowser.integration.test.ts
 */

import type { StagehandInstance } from "@effect-libs/browser-stagehand";

import type { TestApi, TestConfig } from "../../../utils/effect-test/EffectTest.js";

import { Effect, Layer, Schema } from "effect";

import { Stagehand, toZodSchema } from "@effect-libs/browser-stagehand";

import { TestBrowserConfig, hasBrowserConfig } from "../../../utils/config/TestBrowserConfig.js";
import { hasValidLLMConfig, getLLMConfig } from "../../../utils/config/TestLLMConfig.js";

// Combined layer for tests - we need to build this dynamically since LLM config varies
const makeTestLayer = (llmConfig: { model: string; apiKey: string }) =>
  Layer.merge(TestBrowserConfig.layer, Stagehand.layer(llmConfig));

// ── Shared Helpers ──────────────────────────────────────────────────────────────

const navigateTo = (url: string) =>
  Effect.fn("navigateTo")(function* (instance: StagehandInstance) {
    yield* instance.use(async (s) => {
      const page = await s.context.awaitActivePage();
      await page.goto(url);
    });
  });

// ── Tests ───────────────────────────────────────────────────────────────────────

export const defineStagehandTests = (api: TestApi, _config: TestConfig): void => {
  const { describe, layer } = api;

  // Check if tests should be skipped (lazy, not at module load time)
  const browserAvailable = Effect.runSync(
    hasBrowserConfig.pipe(Effect.provide(TestBrowserConfig.layer)),
  );
  const llmAvailable = Effect.runSync(hasValidLLMConfig);
  const describeIntegration = browserAvailable && llmAvailable ? describe : describe.skip;

  describeIntegration("Stagehand Integration", () => {
    // Build layer dynamically with LLM config using Layer.unwrap
    layer(
      Layer.unwrap(
        Effect.gen(function* () {
          const llmConfig = yield* getLLMConfig;
          return makeTestLayer(llmConfig);
        }),
      ),
    )((it) => {
      describe("Connection", () => {
        it.effect("connects to browser via CDP", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const stagehand = yield* Stagehand;

            const result = yield* stagehand.withConnection({ url: browserWsUrl }, () =>
              Effect.succeed("connected"),
            );

            yield* Effect.logInfo(`Result: ${result}`);
          }),
        );

        it.effect("fails gracefully with invalid endpoint", () =>
          Effect.gen(function* () {
            const stagehand = yield* Stagehand;

            const result = yield* stagehand
              .withConnection({ url: "ws://localhost:9999" }, () =>
                Effect.succeed("should not reach"),
              )
              .pipe(
                Effect.map(() => ({ success: true as const })),
                Effect.catchTag("effect-libs/browser/StagehandError", (e) =>
                  Effect.succeed({ success: false as const, message: e.message }),
                ),
              );

            yield* Effect.logInfo(`Result: ${JSON.stringify(result)}`);
          }),
        );
      });

      describe("AI Actions", () => {
        it.effect(
          "executes act() via use pattern",
          () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const stagehand = yield* Stagehand;

              yield* stagehand.withConnection({ url: browserWsUrl }, ({ instance }) =>
                Effect.gen(function* () {
                  yield* navigateTo(browserConfig.httpBaseUrl)(instance);

                  const result = yield* instance
                    .use((s) => s.act("click the link that says 'Links Page'"))
                    .pipe(
                      Effect.timeout("30 seconds"),
                      Effect.match({
                        onFailure: () => ({ clicked: false }),
                        onSuccess: () => ({ clicked: true }),
                      }),
                    );

                  yield* Effect.logInfo(`Act result: ${JSON.stringify(result)}`);
                }),
              );
            }),
          { timeoutMs: 45_000 },
        );

        it.effect(
          "observes available elements on page",
          () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const stagehand = yield* Stagehand;

              const result = yield* stagehand.withConnection(
                { url: browserWsUrl },
                ({ instance }) =>
                  Effect.gen(function* () {
                    yield* navigateTo(`${browserConfig.httpBaseUrl}/form`)(instance);

                    const observations = yield* instance
                      .use((s) => s.observe("What can I click on this page?"))
                      .pipe(
                        Effect.timeout("30 seconds"),
                        Effect.match({
                          onFailure: () => [],
                          onSuccess: (data: unknown) => data,
                        }),
                      );

                    return observations;
                  }),
              );

              yield* Effect.logInfo(`Observations: ${JSON.stringify(result)}`);
            }),
          { timeoutMs: 45_000 },
        );
      });

      describe("Data Extraction", () => {
        it.effect(
          "extracts structured data via use pattern",
          () =>
            Effect.gen(function* () {
              const browserConfig = yield* TestBrowserConfig;
              const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
              const stagehand = yield* Stagehand;

              const result = yield* stagehand.withConnection(
                { url: browserWsUrl },
                ({ instance }) =>
                  Effect.gen(function* () {
                    yield* navigateTo(browserConfig.httpBaseUrl)(instance);

                    // Convert Effect Schema to Zod for Stagehand
                    const TitleSchema = yield* toZodSchema(Schema.Struct({ title: Schema.String }));

                    return yield* instance
                      .use((s) => s.extract("extract the page title", TitleSchema))
                      .pipe(
                        Effect.timeout("30 seconds"),
                        Effect.match({
                          onFailure: () => ({ title: "" }),
                          onSuccess: (data: unknown) => data,
                        }),
                      );
                  }),
              );

              yield* Effect.logInfo(`Extracted: ${JSON.stringify(result)}`);
            }),
          { timeoutMs: 45_000 },
        );
      });

      describe("Resource Management", () => {
        it.effect("properly closes session after operations", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const stagehand = yield* Stagehand;

            const result = yield* stagehand.withConnection({ url: browserWsUrl }, ({ instance }) =>
              Effect.gen(function* () {
                yield* navigateTo(browserConfig.httpBaseUrl)(instance);
                return "success";
              }),
            );

            yield* Effect.logInfo(`Result: ${result}`);
          }),
        );

        it.effect("can run multiple operations in sequence", () =>
          Effect.gen(function* () {
            const browserConfig = yield* TestBrowserConfig;
            const browserWsUrl = yield* browserConfig.getBrowserWsUrl;
            const stagehand = yield* Stagehand;

            const result = yield* stagehand.withConnection({ url: browserWsUrl }, ({ instance }) =>
              Effect.gen(function* () {
                yield* navigateTo(browserConfig.httpBaseUrl)(instance);

                yield* instance.use(async (s) => {
                  const page = await s.context.awaitActivePage();
                  await page.waitForSelector("body");
                });

                const title = yield* instance.use(async (s) => {
                  const page = await s.context.awaitActivePage();
                  return page.title();
                });

                return title;
              }),
            );

            yield* Effect.logInfo(`Title: ${result}`);
          }),
        );
      });
    });
  });
};
