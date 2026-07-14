import { EventEmitter } from 'node:events';
import { createGuid } from './utils/crypto.js';

class SdkObject extends EventEmitter {
  constructor(parent, guidPrefix, guid) {
    super();
    this.guid = guid || `${guidPrefix || ""}@${createGuid()}`;
    this.setMaxListeners(0);
    this.attribution = { ...parent.attribution };
    this.instrumentation = parent.instrumentation;
  }
  closeReason() {
    return this.attribution.page?._closeReason || this.attribution.context?._closeReason || this.attribution.browser?._closeReason;
  }
}
function createRootSdkObject() {
  const fakeParent = { attribution: {}, instrumentation: createInstrumentation() };
  const root = new SdkObject(fakeParent);
  root.guid = "";
  return root;
}
function createInstrumentation() {
  const listeners = /* @__PURE__ */ new Map();
  return new Proxy({}, {
    get: (obj, prop) => {
      if (typeof prop !== "string")
        return obj[prop];
      if (prop === "addListener")
        return (listener, context) => listeners.set(listener, context);
      if (prop === "removeListener")
        return (listener) => listeners.delete(listener);
      if (!prop.startsWith("on"))
        return obj[prop];
      return async (sdkObject, ...params) => {
        for (const [listener, context] of listeners) {
          if (!context || sdkObject.attribution.context === context)
            await listener[prop]?.(sdkObject, ...params);
        }
      };
    }
  });
}

export { SdkObject, createInstrumentation, createRootSdkObject };
