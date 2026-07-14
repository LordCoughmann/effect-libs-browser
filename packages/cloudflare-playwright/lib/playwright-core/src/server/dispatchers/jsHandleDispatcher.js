import { Dispatcher } from './dispatcher.js';
import { ElementHandleDispatcher } from './elementHandlerDispatcher.js';
import { serializeValue, parseSerializedValue } from '../../protocol/serializers.js';

class JSHandleDispatcher extends Dispatcher {
  constructor(scope, jsHandle) {
    super(scope, jsHandle, jsHandle.asElement() ? "ElementHandle" : "JSHandle", {
      preview: jsHandle.toString()
    });
    this._type_JSHandle = true;
    jsHandle._setPreviewCallback((preview) => this._dispatchEvent("previewUpdated", { preview }));
  }
  static fromJSHandle(scope, handle) {
    return scope.connection.existingDispatcher(handle) || new JSHandleDispatcher(scope, handle);
  }
  async evaluateExpression(params, progress) {
    const jsHandle = await progress.race(this._object.evaluateExpression(params.expression, { isFunction: params.isFunction }, parseArgument(params.arg)));
    return { value: serializeResult(jsHandle) };
  }
  async evaluateExpressionHandle(params, progress) {
    const jsHandle = await progress.race(this._object.evaluateExpressionHandle(params.expression, { isFunction: params.isFunction }, parseArgument(params.arg)));
    return { handle: ElementHandleDispatcher.fromJSOrElementHandle(this.parentScope(), jsHandle) };
  }
  async getProperty(params, progress) {
    const jsHandle = await progress.race(this._object.getProperty(params.name));
    return { handle: ElementHandleDispatcher.fromJSOrElementHandle(this.parentScope(), jsHandle) };
  }
  async getPropertyList(params, progress) {
    const map = await progress.race(this._object.getProperties());
    const properties = [];
    for (const [name, value] of map) {
      properties.push({ name, value: ElementHandleDispatcher.fromJSOrElementHandle(this.parentScope(), value) });
    }
    return { properties };
  }
  async jsonValue(params, progress) {
    return { value: serializeResult(await progress.race(this._object.jsonValue())) };
  }
  async dispose(_, progress) {
    progress.metadata.potentiallyClosesScope = true;
    this._object.dispose();
    this._dispose();
  }
}
function parseArgument(arg) {
  return parseSerializedValue(arg.value, arg.handles.map((a) => a._object));
}
function serializeResult(arg) {
  return serializeValue(arg, (value) => ({ fallThrough: value }));
}

export { JSHandleDispatcher, parseArgument, serializeResult };
