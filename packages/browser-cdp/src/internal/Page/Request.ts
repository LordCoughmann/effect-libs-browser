/**
 * APIRequestContext for CDP pages.
 *
 * Provides Playwright-compatible `page.request` API that makes server-side
 * HTTP requests with browser cookies synced via CDP. Unlike `page.fetch()`
 * which runs in the browser, this uses native Effect HttpClient from
 * Node/Worker context.
 *
 * Key differences from `page.fetch()`:
 * - No CORS restrictions (server-side requests)
 * - Faster (no browser roundtrip)
 * - Full Effect HttpClient features (schema validation, retry, middleware)
 * - Cookies synced via CDP (requires matching logic)
 *
 */

import type { Protocol } from "devtools-protocol";

import type { CdpConnectionService } from "../CdpConnection.js";
import type { CdpCookie } from "../CdpSchema.js";

import { Effect, Match, Predicate as P } from "effect";
import * as Arr from "effect/Array";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http";

import { CookieError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";

// ── Cookie Matching ───────────────────────────────────────────────────────────

/**
 * Checks if a cookie domain matches the request URL's hostname.
 *
 * Cookie domain matching follows RFC 6265:
 * - If cookie domain starts with '.', it matches the hostname and any subdomain
 * - If cookie domain doesn't start with '.', it must exactly match the hostname
 *
 * @param cookieDomain - The cookie's domain attribute
 * @param hostname - The request URL's hostname
 * @returns true if the domain matches
 */
const domainMatches = (cookieDomain: string, hostname: string): boolean => {
  // Normalize: remove leading dot for comparison
  const normalizedDomain = cookieDomain.startsWith(".") ? cookieDomain.slice(1) : cookieDomain;

  // Exact match
  if (hostname === normalizedDomain) return true;

  // Subdomain match (cookie domain must have had leading dot)
  if (cookieDomain.startsWith(".") && hostname.endsWith(normalizedDomain)) {
    // Ensure it's a proper subdomain boundary (e.g., .example.com matches sub.example.com)
    const prefix = hostname.slice(0, hostname.length - normalizedDomain.length);
    return prefix.endsWith(".");
  }

  return false;
};

/**
 * Checks if a cookie path matches the request URL's path.
 *
 * Cookie path matching follows RFC 6265:
 * - The cookie path must be a prefix of the request path
 * - If cookie path doesn't end with '/', the request path must either be exactly
 *   the cookie path or start with cookie path + '/'
 *
 * @param cookiePath - The cookie's path attribute (default: "/")
 * @param requestPath - The request URL's path
 * @returns true if the path matches
 */
const pathMatches = (cookiePath: string, requestPath: string): boolean => {
  const path = cookiePath || "/";

  // Exact match
  if (requestPath === path) return true;

  // Prefix match: request path must start with cookie path + "/"
  if (requestPath.startsWith(path) && (path.endsWith("/") || requestPath[path.length] === "/")) {
    return true;
  }

  // Special case: cookie path "/" matches everything
  if (path === "/") return true;

  return false;
};

/**
 * Filters cookies that should be sent with a request to the given URL.
 *
 * Implements RFC 6265 cookie matching:
 * - Domain matching (with subdomain support)
 * - Path matching
 * - Secure flag (secure cookies only sent to HTTPS)
 * - Expiry check (expired cookies excluded)
 * - httpOnly flag (included in requests, only excluded from JavaScript access)
 *
 * @param cookies - All cookies from the browser context
 * @param url - The request URL
 * @returns Filtered cookies that should be sent
 */
const filterCookiesForUrl = (cookies: CdpCookie[], url: string): CdpCookie[] => {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const path = parsedUrl.pathname;
    const isSecure = parsedUrl.protocol === "https:";

    const now = Date.now() / 1000; // Unix timestamp in seconds

    return cookies.filter((cookie) => {
      // Check expiry
      if (cookie.expires !== undefined && cookie.expires > 0 && cookie.expires < now) {
        return false;
      }

      // Check domain match
      const cookieDomain = cookie.domain || "";
      if (!domainMatches(cookieDomain, hostname)) {
        return false;
      }

      // Check path match
      const cookiePath = cookie.path || "/";
      if (!pathMatches(cookiePath, path)) {
        return false;
      }

      // Check secure flag
      if (cookie.secure && !isSecure) {
        return false;
      }

      return true;
    });
  } catch {
    // Invalid URL - return no cookies
    return [];
  }
};

/**
 * Converts filtered cookies to a Cookie header string.
 *
 * @param cookies - Filtered cookies for the request
 * @returns Cookie header value (e.g., "session=abc123; user=john")
 */
const cookiesToHeader = (cookies: CdpCookie[]): string =>
  cookies.map((c) => `${c.name}=${c.value}`).join("; ");

