/**
 * Admin API group definition for dynamic route control.
 *
 * Endpoints:
 * - POST /__admin/route     → register dynamic route (hang, delay, respond)
 * - POST /__admin/wait      → wait until request arrives at path
 * - POST /__admin/release   → release a hanging response
 * - POST /__admin/clear     → reset all dynamic routes
 *
 * @module tests/setup/http-server/Admin
 */

import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

// ── API Group Definition ─────────────────────────────────────────────────────

export const AdminGroup = HttpApiGroup.make("Admin")
  .add(
    HttpApiEndpoint.post("setRoute", "/__admin/route", {
      payload: Schema.Struct({
        path: Schema.String,
        action: Schema.Literals(["hang", "delay", "respond", "redirect"]),
        delayMs: Schema.optional(Schema.Finite),
        body: Schema.optional(Schema.String),
        status: Schema.optional(Schema.Finite),
        contentType: Schema.optional(Schema.String),
        redirectUrl: Schema.optional(Schema.String),
      }),
      success: Schema.Struct({
        success: Schema.Boolean,
        message: Schema.optional(Schema.String),
      }),
    }),
  )
  .add(
    HttpApiEndpoint.post("setCSP", "/__admin/csp", {
      payload: Schema.Struct({
        path: Schema.String,
        policy: Schema.String,
      }),
      success: Schema.Struct({
        success: Schema.Boolean,
        message: Schema.optional(Schema.String),
      }),
    }),
  )
  .add(
    HttpApiEndpoint.post("waitForRequest", "/__admin/wait", {
      payload: Schema.Struct({
        path: Schema.String,
      }),
      success: Schema.Struct({
        success: Schema.Boolean,
        message: Schema.optional(Schema.String),
        headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
      }),
    }),
  )
  .add(
    HttpApiEndpoint.post("release", "/__admin/release", {
      payload: Schema.Struct({
        path: Schema.String,
        body: Schema.optional(Schema.String),
      }),
      success: Schema.Struct({
        success: Schema.Boolean,
        message: Schema.optional(Schema.String),
      }),
    }),
  )
  .add(
    HttpApiEndpoint.post("clear", "/__admin/clear", {
      payload: Schema.Void,
      success: Schema.Struct({
        success: Schema.Boolean,
        message: Schema.optional(Schema.String),
      }),
    }),
  );
