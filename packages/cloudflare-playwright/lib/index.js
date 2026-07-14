import { createInProcessPlaywright } from './playwright-core/src/inProcessFactory.js';
import { kBrowserCloseMessageId } from './playwright-core/src/server/chromium/crConnection.js';
import { timeOrigin, setTimeOrigin } from './playwright-core/src/utils/isomorphic/time.js';
import { WebSocketTransport, transportZone } from './cloudflare/webSocketTransport.js';
import { wrapClientApis } from './cloudflare/wrapClientApis.js';
import { unsupportedOperations } from './cloudflare/unsupportedOperations.js';
import { version } from './playwright-cloudflare/package.json.js';

// Resolve cloudflare:workers env lazily so the module can load in
// non-Worker runtimes (Node.js, Deno, Bun). Uses createRequire for
// ESM compliance. Falls back to empty object when not in Workers.
let _env = null;
const getEnv = () => {
  if (_env === null) {
    try {
      const { createRequire } = require('node:module');
      const cjsRequire = createRequire(import.meta.url);
      _env = cjsRequire('cloudflare:workers').env ?? {};
    } catch {
      _env = {};
    }
  }
  return _env;
};

function resetMonotonicTime() {
  if (timeOrigin() === 0 && Date.now() !== 0)
    setTimeOrigin(Date.now());
}
const playwright = createInProcessPlaywright();
unsupportedOperations(playwright);
wrapClientApis();
const HTTP_FAKE_HOST = "http://fake.host";
const WS_FAKE_HOST = "ws://fake.host";
const originalConnectOverCDP = playwright.chromium.connectOverCDP;
playwright.chromium.connectOverCDP = (endpointURLOrOptions) => {
  const wsEndpoint = typeof endpointURLOrOptions === "string" ? endpointURLOrOptions : endpointURLOrOptions.wsEndpoint ?? endpointURLOrOptions.endpointURL;
  if (!wsEndpoint)
    throw new Error("No wsEndpoint provided");

  // Support external WebSocket endpoints (Steel, Browserbase, local browser)
  // These bypass Cloudflare browser binding entirely
  if (wsEndpoint.startsWith("ws://") || wsEndpoint.startsWith("wss://")) {
    return connectToExternalWebSocket(wsEndpoint);
  }

  const wsUrl = new URL(wsEndpoint);
  if (!wsUrl.searchParams.has("persistent"))
    wsUrl.searchParams.set("persistent", "true");
  return wsUrl.searchParams.has("browser_session") ? connect(wsUrl.toString()) : launch(wsUrl.toString());
};

