import { isString } from '../utils/isomorphic/stringUtils.js';

function envObjectToArray(env) {
  const result = [];
  for (const name in env) {
    if (!Object.is(env[name], void 0))
      result.push({ name, value: String(env[name]) });
  }
  return result;
}
async function evaluationScript(platform, fun, arg, addSourceUrl = true) {
  if (typeof fun === "function") {
    const source = `((__name => (${fun.toString()}))(t => t))`;
    const argString = Object.is(arg, void 0) ? "undefined" : JSON.stringify(arg);
    return `(${source})(${argString})`;
  }
  if (arg !== void 0)
    throw new Error("Cannot evaluate a string with arguments");
  if (isString(fun))
    return fun;
  if (fun.content !== void 0)
    return fun.content;
  if (fun.path !== void 0) {
    let source = await platform.fs().promises.readFile(fun.path, "utf8");
    if (addSourceUrl)
      source = addSourceUrlToScript(source, fun.path);
    return source;
  }
  throw new Error("Either path or content property must be present");
}
function addSourceUrlToScript(source, path) {
  return `${source}
//# sourceURL=${path.replace(/\n/g, "")}`;
}

export { addSourceUrlToScript, envObjectToArray, evaluationScript };
