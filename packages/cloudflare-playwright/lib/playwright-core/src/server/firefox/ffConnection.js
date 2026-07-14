import { EventEmitter } from 'node:events';
import { debugLogger } from '../utils/debugLogger.js';
import { helper } from '../helper.js';
import { ProtocolError } from '../protocolError.js';

const ConnectionEvents = {
  Disconnected: Symbol("Disconnected")
};
const kBrowserCloseMessageId = -9999;
class FFConnection extends EventEmitter {
  constructor(transport, protocolLogger, browserLogsCollector) {
    super();
    this.setMaxListeners(0);
    this._transport = transport;
    this._protocolLogger = protocolLogger;
    this._browserLogsCollector = browserLogsCollector;
    this._lastId = 0;
    this._sessions = /* @__PURE__ */ new Map();
    this._closed = false;
    this.rootSession = new FFSession(this, "", (message) => this._rawSend(message));
    this._sessions.set("", this.rootSession);
    this._transport.onmessage = this._onMessage.bind(this);
    this._transport.onclose = this._onClose.bind(this);
  }
  nextMessageId() {
    return ++this._lastId;
  }
  _rawSend(message) {
    this._protocolLogger("send", message);
    this._transport.send(message);
  }
  async _onMessage(message) {
    this._protocolLogger("receive", message);
    if (message.id === kBrowserCloseMessageId)
      return;
    const session = this._sessions.get(message.sessionId || "");
    if (session)
      session.dispatchMessage(message);
  }
  _onClose(reason) {
    this._closed = true;
    this._transport.onmessage = void 0;
    this._transport.onclose = void 0;
    this._browserDisconnectedLogs = helper.formatBrowserLogs(this._browserLogsCollector.recentLogs(), reason);
    this.rootSession.dispose();
    Promise.resolve().then(() => this.emit(ConnectionEvents.Disconnected));
  }
  close() {
    if (!this._closed)
      this._transport.close();
  }
  createSession(sessionId) {
    const session = new FFSession(this, sessionId, (message) => this._rawSend({ ...message, sessionId }));
    this._sessions.set(sessionId, session);
    return session;
  }
}
class FFSession extends EventEmitter {
  constructor(connection, sessionId, rawSend) {
    super();
    this._disposed = false;
    this._crashed = false;
    this.setMaxListeners(0);
    this._callbacks = /* @__PURE__ */ new Map();
    this._connection = connection;
    this._sessionId = sessionId;
    this._rawSend = rawSend;
  }
  markAsCrashed() {
    this._crashed = true;
  }
  async send(method, params) {
    if (this._crashed || this._disposed || this._connection._closed || this._connection._browserDisconnectedLogs)
      throw new ProtocolError(this._crashed ? "crashed" : "closed", void 0, this._connection._browserDisconnectedLogs);
    const id = this._connection.nextMessageId();
    this._rawSend({ method, params, id });
    return new Promise((resolve, reject) => {
      this._callbacks.set(id, { resolve, reject, error: new ProtocolError("error", method) });
    });
  }
  sendMayFail(method, params) {
    return this.send(method, params).catch((error) => debugLogger.log("error", error));
  }
  dispatchMessage(object) {
    if (object.id) {
      const callback = this._callbacks.get(object.id);
      if (callback) {
        this._callbacks.delete(object.id);
        if (object.error) {
          callback.error.setMessage(object.error.message);
          callback.reject(callback.error);
        } else {
          callback.resolve(object.result);
        }
      }
    } else {
      Promise.resolve().then(() => this.emit(object.method, object.params));
    }
  }
  dispose() {
    this._disposed = true;
    this._connection._sessions.delete(this._sessionId);
    for (const callback of this._callbacks.values()) {
      callback.error.type = this._crashed ? "crashed" : "closed";
      callback.error.logs = this._connection._browserDisconnectedLogs;
      callback.reject(callback.error);
    }
    this._callbacks.clear();
  }
}

export { ConnectionEvents, FFConnection, FFSession, kBrowserCloseMessageId };
