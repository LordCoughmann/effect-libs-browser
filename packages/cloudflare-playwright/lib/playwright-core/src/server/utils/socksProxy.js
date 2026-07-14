import EventEmitter from 'node:events';
import net from 'node:net';
import { assert } from '../../utils/isomorphic/assert.js';
import { createGuid } from './crypto.js';
import { debugLogger } from './debugLogger.js';
import { createSocket } from './happyEyeballs.js';

class SocksConnection {
  constructor(uid, socket, client) {
    this._buffer = Buffer.from([]);
    this._offset = 0;
    this._fence = 0;
    this._uid = uid;
    this._socket = socket;
    this._client = client;
    this._boundOnData = this._onData.bind(this);
    socket.on("data", this._boundOnData);
    socket.on("close", () => this._onClose());
    socket.on("end", () => this._onClose());
    socket.on("error", () => this._onClose());
    this._run().catch(() => this._socket.end());
  }
  async _run() {
    assert(await this._authenticate());
    const { command, host, port } = await this._parseRequest();
    if (command !== 1 /* CONNECT */) {
      this._writeBytes(Buffer.from([
        5,
        7 /* CommandNotSupported */,
        0,
        // RSV
        1,
        // IPv4
        0,
        0,
        0,
        0,
        // Address
        0,
        0
        // Port
      ]));
      return;
    }
    this._socket.off("data", this._boundOnData);
    this._client.onSocketRequested({ uid: this._uid, host, port });
  }
  async _authenticate() {
    const version = await this._readByte();
    assert(version === 5, "The VER field must be set to x05 for this version of the protocol, was " + version);
    const nMethods = await this._readByte();
    assert(nMethods, "No authentication methods specified");
    const methods = await this._readBytes(nMethods);
    for (const method of methods) {
      if (method === 0) {
        this._writeBytes(Buffer.from([version, method]));
        return true;
      }
    }
    this._writeBytes(Buffer.from([version, 255 /* NO_ACCEPTABLE_METHODS */]));
    return false;
  }
  async _parseRequest() {
    const version = await this._readByte();
    assert(version === 5, "The VER field must be set to x05 for this version of the protocol, was " + version);
    const command = await this._readByte();
    await this._readByte();
    const addressType = await this._readByte();
    let host = "";
    switch (addressType) {
      case 1 /* IPv4 */:
        host = (await this._readBytes(4)).join(".");
        break;
      case 3 /* FqName */:
        const length = await this._readByte();
        host = (await this._readBytes(length)).toString();
        break;
      case 4 /* IPv6 */:
        const bytes = await this._readBytes(16);
        const tokens = [];
        for (let i = 0; i < 8; ++i)
          tokens.push(bytes.readUInt16BE(i * 2).toString(16));
        host = tokens.join(":");
        break;
    }
    const port = (await this._readBytes(2)).readUInt16BE(0);
    this._buffer = Buffer.from([]);
    this._offset = 0;
    this._fence = 0;
    return {
      command,
      host,
      port
    };
  }
  async _readByte() {
    const buffer = await this._readBytes(1);
    return buffer[0];
  }
  async _readBytes(length) {
    this._fence = this._offset + length;
    if (!this._buffer || this._buffer.length < this._fence)
      await new Promise((f) => this._fenceCallback = f);
    this._offset += length;
    return this._buffer.slice(this._offset - length, this._offset);
  }
  _writeBytes(buffer) {
    if (this._socket.writable)
      this._socket.write(buffer);
  }
  _onClose() {
    this._client.onSocketClosed({ uid: this._uid });
  }
  _onData(buffer) {
    this._buffer = Buffer.concat([this._buffer, buffer]);
    if (this._fenceCallback && this._buffer.length >= this._fence) {
      const callback = this._fenceCallback;
      this._fenceCallback = void 0;
      callback();
    }
  }
  socketConnected(host, port) {
    this._writeBytes(Buffer.from([
      5,
      0 /* Succeeded */,
      0,
      // RSV
      ...ipToSocksAddress(host),
      // ATYP, Address
      port >> 8,
      port & 255
      // Port
    ]));
    this._socket.on("data", (data) => this._client.onSocketData({ uid: this._uid, data }));
  }
  socketFailed(errorCode) {
    const buffer = Buffer.from([
      5,
      0,
      0,
      // RSV
      ...ipToSocksAddress("0.0.0.0"),
      // ATYP, Address
      0,
      0
      // Port
    ]);
    switch (errorCode) {
      case "ENOENT":
      case "ENOTFOUND":
      case "ETIMEDOUT":
      case "EHOSTUNREACH":
        buffer[1] = 4 /* HostUnreachable */;
        break;
      case "ENETUNREACH":
        buffer[1] = 3 /* NetworkUnreachable */;
        break;
      case "ECONNREFUSED":
        buffer[1] = 5 /* ConnectionRefused */;
        break;
      case "ERULESET":
        buffer[1] = 2 /* NotAllowedByRuleSet */;
        break;
    }
    this._writeBytes(buffer);
    this._socket.end();
  }
  sendData(data) {
    this._socket.write(data);
  }
  end() {
    this._socket.end();
  }
  error(error) {
    this._socket.destroy(new Error(error));
  }
}
function hexToNumber(hex) {
  return [...hex].reduce((value, digit) => {
    const code = digit.charCodeAt(0);
    if (code >= 48 && code <= 57)
      return value + code;
    if (code >= 97 && code <= 102)
      return value + (code - 97) + 10;
    if (code >= 65 && code <= 70)
      return value + (code - 65) + 10;
    throw new Error("Invalid IPv6 token " + hex);
  }, 0);
}
function ipToSocksAddress(address) {
  if (net.isIPv4(address)) {
    return [
      1,
      // IPv4
      ...address.split(".", 4).map((t) => +t & 255)
      // Address
    ];
  }
  if (net.isIPv6(address)) {
    const result = [4];
    const tokens = address.split(":", 8);
    while (tokens.length < 8)
      tokens.unshift("");
    for (const token of tokens) {
      const value = hexToNumber(token);
      result.push(value >> 8 & 255, value & 255);
    }
    return result;
  }
  throw new Error("Only IPv4 and IPv6 addresses are supported");
}
function starMatchToRegex(pattern) {
  const source = pattern.split("*").map((s) => {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join(".*");
  return new RegExp("^" + source + "$");
}
function parsePattern(pattern) {
  if (!pattern)
    return () => false;
  const matchers = pattern.split(",").map((token) => {
    const match = token.match(/^(.*?)(?::(\d+))?$/);
    if (!match)
      throw new Error(`Unsupported token "${token}" in pattern "${pattern}"`);
    const tokenPort = match[2] ? +match[2] : void 0;
    const portMatches = (port) => tokenPort === void 0 || tokenPort === port;
    let tokenHost = match[1];
    if (tokenHost === "<loopback>") {
      return (host, port) => {
        if (!portMatches(port))
          return false;
        return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "[::1]";
      };
    }
    if (tokenHost === "*")
      return (host, port) => portMatches(port);
    if (net.isIPv4(tokenHost) || net.isIPv6(tokenHost))
      return (host, port) => host === tokenHost && portMatches(port);
    if (tokenHost[0] === ".")
      tokenHost = "*" + tokenHost;
    const tokenRegex = starMatchToRegex(tokenHost);
    return (host, port) => {
      if (!portMatches(port))
        return false;
      if (net.isIPv4(host) || net.isIPv6(host))
        return false;
      return !!host.match(tokenRegex);
    };
  });
  return (host, port) => matchers.some((matcher) => matcher(host, port));
}
class SocksProxy extends EventEmitter {
  constructor() {
    super();
    this._connections = /* @__PURE__ */ new Map();
    this._sockets = /* @__PURE__ */ new Set();
    this._closed = false;
    this._patternMatcher = () => false;
    this._directSockets = /* @__PURE__ */ new Map();
    this._server = new net.Server((socket) => {
      const uid = createGuid();
      const connection = new SocksConnection(uid, socket, this);
      this._connections.set(uid, connection);
    });
    this._server.on("connection", (socket) => {
      if (this._closed) {
        socket.destroy();
        return;
      }
      this._sockets.add(socket);
      socket.once("close", () => this._sockets.delete(socket));
    });
  }
  static {
    this.Events = {
      SocksRequested: "socksRequested",
      SocksData: "socksData",
      SocksClosed: "socksClosed"
    };
  }
  setPattern(pattern) {
    try {
      this._patternMatcher = parsePattern(pattern);
    } catch (e) {
      this._patternMatcher = () => false;
    }
  }
  async _handleDirect(request) {
    try {
      const socket = await createSocket(request.host, request.port);
      socket.on("data", (data) => this._connections.get(request.uid)?.sendData(data));
      socket.on("error", (error) => {
        this._connections.get(request.uid)?.error(error.message);
        this._directSockets.delete(request.uid);
      });
      socket.on("end", () => {
        this._connections.get(request.uid)?.end();
        this._directSockets.delete(request.uid);
      });
      const localAddress = socket.localAddress;
      const localPort = socket.localPort;
      this._directSockets.set(request.uid, socket);
      this._connections.get(request.uid)?.socketConnected(localAddress, localPort);
    } catch (error) {
      this._connections.get(request.uid)?.socketFailed(error.code);
    }
  }
  port() {
    return this._port;
  }
  async listen(port, hostname) {
    return new Promise((f) => {
      this._server.listen(port, hostname, () => {
        const port2 = this._server.address().port;
        this._port = port2;
        f(port2);
      });
    });
  }
  async close() {
    if (this._closed)
      return;
    this._closed = true;
    for (const socket of this._sockets)
      socket.destroy();
    this._sockets.clear();
    await new Promise((f) => this._server.close(f));
  }
  onSocketRequested(payload) {
    if (!this._patternMatcher(payload.host, payload.port)) {
      this._handleDirect(payload);
      return;
    }
    this.emit(SocksProxy.Events.SocksRequested, payload);
  }
  onSocketData(payload) {
    const direct = this._directSockets.get(payload.uid);
    if (direct) {
      direct.write(payload.data);
      return;
    }
    this.emit(SocksProxy.Events.SocksData, payload);
  }
  onSocketClosed(payload) {
    const direct = this._directSockets.get(payload.uid);
    if (direct) {
      direct.destroy();
      this._directSockets.delete(payload.uid);
      return;
    }
    this.emit(SocksProxy.Events.SocksClosed, payload);
  }
  socketConnected({ uid, host, port }) {
    this._connections.get(uid)?.socketConnected(host, port);
  }
  socketFailed({ uid, errorCode }) {
    this._connections.get(uid)?.socketFailed(errorCode);
  }
  sendSocketData({ uid, data }) {
    this._connections.get(uid)?.sendData(data);
  }
  sendSocketEnd({ uid }) {
    this._connections.get(uid)?.end();
  }
  sendSocketError({ uid, error }) {
    this._connections.get(uid)?.error(error);
  }
}
class SocksProxyHandler extends EventEmitter {
  constructor(pattern, redirectPortForTest) {
    super();
    this._sockets = /* @__PURE__ */ new Map();
    this._patternMatcher = () => false;
    this._patternMatcher = parsePattern(pattern);
    this._redirectPortForTest = redirectPortForTest;
  }
  static {
    this.Events = {
      SocksConnected: "socksConnected",
      SocksData: "socksData",
      SocksError: "socksError",
      SocksFailed: "socksFailed",
      SocksEnd: "socksEnd"
    };
  }
  cleanup() {
    for (const uid of this._sockets.keys())
      this.socketClosed({ uid });
  }
  async socketRequested({ uid, host, port }) {
    debugLogger.log("socks", `[${uid}] => request ${host}:${port}`);
    if (!this._patternMatcher(host, port)) {
      const payload = { uid, errorCode: "ERULESET" };
      debugLogger.log("socks", `[${uid}] <= pattern error ${payload.errorCode}`);
      this.emit(SocksProxyHandler.Events.SocksFailed, payload);
      return;
    }
    if (host === "local.playwright")
      host = "localhost";
    try {
      if (this._redirectPortForTest)
        port = this._redirectPortForTest;
      const socket = await createSocket(host, port);
      socket.on("data", (data) => {
        const payload2 = { uid, data };
        this.emit(SocksProxyHandler.Events.SocksData, payload2);
      });
      socket.on("error", (error) => {
        const payload2 = { uid, error: error.message };
        debugLogger.log("socks", `[${uid}] <= network socket error ${payload2.error}`);
        this.emit(SocksProxyHandler.Events.SocksError, payload2);
        this._sockets.delete(uid);
      });
      socket.on("end", () => {
        const payload2 = { uid };
        debugLogger.log("socks", `[${uid}] <= network socket closed`);
        this.emit(SocksProxyHandler.Events.SocksEnd, payload2);
        this._sockets.delete(uid);
      });
      const localAddress = socket.localAddress;
      const localPort = socket.localPort;
      this._sockets.set(uid, socket);
      const payload = { uid, host: localAddress, port: localPort };
      debugLogger.log("socks", `[${uid}] <= connected to network ${payload.host}:${payload.port}`);
      this.emit(SocksProxyHandler.Events.SocksConnected, payload);
    } catch (error) {
      const payload = { uid, errorCode: error.code };
      debugLogger.log("socks", `[${uid}] <= connect error ${payload.errorCode}`);
      this.emit(SocksProxyHandler.Events.SocksFailed, payload);
    }
  }
  sendSocketData({ uid, data }) {
    this._sockets.get(uid)?.write(data);
  }
  socketClosed({ uid }) {
    debugLogger.log("socks", `[${uid}] <= browser socket closed`);
    this._sockets.get(uid)?.destroy();
    this._sockets.delete(uid);
  }
}

export { SocksProxy, SocksProxyHandler, parsePattern };
