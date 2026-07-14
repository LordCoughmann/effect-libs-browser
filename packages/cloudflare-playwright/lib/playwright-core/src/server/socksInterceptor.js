import EventEmitter from 'node:events';
import { SocksProxyHandler } from './utils/socksProxy.js';
import '../protocol/validator.js';
import { isUnderTest } from './utils/debug.js';
import { findValidator, ValidationError } from '../protocol/validatorPrimitives.js';

class SocksInterceptor {
  constructor(transport, pattern, redirectPortForTest) {
    this._ids = /* @__PURE__ */ new Set();
    this._handler = new SocksProxyHandler(pattern, redirectPortForTest);
    let lastId = -1;
    this._channel = new Proxy(new EventEmitter(), {
      get: (obj, prop) => {
        if (prop in obj || obj[prop] !== void 0 || typeof prop !== "string")
          return obj[prop];
        return (params) => {
          try {
            const id = --lastId;
            this._ids.add(id);
            const validator = findValidator("SocksSupport", prop, "Params");
            params = validator(params, "", { tChannelImpl: tChannelForSocks, binary: "toBase64", isUnderTest });
            transport.send({ id, guid: this._socksSupportObjectGuid, method: prop, params, metadata: { stack: [], apiName: "", internal: true } });
          } catch (e) {
          }
        };
      }
    });
    this._handler.on(SocksProxyHandler.Events.SocksConnected, (payload) => this._channel.socksConnected(payload));
    this._handler.on(SocksProxyHandler.Events.SocksData, (payload) => this._channel.socksData(payload));
    this._handler.on(SocksProxyHandler.Events.SocksError, (payload) => this._channel.socksError(payload));
    this._handler.on(SocksProxyHandler.Events.SocksFailed, (payload) => this._channel.socksFailed(payload));
    this._handler.on(SocksProxyHandler.Events.SocksEnd, (payload) => this._channel.socksEnd(payload));
    this._channel.on("socksRequested", (payload) => this._handler.socketRequested(payload));
    this._channel.on("socksClosed", (payload) => this._handler.socketClosed(payload));
    this._channel.on("socksData", (payload) => this._handler.sendSocketData(payload));
  }
  cleanup() {
    this._handler.cleanup();
  }
  interceptMessage(message) {
    if (this._ids.has(message.id)) {
      this._ids.delete(message.id);
      return true;
    }
    if (message.method === "__create__" && message.params.type === "SocksSupport") {
      this._socksSupportObjectGuid = message.params.guid;
      return false;
    }
    if (this._socksSupportObjectGuid && message.guid === this._socksSupportObjectGuid) {
      const validator = findValidator("SocksSupport", message.method, "Event");
      const params = validator(message.params, "", { tChannelImpl: tChannelForSocks, binary: "fromBase64", isUnderTest });
      this._channel.emit(message.method, params);
      return true;
    }
    return false;
  }
}
function tChannelForSocks(names, arg, path, context) {
  throw new ValidationError(`${path}: channels are not expected in SocksSupport`);
}

export { SocksInterceptor };
