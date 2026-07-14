/**
 * AsyncLocalStorage polyfill for Cloudflare Workers.
 *
 * ## Problem
 *
 * Stagehand v3's FlowLogger.init() calls AsyncLocalStorage.enterWith() to set
 * session-wide logging context. Cloudflare Workers intentionally omits
 * enterWith() from their AsyncLocalStorage implementation because it mutates
 * context for the entire remaining async chain, which is unsafe across
 * concurrent requests. Without this polyfill, Stagehand throws
 * "asyncLocalStorage.enterWith() is not implemented" during init().
 *
 * ## Solution
 *
 * We stub enterWith() to be a no-op that doesn't throw. This is sufficient
 * because Stagehand's FlowLogger uses loggerContext.run() for all actual
 * context propagation (runWithLogging, withContext, logCdpEvent, etc.),
 * which is supported everywhere. The enterWith() call is just a convenience
 * optimization - if it fails, the explicit-context path via run() still works.
 *
 * ## Why not a full polyfill?
 *
 * We previously implemented a full enterWith() approximation with WeakMap
 * fallback and run() depth tracking. However, this was over-engineered:
 * - Stagehand doesn't need enterWith() to actually store context
 * - They just need it not to throw
 * - All actual logging uses run() which works natively in CF Workers
 * - The approximation added complexity without benefit
 *
 * ## Upstream Fix
 *
 * This polyfill can be removed once the upstream fix is merged:
 * - Issue: https://github.com/browserbase/stagehand/issues/2055
 * - PR: https://github.com/browserbase/stagehand/pull/2062
 *
 * The upstream fix wraps the enterWith call in try-catch, ignoring the error.
 * Once released, Stagehand will handle the missing enterWith() gracefully.
 *
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Check if AsyncLocalStorage.enterWith() is actually functional.
 * In workerd (Cloudflare Workers), enterWith exists as a function that throws
 * "not implemented" rather than being undefined. We need to detect this.
 */
function isEnterWithFunctional(): boolean {
  try {
    const testAls = new AsyncLocalStorage();
    const testValue = Symbol("enterWith-test");
    testAls.enterWith(testValue);
    return testAls.getStore() === testValue;
  } catch {
    return false;
  }
}

// Only apply polyfill if enterWith is not functional (Cloudflare Workers)
if (!isEnterWithFunctional()) {
  /**
   * Stub enterWith() to be a no-op.
   *
   * Stagehand's FlowLogger only needs this not to throw. All actual context
   * propagation uses run() which works natively in CF Workers.
   *
   * @see https://github.com/browserbase/stagehand/pull/2062
   */
  AsyncLocalStorage.prototype.enterWith = function <T>(_store: T): void {
    // No-op - Stagehand uses run() for actual context propagation
  };
}
