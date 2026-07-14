/**
 * Shared test helpers for matching Playwright and Stagehand errors.
 * Uses pattern matching on the "reason" field of parent error types.
 */

import type { PlaywrightError } from "@effect-libs/browser-playwright";
import type { StagehandError } from "@effect-libs/browser-stagehand";

import { Predicate } from "effect";

// =============================================================================
// Playwright Error Matching
// =============================================================================

/**
 * Categorize PlaywrightError into a structured result for assertions.
 * Pattern matches on the reason field using namespaced tags.
 */
export function categorizePlaywrightError(
  e: unknown,
):
  | { _tag: "connection"; description: string }
  | { _tag: "context"; description: string }
  | { _tag: "operation"; method: string; description: string }
  | { _tag: "navigation"; method: string; url: string; description: string }
  | { _tag: "unknown" } {
  if (Predicate.isTagged("effect-libs/browser/PlaywrightError")(e)) {
    const reason = (e as PlaywrightError).reason;

    if (Predicate.isTagged("effect-libs/browser/PlaywrightError/ConnectionError")(reason)) {
      return { _tag: "connection", description: reason.description };
    }
    if (Predicate.isTagged("effect-libs/browser/PlaywrightError/ContextError")(reason)) {
      return { _tag: "context", description: reason.description };
    }
    if (Predicate.isTagged("effect-libs/browser/PlaywrightError/OperationError")(reason)) {
      return { _tag: "operation", method: reason.method, description: reason.description };
    }
    if (Predicate.isTagged("effect-libs/browser/PlaywrightError/NavigationError")(reason)) {
      return {
        _tag: "navigation",
        method: reason.method,
        url: reason.url,
        description: reason.description,
      };
    }
  }
  return { _tag: "unknown" };
}

// =============================================================================
// Stagehand Error Matching
// =============================================================================

/**
 * Categorize StagehandError into a structured result for assertions.
 * Pattern matches on the reason field using namespaced tags.
 */
// fallow-ignore-next-line unused-export
export function categorizeStagehandError(
  e: unknown,
):
  | { _tag: "connection"; description: string }
  | { _tag: "operation"; action: string; description: string }
  | { _tag: "agent"; description: string }
  | { _tag: "unknown" } {
  if (Predicate.isTagged("effect-libs/browser/StagehandError")(e)) {
    const reason = (e as StagehandError).reason;

    if (Predicate.isTagged("effect-libs/browser/StagehandError/ConnectionError")(reason)) {
      return { _tag: "connection", description: reason.description };
    }
    if (Predicate.isTagged("effect-libs/browser/StagehandError/OperationError")(reason)) {
      return { _tag: "operation", action: reason.action, description: reason.description };
    }
    if (Predicate.isTagged("effect-libs/browser/StagehandError/AgentError")(reason)) {
      return { _tag: "agent", description: reason.description };
    }
  }
  return { _tag: "unknown" };
}
