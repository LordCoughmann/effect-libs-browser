/**
 * Utility functions for `browser-cdp`.
 *
 */

import type { UrlMatch } from "./types.js";

import { Match, Predicate } from "effect";

/**
 * Test a URL against a UrlMatch pattern.
 */
export const matchUrl = (pattern: UrlMatch, url: string): boolean =>
  Match.value(pattern).pipe(
    Match.when(Predicate.isString, (p) => globMatch(p, url)),
    Match.when(Predicate.isRegExp, (p) => p.test(url)),
    Match.orElse((p) => {
      const parsed = URL.parse(url);
      return Predicate.isNotNull(parsed) && p(parsed);
    }),
  );

/**
 * Simple glob matcher supporting `*` (any chars) and `?` (single char).
 */
const globMatch = (pattern: string, str: string): boolean => {
  const regex = globToRegex(pattern);
  return regex.test(str);
};

const globToRegex = (pattern: string): RegExp => {
  let regex = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      regex += ".*";
    } else if (ch === "?") {
      regex += ".";
    } else if ("\\.^$+|()[]{}".includes(ch)) {
      regex += "\\" + ch;
    } else {
      regex += ch;
    }
  }
  return new RegExp(`^${regex}$`);
};
