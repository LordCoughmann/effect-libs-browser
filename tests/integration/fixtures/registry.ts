/**
 * Test fixture registry — collects pages from all fixture modules.
 *
 * Add your test pages to the appropriate fixture file (e.g., click.ts, fill.ts).
 * Shared pages used by multiple test suites go in pages.ts.
 * Suite-specific pages go in their own file.
 *
 * @module tests/integration/fixtures/registry
 */

import { clickPages } from "./click.js";
import { testPages } from "./pages.js";
import { selectPages } from "./select.js";

/** Type for test page maps. */
export type TestPages = Record<string, string>;

/**
 * All test pages merged from all fixture modules.
 *
 * Suite-specific pages override shared pages if there's a key collision.
 */
export const allTestPages: TestPages = {
  ...testPages,
  ...clickPages,
  ...selectPages,
};
