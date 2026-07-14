import { Predicate } from "effect";

/**
 * URL matching helpers for route interception.
 *
 * Shared between `Route` (HTTP request interception) and `RouteWebSocket`
 * (WebSocket interception). Ported from Playwright's `urlMatch.ts`
 * `globToRegexPattern()` and `urlMatches()`.
 *
 * URL matching patterns:
 * - `string` — glob pattern (e.g., '**\/*.css', '**\/api\/**')
 * - `RegExp` — regex test against full URL
 * - `(url: string) => boolean` — predicate function
 */

/**
 * URL matching pattern used by `route()` and `routeWebSocket()`.
 *
 * - `string` — glob pattern (e.g., '**\/*.css', '**\/api\/**')
 * - `RegExp` — regex test against full URL
 * - `(url: string) => boolean` — predicate function
 */
export type RouteUrlMatch = string | RegExp | ((url: string) => boolean);

/**
 * Converts a glob pattern to a regex pattern.
 *
 * Ported from Playwright's `urlMatch.ts` `globToRegexPattern()`.
 *
 * Glob rules:
 * - `**` matches any path segment (including `/`)
 * - `*` matches any characters except `/`
 * - `{a,b}` matches `a` or `b`
 * - `?` is NOT a wildcard — treated literally
 * - Other regex special chars are escaped
 */
export function globToRegexPattern(glob: string): string {
  const escapedChars = new Set([
    "$",
    "^",
    "+",
    ".",
    "*",
    "(",
    ")",
    "|",
    "\\",
    "?",
    "{",
    "}",
    "[",
    "]",
  ]);
  const tokens = ["^"];
  let inGroup = false;
  for (let i = 0; i < glob.length; ++i) {
    const c = glob[i];
    if (c === "\\" && i + 1 < glob.length) {
      const char = glob[++i];
      tokens.push(escapedChars.has(char) ? "\\" + char : char);
      continue;
    }
    if (c === "*") {
      const charBefore = glob[i - 1];
      let starCount = 1;
      while (glob[i + 1] === "*") {
        starCount++;
        i++;
      }
      if (starCount > 1) {
        const charAfter = glob[i + 1];
        if (charAfter === "/") {
          if (charBefore === "/") {
            tokens.push("((.+/)|)");
          } else {
            tokens.push("(.*/)");
          }
          ++i;
        } else {
          tokens.push("(.*)");
        }
      } else {
        tokens.push("([^/]*)");
      }
      continue;
    }
    if (c === "{") {
      inGroup = true;
      tokens.push("(");
    } else if (c === "}") {
      inGroup = false;
      tokens.push(")");
    } else if (c === ",") {
      tokens.push(inGroup ? "|" : "\\,");
    } else {
      tokens.push(escapedChars.has(c) ? "\\" + c : c);
    }
  }
  tokens.push("$");
  return tokens.join("");
}

/**
 * Tests whether a URL matches the given pattern.
 *
 * - `string` — treated as a glob pattern, converted to regex
 * - `RegExp` — tested directly
 * - `(url) => boolean` — called with the URL string
 */
export function urlMatches(url: string, match: RouteUrlMatch): boolean {
  if (Predicate.isString(match)) {
    return new RegExp(globToRegexPattern(match)).test(url);
  }
  if (match instanceof RegExp) {
    return match.test(url);
  }
  return match(url);
}

/**
 * Tests whether two URL match patterns are equal (for unroute matching).
 */
export function urlMatchesEqual(a: RouteUrlMatch, b: RouteUrlMatch): boolean {
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  return a === b;
}
