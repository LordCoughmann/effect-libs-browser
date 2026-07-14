import http from 'node:http';
import 'node:http2';
import https from 'node:https';
import { getProxyForUrl, HttpsProxyAgent, SocksProxyAgent } from '../../utilsBundle.js';
import { httpsHappyEyeballsAgent, httpHappyEyeballsAgent } from './happyEyeballs.js';
import { ManualPromise } from '../../utils/isomorphic/manualPromise.js';

const NET_DEFAULT_TIMEOUT = 3e4;
function httpRequest(params, onResponse, onError) {
  let url = new URL(params.url);
  const options = {
    method: params.method || "GET",
    headers: params.headers
  };
  if (params.rejectUnauthorized !== void 0)
    options.rejectUnauthorized = params.rejectUnauthorized;
  const proxyURL = getProxyForUrl(params.url);
  if (proxyURL) {
    const parsedProxyURL = normalizeProxyURL(proxyURL);
    if (params.url.startsWith("http:")) {
      parsedProxyURL.pathname = url.toString();
      url = parsedProxyURL;
    } else {
      options.agent = new HttpsProxyAgent(parsedProxyURL);
      options.rejectUnauthorized = false;
    }
  }
  options.agent ??= url.protocol === "https:" ? httpsHappyEyeballsAgent : httpHappyEyeballsAgent;
  let cancelRequest;
  const requestCallback = (res) => {
    const statusCode = res.statusCode || 0;
    if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
      request.destroy();
      cancelRequest = httpRequest({ ...params, url: new URL(res.headers.location, params.url).toString() }, onResponse, onError).cancel;
    } else {
      onResponse(res);
    }
  };
  const request = url.protocol === "https:" ? https.request(url, options, requestCallback) : http.request(url, options, requestCallback);
  request.on("error", onError);
  if (params.socketTimeout !== void 0) {
    request.setTimeout(params.socketTimeout, () => {
      onError(new Error(`Request to ${params.url} timed out after ${params.socketTimeout}ms`));
      request.abort();
    });
  }
  cancelRequest = (e) => {
    try {
      request.destroy(e);
    } catch {
    }
  };
  request.end(params.data);
  return { cancel: (e) => cancelRequest(e) };
}
async function fetchData(progress, params, onError) {
  const promise = new ManualPromise();
  const { cancel } = httpRequest(params, async (response) => {
    if (response.statusCode !== 200) {
      const error = onError ? await onError(params, response) : new Error(`fetch failed: server returned code ${response.statusCode}. URL: ${params.url}`);
      promise.reject(error);
      return;
    }
    let body = "";
    response.on("data", (chunk) => body += chunk);
    response.on("error", (error) => promise.reject(error));
    response.on("end", () => promise.resolve(body));
  }, (error) => promise.reject(error));
  if (!progress)
    return promise;
  try {
    return await progress.race(promise);
  } catch (error) {
    cancel(error);
    throw error;
  }
}
function shouldBypassProxy(url, bypass) {
  if (!bypass)
    return false;
  const domains = bypass.split(",").map((s) => {
    s = s.trim();
    if (!s.startsWith("."))
      s = "." + s;
    return s;
  });
  const domain = "." + url.hostname;
  return domains.some((d) => domain.endsWith(d));
}
function normalizeProxyURL(proxy) {
  proxy = proxy.trim();
  if (!/^\w+:\/\//.test(proxy))
    proxy = "http://" + proxy;
  return new URL(proxy);
}
function createProxyAgent(proxy, forUrl) {
  if (!proxy)
    return;
  if (forUrl && proxy.bypass && shouldBypassProxy(forUrl, proxy.bypass))
    return;
  const proxyURL = normalizeProxyURL(proxy.server);
  if (proxyURL.protocol?.startsWith("socks")) {
    if (proxyURL.protocol === "socks5:")
      proxyURL.protocol = "socks5h:";
    else if (proxyURL.protocol === "socks4:")
      proxyURL.protocol = "socks4a:";
    return new SocksProxyAgent(proxyURL);
  }
  if (proxy.username) {
    proxyURL.username = proxy.username;
    proxyURL.password = proxy.password || "";
  }
  if (forUrl && ["ws:", "wss:"].includes(forUrl.protocol)) {
    return new HttpsProxyAgent(proxyURL);
  }
  return new HttpsProxyAgent(proxyURL);
}
function createHttpServer(...args) {
  const server = http.createServer(...args);
  decorateServer(server);
  return server;
}
function decorateServer(server) {
  const sockets = /* @__PURE__ */ new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  const close = server.close;
  server.close = (callback) => {
    for (const socket of sockets)
      socket.destroy();
    sockets.clear();
    return close.call(server, callback);
  };
}

export { NET_DEFAULT_TIMEOUT, createHttpServer, createProxyAgent, fetchData, httpRequest };
