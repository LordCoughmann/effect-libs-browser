import { assert } from '../../utils/isomorphic/assert.js';
import { getExceptionMessage, releaseObject } from './crProtocolHelper.js';
import { rewriteErrorMessage } from '../../utils/isomorphic/stackTrace.js';
import { parseEvaluationResultValue } from '../../utils/isomorphic/utilityScriptSerializers.js';
import { JavaScriptErrorInEvaluate, JSHandle, isJavaScriptErrorInEvaluate, sparseArrayToString, parseUnserializableValue } from '../javascript.js';
import { FrameExecutionContext, ElementHandle } from '../dom.js';
import { isSessionClosedError } from '../protocolError.js';

class CRExecutionContext {
  constructor(client, contextPayload) {
    this._client = client;
    this._contextId = contextPayload.id;
  }
  async rawEvaluateJSON(expression) {
    const { exceptionDetails, result: remoteObject } = await this._client.send("Runtime.evaluate", {
      expression,
      contextId: this._contextId,
      returnByValue: true
    }).catch(rewriteError);
    if (exceptionDetails)
      throw new JavaScriptErrorInEvaluate(getExceptionMessage(exceptionDetails));
    return remoteObject.value;
  }
  async rawEvaluateHandle(context, expression) {
    const { exceptionDetails, result: remoteObject } = await this._client.send("Runtime.evaluate", {
      expression,
      contextId: this._contextId
    }).catch(rewriteError);
    if (exceptionDetails)
      throw new JavaScriptErrorInEvaluate(getExceptionMessage(exceptionDetails));
    return createHandle(context, remoteObject);
  }
  async evaluateWithArguments(expression, returnByValue, utilityScript, values, handles) {
    const { exceptionDetails, result: remoteObject } = await this._client.send("Runtime.callFunctionOn", {
      functionDeclaration: expression,
      objectId: utilityScript._objectId,
      arguments: [
        { objectId: utilityScript._objectId },
        ...values.map((value) => ({ value })),
        ...handles.map((handle) => ({ objectId: handle._objectId }))
      ],
      returnByValue,
      awaitPromise: true,
      userGesture: true
    }).catch(rewriteError);
    if (exceptionDetails)
      throw new JavaScriptErrorInEvaluate(getExceptionMessage(exceptionDetails));
    return returnByValue ? parseEvaluationResultValue(remoteObject.value) : createHandle(utilityScript._context, remoteObject);
  }
  async getProperties(object) {
    const response = await this._client.send("Runtime.getProperties", {
      objectId: object._objectId,
      ownProperties: true
    });
    const result = /* @__PURE__ */ new Map();
    for (const property of response.result) {
      if (!property.enumerable || !property.value)
        continue;
      result.set(property.name, createHandle(object._context, property.value));
    }
    return result;
  }
  async releaseHandle(handle) {
    if (!handle._objectId)
      return;
    await releaseObject(this._client, handle._objectId);
  }
}
function rewriteError(error) {
  if (error.message.includes("Object reference chain is too long"))
    throw new Error("Cannot serialize result: object reference chain is too long.");
  if (error.message.includes("Object couldn't be returned by value"))
    return { result: { type: "undefined" } };
  if (error instanceof TypeError && error.message.startsWith("Converting circular structure to JSON"))
    rewriteErrorMessage(error, error.message + " Are you passing a nested JSHandle?");
  if (!isJavaScriptErrorInEvaluate(error) && !isSessionClosedError(error))
    throw new Error("Execution context was destroyed, most likely because of a navigation.");
  throw error;
}
function potentiallyUnserializableValue(remoteObject) {
  const value = remoteObject.value;
  const unserializableValue = remoteObject.unserializableValue;
  return unserializableValue ? parseUnserializableValue(unserializableValue) : value;
}
function renderPreview(object) {
  if (object.type === "undefined")
    return "undefined";
  if ("value" in object)
    return String(object.value);
  if (object.unserializableValue)
    return String(object.unserializableValue);
  if (object.description === "Object" && object.preview) {
    const tokens = [];
    for (const { name, value } of object.preview.properties)
      tokens.push(`${name}: ${value}`);
    return `{${tokens.join(", ")}}`;
  }
  if (object.subtype === "array" && object.preview)
    return sparseArrayToString(object.preview.properties);
  return object.description;
}
function createHandle(context, remoteObject) {
  if (remoteObject.subtype === "node") {
    assert(context instanceof FrameExecutionContext);
    return new ElementHandle(context, remoteObject.objectId);
  }
  return new JSHandle(context, remoteObject.subtype || remoteObject.type, renderPreview(remoteObject), remoteObject.objectId, potentiallyUnserializableValue(remoteObject));
}

export { CRExecutionContext, createHandle };
