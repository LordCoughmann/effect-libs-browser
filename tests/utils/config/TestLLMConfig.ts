/**
 * LLM test configuration for Stagehand tests.
 *
 * Simple config reading - Stagehand handles provider parsing and validation.
 * Users set LLM_MODEL, LLM_API_KEY, LLM_BASE_URL env vars.
 *
 * For local providers (ollama, lmstudio), set a dummy API key if needed.
 */

import { Config, Effect, Option, Redacted, String } from "effect";

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LLM_MODEL = "mistral/mistral-medium-2508";

// ── Skip Check ────────────────────────────────────────────────────────────────

/**
 * Check if LLM config is valid (API key is set).
 *
 * Run with Effect.runSync for module load time skip decisions.
 *
 * Note: Stagehand handles provider-specific logic internally (e.g., ollama
 * doesn't need API key). For other local providers, set a dummy API key.
 */
export const hasValidLLMConfig = Effect.gen(function* () {
  const apiKey = yield* Config.redacted("LLM_API_KEY").pipe(Config.withDefault(Redacted.make("")));
  return String.isNonEmpty(Redacted.value(apiKey));
});

// ── Config Reading ─────────────────────────────────────────────────────────────

/**
 * Get the Stagehand-compatible LLM config.
 *
 * Reads from LLM_MODEL, LLM_API_KEY, LLM_BASE_URL env vars.
 * Stagehand parses the provider from the model string.
 */
export const getLLMConfig = Effect.gen(function* () {
  const model = yield* Config.string("LLM_MODEL").pipe(Config.withDefault(DEFAULT_LLM_MODEL));
  const apiKey = yield* Config.redacted("LLM_API_KEY");
  const baseURL = yield* Config.string("LLM_BASE_URL").pipe(Config.option);

  const result: { model: string; apiKey: string; baseURL?: string } = {
    model,
    apiKey: Redacted.value(apiKey),
  };

  if (Option.isSome(baseURL)) {
    result.baseURL = baseURL.value;
  }

  return result;
});
