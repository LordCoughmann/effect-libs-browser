import { rewriteErrorMessage } from '../utils/isomorphic/stackTrace.js';

class ProtocolError extends Error {
  constructor(type, method, logs) {
    super();
    this.type = type;
    this.method = method;
    this.logs = logs;
  }
  setMessage(message) {
    rewriteErrorMessage(this, `Protocol error (${this.method}): ${message}`);
  }
  browserLogMessage() {
    return this.logs ? "\nBrowser logs:\n" + this.logs : "";
  }
}
function isProtocolError(e) {
  return e instanceof ProtocolError;
}
function isSessionClosedError(e) {
  return e instanceof ProtocolError && (e.type === "closed" || e.type === "crashed");
}

export { ProtocolError, isProtocolError, isSessionClosedError };
