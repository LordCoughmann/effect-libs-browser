import { EventEmitter } from 'node:events';
import { methodMetainfo } from '../utils/isomorphic/protocolMetainfo.js';
import { monotonicTime } from '../utils/isomorphic/time.js';
import '../../../_virtual/pixelmatch.js';
import '../utilsBundle.js';
import 'node:crypto';
import { debugMode, isUnderTest } from './utils/debug.js';
import './utils/debugLogger.js';
import './utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../zipBundle.js';
import './utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import './utils/happyEyeballs.js';
import './utils/nodePlatform.js';
import './utils/profiler.js';
import './utils/socksProxy.js';
import 'node:os';
import './utils/zones.js';
import { BrowserContext } from './browserContext.js';

const symbol = Symbol("Debugger");
class Debugger extends EventEmitter {
  constructor(context) {
    super();
    this._pauseOnNextStatement = false;
    this._pausedCallsMetadata = /* @__PURE__ */ new Map();
    this._muted = false;
    this._context = context;
    this._context[symbol] = this;
    this._enabled = debugMode() === "inspector";
    if (this._enabled)
      this.pauseOnNextStatement();
    context.instrumentation.addListener(this, context);
    this._context.once(BrowserContext.Events.Close, () => {
      this._context.instrumentation.removeListener(this);
    });
  }
  static {
    this.Events = {
      PausedStateChanged: "pausedstatechanged"
    };
  }
  async setMuted(muted) {
    this._muted = muted;
  }
  async onBeforeCall(sdkObject, metadata) {
    if (this._muted)
      return;
    if (shouldPauseOnCall(sdkObject, metadata) || this._pauseOnNextStatement && shouldPauseBeforeStep(metadata))
      await this.pause(sdkObject, metadata);
  }
  async onBeforeInputAction(sdkObject, metadata) {
    if (this._muted)
      return;
    if (this._enabled && this._pauseOnNextStatement)
      await this.pause(sdkObject, metadata);
  }
  async pause(sdkObject, metadata) {
    if (this._muted)
      return;
    this._enabled = true;
    metadata.pauseStartTime = monotonicTime();
    const result = new Promise((resolve) => {
      this._pausedCallsMetadata.set(metadata, { resolve, sdkObject });
    });
    this.emit(Debugger.Events.PausedStateChanged);
    return result;
  }
  resume(step) {
    if (!this.isPaused())
      return;
    this._pauseOnNextStatement = step;
    const endTime = monotonicTime();
    for (const [metadata, { resolve }] of this._pausedCallsMetadata) {
      metadata.pauseEndTime = endTime;
      resolve();
    }
    this._pausedCallsMetadata.clear();
    this.emit(Debugger.Events.PausedStateChanged);
  }
  pauseOnNextStatement() {
    this._pauseOnNextStatement = true;
  }
  isPaused(metadata) {
    if (metadata)
      return this._pausedCallsMetadata.has(metadata);
    return !!this._pausedCallsMetadata.size;
  }
  pausedDetails() {
    const result = [];
    for (const [metadata, { sdkObject }] of this._pausedCallsMetadata)
      result.push({ metadata, sdkObject });
    return result;
  }
}
function shouldPauseOnCall(sdkObject, metadata) {
  if (sdkObject.attribution.playwright.options.isServer)
    return false;
  if (!sdkObject.attribution.browser?.options.headful && !isUnderTest())
    return false;
  return metadata.method === "pause";
}
function shouldPauseBeforeStep(metadata) {
  if (metadata.internal)
    return false;
  const metainfo = methodMetainfo.get(metadata.type + "." + metadata.method);
  return !!metainfo?.pausesBeforeAction;
}

export { Debugger };