// Connect to external CDP endpoint via standard WebSocket (no browser binding needed)
async function connectToExternalWebSocket(wsEndpoint) {
  resetMonotonicTime();
  const webSocket = new WebSocket(wsEndpoint);
  await new Promise((resolve, reject) => {
    webSocket.addEventListener("open", () => resolve());
    webSocket.addEventListener("error", (error) => reject(error));
  });
  const sessionId = new URL(wsEndpoint).searchParams.get("browser_session") ?? "";
  const transport = new WebSocketTransport(webSocket, sessionId);
  return await createBrowser(transport, { persistent: true });
}
async function connectDevtools(endpoint, options) {
  resetMonotonicTime();
  const url = new URL(`${HTTP_FAKE_HOST}/v1/devtools/browser/${options.sessionId}`);
  if (options.persistent)
    url.searchParams.set("persistent", "true");
  const response = await getBrowserBinding(endpoint).fetch(url, {
    headers: {
      "Upgrade": "websocket",
      "cf-brapi-client": `@cloudflare/playwright@${version}`
    }
  });
  const webSocket = response.webSocket;
  webSocket.accept();
  return webSocket;
}
function extractOptions(endpoint) {
  if (typeof endpoint === "string" || endpoint instanceof URL) {
    const url = endpoint instanceof URL ? endpoint : new URL(endpoint);
    const pathMatch = url.pathname.match(/^\/v1\/devtools\/browser\/([^/]+)$/);
    const sessionId = pathMatch?.[1] ?? url.searchParams.get("browser_session") ?? void 0;
    const keepAlive = url.searchParams.has("keep_alive") ? parseInt(url.searchParams.get("keep_alive"), 10) : void 0;
    const persistent = url.searchParams.has("persistent");
    return { sessionId, keep_alive: keepAlive, persistent };
  }
  return {};
}
function endpointURLString(binding, options) {
  const env = getEnv();
  const bindingKey = typeof binding === "string" ? binding : Object.keys(env).find((key) => env[key] === binding);
  if (!bindingKey || !(bindingKey in env))
    throw new Error(`No binding found for ${binding}`);
  const sessionPath = options?.sessionId ? `/${options.sessionId}` : "";
  const url = new URL(`${HTTP_FAKE_HOST}/v1/devtools/browser${sessionPath}`);
  url.searchParams.set("browser_binding", bindingKey);
  if (options?.persistent)
    url.searchParams.set("persistent", "true");
  if (options?.keepAlive)
    url.searchParams.set("keep_alive", options.keepAlive.toString());
  return url.toString();
}
async function createBrowser(transport, options) {
  return await transportZone.run(transport, async () => {
    const url = new URL(WS_FAKE_HOST);
    if (options?.persistent)
      url.searchParams.set("persistent", "true");
    const browser = await originalConnectOverCDP.call(playwright.chromium, url.toString(), {});
    browser.sessionId = () => transport.sessionId;
    return browser;
  });
}
function getBrowserBinding(endpoint) {
  const env = getEnv();
  if (typeof endpoint === "string" || endpoint instanceof URL) {
    const url = endpoint instanceof URL ? endpoint : new URL(endpoint);
    const binding = url.searchParams.get("browser_binding");
    if (!binding || !(binding in env))
      throw new Error(`No binding found for ${binding}`);
    return env[binding];
  }
  return endpoint;
}
async function connect(endpoint, sessionIdOrOptions) {
  const extraOptions = typeof sessionIdOrOptions === "string" ? { sessionId: sessionIdOrOptions } : sessionIdOrOptions ?? {};
  const options = { ...extractOptions(endpoint), ...extraOptions };
  if (!options.sessionId)
    throw new Error(`Session ID is required for connect()`);
  const webSocket = await connectDevtools(getBrowserBinding(endpoint), options);
  const transport = new WebSocketTransport(webSocket, options.sessionId);
  return await createBrowser(transport, options);
}
async function launch(endpoint, launchOptions) {
  const { sessionId } = await acquire(endpoint, launchOptions);
  const options = { ...extractOptions(endpoint), ...launchOptions, sessionId };
  const webSocket = await connectDevtools(getBrowserBinding(endpoint), options);
  const transport = new WebSocketTransport(webSocket, sessionId);
  const browser = await createBrowser(transport, options);
  const browserImpl = browser._connection.toImpl(browser);
  const doClose = async () => {
    const message = { method: "Browser.close", id: kBrowserCloseMessageId, params: {} };
    transport.send(message);
  };
  browserImpl.options.browserProcess = { close: doClose, kill: doClose };
  return browser;
}
async function acquire(endpoint, options) {
  options = { ...extractOptions(endpoint), ...options };
  const searchParams = new URLSearchParams();
  if (options?.keep_alive)
    searchParams.set("keep_alive", options.keep_alive.toString());
  if (options?.recording)
    searchParams.set("recording", options.recording.toString());
  if (options?.lab)
    searchParams.set("lab", options.lab.toString());
  const acquireUrl = `${HTTP_FAKE_HOST}/v1/acquire?${searchParams.toString()}`;
  const res = await getBrowserBinding(endpoint).fetch(acquireUrl);
  const status = res.status;
  const text = await res.text();
  if (status !== 200) {
    throw new Error(
      `Unable to create new browser: code: ${status}: message: ${text}`
    );
  }
  const response = JSON.parse(text);
  return response;
}
async function sessions(endpoint) {
  const res = await getBrowserBinding(endpoint).fetch(`${HTTP_FAKE_HOST}/v1/sessions`);
  const status = res.status;
  const text = await res.text();
  if (status !== 200) {
    throw new Error(
      `Unable to fetch new sessions: code: ${status}: message: ${text}`
    );
  }
  const data = JSON.parse(text);
  return data.sessions;
}
async function history(endpoint) {
  const res = await getBrowserBinding(endpoint).fetch(`${HTTP_FAKE_HOST}/v1/history`);
  const status = res.status;
  const text = await res.text();
  if (status !== 200) {
    throw new Error(
      `Unable to fetch account history: code: ${status}: message: ${text}`
    );
  }
  const data = JSON.parse(text);
  return data.history;
}
async function limits(endpoint) {
  const res = await getBrowserBinding(endpoint).fetch(`${HTTP_FAKE_HOST}/v1/limits`);
  const status = res.status;
  const text = await res.text();
  if (status !== 200) {
    throw new Error(
      `Unable to fetch account limits: code: ${status}: message: ${text}`
    );
  }
  const data = JSON.parse(text);
  return data;
}
const chromium = playwright.chromium;
const selectors = playwright.selectors;
const devices = playwright.devices;
const errors = playwright.errors;
const request = playwright.request;
const _instrumentation = playwright._instrumentation;
const playwright$1 = {
  chromium,
  selectors,
  devices,
  errors,
  request,
  _instrumentation,
  endpointURLString,
  launch,
  connect,
  sessions,
  history,
  acquire,
  limits
};

export { _instrumentation, acquire, chromium, connect, playwright$1 as default, devices, endpointURLString, errors, history, launch, limits, request, selectors, sessions };
