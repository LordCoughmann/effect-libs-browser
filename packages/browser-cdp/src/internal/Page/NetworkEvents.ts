/**
 * Network event streams for observing request/response lifecycle.
 *
 * Provides Effect Stream-based access to network events similar to
 * Playwright's `page.on('request')`, `page.on('response')`, etc.
 *
 * Uses PubSub hubs to broadcast events to multiple subscribers.
 *
 */

import type { Protocol } from "devtools-protocol";

import type { CdpConnection } from "../CdpConnection.js";
import type { CdpFrame } from "../CdpPage.js";
import type { RequestFailedInfo } from "./WaitForNetworkEvent.js";

import { Effect, Option, PubSub, Stream } from "effect";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Information about a network request with frame association.
 *
 * Extends the basic RequestInfo with frame tracking for iframe request capture.
 * The `frameId` is the CDP frame identifier, and `frame()` returns a CdpFrame
 * object for frame-level operations.
 */
export interface NetworkRequest {
  /** Unique request identifier assigned by the network agent. */
  readonly requestId: string;
  /** The URL of the request. */
  readonly url: string;
  /** HTTP method. */
  readonly method: string;
  /** Request headers (key-value pairs). */
  readonly headers: Record<string, string>;
  /** Request payload (POST data), if any. */
  readonly postData?: string;
  /** The type of the resource. */
  readonly resourceType?: string;
  /** The CDP frame ID that initiated this request. */
  readonly frameId?: string;
  /** Whether this is a navigation request (Document type). */
  readonly isNavigationRequest: boolean;
  /** The frame that initiated this request. */
  readonly frame: () => Option.Option<CdpFrame>;
}

/**
 * Information about a network response with frame association.
 */
export interface NetworkResponse {
  /** Unique request identifier (matches the corresponding request). */
  readonly requestId: string;
  /** The URL of the response. */
  readonly url: string;
  /** HTTP status code. */
  readonly status: number;
  /** HTTP status text. */
  readonly statusText: string;
  /** Response headers (key-value pairs). */
  readonly headers: Record<string, string>;
  /** Resource MIME type. */
  readonly mimeType?: string;
  /** The CDP frame ID that received this response. */
  readonly frameId?: string;
  /** Whether this is a navigation response. */
  readonly isNavigationResponse: boolean;
  /** The frame that received this response. */
  readonly frame: () => Option.Option<CdpFrame>;
}

/**
 * Information about a finished network request.
 *
 * Fires when Network.loadingFinished event is received.
 * A request is "finished" when the response body is completely received.
 */
export interface NetworkRequestFinished {
  /** Unique request identifier. */
  readonly requestId: string;
  /** The URL of the request. */
  readonly url: string;
  /** Timestamp when the request finished. */
  readonly timestamp: number;
  /** The CDP frame ID that initiated this request. */
  readonly frameId?: string;
  /** The frame that initiated this request. */
  readonly frame: () => Option.Option<CdpFrame>;
}

/**
 * Information about a failed network request with frame association.
 */
export interface NetworkRequestFailed extends RequestFailedInfo {
  /** The CDP frame ID that initiated this request. */
  readonly frameId?: string;
  /** The frame that initiated this request. */
  readonly frame: () => Option.Option<CdpFrame>;
}

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Factory function type for creating CdpFrame objects from frame IDs.
 *
 * This callback is passed from CdpPage.ts and has access to the full
 * FrameContext needed to create CdpFrame instances.
 */
export type FrameFactory = (frameId: string) => Option.Option<CdpFrame>;

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Creates PubSub hubs for network event broadcasting.
 *
 * Each hub broadcasts events to all subscribers. The streams complete
 * when the page scope closes (automatic cleanup).
 *
 * @returns Object with PubSubs for each network event type
 */
export const makeNetworkEventHubs = Effect.gen(function* () {
  const requestHub = yield* PubSub.unbounded<NetworkRequest>();
  const responseHub = yield* PubSub.unbounded<NetworkResponse>();
  const requestFinishedHub = yield* PubSub.unbounded<NetworkRequestFinished>();
  const requestFailedHub = yield* PubSub.unbounded<NetworkRequestFailed>();

  return {
    requestHub,
    responseHub,
    requestFinishedHub,
    requestFailedHub,
  } as const;
});

/**
 * Type for network event hubs returned by makeNetworkEventHubs.
 */
export interface NetworkEventHubs {
  readonly requestHub: PubSub.PubSub<NetworkRequest>;
  readonly responseHub: PubSub.PubSub<NetworkResponse>;
  readonly requestFinishedHub: PubSub.PubSub<NetworkRequestFinished>;
  readonly requestFailedHub: PubSub.PubSub<NetworkRequestFailed>;
}

// ── Event Extraction ───────────────────────────────────────────────────────────

/**
 * Creates a frame accessor function that uses the frame factory.
 *
 * The returned function can be called to get the CdpFrame for a given frameId.
 * Uses the provided frameFactory callback which has access to the full FrameContext.
 */
const makeFrameAccessor = (
  frameFactory: FrameFactory,
): ((frameId?: string) => Option.Option<CdpFrame>) => {
  return (frameId?: string) => {
    if (!frameId) return Option.none();
    // Use the frame factory to create/get the CdpFrame
    return frameFactory(frameId);
  };
};

/**
 * Extracts NetworkRequest from Network.requestWillBeSent event.
 *
 * The frameId comes from the event params and is used to associate
 * the request with the frame that initiated it.
 */
