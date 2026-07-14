/**
 * Shared types for `browser-cdp`.
 *
 */

/**
 * Navigation wait strategy — determines when navigation is considered complete.
 */
export type WaitUntil = "load" | "domcontentloaded" | "networkidle" | "commit";

/**
 * URL matcher for navigation methods (waitForNavigation, waitForURL).
 *
 * - string: glob pattern
 * - RegExp: test against the URL string
 * - function: (url: URL) => boolean predicate
 */
export type UrlMatch = string | RegExp | ((url: URL) => boolean);
