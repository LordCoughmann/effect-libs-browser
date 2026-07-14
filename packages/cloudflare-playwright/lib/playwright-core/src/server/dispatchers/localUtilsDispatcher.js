import { Dispatcher } from './dispatcher.js';
import { SdkObject } from '../instrumentation.js';
import { zip, harOpen, harLookup, harClose, harUnzip, tracingStarted, traceDiscarded, addStackToTracingNoReply } from '../localUtils.js';
import { getUserAgent } from '../utils/userAgent.js';
import { deviceDescriptors } from '../deviceDescriptors.js';
import { JsonPipeDispatcher } from './jsonPipeDispatcher.js';
import { SocksInterceptor } from '../socksInterceptor.js';
import { WebSocketTransport } from '../../../../cloudflare/webSocketTransport.js';
import { fetchData } from '../utils/network.js';
import { resolveGlobToRegexPattern } from '../../utils/isomorphic/urlMatch.js';

class LocalUtilsDispatcher extends Dispatcher {
  constructor(scope, playwright) {
    const localUtils2 = new SdkObject(playwright, "localUtils", "localUtils");
    localUtils2.logName = "browser";
    const deviceDescriptors$1 = Object.entries(deviceDescriptors).map(([name, descriptor]) => ({ name, descriptor }));
    super(scope, localUtils2, "LocalUtils", {
      deviceDescriptors: deviceDescriptors$1
    });
    this._harBackends = /* @__PURE__ */ new Map();
    this._stackSessions = /* @__PURE__ */ new Map();
    this._type_LocalUtils = true;
  }
  async zip(params, progress) {
    return await zip(progress, this._stackSessions, params);
  }
  async harOpen(params, progress) {
    return await harOpen(progress, this._harBackends, params);
  }
  async harLookup(params, progress) {
    return await harLookup(progress, this._harBackends, params);
  }
  async harClose(params, progress) {
    harClose(this._harBackends, params);
  }
  async harUnzip(params, progress) {
    return await harUnzip(progress, params);
  }
  async tracingStarted(params, progress) {
    return await tracingStarted(progress, this._stackSessions, params);
  }
  async traceDiscarded(params, progress) {
    return await traceDiscarded(progress, this._stackSessions, params);
  }
  async addStackToTracingNoReply(params, progress) {
    addStackToTracingNoReply(this._stackSessions, params);
  }
  async connect(params, progress) {
    const wsHeaders = {
      "User-Agent": getUserAgent(),
      "x-playwright-proxy": params.exposeNetwork ?? "",
      ...params.headers
    };
    const wsEndpoint = await urlToWSEndpoint(progress, params.wsEndpoint);
    const transport = await WebSocketTransport.connect(progress, wsEndpoint, { headers: wsHeaders, followRedirects: true, debugLogHeader: "x-playwright-debug-log" });
    const socksInterceptor = new SocksInterceptor(transport, params.exposeNetwork, params.socksProxyRedirectPortForTest);
    const pipe = new JsonPipeDispatcher(this);
    transport.onmessage = (json) => {
      if (socksInterceptor.interceptMessage(json))
        return;
      const cb = () => {
        try {
          pipe.dispatch(json);
        } catch (e) {
          transport.close();
        }
      };
      if (params.slowMo)
        setTimeout(cb, params.slowMo);
      else
        cb();
    };
    pipe.on("message", (message) => {
      transport.send(message);
    });
    transport.onclose = (reason) => {
      socksInterceptor?.cleanup();
      pipe.wasClosed(reason);
    };
    pipe.on("close", () => transport.close());
    return { pipe, headers: transport.headers };
  }
  async globToRegex(params, progress) {
    const regex = resolveGlobToRegexPattern(params.baseURL, params.glob, params.webSocketUrl);
    return { regex };
  }
}
async function urlToWSEndpoint(progress, endpointURL) {
  if (endpointURL.startsWith("ws"))
    return endpointURL;
  progress.log(`<ws preparing> retrieving websocket url from ${endpointURL}`);
  const fetchUrl = new URL(endpointURL);
  if (!fetchUrl.pathname.endsWith("/"))
    fetchUrl.pathname += "/";
  fetchUrl.pathname += "json";
  const json = await fetchData(progress, {
    url: fetchUrl.toString(),
    method: "GET",
    headers: { "User-Agent": getUserAgent() }
  }, async (params, response) => {
    return new Error(`Unexpected status ${response.statusCode} when connecting to ${fetchUrl.toString()}.
This does not look like a Playwright server, try connecting via ws://.`);
  });
  const wsUrl = new URL(endpointURL);
  let wsEndpointPath = JSON.parse(json).wsEndpointPath;
  if (wsEndpointPath.startsWith("/"))
    wsEndpointPath = wsEndpointPath.substring(1);
  if (!wsUrl.pathname.endsWith("/"))
    wsUrl.pathname += "/";
  wsUrl.pathname += wsEndpointPath;
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  return wsUrl.toString();
}

export { LocalUtilsDispatcher };