// ── Set-Cookie Parsing ─────────────────────────────────────────────────────────

/**
 * Cookie attributes parsed from Set-Cookie header.
 */
interface ParsedSetCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

/**
 * Parses a Set-Cookie header value into cookie attributes.
 *
 * @param header - Set-Cookie header value
 * @param requestUrl - The request URL (for default domain/path)
 * @returns Parsed cookie attributes
 */
const parseSetCookie = (header: string, requestUrl: string): ParsedSetCookie => {
  const parts = header.split(";").map((p) => p.trim());
  const [nameValue, ...attributes] = parts;

  // Parse name=value
  const [name, value] = nameValue.split("=");

  // Parse attributes using Match for type-safe branching
  const result: ParsedSetCookie = { name, value };

  for (const attr of attributes) {
    const [attrName, attrValue] = attr.split("=");
    const lowerAttrName = attrName.toLowerCase();

    // Use Match.value for exhaustive, type-safe branching
    Match.value(lowerAttrName).pipe(
      Match.when("domain", () => {
        result.domain = attrValue?.trim() || "";
      }),
      Match.when("path", () => {
        result.path = attrValue?.trim() || "/";
      }),
      Match.when("expires", () => {
        if (attrValue) {
          const expiresDate = new Date(attrValue.trim());
          if (!isNaN(expiresDate.getTime())) {
            result.expires = expiresDate.getTime() / 1000; // Unix timestamp in seconds
          }
        }
      }),
      Match.when("max-age", () => {
        if (attrValue) {
          result.maxAge = parseInt(attrValue.trim(), 10);
        }
      }),
      Match.when("secure", () => {
        result.secure = true;
      }),
      Match.when("httponly", () => {
        result.httpOnly = true;
      }),
      Match.when("samesite", () => {
        const sameSiteValue = attrValue?.trim();
        if (sameSiteValue === "Strict" || sameSiteValue === "Lax" || sameSiteValue === "None") {
          result.sameSite = sameSiteValue;
        }
      }),
      Match.orElse(() => {
        // Unknown attribute - ignore
      }),
    );
  }

  // Apply defaults from request URL
  try {
    const parsedUrl = new URL(requestUrl);
    if (!result.domain) {
      result.domain = parsedUrl.hostname;
    }
    if (!result.path) {
      result.path = parsedUrl.pathname.substring(0, parsedUrl.pathname.lastIndexOf("/") + 1) || "/";
    }
    if (!result.secure && parsedUrl.protocol === "https:") {
      // Secure by default for HTTPS (optional, depends on browser behavior)
    }
  } catch {
    // Invalid URL - use defaults
  }

  return result;
};

// ── Body Conversion ────────────────────────────────────────────────────────────

/**
 * Convert an Effect `HttpClientRequest.body` value into a value suitable
 * for the WHATWG `Request` constructor's `body` parameter.
 *
 * Handles:
 * - `Uint8Array` — passed through as-is
 * - `string` — passed through as-is
 * - Effect HttpBody tagged types `{ _tag: "Uint8Array", body: ... }` and
 *   `{ _tag: "Raw", body: ... }` — extract the inner content if it's a
 *   Uint8Array or string
 * - Everything else (FormData, ReadableStream, Stream, null, undefined,
 *   unknown tags) — returns undefined; the WHATWG Request constructor
 *   accepts undefined to mean "no body"
 *
 * Extracted from the inline IIFE in `makeCdpRequestClient` so the type-guard
 * tree is independently testable and fallow complexity stays low.
 */
const isExtractableHttpBody = P.and(
  P.or(P.isTagged("Uint8Array"), P.isTagged("Raw")),
  P.hasProperty("body"),
);

/**
 * Convert an Effect `HttpClientRequest.body` value into a value suitable
 * for the WHATWG `Request` constructor's `body` parameter.
 *
 * Handles:
 * - `Uint8Array` — passed through as-is
 * - `string` — passed through as-is
 * - Effect HttpBody tagged types `{ _tag: "Uint8Array", body: ... }` and
 *   `{ _tag: "Raw", body: ... }` — extract the inner content if it's a
 *   Uint8Array or string
 * - Everything else (FormData, ReadableStream, Stream, null, undefined,
 *   unknown tags) — returns undefined; the WHATWG Request constructor
 *   accepts undefined to mean "no body"
 *
 * Returns `unknown` because the downstream code narrows it via type guards
 * (matching the original IIFE's inferred type). Extracted from the inline
 * IIFE in `makeCdpRequestClient` so the type-guard tree is independently
 * testable and fallow complexity stays low.
 */
const extractBodyInit = (body: unknown): unknown => {
  if (body instanceof Uint8Array) return body;
  if (P.isString(body)) return body;
  if (isExtractableHttpBody(body)) {
    const content = body.body;
    if (content instanceof Uint8Array) return content;
    if (P.isString(content)) return content;
  }
  return undefined;
};

