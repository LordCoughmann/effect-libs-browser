import { BrowserContextDispatcher } from './browserContextDispatcher.js';
import { Dispatcher } from './dispatcher.js';
import { JSHandleDispatcher, serializeResult, parseArgument } from './jsHandleDispatcher.js';
import { ElectronApplication } from '../electron/electron.js';

class ElectronDispatcher extends Dispatcher {
  constructor(scope, electron, denyLaunch) {
    super(scope, electron, "Electron", {});
    this._type_Electron = true;
    this._denyLaunch = denyLaunch;
  }
  async launch(params, progress) {
    if (this._denyLaunch)
      throw new Error(`Launching more browsers is not allowed.`);
    const electronApplication = await this._object.launch(progress, params);
    return { electronApplication: new ElectronApplicationDispatcher(this, electronApplication) };
  }
}
class ElectronApplicationDispatcher extends Dispatcher {
  constructor(scope, electronApplication) {
    super(scope, electronApplication, "ElectronApplication", {
      context: BrowserContextDispatcher.from(scope, electronApplication.context())
    });
    this._type_EventTarget = true;
    this._type_ElectronApplication = true;
    this._subscriptions = /* @__PURE__ */ new Set();
    this.addObjectListener(ElectronApplication.Events.Close, () => {
      this._dispatchEvent("close");
      this._dispose();
    });
    this.addObjectListener(ElectronApplication.Events.Console, (message) => {
      if (!this._subscriptions.has("console"))
        return;
      this._dispatchEvent("console", {
        type: message.type(),
        text: message.text(),
        args: message.args().map((a) => JSHandleDispatcher.fromJSHandle(this, a)),
        location: message.location()
      });
    });
  }
  async browserWindow(params, progress) {
    const handle = await progress.race(this._object.browserWindow(params.page.page()));
    return { handle: JSHandleDispatcher.fromJSHandle(this, handle) };
  }
  async evaluateExpression(params, progress) {
    const handle = await progress.race(this._object._nodeElectronHandlePromise);
    return { value: serializeResult(await progress.race(handle.evaluateExpression(params.expression, { isFunction: params.isFunction }, parseArgument(params.arg)))) };
  }
  async evaluateExpressionHandle(params, progress) {
    const handle = await progress.race(this._object._nodeElectronHandlePromise);
    const result = await progress.race(handle.evaluateExpressionHandle(params.expression, { isFunction: params.isFunction }, parseArgument(params.arg)));
    return { handle: JSHandleDispatcher.fromJSHandle(this, result) };
  }
  async updateSubscription(params, progress) {
    if (params.enabled)
      this._subscriptions.add(params.event);
    else
      this._subscriptions.delete(params.event);
  }
}

export { ElectronApplicationDispatcher, ElectronDispatcher };
