/**
 * Convenience properties for page content.
 *
 * Simple wrappers around evaluatePage for common page properties.
 * Uses the utility world for evaluations following Playwright's pattern.
 */

import type { Effect } from "effect";

import type { CdpError } from "../../CdpError.js";
import type { CdpConnection } from "../CdpConnection.js";

import { evaluateUtilityWorld } from "./Evaluate.js";
import { type PageState } from "./PageState.js";

/**
 * Gets the page's title using the utility world.
 *
 * Uses the utility world execution context (Playwright pattern).
 * The utility world is created after the main world, giving the
 * HTML parser more time to process <title> before evaluation.
 *
 * @param conn - CDP connection
 * @param state - Page state
 * @param utilityContextId - The utility world execution context ID
 */
export const pageTitle = (
  conn: CdpConnection["Service"],
  state: PageState,
  utilityContextId: number,
): Effect.Effect<string, CdpError> =>
  evaluateUtilityWorld(conn, state, utilityContextId, () => document.title);

/**
 * Gets the page's full HTML content using the utility world.
 *
 * Follows Playwright's implementation: uses the utility world to evaluate
 * `XMLSerializer().serializeToString(document.doctype)` +
 * `document.documentElement.outerHTML`.
 *
 * @param conn - CDP connection
 * @param state - Page state
 * @param utilityContextId - The utility world execution context ID
 */
export const pageContent = (
  conn: CdpConnection["Service"],
  state: PageState,
  utilityContextId: number,
): Effect.Effect<string, CdpError> =>
  evaluateUtilityWorld(conn, state, utilityContextId, () => {
    let retVal = "";
    if (document.doctype) retVal = new XMLSerializer().serializeToString(document.doctype);
    if (document.documentElement) retVal += document.documentElement.outerHTML;
    return retVal;
  });
