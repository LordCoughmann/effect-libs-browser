/**
 * Mutable state for the test HTTP server's dynamic route control.
 *
 * This is a test server, so module-level mutable state is acceptable.
 * The server runs in a single process and tests reset state between
 * runs via `POST /__admin/clear`.
 *
 * @module tests/setup/http-server/State
 */

import { Effect, Match, Option } from "effect";
import * as Arr from "effect/Array";
import { HttpServerResponse } from "effect/unstable/http";

type ServerResponse = ReturnType<typeof HttpServerResponse.text>;

// ── Types ────────────────────────────────────────────────────────────────────

export interface PendingRequest {
  timestamp: number;
  /** Resolves when the response should be released */
  release: () => void;
  /** Promise that resolves when released */
  released: Promise<void>;
  /** Whether this request has been released */
  done: boolean;
  /** Body to send when released */
  _body?: string;
  /** Request headers captured when the request arrived */
  headers?: Record<string, string>;
}

export interface RouteConfig {
  action: "hang" | "delay" | "respond" | "redirect";
  delayMs?: number;
  body?: string;
  status?: number;
  contentType?: string;
  redirectUrl?: string;
}

// ── Module-level State ───────────────────────────────────────────────────────

const routes = new Map<string, RouteConfig>();
const pendingRequests = new Map<string, PendingRequest[]>();

/** Request arrival waiters: path → resolve functions */
const requestWaiters = new Map<string, Array<() => void>>();

/** CSP policies: path → Content-Security-Policy header value */
const cspPolicies = new Map<string, string>();

// ── State Operations ─────────────────────────────────────────────────────────

/** Register a dynamic route config for a path. */
export function setRoute(path: string, config: RouteConfig): void {
  routes.set(path, config);
}

/** Get the dynamic route config for a path, if any. */
export function getRoute(path: string): RouteConfig | undefined {
  return routes.get(path);
}

/**
 * Notify that a request arrived at a path.
 * Resolves any pending waitForRequest waiters.
 */
export function notifyRequestArrived(
  path: string,
  pending: PendingRequest,
  headers?: Record<string, string>,
) {
  // Store headers on the pending request
  pending.headers = headers;

  const existing = pendingRequests.get(path) ?? [];
  existing.push(pending);
  pendingRequests.set(path, existing);

  // Resolve any waiters
  const waiters = requestWaiters.get(path) ?? [];
  for (const resolve of waiters) {
    resolve();
  }
  requestWaiters.set(path, []);
}

/**
 * Release the oldest pending request for a path.
 */
export function releasePending(path: string, body?: string) {
  const pending = pendingRequests.get(path);
  if (pending === undefined) return;

  Arr.match(pending, {
    onEmpty: () => {},
    onNonEmpty: (values) => {
      const first = values[0];
      if (!first.done) {
        first.done = true;
        if (body !== undefined) {
          first._body = body;
        }
        first.release();
      }
      const rest = Arr.tail(values);
      if (Option.isNone(rest)) {
        pendingRequests.delete(path);
      } else {
        pendingRequests.set(path, rest.value);
      }
    },
  });
}

/**
 * Check if a request has already arrived for the given path.
 * Returns the waiters array to register a new waiter if none exist.
 */
export function hasPendingRequest(path: string): boolean {
  const pending = pendingRequests.get(path) ?? [];
  return Arr.match(pending, {
    onEmpty: () => false,
    onNonEmpty: () => true,
  });
}

/**
 * Register a waiter that will be called when a request arrives at the path.
 */
export function registerWaiter(path: string, onArrival: () => void): void {
  const waiters = requestWaiters.get(path) ?? [];
  waiters.push(onArrival);
  requestWaiters.set(path, waiters);
}

/**
 * Get the captured request headers for the most recent request at a path.
 * Returns undefined if no request has arrived or headers were not captured.
 */
export function getRequestHeaders(path: string): Record<string, string> | undefined {
  const pending = pendingRequests.get(path);
  if (pending === undefined) return undefined;
  return Arr.match(pending, {
    onEmpty: () => undefined,
    onNonEmpty: (values) => values[values.length - 1]?.headers,
  });
}

/**
 * Clear all dynamic routes and pending state.
 */
export function clearAll() {
  routes.clear();
  pendingRequests.clear();
  requestWaiters.clear();
  cspPolicies.clear();
}

/** Set CSP policy for a path. */
export function setCSP(path: string, policy: string): void {
  cspPolicies.set(path, policy);
}

/** Get CSP policy for a path, if any. */
export function getCSP(path: string): string | undefined {
  return cspPolicies.get(path);
}

// ── Dynamic Route Handler ────────────────────────────────────────────────────

/**
 * Handle a dynamic route based on its config.
 * Returns a string or ServerResponse depending on config.
 */
export function handleDynamicRoute(
  path: string,
  config: RouteConfig,
  headers?: Record<string, string>,
): Effect.Effect<string | ServerResponse, never, never> {
  const makeResponse = (body: string): string | ServerResponse => {
    if (config.status !== undefined || config.contentType !== undefined) {
      return HttpServerResponse.text(body, {
        status: config.status ?? 200,
        headers: config.contentType ? { "content-type": config.contentType } : undefined,
      });
    }
    return body;
  };

  return Match.value(config.action).pipe(
    Match.when("hang", () => {
      let resolveRelease: () => void;
      const released = new Promise<void>((resolve) => {
        resolveRelease = resolve;
      });
      const pending: PendingRequest = {
        timestamp: Date.now(),
        release: () => resolveRelease?.(),
        released,
        done: false,
        _body: undefined,
      };

      notifyRequestArrived(path, pending, headers);

      return Effect.callback<string | ServerResponse, never, never>((resume) => {
        released.then(() => {
          resume(Effect.succeed(makeResponse(pending._body ?? "")));
        });
      });
    }),
    Match.when("delay", () => {
      const pending: PendingRequest = {
        timestamp: Date.now(),
        release: () => {},
        released: Promise.resolve(),
        done: true,
        _body: undefined,
      };
      notifyRequestArrived(path, pending, headers);

      if (config.delayMs) {
        return Effect.sleep(config.delayMs).pipe(Effect.map(() => makeResponse(config.body ?? "")));
      }
      return Effect.succeed(makeResponse(config.body ?? ""));
    }),
    Match.when("respond", () => {
      const pending: PendingRequest = {
        timestamp: Date.now(),
        release: () => {},
        released: Promise.resolve(),
        done: true,
        _body: undefined,
      };
      notifyRequestArrived(path, pending, headers);
      return Effect.succeed(makeResponse(config.body ?? ""));
    }),
    Match.when("redirect", () => {
      const pending: PendingRequest = {
        timestamp: Date.now(),
        release: () => {},
        released: Promise.resolve(),
        done: true,
        _body: undefined,
      };
      notifyRequestArrived(path, pending, headers);
      return Effect.succeed(
        HttpServerResponse.text("", {
          status: 302,
          headers: { location: config.redirectUrl ?? "/" },
        }),
      );
    }),
    Match.exhaustive,
  );
}
