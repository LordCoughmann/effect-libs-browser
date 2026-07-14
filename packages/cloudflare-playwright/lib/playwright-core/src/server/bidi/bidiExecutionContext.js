import { assert } from '../../utils/isomorphic/assert.js';
import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import '../utils/debug.js';
import '../utils/debugLogger.js';
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
import { parseEvaluationResultValue } from '../../utils/isomorphic/utilityScriptSerializers.js';
import { JavaScriptErrorInEvaluate, JSHandle } from '../javascript.js';
import { FrameExecutionContext, ElementHandle } from '../dom.js';
import { Script } from './third_party/bidiProtocolCore.js';
import './third_party/bidiProtocolPermissions.js';
import { BidiSerializer } from './third_party/bidiSerializer.js';
import { deserializeBidiValue } from './bidiDeserializer.js';

class BidiExecutionContext {
  constructor(session, realmInfo) {
    this._session = session;
    if (realmInfo.type === "window") {
      this._target = {
        context: realmInfo.context,
        sandbox: realmInfo.sandbox
      };
    } else {
      this._target = {
        realm: realmInfo.realm
      };
    }
  }
  async rawEvaluateJSON(expression) {
    const response = await this._session.send("script.evaluate", {
      expression,
      target: this._target,
      serializationOptions: {
        maxObjectDepth: 10,
        maxDomDepth: 10
      },
      awaitPromise: true,
      userActivation: true
    });
    if (response.type === "success")
      return deserializeBidiValue(response.result);
    if (response.type === "exception")
      throw new JavaScriptErrorInEvaluate(response.exceptionDetails.text);
    throw new JavaScriptErrorInEvaluate("Unexpected response type: " + JSON.stringify(response));
  }
  async rawEvaluateHandle(context, expression) {
    const response = await this._session.send("script.evaluate", {
      expression,
      target: this._target,
      resultOwnership: Script.ResultOwnership.Root,
      // Necessary for the handle to be returned.
      serializationOptions: { maxObjectDepth: 0, maxDomDepth: 0 },
      awaitPromise: true,
      userActivation: true
    });
    if (response.type === "success") {
      if ("handle" in response.result)
        return createHandle(context, response.result);
      throw new JavaScriptErrorInEvaluate("Cannot get handle: " + JSON.stringify(response.result));
    }
    if (response.type === "exception")
      throw new JavaScriptErrorInEvaluate(response.exceptionDetails.text);
    throw new JavaScriptErrorInEvaluate("Unexpected response type: " + JSON.stringify(response));
  }
  async evaluateWithArguments(functionDeclaration, returnByValue, utilityScript, values, handles) {
    const response = await this._session.send("script.callFunction", {
      functionDeclaration,
      target: this._target,
      arguments: [
        { handle: utilityScript._objectId },
        ...values.map(BidiSerializer.serialize),
        ...handles.map((handle) => ({ handle: handle._objectId }))
      ],
      resultOwnership: returnByValue ? void 0 : Script.ResultOwnership.Root,
      // Necessary for the handle to be returned.
      serializationOptions: returnByValue ? {} : { maxObjectDepth: 0, maxDomDepth: 0 },
      awaitPromise: true,
      userActivation: true
    });
    if (response.type === "exception")
      throw new JavaScriptErrorInEvaluate(response.exceptionDetails.text);
    if (response.type === "success") {
      if (returnByValue)
        return parseEvaluationResultValue(deserializeBidiValue(response.result));
      return createHandle(utilityScript._context, response.result);
    }
    throw new JavaScriptErrorInEvaluate("Unexpected response type: " + JSON.stringify(response));
  }
  async getProperties(handle) {
    const names = await handle.evaluate((object) => {
      const names2 = [];
      const descriptors = Object.getOwnPropertyDescriptors(object);
      for (const name in descriptors) {
        if (descriptors[name]?.enumerable)
          names2.push(name);
      }
      return names2;
    });
    const values = await Promise.all(names.map(async (name) => {
      const value = await this._rawCallFunction("(object, name) => object[name]", [{ handle: handle._objectId }, { type: "string", value: name }], true, false);
      return createHandle(handle._context, value);
    }));
    const map = /* @__PURE__ */ new Map();
    for (let i = 0; i < names.length; i++)
      map.set(names[i], values[i]);
    return map;
  }
  async releaseHandle(handle) {
    if (!handle._objectId)
      return;
    await this._session.send("script.disown", {
      target: this._target,
      handles: [handle._objectId]
    });
  }
  async nodeIdForElementHandle(handle) {
    const shared = await this._remoteValueForReference({ handle: handle._objectId });
    if (!("sharedId" in shared))
      throw new Error("Element is not a node");
    return {
      sharedId: shared.sharedId
    };
  }
  async remoteObjectForNodeId(context, nodeId) {
    const result = await this._remoteValueForReference(nodeId, true);
    if (!("handle" in result))
      throw new Error("Can't get remote object for nodeId");
    return createHandle(context, result);
  }
  async contentFrameIdForFrame(handle) {
    const contentWindow = await this._rawCallFunction("e => e.contentWindow", [{ handle: handle._objectId }]);
    if (contentWindow?.type === "window")
      return contentWindow.value.context;
    return null;
  }
  async frameIdForWindowHandle(handle) {
    if (!handle._objectId)
      throw new Error("JSHandle is not a DOM node handle");
    const contentWindow = await this._remoteValueForReference({ handle: handle._objectId });
    if (contentWindow.type === "window")
      return contentWindow.value.context;
    return null;
  }
  async _remoteValueForReference(reference, createHandle2) {
    return await this._rawCallFunction("e => e", [reference], createHandle2);
  }
  async _rawCallFunction(functionDeclaration, args, createHandle2, awaitPromise = true) {
    const response = await this._session.send("script.callFunction", {
      functionDeclaration,
      target: this._target,
      arguments: args,
      // "Root" is necessary for the handle to be returned.
      resultOwnership: createHandle2 ? Script.ResultOwnership.Root : Script.ResultOwnership.None,
      serializationOptions: { maxObjectDepth: 0, maxDomDepth: 0 },
      awaitPromise,
      userActivation: true
    });
    if (response.type === "exception")
      throw new JavaScriptErrorInEvaluate(response.exceptionDetails.text);
    if (response.type === "success")
      return response.result;
    throw new JavaScriptErrorInEvaluate("Unexpected response type: " + JSON.stringify(response));
  }
}
function renderPreview(remoteObject, nested = false) {
  switch (remoteObject.type) {
    case "undefined":
    case "null":
      return remoteObject.type;
    case "number":
    case "boolean":
    case "string":
      return String(remoteObject.value);
    case "bigint":
      return `${remoteObject.value}n`;
    case "date":
      return String(new Date(remoteObject.value));
    case "regexp":
      return String(new RegExp(remoteObject.value.pattern, remoteObject.value.flags));
    case "node":
      return remoteObject.value?.localName || "Node";
    case "object":
      if (nested)
        return "Object";
      const tokens = [];
      for (const [name, value] of remoteObject.value || []) {
        if (typeof name === "string")
          tokens.push(`${name}: ${renderPreview(value, true)}`);
      }
      return `{${tokens.join(", ")}}`;
    case "array":
    case "htmlcollection":
    case "nodelist":
      if (nested || !remoteObject.value)
        return remoteObject.value ? `Array(${remoteObject.value.length})` : "Array";
      return `[${remoteObject.value.map((v) => renderPreview(v, true)).join(", ")}]`;
    case "map":
      return remoteObject.value ? `Map(${remoteObject.value.length})` : "Map";
    case "set":
      return remoteObject.value ? `Set(${remoteObject.value.length})` : "Set";
    case "arraybuffer":
      return "ArrayBuffer";
    case "error":
      return "Error";
    case "function":
      return "Function";
    case "generator":
      return "Generator";
    case "promise":
      return "Promise";
    case "proxy":
      return "Proxy";
    case "symbol":
      return "Symbol()";
    case "typedarray":
      return "TypedArray";
    case "weakmap":
      return "WeakMap";
    case "weakset":
      return "WeakSet";
    case "window":
      return "Window";
  }
}
function createHandle(context, remoteObject) {
  if (remoteObject.type === "node") {
    assert(context instanceof FrameExecutionContext);
    return new ElementHandle(context, remoteObject.handle);
  }
  const objectId = "handle" in remoteObject ? remoteObject.handle : void 0;
  const preview = renderPreview(remoteObject);
  const handle = new JSHandle(context, remoteObject.type, preview, objectId, deserializeBidiValue(remoteObject));
  handle._setPreview(preview);
  return handle;
}

export { BidiExecutionContext, createHandle };
