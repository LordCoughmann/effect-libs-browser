import { parseUnserializableValue } from '../javascript.js';

function deserializeBidiValue(result, internalIdMap = /* @__PURE__ */ new Map()) {
  switch (result.type) {
    case "undefined":
      return void 0;
    case "null":
      return null;
    case "number":
      return typeof result.value === "number" ? result.value : parseUnserializableValue(result.value);
    case "boolean":
      return Boolean(result.value);
    case "string":
      return result.value;
    case "bigint":
      return BigInt(result.value);
    case "array":
      return deserializeBidiList(result, internalIdMap);
    case "arraybuffer":
      return getValue(result, internalIdMap, () => ({}));
    case "date":
      return getValue(result, internalIdMap, () => new Date(result.value));
    case "error":
      return getValue(result, internalIdMap, () => {
        const error = new Error();
        error.stack = "";
        return error;
      });
    case "function":
      return void 0;
    case "generator":
      return getValue(result, internalIdMap, () => ({}));
    case "htmlcollection":
      return { ...deserializeBidiList(result, internalIdMap) };
    case "map":
      return getValue(result, internalIdMap, () => ({}));
    case "node":
      return "ref: <Node>";
    case "nodelist":
      return { ...deserializeBidiList(result, internalIdMap) };
    case "object":
      return deserializeBidiMapping(result, internalIdMap);
    case "promise":
      return getValue(result, internalIdMap, () => ({}));
    case "proxy":
      return getValue(result, internalIdMap, () => ({}));
    case "regexp":
      return getValue(result, internalIdMap, () => new RegExp(result.value.pattern, result.value.flags));
    case "set":
      return getValue(result, internalIdMap, () => ({}));
    case "symbol":
      return void 0;
    case "typedarray":
      return void 0;
    case "weakmap":
      return getValue(result, internalIdMap, () => ({}));
    case "weakset":
      return getValue(result, internalIdMap, () => ({}));
    case "window":
      return "ref: <Window>";
  }
}
function getValue(bidiValue, internalIdMap, defaultValue) {
  if ("internalId" in bidiValue && bidiValue.internalId) {
    if (internalIdMap.has(bidiValue.internalId)) {
      return internalIdMap.get(bidiValue.internalId);
    } else {
      const value = defaultValue();
      internalIdMap.set(bidiValue.internalId, value);
      return value;
    }
  } else {
    return defaultValue();
  }
}
function deserializeBidiList(bidiValue, internalIdMap) {
  const result = getValue(bidiValue, internalIdMap, () => []);
  for (const val of bidiValue.value || [])
    result.push(deserializeBidiValue(val, internalIdMap));
  return result;
}
function deserializeBidiMapping(bidiValue, internalIdMap) {
  const result = getValue(bidiValue, internalIdMap, () => ({}));
  for (const [serializedKey, serializedValue] of bidiValue.value || []) {
    const key = typeof serializedKey === "string" ? serializedKey : deserializeBidiValue(serializedKey, internalIdMap);
    const value = deserializeBidiValue(serializedValue, internalIdMap);
    result[key] = value;
  }
  return result;
}

export { deserializeBidiValue };
