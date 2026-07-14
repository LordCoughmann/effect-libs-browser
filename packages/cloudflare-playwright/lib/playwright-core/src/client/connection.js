import { EventEmitter } from './eventEmitter.js';
import { AndroidDevice, AndroidSocket, Android } from './android.js';
import { Artifact } from './artifact.js';
import { Browser } from './browser.js';
import { BrowserContext } from './browserContext.js';
import { BrowserType } from './browserType.js';
import { CDPSession } from './cdpSession.js';
import { ChannelOwner } from './channelOwner.js';
import { createInstrumentation } from './clientInstrumentation.js';
import { Dialog } from './dialog.js';
import { ElectronApplication, Electron } from './electron.js';
import { ElementHandle } from './elementHandle.js';
import { parseError, TargetClosedError } from './errors.js';
import { APIRequestContext } from './fetch.js';
import { Frame } from './frame.js';
import { JSHandle } from './jsHandle.js';
import { JsonPipe } from './jsonPipe.js';
import { LocalUtils } from './localUtils.js';
import { WebSocketRoute, WebSocket, Route, Response, Request } from './network.js';
import { Page, BindingCall } from './page.js';
import { Playwright } from './playwright.js';
import { Stream } from './stream.js';
import { Tracing } from './tracing.js';
import { Worker } from './worker.js';
import { WritableStream } from './writableStream.js';
import '../protocol/validator.js';
import { rewriteErrorMessage } from '../utils/isomorphic/stackTrace.js';
import { PageAgent } from './pageAgent.js';
import { findValidator, ValidationError } from '../protocol/validatorPrimitives.js';

