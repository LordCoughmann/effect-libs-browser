/**
 * Page error from the browser (uncaught JS exception).
 *
 * Mirrors Playwright's `page.on('pageerror', handler)` event data.
 */
export interface CdpPageError {
  /** Error message (description from CDP). */
  readonly message: string;
  /** Stack trace, formatted as V8-style frames. */
  readonly stack?: string;
}
