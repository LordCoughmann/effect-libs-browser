import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import '../utils/debug.js';
import '../utils/debugLogger.js';
import { eventsHelper } from '../utils/eventsHelper.js';
import '../utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../../zipBundle.js';
import '../utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../utils/happyEyeballs.js';
import '../utils/nodePlatform.js';
import '../utils/profiler.js';
import '../utils/socksProxy.js';
import 'node:os';
import '../utils/zones.js';
import { DebugController } from '../debugController.js';
import { Dispatcher } from './dispatcher.js';

class DebugControllerDispatcher extends Dispatcher {
  constructor(connection, debugController) {
    super(connection, debugController, "DebugController", {});
    this._type_DebugController = true;
    this._listeners = [
      eventsHelper.addEventListener(this._object, DebugController.Events.StateChanged, (params) => {
        this._dispatchEvent("stateChanged", params);
      }),
      eventsHelper.addEventListener(this._object, DebugController.Events.InspectRequested, ({ selector, locator, ariaSnapshot }) => {
        this._dispatchEvent("inspectRequested", { selector, locator, ariaSnapshot });
      }),
      eventsHelper.addEventListener(this._object, DebugController.Events.SourceChanged, ({ text, header, footer, actions }) => {
        this._dispatchEvent("sourceChanged", { text, header, footer, actions });
      }),
      eventsHelper.addEventListener(this._object, DebugController.Events.Paused, ({ paused }) => {
        this._dispatchEvent("paused", { paused });
      }),
      eventsHelper.addEventListener(this._object, DebugController.Events.SetModeRequested, ({ mode }) => {
        this._dispatchEvent("setModeRequested", { mode });
      })
    ];
  }
  async initialize(params, progress) {
    this._object.initialize(params.codegenId, params.sdkLanguage);
  }
  async setReportStateChanged(params, progress) {
    this._object.setReportStateChanged(params.enabled);
  }
  async setRecorderMode(params, progress) {
    await this._object.setRecorderMode(progress, params);
  }
  async highlight(params, progress) {
    await this._object.highlight(progress, params);
  }
  async hideHighlight(params, progress) {
    await this._object.hideHighlight(progress);
  }
  async resume(params, progress) {
    await this._object.resume(progress);
  }
  async kill(params, progress) {
    this._object.kill();
  }
  _onDispose() {
    eventsHelper.removeEventListeners(this._listeners);
    this._object.dispose();
  }
}

export { DebugControllerDispatcher };
