import { EventEmitter } from 'node:events';
import http2 from 'node:http2';
import net from 'node:net';
import require$$6 from 'node:stream';
import tls from 'node:tls';
import { SocksProxy } from './utils/socksProxy.js';
import { escapeHTML } from '../utils/isomorphic/stringUtils.js';
import { rewriteErrorMessage } from '../utils/isomorphic/stackTrace.js';
import '../../../_virtual/pixelmatch.js';
import { getProxyForUrl } from '../utilsBundle.js';
import { generateSelfSignedCertificate } from './utils/crypto.js';
import './utils/debug.js';
import { debugLogger } from './utils/debugLogger.js';
import './utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../zipBundle.js';
import './utils/hostPlatform.js';
import { createProxyAgent } from './utils/network.js';
import './utils/nodePlatform.js';
import './utils/profiler.js';
import 'node:os';
import './utils/zones.js';
import { verifyClientCertificates } from './browserContext.js';
import { createSocket } from './utils/happyEyeballs.js';

let dummyServerTlsOptions = void 0;
function loadDummyServerCertsIfNeeded() {
  if (dummyServerTlsOptions)
    return;
  const { cert, key } = generateSelfSignedCertificate();
  dummyServerTlsOptions = { key, cert };
}
class SocksProxyConnection {
  constructor(socksProxy, uid, host, port) {
    this._firstPackageReceived = false;
    this._closed = false;
    this.socksProxy = socksProxy;
    this.uid = uid;
    this.host = host;
    this.port = port;
    this._serverCloseEventListener = () => {
      this._browserEncrypted.destroy();
    };
    this._browserEncrypted = new require$$6.Duplex({
      read: () => {
      },
      write: (data, encoding, callback) => {
        this.socksProxy._socksProxy.sendSocketData({ uid: this.uid, data });
        callback();
      },
      destroy: (error, callback) => {
        if (error)
          socksProxy._socksProxy.sendSocketError({ uid: this.uid, error: error.message });
        else
          socksProxy._socksProxy.sendSocketEnd({ uid: this.uid });
        callback();
      }
    });
  }
  async connect() {
    const proxyAgent = this.socksProxy.getProxyAgent(this.host, this.port);
    if (proxyAgent)
      this._serverEncrypted = await proxyAgent.connect(new EventEmitter(), { host: rewriteToLocalhostIfNeeded(this.host), port: this.port, secureEndpoint: false });
    else
      this._serverEncrypted = await createSocket(rewriteToLocalhostIfNeeded(this.host), this.port);
    this._serverEncrypted.once("close", this._serverCloseEventListener);
    this._serverEncrypted.once("error", (error) => this._browserEncrypted.destroy(error));
    if (this._closed) {
      this._serverEncrypted.destroy();
      return;
    }
    this.socksProxy._socksProxy.socketConnected({
      uid: this.uid,
      host: this._serverEncrypted.localAddress,
      port: this._serverEncrypted.localPort
    });
  }
  onClose() {
    this._serverEncrypted.destroy();
    this._browserEncrypted.destroy();
    this._closed = true;
  }
  onData(data) {
    if (!this._firstPackageReceived) {
      this._firstPackageReceived = true;
      if (data[0] === 22)
        this._establishTlsTunnel(this._browserEncrypted, data);
      else
        this._establishPlaintextTunnel(this._browserEncrypted);
    }
    this._browserEncrypted.push(data);
  }
  _establishPlaintextTunnel(browserEncrypted) {
    browserEncrypted.pipe(this._serverEncrypted);
    this._serverEncrypted.pipe(browserEncrypted);
  }
  _establishTlsTunnel(browserEncrypted, clientHello) {
    const browserALPNProtocols = parseALPNFromClientHello(clientHello) || ["http/1.1"];
    debugLogger.log("client-certificates", `Browser->Proxy ${this.host}:${this.port} offers ALPN ${browserALPNProtocols}`);
    const serverDecrypted = tls.connect({
      socket: this._serverEncrypted,
      host: this.host,
      port: this.port,
      rejectUnauthorized: !this.socksProxy.ignoreHTTPSErrors,
      ALPNProtocols: browserALPNProtocols,
      servername: !net.isIP(this.host) ? this.host : void 0,
      secureContext: this.socksProxy.secureContextMap.get(new URL(`https://${this.host}:${this.port}`).origin)
    }, async () => {
      const browserDecrypted = await this._upgradeToTLSIfNeeded(browserEncrypted, serverDecrypted.alpnProtocol);
      debugLogger.log("client-certificates", `Proxy->Server ${this.host}:${this.port} chooses ALPN ${browserDecrypted.alpnProtocol}`);
      browserDecrypted.pipe(serverDecrypted);
      serverDecrypted.pipe(browserDecrypted);
      const cleanup = (error) => this._serverEncrypted.destroy(error);
      browserDecrypted.once("error", cleanup);
      serverDecrypted.once("error", cleanup);
      browserDecrypted.once("close", cleanup);
      serverDecrypted.once("close", cleanup);
      if (this._closed)
        serverDecrypted.destroy();
    });
    serverDecrypted.once("error", async (error) => {
      debugLogger.log("client-certificates", `error when connecting to server: ${error.message.replaceAll("\n", " ")}`);
      this._serverEncrypted.removeListener("close", this._serverCloseEventListener);
      this._serverEncrypted.destroy();
      const browserDecrypted = await this._upgradeToTLSIfNeeded(this._browserEncrypted, serverDecrypted.alpnProtocol);
      const responseBody = escapeHTML("Playwright client-certificate error: " + error.message).replaceAll("\n", " <br>");
      if (browserDecrypted.alpnProtocol === "h2") {
        if ("performServerHandshake" in http2) {
          const session = http2.performServerHandshake(browserDecrypted);
          session.on("error", (error2) => {
            this._browserEncrypted.destroy(error2);
          });
          session.once("stream", (stream2) => {
            const cleanup = (error2) => {
              session.close();
              this._browserEncrypted.destroy(error2);
            };
            stream2.once("end", cleanup);
            stream2.once("error", cleanup);
            stream2.respond({
              [http2.constants.HTTP2_HEADER_CONTENT_TYPE]: "text/html",
              [http2.constants.HTTP2_HEADER_STATUS]: 503
            });
            stream2.end(responseBody);
          });
        } else {
          this._browserEncrypted.destroy(error);
        }
      } else {
        browserDecrypted.end([
          "HTTP/1.1 503 Internal Server Error",
          "Content-Type: text/html; charset=utf-8",
          "Content-Length: " + Buffer.byteLength(responseBody),
          "",
          responseBody
        ].join("\r\n"));
      }
    });
  }
  async _upgradeToTLSIfNeeded(socket, alpnProtocol) {
    this._brorwserDecrypted ??= new Promise((resolve, reject) => {
      const dummyServer = tls.createServer({
        ...dummyServerTlsOptions,
        ALPNProtocols: [alpnProtocol || "http/1.1"]
      });
      dummyServer.emit("connection", socket);
      dummyServer.once("secureConnection", (tlsSocket) => {
        dummyServer.close();
        resolve(tlsSocket);
      });
      dummyServer.once("error", (error) => {
        dummyServer.close();
        reject(error);
      });
    });
    return this._brorwserDecrypted;
  }
}
class ClientCertificatesProxy {
  constructor(contextOptions) {
    this._connections = /* @__PURE__ */ new Map();
    this.secureContextMap = /* @__PURE__ */ new Map();
    verifyClientCertificates(contextOptions.clientCertificates);
    this.ignoreHTTPSErrors = contextOptions.ignoreHTTPSErrors;
    this._proxy = contextOptions.proxy;
    this._initSecureContexts(contextOptions.clientCertificates);
    this._socksProxy = new SocksProxy();
    this._socksProxy.setPattern("*");
    this._socksProxy.addListener(SocksProxy.Events.SocksRequested, async (payload) => {
      try {
        const connection = new SocksProxyConnection(this, payload.uid, payload.host, payload.port);
        await connection.connect();
        this._connections.set(payload.uid, connection);
      } catch (error) {
        debugLogger.log("client-certificates", `Failed to connect to ${payload.host}:${payload.port}: ${error.message}`);
        this._socksProxy.socketFailed({ uid: payload.uid, errorCode: error.code });
      }
    });
    this._socksProxy.addListener(SocksProxy.Events.SocksData, (payload) => {
      this._connections.get(payload.uid)?.onData(payload.data);
    });
    this._socksProxy.addListener(SocksProxy.Events.SocksClosed, (payload) => {
      this._connections.get(payload.uid)?.onClose();
      this._connections.delete(payload.uid);
    });
    loadDummyServerCertsIfNeeded();
  }
  getProxyAgent(host, port) {
    const proxyFromOptions = createProxyAgent(this._proxy);
    if (proxyFromOptions)
      return proxyFromOptions;
    const proxyFromEnv = getProxyForUrl(`https://${host}:${port}`);
    if (proxyFromEnv)
      return createProxyAgent({ server: proxyFromEnv });
  }
  _initSecureContexts(clientCertificates) {
    const origin2certs = /* @__PURE__ */ new Map();
    for (const cert of clientCertificates || []) {
      const origin = normalizeOrigin(cert.origin);
      const certs = origin2certs.get(origin) || [];
      certs.push(cert);
      origin2certs.set(origin, certs);
    }
    for (const [origin, certs] of origin2certs) {
      try {
        this.secureContextMap.set(origin, tls.createSecureContext(convertClientCertificatesToTLSOptions(certs)));
      } catch (error) {
        error = rewriteOpenSSLErrorIfNeeded(error);
        throw rewriteErrorMessage(error, `Failed to load client certificate: ${error.message}`);
      }
    }
  }
  static async create(progress, contextOptions) {
    const proxy = new ClientCertificatesProxy(contextOptions);
    try {
      await progress.race(proxy._socksProxy.listen(0, "127.0.0.1"));
      return proxy;
    } catch (error) {
      await proxy.close();
      throw error;
    }
  }
  proxySettings() {
    return { server: `socks5://127.0.0.1:${this._socksProxy.port()}` };
  }
  async close() {
    await this._socksProxy.close();
  }
}
function normalizeOrigin(origin) {
  try {
    return new URL(origin).origin;
  } catch (error) {
    return origin;
  }
}
function convertClientCertificatesToTLSOptions(clientCertificates) {
  if (!clientCertificates || !clientCertificates.length)
    return;
  const tlsOptions = {
    pfx: [],
    key: [],
    cert: []
  };
  for (const cert of clientCertificates) {
    if (cert.cert)
      tlsOptions.cert.push(cert.cert);
    if (cert.key)
      tlsOptions.key.push({ pem: cert.key, passphrase: cert.passphrase });
    if (cert.pfx)
      tlsOptions.pfx.push({ buf: cert.pfx, passphrase: cert.passphrase });
  }
  return tlsOptions;
}
function getMatchingTLSOptionsForOrigin(clientCertificates, origin) {
  const matchingCerts = clientCertificates?.filter(
    (c) => normalizeOrigin(c.origin) === origin
  );
  return convertClientCertificatesToTLSOptions(matchingCerts);
}
function rewriteToLocalhostIfNeeded(host) {
  return host === "local.playwright" ? "localhost" : host;
}
function rewriteOpenSSLErrorIfNeeded(error) {
  if (error.message !== "unsupported" && error.code !== "ERR_CRYPTO_UNSUPPORTED_OPERATION")
    return error;
  return rewriteErrorMessage(error, [
    "Unsupported TLS certificate.",
    "Most likely, the security algorithm of the given certificate was deprecated by OpenSSL.",
    "For more details, see https://github.com/openssl/openssl/blob/master/README-PROVIDERS.md#the-legacy-provider",
    "You could probably modernize the certificate by following the steps at https://github.com/nodejs/node/issues/40672#issuecomment-1243648223"
  ].join("\n"));
}
function parseALPNFromClientHello(buffer) {
  if (buffer.length < 6)
    return null;
  if (buffer[0] !== 22)
    return null;
  let offset = 5;
  if (buffer[offset] !== 1)
    return null;
  offset += 4;
  offset += 2;
  offset += 32;
  if (offset >= buffer.length)
    return null;
  const sessionIdLength = buffer[offset];
  offset += 1 + sessionIdLength;
  if (offset + 2 > buffer.length)
    return null;
  const cipherSuitesLength = buffer.readUInt16BE(offset);
  offset += 2 + cipherSuitesLength;
  if (offset >= buffer.length)
    return null;
  const compressionMethodsLength = buffer[offset];
  offset += 1 + compressionMethodsLength;
  if (offset + 2 > buffer.length)
    return null;
  const extensionsLength = buffer.readUInt16BE(offset);
  offset += 2;
  const extensionsEnd = offset + extensionsLength;
  if (extensionsEnd > buffer.length)
    return null;
  while (offset + 4 <= extensionsEnd) {
    const extensionType = buffer.readUInt16BE(offset);
    offset += 2;
    const extensionLength = buffer.readUInt16BE(offset);
    offset += 2;
    if (offset + extensionLength > extensionsEnd)
      return null;
    if (extensionType === 16)
      return parseALPNExtension(buffer.subarray(offset, offset + extensionLength));
    offset += extensionLength;
  }
  return null;
}
function parseALPNExtension(buffer) {
  if (buffer.length < 2)
    return null;
  const listLength = buffer.readUInt16BE(0);
  if (listLength !== buffer.length - 2)
    return null;
  const protocols = [];
  let offset = 2;
  while (offset < buffer.length) {
    const protocolLength = buffer[offset];
    offset += 1;
    if (offset + protocolLength > buffer.length)
      break;
    const protocol = buffer.subarray(offset, offset + protocolLength).toString("utf8");
    protocols.push(protocol);
    offset += protocolLength;
  }
  return protocols.length > 0 ? protocols : null;
}

export { ClientCertificatesProxy, getMatchingTLSOptionsForOrigin, rewriteOpenSSLErrorIfNeeded };
