import { EventEmitter } from './eventEmitter.js';
import '../protocol/validator.js';
import { methodMetainfo } from '../utils/isomorphic/protocolMetainfo.js';
import { captureLibraryStackTrace } from './clientStackTrace.js';
import { stringifyStackFrames } from '../utils/isomorphic/stackTrace.js';
import { apiCallZone } from '../../../cloudflare/apiCallZone.js';
import { maybeFindValidator, ValidationError } from '../protocol/validatorPrimitives.js';

class ChannelOwner extends EventEmitter {
  constructor(parent, type, guid, initializer) {
    const connection = parent instanceof ChannelOwner ? parent._connection : parent;
    super(connection._platform);
    this._objects = /* @__PURE__ */ new Map();
    this._eventToSubscriptionMapping = /* @__PURE__ */ new Map();
    this._wasCollected = false;
    this.setMaxListeners(0);
    this._connection = connection;
    this._type = type;
    this._guid = guid;
    this._parent = parent instanceof ChannelOwner ? parent : void 0;
    this._instrumentation = this._connection._instrumentation;
    this._connection._objects.set(guid, this);
    if (this._parent) {
      this._parent._objects.set(guid, this);
      this._logger = this._parent._logger;
    }
    this._channel = this._createChannel(new EventEmitter(connection._platform));
    this._initializer = initializer;
  }
  _setEventToSubscriptionMapping(mapping) {
    this._eventToSubscriptionMapping = mapping;
  }
  _updateSubscription(event, enabled) {
    const protocolEvent = this._eventToSubscriptionMapping.get(String(event));
    if (protocolEvent)
      this._channel.updateSubscription({ event: protocolEvent, enabled }).catch(() => {
      });
  }
  on(event, listener) {
    if (!this.listenerCount(event))
      this._updateSubscription(event, true);
    super.on(event, listener);
    return this;
  }
  addListener(event, listener) {
    if (!this.listenerCount(event))
      this._updateSubscription(event, true);
    super.addListener(event, listener);
    return this;
  }
  prependListener(event, listener) {
    if (!this.listenerCount(event))
      this._updateSubscription(event, true);
    super.prependListener(event, listener);
    return this;
  }
  off(event, listener) {
    super.off(event, listener);
    if (!this.listenerCount(event))
      this._updateSubscription(event, false);
    return this;
  }
  removeListener(event, listener) {
    super.removeListener(event, listener);
    if (!this.listenerCount(event))
      this._updateSubscription(event, false);
    return this;
  }
  _adopt(child) {
    child._parent._objects.delete(child._guid);
    this._objects.set(child._guid, child);
    child._parent = this;
  }
  _dispose(reason) {
    if (this._parent)
      this._parent._objects.delete(this._guid);
    this._connection._objects.delete(this._guid);
    this._wasCollected = reason === "gc";
    for (const object of [...this._objects.values()])
      object._dispose(reason);
    this._objects.clear();
  }
  _debugScopeState() {
    return {
      _guid: this._guid,
      objects: Array.from(this._objects.values()).map((o) => o._debugScopeState())
    };
  }
  _validatorToWireContext() {
    return {
      tChannelImpl: tChannelImplToWire,
      binary: this._connection.rawBuffers() ? "buffer" : "toBase64",
      isUnderTest: () => this._platform.isUnderTest()
    };
  }
  _createChannel(base) {
    const channel = new Proxy(base, {
      get: (obj, prop) => {
        if (typeof prop === "string") {
          const validator = maybeFindValidator(this._type, prop, "Params");
          const { internal } = methodMetainfo.get(this._type + "." + prop) || {};
          if (validator) {
            return async (params) => {
              return await this._wrapApiCall(async (apiZone) => {
                const validatedParams = validator(params, "", this._validatorToWireContext());
                if (!apiZone.internal && !apiZone.reported) {
                  apiZone.reported = true;
                  this._instrumentation.onApiCallBegin(apiZone, { type: this._type, method: prop, params });
                  logApiCall(this._platform, this._logger, `=> ${apiZone.apiName} started`);
                  return await this._connection.sendMessageToServer(this, prop, validatedParams, apiZone);
                }
                return await this._connection.sendMessageToServer(this, prop, validatedParams, { internal: true });
              }, { internal });
            };
          }
        }
        return obj[prop];
      }
    });
    channel._object = this;
    return channel;
  }
  async _wrapApiCall(func, options) {
    const logger = this._logger;
    const existingApiZone = this._platform.zones.current().data();
    if (existingApiZone)
      return await func(existingApiZone);
    const apiCall = apiCallZone.getStore();
    const stackTrace = captureLibraryStackTrace(this._platform);
    const apiZone = { title: options?.title, apiName: apiCall?.apiName ?? stackTrace.apiName, frames: stackTrace.frames, internal: options?.internal ?? false, reported: false, userData: void 0, stepId: void 0 };
    try {
      const result = await this._platform.zones.current().push(apiZone).run(async () => await func(apiZone));
      if (!options?.internal) {
        logApiCall(this._platform, logger, `<= ${apiZone.apiName} succeeded`);
        this._instrumentation.onApiCallEnd(apiZone);
      }
      return result;
    } catch (e) {
      const innerError = (this._platform.showInternalStackFrames() || this._platform.isUnderTest()) && e.stack ? "\n<inner error>\n" + e.stack : "";
      if (apiZone.apiName && !apiZone.apiName.includes("<anonymous>"))
        e.message = apiZone.apiName + ": " + e.message;
      const stackFrames = "\n" + stringifyStackFrames(stackTrace.frames).join("\n") + innerError;
      if (stackFrames.trim())
        e.stack = e.message + stackFrames;
      else
        e.stack = "";
      if (!options?.internal) {
        apiZone.error = e;
        logApiCall(this._platform, logger, `<= ${apiZone.apiName} failed`);
        this._instrumentation.onApiCallEnd(apiZone);
      }
      throw e;
    }
  }
  toJSON() {
    return {
      _type: this._type,
      _guid: this._guid
    };
  }
}
function logApiCall(platform, logger, message) {
  if (logger && logger.isEnabled("api", "info"))
    logger.log("api", "info", message, [], { color: "cyan" });
  platform.log("api", message);
}
function tChannelImplToWire(names, arg, path, context) {
  if (arg._object instanceof ChannelOwner && (names === "*" || names.includes(arg._object._type)))
    return { guid: arg._object._guid };
  throw new ValidationError(`${path}: expected channel ${names.toString()}`);
}

export { ChannelOwner };
