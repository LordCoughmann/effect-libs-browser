import { serializeValue, parseSerializedValue } from '../protocol/serializers.js';
import { isError } from '../utils/isomorphic/rtti.js';
import '../../../_virtual/pixelmatch.js';
import '../utilsBundle.js';
import 'node:crypto';
import './utils/debug.js';
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

class CustomError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}
class TimeoutError extends CustomError {
}
class TargetClosedError extends CustomError {
  constructor(cause, logs) {
    super((cause || "Target page, context or browser has been closed") + (logs || ""));
  }
}
function isTargetClosedError(error) {
  return error instanceof TargetClosedError || error.name === "TargetClosedError";
}
function serializeError(e) {
  if (isError(e))
    return { error: { message: e.message, stack: e.stack, name: e.name } };
  return { value: serializeValue(e, (value) => ({ fallThrough: value })) };
}
function parseError(error) {
  if (!error.error) {
    if (error.value === void 0)
      throw new Error("Serialized error must have either an error or a value");
    return parseSerializedValue(error.value, void 0);
  }
  const e = new Error(error.error.message);
  e.stack = error.error.stack || "";
  e.name = error.error.name;
  return e;
}

export { TargetClosedError, TimeoutError, isTargetClosedError, parseError, serializeError };
