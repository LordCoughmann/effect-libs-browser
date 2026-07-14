import { captureRawStack } from './stackTrace.js';

class ManualPromise extends Promise {
  constructor() {
    let resolve;
    let reject;
    super((f, r) => {
      resolve = f;
      reject = r;
    });
    this._isDone = false;
    this._resolve = resolve;
    this._reject = reject;
  }
  isDone() {
    return this._isDone;
  }
  resolve(t) {
    this._isDone = true;
    this._resolve(t);
  }
  reject(e) {
    this._isDone = true;
    this._reject(e);
  }
  static get [Symbol.species]() {
    return Promise;
  }
  get [Symbol.toStringTag]() {
    return "ManualPromise";
  }
}
class LongStandingScope {
  constructor() {
    this._terminatePromises = /* @__PURE__ */ new Map();
    this._isClosed = false;
  }
  reject(error) {
    this._isClosed = true;
    this._terminateError = error;
    for (const p of this._terminatePromises.keys())
      p.resolve(error);
  }
  close(error) {
    this._isClosed = true;
    this._closeError = error;
    for (const [p, frames] of this._terminatePromises)
      p.resolve(cloneError(error, frames));
  }
  isClosed() {
    return this._isClosed;
  }
  static async raceMultiple(scopes, promise) {
    return Promise.race(scopes.map((s) => s.race(promise)));
  }
  async race(promise) {
    return this._race(Array.isArray(promise) ? promise : [promise], false);
  }
  async safeRace(promise, defaultValue) {
    return this._race([promise], true, defaultValue);
  }
  async _race(promises, safe, defaultValue) {
    const terminatePromise = new ManualPromise();
    const frames = captureRawStack();
    if (this._terminateError)
      terminatePromise.resolve(this._terminateError);
    if (this._closeError)
      terminatePromise.resolve(cloneError(this._closeError, frames));
    this._terminatePromises.set(terminatePromise, frames);
    try {
      return await Promise.race([
        terminatePromise.then((e) => safe ? defaultValue : Promise.reject(e)),
        ...promises
      ]);
    } finally {
      this._terminatePromises.delete(terminatePromise);
    }
  }
}
function cloneError(error, frames) {
  const clone = new Error();
  clone.name = error.name;
  clone.message = error.message;
  clone.stack = [error.name + ":" + error.message, ...frames].join("\n");
  return clone;
}

export { LongStandingScope, ManualPromise };
