/**
 * Storage state — save/load for browser session persistence.
 *
 * Mirrors Playwright's `BrowserContext.storageState()` / `addStorageState()`.
 * The state captures:
 *
 * - **Cookies** — every cookie in the context (all domains).
 * - **Origins** — for each visited origin (per page target in the context),
 *   the `localStorage` entries. `sessionStorage` is intentionally NOT
 *   included (Playwright excludes it too — `sessionStorage` is per-tab and
 *   not persistable across browser restarts).
 *
 * Round-trip semantics: `addStorageState(s)` followed by `storageState()`
 * reproduces `s` exactly (modulo cookie `expires`/`session` flags that the
 * browser may rewrite).
 */

import type { CdpConnectionService } from "../CdpConnection.js";

import { Effect } from "effect";
import * as Arr from "effect/Array";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, StorageError } from "../../CdpError.js";
import { type CdpCookie } from "../CdpSchema.js";
import { type CookieData } from "./Cookies.js";

/** A single origin's localStorage snapshot within {@link StorageState}. */
export interface OriginState {
  /** Origin URL (scheme + host + port), e.g. `https://example.com`. */
  readonly origin: string;
  /** All `localStorage` entries at this origin, as `{ name, value }` pairs. */
  readonly localStorage: ReadonlyArray<{
    readonly name: string;
    readonly value: string;
  }>;
}

/**
 * JSON-serializable snapshot of a context's persisted state.
 *
 * Mirrors Playwright's `StorageState`. Save to disk with
 * `JSON.stringify(state)`, restore on a fresh context with
 * `context.addStorageState(state)`.
 */
export interface StorageState {
  /** All cookies visible to the context at save time. */
  readonly cookies: ReadonlyArray<CdpCookie>;
  /** All origins with non-empty `localStorage` snapshots. */
  readonly origins: ReadonlyArray<OriginState>;
}

/** Helper to fail with CdpError wrapping StorageError. */
const failStorage = (method: string, description: string) =>
  Effect.fail(
    new CdpError({
      source: "CdpContextHandle",
      method,
      reason: new StorageError({ description }),
    }),
  );

/**
 * Extract the origin (scheme + host + port) from a URL string.
 *
 * Returns `undefined` for unparseable URLs, `about:blank`, and other
 * non-http(s) URLs that have no meaningful origin for storage purposes.
 */
const extractOrigin = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
};

/**
 * List page targets in the given context.
 *
 * For the default context (`contextId === undefined`), returns all targets
 * of type `page` that don't have a `browserContextId` set. For isolated
 * contexts, returns targets whose `browserContextId` matches.
 */
const listPageTargets = (
  conn: CdpConnectionService,
  contextId: string | undefined,
): Effect.Effect<ReadonlyArray<{ readonly url: string; readonly origin?: string }>, CdpError> =>
  Effect.gen(function* () {
    const result = yield* conn.cdp.Target.getTargets({}).pipe(
      Effect.mapError(
        (cause: unknown) =>
          new CdpError({
            source: "CdpContextHandle",
            method: "storageState",
            reason: new StorageError({
              description: `Failed to list targets: ${getErrorMessage(cause)}`,
            }),
          }),
      ),
    );

    const pageTargets = (result.targetInfos ?? []).filter((t) => {
      if (t.type !== "page") return false;
      // Default context has no explicit browserContextId from us, but Chrome
      // assigns one. For the default context we include ALL pages; for
      // isolated contexts we filter by the matching browserContextId.
      if (contextId === undefined) return true;
      return t.browserContextId === contextId;
    });

    return pageTargets.map((t) => ({ url: t.url, origin: extractOrigin(t.url) }));
  });

/**
 * Get all `localStorage` entries for a single origin via `Runtime.evaluate`.
 *
 * Falls back to an empty array when the origin can't be evaluated (e.g. the
 * target is a worker that doesn't have access to localStorage).
 */
