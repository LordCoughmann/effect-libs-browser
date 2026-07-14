/**
 * Storage state access — `localStorage` and `sessionStorage`.
 *
 * Mirrors Playwright's `page.evaluate(() => localStorage)` patterns. Provides
 * a typed Effect API for getting/setting individual keys, plus snapshotting
 * the entire storage.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, EvaluationError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { evaluatePage } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

const failStorage = (description: string): CdpError =>
  new CdpError({
    module: "CdpPage",
    method: "storage",
    reason: new EvaluationError({ description }),
  });

interface StorageSnapshot {
  readonly entries: ReadonlyArray<readonly [string, string]>;
}

/**
 * Get all key-value pairs from `localStorage` or `sessionStorage`.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param kind - Which storage to read
 */
export const getStorage = (
  conn: CdpConnection["Service"],
  state: PageState,
  kind: "local" | "session",
): Effect.Effect<ReadonlyMap<string, string>, CdpError> =>
  Effect.gen(function* () {
    yield* ensureSession(state);
    const storageName = kind === "local" ? "localStorage" : "sessionStorage";
    // Pass body as third arg to `new Function` — wrapping in an arrow would
    // make it a no-op statement in the generated anonymous function body.
    const bodyCode = `
      const s = ${storageName};
      const entries = [];
      for (let i = 0; i < s.length; i++) {
        const key = s.key(i);
        if (key !== null) entries.push([key, s.getItem(key)]);
      }
      return { entries };
    `;
    const wrapper = new Function(bodyCode) as () => StorageSnapshot;
    const result = yield* evaluatePage<StorageSnapshot>(conn, state, wrapper);
    return new Map(result.entries);
  }).pipe(Effect.mapError((cause) => failStorage(getErrorMessage(cause))));

/**
 * Set a single value in `localStorage` or `sessionStorage`.
 */
export const setStorageItem = (
  conn: CdpConnection["Service"],
  state: PageState,
  kind: "local" | "session",
  key: string,
  value: string,
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    yield* ensureSession(state);
    const storageName = kind === "local" ? "localStorage" : "sessionStorage";
    const bodyCode = `
      ${storageName}.setItem(args.key, args.value);
      return true;
    `;
    const wrapper = new Function("args", bodyCode) as (args: {
      key: string;
      value: string;
    }) => boolean;
    yield* evaluatePage<boolean>(conn, state, wrapper, { key, value });
  }).pipe(Effect.mapError((cause) => failStorage(getErrorMessage(cause))));

/**
 * Clear all entries in `localStorage` or `sessionStorage`.
 */
export const clearStorage = (
  conn: CdpConnection["Service"],
  state: PageState,
  kind: "local" | "session",
): Effect.Effect<void, CdpError> =>
  Effect.gen(function* () {
    yield* ensureSession(state);
    const storageName = kind === "local" ? "localStorage" : "sessionStorage";
    const bodyCode = `${storageName}.clear(); return true;`;
    const wrapper = new Function(bodyCode) as () => boolean;
    yield* evaluatePage<boolean>(conn, state, wrapper);
  }).pipe(Effect.mapError((cause) => failStorage(getErrorMessage(cause))));
