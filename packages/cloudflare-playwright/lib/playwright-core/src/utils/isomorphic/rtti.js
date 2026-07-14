function isRegExp(obj) {
  return obj instanceof RegExp || Object.prototype.toString.call(obj) === "[object RegExp]";
}
function isObject(obj) {
  return typeof obj === "object" && obj !== null;
}
function isError(obj) {
  return obj instanceof Error || obj && Object.getPrototypeOf(obj)?.name === "Error";
}

export { isError, isObject, isRegExp };
