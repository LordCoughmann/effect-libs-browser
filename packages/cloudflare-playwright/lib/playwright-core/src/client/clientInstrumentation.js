function createInstrumentation() {
  const listeners = [];
  return new Proxy({}, {
    get: (obj, prop) => {
      if (typeof prop !== "string")
        return obj[prop];
      if (prop === "addListener")
        return (listener) => listeners.push(listener);
      if (prop === "removeListener")
        return (listener) => listeners.splice(listeners.indexOf(listener), 1);
      if (prop === "removeAllListeners")
        return () => listeners.splice(0, listeners.length);
      if (prop.startsWith("run")) {
        return async (...params) => {
          for (const listener of listeners)
            await listener[prop]?.(...params);
        };
      }
      if (prop.startsWith("on")) {
        return (...params) => {
          for (const listener of listeners)
            listener[prop]?.(...params);
        };
      }
      return obj[prop];
    }
  });
}

export { createInstrumentation };