const getLocalStorageForOrigin = (
  conn: CdpConnectionService,
  sessionId: string,
  origin: string,
): Effect.Effect<ReadonlyArray<readonly [string, string]>, CdpError> =>
  Effect.gen(function* () {
    const result = yield* conn.cdp.Runtime.evaluate(
      {
        expression: `
          (() => {
            const entries = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key !== null) entries.push([key, localStorage.getItem(key)]);
            }
            return entries;
          })()
        `,
        returnByValue: true,
        // Only return if no exception was thrown
        silent: true,
      },
      sessionId,
    ).pipe(
      Effect.catch((cause: unknown) =>
        failStorage(
          "storageState",
          `Failed to get localStorage for ${origin}: ${getErrorMessage(cause)}`,
        ),
      ),
    );

    const value = result.result.value;
    if (!Array.isArray(value)) return [];
    return value as ReadonlyArray<readonly [string, string]>;
  });

/**
 * Build a complete storage state for the context.
 *
 * Cookies come from the CDP Network domain; origins come from walking all
 * page targets in the context and querying `localStorage` on each via
 * `Runtime.evaluate`.
 *
 * Note: `DOMStorage.getDOMStorageItems` (the dedicated CDP method) was
 * removed from Chrome. We use `Runtime.evaluate` instead, which works on
 * every page session.
 */
export const captureStorageState = (
  conn: CdpConnectionService,
  sessionId: string,
  contextId: string | undefined,
  getCookies: (sid: string) => Effect.Effect<CdpCookie[], CdpError>,
): Effect.Effect<StorageState, CdpError> =>
  Effect.gen(function* () {
    const cookies = yield* getCookies(sessionId);

    const pageTargets = yield* listPageTargets(conn, contextId);

    // Collect unique origins
    const originSet = new Set<string>();
    for (const target of pageTargets) {
      if (target.origin) originSet.add(target.origin);
    }

    // Query localStorage for each origin via the default page's session.
    const originEntries = yield* Effect.forEach(
      Array.from(originSet),
      (origin) =>
        Effect.gen(function* () {
          const entries = yield* getLocalStorageForOrigin(conn, sessionId, origin);
          return {
            origin,
            localStorage: entries.map(([name, value]) => ({ name, value })),
          };
        }),
      { concurrency: 1, discard: false },
    );

    // Drop origins with no localStorage entries
    const origins = Arr.filter(originEntries, (o) =>
      Arr.match(o.localStorage, {
        onEmpty: () => false,
        onNonEmpty: () => true,
      }),
    );

    return { cookies, origins };
  });

/**
 * Convert CDP cookies to {@link CookieData} for `addCookies`.
 *
 * Preserves name/value/url/domain/path/expires/httpOnly/secure/sameSite.
 */
export const cookiesToCookieData = (cookies: ReadonlyArray<CdpCookie>): ReadonlyArray<CookieData> =>
  cookies.map((c) => {
    // Derive a URL from domain+path when available. This ensures
    // Network.setCookies works even when the session is on a page that
    // hasn't navigated to the cookie's domain (e.g. about:blank).
    const url =
      c.domain && c.path !== undefined
        ? `${c.secure ? "https" : "http"}://${c.domain}${c.path.startsWith("/") ? c.path : `/${c.path}`}`
        : undefined;

    return {
      name: c.name,
      value: c.value,
      ...(url && { url }),
      ...(c.domain && { domain: c.domain }),
      ...(c.path && { path: c.path }),
      ...(c.expires !== undefined && c.expires > 0 && { expires: c.expires }),
      ...(c.httpOnly !== undefined && { httpOnly: c.httpOnly }),
      ...(c.secure !== undefined && { secure: c.secure }),
      ...(c.sameSite !== undefined &&
        c.sameSite !== null && {
          sameSite: c.sameSite as "Strict" | "Lax" | "None",
        }),
    };
  });
