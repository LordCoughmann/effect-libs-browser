/**
 * Frame selector — discriminates between selector forms accepted by
 * `page.frame()` and `frame.frameLocator()`.
 *
 * Mirrors Playwright's `FrameSelector` type:
 *
 * - **string**: CSS selector matching an `<iframe>` element in the parent
 *   frame. The iframe's content frame is returned.
 * - **`{ name }`**: find a frame whose `name` attribute matches.
 * - **`{ url }`**: find a frame whose URL matches (glob or RegExp).
 *
 * Discriminated by shape — not by a `_tag` field — so callers don't need to
 * wrap object forms in a discriminator.
 */
import { Predicate } from "effect";

import { matchUrl } from "../utils.js";

export type FrameSelector =
  | string
  | {
      readonly name?: string;
      readonly url?: string | RegExp;
    };

/**
 * Check whether a frame URL matches a selector's `url` field.
 * Returns `true` when `url` is `undefined` (no constraint).
 */
export const frameSelectorMatchesUrl = (selector: FrameSelector, frameUrl: string): boolean => {
  if (Predicate.isString(selector)) return true;
  if (selector.url === undefined) return true;
  return matchUrl(selector.url, frameUrl);
};

/**
 * Check whether a frame name matches a selector's `name` field.
 * Returns `true` when `name` is `undefined` (no constraint).
 */
export const frameSelectorMatchesName = (selector: FrameSelector, frameName: string): boolean => {
  if (Predicate.isString(selector)) return true;
  if (selector.name === undefined) return true;
  return selector.name === frameName;
};
