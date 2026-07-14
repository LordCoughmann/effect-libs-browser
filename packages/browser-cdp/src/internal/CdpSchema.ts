/**
 * Schema definitions for Chrome DevTools Protocol types.
 *
 * Uses official types from the `devtools-protocol` package for response shapes.
 * Only the WebSocket message envelope is validated with Effect Schema —
 * CDP responses are trusted and accessed via type assertions.
 */

import type { Protocol } from "devtools-protocol";

import { Schema } from "effect";

// ── CDP Message Envelope (untrusted boundary) ────────────────────────────────

/**
 * Schema for CDP error object.
 * Matches Protocol.Error type from devtools-protocol.
 */
export class CdpProtocolError extends Schema.Class<CdpProtocolError>("CdpProtocolError")({
  code: Schema.Finite,
  message: Schema.String,
}) {}

/**
 * Schema for a generic CDP message received over WebSocket.
 * This is the envelope that contains either:
 * - A command response (id + result/error)
 * - An event (method + params)
 *
 * Only the envelope is validated — inner response shapes use Protocol types directly.
 */
export class CdpMessage extends Schema.Class<CdpMessage>("CdpMessage")({
  id: Schema.optional(Schema.Finite),
  method: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  result: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  error: Schema.optional(CdpProtocolError),
}) {}

// ── Protocol Type Re-exports ─────────────────────────────────────────────────

/**
 * Type-only re-exports from devtools-protocol.
 * These replace hand-rolled Effect Schemas — CDP responses are trusted,
 * so runtime validation is unnecessary.
 */

/** @see Protocol.Browser.GetVersionResponse */
export type ProtocolGetVersionResponse = Protocol.Browser.GetVersionResponse;

/** @see Protocol.Network.Cookie */
export type CdpCookie = Protocol.Network.Cookie;

// ── Chrome Version Endpoint ──────────────────────────────────────────────────

/**
 * Schema for Chrome's /json/version endpoint response.
 * Used to get the WebSocket debugger URL for CDP connection.
 */
export class ChromeVersionResponse extends Schema.Class<ChromeVersionResponse>(
  "ChromeVersionResponse",
)({
  webSocketDebuggerUrl: Schema.String,
}) {}
