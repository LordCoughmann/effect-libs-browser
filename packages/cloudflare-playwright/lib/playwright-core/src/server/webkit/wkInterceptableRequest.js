import { assert } from '../../utils/isomorphic/assert.js';
import { headersObjectToArray, headersArrayToObject } from '../../utils/isomorphic/headers.js';
import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import '../utils/debug.js';
import '../utils/debugLogger.js';
import '../utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../../zipBundle.js';
import '../utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../utils/happyEyeballs.js';
import '../utils/nodePlatform.js';
import '../utils/profiler.js';
import '../utils/socksProxy.js';
import 'node:os';
import '../utils/zones.js';
import { Request, Response, statusText } from '../network.js';

const errorReasons = {
  "aborted": "Cancellation",
  "accessdenied": "AccessControl",
  "addressunreachable": "General",
  "blockedbyclient": "Cancellation",
  "blockedbyresponse": "General",
  "connectionaborted": "General",
  "connectionclosed": "General",
  "connectionfailed": "General",
  "connectionrefused": "General",
  "connectionreset": "General",
  "internetdisconnected": "General",
  "namenotresolved": "General",
  "timedout": "Timeout",
  "failed": "General"
};
class WKInterceptableRequest {
  constructor(session, frame, event, redirectedFrom, documentId) {
    this._session = session;
    this._requestId = event.requestId;
    const resourceType = event.type ? toResourceType(event.type) : redirectedFrom ? redirectedFrom.request.resourceType() : "other";
    let postDataBuffer = null;
    this._timestamp = event.timestamp;
    this._wallTime = event.walltime * 1e3;
    if (event.request.postData)
      postDataBuffer = Buffer.from(event.request.postData, "base64");
    this.request = new Request(
      frame._page.browserContext,
      frame,
      null,
      redirectedFrom?.request || null,
      documentId,
      event.request.url,
      resourceType,
      event.request.method,
      postDataBuffer,
      headersObjectToArray(event.request.headers)
    );
  }
  adoptRequestFromNewProcess(newSession, requestId) {
    this._session = newSession;
    this._requestId = requestId;
  }
  createResponse(responsePayload) {
    const getResponseBody = async () => {
      const response2 = await this._session.send("Network.getResponseBody", { requestId: this._requestId });
      return Buffer.from(response2.body, response2.base64Encoded ? "base64" : "utf8");
    };
    const timingPayload = responsePayload.timing;
    const timing = {
      startTime: this._wallTime,
      domainLookupStart: timingPayload ? wkMillisToRoundishMillis(timingPayload.domainLookupStart) : -1,
      domainLookupEnd: timingPayload ? wkMillisToRoundishMillis(timingPayload.domainLookupEnd) : -1,
      connectStart: timingPayload ? wkMillisToRoundishMillis(timingPayload.connectStart) : -1,
      secureConnectionStart: timingPayload ? wkMillisToRoundishMillis(timingPayload.secureConnectionStart) : -1,
      connectEnd: timingPayload ? wkMillisToRoundishMillis(timingPayload.connectEnd) : -1,
      requestStart: timingPayload ? wkMillisToRoundishMillis(timingPayload.requestStart) : -1,
      responseStart: timingPayload ? wkMillisToRoundishMillis(timingPayload.responseStart) : -1
    };
    const setCookieSeparator = process.platform === "darwin" ? "," : "playwright-set-cookie-separator";
    const response = new Response(this.request, responsePayload.status, responsePayload.statusText, headersObjectToArray(responsePayload.headers, ",", setCookieSeparator), timing, getResponseBody, responsePayload.source === "service-worker");
    response.setRawResponseHeaders(null);
    response.setTransferSize(null);
    if (responsePayload.requestHeaders && Object.keys(responsePayload.requestHeaders).length) {
      const headers = { ...responsePayload.requestHeaders };
      if (!headers["host"])
        headers["Host"] = new URL(this.request.url()).host;
      this.request.setRawRequestHeaders(headersObjectToArray(headers));
    } else {
      this.request.setRawRequestHeaders(null);
    }
    return response;
  }
}
class WKRouteImpl {
  constructor(session, requestId) {
    this._session = session;
    this._requestId = requestId;
  }
  async abort(errorCode) {
    const errorType = errorReasons[errorCode];
    assert(errorType, "Unknown error code: " + errorCode);
    await this._session.sendMayFail("Network.interceptRequestWithError", { requestId: this._requestId, errorType });
  }
  async fulfill(response) {
    if (300 <= response.status && response.status < 400)
      throw new Error("Cannot fulfill with redirect status: " + response.status);
    let mimeType = response.isBase64 ? "application/octet-stream" : "text/plain";
    const headers = headersArrayToObject(
      response.headers,
      true
      /* lowerCase */
    );
    const contentType = headers["content-type"];
    if (contentType)
      mimeType = contentType.split(";")[0].trim();
    await this._session.sendMayFail("Network.interceptRequestWithResponse", {
      requestId: this._requestId,
      status: response.status,
      statusText: statusText(response.status),
      mimeType,
      headers,
      base64Encoded: response.isBase64,
      content: response.body
    });
  }
  async continue(overrides) {
    await this._session.sendMayFail("Network.interceptWithRequest", {
      requestId: this._requestId,
      url: overrides.url,
      method: overrides.method,
      headers: overrides.headers ? headersArrayToObject(
        overrides.headers,
        false
        /* lowerCase */
      ) : void 0,
      postData: overrides.postData ? Buffer.from(overrides.postData).toString("base64") : void 0
    });
  }
}
function wkMillisToRoundishMillis(value) {
  if (value === -1e3)
    return -1;
  if (value <= 0) {
    return -1;
  }
  return (value * 1e3 | 0) / 1e3;
}
function toResourceType(type) {
  switch (type) {
    case "Document":
      return "document";
    case "StyleSheet":
      return "stylesheet";
    case "Image":
      return "image";
    case "Font":
      return "font";
    case "Script":
      return "script";
    case "XHR":
      return "xhr";
    case "Fetch":
      return "fetch";
    case "Ping":
      return "ping";
    case "Beacon":
      return "beacon";
    case "WebSocket":
      return "websocket";
    case "EventSource":
      return "eventsource";
    default:
      return "other";
  }
}

export { WKInterceptableRequest, WKRouteImpl };
