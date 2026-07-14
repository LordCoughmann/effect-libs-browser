/**
 * Vitest workspace configuration.
 *
 * Aggregates all test projects with shared configuration.
 * Run all tests: `vitest run`
 * Run specific project: `vitest run --project=unit`
 *
 * Projects:
 * - unit: Unit tests (Node.js, mocked dependencies)
 * - smoke-node: Smoke tests (Node.js, verify modules load)
 * - smoke-workerd: Smoke tests (Cloudflare Workers runtime, with nodejs_compat)
 * - smoke-workerd-nocompat: Smoke tests (Cloudflare Workers runtime, no nodejs_compat) — CDP-only
 * - integration-node: Integration tests (Node.js, requires Chrome + HTTP server)
 * - integration-workerd: Integration tests (Cloudflare Workers runtime, with nodejs_compat)
 * - integration-workerd-nocompat: Integration tests (Cloudflare Workers runtime, no nodejs_compat) — CDP-only
 * - providers: Provider tests (real API calls, costs money)
 */

import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  // Unit tests
  "vitest.unit.config.ts",
  // Smoke tests
  "vitest.smoke.node.config.ts",
  "vitest.smoke.workerd.config.ts",
  "vitest.smoke.workerd.nocompat.config.ts",
  // Integration tests
  "vitest.integration.node.config.ts",
  "vitest.integration.workerd.config.ts",
  "vitest.integration.workerd.nocompat.config.ts",
  // Provider tests (real APIs)
  "vitest.providers.config.ts",
]);
