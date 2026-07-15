/**
 * Cookie types and utilities for CDP.
 */

import type { Protocol } from "devtools-protocol";

import type { CdpConnectionService } from "../CdpConnection.js";

import { Effect, Predicate } from "effect";
import * as Arr from "effect/Array";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, CookieError } from "../../CdpError.js";
import { type CdpCookie } from "../CdpSchema.js";

export type { CdpCookie } from "../CdpSchema.js";

/** Cookie data for setting cookies via CDP. */
export interface CookieData {
  /** Cookie name */
  readonly name: string;
  /** Cookie value */
  readonly value: string;
  /** Cookie URL (alternative to domain/path) */
  readonly url?: string;
  /** Cookie domain (e.g., "example.com") */
  readonly domain?: string;
  /** Cookie path (default: "/") */
  readonly path?: string;
  /** Cookie expiration timestamp (Unix time in seconds) */
  readonly expires?: number;
  /** HTTP-only flag */
  readonly httpOnly?: boolean;
  /** Secure flag */
  readonly secure?: boolean;
  /** Same-site policy ("Strict", "Lax", "None") */
  readonly sameSite?: "Strict" | "Lax" | "None";
}

/**
 * Converts CDP cookies to a cookie string suitable for HTTP requests.
 *
 * @param cookies - Array of CDP cookies
 * @param domainFilter - Optional domain to filter cookies
 * @returns Cookie string in "name=value; name2=value2" format
 */
export const cookiesToString = (cookies: CdpCookie[], domainFilter?: string): string => {
  const filtered = domainFilter
    ? cookies.filter((c) => c.domain === domainFilter || c.domain.endsWith(domainFilter.slice(1)))
    : cookies;

  return filtered.map((c) => `${c.name}=${c.value}`).join("; ");
};

/** Helper to fail with CdpError wrapping CookieError. */
export const failCookie = (method: string, description: string) =>
  Effect.fail(
    new CdpError({
      source: "CdpPage",
      method,
      reason: new CookieError({ description }),
    }),
  );

/**
 * Get cookies via CDP `Network.getCookies`.
 *
 * Enables the Network domain (idempotent) and retrieves all cookies for the
 * session. Optionally filtered to one or more URLs.
 */
export const getCookies = (
  conn: CdpConnectionService,
  sessionId: string,
  urls?: string | string[],
): Effect.Effect<CdpCookie[], CdpError> =>
  Effect.gen(function* () {
    yield* conn.cdp.Network.enable({}, sessionId).pipe(Effect.ignore);

    const urlArray = urls ? (Predicate.isString(urls) ? [urls] : urls) : [];
    const result = yield* conn.cdp.Network.getCookies(
      Arr.match(urlArray, {
        onEmpty: () => ({}),
        onNonEmpty: (u) => ({ urls: [...u] }),
      }),
      sessionId,
    ).pipe(
      Effect.catch((cause: unknown) =>
        failCookie("cookies", `Failed to get cookies: ${getErrorMessage(cause)}`),
      ),
    );

    return result.cookies ?? [];
  });

/**
 * Add cookies via CDP `Network.setCookies`.
 *
 * If `cookie.url` is set, `domain`/`path`/`secure` are derived from it
 * (matching Playwright's behavior of normalizing URL-based cookies).
 */
export const addCookies = (
  conn: CdpConnectionService,
  sessionId: string,
  cookies: CookieData[],
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    yield* conn.cdp.Network.enable({}, sessionId).pipe(Effect.ignore);

    const normalizedCookies = cookies.map((cookie): Protocol.Network.CookieParam => {
      const normalized: Protocol.Network.CookieParam = {
        name: cookie.name,
        value: cookie.value,
        url: cookie.url,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      };

      if (cookie.url) {
        const url = new URL(cookie.url);
        normalized.domain = url.hostname;
        normalized.path = url.pathname.substring(0, url.pathname.lastIndexOf("/") + 1);
        normalized.secure = url.protocol === "https:";
      }

      return normalized;
    });

    yield* conn.cdp.Network.setCookies({ cookies: normalizedCookies }, sessionId).pipe(
      Effect.catch((cause: unknown) =>
        failCookie("addCookies", `Failed to set cookies: ${getErrorMessage(cause)}`),
      ),
    );
  });

/**
 * Clear cookies via CDP `Network.clearBrowserCookies` or `Network.deleteCookies`.
 *
 * Without filters, clears all cookies in the browser. With filters, deletes the
 * matching cookies — CDP requires `name` when filtering.
 */
export const clearCookies = (
  conn: CdpConnectionService,
  sessionId: string,
  options?: { name?: string; domain?: string; path?: string },
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    yield* conn.cdp.Network.enable({}, sessionId).pipe(Effect.ignore);

    if (!options || (!options.name && !options.domain && !options.path)) {
      // Clear all cookies
      yield* conn.cdp.Network.clearBrowserCookies({}, sessionId).pipe(
        Effect.catch((cause: unknown) =>
          failCookie("clearCookies", `Failed to clear cookies: ${getErrorMessage(cause)}`),
        ),
      );
    } else {
      // Delete specific cookies — CDP requires name for Network.deleteCookies
      if (!options.name) {
        return yield* failCookie(
          "clearCookies",
          "CDP requires a 'name' filter when clearing specific cookies. To clear all cookies, call clearCookies() without options.",
        );
      }
      yield* conn.cdp.Network.deleteCookies(
        {
          name: options.name,
          domain: options.domain,
          path: options.path,
        },
        sessionId,
      ).pipe(
        Effect.catch((cause: unknown) =>
          failCookie("clearCookies", `Failed to delete cookies: ${getErrorMessage(cause)}`),
        ),
      );
    }
  });
