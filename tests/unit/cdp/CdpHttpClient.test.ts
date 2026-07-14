/**
 * Unit tests for CdpHttpClient.
 *
 * Tests the HttpClient wrapper around page.fetch().
 */

import type { FetchResponse } from "@effect-libs/browser-cdp";

import type { PageFetchFn } from "../../../packages/browser-cdp/src/internal/CdpHttpClient.js";

import { describe, it, assert } from "@effect/vitest";
import { Effect, Exit, Option, Cause, Result, Schema } from "effect";
import { Headers, HttpBody } from "effect/unstable/http";

import { CdpError, FetchError } from "@effect-libs/browser-cdp";

import { makePageHttpClient } from "../../../packages/browser-cdp/src/internal/CdpHttpClient.js";

// ── Mock PageFetchFn ───────────────────────────────────────────────────────────

const createMockPageFetch =
  (response: Partial<FetchResponse> = {}): PageFetchFn =>
  (url: string, options?: any) => {
    const defaultResponse: FetchResponse = {
      status: 200,
      ok: true,
      headers: {},
      body: JSON.stringify({ url, ...options }),
    };
    return Effect.succeed({ ...defaultResponse, ...response });
  };

const createFailingPageFetch =
  (error: CdpError): PageFetchFn =>
  () =>
    Effect.fail(error);

// ── Tests ───────────────────────────────────────────────────────────────────────

describe("makePageHttpClient", () => {
  it.effect("creates HttpClient from page.fetch", () =>
    Effect.gen(function* () {
      const mockFetch = createMockPageFetch();
      const client = makePageHttpClient(mockFetch);

      const response = yield* client.get("https://example.com/api");
      const body = yield* response.text;

      assert.strictEqual(response.status, 200);
      assert.isTrue(body.includes("example.com"));
    }),
  );

  it.effect("forwards method and headers", () =>
    Effect.gen(function* () {
      const mockFetch = createMockPageFetch();
      const client = makePageHttpClient(mockFetch);

      const response = yield* client.post("https://example.com/api", {
        headers: { "Content-Type": "application/json" },
        body: HttpBody.text('{"test": true}', "application/json"),
      });

      const body = yield* response.text;
      const parsed = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(
          Schema.Struct({
            method: Schema.String,
            headers: Schema.Record(Schema.String, Schema.String),
          }),
        ),
      )(body);

      assert.strictEqual(parsed.method, "POST");
      // HTTP headers are case-insensitive; check either case
      const contentType = parsed.headers["content-type"] || parsed.headers["Content-Type"];
      assert.strictEqual(contentType, "application/json");
    }),
  );

  it.effect("handles non-OK responses", () =>
    Effect.gen(function* () {
      const mockFetch = createMockPageFetch({ status: 404, ok: false });
      const client = makePageHttpClient(mockFetch);

      const response = yield* client.get("https://example.com/not-found");

      assert.strictEqual(response.status, 404);
      // HttpClientResponse doesn't have 'ok' property - check status directly
      assert.isFalse(response.status >= 200 && response.status < 300);
    }),
  );

  it.effect("converts FetchError to HttpClientError", () =>
    Effect.gen(function* () {
      const fetchError = new CdpError({
        module: "CdpPage",
        method: "fetch",
        reason: new FetchError({
          url: "https://example.com/fail",
          description: "Connection refused",
        }),
      });
      const mockFetch = createFailingPageFetch(fetchError);
      const client = makePageHttpClient(mockFetch);

      const result = yield* Effect.exit(client.get("https://example.com/fail"));

      assert.isTrue(Exit.isFailure(result));
      // Verify the cause contains a failure
      if (Exit.isFailure(result)) {
        const failResult = Cause.findFail(result.cause);
        assert.isTrue(Result.isSuccess(failResult));
      }
    }),
  );

  it.effect("returns response headers", () =>
    Effect.gen(function* () {
      const mockFetch = createMockPageFetch({
        headers: { "x-custom": "value", "content-type": "application/json" },
      });
      const client = makePageHttpClient(mockFetch);

      const response = yield* client.get("https://example.com/api");
      // Headers.get returns Option<string>
      const customHeaderOption = Headers.get(response.headers, "x-custom");
      assert.isTrue(Option.isSome(customHeaderOption));
      // Option.isSome narrows to Some<string> which has .value
      if (Option.isSome(customHeaderOption)) {
        assert.strictEqual(customHeaderOption.value, "value");
      }
    }),
  );

  // ── Body Encoding Tests ──────────────────────────────────────────────────────

  describe("body encoding", () => {
    it.effect("encodes Uint8Array body as string", () =>
      Effect.gen(function* () {
        const mockFetch = createMockPageFetch();
        const client = makePageHttpClient(mockFetch);

        const encoder = new TextEncoder();
        const bodyBytes = encoder.encode('{"data":"test"}');

        const response = yield* client.post("https://example.com/api", {
          headers: { "Content-Type": "application/json" },
          body: HttpBody.uint8Array(bodyBytes, "application/json"),
        });

        const responseBody = yield* response.text;
        const parsed = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Struct({ body: Schema.String })),
        )(responseBody);

        // Body should be decoded from Uint8Array to string
        assert.strictEqual(parsed.body, '{"data":"test"}');
      }),
    );

    it.effect("encodes plain string body", () =>
      Effect.gen(function* () {
        const mockFetch = createMockPageFetch();
        const client = makePageHttpClient(mockFetch);

        const response = yield* client.post("https://example.com/api", {
          headers: { "Content-Type": "text/plain" },
          body: HttpBody.text("plain text body", "text/plain"),
        });

        const responseBody = yield* response.text;
        const parsed = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Struct({ body: Schema.String })),
        )(responseBody);

        assert.strictEqual(parsed.body, "plain text body");
      }),
    );

    it.effect("GET request with no body", () =>
      Effect.gen(function* () {
        const mockFetch = createMockPageFetch();
        const client = makePageHttpClient(mockFetch);

        const response = yield* client.get("https://example.com/api");
        const responseBody = yield* response.text;

        const parsed = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(
            Schema.Struct({
              method: Schema.String,
              body: Schema.optional(Schema.String),
            }),
          ),
        )(responseBody);

        assert.strictEqual(parsed.method, "GET");
        // Body should be undefined for GET
        assert.isUndefined(parsed.body);
      }),
    );

    it.effect("POST with empty body string passes through", () =>
      Effect.gen(function* () {
        const mockFetch = createMockPageFetch();
        const client = makePageHttpClient(mockFetch);

        const response = yield* client.post("https://example.com/api", {
          body: HttpBody.text("", "text/plain"),
        });

        // Empty string body is valid - the request succeeds
        assert.strictEqual(response.status, 200);
      }),
    );
  });
});