class Root extends ChannelOwner {
  constructor(connection) {
    super(connection, "Root", "", {});
  }
  async initialize() {
    return Playwright.from((await this._channel.initialize({
      sdkLanguage: "javascript"
    })).playwright);
  }
}
class DummyChannelOwner extends ChannelOwner {
}
class Connection extends EventEmitter {
  constructor(platform, localUtils, instrumentation, headers = []) {
    super(platform);
    this._objects = /* @__PURE__ */ new Map();
    this.onmessage = (message) => {
    };
    this._lastId = 0;
    this._callbacks = /* @__PURE__ */ new Map();
    this._isRemote = false;
    this._rawBuffers = false;
    this._tracingCount = 0;
    this._instrumentation = instrumentation || createInstrumentation();
    this._localUtils = localUtils;
    this._rootObject = new Root(this);
    this.headers = headers;
  }
  markAsRemote() {
    this._isRemote = true;
  }
  isRemote() {
    return this._isRemote;
  }
  useRawBuffers() {
    this._rawBuffers = true;
  }
  rawBuffers() {
    return this._rawBuffers;
  }
  localUtils() {
    return this._localUtils;
  }
  async initializePlaywright() {
    return await this._rootObject.initialize();
  }
  getObjectWithKnownName(guid) {
    return this._objects.get(guid);
  }
  setIsTracing(isTracing) {
    if (isTracing)
      this._tracingCount++;
    else
      this._tracingCount--;
  }
  async sendMessageToServer(object, method, params, options) {
    if (this._closedError)
      throw this._closedError;
    if (object._wasCollected)
      throw new Error("The object has been collected to prevent unbounded heap growth.");
    const guid = object._guid;
    const type = object._type;
    const id = ++this._lastId;
    const message = { id, guid, method, params };
    if (this._platform.isLogEnabled("channel")) {
      this._platform.log("channel", "SEND> " + JSON.stringify(message));
    }
    const location = options.frames?.[0] ? { file: options.frames[0].file, line: options.frames[0].line, column: options.frames[0].column } : void 0;
    const metadata = { title: options.title, location, internal: options.internal, stepId: options.stepId };
    if (this._tracingCount && options.frames && type !== "LocalUtils")
      this._localUtils?.addStackToTracingNoReply({ callData: { stack: options.frames ?? [], id } }).catch(() => {
      });
    this._platform.zones.empty.run(() => this.onmessage({ ...message, metadata }));
    return await new Promise((resolve, reject) => this._callbacks.set(id, { resolve, reject, title: options.title, type, method }));
  }
  _validatorFromWireContext() {
    return {
      tChannelImpl: this._tChannelImplFromWire.bind(this),
      binary: this._rawBuffers ? "buffer" : "fromBase64",
      isUnderTest: () => this._platform.isUnderTest()
    };
  }
  dispatch(message) {
    if (this._closedError)
      return;
    const { id, guid, method, params, result, error, log } = message;
    if (id) {
      if (this._platform.isLogEnabled("channel"))
        this._platform.log("channel", "<RECV " + JSON.stringify(message));
      const callback = this._callbacks.get(id);
      if (!callback)
        throw new Error(`Cannot find command to respond: ${id}`);
      this._callbacks.delete(id);
      if (error && !result) {
        const parsedError = parseError(error);
        rewriteErrorMessage(parsedError, parsedError.message + formatCallLog(this._platform, log));
        callback.reject(parsedError);
      } else {
        const validator2 = findValidator(callback.type, callback.method, "Result");
        callback.resolve(validator2(result, "", this._validatorFromWireContext()));
      }
      return;
    }
    if (this._platform.isLogEnabled("channel"))
      this._platform.log("channel", "<EVENT " + JSON.stringify(message));
    if (method === "__create__") {
      this._createRemoteObject(guid, params.type, params.guid, params.initializer);
      return;
    }
    const object = this._objects.get(guid);
    if (!object)
      throw new Error(`Cannot find object to "${method}": ${guid}`);
    if (method === "__adopt__") {
      const child = this._objects.get(params.guid);
      if (!child)
        throw new Error(`Unknown new child: ${params.guid}`);
      object._adopt(child);
      return;
    }
    if (method === "__dispose__") {
      object._dispose(params.reason);
      return;
    }
    const validator = findValidator(object._type, method, "Event");
    object._channel.emit(method, validator(params, "", this._validatorFromWireContext()));
  }
  close(cause) {
    if (this._closedError)
      return;
    this._closedError = new TargetClosedError(cause);
    for (const callback of this._callbacks.values())
      callback.reject(this._closedError);
    this._callbacks.clear();
    this.emit("close");
  }
  _tChannelImplFromWire(names, arg, path, context) {
    if (arg && typeof arg === "object" && typeof arg.guid === "string") {
      const object = this._objects.get(arg.guid);
      if (!object)
        throw new Error(`Object with guid ${arg.guid} was not bound in the connection`);
      if (names !== "*" && !names.includes(object._type))
        throw new ValidationError(`${path}: expected channel ${names.toString()}`);
      return object._channel;
    }
    throw new ValidationError(`${path}: expected channel ${names.toString()}`);
  }
  _createRemoteObject(parentGuid, type, guid, initializer) {
    const parent = this._objects.get(parentGuid);
    if (!parent)
      throw new Error(`Cannot find parent object ${parentGuid} to create ${guid}`);
    let result;
    const validator = findValidator(type, "", "Initializer");
    initializer = validator(initializer, "", this._validatorFromWireContext());
    switch (type) {
      case "Android":
        result = new Android(parent, type, guid, initializer);
        break;
      case "AndroidSocket":
        result = new AndroidSocket(parent, type, guid, initializer);
        break;
      case "AndroidDevice":
        result = new AndroidDevice(parent, type, guid, initializer);
        break;
      case "APIRequestContext":
        result = new APIRequestContext(parent, type, guid, initializer);
        break;
      case "Artifact":
        result = new Artifact(parent, type, guid, initializer);
        break;
      case "BindingCall":
        result = new BindingCall(parent, type, guid, initializer);
        break;
      case "Browser":
        result = new Browser(parent, type, guid, initializer);
        break;
      case "BrowserContext":
        result = new BrowserContext(parent, type, guid, initializer);
        break;
      case "BrowserType":
        result = new BrowserType(parent, type, guid, initializer);
        break;
      case "CDPSession":
        result = new CDPSession(parent, type, guid, initializer);
        break;
      case "Dialog":
        result = new Dialog(parent, type, guid, initializer);
        break;
      case "Electron":
        result = new Electron(parent, type, guid, initializer);
        break;
      case "ElectronApplication":
        result = new ElectronApplication(parent, type, guid, initializer);
        break;
      case "ElementHandle":
        result = new ElementHandle(parent, type, guid, initializer);
        break;
      case "Frame":
        result = new Frame(parent, type, guid, initializer);
        break;
      case "JSHandle":
        result = new JSHandle(parent, type, guid, initializer);
        break;
      case "JsonPipe":
        result = new JsonPipe(parent, type, guid, initializer);
        break;
      case "LocalUtils":
        result = new LocalUtils(parent, type, guid, initializer);
        if (!this._localUtils)
          this._localUtils = result;
        break;
      case "Page":
        result = new Page(parent, type, guid, initializer);
        break;
      case "PageAgent":
        result = new PageAgent(parent, type, guid, initializer);
        break;
      case "Playwright":
        result = new Playwright(parent, type, guid, initializer);
        break;
      case "Request":
        result = new Request(parent, type, guid, initializer);
        break;
      case "Response":
        result = new Response(parent, type, guid, initializer);
        break;
      case "Route":
        result = new Route(parent, type, guid, initializer);
        break;
      case "Stream":
        result = new Stream(parent, type, guid, initializer);
        break;
      case "SocksSupport":
        result = new DummyChannelOwner(parent, type, guid, initializer);
        break;
      case "Tracing":
        result = new Tracing(parent, type, guid, initializer);
        break;
      case "WebSocket":
        result = new WebSocket(parent, type, guid, initializer);
        break;
      case "WebSocketRoute":
        result = new WebSocketRoute(parent, type, guid, initializer);
        break;
      case "Worker":
        result = new Worker(parent, type, guid, initializer);
        break;
      case "WritableStream":
        result = new WritableStream(parent, type, guid, initializer);
        break;
      default:
        throw new Error("Missing type " + type);
    }
    return result;
  }
}
function formatCallLog(platform, log) {
  if (!log || !log.some((l) => !!l))
    return "";
  return `
Call log:
${platform.colors.dim(log.join("\n"))}
`;
}

export { Connection };
