function escapeWithQuotes(text, char = "'") {
  const stringified = JSON.stringify(text);
  const escapedText = stringified.substring(1, stringified.length - 1).replace(/\\"/g, '"');
  if (char === "'")
    return char + escapedText.replace(/[']/g, "\\'") + char;
  if (char === '"')
    return char + escapedText.replace(/["]/g, '\\"') + char;
  if (char === "`")
    return char + escapedText.replace(/[`]/g, "\\`") + char;
  throw new Error("Invalid escape char");
}
function escapeTemplateString(text) {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}
function isString(obj) {
  return typeof obj === "string" || obj instanceof String;
}
function toTitleCase(name) {
  return name.charAt(0).toUpperCase() + name.substring(1);
}
function toSnakeCase(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toLowerCase();
}
function formatObject(value, indent = "  ", mode = "multiline") {
  if (typeof value === "string")
    return escapeWithQuotes(value, "'");
  if (Array.isArray(value))
    return `[${value.map((o) => formatObject(o)).join(", ")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).filter((key) => value[key] !== void 0).sort();
    if (!keys.length)
      return "{}";
    const tokens = [];
    for (const key of keys)
      tokens.push(`${key}: ${formatObject(value[key])}`);
    if (mode === "multiline")
      return `{
${tokens.join(`,
${indent}`)}
}`;
    return `{ ${tokens.join(", ")} }`;
  }
  return String(value);
}
function formatObjectOrVoid(value, indent = "  ") {
  const result = formatObject(value, indent);
  return result === "{}" ? "" : result;
}
function quoteCSSAttributeValue(text) {
  return `"${text.replace(/["\\]/g, (char) => "\\" + char)}"`;
}
function normalizeEscapedRegexQuotes(source) {
  return source.replace(/(^|[^\\])(\\\\)*\\(['"`])/g, "$1$2$3");
}
function escapeRegexForSelector(re) {
  if (re.unicode || re.unicodeSets)
    return String(re);
  return String(re).replace(/(^|[^\\])(\\\\)*(["'`])/g, "$1$2\\$3").replace(/>>/g, "\\>\\>");
}
function escapeForTextSelector(text, exact) {
  if (typeof text !== "string")
    return escapeRegexForSelector(text);
  return `${JSON.stringify(text)}${exact ? "s" : "i"}`;
}
function escapeForAttributeSelector(value, exact) {
  if (typeof value !== "string")
    return escapeRegexForSelector(value);
  return `"${value.replace(/\\/g, "\\\\").replace(/["]/g, '\\"')}"${exact ? "s" : "i"}`;
}
function trimString(input, cap, suffix = "") {
  if (input.length <= cap)
    return input;
  const chars = [...input];
  if (chars.length > cap)
    return chars.slice(0, cap - suffix.length).join("") + suffix;
  return chars.join("");
}
function trimStringWithEllipsis(input, cap) {
  return trimString(input, cap, "…");
}
const escaped = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHTML(s) {
  return s.replace(/[&<]/ug, (char) => escaped[char]);
}

export { escapeForAttributeSelector, escapeForTextSelector, escapeHTML, escapeTemplateString, escapeWithQuotes, formatObject, formatObjectOrVoid, isString, normalizeEscapedRegexQuotes, quoteCSSAttributeValue, toSnakeCase, toTitleCase, trimString, trimStringWithEllipsis };
