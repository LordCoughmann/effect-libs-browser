/**
 * Cloudflare Browser Run Binding provider integration tests for workerd runtime.
 *
 * Uses shared test definitions from integration/shared/providers/cf-browser-run-binding.ts.
 *
 * These tests require the `[browser]` binding in wrangler config.
 * They are automatically skipped when the binding is not available (e.g., local dev).
 */

import { defineCfBrowserRunBindingProviderTests } from "@test/integration/shared/providers/cf-browser-run-binding.js";
import { make } from "@test/utils/effect-test/Vitest.js";

// Empty config — binding provider gets endpoint from cloudflare:workers env
defineCfBrowserRunBindingProviderTests(make(), { wsUrl: "", httpUrl: "" });