// ── HttpClient Factory ─────────────────────────────────────────────────────────

/**
 * Creates an HttpClient that syncs cookies from the browser context.
 *
 * Each request:
 * 1. Gets cookies from the browser via CDP Network.getCookies
 * 2. Filters cookies matching the request URL (domain, path, secure)
 * 3. Adds cookies to the Cookie header
 * 4. Makes the request using native HttpClient
 * 5. Parses Set-Cookie headers and syncs them back to the browser
 *
 * @param connection - CDP connection service
 * @param state - Page state (contains session ID)
 * @returns HttpClient with cookie syncing
 */
export const makeCdpRequestClient = (
  connection: CdpConnectionService,
  state: PageState,
): HttpClient.HttpClient =>
  HttpClient.make((request, url, _signal, _fiber) =>
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state).pipe(
        Effect.mapError(
          (cause) =>
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                cause,
              }),
            }),
        ),
      );
      const requestUrl = url.toString();

      // Enable Network domain (required for getCookies)
      yield* connection.cdp.Network.enable({}, sessionId).pipe(Effect.ignore);

      // Get cookies from browser context
      const cookiesResult = yield* connection.cdp.Network.getCookies(
        { urls: [requestUrl] },
        sessionId,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                cause: new CookieError({ description: `Failed to get cookies: ${String(cause)}` }),
              }),
            }),
        ),
      );

      const cookies = cookiesResult.cookies ?? [];
      const filteredCookies = filterCookiesForUrl(cookies, requestUrl);

      // Add Cookie header if we have cookies
      // Effect's Headers is a plain object with string keys (lowercase)
      // Note: We strip `content-length` here. Effect's HttpClientRequest
      // computes and includes a `content-length` header for body requests,
      // and we must NOT propagate it to the WHATWG `Request` constructor.
      // The fetch spec forbids manually setting `Content-Length` and
      // auto-computes it from the body; passing one through is rejected by
      // stricter undici versions (e.g. 8.x, which is loaded transitively
      // by `@effect/platform-node`).
      const headersRecord: Record<string, string> = {};
      for (const key of Object.keys(request.headers)) {
        if (key.toLowerCase() !== "content-length") {
          headersRecord[key] = request.headers[key];
        }
      }
      // Add Cookie header if we have cookies
      yield* Arr.match(filteredCookies, {
        onEmpty: () => Effect.void,
        onNonEmpty: (cookies) =>
          Effect.sync(() => {
            headersRecord["cookie"] = cookiesToHeader([...cookies]);
          }),
      });

      // Convert body for native fetch
      // HttpClient.Body can be: Empty | Raw | Uint8Array | FormData | Stream
      const body = extractBodyInit(request.body);

      // Create request with cookies
      // Convert body to BodyInit for Request constructor
      const bodyInit: BodyInit | null = P.isString(body)
        ? body
        : body instanceof Uint8Array
          ? new Uint8Array(body) // Create a fresh Uint8Array to satisfy TypeScript
          : null;
      const requestWithCookies = new Request(requestUrl, {
        method: request.method,
        headers: headersRecord,
        body: bodyInit,
      });

      // Make the request using fetch
      const response = yield* Effect.tryPromise(() => fetch(requestWithCookies)).pipe(
        Effect.mapError(
          (cause) =>
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                cause,
              }),
            }),
        ),
      );

      // Parse Set-Cookie headers and sync back to browser
      const setCookieHeaders = response.headers.getSetCookie();
      yield* Arr.match(setCookieHeaders, {
        onEmpty: () => Effect.void,
        onNonEmpty: (cookieHeaders) =>
          Effect.forEach(
            [...cookieHeaders],
            (setCookieHeader) =>
              Effect.gen(function* () {
                const parsed = parseSetCookie(setCookieHeader, requestUrl);

                // Calculate expires: use maxAge if present, otherwise expires
                const expires =
                  parsed.maxAge !== undefined ? Date.now() / 1000 + parsed.maxAge : parsed.expires;

                yield* connection.cdp.Network.setCookies(
                  {
                    cookies: [
                      {
                        name: parsed.name,
                        value: parsed.value,
                        domain: parsed.domain,
                        path: parsed.path,
                        expires,
                        secure: parsed.secure ?? false,
                        httpOnly: parsed.httpOnly ?? false,
                        sameSite: parsed.sameSite as Protocol.Network.CookieSameSite | undefined,
                      },
                    ],
                  },
                  sessionId,
                ).pipe(Effect.ignore);
              }),
            { concurrency: 1 },
          ),
      });

      return HttpClientResponse.fromWeb(request, response);
    }),
  );
