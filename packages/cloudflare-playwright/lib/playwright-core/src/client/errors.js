import { parseSerializedValue, serializeValue } from '../protocol/serializers.js';
import { isError } from '../utils/isomorphic/rtti.js';

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimeoutError";
  }
}
class TargetClosedError extends Error {
  constructor(cause) {
    super(cause || "Target page, context or browser has been closed");
  }
}
function isTargetClosedError(error) {
  return error instanceof TargetClosedError;
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
  if (error.error.name === "TimeoutError") {
    const e2 = new TimeoutError(error.error.message);
    e2.stack = error.error.stack || "";
    return e2;
  }
  if (error.error.name === "TargetClosedError") {
    const e2 = new TargetClosedError(error.error.message);
    e2.stack = error.error.stack || "";
    return e2;
  }
  const e = new Error(error.error.message);
  e.stack = error.error.stack || "";
  e.name = error.error.name;
  return e;
}

export { TargetClosedError, TimeoutError, isTargetClosedError, parseError, serializeError };
