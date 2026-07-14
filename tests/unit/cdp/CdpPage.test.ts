/**
 * Unit tests for CdpPage methods.
 *
 * Tests the cookie and sessionStorage operations.
 * Note: These tests verify the API surface and types.
 * Full functionality is tested via integration tests.
 */

import type { Effect } from "effect";

import type { CookieData, CdpPageService, CdpCookie, CdpError } from "@effect-libs/browser-cdp";

import { assert, describe, it } from "@effect/vitest";

import { cookiesToString } from "../../../packages/browser-cdp/src/internal/Page/Cookies.js";

// ── Type Tests ────────────────────────────────────────────────────────────────

describe("CdpPage - types", () => {
  it("CookieData should accept required fields", () => {
    const cookie: CookieData = {
      name: "session",
      value: "abc123",
    };
    assert.strictEqual(cookie.name, "session");
    assert.strictEqual(cookie.value, "abc123");
  });

  it("CookieData should accept optional fields", () => {
    const cookie: CookieData = {
      name: "session",
      value: "abc123",
      domain: "example.com",
      path: "/",
      expires: 1234567890,
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    };
    assert.strictEqual(cookie.domain, "example.com");
    assert.strictEqual(cookie.path, "/");
    assert.strictEqual(cookie.httpOnly, true);
  });

  it("CookieData should accept url instead of domain", () => {
    const cookie: CookieData = {
      name: "token",
      value: "xyz789",
      url: "https://api.example.com/path",
    };
    assert.strictEqual(cookie.url, "https://api.example.com/path");
  });
});

// ── API Surface Tests ──────────────────────────────────────────────────────────

describe("CdpPage - API surface", () => {
  it("Page should NOT have setCookies method (moved to context)", () => {
    // Cookies are now on CdpContextHandle, not on the page
    type HasSetCookies = CdpPageService extends { setCookies: unknown } ? true : false;
    const hasMethod: HasSetCookies = false;
    assert.isFalse(hasMethod);
  });

  it("Page should have title property returning Effect<string, CdpError>", () => {
    type TitleType = CdpPageService extends { title: infer T } ? T : never;
    type IsEffectString = TitleType extends Effect.Effect<string, CdpError, any> ? true : false;
    const isCorrectType: IsEffectString = true;
    assert.isTrue(isCorrectType);
  });

  it("Page should have content property returning Effect<string, CdpError>", () => {
    type ContentType = CdpPageService extends { content: infer T } ? T : never;
    type IsEffectString = ContentType extends Effect.Effect<string, CdpError, any> ? true : false;
    const isCorrectType: IsEffectString = true;
    assert.isTrue(isCorrectType);
  });
});

// ── cookiesToString Tests ──────────────────────────────────────────────────────

describe("cookiesToString", () => {
  const createCookie = (name: string, value: string, domain: string): CdpCookie => ({
    name,
    value,
    domain,
    path: "/",
    expires: -1,
    size: name.length + value.length,
    httpOnly: false,
    secure: false,
    session: true,
    priority: "Low" as const,
    sourceScheme: "Unset" as const,
    sourcePort: 443,
  });

  it("formats empty array as empty string", () => {
    assert.strictEqual(cookiesToString([]), "");
  });

  it("formats single cookie", () => {
    const cookies = [createCookie("session", "abc123", ".example.com")];
    assert.strictEqual(cookiesToString(cookies), "session=abc123");
  });

  it("formats multiple cookies with semicolon separator", () => {
    const cookies = [
      createCookie("session", "abc123", ".example.com"),
      createCookie("user", "john", ".example.com"),
    ];
    assert.strictEqual(cookiesToString(cookies), "session=abc123; user=john");
  });

  it("filters cookies by domain", () => {
    const cookies = [
      createCookie("session", "abc123", ".example.com"),
      createCookie("other", "xyz", ".other.com"),
    ];
    assert.strictEqual(cookiesToString(cookies, ".example.com"), "session=abc123");
  });

  it("matches domain with leading dot wildcard", () => {
    const cookies = [
      createCookie("session", "abc123", ".example.com"),
      createCookie("sub", "val", "sub.example.com"),
    ];
    // Domain filter ".example.com" matches both .example.com and sub.example.com
    assert.strictEqual(cookiesToString(cookies, ".example.com"), "session=abc123; sub=val");
  });

  it("handles special characters in values", () => {
    const cookies = [createCookie("data", "a=b&c=d", ".example.com")];
    assert.strictEqual(cookiesToString(cookies), "data=a=b&c=d");
  });

  it("handles empty cookie values", () => {
    const cookies = [createCookie("empty", "", ".example.com")];
    assert.strictEqual(cookiesToString(cookies), "empty=");
  });
});