export const extractNetworkRequest = (
  params: Protocol.Network.RequestWillBeSentEvent,
  frameAccessor: (frameId?: string) => Option.Option<CdpFrame>,
): NetworkRequest => ({
  requestId: params.requestId,
  url: params.request.url,
  method: params.request.method,
  headers: params.request.headers as Record<string, string>,
  postData: params.request.postData,
  resourceType: params.type,
  frameId: params.frameId,
  isNavigationRequest: params.type === "Document" || params.documentURL !== undefined,
  frame: () => frameAccessor(params.frameId),
});

/**
 * Extracts NetworkResponse from Network.responseReceived event.
 */
export const extractNetworkResponse = (
  params: Protocol.Network.ResponseReceivedEvent,
  frameAccessor: (frameId?: string) => Option.Option<CdpFrame>,
): NetworkResponse => ({
  requestId: params.requestId,
  url: params.response.url,
  status: params.response.status,
  statusText: params.response.statusText,
  headers: params.response.headers as Record<string, string>,
  mimeType: params.response.mimeType,
  frameId: params.frameId,
  isNavigationResponse: params.type === "Document",
  frame: () => frameAccessor(params.frameId),
});

/**
 * Extracts NetworkRequestFinished from Network.loadingFinished event.
 *
 * URL must be tracked from prior requestWillBeSent event.
 */
export const extractNetworkRequestFinished = (
  params: Protocol.Network.LoadingFinishedEvent,
  url: string,
  frameAccessor: (frameId?: string) => Option.Option<CdpFrame>,
  frameId?: string,
): NetworkRequestFinished => ({
  requestId: params.requestId,
  url,
  timestamp: params.timestamp,
  frameId,
  frame: () => frameAccessor(frameId),
});

/**
 * Extracts NetworkRequestFailed from Network.loadingFailed event.
 *
 * URL and frameId must be tracked from prior requestWillBeSent event.
 */
export const extractNetworkRequestFailed = (
  params: Protocol.Network.LoadingFailedEvent,
  url: string,
  frameAccessor: (frameId?: string) => Option.Option<CdpFrame>,
  frameId?: string,
): NetworkRequestFailed => ({
  requestId: params.requestId,
  url,
  resourceType: params.type,
  errorText: params.errorText,
  canceled: params.canceled ?? false,
  frameId,
  frame: () => frameAccessor(frameId),
});

// ── Stream Processor ───────────────────────────────────────────────────────────

/**
 * Creates a stream processor that listens to CDP network events and publishes
 * them to the appropriate PubSub hubs.
 *
 * This processor should be forked as a scoped fiber so it runs continuously
 * and cleans up when the page scope closes.
 *
 * @param conn - CDP connection service
 * @param hubs - Network event PubSub hubs
 * @param frameFactory - Factory function to create CdpFrame from frameId
 * @param mainFrameId - Main frame ID (targetId)
 */
export const makeNetworkEventProcessor = (
  conn: CdpConnection["Service"],
  hubs: NetworkEventHubs,
  frameFactory: FrameFactory,
  _mainFrameId: string,
) => {
  // Track request metadata (URL, frameId) from requestWillBeSent for later events
  const requestMetadata = new Map<string, { url: string; frameId?: string }>();

  // Create frame accessor for frame() methods
  const frameAccessor = makeFrameAccessor(frameFactory);

  return conn.events.pipe(
    Stream.tap((msg) =>
      Effect.gen(function* () {
        // Handle Network.requestWillBeSent
        if (msg.method === "Network.requestWillBeSent") {
          // oxlint-disable-next-line effect/avoid-any — CDP event params are untyped JSON, cast is inherent
          const params = msg.params as unknown as Protocol.Network.RequestWillBeSentEvent;

          // Skip data: URLs — CDP fires requestWillBeSent for them but
          // Playwright's page.on('request') doesn't emit them (they don't go through network)
          if (params.request.url.startsWith("data:")) {
            return;
          }

          // Track metadata for later events
          requestMetadata.set(params.requestId, {
            url: params.request.url,
            frameId: params.frameId,
          });
          // Publish to request hub
          yield* PubSub.publish(hubs.requestHub, extractNetworkRequest(params, frameAccessor));
        }

        // Handle Network.responseReceived
        if (msg.method === "Network.responseReceived") {
          // oxlint-disable-next-line effect/avoid-any — CDP event params are untyped JSON, cast is inherent
          const params = msg.params as unknown as Protocol.Network.ResponseReceivedEvent;

          // Skip data: URLs — they don't go through network
          if (params.response.url.startsWith("data:")) {
            return;
          }

          yield* PubSub.publish(hubs.responseHub, extractNetworkResponse(params, frameAccessor));
        }

        // Handle Network.loadingFinished
        if (msg.method === "Network.loadingFinished") {
          // oxlint-disable-next-line effect/avoid-any — CDP event params are untyped JSON, cast is inherent
          const params = msg.params as unknown as Protocol.Network.LoadingFinishedEvent;
          const meta = requestMetadata.get(params.requestId);
          if (meta) {
            yield* PubSub.publish(
              hubs.requestFinishedHub,
              extractNetworkRequestFinished(params, meta.url, frameAccessor, meta.frameId),
            );
          }
        }

        // Handle Network.loadingFailed
        if (msg.method === "Network.loadingFailed") {
          // oxlint-disable-next-line effect/avoid-any — CDP event params are untyped JSON, cast is inherent
          const params = msg.params as unknown as Protocol.Network.LoadingFailedEvent;
          const meta = requestMetadata.get(params.requestId);
          if (meta) {
            yield* PubSub.publish(
              hubs.requestFailedHub,
              extractNetworkRequestFailed(params, meta.url, frameAccessor, meta.frameId),
            );
          }
        }
      }),
    ),
    Stream.runDrain,
    Effect.catchCause((cause) => Effect.logDebug("[cdp] network event stream ended", cause)),
  );
};
