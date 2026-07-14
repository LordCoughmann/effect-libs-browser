/**
 * Dummy entry point for wrangler.test.jsonc.
 *
 * WHY THIS FILE EXISTS:
 * - vitest-pool-workers requires a wrangler config (wrangler.test.jsonc)
 * - Wrangler requires a "main" entry point in its config
 * - The actual tests are run by vitest, not wrangler
 * - This file satisfies wrangler's requirement without doing anything
 *
 * USAGE:
 * - wrangler.test.jsonc sets "main" to this file
 * - vitest-pool-workers uses the wrangler config for compatibility flags and aliases
 * - The real tests are in tests/integration/runtime/workerd/cdp/ and playwright/
 *
 * @see wrangler.test.jsonc - Wrangler config for vitest-pool-workers
 * @see vitest.integration.workerd.config.ts - Vitest config that uses wrangler.test.jsonc
 */
export default {};
