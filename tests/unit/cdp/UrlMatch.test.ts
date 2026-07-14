/**
 * Unit tests for `globToRegexPattern` — Playwright parity contract.
 *
 * The CDP port of `globToRegexPattern` is intended to be 1:1 with Playwright's
 * `urlMatch.ts::globToRegexPattern()` (vendored at
 * packages/cloudflare-playwright/lib/playwright-core/src/utils/isomorphic/urlMatch.js).
 * Any divergence from upstream behavior is a bug, not a feature.
 *
 * Two divergences existed at the time these tests were written:
 *   1. The "double-star then slash" pattern with no preceding slash emitted
 *      a regex that incorrectly allowed matching URLs without any prefix.
 *      Real HTTP requests always have a leading slash, so integration tests
 *      missed this. See the "** / WITHOUT preceding /" describe block below.
 *   2. A comma outside a group emitted a bare comma instead of an escaped
 *      comma. Functionally identical in regex, but byte-different from
 *      upstream Playwright.
 *
 * See docs/contributing/fallow.md "Known complexity hotspots" for context.
 */

import { describe, expect, it } from "vitest";

import {
  globToRegexPattern,
  urlMatches,
} from "../../../packages/browser-cdp/src/internal/Page/UrlMatch.js";

describe("globToRegexPattern — Playwright parity", () => {
  describe("literal pass-through", () => {
    it("empty glob anchors at both ends", () => {
      expect(globToRegexPattern("")).toBe("^$");
    });

    it("plain text", () => {
      expect(globToRegexPattern("foo")).toBe("^foo$");
    });

    it("special chars are escaped", () => {
      expect(globToRegexPattern("a.b")).toBe("^a\\.b$");
    });

    it("? is literal (NOT a wildcard)", () => {
      expect(globToRegexPattern("a?b")).toBe("^a\\?b$");
    });
  });

  describe("escape sequences", () => {
    it("escapes a special char", () => {
      expect(globToRegexPattern("\\*")).toBe("^\\*$");
    });

    it("non-special after backslash emits the char as-is", () => {
      expect(globToRegexPattern("\\a")).toBe("^a$");
    });
  });

  describe("single * (any non-slash chars)", () => {
    it("alone", () => {
      expect(globToRegexPattern("*")).toBe("^([^/]*)$");
    });

    it("between segments", () => {
      expect(globToRegexPattern("a*b")).toBe("^a([^/]*)b$");
    });

    it("does not cross /", () => {
      const re = new RegExp(globToRegexPattern("a*b"));
      expect(re.test("a/b")).toBe(false);
    });
  });

  describe("** without trailing /", () => {
    it("alone", () => {
      expect(globToRegexPattern("**")).toBe("^(.*)$");
    });

    it("followed by non-slash", () => {
      expect(globToRegexPattern("**.foo")).toBe("^(.*)\\.foo$");
    });

    it("triple+ stars behave like ** when not followed by /", () => {
      expect(globToRegexPattern("***")).toBe("^(.*)$");
    });
  });

  describe("**/ with preceding / (anchored to a slash)", () => {
    it("preceded by /", () => {
      expect(globToRegexPattern("/**/")).toBe("^/((.+/)|)$");
    });

    it("/**/foo matches zero or more path segments", () => {
      const re = new RegExp(globToRegexPattern("/**/foo"));
      expect(re.test("/foo")).toBe(true); // zero segments
      expect(re.test("/a/foo")).toBe(true);
      expect(re.test("/a/b/foo")).toBe(true);
      expect(re.test("foo")).toBe(false); // no leading /
    });
  });

  describe("**/ WITHOUT preceding /  [Playwright parity — the bug fix]", () => {
    it("emits (.*/) when charBefore is not /", () => {
      // The CDP port used to emit `((.+/)|)`, which incorrectly allowed
      // `**/foo` to match `foo` (no prefix). Upstream Playwright emits
      // `(.*/)`, requiring at least one slash before `foo`.
      expect(globToRegexPattern("**/foo")).toBe("^(.*/)foo$");
    });

    it("**/foo matches URLs with at least one slash before foo", () => {
      const re = new RegExp(globToRegexPattern("**/foo"));
      expect(re.test("foo")).toBe(false); // ← the divergence
      expect(re.test("a/foo")).toBe(true);
      expect(re.test("/foo")).toBe(true);
      expect(re.test("a/b/foo")).toBe(true);
      expect(re.test("http://x.test/foo")).toBe(true);
    });

    it("a**/foo: charBefore='a' (not /), so emit (.*/)", () => {
      expect(globToRegexPattern("a**/foo")).toBe("^a(.*/)foo$");
    });
  });

  describe("groups", () => {
    it("alternation in group", () => {
      expect(globToRegexPattern("{a,b}")).toBe("^(a|b)$");
    });

    it("group between segments", () => {
      expect(globToRegexPattern("a{b,c}d")).toBe("^a(b|c)d$");
    });

    it("nested in path", () => {
      // `**` at end of string (no trailing slash) emits `(.*)`,
      // not `((.+/)|)`. The `((.+/)|)` form only appears when `**` is
      // followed by `/`.
      expect(globToRegexPattern("/api/{users,posts}/**")).toBe("^/api/(users|posts)/(.*)$");
    });
  });

  describe("comma outside group  [output-string parity]", () => {
    it("upstream escapes comma even outside groups", () => {
      // `\,` and `,` are functionally identical in regex, but the CDP port
      // used to emit bare `,`. Lock in upstream's `\,` for byte parity.
      expect(globToRegexPattern("a,b")).toBe("^a\\,b$");
    });
  });
});

describe("urlMatches — semantic parity", () => {
  it("string match delegates to globToRegexPattern", () => {
    expect(urlMatches("/api/users/123", "/api/users/*")).toBe(true);
    expect(urlMatches("/api/users/123", "/api/posts/*")).toBe(false);
  });

  it("RegExp match tested directly", () => {
    expect(urlMatches("/anything", /anything/)).toBe(true);
    expect(urlMatches("/anything", /nothing/)).toBe(false);
  });

  it("function match called with url", () => {
    expect(urlMatches("/foo", (u) => u.startsWith("/f"))).toBe(true);
    expect(urlMatches("/foo", (u) => u.startsWith("/b"))).toBe(false);
  });

  it("**/foo does NOT match bare 'foo' (upstream parity)", () => {
    expect(urlMatches("foo", "**/foo")).toBe(false);
    expect(urlMatches("/foo", "**/foo")).toBe(true);
  });
});
