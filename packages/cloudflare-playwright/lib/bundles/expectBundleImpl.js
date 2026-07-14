import fs from 'node:fs';
import require$$0$1 from 'node:constants';
import require$$6 from 'node:stream';
import require$$0$2__default, { types } from 'node:util';
import require$$5 from 'node:assert';
import * as path from 'node:path';
import path__default from 'node:path';
import { fileURLToPath } from 'node:url';
import require$$1 from 'node:module';

const equals = (a, b, customTesters, strictCheck) => {
  customTesters = customTesters || [];
  return eq(a, b, [], [], customTesters, strictCheck);
};
function isAsymmetric(obj) {
  return !!obj && isA("Function", obj.asymmetricMatch);
}
function asymmetricMatch(a, b) {
  const asymmetricA = isAsymmetric(a);
  const asymmetricB = isAsymmetric(b);
  if (asymmetricA && asymmetricB) {
    return void 0;
  }
  if (asymmetricA) {
    return a.asymmetricMatch(b);
  }
  if (asymmetricB) {
    return b.asymmetricMatch(a);
  }
}
function eq(a, b, aStack, bStack, customTesters, strictCheck) {
  let result = true;
  const asymmetricResult = asymmetricMatch(a, b);
  if (asymmetricResult !== void 0) {
    return asymmetricResult;
  }
  const testerContext = { equals };
  for (const item of customTesters) {
    const customTesterResult = item.call(testerContext, a, b, customTesters);
    if (customTesterResult !== void 0) {
      return customTesterResult;
    }
  }
  if (a instanceof Error && b instanceof Error) {
    return a.message === b.message;
  }
  if (Object.is(a, b)) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  const className = Object.prototype.toString.call(a);
  if (className !== Object.prototype.toString.call(b)) {
    return false;
  }
  switch (className) {
    case "[object Boolean]":
    case "[object String]":
    case "[object Number]":
      if (typeof a !== typeof b) {
        return false;
      } else if (typeof a !== "object" && typeof b !== "object") {
        return false;
      } else {
        return Object.is(a.valueOf(), b.valueOf());
      }
    case "[object Date]":
      return +a === +b;
    // RegExps are compared by their source patterns and flags.
    case "[object RegExp]":
      return a.source === b.source && a.flags === b.flags;
    // URLs are compared by their href property which contains the entire url string.
    case "[object URL]":
      return a.href === b.href;
  }
  if (typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (isDomNode(a) && isDomNode(b)) {
    return a.isEqualNode(b);
  }
  let length = aStack.length;
  while (length--) {
    if (aStack[length] === a) {
      return bStack[length] === b;
    } else if (bStack[length] === b) {
      return false;
    }
  }
  aStack.push(a);
  bStack.push(b);
  if (strictCheck && className === "[object Array]" && a.length !== b.length) {
    return false;
  }
  const aKeys = keys(a, hasKey);
  let key;
  const bKeys = keys(b, hasKey);
  if (!strictCheck) {
    for (let index = 0; index !== bKeys.length; ++index) {
      key = bKeys[index];
      if ((isAsymmetric(b[key]) || b[key] === void 0) && !hasKey(a, key)) {
        aKeys.push(key);
      }
    }
    for (let index = 0; index !== aKeys.length; ++index) {
      key = aKeys[index];
      if ((isAsymmetric(a[key]) || a[key] === void 0) && !hasKey(b, key)) {
        bKeys.push(key);
      }
    }
  }
  let size = aKeys.length;
  if (bKeys.length !== size) {
    return false;
  }
  while (size--) {
    key = aKeys[size];
    if (strictCheck)
      result = hasKey(b, key) && eq(a[key], b[key], aStack, bStack, customTesters, strictCheck);
    else
      result = (hasKey(b, key) || isAsymmetric(a[key]) || a[key] === void 0) && eq(a[key], b[key], aStack, bStack, customTesters, strictCheck);
    if (!result) {
      return false;
    }
  }
  aStack.pop();
  bStack.pop();
  return result;
}
function keys(obj, hasKey2) {
  const keys2 = [];
  for (const key in obj) {
    if (hasKey2(obj, key)) {
      keys2.push(key);
    }
  }
  return [
    ...keys2,
    ...Object.getOwnPropertySymbols(obj).filter(
      (symbol) => Object.getOwnPropertyDescriptor(obj, symbol).enumerable
    )
  ];
}
function hasKey(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function isA(typeName, value) {
  return Object.prototype.toString.apply(value) === `[object ${typeName}]`;
}
function isDomNode(obj) {
  return obj !== null && typeof obj === "object" && typeof obj.nodeType === "number" && typeof obj.nodeName === "string" && typeof obj.isEqualNode === "function";
}

function getType$1(value) {
  if (value === void 0) {
    return "undefined";
  } else if (value === null) {
    return "null";
  } else if (Array.isArray(value)) {
    return "array";
  } else if (typeof value === "boolean") {
    return "boolean";
  } else if (typeof value === "function") {
    return "function";
  } else if (typeof value === "number") {
    return "number";
  } else if (typeof value === "string") {
    return "string";
  } else if (typeof value === "bigint") {
    return "bigint";
  } else if (typeof value === "object") {
    if (value.constructor === RegExp) {
      return "regexp";
    } else if (value.constructor === Map) {
      return "map";
    } else if (value.constructor === Set) {
      return "set";
    } else if (value.constructor === Date) {
      return "date";
    }
    return "object";
  } else if (typeof value === "symbol") {
    return "symbol";
  }
  throw new Error(`value of unknown type: ${value}`);
}
const isPrimitive = (value) => Object(value) !== value;

const IS_KEYED_SENTINEL$1 = "@@__IMMUTABLE_KEYED__@@";
const IS_SET_SENTINEL$1 = "@@__IMMUTABLE_SET__@@";
const IS_LIST_SENTINEL$1 = "@@__IMMUTABLE_LIST__@@";
const IS_ORDERED_SENTINEL$1 = "@@__IMMUTABLE_ORDERED__@@";
const IS_RECORD_SYMBOL = "@@__IMMUTABLE_RECORD__@@";
function isObjectLiteral(source) {
  return source != null && typeof source === "object" && !Array.isArray(source);
}
function isImmutableUnorderedKeyed(source) {
  return Boolean(
    source && isObjectLiteral(source) && source[IS_KEYED_SENTINEL$1] && !source[IS_ORDERED_SENTINEL$1]
  );
}
function isImmutableUnorderedSet(source) {
  return Boolean(
    source && isObjectLiteral(source) && source[IS_SET_SENTINEL$1] && !source[IS_ORDERED_SENTINEL$1]
  );
}
function isImmutableList(source) {
  return Boolean(source && isObjectLiteral(source) && source[IS_LIST_SENTINEL$1]);
}
function isImmutableOrderedKeyed(source) {
  return Boolean(
    source && isObjectLiteral(source) && source[IS_KEYED_SENTINEL$1] && source[IS_ORDERED_SENTINEL$1]
  );
}
function isImmutableOrderedSet(source) {
  return Boolean(
    source && isObjectLiteral(source) && source[IS_SET_SENTINEL$1] && source[IS_ORDERED_SENTINEL$1]
  );
}
function isImmutableRecord(source) {
  return Boolean(source && isObjectLiteral(source) && source[IS_RECORD_SYMBOL]);
}

const hasPropertyInObject = (object, key) => {
  const shouldTerminate = !object || typeof object !== "object" || object === Object.prototype;
  if (shouldTerminate) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(object, key) || hasPropertyInObject(Object.getPrototypeOf(object), key);
};
const getObjectKeys = (object) => {
  return [
    ...Object.keys(object),
    ...Object.getOwnPropertySymbols(object).filter(
      (s) => Object.getOwnPropertyDescriptor(object, s)?.enumerable
    )
  ];
};
const getPath = (object, propertyPath) => {
  if (!Array.isArray(propertyPath)) {
    propertyPath = pathAsArray(propertyPath);
  }
  if (propertyPath.length > 0) {
    const lastProp = propertyPath.length === 1;
    const prop = propertyPath[0];
    const newObject = object[prop];
    if (!lastProp && (newObject === null || newObject === void 0)) {
      return {
        hasEndProp: false,
        lastTraversedObject: object,
        traversedPath: []
      };
    }
    const result = getPath(newObject, propertyPath.slice(1));
    if (result.lastTraversedObject === null) {
      result.lastTraversedObject = object;
    }
    result.traversedPath.unshift(prop);
    if (lastProp) {
      result.endPropIsDefined = !isPrimitive(object) && prop in object;
      result.hasEndProp = newObject !== void 0 || result.endPropIsDefined;
      if (!result.hasEndProp) {
        result.traversedPath.shift();
      }
    }
    return result;
  }
  return {
    lastTraversedObject: null,
    traversedPath: [],
    value: object
  };
};
const getObjectSubset = (object, subset, customTesters = [], seenReferences = /* @__PURE__ */ new WeakMap()) => {
  if (Array.isArray(object)) {
    if (Array.isArray(subset) && subset.length === object.length) {
      return subset.map(
        (sub, i) => getObjectSubset(object[i], sub, customTesters)
      );
    }
  } else if (object instanceof Date) {
    return object;
  } else if (isObject$1(object) && isObject$1(subset)) {
    if (equals(object, subset, [
      ...customTesters,
      iterableEquality,
      subsetEquality
    ])) {
      return subset;
    }
    const trimmed = {};
    seenReferences.set(object, trimmed);
    for (const key of getObjectKeys(object).filter(
      (key2) => hasPropertyInObject(subset, key2)
    )) {
      trimmed[key] = seenReferences.has(object[key]) ? seenReferences.get(object[key]) : getObjectSubset(
        object[key],
        subset[key],
        customTesters,
        seenReferences
      );
    }
    if (getObjectKeys(trimmed).length > 0) {
      return trimmed;
    }
  }
  return object;
};
const IteratorSymbol = Symbol.iterator;
const hasIterator = (object) => !!(object != null && object[IteratorSymbol]);
const iterableEquality = (a, b, customTesters = [], aStack = [], bStack = []) => {
  if (typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b) || ArrayBuffer.isView(a) || ArrayBuffer.isView(b) || !hasIterator(a) || !hasIterator(b)) {
    return void 0;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }
  let length = aStack.length;
  while (length--) {
    if (aStack[length] === a) {
      return bStack[length] === b;
    }
  }
  aStack.push(a);
  bStack.push(b);
  const iterableEqualityWithStack = (a2, b2) => iterableEquality(
    a2,
    b2,
    [...filteredCustomTesters],
    [...aStack],
    [...bStack]
  );
  const filteredCustomTesters = [
    ...customTesters.filter((t) => t !== iterableEquality),
    iterableEqualityWithStack
  ];
  if (a.size !== void 0) {
    if (a.size !== b.size) {
      return false;
    } else if (isA("Set", a) || isImmutableUnorderedSet(a)) {
      let allFound = true;
      for (const aValue of a) {
        if (!b.has(aValue)) {
          let has = false;
          for (const bValue of b) {
            const isEqual = equals(aValue, bValue, filteredCustomTesters);
            if (isEqual === true) {
              has = true;
            }
          }
          if (has === false) {
            allFound = false;
            break;
          }
        }
      }
      aStack.pop();
      bStack.pop();
      return allFound;
    } else if (isA("Map", a) || isImmutableUnorderedKeyed(a)) {
      let allFound = true;
      for (const aEntry of a) {
        if (!b.has(aEntry[0]) || !equals(aEntry[1], b.get(aEntry[0]), filteredCustomTesters)) {
          let has = false;
          for (const bEntry of b) {
            const matchedKey = equals(
              aEntry[0],
              bEntry[0],
              filteredCustomTesters
            );
            let matchedValue = false;
            if (matchedKey === true) {
              matchedValue = equals(
                aEntry[1],
                bEntry[1],
                filteredCustomTesters
              );
            }
            if (matchedValue === true) {
              has = true;
            }
          }
          if (has === false) {
            allFound = false;
            break;
          }
        }
      }
      aStack.pop();
      bStack.pop();
      return allFound;
    }
  }
  const bIterator = b[IteratorSymbol]();
  for (const aValue of a) {
    const nextB = bIterator.next();
    if (nextB.done || !equals(aValue, nextB.value, filteredCustomTesters)) {
      return false;
    }
  }
  if (!bIterator.next().done) {
    return false;
  }
  if (!isImmutableList(a) && !isImmutableOrderedKeyed(a) && !isImmutableOrderedSet(a) && !isImmutableRecord(a)) {
    const aEntries = entries(a);
    const bEntries = entries(b);
    if (!equals(aEntries, bEntries)) {
      return false;
    }
  }
  aStack.pop();
  bStack.pop();
  return true;
};
const entries = (obj) => {
  if (!isObject$1(obj)) return [];
  const symbolProperties = Object.getOwnPropertySymbols(obj).filter((key) => key !== Symbol.iterator).map((key) => [key, obj[key]]);
  return [...symbolProperties, ...Object.entries(obj)];
};
const isObject$1 = (a) => a !== null && typeof a === "object";
const isObjectWithKeys = (a) => isObject$1(a) && !(a instanceof Error) && !Array.isArray(a) && !(a instanceof Date) && !(a instanceof Set) && !(a instanceof Map);
const subsetEquality = (object, subset, customTesters = []) => {
  const filteredCustomTesters = customTesters.filter((t) => t !== subsetEquality);
  const subsetEqualityWithContext = (seenReferences = /* @__PURE__ */ new WeakMap()) => (object2, subset2) => {
    if (!isObjectWithKeys(subset2)) {
      return void 0;
    }
    if (seenReferences.has(subset2)) return void 0;
    seenReferences.set(subset2, true);
    const matchResult = getObjectKeys(subset2).every((key) => {
      if (isObjectWithKeys(subset2[key])) {
        if (seenReferences.has(subset2[key])) {
          return equals(object2[key], subset2[key], filteredCustomTesters);
        }
      }
      const result = object2 != null && hasPropertyInObject(object2, key) && equals(object2[key], subset2[key], [
        ...filteredCustomTesters,
        subsetEqualityWithContext(seenReferences)
      ]);
      seenReferences.delete(subset2[key]);
      return result;
    });
    seenReferences.delete(subset2);
    return matchResult;
  };
  return subsetEqualityWithContext()(object, subset);
};
const typeEquality = (a, b) => {
  if (a == null || b == null || a.constructor === b.constructor || // Since Jest globals are different from Node globals,
  // constructors are different even between arrays when comparing properties of mock objects.
  // Both of them should be able to compare correctly when they are array-to-array.
  // https://github.com/jestjs/jest/issues/2549
  Array.isArray(a) && Array.isArray(b)) {
    return void 0;
  }
  return false;
};
const arrayBufferEquality = (a, b) => {
  let dataViewA = a;
  let dataViewB = b;
  if (isArrayBuffer(a) && isArrayBuffer(b)) {
    dataViewA = new DataView(a);
    dataViewB = new DataView(b);
  } else if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    dataViewA = new DataView(a.buffer, a.byteOffset, a.byteLength);
    dataViewB = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  if (!(dataViewA instanceof DataView && dataViewB instanceof DataView)) {
    return void 0;
  }
  if (dataViewA.byteLength !== dataViewB.byteLength) {
    return false;
  }
  for (let i = 0; i < dataViewA.byteLength; i++) {
    if (dataViewA.getUint8(i) !== dataViewB.getUint8(i)) {
      return false;
    }
  }
  return true;
};
function isArrayBuffer(obj) {
  return Object.prototype.toString.call(obj) === "[object ArrayBuffer]";
}
const sparseArrayEquality = (a, b, customTesters = []) => {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return void 0;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return equals(
    a,
    b,
    customTesters.filter((t) => t !== sparseArrayEquality),
    true
  ) && equals(aKeys, bKeys);
};
const pathAsArray = (propertyPath) => {
  const properties = [];
  if (propertyPath === "") {
    properties.push("");
    return properties;
  }
  const pattern = new RegExp("[^.[\\]]+|(?=(?:\\.)(?:\\.|$))", "g");
  if (propertyPath[0] === ".") {
    properties.push("");
  }
  propertyPath.replaceAll(pattern, (match) => {
    properties.push(match);
    return match;
  });
  return properties;
};
const isError = (value) => {
  switch (Object.prototype.toString.call(value)) {
    case "[object Error]":
    case "[object Exception]":
    case "[object DOMException]":
      return true;
    default:
      return value instanceof Error;
  }
};

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var ansiStyles = {exports: {}};

var colorName;
var hasRequiredColorName;

function requireColorName () {
	if (hasRequiredColorName) return colorName;
	hasRequiredColorName = 1;

	colorName = {
		"aliceblue": [240, 248, 255],
		"antiquewhite": [250, 235, 215],
		"aqua": [0, 255, 255],
		"aquamarine": [127, 255, 212],
		"azure": [240, 255, 255],
		"beige": [245, 245, 220],
		"bisque": [255, 228, 196],
		"black": [0, 0, 0],
		"blanchedalmond": [255, 235, 205],
		"blue": [0, 0, 255],
		"blueviolet": [138, 43, 226],
		"brown": [165, 42, 42],
		"burlywood": [222, 184, 135],
		"cadetblue": [95, 158, 160],
		"chartreuse": [127, 255, 0],
		"chocolate": [210, 105, 30],
		"coral": [255, 127, 80],
		"cornflowerblue": [100, 149, 237],
		"cornsilk": [255, 248, 220],
		"crimson": [220, 20, 60],
		"cyan": [0, 255, 255],
		"darkblue": [0, 0, 139],
		"darkcyan": [0, 139, 139],
		"darkgoldenrod": [184, 134, 11],
		"darkgray": [169, 169, 169],
		"darkgreen": [0, 100, 0],
		"darkgrey": [169, 169, 169],
		"darkkhaki": [189, 183, 107],
		"darkmagenta": [139, 0, 139],
		"darkolivegreen": [85, 107, 47],
		"darkorange": [255, 140, 0],
		"darkorchid": [153, 50, 204],
		"darkred": [139, 0, 0],
		"darksalmon": [233, 150, 122],
		"darkseagreen": [143, 188, 143],
		"darkslateblue": [72, 61, 139],
		"darkslategray": [47, 79, 79],
		"darkslategrey": [47, 79, 79],
		"darkturquoise": [0, 206, 209],
		"darkviolet": [148, 0, 211],
		"deeppink": [255, 20, 147],
		"deepskyblue": [0, 191, 255],
		"dimgray": [105, 105, 105],
		"dimgrey": [105, 105, 105],
		"dodgerblue": [30, 144, 255],
		"firebrick": [178, 34, 34],
		"floralwhite": [255, 250, 240],
		"forestgreen": [34, 139, 34],
		"fuchsia": [255, 0, 255],
		"gainsboro": [220, 220, 220],
		"ghostwhite": [248, 248, 255],
		"gold": [255, 215, 0],
		"goldenrod": [218, 165, 32],
		"gray": [128, 128, 128],
		"green": [0, 128, 0],
		"greenyellow": [173, 255, 47],
		"grey": [128, 128, 128],
		"honeydew": [240, 255, 240],
		"hotpink": [255, 105, 180],
		"indianred": [205, 92, 92],
		"indigo": [75, 0, 130],
		"ivory": [255, 255, 240],
		"khaki": [240, 230, 140],
		"lavender": [230, 230, 250],
		"lavenderblush": [255, 240, 245],
		"lawngreen": [124, 252, 0],
		"lemonchiffon": [255, 250, 205],
		"lightblue": [173, 216, 230],
		"lightcoral": [240, 128, 128],
		"lightcyan": [224, 255, 255],
		"lightgoldenrodyellow": [250, 250, 210],
		"lightgray": [211, 211, 211],
		"lightgreen": [144, 238, 144],
		"lightgrey": [211, 211, 211],
		"lightpink": [255, 182, 193],
		"lightsalmon": [255, 160, 122],
		"lightseagreen": [32, 178, 170],
		"lightskyblue": [135, 206, 250],
		"lightslategray": [119, 136, 153],
		"lightslategrey": [119, 136, 153],
		"lightsteelblue": [176, 196, 222],
		"lightyellow": [255, 255, 224],
		"lime": [0, 255, 0],
		"limegreen": [50, 205, 50],
		"linen": [250, 240, 230],
		"magenta": [255, 0, 255],
		"maroon": [128, 0, 0],
		"mediumaquamarine": [102, 205, 170],
		"mediumblue": [0, 0, 205],
		"mediumorchid": [186, 85, 211],
		"mediumpurple": [147, 112, 219],
		"mediumseagreen": [60, 179, 113],
		"mediumslateblue": [123, 104, 238],
		"mediumspringgreen": [0, 250, 154],
		"mediumturquoise": [72, 209, 204],
		"mediumvioletred": [199, 21, 133],
		"midnightblue": [25, 25, 112],
		"mintcream": [245, 255, 250],
		"mistyrose": [255, 228, 225],
		"moccasin": [255, 228, 181],
		"navajowhite": [255, 222, 173],
		"navy": [0, 0, 128],
		"oldlace": [253, 245, 230],
		"olive": [128, 128, 0],
		"olivedrab": [107, 142, 35],
		"orange": [255, 165, 0],
		"orangered": [255, 69, 0],
		"orchid": [218, 112, 214],
		"palegoldenrod": [238, 232, 170],
		"palegreen": [152, 251, 152],
		"paleturquoise": [175, 238, 238],
		"palevioletred": [219, 112, 147],
		"papayawhip": [255, 239, 213],
		"peachpuff": [255, 218, 185],
		"peru": [205, 133, 63],
		"pink": [255, 192, 203],
		"plum": [221, 160, 221],
		"powderblue": [176, 224, 230],
		"purple": [128, 0, 128],
		"rebeccapurple": [102, 51, 153],
		"red": [255, 0, 0],
		"rosybrown": [188, 143, 143],
		"royalblue": [65, 105, 225],
		"saddlebrown": [139, 69, 19],
		"salmon": [250, 128, 114],
		"sandybrown": [244, 164, 96],
		"seagreen": [46, 139, 87],
		"seashell": [255, 245, 238],
		"sienna": [160, 82, 45],
		"silver": [192, 192, 192],
		"skyblue": [135, 206, 235],
		"slateblue": [106, 90, 205],
		"slategray": [112, 128, 144],
		"slategrey": [112, 128, 144],
		"snow": [255, 250, 250],
		"springgreen": [0, 255, 127],
		"steelblue": [70, 130, 180],
		"tan": [210, 180, 140],
		"teal": [0, 128, 128],
		"thistle": [216, 191, 216],
		"tomato": [255, 99, 71],
		"turquoise": [64, 224, 208],
		"violet": [238, 130, 238],
		"wheat": [245, 222, 179],
		"white": [255, 255, 255],
		"whitesmoke": [245, 245, 245],
		"yellow": [255, 255, 0],
		"yellowgreen": [154, 205, 50]
	};
	return colorName;
}

/* MIT license */

var conversions;
var hasRequiredConversions;

function requireConversions () {
	if (hasRequiredConversions) return conversions;
	hasRequiredConversions = 1;
	/* eslint-disable no-mixed-operators */
	const cssKeywords = requireColorName();

	// NOTE: conversions should only return primitive values (i.e. arrays, or
	//       values that give correct `typeof` results).
	//       do not use box values types (i.e. Number(), String(), etc.)

	const reverseKeywords = {};
	for (const key of Object.keys(cssKeywords)) {
		reverseKeywords[cssKeywords[key]] = key;
	}

	const convert = {
		rgb: {channels: 3, labels: 'rgb'},
		hsl: {channels: 3, labels: 'hsl'},
		hsv: {channels: 3, labels: 'hsv'},
		hwb: {channels: 3, labels: 'hwb'},
		cmyk: {channels: 4, labels: 'cmyk'},
		xyz: {channels: 3, labels: 'xyz'},
		lab: {channels: 3, labels: 'lab'},
		lch: {channels: 3, labels: 'lch'},
		hex: {channels: 1, labels: ['hex']},
		keyword: {channels: 1, labels: ['keyword']},
		ansi16: {channels: 1, labels: ['ansi16']},
		ansi256: {channels: 1, labels: ['ansi256']},
		hcg: {channels: 3, labels: ['h', 'c', 'g']},
		apple: {channels: 3, labels: ['r16', 'g16', 'b16']},
		gray: {channels: 1, labels: ['gray']}
	};

	conversions = convert;

	// Hide .channels and .labels properties
	for (const model of Object.keys(convert)) {
		if (!('channels' in convert[model])) {
			throw new Error('missing channels property: ' + model);
		}

		if (!('labels' in convert[model])) {
			throw new Error('missing channel labels property: ' + model);
		}

		if (convert[model].labels.length !== convert[model].channels) {
			throw new Error('channel and label counts mismatch: ' + model);
		}

		const {channels, labels} = convert[model];
		delete convert[model].channels;
		delete convert[model].labels;
		Object.defineProperty(convert[model], 'channels', {value: channels});
		Object.defineProperty(convert[model], 'labels', {value: labels});
	}

	convert.rgb.hsl = function (rgb) {
		const r = rgb[0] / 255;
		const g = rgb[1] / 255;
		const b = rgb[2] / 255;
		const min = Math.min(r, g, b);
		const max = Math.max(r, g, b);
		const delta = max - min;
		let h;
		let s;

		if (max === min) {
			h = 0;
		} else if (r === max) {
			h = (g - b) / delta;
		} else if (g === max) {
			h = 2 + (b - r) / delta;
		} else if (b === max) {
			h = 4 + (r - g) / delta;
		}

		h = Math.min(h * 60, 360);

		if (h < 0) {
			h += 360;
		}

		const l = (min + max) / 2;

		if (max === min) {
			s = 0;
		} else if (l <= 0.5) {
			s = delta / (max + min);
		} else {
			s = delta / (2 - max - min);
		}

		return [h, s * 100, l * 100];
	};

	convert.rgb.hsv = function (rgb) {
		let rdif;
		let gdif;
		let bdif;
		let h;
		let s;

		const r = rgb[0] / 255;
		const g = rgb[1] / 255;
		const b = rgb[2] / 255;
		const v = Math.max(r, g, b);
		const diff = v - Math.min(r, g, b);
		const diffc = function (c) {
			return (v - c) / 6 / diff + 1 / 2;
		};

		if (diff === 0) {
			h = 0;
			s = 0;
		} else {
			s = diff / v;
			rdif = diffc(r);
			gdif = diffc(g);
			bdif = diffc(b);

			if (r === v) {
				h = bdif - gdif;
			} else if (g === v) {
				h = (1 / 3) + rdif - bdif;
			} else if (b === v) {
				h = (2 / 3) + gdif - rdif;
			}

			if (h < 0) {
				h += 1;
			} else if (h > 1) {
				h -= 1;
			}
		}

		return [
			h * 360,
			s * 100,
			v * 100
		];
	};

	convert.rgb.hwb = function (rgb) {
		const r = rgb[0];
		const g = rgb[1];
		let b = rgb[2];
		const h = convert.rgb.hsl(rgb)[0];
		const w = 1 / 255 * Math.min(r, Math.min(g, b));

		b = 1 - 1 / 255 * Math.max(r, Math.max(g, b));

		return [h, w * 100, b * 100];
	};

	convert.rgb.cmyk = function (rgb) {
		const r = rgb[0] / 255;
		const g = rgb[1] / 255;
		const b = rgb[2] / 255;

		const k = Math.min(1 - r, 1 - g, 1 - b);
		const c = (1 - r - k) / (1 - k) || 0;
		const m = (1 - g - k) / (1 - k) || 0;
		const y = (1 - b - k) / (1 - k) || 0;

		return [c * 100, m * 100, y * 100, k * 100];
	};

	function comparativeDistance(x, y) {
		/*
			See https://en.m.wikipedia.org/wiki/Euclidean_distance#Squared_Euclidean_distance
		*/
		return (
			((x[0] - y[0]) ** 2) +
			((x[1] - y[1]) ** 2) +
			((x[2] - y[2]) ** 2)
		);
	}

	convert.rgb.keyword = function (rgb) {
		const reversed = reverseKeywords[rgb];
		if (reversed) {
			return reversed;
		}

		let currentClosestDistance = Infinity;
		let currentClosestKeyword;

		for (const keyword of Object.keys(cssKeywords)) {
			const value = cssKeywords[keyword];

			// Compute comparative distance
			const distance = comparativeDistance(rgb, value);

			// Check if its less, if so set as closest
			if (distance < currentClosestDistance) {
				currentClosestDistance = distance;
				currentClosestKeyword = keyword;
			}
		}

		return currentClosestKeyword;
	};

	convert.keyword.rgb = function (keyword) {
		return cssKeywords[keyword];
	};

	convert.rgb.xyz = function (rgb) {
		let r = rgb[0] / 255;
		let g = rgb[1] / 255;
		let b = rgb[2] / 255;

		// Assume sRGB
		r = r > 0.04045 ? (((r + 0.055) / 1.055) ** 2.4) : (r / 12.92);
		g = g > 0.04045 ? (((g + 0.055) / 1.055) ** 2.4) : (g / 12.92);
		b = b > 0.04045 ? (((b + 0.055) / 1.055) ** 2.4) : (b / 12.92);

		const x = (r * 0.4124) + (g * 0.3576) + (b * 0.1805);
		const y = (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
		const z = (r * 0.0193) + (g * 0.1192) + (b * 0.9505);

		return [x * 100, y * 100, z * 100];
	};

	convert.rgb.lab = function (rgb) {
		const xyz = convert.rgb.xyz(rgb);
		let x = xyz[0];
		let y = xyz[1];
		let z = xyz[2];

		x /= 95.047;
		y /= 100;
		z /= 108.883;

		x = x > 0.008856 ? (x ** (1 / 3)) : (7.787 * x) + (16 / 116);
		y = y > 0.008856 ? (y ** (1 / 3)) : (7.787 * y) + (16 / 116);
		z = z > 0.008856 ? (z ** (1 / 3)) : (7.787 * z) + (16 / 116);

		const l = (116 * y) - 16;
		const a = 500 * (x - y);
		const b = 200 * (y - z);

		return [l, a, b];
	};

	convert.hsl.rgb = function (hsl) {
		const h = hsl[0] / 360;
		const s = hsl[1] / 100;
		const l = hsl[2] / 100;
		let t2;
		let t3;
		let val;

		if (s === 0) {
			val = l * 255;
			return [val, val, val];
		}

		if (l < 0.5) {
			t2 = l * (1 + s);
		} else {
			t2 = l + s - l * s;
		}

		const t1 = 2 * l - t2;

		const rgb = [0, 0, 0];
		for (let i = 0; i < 3; i++) {
			t3 = h + 1 / 3 * -(i - 1);
			if (t3 < 0) {
				t3++;
			}

			if (t3 > 1) {
				t3--;
			}

			if (6 * t3 < 1) {
				val = t1 + (t2 - t1) * 6 * t3;
			} else if (2 * t3 < 1) {
				val = t2;
			} else if (3 * t3 < 2) {
				val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
			} else {
				val = t1;
			}

			rgb[i] = val * 255;
		}

		return rgb;
	};

	convert.hsl.hsv = function (hsl) {
		const h = hsl[0];
		let s = hsl[1] / 100;
		let l = hsl[2] / 100;
		let smin = s;
		const lmin = Math.max(l, 0.01);

		l *= 2;
		s *= (l <= 1) ? l : 2 - l;
		smin *= lmin <= 1 ? lmin : 2 - lmin;
		const v = (l + s) / 2;
		const sv = l === 0 ? (2 * smin) / (lmin + smin) : (2 * s) / (l + s);

		return [h, sv * 100, v * 100];
	};

	convert.hsv.rgb = function (hsv) {
		const h = hsv[0] / 60;
		const s = hsv[1] / 100;
		let v = hsv[2] / 100;
		const hi = Math.floor(h) % 6;

		const f = h - Math.floor(h);
		const p = 255 * v * (1 - s);
		const q = 255 * v * (1 - (s * f));
		const t = 255 * v * (1 - (s * (1 - f)));
		v *= 255;

		switch (hi) {
			case 0:
				return [v, t, p];
			case 1:
				return [q, v, p];
			case 2:
				return [p, v, t];
			case 3:
				return [p, q, v];
			case 4:
				return [t, p, v];
			case 5:
				return [v, p, q];
		}
	};

	convert.hsv.hsl = function (hsv) {
		const h = hsv[0];
		const s = hsv[1] / 100;
		const v = hsv[2] / 100;
		const vmin = Math.max(v, 0.01);
		let sl;
		let l;

		l = (2 - s) * v;
		const lmin = (2 - s) * vmin;
		sl = s * vmin;
		sl /= (lmin <= 1) ? lmin : 2 - lmin;
		sl = sl || 0;
		l /= 2;

		return [h, sl * 100, l * 100];
	};

	// http://dev.w3.org/csswg/css-color/#hwb-to-rgb
	convert.hwb.rgb = function (hwb) {
		const h = hwb[0] / 360;
		let wh = hwb[1] / 100;
		let bl = hwb[2] / 100;
		const ratio = wh + bl;
		let f;

		// Wh + bl cant be > 1
		if (ratio > 1) {
			wh /= ratio;
			bl /= ratio;
		}

		const i = Math.floor(6 * h);
		const v = 1 - bl;
		f = 6 * h - i;

		if ((i & 0x01) !== 0) {
			f = 1 - f;
		}

		const n = wh + f * (v - wh); // Linear interpolation

		let r;
		let g;
		let b;
		/* eslint-disable max-statements-per-line,no-multi-spaces */
		switch (i) {
			default:
			case 6:
			case 0: r = v;  g = n;  b = wh; break;
			case 1: r = n;  g = v;  b = wh; break;
			case 2: r = wh; g = v;  b = n; break;
			case 3: r = wh; g = n;  b = v; break;
			case 4: r = n;  g = wh; b = v; break;
			case 5: r = v;  g = wh; b = n; break;
		}
		/* eslint-enable max-statements-per-line,no-multi-spaces */

		return [r * 255, g * 255, b * 255];
	};

	convert.cmyk.rgb = function (cmyk) {
		const c = cmyk[0] / 100;
		const m = cmyk[1] / 100;
		const y = cmyk[2] / 100;
		const k = cmyk[3] / 100;

		const r = 1 - Math.min(1, c * (1 - k) + k);
		const g = 1 - Math.min(1, m * (1 - k) + k);
		const b = 1 - Math.min(1, y * (1 - k) + k);

		return [r * 255, g * 255, b * 255];
	};

	convert.xyz.rgb = function (xyz) {
		const x = xyz[0] / 100;
		const y = xyz[1] / 100;
		const z = xyz[2] / 100;
		let r;
		let g;
		let b;

		r = (x * 3.2406) + (y * -1.5372) + (z * -0.4986);
		g = (x * -0.9689) + (y * 1.8758) + (z * 0.0415);
		b = (x * 0.0557) + (y * -0.204) + (z * 1.0570);

		// Assume sRGB
		r = r > 0.0031308
			? ((1.055 * (r ** (1.0 / 2.4))) - 0.055)
			: r * 12.92;

		g = g > 0.0031308
			? ((1.055 * (g ** (1.0 / 2.4))) - 0.055)
			: g * 12.92;

		b = b > 0.0031308
			? ((1.055 * (b ** (1.0 / 2.4))) - 0.055)
			: b * 12.92;

		r = Math.min(Math.max(0, r), 1);
		g = Math.min(Math.max(0, g), 1);
		b = Math.min(Math.max(0, b), 1);

		return [r * 255, g * 255, b * 255];
	};

	convert.xyz.lab = function (xyz) {
		let x = xyz[0];
		let y = xyz[1];
		let z = xyz[2];

		x /= 95.047;
		y /= 100;
		z /= 108.883;

		x = x > 0.008856 ? (x ** (1 / 3)) : (7.787 * x) + (16 / 116);
		y = y > 0.008856 ? (y ** (1 / 3)) : (7.787 * y) + (16 / 116);
		z = z > 0.008856 ? (z ** (1 / 3)) : (7.787 * z) + (16 / 116);

		const l = (116 * y) - 16;
		const a = 500 * (x - y);
		const b = 200 * (y - z);

		return [l, a, b];
	};

	convert.lab.xyz = function (lab) {
		const l = lab[0];
		const a = lab[1];
		const b = lab[2];
		let x;
		let y;
		let z;

		y = (l + 16) / 116;
		x = a / 500 + y;
		z = y - b / 200;

		const y2 = y ** 3;
		const x2 = x ** 3;
		const z2 = z ** 3;
		y = y2 > 0.008856 ? y2 : (y - 16 / 116) / 7.787;
		x = x2 > 0.008856 ? x2 : (x - 16 / 116) / 7.787;
		z = z2 > 0.008856 ? z2 : (z - 16 / 116) / 7.787;

		x *= 95.047;
		y *= 100;
		z *= 108.883;

		return [x, y, z];
	};

	convert.lab.lch = function (lab) {
		const l = lab[0];
		const a = lab[1];
		const b = lab[2];
		let h;

		const hr = Math.atan2(b, a);
		h = hr * 360 / 2 / Math.PI;

		if (h < 0) {
			h += 360;
		}

		const c = Math.sqrt(a * a + b * b);

		return [l, c, h];
	};

	convert.lch.lab = function (lch) {
		const l = lch[0];
		const c = lch[1];
		const h = lch[2];

		const hr = h / 360 * 2 * Math.PI;
		const a = c * Math.cos(hr);
		const b = c * Math.sin(hr);

		return [l, a, b];
	};

	convert.rgb.ansi16 = function (args, saturation = null) {
		const [r, g, b] = args;
		let value = saturation === null ? convert.rgb.hsv(args)[2] : saturation; // Hsv -> ansi16 optimization

		value = Math.round(value / 50);

		if (value === 0) {
			return 30;
		}

		let ansi = 30
			+ ((Math.round(b / 255) << 2)
			| (Math.round(g / 255) << 1)
			| Math.round(r / 255));

		if (value === 2) {
			ansi += 60;
		}

		return ansi;
	};

	convert.hsv.ansi16 = function (args) {
		// Optimization here; we already know the value and don't need to get
		// it converted for us.
		return convert.rgb.ansi16(convert.hsv.rgb(args), args[2]);
	};

	convert.rgb.ansi256 = function (args) {
		const r = args[0];
		const g = args[1];
		const b = args[2];

		// We use the extended greyscale palette here, with the exception of
		// black and white. normal palette only has 4 greyscale shades.
		if (r === g && g === b) {
			if (r < 8) {
				return 16;
			}

			if (r > 248) {
				return 231;
			}

			return Math.round(((r - 8) / 247) * 24) + 232;
		}

		const ansi = 16
			+ (36 * Math.round(r / 255 * 5))
			+ (6 * Math.round(g / 255 * 5))
			+ Math.round(b / 255 * 5);

		return ansi;
	};

	convert.ansi16.rgb = function (args) {
		let color = args % 10;

		// Handle greyscale
		if (color === 0 || color === 7) {
			if (args > 50) {
				color += 3.5;
			}

			color = color / 10.5 * 255;

			return [color, color, color];
		}

		const mult = (~~(args > 50) + 1) * 0.5;
		const r = ((color & 1) * mult) * 255;
		const g = (((color >> 1) & 1) * mult) * 255;
		const b = (((color >> 2) & 1) * mult) * 255;

		return [r, g, b];
	};

	convert.ansi256.rgb = function (args) {
		// Handle greyscale
		if (args >= 232) {
			const c = (args - 232) * 10 + 8;
			return [c, c, c];
		}

		args -= 16;

		let rem;
		const r = Math.floor(args / 36) / 5 * 255;
		const g = Math.floor((rem = args % 36) / 6) / 5 * 255;
		const b = (rem % 6) / 5 * 255;

		return [r, g, b];
	};

	convert.rgb.hex = function (args) {
		const integer = ((Math.round(args[0]) & 0xFF) << 16)
			+ ((Math.round(args[1]) & 0xFF) << 8)
			+ (Math.round(args[2]) & 0xFF);

		const string = integer.toString(16).toUpperCase();
		return '000000'.substring(string.length) + string;
	};

	convert.hex.rgb = function (args) {
		const match = args.toString(16).match(/[a-f0-9]{6}|[a-f0-9]{3}/i);
		if (!match) {
			return [0, 0, 0];
		}

		let colorString = match[0];

		if (match[0].length === 3) {
			colorString = colorString.split('').map(char => {
				return char + char;
			}).join('');
		}

		const integer = parseInt(colorString, 16);
		const r = (integer >> 16) & 0xFF;
		const g = (integer >> 8) & 0xFF;
		const b = integer & 0xFF;

		return [r, g, b];
	};

	convert.rgb.hcg = function (rgb) {
		const r = rgb[0] / 255;
		const g = rgb[1] / 255;
		const b = rgb[2] / 255;
		const max = Math.max(Math.max(r, g), b);
		const min = Math.min(Math.min(r, g), b);
		const chroma = (max - min);
		let grayscale;
		let hue;

		if (chroma < 1) {
			grayscale = min / (1 - chroma);
		} else {
			grayscale = 0;
		}

		if (chroma <= 0) {
			hue = 0;
		} else
		if (max === r) {
			hue = ((g - b) / chroma) % 6;
		} else
		if (max === g) {
			hue = 2 + (b - r) / chroma;
		} else {
			hue = 4 + (r - g) / chroma;
		}

		hue /= 6;
		hue %= 1;

		return [hue * 360, chroma * 100, grayscale * 100];
	};

	convert.hsl.hcg = function (hsl) {
		const s = hsl[1] / 100;
		const l = hsl[2] / 100;

		const c = l < 0.5 ? (2.0 * s * l) : (2.0 * s * (1.0 - l));

		let f = 0;
		if (c < 1.0) {
			f = (l - 0.5 * c) / (1.0 - c);
		}

		return [hsl[0], c * 100, f * 100];
	};

	convert.hsv.hcg = function (hsv) {
		const s = hsv[1] / 100;
		const v = hsv[2] / 100;

		const c = s * v;
		let f = 0;

		if (c < 1.0) {
			f = (v - c) / (1 - c);
		}

		return [hsv[0], c * 100, f * 100];
	};

	convert.hcg.rgb = function (hcg) {
		const h = hcg[0] / 360;
		const c = hcg[1] / 100;
		const g = hcg[2] / 100;

		if (c === 0.0) {
			return [g * 255, g * 255, g * 255];
		}

		const pure = [0, 0, 0];
		const hi = (h % 1) * 6;
		const v = hi % 1;
		const w = 1 - v;
		let mg = 0;

		/* eslint-disable max-statements-per-line */
		switch (Math.floor(hi)) {
			case 0:
				pure[0] = 1; pure[1] = v; pure[2] = 0; break;
			case 1:
				pure[0] = w; pure[1] = 1; pure[2] = 0; break;
			case 2:
				pure[0] = 0; pure[1] = 1; pure[2] = v; break;
			case 3:
				pure[0] = 0; pure[1] = w; pure[2] = 1; break;
			case 4:
				pure[0] = v; pure[1] = 0; pure[2] = 1; break;
			default:
				pure[0] = 1; pure[1] = 0; pure[2] = w;
		}
		/* eslint-enable max-statements-per-line */

		mg = (1.0 - c) * g;

		return [
			(c * pure[0] + mg) * 255,
			(c * pure[1] + mg) * 255,
			(c * pure[2] + mg) * 255
		];
	};

	convert.hcg.hsv = function (hcg) {
		const c = hcg[1] / 100;
		const g = hcg[2] / 100;

		const v = c + g * (1.0 - c);
		let f = 0;

		if (v > 0.0) {
			f = c / v;
		}

		return [hcg[0], f * 100, v * 100];
	};

	convert.hcg.hsl = function (hcg) {
		const c = hcg[1] / 100;
		const g = hcg[2] / 100;

		const l = g * (1.0 - c) + 0.5 * c;
		let s = 0;

		if (l > 0.0 && l < 0.5) {
			s = c / (2 * l);
		} else
		if (l >= 0.5 && l < 1.0) {
			s = c / (2 * (1 - l));
		}

		return [hcg[0], s * 100, l * 100];
	};

	convert.hcg.hwb = function (hcg) {
		const c = hcg[1] / 100;
		const g = hcg[2] / 100;
		const v = c + g * (1.0 - c);
		return [hcg[0], (v - c) * 100, (1 - v) * 100];
	};

	convert.hwb.hcg = function (hwb) {
		const w = hwb[1] / 100;
		const b = hwb[2] / 100;
		const v = 1 - b;
		const c = v - w;
		let g = 0;

		if (c < 1) {
			g = (v - c) / (1 - c);
		}

		return [hwb[0], c * 100, g * 100];
	};

	convert.apple.rgb = function (apple) {
		return [(apple[0] / 65535) * 255, (apple[1] / 65535) * 255, (apple[2] / 65535) * 255];
	};

	convert.rgb.apple = function (rgb) {
		return [(rgb[0] / 255) * 65535, (rgb[1] / 255) * 65535, (rgb[2] / 255) * 65535];
	};

	convert.gray.rgb = function (args) {
		return [args[0] / 100 * 255, args[0] / 100 * 255, args[0] / 100 * 255];
	};

	convert.gray.hsl = function (args) {
		return [0, 0, args[0]];
	};

	convert.gray.hsv = convert.gray.hsl;

	convert.gray.hwb = function (gray) {
		return [0, 100, gray[0]];
	};

	convert.gray.cmyk = function (gray) {
		return [0, 0, 0, gray[0]];
	};

	convert.gray.lab = function (gray) {
		return [gray[0], 0, 0];
	};

	convert.gray.hex = function (gray) {
		const val = Math.round(gray[0] / 100 * 255) & 0xFF;
		const integer = (val << 16) + (val << 8) + val;

		const string = integer.toString(16).toUpperCase();
		return '000000'.substring(string.length) + string;
	};

	convert.rgb.gray = function (rgb) {
		const val = (rgb[0] + rgb[1] + rgb[2]) / 3;
		return [val / 255 * 100];
	};
	return conversions;
}

var route;
var hasRequiredRoute;

function requireRoute () {
	if (hasRequiredRoute) return route;
	hasRequiredRoute = 1;
	const conversions = requireConversions();

	/*
		This function routes a model to all other models.

		all functions that are routed have a property `.conversion` attached
		to the returned synthetic function. This property is an array
		of strings, each with the steps in between the 'from' and 'to'
		color models (inclusive).

		conversions that are not possible simply are not included.
	*/

	function buildGraph() {
		const graph = {};
		// https://jsperf.com/object-keys-vs-for-in-with-closure/3
		const models = Object.keys(conversions);

		for (let len = models.length, i = 0; i < len; i++) {
			graph[models[i]] = {
				// http://jsperf.com/1-vs-infinity
				// micro-opt, but this is simple.
				distance: -1,
				parent: null
			};
		}

		return graph;
	}

	// https://en.wikipedia.org/wiki/Breadth-first_search
	function deriveBFS(fromModel) {
		const graph = buildGraph();
		const queue = [fromModel]; // Unshift -> queue -> pop

		graph[fromModel].distance = 0;

		while (queue.length) {
			const current = queue.pop();
			const adjacents = Object.keys(conversions[current]);

			for (let len = adjacents.length, i = 0; i < len; i++) {
				const adjacent = adjacents[i];
				const node = graph[adjacent];

				if (node.distance === -1) {
					node.distance = graph[current].distance + 1;
					node.parent = current;
					queue.unshift(adjacent);
				}
			}
		}

		return graph;
	}

	function link(from, to) {
		return function (args) {
			return to(from(args));
		};
	}

	function wrapConversion(toModel, graph) {
		const path = [graph[toModel].parent, toModel];
		let fn = conversions[graph[toModel].parent][toModel];

		let cur = graph[toModel].parent;
		while (graph[cur].parent) {
			path.unshift(graph[cur].parent);
			fn = link(conversions[graph[cur].parent][cur], fn);
			cur = graph[cur].parent;
		}

		fn.conversion = path;
		return fn;
	}

	route = function (fromModel) {
		const graph = deriveBFS(fromModel);
		const conversion = {};

		const models = Object.keys(graph);
		for (let len = models.length, i = 0; i < len; i++) {
			const toModel = models[i];
			const node = graph[toModel];

			if (node.parent === null) {
				// No possible conversion, or this node is the source model.
				continue;
			}

			conversion[toModel] = wrapConversion(toModel, graph);
		}

		return conversion;
	};
	return route;
}

var colorConvert;
var hasRequiredColorConvert;

function requireColorConvert () {
	if (hasRequiredColorConvert) return colorConvert;
	hasRequiredColorConvert = 1;
	const conversions = requireConversions();
	const route = requireRoute();

	const convert = {};

	const models = Object.keys(conversions);

	function wrapRaw(fn) {
		const wrappedFn = function (...args) {
			const arg0 = args[0];
			if (arg0 === undefined || arg0 === null) {
				return arg0;
			}

			if (arg0.length > 1) {
				args = arg0;
			}

			return fn(args);
		};

		// Preserve .conversion property if there is one
		if ('conversion' in fn) {
			wrappedFn.conversion = fn.conversion;
		}

		return wrappedFn;
	}

	function wrapRounded(fn) {
		const wrappedFn = function (...args) {
			const arg0 = args[0];

			if (arg0 === undefined || arg0 === null) {
				return arg0;
			}

			if (arg0.length > 1) {
				args = arg0;
			}

			const result = fn(args);

			// We're assuming the result is an array here.
			// see notice in conversions.js; don't use box types
			// in conversion functions.
			if (typeof result === 'object') {
				for (let len = result.length, i = 0; i < len; i++) {
					result[i] = Math.round(result[i]);
				}
			}

			return result;
		};

		// Preserve .conversion property if there is one
		if ('conversion' in fn) {
			wrappedFn.conversion = fn.conversion;
		}

		return wrappedFn;
	}

	models.forEach(fromModel => {
		convert[fromModel] = {};

		Object.defineProperty(convert[fromModel], 'channels', {value: conversions[fromModel].channels});
		Object.defineProperty(convert[fromModel], 'labels', {value: conversions[fromModel].labels});

		const routes = route(fromModel);
		const routeModels = Object.keys(routes);

		routeModels.forEach(toModel => {
			const fn = routes[toModel];

			convert[fromModel][toModel] = wrapRounded(fn);
			convert[fromModel][toModel].raw = wrapRaw(fn);
		});
	});

	colorConvert = convert;
	return colorConvert;
}

ansiStyles.exports;

var hasRequiredAnsiStyles;

function requireAnsiStyles () {
	if (hasRequiredAnsiStyles) return ansiStyles.exports;
	hasRequiredAnsiStyles = 1;
	(function (module) {

		const wrapAnsi16 = (fn, offset) => (...args) => {
			const code = fn(...args);
			return `\u001B[${code + offset}m`;
		};

		const wrapAnsi256 = (fn, offset) => (...args) => {
			const code = fn(...args);
			return `\u001B[${38 + offset};5;${code}m`;
		};

		const wrapAnsi16m = (fn, offset) => (...args) => {
			const rgb = fn(...args);
			return `\u001B[${38 + offset};2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
		};

		const ansi2ansi = n => n;
		const rgb2rgb = (r, g, b) => [r, g, b];

		const setLazyProperty = (object, property, get) => {
			Object.defineProperty(object, property, {
				get: () => {
					const value = get();

					Object.defineProperty(object, property, {
						value,
						enumerable: true,
						configurable: true
					});

					return value;
				},
				enumerable: true,
				configurable: true
			});
		};

		/** @type {typeof import('color-convert')} */
		let colorConvert;
		const makeDynamicStyles = (wrap, targetSpace, identity, isBackground) => {
			if (colorConvert === undefined) {
				colorConvert = requireColorConvert();
			}

			const offset = isBackground ? 10 : 0;
			const styles = {};

			for (const [sourceSpace, suite] of Object.entries(colorConvert)) {
				const name = sourceSpace === 'ansi16' ? 'ansi' : sourceSpace;
				if (sourceSpace === targetSpace) {
					styles[name] = wrap(identity, offset);
				} else if (typeof suite === 'object') {
					styles[name] = wrap(suite[targetSpace], offset);
				}
			}

			return styles;
		};

		function assembleStyles() {
			const codes = new Map();
			const styles = {
				modifier: {
					reset: [0, 0],
					// 21 isn't widely supported and 22 does the same thing
					bold: [1, 22],
					dim: [2, 22],
					italic: [3, 23],
					underline: [4, 24],
					inverse: [7, 27],
					hidden: [8, 28],
					strikethrough: [9, 29]
				},
				color: {
					black: [30, 39],
					red: [31, 39],
					green: [32, 39],
					yellow: [33, 39],
					blue: [34, 39],
					magenta: [35, 39],
					cyan: [36, 39],
					white: [37, 39],

					// Bright color
					blackBright: [90, 39],
					redBright: [91, 39],
					greenBright: [92, 39],
					yellowBright: [93, 39],
					blueBright: [94, 39],
					magentaBright: [95, 39],
					cyanBright: [96, 39],
					whiteBright: [97, 39]
				},
				bgColor: {
					bgBlack: [40, 49],
					bgRed: [41, 49],
					bgGreen: [42, 49],
					bgYellow: [43, 49],
					bgBlue: [44, 49],
					bgMagenta: [45, 49],
					bgCyan: [46, 49],
					bgWhite: [47, 49],

					// Bright color
					bgBlackBright: [100, 49],
					bgRedBright: [101, 49],
					bgGreenBright: [102, 49],
					bgYellowBright: [103, 49],
					bgBlueBright: [104, 49],
					bgMagentaBright: [105, 49],
					bgCyanBright: [106, 49],
					bgWhiteBright: [107, 49]
				}
			};

			// Alias bright black as gray (and grey)
			styles.color.gray = styles.color.blackBright;
			styles.bgColor.bgGray = styles.bgColor.bgBlackBright;
			styles.color.grey = styles.color.blackBright;
			styles.bgColor.bgGrey = styles.bgColor.bgBlackBright;

			for (const [groupName, group] of Object.entries(styles)) {
				for (const [styleName, style] of Object.entries(group)) {
					styles[styleName] = {
						open: `\u001B[${style[0]}m`,
						close: `\u001B[${style[1]}m`
					};

					group[styleName] = styles[styleName];

					codes.set(style[0], style[1]);
				}

				Object.defineProperty(styles, groupName, {
					value: group,
					enumerable: false
				});
			}

			Object.defineProperty(styles, 'codes', {
				value: codes,
				enumerable: false
			});

			styles.color.close = '\u001B[39m';
			styles.bgColor.close = '\u001B[49m';

			setLazyProperty(styles.color, 'ansi', () => makeDynamicStyles(wrapAnsi16, 'ansi16', ansi2ansi, false));
			setLazyProperty(styles.color, 'ansi256', () => makeDynamicStyles(wrapAnsi256, 'ansi256', ansi2ansi, false));
			setLazyProperty(styles.color, 'ansi16m', () => makeDynamicStyles(wrapAnsi16m, 'rgb', rgb2rgb, false));
			setLazyProperty(styles.bgColor, 'ansi', () => makeDynamicStyles(wrapAnsi16, 'ansi16', ansi2ansi, true));
			setLazyProperty(styles.bgColor, 'ansi256', () => makeDynamicStyles(wrapAnsi256, 'ansi256', ansi2ansi, true));
			setLazyProperty(styles.bgColor, 'ansi16m', () => makeDynamicStyles(wrapAnsi16m, 'rgb', rgb2rgb, true));

			return styles;
		}

		// Make the export immutable
		Object.defineProperty(module, 'exports', {
			enumerable: true,
			get: assembleStyles
		}); 
	} (ansiStyles));
	return ansiStyles.exports;
}

var browser;
var hasRequiredBrowser;

function requireBrowser () {
	if (hasRequiredBrowser) return browser;
	hasRequiredBrowser = 1;
	browser = {
		stdout: false,
		stderr: false
	};
	return browser;
}

var util;
var hasRequiredUtil;

function requireUtil () {
	if (hasRequiredUtil) return util;
	hasRequiredUtil = 1;

	const stringReplaceAll = (string, substring, replacer) => {
		let index = string.indexOf(substring);
		if (index === -1) {
			return string;
		}

		const substringLength = substring.length;
		let endIndex = 0;
		let returnValue = '';
		do {
			returnValue += string.substr(endIndex, index - endIndex) + substring + replacer;
			endIndex = index + substringLength;
			index = string.indexOf(substring, endIndex);
		} while (index !== -1);

		returnValue += string.substr(endIndex);
		return returnValue;
	};

	const stringEncaseCRLFWithFirstIndex = (string, prefix, postfix, index) => {
		let endIndex = 0;
		let returnValue = '';
		do {
			const gotCR = string[index - 1] === '\r';
			returnValue += string.substr(endIndex, (gotCR ? index - 1 : index) - endIndex) + prefix + (gotCR ? '\r\n' : '\n') + postfix;
			endIndex = index + 1;
			index = string.indexOf('\n', endIndex);
		} while (index !== -1);

		returnValue += string.substr(endIndex);
		return returnValue;
	};

	util = {
		stringReplaceAll,
		stringEncaseCRLFWithFirstIndex
	};
	return util;
}

var templates;
var hasRequiredTemplates;

function requireTemplates () {
	if (hasRequiredTemplates) return templates;
	hasRequiredTemplates = 1;
	const TEMPLATE_REGEX = /(?:\\(u(?:[a-f\d]{4}|\{[a-f\d]{1,6}\})|x[a-f\d]{2}|.))|(?:\{(~)?(\w+(?:\([^)]*\))?(?:\.\w+(?:\([^)]*\))?)*)(?:[ \t]|(?=\r?\n)))|(\})|((?:.|[\r\n\f])+?)/gi;
	const STYLE_REGEX = /(?:^|\.)(\w+)(?:\(([^)]*)\))?/g;
	const STRING_REGEX = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/;
	const ESCAPE_REGEX = /\\(u(?:[a-f\d]{4}|{[a-f\d]{1,6}})|x[a-f\d]{2}|.)|([^\\])/gi;

	const ESCAPES = new Map([
		['n', '\n'],
		['r', '\r'],
		['t', '\t'],
		['b', '\b'],
		['f', '\f'],
		['v', '\v'],
		['0', '\0'],
		['\\', '\\'],
		['e', '\u001B'],
		['a', '\u0007']
	]);

	function unescape(c) {
		const u = c[0] === 'u';
		const bracket = c[1] === '{';

		if ((u && !bracket && c.length === 5) || (c[0] === 'x' && c.length === 3)) {
			return String.fromCharCode(parseInt(c.slice(1), 16));
		}

		if (u && bracket) {
			return String.fromCodePoint(parseInt(c.slice(2, -1), 16));
		}

		return ESCAPES.get(c) || c;
	}

	function parseArguments(name, arguments_) {
		const results = [];
		const chunks = arguments_.trim().split(/\s*,\s*/g);
		let matches;

		for (const chunk of chunks) {
			const number = Number(chunk);
			if (!Number.isNaN(number)) {
				results.push(number);
			} else if ((matches = chunk.match(STRING_REGEX))) {
				results.push(matches[2].replace(ESCAPE_REGEX, (m, escape, character) => escape ? unescape(escape) : character));
			} else {
				throw new Error(`Invalid Chalk template style argument: ${chunk} (in style '${name}')`);
			}
		}

		return results;
	}

	function parseStyle(style) {
		STYLE_REGEX.lastIndex = 0;

		const results = [];
		let matches;

		while ((matches = STYLE_REGEX.exec(style)) !== null) {
			const name = matches[1];

			if (matches[2]) {
				const args = parseArguments(name, matches[2]);
				results.push([name].concat(args));
			} else {
				results.push([name]);
			}
		}

		return results;
	}

	function buildStyle(chalk, styles) {
		const enabled = {};

		for (const layer of styles) {
			for (const style of layer.styles) {
				enabled[style[0]] = layer.inverse ? null : style.slice(1);
			}
		}

		let current = chalk;
		for (const [styleName, styles] of Object.entries(enabled)) {
			if (!Array.isArray(styles)) {
				continue;
			}

			if (!(styleName in current)) {
				throw new Error(`Unknown Chalk style: ${styleName}`);
			}

			current = styles.length > 0 ? current[styleName](...styles) : current[styleName];
		}

		return current;
	}

	templates = (chalk, temporary) => {
		const styles = [];
		const chunks = [];
		let chunk = [];

		// eslint-disable-next-line max-params
		temporary.replace(TEMPLATE_REGEX, (m, escapeCharacter, inverse, style, close, character) => {
			if (escapeCharacter) {
				chunk.push(unescape(escapeCharacter));
			} else if (style) {
				const string = chunk.join('');
				chunk = [];
				chunks.push(styles.length === 0 ? string : buildStyle(chalk, styles)(string));
				styles.push({inverse, styles: parseStyle(style)});
			} else if (close) {
				if (styles.length === 0) {
					throw new Error('Found extraneous } in Chalk template literal');
				}

				chunks.push(buildStyle(chalk, styles)(chunk.join('')));
				chunk = [];
				styles.pop();
			} else {
				chunk.push(character);
			}
		});

		chunks.push(chunk.join(''));

		if (styles.length > 0) {
			const errMessage = `Chalk template literal is missing ${styles.length} closing bracket${styles.length === 1 ? '' : 's'} (\`}\`)`;
			throw new Error(errMessage);
		}

		return chunks.join('');
	};
	return templates;
}

var source;
var hasRequiredSource;

function requireSource () {
	if (hasRequiredSource) return source;
	hasRequiredSource = 1;
	const ansiStyles = requireAnsiStyles();
	const {stdout: stdoutColor, stderr: stderrColor} = requireBrowser();
	const {
		stringReplaceAll,
		stringEncaseCRLFWithFirstIndex
	} = requireUtil();

	const {isArray} = Array;

	// `supportsColor.level` → `ansiStyles.color[name]` mapping
	const levelMapping = [
		'ansi',
		'ansi',
		'ansi256',
		'ansi16m'
	];

	const styles = Object.create(null);

	const applyOptions = (object, options = {}) => {
		if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
			throw new Error('The `level` option should be an integer from 0 to 3');
		}

		// Detect level if not set manually
		const colorLevel = stdoutColor ? stdoutColor.level : 0;
		object.level = options.level === undefined ? colorLevel : options.level;
	};

	class ChalkClass {
		constructor(options) {
			// eslint-disable-next-line no-constructor-return
			return chalkFactory(options);
		}
	}

	const chalkFactory = options => {
		const chalk = {};
		applyOptions(chalk, options);

		chalk.template = (...arguments_) => chalkTag(chalk.template, ...arguments_);

		Object.setPrototypeOf(chalk, Chalk.prototype);
		Object.setPrototypeOf(chalk.template, chalk);

		chalk.template.constructor = () => {
			throw new Error('`chalk.constructor()` is deprecated. Use `new chalk.Instance()` instead.');
		};

		chalk.template.Instance = ChalkClass;

		return chalk.template;
	};

	function Chalk(options) {
		return chalkFactory(options);
	}

	for (const [styleName, style] of Object.entries(ansiStyles)) {
		styles[styleName] = {
			get() {
				const builder = createBuilder(this, createStyler(style.open, style.close, this._styler), this._isEmpty);
				Object.defineProperty(this, styleName, {value: builder});
				return builder;
			}
		};
	}

	styles.visible = {
		get() {
			const builder = createBuilder(this, this._styler, true);
			Object.defineProperty(this, 'visible', {value: builder});
			return builder;
		}
	};

	const usedModels = ['rgb', 'hex', 'keyword', 'hsl', 'hsv', 'hwb', 'ansi', 'ansi256'];

	for (const model of usedModels) {
		styles[model] = {
			get() {
				const {level} = this;
				return function (...arguments_) {
					const styler = createStyler(ansiStyles.color[levelMapping[level]][model](...arguments_), ansiStyles.color.close, this._styler);
					return createBuilder(this, styler, this._isEmpty);
				};
			}
		};
	}

	for (const model of usedModels) {
		const bgModel = 'bg' + model[0].toUpperCase() + model.slice(1);
		styles[bgModel] = {
			get() {
				const {level} = this;
				return function (...arguments_) {
					const styler = createStyler(ansiStyles.bgColor[levelMapping[level]][model](...arguments_), ansiStyles.bgColor.close, this._styler);
					return createBuilder(this, styler, this._isEmpty);
				};
			}
		};
	}

	const proto = Object.defineProperties(() => {}, {
		...styles,
		level: {
			enumerable: true,
			get() {
				return this._generator.level;
			},
			set(level) {
				this._generator.level = level;
			}
		}
	});

	const createStyler = (open, close, parent) => {
		let openAll;
		let closeAll;
		if (parent === undefined) {
			openAll = open;
			closeAll = close;
		} else {
			openAll = parent.openAll + open;
			closeAll = close + parent.closeAll;
		}

		return {
			open,
			close,
			openAll,
			closeAll,
			parent
		};
	};

	const createBuilder = (self, _styler, _isEmpty) => {
		const builder = (...arguments_) => {
			if (isArray(arguments_[0]) && isArray(arguments_[0].raw)) {
				// Called as a template literal, for example: chalk.red`2 + 3 = {bold ${2+3}}`
				return applyStyle(builder, chalkTag(builder, ...arguments_));
			}

			// Single argument is hot path, implicit coercion is faster than anything
			// eslint-disable-next-line no-implicit-coercion
			return applyStyle(builder, (arguments_.length === 1) ? ('' + arguments_[0]) : arguments_.join(' '));
		};

		// We alter the prototype because we must return a function, but there is
		// no way to create a function with a different prototype
		Object.setPrototypeOf(builder, proto);

		builder._generator = self;
		builder._styler = _styler;
		builder._isEmpty = _isEmpty;

		return builder;
	};

	const applyStyle = (self, string) => {
		if (self.level <= 0 || !string) {
			return self._isEmpty ? '' : string;
		}

		let styler = self._styler;

		if (styler === undefined) {
			return string;
		}

		const {openAll, closeAll} = styler;
		if (string.indexOf('\u001B') !== -1) {
			while (styler !== undefined) {
				// Replace any instances already present with a re-opening code
				// otherwise only the part of the string until said closing code
				// will be colored, and the rest will simply be 'plain'.
				string = stringReplaceAll(string, styler.close, styler.open);

				styler = styler.parent;
			}
		}

		// We can move both next actions out of loop, because remaining actions in loop won't have
		// any/visible effect on parts we add here. Close the styling before a linebreak and reopen
		// after next line to fix a bleed issue on macOS: https://github.com/chalk/chalk/pull/92
		const lfIndex = string.indexOf('\n');
		if (lfIndex !== -1) {
			string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
		}

		return openAll + string + closeAll;
	};

	let template;
	const chalkTag = (chalk, ...strings) => {
		const [firstString] = strings;

		if (!isArray(firstString) || !isArray(firstString.raw)) {
			// If chalk() was called by itself or with a string,
			// return the string itself as a string.
			return strings.join(' ');
		}

		const arguments_ = strings.slice(1);
		const parts = [firstString.raw[0]];

		for (let i = 1; i < firstString.length; i++) {
			parts.push(
				String(arguments_[i - 1]).replace(/[{}\\]/g, '\\$&'),
				String(firstString.raw[i])
			);
		}

		if (template === undefined) {
			template = requireTemplates();
		}

		return template(chalk, parts.join(''));
	};

	Object.defineProperties(Chalk.prototype, styles);

	const chalk = Chalk(); // eslint-disable-line new-cap
	chalk.supportsColor = stdoutColor;
	chalk.stderr = Chalk({level: stderrColor ? stderrColor.level : 0}); // eslint-disable-line new-cap
	chalk.stderr.supportsColor = stderrColor;

	source = chalk;
	return source;
}

var sourceExports = requireSource();
const chalk = /*@__PURE__*/getDefaultExportFromCjs(sourceExports);

var ansiStylesExports = requireAnsiStyles();
const style = /*@__PURE__*/getDefaultExportFromCjs(ansiStylesExports);

const getKeysOfEnumerableProperties = (object, compareKeys) => {
  const rawKeys = Object.keys(object);
  const keys = compareKeys === null ? rawKeys : rawKeys.sort(compareKeys);
  if (Object.getOwnPropertySymbols) {
    for (const symbol of Object.getOwnPropertySymbols(object)) {
      if (Object.getOwnPropertyDescriptor(object, symbol).enumerable) {
        keys.push(symbol);
      }
    }
  }
  return keys;
};
function printIteratorEntries(iterator, config, indentation, depth, refs, printer, separator = ": ") {
  let result = "";
  let width = 0;
  let current = iterator.next();
  if (!current.done) {
    result += config.spacingOuter;
    const indentationNext = indentation + config.indent;
    while (!current.done) {
      result += indentationNext;
      if (width++ === config.maxWidth) {
        result += "…";
        break;
      }
      const name = printer(
        current.value[0],
        config,
        indentationNext,
        depth,
        refs
      );
      const value = printer(
        current.value[1],
        config,
        indentationNext,
        depth,
        refs
      );
      result += name + separator + value;
      current = iterator.next();
      if (!current.done) {
        result += `,${config.spacingInner}`;
      } else if (!config.min) {
        result += ",";
      }
    }
    result += config.spacingOuter + indentation;
  }
  return result;
}
function printIteratorValues(iterator, config, indentation, depth, refs, printer) {
  let result = "";
  let width = 0;
  let current = iterator.next();
  if (!current.done) {
    result += config.spacingOuter;
    const indentationNext = indentation + config.indent;
    while (!current.done) {
      result += indentationNext;
      if (width++ === config.maxWidth) {
        result += "…";
        break;
      }
      result += printer(current.value, config, indentationNext, depth, refs);
      current = iterator.next();
      if (!current.done) {
        result += `,${config.spacingInner}`;
      } else if (!config.min) {
        result += ",";
      }
    }
    result += config.spacingOuter + indentation;
  }
  return result;
}
function printListItems(list, config, indentation, depth, refs, printer) {
  let result = "";
  list = list instanceof ArrayBuffer ? new DataView(list) : list;
  const isDataView = (l) => l instanceof DataView;
  const length = isDataView(list) ? list.byteLength : list.length;
  if (length > 0) {
    result += config.spacingOuter;
    const indentationNext = indentation + config.indent;
    for (let i = 0; i < length; i++) {
      result += indentationNext;
      if (i === config.maxWidth) {
        result += "…";
        break;
      }
      if (isDataView(list) || i in list) {
        result += printer(
          isDataView(list) ? list.getInt8(i) : list[i],
          config,
          indentationNext,
          depth,
          refs
        );
      }
      if (i < length - 1) {
        result += `,${config.spacingInner}`;
      } else if (!config.min) {
        result += ",";
      }
    }
    result += config.spacingOuter + indentation;
  }
  return result;
}
function printObjectProperties(val, config, indentation, depth, refs, printer) {
  let result = "";
  const keys = getKeysOfEnumerableProperties(val, config.compareKeys);
  if (keys.length > 0) {
    result += config.spacingOuter;
    const indentationNext = indentation + config.indent;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const name = printer(key, config, indentationNext, depth, refs);
      const value = printer(val[key], config, indentationNext, depth, refs);
      result += `${indentationNext + name}: ${value}`;
      if (i < keys.length - 1) {
        result += `,${config.spacingInner}`;
      } else if (!config.min) {
        result += ",";
      }
    }
    result += config.spacingOuter + indentation;
  }
  return result;
}

const asymmetricMatcher = typeof Symbol === "function" && Symbol.for ? Symbol.for("jest.asymmetricMatcher") : 1267621;
const SPACE$2 = " ";
const serialize$5 = (val, config, indentation, depth, refs, printer) => {
  const stringedValue = val.toString();
  if (stringedValue === "ArrayContaining" || stringedValue === "ArrayNotContaining") {
    if (++depth > config.maxDepth) {
      return `[${stringedValue}]`;
    }
    return `${stringedValue + SPACE$2}[${printListItems(
      val.sample,
      config,
      indentation,
      depth,
      refs,
      printer
    )}]`;
  }
  if (stringedValue === "ObjectContaining" || stringedValue === "ObjectNotContaining") {
    if (++depth > config.maxDepth) {
      return `[${stringedValue}]`;
    }
    return `${stringedValue + SPACE$2}{${printObjectProperties(
      val.sample,
      config,
      indentation,
      depth,
      refs,
      printer
    )}}`;
  }
  if (stringedValue === "StringMatching" || stringedValue === "StringNotMatching") {
    return stringedValue + SPACE$2 + printer(val.sample, config, indentation, depth, refs);
  }
  if (stringedValue === "StringContaining" || stringedValue === "StringNotContaining") {
    return stringedValue + SPACE$2 + printer(val.sample, config, indentation, depth, refs);
  }
  if (stringedValue === "ArrayOf" || stringedValue === "NotArrayOf") {
    if (++depth > config.maxDepth) {
      return `[${stringedValue}]`;
    }
    return `${stringedValue + SPACE$2}${printer(
      val.sample,
      config,
      indentation,
      depth,
      refs
    )}`;
  }
  if (typeof val.toAsymmetricMatcher !== "function") {
    throw new TypeError(
      `Asymmetric matcher ${val.constructor.name} does not implement toAsymmetricMatcher()`
    );
  }
  return val.toAsymmetricMatcher();
};
const test$5 = (val) => val && val.$$typeof === asymmetricMatcher;
const plugin$5 = { serialize: serialize$5, test: test$5 };

const SPACE$1 = " ";
const OBJECT_NAMES = /* @__PURE__ */ new Set(["DOMStringMap", "NamedNodeMap"]);
const ARRAY_REGEXP = /^(HTML\w*Collection|NodeList)$/;
const testName = (name) => OBJECT_NAMES.has(name) || ARRAY_REGEXP.test(name);
const test$4 = (val) => val && val.constructor && !!val.constructor.name && testName(val.constructor.name);
const isNamedNodeMap = (collection) => collection.constructor.name === "NamedNodeMap";
const serialize$4 = (collection, config, indentation, depth, refs, printer) => {
  const name = collection.constructor.name;
  if (++depth > config.maxDepth) {
    return `[${name}]`;
  }
  return (config.min ? "" : name + SPACE$1) + (OBJECT_NAMES.has(name) ? `{${printObjectProperties(
    isNamedNodeMap(collection) ? [...collection].reduce(
      (props, attribute) => {
        props[attribute.name] = attribute.value;
        return props;
      },
      {}
    ) : { ...collection },
    config,
    indentation,
    depth,
    refs,
    printer
  )}}` : `[${printListItems(
    [...collection],
    config,
    indentation,
    depth,
    refs,
    printer
  )}]`);
};
const plugin$4 = { serialize: serialize$4, test: test$4 };

function escapeHTML(str) {
  return str.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const printProps = (keys, props, config, indentation, depth, refs, printer) => {
  const indentationNext = indentation + config.indent;
  const colors = config.colors;
  return keys.map((key) => {
    const value = props[key];
    let printed = printer(value, config, indentationNext, depth, refs);
    if (typeof value !== "string") {
      if (printed.includes("\n")) {
        printed = config.spacingOuter + indentationNext + printed + config.spacingOuter + indentation;
      }
      printed = `{${printed}}`;
    }
    return `${config.spacingInner + indentation + colors.prop.open + key + colors.prop.close}=${colors.value.open}${printed}${colors.value.close}`;
  }).join("");
};
const printChildren = (children, config, indentation, depth, refs, printer) => children.map(
  (child) => config.spacingOuter + indentation + (typeof child === "string" ? printText(child, config) : printer(child, config, indentation, depth, refs))
).join("");
const printText = (text, config) => {
  const contentColor = config.colors.content;
  return contentColor.open + escapeHTML(text) + contentColor.close;
};
const printComment = (comment, config) => {
  const commentColor = config.colors.comment;
  return `${commentColor.open}<!--${escapeHTML(comment)}-->${commentColor.close}`;
};
const printElement = (type, printedProps, printedChildren, config, indentation) => {
  const tagColor = config.colors.tag;
  return `${tagColor.open}<${type}${printedProps && tagColor.close + printedProps + config.spacingOuter + indentation + tagColor.open}${printedChildren ? `>${tagColor.close}${printedChildren}${config.spacingOuter}${indentation}${tagColor.open}</${type}` : `${printedProps && !config.min ? "" : " "}/`}>${tagColor.close}`;
};
const printElementAsLeaf = (type, config) => {
  const tagColor = config.colors.tag;
  return `${tagColor.open}<${type}${tagColor.close} …${tagColor.open} />${tagColor.close}`;
};

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const FRAGMENT_NODE = 11;
const ELEMENT_REGEXP = /^((HTML|SVG)\w*)?Element$/;
const testHasAttribute = (val) => {
  try {
    return typeof val.hasAttribute === "function" && val.hasAttribute("is");
  } catch {
    return false;
  }
};
const isCustomElement = (val) => {
  const tagName = val?.tagName;
  return typeof tagName === "string" && tagName.includes("-") || testHasAttribute(val);
};
const testNode = (val) => {
  const constructorName = val.constructor.name;
  const { nodeType } = val;
  return nodeType === ELEMENT_NODE && (ELEMENT_REGEXP.test(constructorName) || isCustomElement(val)) || nodeType === TEXT_NODE && constructorName === "Text" || nodeType === COMMENT_NODE && constructorName === "Comment" || nodeType === FRAGMENT_NODE && constructorName === "DocumentFragment";
};
const test$3 = (val) => (val?.constructor?.name || isCustomElement(val)) && testNode(val);
function nodeIsText(node) {
  return node.nodeType === TEXT_NODE;
}
function nodeIsComment(node) {
  return node.nodeType === COMMENT_NODE;
}
function nodeIsFragment(node) {
  return node.nodeType === FRAGMENT_NODE;
}
const serialize$3 = (node, config, indentation, depth, refs, printer) => {
  if (nodeIsText(node)) {
    return printText(node.data, config);
  }
  if (nodeIsComment(node)) {
    return printComment(node.data, config);
  }
  const type = nodeIsFragment(node) ? "DocumentFragment" : node.tagName.toLowerCase();
  if (++depth > config.maxDepth) {
    return printElementAsLeaf(type, config);
  }
  return printElement(
    type,
    printProps(
      nodeIsFragment(node) ? [] : Array.from(node.attributes, (attr) => attr.name).sort(),
      nodeIsFragment(node) ? {} : [...node.attributes].reduce(
        (props, attribute) => {
          props[attribute.name] = attribute.value;
          return props;
        },
        {}
      ),
      config,
      indentation + config.indent,
      depth,
      refs,
      printer
    ),
    printChildren(
      Array.prototype.slice.call(node.childNodes || node.children),
      config,
      indentation + config.indent,
      depth,
      refs,
      printer
    ),
    config,
    indentation
  );
};
const plugin$3 = { serialize: serialize$3, test: test$3 };

const IS_ITERABLE_SENTINEL = "@@__IMMUTABLE_ITERABLE__@@";
const IS_LIST_SENTINEL = "@@__IMMUTABLE_LIST__@@";
const IS_KEYED_SENTINEL = "@@__IMMUTABLE_KEYED__@@";
const IS_MAP_SENTINEL = "@@__IMMUTABLE_MAP__@@";
const IS_ORDERED_SENTINEL = "@@__IMMUTABLE_ORDERED__@@";
const IS_RECORD_SENTINEL = "@@__IMMUTABLE_RECORD__@@";
const IS_SEQ_SENTINEL = "@@__IMMUTABLE_SEQ__@@";
const IS_SET_SENTINEL = "@@__IMMUTABLE_SET__@@";
const IS_STACK_SENTINEL = "@@__IMMUTABLE_STACK__@@";
const getImmutableName = (name) => `Immutable.${name}`;
const printAsLeaf = (name) => `[${name}]`;
const SPACE = " ";
const LAZY = "…";
const printImmutableEntries = (val, config, indentation, depth, refs, printer, type) => ++depth > config.maxDepth ? printAsLeaf(getImmutableName(type)) : `${getImmutableName(type) + SPACE}{${printIteratorEntries(
  val.entries(),
  config,
  indentation,
  depth,
  refs,
  printer
)}}`;
function getRecordEntries(val) {
  let i = 0;
  return {
    next() {
      if (i < val._keys.length) {
        const key = val._keys[i++];
        return { done: false, value: [key, val.get(key)] };
      }
      return { done: true, value: void 0 };
    }
  };
}
const printImmutableRecord = (val, config, indentation, depth, refs, printer) => {
  const name = getImmutableName(val._name || "Record");
  return ++depth > config.maxDepth ? printAsLeaf(name) : `${name + SPACE}{${printIteratorEntries(
    getRecordEntries(val),
    config,
    indentation,
    depth,
    refs,
    printer
  )}}`;
};
const printImmutableSeq = (val, config, indentation, depth, refs, printer) => {
  const name = getImmutableName("Seq");
  if (++depth > config.maxDepth) {
    return printAsLeaf(name);
  }
  if (val[IS_KEYED_SENTINEL]) {
    return `${name + SPACE}{${// from Immutable collection of entries or from ECMAScript object
    val._iter || val._object ? printIteratorEntries(
      val.entries(),
      config,
      indentation,
      depth,
      refs,
      printer
    ) : LAZY}}`;
  }
  return `${name + SPACE}[${val._iter || // from Immutable collection of values
  val._array || // from ECMAScript array
  val._collection || // from ECMAScript collection in immutable v4
  val._iterable ? printIteratorValues(
    val.values(),
    config,
    indentation,
    depth,
    refs,
    printer
  ) : LAZY}]`;
};
const printImmutableValues = (val, config, indentation, depth, refs, printer, type) => ++depth > config.maxDepth ? printAsLeaf(getImmutableName(type)) : `${getImmutableName(type) + SPACE}[${printIteratorValues(
  val.values(),
  config,
  indentation,
  depth,
  refs,
  printer
)}]`;
const serialize$2 = (val, config, indentation, depth, refs, printer) => {
  if (val[IS_MAP_SENTINEL]) {
    return printImmutableEntries(
      val,
      config,
      indentation,
      depth,
      refs,
      printer,
      val[IS_ORDERED_SENTINEL] ? "OrderedMap" : "Map"
    );
  }
  if (val[IS_LIST_SENTINEL]) {
    return printImmutableValues(
      val,
      config,
      indentation,
      depth,
      refs,
      printer,
      "List"
    );
  }
  if (val[IS_SET_SENTINEL]) {
    return printImmutableValues(
      val,
      config,
      indentation,
      depth,
      refs,
      printer,
      val[IS_ORDERED_SENTINEL] ? "OrderedSet" : "Set"
    );
  }
  if (val[IS_STACK_SENTINEL]) {
    return printImmutableValues(
      val,
      config,
      indentation,
      depth,
      refs,
      printer,
      "Stack"
    );
  }
  if (val[IS_SEQ_SENTINEL]) {
    return printImmutableSeq(val, config, indentation, depth, refs, printer);
  }
  return printImmutableRecord(val, config, indentation, depth, refs, printer);
};
const test$2 = (val) => val && (val[IS_ITERABLE_SENTINEL] === true || val[IS_RECORD_SENTINEL] === true);
const plugin$2 = { serialize: serialize$2, test: test$2 };

var reactIs = {exports: {}};

var reactIs_production_min = {};

/**
 * @license React
 * react-is.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

var hasRequiredReactIs_production_min;

function requireReactIs_production_min () {
	if (hasRequiredReactIs_production_min) return reactIs_production_min;
	hasRequiredReactIs_production_min = 1;
var b=Symbol.for("react.element"),c=Symbol.for("react.portal"),d=Symbol.for("react.fragment"),e=Symbol.for("react.strict_mode"),f=Symbol.for("react.profiler"),g=Symbol.for("react.provider"),h=Symbol.for("react.context"),k=Symbol.for("react.server_context"),l=Symbol.for("react.forward_ref"),m=Symbol.for("react.suspense"),n=Symbol.for("react.suspense_list"),p=Symbol.for("react.memo"),q=Symbol.for("react.lazy"),t=Symbol.for("react.offscreen"),u;u=Symbol.for("react.module.reference");
	function v(a){if("object"===typeof a&&null!==a){var r=a.$$typeof;switch(r){case b:switch(a=a.type,a){case d:case f:case e:case m:case n:return a;default:switch(a=a&&a.$$typeof,a){case k:case h:case l:case q:case p:case g:return a;default:return r}}case c:return r}}}reactIs_production_min.ContextConsumer=h;reactIs_production_min.ContextProvider=g;reactIs_production_min.Element=b;reactIs_production_min.ForwardRef=l;reactIs_production_min.Fragment=d;reactIs_production_min.Lazy=q;reactIs_production_min.Memo=p;reactIs_production_min.Portal=c;reactIs_production_min.Profiler=f;reactIs_production_min.StrictMode=e;reactIs_production_min.Suspense=m;
	reactIs_production_min.SuspenseList=n;reactIs_production_min.isAsyncMode=function(){return  false};reactIs_production_min.isConcurrentMode=function(){return  false};reactIs_production_min.isContextConsumer=function(a){return v(a)===h};reactIs_production_min.isContextProvider=function(a){return v(a)===g};reactIs_production_min.isElement=function(a){return "object"===typeof a&&null!==a&&a.$$typeof===b};reactIs_production_min.isForwardRef=function(a){return v(a)===l};reactIs_production_min.isFragment=function(a){return v(a)===d};reactIs_production_min.isLazy=function(a){return v(a)===q};reactIs_production_min.isMemo=function(a){return v(a)===p};
	reactIs_production_min.isPortal=function(a){return v(a)===c};reactIs_production_min.isProfiler=function(a){return v(a)===f};reactIs_production_min.isStrictMode=function(a){return v(a)===e};reactIs_production_min.isSuspense=function(a){return v(a)===m};reactIs_production_min.isSuspenseList=function(a){return v(a)===n};
	reactIs_production_min.isValidElementType=function(a){return "string"===typeof a||"function"===typeof a||a===d||a===f||a===e||a===m||a===n||a===t||"object"===typeof a&&null!==a&&(a.$$typeof===q||a.$$typeof===p||a.$$typeof===g||a.$$typeof===h||a.$$typeof===l||a.$$typeof===u||void 0!==a.getModuleId)?true:false};reactIs_production_min.typeOf=v;
	return reactIs_production_min;
}

var reactIs_development = {};

/**
 * @license React
 * react-is.development.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

var hasRequiredReactIs_development;

function requireReactIs_development () {
	if (hasRequiredReactIs_development) return reactIs_development;
	hasRequiredReactIs_development = 1;

	if (process.env.NODE_ENV !== "production") {
	  (function() {

	// ATTENTION
	// When adding new symbols to this file,
	// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'
	// The Symbol used to tag the ReactElement-like types.
	var REACT_ELEMENT_TYPE = Symbol.for('react.element');
	var REACT_PORTAL_TYPE = Symbol.for('react.portal');
	var REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
	var REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode');
	var REACT_PROFILER_TYPE = Symbol.for('react.profiler');
	var REACT_PROVIDER_TYPE = Symbol.for('react.provider');
	var REACT_CONTEXT_TYPE = Symbol.for('react.context');
	var REACT_SERVER_CONTEXT_TYPE = Symbol.for('react.server_context');
	var REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
	var REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
	var REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list');
	var REACT_MEMO_TYPE = Symbol.for('react.memo');
	var REACT_LAZY_TYPE = Symbol.for('react.lazy');
	var REACT_OFFSCREEN_TYPE = Symbol.for('react.offscreen');

	// -----------------------------------------------------------------------------

	var enableScopeAPI = false; // Experimental Create Event Handle API.
	var enableCacheElement = false;
	var enableTransitionTracing = false; // No known bugs, but needs performance testing

	var enableLegacyHidden = false; // Enables unstable_avoidThisFallback feature in Fiber
	// stuff. Intended to enable React core members to more easily debug scheduling
	// issues in DEV builds.

	var enableDebugTracing = false; // Track which Fiber(s) schedule render work.

	var REACT_MODULE_REFERENCE;

	{
	  REACT_MODULE_REFERENCE = Symbol.for('react.module.reference');
	}

	function isValidElementType(type) {
	  if (typeof type === 'string' || typeof type === 'function') {
	    return true;
	  } // Note: typeof might be other than 'symbol' or 'number' (e.g. if it's a polyfill).


	  if (type === REACT_FRAGMENT_TYPE || type === REACT_PROFILER_TYPE || enableDebugTracing  || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || enableLegacyHidden  || type === REACT_OFFSCREEN_TYPE || enableScopeAPI  || enableCacheElement  || enableTransitionTracing ) {
	    return true;
	  }

	  if (typeof type === 'object' && type !== null) {
	    if (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || // This needs to include all possible module reference object
	    // types supported by any Flight configuration anywhere since
	    // we don't know which Flight build this will end up being used
	    // with.
	    type.$$typeof === REACT_MODULE_REFERENCE || type.getModuleId !== undefined) {
	      return true;
	    }
	  }

	  return false;
	}

	function typeOf(object) {
	  if (typeof object === 'object' && object !== null) {
	    var $$typeof = object.$$typeof;

	    switch ($$typeof) {
	      case REACT_ELEMENT_TYPE:
	        var type = object.type;

	        switch (type) {
	          case REACT_FRAGMENT_TYPE:
	          case REACT_PROFILER_TYPE:
	          case REACT_STRICT_MODE_TYPE:
	          case REACT_SUSPENSE_TYPE:
	          case REACT_SUSPENSE_LIST_TYPE:
	            return type;

	          default:
	            var $$typeofType = type && type.$$typeof;

	            switch ($$typeofType) {
	              case REACT_SERVER_CONTEXT_TYPE:
	              case REACT_CONTEXT_TYPE:
	              case REACT_FORWARD_REF_TYPE:
	              case REACT_LAZY_TYPE:
	              case REACT_MEMO_TYPE:
	              case REACT_PROVIDER_TYPE:
	                return $$typeofType;

	              default:
	                return $$typeof;
	            }

	        }

	      case REACT_PORTAL_TYPE:
	        return $$typeof;
	    }
	  }

	  return undefined;
	}
	var ContextConsumer = REACT_CONTEXT_TYPE;
	var ContextProvider = REACT_PROVIDER_TYPE;
	var Element = REACT_ELEMENT_TYPE;
	var ForwardRef = REACT_FORWARD_REF_TYPE;
	var Fragment = REACT_FRAGMENT_TYPE;
	var Lazy = REACT_LAZY_TYPE;
	var Memo = REACT_MEMO_TYPE;
	var Portal = REACT_PORTAL_TYPE;
	var Profiler = REACT_PROFILER_TYPE;
	var StrictMode = REACT_STRICT_MODE_TYPE;
	var Suspense = REACT_SUSPENSE_TYPE;
	var SuspenseList = REACT_SUSPENSE_LIST_TYPE;
	var hasWarnedAboutDeprecatedIsAsyncMode = false;
	var hasWarnedAboutDeprecatedIsConcurrentMode = false; // AsyncMode should be deprecated

	function isAsyncMode(object) {
	  {
	    if (!hasWarnedAboutDeprecatedIsAsyncMode) {
	      hasWarnedAboutDeprecatedIsAsyncMode = true; // Using console['warn'] to evade Babel and ESLint

	      console['warn']('The ReactIs.isAsyncMode() alias has been deprecated, ' + 'and will be removed in React 18+.');
	    }
	  }

	  return false;
	}
	function isConcurrentMode(object) {
	  {
	    if (!hasWarnedAboutDeprecatedIsConcurrentMode) {
	      hasWarnedAboutDeprecatedIsConcurrentMode = true; // Using console['warn'] to evade Babel and ESLint

	      console['warn']('The ReactIs.isConcurrentMode() alias has been deprecated, ' + 'and will be removed in React 18+.');
	    }
	  }

	  return false;
	}
	function isContextConsumer(object) {
	  return typeOf(object) === REACT_CONTEXT_TYPE;
	}
	function isContextProvider(object) {
	  return typeOf(object) === REACT_PROVIDER_TYPE;
	}
	function isElement(object) {
	  return typeof object === 'object' && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
	}
	function isForwardRef(object) {
	  return typeOf(object) === REACT_FORWARD_REF_TYPE;
	}
	function isFragment(object) {
	  return typeOf(object) === REACT_FRAGMENT_TYPE;
	}
	function isLazy(object) {
	  return typeOf(object) === REACT_LAZY_TYPE;
	}
	function isMemo(object) {
	  return typeOf(object) === REACT_MEMO_TYPE;
	}
	function isPortal(object) {
	  return typeOf(object) === REACT_PORTAL_TYPE;
	}
	function isProfiler(object) {
	  return typeOf(object) === REACT_PROFILER_TYPE;
	}
	function isStrictMode(object) {
	  return typeOf(object) === REACT_STRICT_MODE_TYPE;
	}
	function isSuspense(object) {
	  return typeOf(object) === REACT_SUSPENSE_TYPE;
	}
	function isSuspenseList(object) {
	  return typeOf(object) === REACT_SUSPENSE_LIST_TYPE;
	}

	reactIs_development.ContextConsumer = ContextConsumer;
	reactIs_development.ContextProvider = ContextProvider;
	reactIs_development.Element = Element;
	reactIs_development.ForwardRef = ForwardRef;
	reactIs_development.Fragment = Fragment;
	reactIs_development.Lazy = Lazy;
	reactIs_development.Memo = Memo;
	reactIs_development.Portal = Portal;
	reactIs_development.Profiler = Profiler;
	reactIs_development.StrictMode = StrictMode;
	reactIs_development.Suspense = Suspense;
	reactIs_development.SuspenseList = SuspenseList;
	reactIs_development.isAsyncMode = isAsyncMode;
	reactIs_development.isConcurrentMode = isConcurrentMode;
	reactIs_development.isContextConsumer = isContextConsumer;
	reactIs_development.isContextProvider = isContextProvider;
	reactIs_development.isElement = isElement;
	reactIs_development.isForwardRef = isForwardRef;
	reactIs_development.isFragment = isFragment;
	reactIs_development.isLazy = isLazy;
	reactIs_development.isMemo = isMemo;
	reactIs_development.isPortal = isPortal;
	reactIs_development.isProfiler = isProfiler;
	reactIs_development.isStrictMode = isStrictMode;
	reactIs_development.isSuspense = isSuspense;
	reactIs_development.isSuspenseList = isSuspenseList;
	reactIs_development.isValidElementType = isValidElementType;
	reactIs_development.typeOf = typeOf;
	  })();
	}
	return reactIs_development;
}

var hasRequiredReactIs;

function requireReactIs () {
	if (hasRequiredReactIs) return reactIs.exports;
	hasRequiredReactIs = 1;

	if (process.env.NODE_ENV === 'production') {
	  reactIs.exports = requireReactIs_production_min();
	} else {
	  reactIs.exports = requireReactIs_development();
	}
	return reactIs.exports;
}

var reactIsExports = requireReactIs();

const getChildren = (arg, children = []) => {
  if (Array.isArray(arg)) {
    for (const item of arg) {
      getChildren(item, children);
    }
  } else if (arg != null && arg !== false && arg !== "") {
    children.push(arg);
  }
  return children;
};
const getType = (element) => {
  const type = element.type;
  if (typeof type === "string") {
    return type;
  }
  if (typeof type === "function") {
    return type.displayName || type.name || "Unknown";
  }
  if (reactIsExports.isFragment(element)) {
    return "React.Fragment";
  }
  if (reactIsExports.isSuspense(element)) {
    return "React.Suspense";
  }
  if (typeof type === "object" && type !== null) {
    if (reactIsExports.isContextProvider(element)) {
      return "Context.Provider";
    }
    if (reactIsExports.isContextConsumer(element)) {
      return "Context.Consumer";
    }
    if (reactIsExports.isForwardRef(element)) {
      if (type.displayName) {
        return type.displayName;
      }
      const functionName = type.render.displayName || type.render.name || "";
      return functionName === "" ? "ForwardRef" : `ForwardRef(${functionName})`;
    }
    if (reactIsExports.isMemo(element)) {
      const functionName = type.displayName || type.type.displayName || type.type.name || "";
      return functionName === "" ? "Memo" : `Memo(${functionName})`;
    }
  }
  return "UNDEFINED";
};
const getPropKeys$1 = (element) => {
  const { props } = element;
  return Object.keys(props).filter((key) => key !== "children" && props[key] !== void 0).sort();
};
const serialize$1 = (element, config, indentation, depth, refs, printer) => ++depth > config.maxDepth ? printElementAsLeaf(getType(element), config) : printElement(
  getType(element),
  printProps(
    getPropKeys$1(element),
    element.props,
    config,
    indentation + config.indent,
    depth,
    refs,
    printer
  ),
  printChildren(
    getChildren(element.props.children),
    config,
    indentation + config.indent,
    depth,
    refs,
    printer
  ),
  config,
  indentation
);
const test$1 = (val) => val != null && reactIsExports.isElement(val);
const plugin$1 = { serialize: serialize$1, test: test$1 };

const testSymbol = typeof Symbol === "function" && Symbol.for ? Symbol.for("react.test.json") : 245830487;
const getPropKeys = (object) => {
  const { props } = object;
  return props ? Object.keys(props).filter((key) => props[key] !== void 0).sort() : [];
};
const serialize = (object, config, indentation, depth, refs, printer) => ++depth > config.maxDepth ? printElementAsLeaf(object.type, config) : printElement(
  object.type,
  object.props ? printProps(
    getPropKeys(object),
    object.props,
    config,
    indentation + config.indent,
    depth,
    refs,
    printer
  ) : "",
  object.children ? printChildren(
    object.children,
    config,
    indentation + config.indent,
    depth,
    refs,
    printer
  ) : "",
  config,
  indentation
);
const test = (val) => val && val.$$typeof === testSymbol;
const plugin = { serialize, test };

const toString = Object.prototype.toString;
const toISOString = Date.prototype.toISOString;
const errorToString = Error.prototype.toString;
const regExpToString = RegExp.prototype.toString;
const getConstructorName = (val) => typeof val.constructor === "function" && val.constructor.name || "Object";
const isWindow = (val) => (
  // eslint-disable-next-line unicorn/prefer-global-this
  typeof window !== "undefined" && val === window
);
const SYMBOL_REGEXP = /^Symbol\((.*)\)(.*)$/;
const NEWLINE_REGEXP = /\n/gi;
class PrettyFormatPluginError extends Error {
  constructor(message, stack) {
    super(message);
    this.stack = stack;
    this.name = this.constructor.name;
  }
}
function isToStringedArrayType(toStringed) {
  return toStringed === "[object Array]" || toStringed === "[object ArrayBuffer]" || toStringed === "[object DataView]" || toStringed === "[object Float32Array]" || toStringed === "[object Float64Array]" || toStringed === "[object Int8Array]" || toStringed === "[object Int16Array]" || toStringed === "[object Int32Array]" || toStringed === "[object Uint8Array]" || toStringed === "[object Uint8ClampedArray]" || toStringed === "[object Uint16Array]" || toStringed === "[object Uint32Array]";
}
function printNumber(val) {
  return Object.is(val, -0) ? "-0" : String(val);
}
function printBigInt(val) {
  return String(`${val}n`);
}
function printFunction(val, printFunctionName) {
  if (!printFunctionName) {
    return "[Function]";
  }
  return `[Function ${val.name || "anonymous"}]`;
}
function printSymbol(val) {
  return String(val).replace(SYMBOL_REGEXP, "Symbol($1)");
}
function printError(val) {
  return `[${errorToString.call(val)}]`;
}
function printBasicValue(val, printFunctionName, escapeRegex, escapeString) {
  if (val === true || val === false) {
    return `${val}`;
  }
  if (val === void 0) {
    return "undefined";
  }
  if (val === null) {
    return "null";
  }
  const typeOf = typeof val;
  if (typeOf === "number") {
    return printNumber(val);
  }
  if (typeOf === "bigint") {
    return printBigInt(val);
  }
  if (typeOf === "string") {
    if (escapeString) {
      return `"${val.replaceAll(/"|\\/g, "\\$&")}"`;
    }
    return `"${val}"`;
  }
  if (typeOf === "function") {
    return printFunction(val, printFunctionName);
  }
  if (typeOf === "symbol") {
    return printSymbol(val);
  }
  const toStringed = toString.call(val);
  if (toStringed === "[object Promise]") {
    return "Promise {}";
  }
  if (toStringed === "[object WeakMap]") {
    return "WeakMap {}";
  }
  if (toStringed === "[object WeakSet]") {
    return "WeakSet {}";
  }
  if (toStringed === "[object Function]" || toStringed === "[object GeneratorFunction]") {
    return printFunction(val, printFunctionName);
  }
  if (toStringed === "[object Symbol]") {
    return printSymbol(val);
  }
  if (toStringed === "[object Date]") {
    return Number.isNaN(+val) ? "Date { NaN }" : toISOString.call(val);
  }
  if (toStringed === "[object Error]") {
    return printError(val);
  }
  if (toStringed === "[object RegExp]") {
    if (escapeRegex) {
      return regExpToString.call(val).replaceAll(/[$()*+.?[\\\]^{|}]/g, "\\$&");
    }
    return regExpToString.call(val);
  }
  if (val instanceof Error) {
    return printError(val);
  }
  return null;
}
function printComplexValue(val, config, indentation, depth, refs, hasCalledToJSON) {
  if (refs.includes(val)) {
    return "[Circular]";
  }
  refs = [...refs];
  refs.push(val);
  const hitMaxDepth = ++depth > config.maxDepth;
  const min = config.min;
  if (config.callToJSON && !hitMaxDepth && val.toJSON && typeof val.toJSON === "function" && !hasCalledToJSON) {
    return printer(val.toJSON(), config, indentation, depth, refs, true);
  }
  const toStringed = toString.call(val);
  if (toStringed === "[object Arguments]") {
    return hitMaxDepth ? "[Arguments]" : `${min ? "" : "Arguments "}[${printListItems(
      val,
      config,
      indentation,
      depth,
      refs,
      printer
    )}]`;
  }
  if (isToStringedArrayType(toStringed)) {
    return hitMaxDepth ? `[${val.constructor.name}]` : `${min ? "" : !config.printBasicPrototype && val.constructor.name === "Array" ? "" : `${val.constructor.name} `}[${printListItems(val, config, indentation, depth, refs, printer)}]`;
  }
  if (toStringed === "[object Map]") {
    return hitMaxDepth ? "[Map]" : `Map {${printIteratorEntries(
      val.entries(),
      config,
      indentation,
      depth,
      refs,
      printer,
      " => "
    )}}`;
  }
  if (toStringed === "[object Set]") {
    return hitMaxDepth ? "[Set]" : `Set {${printIteratorValues(
      val.values(),
      config,
      indentation,
      depth,
      refs,
      printer
    )}}`;
  }
  return hitMaxDepth || isWindow(val) ? `[${getConstructorName(val)}]` : `${min ? "" : !config.printBasicPrototype && getConstructorName(val) === "Object" ? "" : `${getConstructorName(val)} `}{${printObjectProperties(
    val,
    config,
    indentation,
    depth,
    refs,
    printer
  )}}`;
}
function isNewPlugin(plugin) {
  return plugin.serialize != null;
}
function printPlugin(plugin, val, config, indentation, depth, refs) {
  let printed;
  try {
    printed = isNewPlugin(plugin) ? plugin.serialize(val, config, indentation, depth, refs, printer) : plugin.print(
      val,
      (valChild) => printer(valChild, config, indentation, depth, refs),
      (str) => {
        const indentationNext = indentation + config.indent;
        return indentationNext + str.replaceAll(NEWLINE_REGEXP, `
${indentationNext}`);
      },
      {
        edgeSpacing: config.spacingOuter,
        min: config.min,
        spacing: config.spacingInner
      },
      config.colors
    );
  } catch (error) {
    throw new PrettyFormatPluginError(error.message, error.stack);
  }
  if (typeof printed !== "string") {
    throw new TypeError(
      `pretty-format: Plugin must return type "string" but instead returned "${typeof printed}".`
    );
  }
  return printed;
}
function findPlugin(plugins2, val) {
  for (const plugin of plugins2) {
    try {
      if (plugin.test(val)) {
        return plugin;
      }
    } catch (error) {
      throw new PrettyFormatPluginError(error.message, error.stack);
    }
  }
  return null;
}
function printer(val, config, indentation, depth, refs, hasCalledToJSON) {
  const plugin = findPlugin(config.plugins, val);
  if (plugin !== null) {
    return printPlugin(plugin, val, config, indentation, depth, refs);
  }
  const basicResult = printBasicValue(
    val,
    config.printFunctionName,
    config.escapeRegex,
    config.escapeString
  );
  if (basicResult !== null) {
    return basicResult;
  }
  return printComplexValue(
    val,
    config,
    indentation,
    depth,
    refs,
    hasCalledToJSON
  );
}
const DEFAULT_THEME = {
  comment: "gray",
  content: "reset",
  prop: "yellow",
  tag: "cyan",
  value: "green"
};
const DEFAULT_THEME_KEYS = Object.keys(DEFAULT_THEME);
const toOptionsSubtype = (options) => options;
const DEFAULT_OPTIONS = toOptionsSubtype({
  callToJSON: true,
  compareKeys: void 0,
  escapeRegex: false,
  escapeString: true,
  highlight: false,
  indent: 2,
  maxDepth: Number.POSITIVE_INFINITY,
  maxWidth: Number.POSITIVE_INFINITY,
  min: false,
  plugins: [],
  printBasicPrototype: true,
  printFunctionName: true,
  theme: DEFAULT_THEME
});
function validateOptions(options) {
  for (const key of Object.keys(options)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_OPTIONS, key)) {
      throw new Error(`pretty-format: Unknown option "${key}".`);
    }
  }
  if (options.min && options.indent !== void 0 && options.indent !== 0) {
    throw new Error(
      'pretty-format: Options "min" and "indent" cannot be used together.'
    );
  }
  if (options.theme !== void 0) {
    if (options.theme === null) {
      throw new Error('pretty-format: Option "theme" must not be null.');
    }
    if (typeof options.theme !== "object") {
      throw new TypeError(
        `pretty-format: Option "theme" must be of type "object" but instead received "${typeof options.theme}".`
      );
    }
  }
}
const getColorsHighlight = (options) => DEFAULT_THEME_KEYS.reduce((colors, key) => {
  const value = options.theme && options.theme[key] !== void 0 ? options.theme[key] : DEFAULT_THEME[key];
  const color = value && style[value];
  if (color && typeof color.close === "string" && typeof color.open === "string") {
    colors[key] = color;
  } else {
    throw new Error(
      `pretty-format: Option "theme" has a key "${key}" whose value "${value}" is undefined in ansi-styles.`
    );
  }
  return colors;
}, /* @__PURE__ */ Object.create(null));
const getColorsEmpty = () => DEFAULT_THEME_KEYS.reduce((colors, key) => {
  colors[key] = { close: "", open: "" };
  return colors;
}, /* @__PURE__ */ Object.create(null));
const getPrintFunctionName = (options) => options?.printFunctionName ?? DEFAULT_OPTIONS.printFunctionName;
const getEscapeRegex = (options) => options?.escapeRegex ?? DEFAULT_OPTIONS.escapeRegex;
const getEscapeString = (options) => options?.escapeString ?? DEFAULT_OPTIONS.escapeString;
const getConfig = (options) => ({
  callToJSON: options?.callToJSON ?? DEFAULT_OPTIONS.callToJSON,
  colors: options?.highlight ? getColorsHighlight(options) : getColorsEmpty(),
  compareKeys: typeof options?.compareKeys === "function" || options?.compareKeys === null ? options.compareKeys : DEFAULT_OPTIONS.compareKeys,
  escapeRegex: getEscapeRegex(options),
  escapeString: getEscapeString(options),
  indent: options?.min ? "" : createIndent(options?.indent ?? DEFAULT_OPTIONS.indent),
  maxDepth: options?.maxDepth ?? DEFAULT_OPTIONS.maxDepth,
  maxWidth: options?.maxWidth ?? DEFAULT_OPTIONS.maxWidth,
  min: options?.min ?? DEFAULT_OPTIONS.min,
  plugins: options?.plugins ?? DEFAULT_OPTIONS.plugins,
  printBasicPrototype: options?.printBasicPrototype ?? true,
  printFunctionName: getPrintFunctionName(options),
  spacingInner: options?.min ? " " : "\n",
  spacingOuter: options?.min ? "" : "\n"
});
function createIndent(indent) {
  return Array.from({ length: indent + 1 }).join(" ");
}
function format(val, options) {
  if (options) {
    validateOptions(options);
    if (options.plugins) {
      const plugin = findPlugin(options.plugins, val);
      if (plugin !== null) {
        return printPlugin(plugin, val, getConfig(options), "", 0, []);
      }
    }
  }
  const basicResult = printBasicValue(
    val,
    getPrintFunctionName(options),
    getEscapeRegex(options),
    getEscapeString(options)
  );
  if (basicResult !== null) {
    return basicResult;
  }
  return printComplexValue(val, getConfig(options), "", 0, []);
}
const plugins = {
  AsymmetricMatcher: plugin$5,
  DOMCollection: plugin$4,
  DOMElement: plugin$3,
  Immutable: plugin$2,
  ReactElement: plugin$1,
  ReactTestComponent: plugin
};

var DIFF_DELETE = -1;
var DIFF_INSERT = 1;
var DIFF_EQUAL = 0;
class Diff {
  0;
  1;
  constructor(op, text) {
    this[0] = op;
    this[1] = text;
  }
}
var diff_commonPrefix = function(text1, text2) {
  if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {
    return 0;
  }
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerstart = 0;
  while (pointermin < pointermid) {
    if (text1.substring(pointerstart, pointermid) == text2.substring(pointerstart, pointermid)) {
      pointermin = pointermid;
      pointerstart = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};
var diff_commonSuffix = function(text1, text2) {
  if (!text1 || !text2 || text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)) {
    return 0;
  }
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerend = 0;
  while (pointermin < pointermid) {
    if (text1.substring(text1.length - pointermid, text1.length - pointerend) == text2.substring(text2.length - pointermid, text2.length - pointerend)) {
      pointermin = pointermid;
      pointerend = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};
var diff_commonOverlap_ = function(text1, text2) {
  var text1_length = text1.length;
  var text2_length = text2.length;
  if (text1_length == 0 || text2_length == 0) {
    return 0;
  }
  if (text1_length > text2_length) {
    text1 = text1.substring(text1_length - text2_length);
  } else if (text1_length < text2_length) {
    text2 = text2.substring(0, text1_length);
  }
  var text_length = Math.min(text1_length, text2_length);
  if (text1 == text2) {
    return text_length;
  }
  var best = 0;
  var length = 1;
  while (true) {
    var pattern = text1.substring(text_length - length);
    var found = text2.indexOf(pattern);
    if (found == -1) {
      return best;
    }
    length += found;
    if (found == 0 || text1.substring(text_length - length) == text2.substring(0, length)) {
      best = length;
      length++;
    }
  }
};
var diff_cleanupSemantic = function(diffs) {
  var changes = false;
  var equalities = [];
  var equalitiesLength = 0;
  var lastEquality = null;
  var pointer = 0;
  var length_insertions1 = 0;
  var length_deletions1 = 0;
  var length_insertions2 = 0;
  var length_deletions2 = 0;
  while (pointer < diffs.length) {
    if (diffs[pointer][0] == DIFF_EQUAL) {
      equalities[equalitiesLength++] = pointer;
      length_insertions1 = length_insertions2;
      length_deletions1 = length_deletions2;
      length_insertions2 = 0;
      length_deletions2 = 0;
      lastEquality = diffs[pointer][1];
    } else {
      if (diffs[pointer][0] == DIFF_INSERT) {
        length_insertions2 += diffs[pointer][1].length;
      } else {
        length_deletions2 += diffs[pointer][1].length;
      }
      if (lastEquality && lastEquality.length <= Math.max(length_insertions1, length_deletions1) && lastEquality.length <= Math.max(
        length_insertions2,
        length_deletions2
      )) {
        diffs.splice(
          equalities[equalitiesLength - 1],
          0,
          new Diff(DIFF_DELETE, lastEquality)
        );
        diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
        equalitiesLength--;
        equalitiesLength--;
        pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
        length_insertions1 = 0;
        length_deletions1 = 0;
        length_insertions2 = 0;
        length_deletions2 = 0;
        lastEquality = null;
        changes = true;
      }
    }
    pointer++;
  }
  if (changes) {
    diff_cleanupMerge(diffs);
  }
  diff_cleanupSemanticLossless(diffs);
  pointer = 1;
  while (pointer < diffs.length) {
    if (diffs[pointer - 1][0] == DIFF_DELETE && diffs[pointer][0] == DIFF_INSERT) {
      var deletion = diffs[pointer - 1][1];
      var insertion = diffs[pointer][1];
      var overlap_length1 = diff_commonOverlap_(deletion, insertion);
      var overlap_length2 = diff_commonOverlap_(insertion, deletion);
      if (overlap_length1 >= overlap_length2) {
        if (overlap_length1 >= deletion.length / 2 || overlap_length1 >= insertion.length / 2) {
          diffs.splice(pointer, 0, new Diff(
            DIFF_EQUAL,
            insertion.substring(0, overlap_length1)
          ));
          diffs[pointer - 1][1] = deletion.substring(0, deletion.length - overlap_length1);
          diffs[pointer + 1][1] = insertion.substring(overlap_length1);
          pointer++;
        }
      } else {
        if (overlap_length2 >= deletion.length / 2 || overlap_length2 >= insertion.length / 2) {
          diffs.splice(pointer, 0, new Diff(
            DIFF_EQUAL,
            deletion.substring(0, overlap_length2)
          ));
          diffs[pointer - 1][0] = DIFF_INSERT;
          diffs[pointer - 1][1] = insertion.substring(0, insertion.length - overlap_length2);
          diffs[pointer + 1][0] = DIFF_DELETE;
          diffs[pointer + 1][1] = deletion.substring(overlap_length2);
          pointer++;
        }
      }
      pointer++;
    }
    pointer++;
  }
};
var diff_cleanupSemanticLossless = function(diffs) {
  function diff_cleanupSemanticScore_(one, two) {
    if (!one || !two) {
      return 6;
    }
    var char1 = one.charAt(one.length - 1);
    var char2 = two.charAt(0);
    var nonAlphaNumeric1 = char1.match(nonAlphaNumericRegex_);
    var nonAlphaNumeric2 = char2.match(nonAlphaNumericRegex_);
    var whitespace1 = nonAlphaNumeric1 && char1.match(whitespaceRegex_);
    var whitespace2 = nonAlphaNumeric2 && char2.match(whitespaceRegex_);
    var lineBreak1 = whitespace1 && char1.match(linebreakRegex_);
    var lineBreak2 = whitespace2 && char2.match(linebreakRegex_);
    var blankLine1 = lineBreak1 && one.match(blanklineEndRegex_);
    var blankLine2 = lineBreak2 && two.match(blanklineStartRegex_);
    if (blankLine1 || blankLine2) {
      return 5;
    } else if (lineBreak1 || lineBreak2) {
      return 4;
    } else if (nonAlphaNumeric1 && !whitespace1 && whitespace2) {
      return 3;
    } else if (whitespace1 || whitespace2) {
      return 2;
    } else if (nonAlphaNumeric1 || nonAlphaNumeric2) {
      return 1;
    }
    return 0;
  }
  var pointer = 1;
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL && diffs[pointer + 1][0] == DIFF_EQUAL) {
      var equality1 = diffs[pointer - 1][1];
      var edit = diffs[pointer][1];
      var equality2 = diffs[pointer + 1][1];
      var commonOffset = diff_commonSuffix(equality1, edit);
      if (commonOffset) {
        var commonString = edit.substring(edit.length - commonOffset);
        equality1 = equality1.substring(0, equality1.length - commonOffset);
        edit = commonString + edit.substring(0, edit.length - commonOffset);
        equality2 = commonString + equality2;
      }
      var bestEquality1 = equality1;
      var bestEdit = edit;
      var bestEquality2 = equality2;
      var bestScore = diff_cleanupSemanticScore_(equality1, edit) + diff_cleanupSemanticScore_(edit, equality2);
      while (edit.charAt(0) === equality2.charAt(0)) {
        equality1 += edit.charAt(0);
        edit = edit.substring(1) + equality2.charAt(0);
        equality2 = equality2.substring(1);
        var score = diff_cleanupSemanticScore_(equality1, edit) + diff_cleanupSemanticScore_(edit, equality2);
        if (score >= bestScore) {
          bestScore = score;
          bestEquality1 = equality1;
          bestEdit = edit;
          bestEquality2 = equality2;
        }
      }
      if (diffs[pointer - 1][1] != bestEquality1) {
        if (bestEquality1) {
          diffs[pointer - 1][1] = bestEquality1;
        } else {
          diffs.splice(pointer - 1, 1);
          pointer--;
        }
        diffs[pointer][1] = bestEdit;
        if (bestEquality2) {
          diffs[pointer + 1][1] = bestEquality2;
        } else {
          diffs.splice(pointer + 1, 1);
          pointer--;
        }
      }
    }
    pointer++;
  }
};
var nonAlphaNumericRegex_ = /[^a-zA-Z0-9]/;
var whitespaceRegex_ = /\s/;
var linebreakRegex_ = /[\r\n]/;
var blanklineEndRegex_ = /\n\r?\n$/;
var blanklineStartRegex_ = /^\r?\n\r?\n/;
var diff_cleanupMerge = function(diffs) {
  diffs.push(new Diff(DIFF_EQUAL, ""));
  var pointer = 0;
  var count_delete = 0;
  var count_insert = 0;
  var text_delete = "";
  var text_insert = "";
  var commonlength;
  while (pointer < diffs.length) {
    switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        text_insert += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_EQUAL:
        if (count_delete + count_insert > 1) {
          if (count_delete !== 0 && count_insert !== 0) {
            commonlength = diff_commonPrefix(text_insert, text_delete);
            if (commonlength !== 0) {
              if (pointer - count_delete - count_insert > 0 && diffs[pointer - count_delete - count_insert - 1][0] == DIFF_EQUAL) {
                diffs[pointer - count_delete - count_insert - 1][1] += text_insert.substring(0, commonlength);
              } else {
                diffs.splice(0, 0, new Diff(
                  DIFF_EQUAL,
                  text_insert.substring(0, commonlength)
                ));
                pointer++;
              }
              text_insert = text_insert.substring(commonlength);
              text_delete = text_delete.substring(commonlength);
            }
            commonlength = diff_commonSuffix(text_insert, text_delete);
            if (commonlength !== 0) {
              diffs[pointer][1] = text_insert.substring(text_insert.length - commonlength) + diffs[pointer][1];
              text_insert = text_insert.substring(0, text_insert.length - commonlength);
              text_delete = text_delete.substring(0, text_delete.length - commonlength);
            }
          }
          pointer -= count_delete + count_insert;
          diffs.splice(pointer, count_delete + count_insert);
          if (text_delete.length) {
            diffs.splice(
              pointer,
              0,
              new Diff(DIFF_DELETE, text_delete)
            );
            pointer++;
          }
          if (text_insert.length) {
            diffs.splice(
              pointer,
              0,
              new Diff(DIFF_INSERT, text_insert)
            );
            pointer++;
          }
          pointer++;
        } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
          diffs[pointer - 1][1] += diffs[pointer][1];
          diffs.splice(pointer, 1);
        } else {
          pointer++;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = "";
        text_insert = "";
        break;
    }
  }
  if (diffs[diffs.length - 1][1] === "") {
    diffs.pop();
  }
  var changes = false;
  pointer = 1;
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL && diffs[pointer + 1][0] == DIFF_EQUAL) {
      if (diffs[pointer][1].substring(diffs[pointer][1].length - diffs[pointer - 1][1].length) == diffs[pointer - 1][1]) {
        diffs[pointer][1] = diffs[pointer - 1][1] + diffs[pointer][1].substring(0, diffs[pointer][1].length - diffs[pointer - 1][1].length);
        diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
        diffs.splice(pointer - 1, 1);
        changes = true;
      } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) == diffs[pointer + 1][1]) {
        diffs[pointer - 1][1] += diffs[pointer + 1][1];
        diffs[pointer][1] = diffs[pointer][1].substring(diffs[pointer + 1][1].length) + diffs[pointer + 1][1];
        diffs.splice(pointer + 1, 1);
        changes = true;
      }
    }
    pointer++;
  }
  if (changes) {
    diff_cleanupMerge(diffs);
  }
};

const NO_DIFF_MESSAGE = "Compared values have no visual difference.";
const SIMILAR_MESSAGE = "Compared values serialize to the same structure.\nPrinting internal object structure without calling `toJSON` instead.";

const pkg = "@jest/diff-sequences";
const NOT_YET_SET = 0;
const countCommonItemsF = (aIndex, aEnd, bIndex, bEnd, isCommon) => {
  let nCommon = 0;
  while (aIndex < aEnd && bIndex < bEnd && isCommon(aIndex, bIndex)) {
    aIndex += 1;
    bIndex += 1;
    nCommon += 1;
  }
  return nCommon;
};
const countCommonItemsR = (aStart, aIndex, bStart, bIndex, isCommon) => {
  let nCommon = 0;
  while (aStart <= aIndex && bStart <= bIndex && isCommon(aIndex, bIndex)) {
    aIndex -= 1;
    bIndex -= 1;
    nCommon += 1;
  }
  return nCommon;
};
const extendPathsF = (d, aEnd, bEnd, bF, isCommon, aIndexesF, iMaxF) => {
  let iF = 0;
  let kF = -d;
  let aFirst = aIndexesF[iF];
  let aIndexPrev1 = aFirst;
  aIndexesF[iF] += countCommonItemsF(
    aFirst + 1,
    aEnd,
    bF + aFirst - kF + 1,
    bEnd,
    isCommon
  );
  const nF = Math.min(d, iMaxF);
  for (iF += 1, kF += 2; iF <= nF; iF += 1, kF += 2) {
    if (iF !== d && aIndexPrev1 < aIndexesF[iF]) {
      aFirst = aIndexesF[iF];
    } else {
      aFirst = aIndexPrev1 + 1;
      if (aEnd <= aFirst) {
        return iF - 1;
      }
    }
    aIndexPrev1 = aIndexesF[iF];
    aIndexesF[iF] = aFirst + countCommonItemsF(aFirst + 1, aEnd, bF + aFirst - kF + 1, bEnd, isCommon);
  }
  return iMaxF;
};
const extendPathsR = (d, aStart, bStart, bR, isCommon, aIndexesR, iMaxR) => {
  let iR = 0;
  let kR = d;
  let aFirst = aIndexesR[iR];
  let aIndexPrev1 = aFirst;
  aIndexesR[iR] -= countCommonItemsR(
    aStart,
    aFirst - 1,
    bStart,
    bR + aFirst - kR - 1,
    isCommon
  );
  const nR = Math.min(d, iMaxR);
  for (iR += 1, kR -= 2; iR <= nR; iR += 1, kR -= 2) {
    if (iR !== d && aIndexesR[iR] < aIndexPrev1) {
      aFirst = aIndexesR[iR];
    } else {
      aFirst = aIndexPrev1 - 1;
      if (aFirst < aStart) {
        return iR - 1;
      }
    }
    aIndexPrev1 = aIndexesR[iR];
    aIndexesR[iR] = aFirst - countCommonItemsR(
      aStart,
      aFirst - 1,
      bStart,
      bR + aFirst - kR - 1,
      isCommon
    );
  }
  return iMaxR;
};
const extendOverlappablePathsF = (d, aStart, aEnd, bStart, bEnd, isCommon, aIndexesF, iMaxF, aIndexesR, iMaxR, division) => {
  const bF = bStart - aStart;
  const aLength = aEnd - aStart;
  const bLength = bEnd - bStart;
  const baDeltaLength = bLength - aLength;
  const kMinOverlapF = -baDeltaLength - (d - 1);
  const kMaxOverlapF = -baDeltaLength + (d - 1);
  let aIndexPrev1 = NOT_YET_SET;
  const nF = Math.min(d, iMaxF);
  for (let iF = 0, kF = -d; iF <= nF; iF += 1, kF += 2) {
    const insert = iF === 0 || iF !== d && aIndexPrev1 < aIndexesF[iF];
    const aLastPrev = insert ? aIndexesF[iF] : aIndexPrev1;
    const aFirst = insert ? aLastPrev : aLastPrev + 1;
    const bFirst = bF + aFirst - kF;
    const nCommonF = countCommonItemsF(
      aFirst + 1,
      aEnd,
      bFirst + 1,
      bEnd,
      isCommon
    );
    const aLast = aFirst + nCommonF;
    aIndexPrev1 = aIndexesF[iF];
    aIndexesF[iF] = aLast;
    if (kMinOverlapF <= kF && kF <= kMaxOverlapF) {
      const iR = (d - 1 - (kF + baDeltaLength)) / 2;
      if (iR <= iMaxR && aIndexesR[iR] - 1 <= aLast) {
        const bLastPrev = bF + aLastPrev - (insert ? kF + 1 : kF - 1);
        const nCommonR = countCommonItemsR(
          aStart,
          aLastPrev,
          bStart,
          bLastPrev,
          isCommon
        );
        const aIndexPrevFirst = aLastPrev - nCommonR;
        const bIndexPrevFirst = bLastPrev - nCommonR;
        const aEndPreceding = aIndexPrevFirst + 1;
        const bEndPreceding = bIndexPrevFirst + 1;
        division.nChangePreceding = d - 1;
        if (d - 1 === aEndPreceding + bEndPreceding - aStart - bStart) {
          division.aEndPreceding = aStart;
          division.bEndPreceding = bStart;
        } else {
          division.aEndPreceding = aEndPreceding;
          division.bEndPreceding = bEndPreceding;
        }
        division.nCommonPreceding = nCommonR;
        if (nCommonR !== 0) {
          division.aCommonPreceding = aEndPreceding;
          division.bCommonPreceding = bEndPreceding;
        }
        division.nCommonFollowing = nCommonF;
        if (nCommonF !== 0) {
          division.aCommonFollowing = aFirst + 1;
          division.bCommonFollowing = bFirst + 1;
        }
        const aStartFollowing = aLast + 1;
        const bStartFollowing = bFirst + nCommonF + 1;
        division.nChangeFollowing = d - 1;
        if (d - 1 === aEnd + bEnd - aStartFollowing - bStartFollowing) {
          division.aStartFollowing = aEnd;
          division.bStartFollowing = bEnd;
        } else {
          division.aStartFollowing = aStartFollowing;
          division.bStartFollowing = bStartFollowing;
        }
        return true;
      }
    }
  }
  return false;
};
const extendOverlappablePathsR = (d, aStart, aEnd, bStart, bEnd, isCommon, aIndexesF, iMaxF, aIndexesR, iMaxR, division) => {
  const bR = bEnd - aEnd;
  const aLength = aEnd - aStart;
  const bLength = bEnd - bStart;
  const baDeltaLength = bLength - aLength;
  const kMinOverlapR = baDeltaLength - d;
  const kMaxOverlapR = baDeltaLength + d;
  let aIndexPrev1 = NOT_YET_SET;
  const nR = Math.min(d, iMaxR);
  for (let iR = 0, kR = d; iR <= nR; iR += 1, kR -= 2) {
    const insert = iR === 0 || iR !== d && aIndexesR[iR] < aIndexPrev1;
    const aLastPrev = insert ? aIndexesR[iR] : aIndexPrev1;
    const aFirst = insert ? aLastPrev : aLastPrev - 1;
    const bFirst = bR + aFirst - kR;
    const nCommonR = countCommonItemsR(
      aStart,
      aFirst - 1,
      bStart,
      bFirst - 1,
      isCommon
    );
    const aLast = aFirst - nCommonR;
    aIndexPrev1 = aIndexesR[iR];
    aIndexesR[iR] = aLast;
    if (kMinOverlapR <= kR && kR <= kMaxOverlapR) {
      const iF = (d + (kR - baDeltaLength)) / 2;
      if (iF <= iMaxF && aLast - 1 <= aIndexesF[iF]) {
        const bLast = bFirst - nCommonR;
        division.nChangePreceding = d;
        if (d === aLast + bLast - aStart - bStart) {
          division.aEndPreceding = aStart;
          division.bEndPreceding = bStart;
        } else {
          division.aEndPreceding = aLast;
          division.bEndPreceding = bLast;
        }
        division.nCommonPreceding = nCommonR;
        if (nCommonR !== 0) {
          division.aCommonPreceding = aLast;
          division.bCommonPreceding = bLast;
        }
        division.nChangeFollowing = d - 1;
        if (d === 1) {
          division.nCommonFollowing = 0;
          division.aStartFollowing = aEnd;
          division.bStartFollowing = bEnd;
        } else {
          const bLastPrev = bR + aLastPrev - (insert ? kR - 1 : kR + 1);
          const nCommonF = countCommonItemsF(
            aLastPrev,
            aEnd,
            bLastPrev,
            bEnd,
            isCommon
          );
          division.nCommonFollowing = nCommonF;
          if (nCommonF !== 0) {
            division.aCommonFollowing = aLastPrev;
            division.bCommonFollowing = bLastPrev;
          }
          const aStartFollowing = aLastPrev + nCommonF;
          const bStartFollowing = bLastPrev + nCommonF;
          if (d - 1 === aEnd + bEnd - aStartFollowing - bStartFollowing) {
            division.aStartFollowing = aEnd;
            division.bStartFollowing = bEnd;
          } else {
            division.aStartFollowing = aStartFollowing;
            division.bStartFollowing = bStartFollowing;
          }
        }
        return true;
      }
    }
  }
  return false;
};
const divide = (nChange, aStart, aEnd, bStart, bEnd, isCommon, aIndexesF, aIndexesR, division) => {
  const bF = bStart - aStart;
  const bR = bEnd - aEnd;
  const aLength = aEnd - aStart;
  const bLength = bEnd - bStart;
  const baDeltaLength = bLength - aLength;
  let iMaxF = aLength;
  let iMaxR = aLength;
  aIndexesF[0] = aStart - 1;
  aIndexesR[0] = aEnd;
  if (baDeltaLength % 2 === 0) {
    const dMin = (nChange || baDeltaLength) / 2;
    const dMax = (aLength + bLength) / 2;
    for (let d = 1; d <= dMax; d += 1) {
      iMaxF = extendPathsF(d, aEnd, bEnd, bF, isCommon, aIndexesF, iMaxF);
      if (d < dMin) {
        iMaxR = extendPathsR(d, aStart, bStart, bR, isCommon, aIndexesR, iMaxR);
      } else if (
        // If a reverse path overlaps a forward path in the same diagonal,
        // return a division of the index intervals at the middle change.
        extendOverlappablePathsR(
          d,
          aStart,
          aEnd,
          bStart,
          bEnd,
          isCommon,
          aIndexesF,
          iMaxF,
          aIndexesR,
          iMaxR,
          division
        )
      ) {
        return;
      }
    }
  } else {
    const dMin = ((nChange || baDeltaLength) + 1) / 2;
    const dMax = (aLength + bLength + 1) / 2;
    let d = 1;
    iMaxF = extendPathsF(d, aEnd, bEnd, bF, isCommon, aIndexesF, iMaxF);
    for (d += 1; d <= dMax; d += 1) {
      iMaxR = extendPathsR(
        d - 1,
        aStart,
        bStart,
        bR,
        isCommon,
        aIndexesR,
        iMaxR
      );
      if (d < dMin) {
        iMaxF = extendPathsF(d, aEnd, bEnd, bF, isCommon, aIndexesF, iMaxF);
      } else if (
        // If a forward path overlaps a reverse path in the same diagonal,
        // return a division of the index intervals at the middle change.
        extendOverlappablePathsF(
          d,
          aStart,
          aEnd,
          bStart,
          bEnd,
          isCommon,
          aIndexesF,
          iMaxF,
          aIndexesR,
          iMaxR,
          division
        )
      ) {
        return;
      }
    }
  }
  throw new Error(
    `${pkg}: no overlap aStart=${aStart} aEnd=${aEnd} bStart=${bStart} bEnd=${bEnd}`
  );
};
const findSubsequences = (nChange, aStart, aEnd, bStart, bEnd, transposed, callbacks, aIndexesF, aIndexesR, division) => {
  if (bEnd - bStart < aEnd - aStart) {
    transposed = !transposed;
    if (transposed && callbacks.length === 1) {
      const { foundSubsequence: foundSubsequence2, isCommon: isCommon2 } = callbacks[0];
      callbacks[1] = {
        foundSubsequence: (nCommon, bCommon, aCommon) => {
          foundSubsequence2(nCommon, aCommon, bCommon);
        },
        isCommon: (bIndex, aIndex) => isCommon2(aIndex, bIndex)
      };
    }
    const tStart = aStart;
    const tEnd = aEnd;
    aStart = bStart;
    aEnd = bEnd;
    bStart = tStart;
    bEnd = tEnd;
  }
  const { foundSubsequence, isCommon } = callbacks[transposed ? 1 : 0];
  divide(
    nChange,
    aStart,
    aEnd,
    bStart,
    bEnd,
    isCommon,
    aIndexesF,
    aIndexesR,
    division
  );
  const {
    nChangePreceding,
    aEndPreceding,
    bEndPreceding,
    nCommonPreceding,
    aCommonPreceding,
    bCommonPreceding,
    nCommonFollowing,
    aCommonFollowing,
    bCommonFollowing,
    nChangeFollowing,
    aStartFollowing,
    bStartFollowing
  } = division;
  if (aStart < aEndPreceding && bStart < bEndPreceding) {
    findSubsequences(
      nChangePreceding,
      aStart,
      aEndPreceding,
      bStart,
      bEndPreceding,
      transposed,
      callbacks,
      aIndexesF,
      aIndexesR,
      division
    );
  }
  if (nCommonPreceding !== 0) {
    foundSubsequence(nCommonPreceding, aCommonPreceding, bCommonPreceding);
  }
  if (nCommonFollowing !== 0) {
    foundSubsequence(nCommonFollowing, aCommonFollowing, bCommonFollowing);
  }
  if (aStartFollowing < aEnd && bStartFollowing < bEnd) {
    findSubsequences(
      nChangeFollowing,
      aStartFollowing,
      aEnd,
      bStartFollowing,
      bEnd,
      transposed,
      callbacks,
      aIndexesF,
      aIndexesR,
      division
    );
  }
};
const validateLength = (name, arg) => {
  if (typeof arg !== "number") {
    throw new TypeError(`${pkg}: ${name} typeof ${typeof arg} is not a number`);
  }
  if (!Number.isSafeInteger(arg)) {
    throw new RangeError(`${pkg}: ${name} value ${arg} is not a safe integer`);
  }
  if (arg < 0) {
    throw new RangeError(`${pkg}: ${name} value ${arg} is a negative integer`);
  }
};
const validateCallback = (name, arg) => {
  const type = typeof arg;
  if (type !== "function") {
    throw new TypeError(`${pkg}: ${name} typeof ${type} is not a function`);
  }
};
function diffSequence(aLength, bLength, isCommon, foundSubsequence) {
  validateLength("aLength", aLength);
  validateLength("bLength", bLength);
  validateCallback("isCommon", isCommon);
  validateCallback("foundSubsequence", foundSubsequence);
  const nCommonF = countCommonItemsF(0, aLength, 0, bLength, isCommon);
  if (nCommonF !== 0) {
    foundSubsequence(nCommonF, 0, 0);
  }
  if (aLength !== nCommonF || bLength !== nCommonF) {
    const aStart = nCommonF;
    const bStart = nCommonF;
    const nCommonR = countCommonItemsR(
      aStart,
      aLength - 1,
      bStart,
      bLength - 1,
      isCommon
    );
    const aEnd = aLength - nCommonR;
    const bEnd = bLength - nCommonR;
    const nCommonFR = nCommonF + nCommonR;
    if (aLength !== nCommonFR && bLength !== nCommonFR) {
      const nChange = 0;
      const transposed = false;
      const callbacks = [{ foundSubsequence, isCommon }];
      const aIndexesF = [NOT_YET_SET];
      const aIndexesR = [NOT_YET_SET];
      const division = {
        aCommonFollowing: NOT_YET_SET,
        aCommonPreceding: NOT_YET_SET,
        aEndPreceding: NOT_YET_SET,
        aStartFollowing: NOT_YET_SET,
        bCommonFollowing: NOT_YET_SET,
        bCommonPreceding: NOT_YET_SET,
        bEndPreceding: NOT_YET_SET,
        bStartFollowing: NOT_YET_SET,
        nChangeFollowing: NOT_YET_SET,
        nChangePreceding: NOT_YET_SET,
        nCommonFollowing: NOT_YET_SET,
        nCommonPreceding: NOT_YET_SET
      };
      findSubsequences(
        nChange,
        aStart,
        aEnd,
        bStart,
        bEnd,
        transposed,
        callbacks,
        aIndexesF,
        aIndexesR,
        division
      );
    }
    if (nCommonR !== 0) {
      foundSubsequence(nCommonR, aEnd, bEnd);
    }
  }
}

const escapeControlCharacters = (str) => str.replaceAll(
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
  (match) => {
    switch (match) {
      case "\b":
        return "\\b";
      case "\f":
        return "\\f";
      case "\v":
        return "\\v";
      default: {
        const code = match.codePointAt(0);
        return `\\x${code.toString(16).padStart(2, "0")}`;
      }
    }
  }
);

const formatTrailingSpaces = (line, trailingSpaceFormatter) => line.replace(/\s+$/, (match) => trailingSpaceFormatter(match));
const printDiffLine = (line, isFirstOrLast, color, indicator, trailingSpaceFormatter, emptyFirstOrLastLinePlaceholder) => line.length === 0 ? indicator === " " ? isFirstOrLast && emptyFirstOrLastLinePlaceholder.length > 0 ? color(`${indicator} ${emptyFirstOrLastLinePlaceholder}`) : "" : color(indicator) : color(
  `${indicator} ${formatTrailingSpaces(line, trailingSpaceFormatter)}`
);
const printDeleteLine = (line, isFirstOrLast, {
  aColor,
  aIndicator,
  changeLineTrailingSpaceColor,
  emptyFirstOrLastLinePlaceholder
}) => printDiffLine(
  line,
  isFirstOrLast,
  aColor,
  aIndicator,
  changeLineTrailingSpaceColor,
  emptyFirstOrLastLinePlaceholder
);
const printInsertLine = (line, isFirstOrLast, {
  bColor,
  bIndicator,
  changeLineTrailingSpaceColor,
  emptyFirstOrLastLinePlaceholder
}) => printDiffLine(
  line,
  isFirstOrLast,
  bColor,
  bIndicator,
  changeLineTrailingSpaceColor,
  emptyFirstOrLastLinePlaceholder
);
const printCommonLine = (line, isFirstOrLast, {
  commonColor,
  commonIndicator,
  commonLineTrailingSpaceColor,
  emptyFirstOrLastLinePlaceholder
}) => printDiffLine(
  line,
  isFirstOrLast,
  commonColor,
  commonIndicator,
  commonLineTrailingSpaceColor,
  emptyFirstOrLastLinePlaceholder
);
const createPatchMark = (aStart, aEnd, bStart, bEnd, { patchColor }) => patchColor(
  `@@ -${aStart + 1},${aEnd - aStart} +${bStart + 1},${bEnd - bStart} @@`
);
const joinAlignedDiffsNoExpand = (diffs, options) => {
  const iLength = diffs.length;
  const nContextLines = options.contextLines;
  const nContextLines2 = nContextLines + nContextLines;
  let jLength = iLength;
  let hasExcessAtStartOrEnd = false;
  let nExcessesBetweenChanges = 0;
  let i = 0;
  while (i !== iLength) {
    const iStart = i;
    while (i !== iLength && diffs[i][0] === DIFF_EQUAL) {
      i += 1;
    }
    if (iStart !== i) {
      if (iStart === 0) {
        if (i > nContextLines) {
          jLength -= i - nContextLines;
          hasExcessAtStartOrEnd = true;
        }
      } else if (i === iLength) {
        const n = i - iStart;
        if (n > nContextLines) {
          jLength -= n - nContextLines;
          hasExcessAtStartOrEnd = true;
        }
      } else {
        const n = i - iStart;
        if (n > nContextLines2) {
          jLength -= n - nContextLines2;
          nExcessesBetweenChanges += 1;
        }
      }
    }
    while (i !== iLength && diffs[i][0] !== DIFF_EQUAL) {
      i += 1;
    }
  }
  const hasPatch = nExcessesBetweenChanges !== 0 || hasExcessAtStartOrEnd;
  if (nExcessesBetweenChanges !== 0) {
    jLength += nExcessesBetweenChanges + 1;
  } else if (hasExcessAtStartOrEnd) {
    jLength += 1;
  }
  const jLast = jLength - 1;
  const lines = [];
  let jPatchMark = 0;
  if (hasPatch) {
    lines.push("");
  }
  let aStart = 0;
  let bStart = 0;
  let aEnd = 0;
  let bEnd = 0;
  const pushCommonLine = (line) => {
    const j = lines.length;
    lines.push(printCommonLine(line, j === 0 || j === jLast, options));
    aEnd += 1;
    bEnd += 1;
  };
  const pushDeleteLine = (line) => {
    const j = lines.length;
    lines.push(printDeleteLine(line, j === 0 || j === jLast, options));
    aEnd += 1;
  };
  const pushInsertLine = (line) => {
    const j = lines.length;
    lines.push(printInsertLine(line, j === 0 || j === jLast, options));
    bEnd += 1;
  };
  i = 0;
  while (i !== iLength) {
    let iStart = i;
    while (i !== iLength && diffs[i][0] === DIFF_EQUAL) {
      i += 1;
    }
    if (iStart !== i) {
      if (iStart === 0) {
        if (i > nContextLines) {
          iStart = i - nContextLines;
          aStart = iStart;
          bStart = iStart;
          aEnd = aStart;
          bEnd = bStart;
        }
        for (let iCommon = iStart; iCommon !== i; iCommon += 1) {
          pushCommonLine(diffs[iCommon][1]);
        }
      } else if (i === iLength) {
        const iEnd = i - iStart > nContextLines ? iStart + nContextLines : i;
        for (let iCommon = iStart; iCommon !== iEnd; iCommon += 1) {
          pushCommonLine(diffs[iCommon][1]);
        }
      } else {
        const nCommon = i - iStart;
        if (nCommon > nContextLines2) {
          const iEnd = iStart + nContextLines;
          for (let iCommon = iStart; iCommon !== iEnd; iCommon += 1) {
            pushCommonLine(diffs[iCommon][1]);
          }
          lines[jPatchMark] = createPatchMark(
            aStart,
            aEnd,
            bStart,
            bEnd,
            options
          );
          jPatchMark = lines.length;
          lines.push("");
          const nOmit = nCommon - nContextLines2;
          aStart = aEnd + nOmit;
          bStart = bEnd + nOmit;
          aEnd = aStart;
          bEnd = bStart;
          for (let iCommon = i - nContextLines; iCommon !== i; iCommon += 1) {
            pushCommonLine(diffs[iCommon][1]);
          }
        } else {
          for (let iCommon = iStart; iCommon !== i; iCommon += 1) {
            pushCommonLine(diffs[iCommon][1]);
          }
        }
      }
    }
    while (i !== iLength && diffs[i][0] === DIFF_DELETE) {
      pushDeleteLine(diffs[i][1]);
      i += 1;
    }
    while (i !== iLength && diffs[i][0] === DIFF_INSERT) {
      pushInsertLine(diffs[i][1]);
      i += 1;
    }
  }
  if (hasPatch) {
    lines[jPatchMark] = createPatchMark(aStart, aEnd, bStart, bEnd, options);
  }
  return lines.join("\n");
};
const joinAlignedDiffsExpand = (diffs, options) => diffs.map((diff, i, diffs2) => {
  const line = diff[1];
  const isFirstOrLast = i === 0 || i === diffs2.length - 1;
  switch (diff[0]) {
    case DIFF_DELETE:
      return printDeleteLine(line, isFirstOrLast, options);
    case DIFF_INSERT:
      return printInsertLine(line, isFirstOrLast, options);
    default:
      return printCommonLine(line, isFirstOrLast, options);
  }
}).join("\n");

const noColor = (string) => string;
const DIFF_CONTEXT_DEFAULT = 5;
const OPTIONS_DEFAULT = {
  aAnnotation: "Expected",
  aColor: chalk.green,
  aIndicator: "-",
  bAnnotation: "Received",
  bColor: chalk.red,
  bIndicator: "+",
  changeColor: chalk.inverse,
  changeLineTrailingSpaceColor: noColor,
  commonColor: chalk.dim,
  commonIndicator: " ",
  commonLineTrailingSpaceColor: noColor,
  compareKeys: void 0,
  contextLines: DIFF_CONTEXT_DEFAULT,
  emptyFirstOrLastLinePlaceholder: "",
  expand: true,
  includeChangeCounts: false,
  omitAnnotationLines: false,
  patchColor: chalk.yellow
};
const getCompareKeys = (compareKeys) => compareKeys && typeof compareKeys === "function" ? compareKeys : OPTIONS_DEFAULT.compareKeys;
const getContextLines = (contextLines) => typeof contextLines === "number" && Number.isSafeInteger(contextLines) && contextLines >= 0 ? contextLines : DIFF_CONTEXT_DEFAULT;
const normalizeDiffOptions = (options = {}) => ({
  ...OPTIONS_DEFAULT,
  ...options,
  compareKeys: getCompareKeys(options.compareKeys),
  contextLines: getContextLines(options.contextLines)
});

const isEmptyString = (lines) => lines.length === 1 && lines[0].length === 0;
const countChanges = (diffs) => {
  let a = 0;
  let b = 0;
  for (const diff2 of diffs) {
    switch (diff2[0]) {
      case DIFF_DELETE:
        a += 1;
        break;
      case DIFF_INSERT:
        b += 1;
        break;
    }
  }
  return { a, b };
};
const printAnnotation = ({
  aAnnotation,
  aColor,
  aIndicator,
  bAnnotation,
  bColor,
  bIndicator,
  includeChangeCounts,
  omitAnnotationLines
}, changeCounts) => {
  if (omitAnnotationLines) {
    return "";
  }
  let aRest = "";
  let bRest = "";
  if (includeChangeCounts) {
    const aCount = String(changeCounts.a);
    const bCount = String(changeCounts.b);
    const baAnnotationLengthDiff = bAnnotation.length - aAnnotation.length;
    const aAnnotationPadding = " ".repeat(Math.max(0, baAnnotationLengthDiff));
    const bAnnotationPadding = " ".repeat(Math.max(0, -baAnnotationLengthDiff));
    const baCountLengthDiff = bCount.length - aCount.length;
    const aCountPadding = " ".repeat(Math.max(0, baCountLengthDiff));
    const bCountPadding = " ".repeat(Math.max(0, -baCountLengthDiff));
    aRest = `${aAnnotationPadding}  ${aIndicator} ${aCountPadding}${aCount}`;
    bRest = `${bAnnotationPadding}  ${bIndicator} ${bCountPadding}${bCount}`;
  }
  const a = `${aIndicator} ${aAnnotation}${aRest}`;
  const b = `${bIndicator} ${bAnnotation}${bRest}`;
  return `${aColor(a)}
${bColor(b)}

`;
};
const printDiffLines = (diffs, options) => printAnnotation(options, countChanges(diffs)) + (options.expand ? joinAlignedDiffsExpand(diffs, options) : joinAlignedDiffsNoExpand(diffs, options));
const diffLinesUnified = (aLines, bLines, options) => printDiffLines(
  diffLinesRaw(
    isEmptyString(aLines) ? [] : aLines.map(escapeControlCharacters),
    isEmptyString(bLines) ? [] : bLines.map(escapeControlCharacters)
  ),
  normalizeDiffOptions(options)
);
const diffLinesUnified2 = (aLinesDisplay, bLinesDisplay, aLinesCompare, bLinesCompare, options) => {
  if (isEmptyString(aLinesDisplay) && isEmptyString(aLinesCompare)) {
    aLinesDisplay = [];
    aLinesCompare = [];
  }
  if (isEmptyString(bLinesDisplay) && isEmptyString(bLinesCompare)) {
    bLinesDisplay = [];
    bLinesCompare = [];
  }
  if (aLinesDisplay.length !== aLinesCompare.length || bLinesDisplay.length !== bLinesCompare.length) {
    return diffLinesUnified(aLinesDisplay, bLinesDisplay, options);
  }
  const diffs = diffLinesRaw(aLinesCompare, bLinesCompare);
  let aIndex = 0;
  let bIndex = 0;
  for (const diff2 of diffs) {
    switch (diff2[0]) {
      case DIFF_DELETE:
        diff2[1] = aLinesDisplay[aIndex];
        aIndex += 1;
        break;
      case DIFF_INSERT:
        diff2[1] = bLinesDisplay[bIndex];
        bIndex += 1;
        break;
      default:
        diff2[1] = bLinesDisplay[bIndex];
        aIndex += 1;
        bIndex += 1;
    }
  }
  return printDiffLines(diffs, normalizeDiffOptions(options));
};
const diffLinesRaw = (aLines, bLines) => {
  const aLength = aLines.length;
  const bLength = bLines.length;
  const isCommon = (aIndex2, bIndex2) => aLines[aIndex2] === bLines[bIndex2];
  const diffs = [];
  let aIndex = 0;
  let bIndex = 0;
  const foundSubsequence = (nCommon, aCommon, bCommon) => {
    for (; aIndex !== aCommon; aIndex += 1) {
      diffs.push(new Diff(DIFF_DELETE, aLines[aIndex]));
    }
    for (; bIndex !== bCommon; bIndex += 1) {
      diffs.push(new Diff(DIFF_INSERT, bLines[bIndex]));
    }
    for (; nCommon !== 0; nCommon -= 1, aIndex += 1, bIndex += 1) {
      diffs.push(new Diff(DIFF_EQUAL, bLines[bIndex]));
    }
  };
  diffSequence(aLength, bLength, isCommon, foundSubsequence);
  for (; aIndex !== aLength; aIndex += 1) {
    diffs.push(new Diff(DIFF_DELETE, aLines[aIndex]));
  }
  for (; bIndex !== bLength; bIndex += 1) {
    diffs.push(new Diff(DIFF_INSERT, bLines[bIndex]));
  }
  return diffs;
};

const diffStrings = (a, b) => {
  const isCommon = (aIndex2, bIndex2) => a[aIndex2] === b[bIndex2];
  let aIndex = 0;
  let bIndex = 0;
  const diffs = [];
  const foundSubsequence = (nCommon, aCommon, bCommon) => {
    if (aIndex !== aCommon) {
      diffs.push(new Diff(DIFF_DELETE, a.slice(aIndex, aCommon)));
    }
    if (bIndex !== bCommon) {
      diffs.push(new Diff(DIFF_INSERT, b.slice(bIndex, bCommon)));
    }
    aIndex = aCommon + nCommon;
    bIndex = bCommon + nCommon;
    diffs.push(new Diff(DIFF_EQUAL, b.slice(bCommon, bIndex)));
  };
  diffSequence(a.length, b.length, isCommon, foundSubsequence);
  if (aIndex !== a.length) {
    diffs.push(new Diff(DIFF_DELETE, a.slice(aIndex)));
  }
  if (bIndex !== b.length) {
    diffs.push(new Diff(DIFF_INSERT, b.slice(bIndex)));
  }
  return diffs;
};

const concatenateRelevantDiffs = (op, diffs, changeColor) => diffs.reduce(
  (reduced, diff) => reduced + (diff[0] === DIFF_EQUAL ? diff[1] : diff[0] === op && diff[1].length > 0 ? changeColor(diff[1]) : ""),
  ""
);
class ChangeBuffer {
  op;
  line;
  // incomplete line
  lines;
  // complete lines
  changeColor;
  constructor(op, changeColor) {
    this.op = op;
    this.line = [];
    this.lines = [];
    this.changeColor = changeColor;
  }
  pushSubstring(substring) {
    this.pushDiff(new Diff(this.op, substring));
  }
  pushLine() {
    this.lines.push(
      this.line.length === 1 ? this.line[0][0] === this.op ? this.line[0] : new Diff(this.op, this.line[0][1]) : new Diff(
        this.op,
        concatenateRelevantDiffs(this.op, this.line, this.changeColor)
      )
      // was common diff
    );
    this.line.length = 0;
  }
  isLineEmpty() {
    return this.line.length === 0;
  }
  // Minor input to buffer.
  pushDiff(diff) {
    this.line.push(diff);
  }
  // Main input to buffer.
  align(diff) {
    const string = diff[1];
    if (string.includes("\n")) {
      const substrings = string.split("\n");
      const iLast = substrings.length - 1;
      for (const [i, substring] of substrings.entries()) {
        if (i < iLast) {
          this.pushSubstring(substring);
          this.pushLine();
        } else if (substring.length > 0) {
          this.pushSubstring(substring);
        }
      }
    } else {
      this.pushDiff(diff);
    }
  }
  // Output from buffer.
  moveLinesTo(lines) {
    if (!this.isLineEmpty()) {
      this.pushLine();
    }
    lines.push(...this.lines);
    this.lines.length = 0;
  }
}
class CommonBuffer {
  deleteBuffer;
  insertBuffer;
  lines;
  constructor(deleteBuffer, insertBuffer) {
    this.deleteBuffer = deleteBuffer;
    this.insertBuffer = insertBuffer;
    this.lines = [];
  }
  pushDiffCommonLine(diff) {
    this.lines.push(diff);
  }
  pushDiffChangeLines(diff) {
    const isDiffEmpty = diff[1].length === 0;
    if (!isDiffEmpty || this.deleteBuffer.isLineEmpty()) {
      this.deleteBuffer.pushDiff(diff);
    }
    if (!isDiffEmpty || this.insertBuffer.isLineEmpty()) {
      this.insertBuffer.pushDiff(diff);
    }
  }
  flushChangeLines() {
    this.deleteBuffer.moveLinesTo(this.lines);
    this.insertBuffer.moveLinesTo(this.lines);
  }
  // Input to buffer.
  align(diff) {
    const op = diff[0];
    const string = diff[1];
    if (string.includes("\n")) {
      const substrings = string.split("\n");
      const iLast = substrings.length - 1;
      for (const [i, substring] of substrings.entries()) {
        if (i === 0) {
          const subdiff = new Diff(op, substring);
          if (this.deleteBuffer.isLineEmpty() && this.insertBuffer.isLineEmpty()) {
            this.flushChangeLines();
            this.pushDiffCommonLine(subdiff);
          } else {
            this.pushDiffChangeLines(subdiff);
            this.flushChangeLines();
          }
        } else if (i < iLast) {
          this.pushDiffCommonLine(new Diff(op, substring));
        } else if (substring.length > 0) {
          this.pushDiffChangeLines(new Diff(op, substring));
        }
      }
    } else {
      this.pushDiffChangeLines(diff);
    }
  }
  // Output from buffer.
  getLines() {
    this.flushChangeLines();
    return this.lines;
  }
}
const getAlignedDiffs = (diffs, changeColor) => {
  const deleteBuffer = new ChangeBuffer(DIFF_DELETE, changeColor);
  const insertBuffer = new ChangeBuffer(DIFF_INSERT, changeColor);
  const commonBuffer = new CommonBuffer(deleteBuffer, insertBuffer);
  for (const diff of diffs) {
    switch (diff[0]) {
      case DIFF_DELETE:
        deleteBuffer.align(diff);
        break;
      case DIFF_INSERT:
        insertBuffer.align(diff);
        break;
      default:
        commonBuffer.align(diff);
    }
  }
  return commonBuffer.getLines();
};

const hasCommonDiff = (diffs, isMultiline) => {
  if (isMultiline) {
    const iLast = diffs.length - 1;
    return diffs.some(
      (diff, i) => diff[0] === DIFF_EQUAL && (i !== iLast || diff[1] !== "\n")
    );
  }
  return diffs.some((diff) => diff[0] === DIFF_EQUAL);
};
const diffStringsUnified = (a, b, options) => {
  if (a !== b && a.length > 0 && b.length > 0) {
    const isMultiline = a.includes("\n") || b.includes("\n");
    const diffs = diffStringsRaw(
      isMultiline ? `${a}
` : a,
      isMultiline ? `${b}
` : b);
    if (hasCommonDiff(diffs, isMultiline)) {
      const optionsNormalized = normalizeDiffOptions(options);
      const lines = getAlignedDiffs(diffs, optionsNormalized.changeColor);
      return printDiffLines(lines, optionsNormalized);
    }
  }
  return diffLinesUnified(a.split("\n"), b.split("\n"), options);
};
const diffStringsRaw = (a, b, cleanup) => {
  const diffs = diffStrings(a, b);
  {
    diff_cleanupSemantic(diffs);
  }
  return diffs;
};

const getCommonMessage = (message, options) => {
  const { commonColor } = normalizeDiffOptions(options);
  return commonColor(message);
};
const {
  AsymmetricMatcher: AsymmetricMatcher$2,
  DOMCollection: DOMCollection$1,
  DOMElement: DOMElement$1,
  Immutable: Immutable$1,
  ReactElement: ReactElement$1,
  ReactTestComponent: ReactTestComponent$1
} = plugins;
const PLUGINS$1 = [
  ReactTestComponent$1,
  ReactElement$1,
  DOMElement$1,
  DOMCollection$1,
  Immutable$1,
  AsymmetricMatcher$2
];
const FORMAT_OPTIONS = {
  plugins: PLUGINS$1
};
const FALLBACK_FORMAT_OPTIONS = {
  callToJSON: false,
  maxDepth: 10,
  plugins: PLUGINS$1
};
function diff$1(a, b, options) {
  if (Object.is(a, b)) {
    return getCommonMessage(NO_DIFF_MESSAGE, options);
  }
  const aType = getType$1(a);
  let expectedType = aType;
  let omitDifference = false;
  if (aType === "object" && typeof a.asymmetricMatch === "function") {
    if (a.$$typeof !== Symbol.for("jest.asymmetricMatcher")) {
      return null;
    }
    if (typeof a.getExpectedType !== "function") {
      return null;
    }
    expectedType = a.getExpectedType();
    omitDifference = expectedType === "string";
  }
  if (expectedType !== getType$1(b)) {
    return `  Comparing two different types of values. Expected ${chalk.green(expectedType)} but received ${chalk.red(getType$1(b))}.`;
  }
  if (omitDifference) {
    return null;
  }
  switch (aType) {
    case "string":
      return diffLinesUnified(
        escapeControlCharacters(a).split("\n"),
        escapeControlCharacters(b).split("\n"),
        options
      );
    case "boolean":
    case "number":
      return comparePrimitive(a, b, options);
    case "map":
      return compareObjects(sortMap(a), sortMap(b), options);
    case "set":
      return compareObjects(sortSet(a), sortSet(b), options);
    default:
      return compareObjects(a, b, options);
  }
}
function comparePrimitive(a, b, options) {
  const aFormat = format(a, FORMAT_OPTIONS);
  const bFormat = format(b, FORMAT_OPTIONS);
  return aFormat === bFormat ? getCommonMessage(NO_DIFF_MESSAGE, options) : diffLinesUnified(aFormat.split("\n"), bFormat.split("\n"), options);
}
function sortMap(map) {
  return new Map([...map].sort());
}
function sortSet(set) {
  return new Set([...set].sort());
}
function compareObjects(a, b, options) {
  let difference;
  let hasThrown = false;
  try {
    const formatOptions = getFormatOptions(FORMAT_OPTIONS, options);
    difference = getObjectsDifference(a, b, formatOptions, options);
  } catch {
    hasThrown = true;
  }
  const noDiffMessage = getCommonMessage(NO_DIFF_MESSAGE, options);
  if (difference === void 0 || difference === noDiffMessage) {
    const formatOptions = getFormatOptions(FALLBACK_FORMAT_OPTIONS, options);
    difference = getObjectsDifference(a, b, formatOptions, options);
    if (difference !== noDiffMessage && !hasThrown) {
      difference = `${getCommonMessage(
        SIMILAR_MESSAGE,
        options
      )}

${difference}`;
    }
  }
  return difference;
}
function getFormatOptions(formatOptions, options) {
  const { compareKeys } = normalizeDiffOptions(options);
  return {
    ...formatOptions,
    compareKeys
  };
}
function getObjectsDifference(a, b, formatOptions, options) {
  const formatOptionsZeroIndent = { ...formatOptions, indent: 0 };
  const aCompare = format(a, formatOptionsZeroIndent);
  const bCompare = format(b, formatOptionsZeroIndent);
  if (aCompare === bCompare) {
    return getCommonMessage(NO_DIFF_MESSAGE, options);
  } else {
    const aDisplay = format(a, formatOptions);
    const bDisplay = format(b, formatOptions);
    return diffLinesUnified2(
      aDisplay.split("\n"),
      bDisplay.split("\n"),
      aCompare.split("\n"),
      bCompare.split("\n"),
      options
    );
  }
}

const supportTypes = /* @__PURE__ */ new Set(["map", "array", "object"]);
class Replaceable {
  object;
  type;
  constructor(object) {
    this.object = object;
    this.type = getType$1(object);
    if (!supportTypes.has(this.type)) {
      throw new Error(`Type ${this.type} is not support in Replaceable!`);
    }
  }
  static isReplaceable(obj1, obj2) {
    const obj1Type = getType$1(obj1);
    const obj2Type = getType$1(obj2);
    return obj1Type === obj2Type && supportTypes.has(obj1Type);
  }
  forEach(cb) {
    if (this.type === "object") {
      const descriptors = Object.getOwnPropertyDescriptors(this.object);
      for (const key of [
        ...Object.keys(descriptors),
        ...Object.getOwnPropertySymbols(descriptors)
      ].filter((key2) => descriptors[key2].enumerable)) {
        cb(this.object[key], key, this.object);
      }
    } else {
      this.object.forEach(cb);
    }
  }
  get(key) {
    if (this.type === "map") {
      return this.object.get(key);
    }
    return this.object[key];
  }
  set(key, value) {
    if (this.type === "map") {
      this.object.set(key, value);
    } else {
      this.object[key] = value;
    }
  }
}

const builtInObject = [
  Array,
  Date,
  Float32Array,
  Float64Array,
  Int16Array,
  Int32Array,
  Int8Array,
  Map,
  Set,
  RegExp,
  Uint16Array,
  Uint32Array,
  Uint8Array,
  Uint8ClampedArray
];
if (typeof Buffer !== "undefined") {
  builtInObject.push(Buffer);
}
if (typeof Window !== "undefined") {
  builtInObject.push(Window);
}
const SERIALIZABLE_PROPERTIES = Symbol.for(
  "@jest/serializableProperties"
);
const isBuiltInObject = (object) => builtInObject.includes(object.constructor);
const isMap = (value) => value.constructor === Map;
function deepCyclicCopyReplaceable(value, cycles = /* @__PURE__ */ new WeakMap()) {
  if (typeof value !== "object" || value === null) {
    return value;
  } else if (cycles.has(value)) {
    return cycles.get(value);
  } else if (Array.isArray(value)) {
    return deepCyclicCopyArray(value, cycles);
  } else if (isMap(value)) {
    return deepCyclicCopyMap(value, cycles);
  } else if (isBuiltInObject(value)) {
    return value;
  } else if (plugins.DOMElement.test(value)) {
    return value.cloneNode(true);
  } else {
    return deepCyclicCopyObject(value, cycles);
  }
}
function deepCyclicCopyObject(object, cycles) {
  const newObject = Object.create(Object.getPrototypeOf(object));
  let descriptors = {};
  let obj = object;
  do {
    const serializableProperties = getSerializableProperties(obj);
    if (serializableProperties === void 0) {
      descriptors = Object.assign(
        /* @__PURE__ */ Object.create(null),
        Object.getOwnPropertyDescriptors(obj),
        descriptors
      );
    } else {
      for (const property of serializableProperties) {
        if (!descriptors[property]) {
          descriptors[property] = Object.getOwnPropertyDescriptor(
            obj,
            property
          );
        }
      }
    }
  } while ((obj = Object.getPrototypeOf(obj)) && obj !== Object.getPrototypeOf({}));
  cycles.set(object, newObject);
  const newDescriptors = [
    ...Object.keys(descriptors),
    ...Object.getOwnPropertySymbols(descriptors)
  ].reduce(
    //@ts-expect-error because typescript do not support symbol key in object
    //https://github.com/microsoft/TypeScript/issues/1863
    (newDescriptors2, key) => {
      const enumerable = descriptors[key].enumerable;
      newDescriptors2[key] = {
        configurable: true,
        enumerable,
        value: deepCyclicCopyReplaceable(
          // this accesses the value or getter, depending. We just care about the value anyways, and this allows us to not mess with accessors
          // it has the side effect of invoking the getter here though, rather than copying it over
          object[key],
          cycles
        ),
        writable: true
      };
      return newDescriptors2;
    },
    /* @__PURE__ */ Object.create(null)
  );
  return Object.defineProperties(newObject, newDescriptors);
}
function deepCyclicCopyArray(array, cycles) {
  const newArray = new (Object.getPrototypeOf(array)).constructor(array.length);
  const length = array.length;
  cycles.set(array, newArray);
  for (let i = 0; i < length; i++) {
    newArray[i] = deepCyclicCopyReplaceable(array[i], cycles);
  }
  return newArray;
}
function deepCyclicCopyMap(map, cycles) {
  const newMap = /* @__PURE__ */ new Map();
  cycles.set(map, newMap);
  for (const [key, value] of map) {
    newMap.set(key, deepCyclicCopyReplaceable(value, cycles));
  }
  return newMap;
}
function getSerializableProperties(obj) {
  if (typeof obj !== "object" || obj === null) {
    return;
  }
  const serializableProperties = obj[SERIALIZABLE_PROPERTIES];
  if (!Array.isArray(serializableProperties)) {
    return;
  }
  return serializableProperties.filter(
    (key) => typeof key === "string" || typeof key === "symbol"
  );
}

const {
  AsymmetricMatcher: AsymmetricMatcher$1,
  DOMCollection,
  DOMElement,
  Immutable,
  ReactElement,
  ReactTestComponent
} = plugins;
const PLUGINS = [
  ReactTestComponent,
  ReactElement,
  DOMElement,
  DOMCollection,
  Immutable,
  AsymmetricMatcher$1
];
const EXPECTED_COLOR = chalk.green;
const RECEIVED_COLOR = chalk.red;
const INVERTED_COLOR = chalk.inverse;
const BOLD_WEIGHT = chalk.bold;
const DIM_COLOR = chalk.dim;
const MULTILINE_REGEXP = /\n/;
const SPACE_SYMBOL = "·";
const NUMBERS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen"
];
const SUGGEST_TO_CONTAIN_EQUAL = chalk.dim(
  "Looks like you wanted to test for object/array equality with the stricter `toContain` matcher. You probably need to use `toContainEqual` instead."
);
const stringify$1 = (object, maxDepth = 10, maxWidth = 10) => {
  const MAX_LENGTH = 1e4;
  let result;
  try {
    result = format(object, {
      maxDepth,
      maxWidth,
      min: true,
      plugins: PLUGINS
    });
  } catch {
    result = format(object, {
      callToJSON: false,
      maxDepth,
      maxWidth,
      min: true,
      plugins: PLUGINS
    });
  }
  if (result.length >= MAX_LENGTH && maxDepth > 1) {
    return stringify$1(object, Math.floor(maxDepth / 2), maxWidth);
  } else if (result.length >= MAX_LENGTH && maxWidth > 1) {
    return stringify$1(object, maxDepth, Math.floor(maxWidth / 2));
  } else {
    return result;
  }
};
const highlightTrailingWhitespace = (text) => text.replaceAll(/\s+$/gm, chalk.inverse("$&"));
const replaceTrailingSpaces = (text) => text.replaceAll(/\s+$/gm, (spaces) => SPACE_SYMBOL.repeat(spaces.length));
const printReceived = (object) => RECEIVED_COLOR(replaceTrailingSpaces(stringify$1(object)));
const printExpected = (value) => EXPECTED_COLOR(replaceTrailingSpaces(stringify$1(value)));
function printWithType(name, value, print) {
  const type = getType$1(value);
  const hasType = type !== "null" && type !== "undefined" ? `${name} has type:  ${type}
` : "";
  const hasValue = `${name} has value: ${print(value)}`;
  return hasType + hasValue;
}
const ensureNoExpected = (expected, matcherName, options) => {
  if (expected !== void 0) {
    const matcherString = (options ? "" : "[.not]") + matcherName;
    throw new Error(
      matcherErrorMessage(
        matcherHint(matcherString, void 0, "", options),
        // Because expected is omitted in hint above,
        // expected is black instead of green in message below.
        "this matcher must not have an expected argument",
        printWithType("Expected", expected, printExpected)
      )
    );
  }
};
const ensureActualIsNumber = (actual, matcherName, options) => {
  if (typeof actual !== "number" && typeof actual !== "bigint") {
    const matcherString = (options ? "" : "[.not]") + matcherName;
    throw new Error(
      matcherErrorMessage(
        matcherHint(matcherString, void 0, void 0, options),
        `${RECEIVED_COLOR("received")} value must be a number or bigint`,
        printWithType("Received", actual, printReceived)
      )
    );
  }
};
const ensureExpectedIsNumber = (expected, matcherName, options) => {
  if (typeof expected !== "number" && typeof expected !== "bigint") {
    const matcherString = (options ? "" : "[.not]") + matcherName;
    throw new Error(
      matcherErrorMessage(
        matcherHint(matcherString, void 0, void 0, options),
        `${EXPECTED_COLOR("expected")} value must be a number or bigint`,
        printWithType("Expected", expected, printExpected)
      )
    );
  }
};
const ensureNumbers = (actual, expected, matcherName, options) => {
  ensureActualIsNumber(actual, matcherName, options);
  ensureExpectedIsNumber(expected, matcherName, options);
};
const ensureExpectedIsNonNegativeInteger = (expected, matcherName, options) => {
  if (typeof expected !== "number" || !Number.isSafeInteger(expected) || expected < 0) {
    const matcherString = (options ? "" : "[.not]") + matcherName;
    throw new Error(
      matcherErrorMessage(
        matcherHint(matcherString, void 0, void 0, options),
        `${EXPECTED_COLOR("expected")} value must be a non-negative integer`,
        printWithType("Expected", expected, printExpected)
      )
    );
  }
};
const getCommonAndChangedSubstrings = (diffs, op, hasCommonDiff) => diffs.reduce(
  (reduced, diff2) => reduced + (diff2[0] === DIFF_EQUAL ? diff2[1] : diff2[0] === op ? hasCommonDiff ? INVERTED_COLOR(diff2[1]) : diff2[1] : ""),
  ""
);
const isLineDiffable = (expected, received) => {
  const expectedType = getType$1(expected);
  const receivedType = getType$1(received);
  if (expectedType !== receivedType) {
    return false;
  }
  if (isPrimitive(expected)) {
    return typeof expected === "string" && typeof received === "string" && expected.length > 0 && received.length > 0 && (MULTILINE_REGEXP.test(expected) || MULTILINE_REGEXP.test(received));
  }
  if (expectedType === "date" || expectedType === "function" || expectedType === "regexp") {
    return false;
  }
  if (expected instanceof Error && received instanceof Error) {
    return false;
  }
  if (receivedType === "object" && typeof received.asymmetricMatch === "function") {
    return false;
  }
  return true;
};
const MAX_DIFF_STRING_LENGTH = 2e4;
const printDiffOrStringify = (expected, received, expectedLabel, receivedLabel, expand) => {
  if (typeof expected === "string" && typeof received === "string" && expected.length > 0 && received.length > 0 && expected.length <= MAX_DIFF_STRING_LENGTH && received.length <= MAX_DIFF_STRING_LENGTH && expected !== received) {
    if (expected.includes("\n") || received.includes("\n")) {
      return diffStringsUnified(expected, received, {
        aAnnotation: expectedLabel,
        bAnnotation: receivedLabel,
        changeLineTrailingSpaceColor: chalk.bgYellow,
        commonLineTrailingSpaceColor: chalk.bgYellow,
        emptyFirstOrLastLinePlaceholder: "↵",
        // U+21B5
        expand,
        includeChangeCounts: true
      });
    }
    const diffs = diffStringsRaw(expected, received);
    const hasCommonDiff = diffs.some((diff2) => diff2[0] === DIFF_EQUAL);
    const printLabel2 = getLabelPrinter(expectedLabel, receivedLabel);
    const expectedLine2 = printLabel2(expectedLabel) + printExpected(
      getCommonAndChangedSubstrings(diffs, DIFF_DELETE, hasCommonDiff)
    );
    const receivedLine2 = printLabel2(receivedLabel) + printReceived(
      getCommonAndChangedSubstrings(diffs, DIFF_INSERT, hasCommonDiff)
    );
    return `${expectedLine2}
${receivedLine2}`;
  }
  if (isLineDiffable(expected, received)) {
    const { replacedExpected, replacedReceived } = replaceMatchedToAsymmetricMatcher(expected, received, [], []);
    const difference = diff$1(replacedExpected, replacedReceived, {
      aAnnotation: expectedLabel,
      bAnnotation: receivedLabel,
      expand,
      includeChangeCounts: true
    });
    if (typeof difference === "string" && difference.includes(`- ${expectedLabel}`) && difference.includes(`+ ${receivedLabel}`)) {
      return difference;
    }
  }
  const printLabel = getLabelPrinter(expectedLabel, receivedLabel);
  const expectedLine = printLabel(expectedLabel) + printExpected(expected);
  const receivedLine = printLabel(receivedLabel) + (stringify$1(expected) === stringify$1(received) ? "serializes to the same string" : printReceived(received));
  return `${expectedLine}
${receivedLine}`;
};
const shouldPrintDiff = (actual, expected) => {
  if (typeof actual === "number" && typeof expected === "number") {
    return false;
  }
  if (typeof actual === "bigint" && typeof expected === "bigint") {
    return false;
  }
  if (typeof actual === "boolean" && typeof expected === "boolean") {
    return false;
  }
  return true;
};
function replaceMatchedToAsymmetricMatcher(replacedExpected, replacedReceived, expectedCycles, receivedCycles) {
  return _replaceMatchedToAsymmetricMatcher(
    deepCyclicCopyReplaceable(replacedExpected),
    deepCyclicCopyReplaceable(replacedReceived),
    expectedCycles,
    receivedCycles
  );
}
function _replaceMatchedToAsymmetricMatcher(replacedExpected, replacedReceived, expectedCycles, receivedCycles) {
  if (!Replaceable.isReplaceable(replacedExpected, replacedReceived)) {
    return { replacedExpected, replacedReceived };
  }
  if (expectedCycles.includes(replacedExpected) || receivedCycles.includes(replacedReceived)) {
    return { replacedExpected, replacedReceived };
  }
  expectedCycles.push(replacedExpected);
  receivedCycles.push(replacedReceived);
  const expectedReplaceable = new Replaceable(replacedExpected);
  const receivedReplaceable = new Replaceable(replacedReceived);
  expectedReplaceable.forEach((expectedValue, key) => {
    const receivedValue = receivedReplaceable.get(key);
    if (isAsymmetricMatcher(expectedValue)) {
      if (expectedValue.asymmetricMatch(receivedValue)) {
        receivedReplaceable.set(key, expectedValue);
      }
    } else if (isAsymmetricMatcher(receivedValue)) {
      if (receivedValue.asymmetricMatch(expectedValue)) {
        expectedReplaceable.set(key, receivedValue);
      }
    } else if (Replaceable.isReplaceable(expectedValue, receivedValue)) {
      const replaced = _replaceMatchedToAsymmetricMatcher(
        expectedValue,
        receivedValue,
        expectedCycles,
        receivedCycles
      );
      expectedReplaceable.set(key, replaced.replacedExpected);
      receivedReplaceable.set(key, replaced.replacedReceived);
    }
  });
  return {
    replacedExpected: expectedReplaceable.object,
    replacedReceived: receivedReplaceable.object
  };
}
function isAsymmetricMatcher(data) {
  const type = getType$1(data);
  return type === "object" && typeof data.asymmetricMatch === "function";
}
const diff = (a, b, options) => shouldPrintDiff(a, b) ? diff$1(a, b, options) : null;
const pluralize$1 = (word, count) => `${NUMBERS[count] || count} ${word}${count === 1 ? "" : "s"}`;
const getLabelPrinter = (...strings) => {
  const maxLength = strings.reduce(
    (max, string) => Math.max(string.length, max),
    0
  );
  return (string) => `${string}: ${" ".repeat(maxLength - string.length)}`;
};
const matcherErrorMessage = (hint, generic, specific) => `${hint}

${chalk.bold("Matcher error")}: ${generic}${typeof specific === "string" ? `

${specific}` : ""}`;
const matcherHint = (matcherName, received = "received", expected = "expected", options = {}) => {
  const {
    comment = "",
    expectedColor = EXPECTED_COLOR,
    isDirectExpectCall = false,
    // seems redundant with received === ''
    isNot = false,
    promise = "",
    receivedColor = RECEIVED_COLOR,
    secondArgument = "",
    secondArgumentColor = EXPECTED_COLOR
  } = options;
  let hint = "";
  let dimString = "expect";
  if (!isDirectExpectCall && received !== "") {
    hint += DIM_COLOR(`${dimString}(`) + receivedColor(received);
    dimString = ")";
  }
  if (promise !== "") {
    hint += DIM_COLOR(`${dimString}.`) + promise;
    dimString = "";
  }
  if (isNot) {
    hint += `${DIM_COLOR(`${dimString}.`)}not`;
    dimString = "";
  }
  if (matcherName.includes(".")) {
    dimString += matcherName;
  } else {
    hint += DIM_COLOR(`${dimString}.`) + matcherName;
    dimString = "";
  }
  if (expected === "") {
    dimString += "()";
  } else {
    hint += DIM_COLOR(`${dimString}(`) + expectedColor(expected);
    if (secondArgument) {
      hint += DIM_COLOR(", ") + secondArgumentColor(secondArgument);
    }
    dimString = ")";
  }
  if (comment !== "") {
    dimString += ` // ${comment}`;
  }
  if (dimString !== "") {
    hint += DIM_COLOR(dimString);
  }
  return hint;
};

const matcherUtils = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  BOLD_WEIGHT,
  DIM_COLOR,
  EXPECTED_COLOR,
  INVERTED_COLOR,
  RECEIVED_COLOR,
  SERIALIZABLE_PROPERTIES,
  SUGGEST_TO_CONTAIN_EQUAL,
  diff,
  ensureActualIsNumber,
  ensureExpectedIsNonNegativeInteger,
  ensureExpectedIsNumber,
  ensureNoExpected,
  ensureNumbers,
  getLabelPrinter,
  highlightTrailingWhitespace,
  matcherErrorMessage,
  matcherHint,
  pluralize: pluralize$1,
  printDiffOrStringify,
  printExpected,
  printReceived,
  printWithType,
  replaceMatchedToAsymmetricMatcher,
  stringify: stringify$1
}, Symbol.toStringTag, { value: 'Module' }));

var ciInfo = {};

const require$$0 = [
	{
		name: "Agola CI",
		constant: "AGOLA",
		env: "AGOLA_GIT_REF",
		pr: "AGOLA_PULL_REQUEST_ID"
	},
	{
		name: "Appcircle",
		constant: "APPCIRCLE",
		env: "AC_APPCIRCLE",
		pr: {
			env: "AC_GIT_PR",
			ne: "false"
		}
	},
	{
		name: "AppVeyor",
		constant: "APPVEYOR",
		env: "APPVEYOR",
		pr: "APPVEYOR_PULL_REQUEST_NUMBER"
	},
	{
		name: "AWS CodeBuild",
		constant: "CODEBUILD",
		env: "CODEBUILD_BUILD_ARN",
		pr: {
			env: "CODEBUILD_WEBHOOK_EVENT",
			any: [
				"PULL_REQUEST_CREATED",
				"PULL_REQUEST_UPDATED",
				"PULL_REQUEST_REOPENED"
			]
		}
	},
	{
		name: "Azure Pipelines",
		constant: "AZURE_PIPELINES",
		env: "TF_BUILD",
		pr: {
			BUILD_REASON: "PullRequest"
		}
	},
	{
		name: "Bamboo",
		constant: "BAMBOO",
		env: "bamboo_planKey"
	},
	{
		name: "Bitbucket Pipelines",
		constant: "BITBUCKET",
		env: "BITBUCKET_COMMIT",
		pr: "BITBUCKET_PR_ID"
	},
	{
		name: "Bitrise",
		constant: "BITRISE",
		env: "BITRISE_IO",
		pr: "BITRISE_PULL_REQUEST"
	},
	{
		name: "Buddy",
		constant: "BUDDY",
		env: "BUDDY_WORKSPACE_ID",
		pr: "BUDDY_EXECUTION_PULL_REQUEST_ID"
	},
	{
		name: "Buildkite",
		constant: "BUILDKITE",
		env: "BUILDKITE",
		pr: {
			env: "BUILDKITE_PULL_REQUEST",
			ne: "false"
		}
	},
	{
		name: "CircleCI",
		constant: "CIRCLE",
		env: "CIRCLECI",
		pr: "CIRCLE_PULL_REQUEST"
	},
	{
		name: "Cirrus CI",
		constant: "CIRRUS",
		env: "CIRRUS_CI",
		pr: "CIRRUS_PR"
	},
	{
		name: "Cloudflare Pages",
		constant: "CLOUDFLARE_PAGES",
		env: "CF_PAGES"
	},
	{
		name: "Cloudflare Workers",
		constant: "CLOUDFLARE_WORKERS",
		env: "WORKERS_CI"
	},
	{
		name: "Codefresh",
		constant: "CODEFRESH",
		env: "CF_BUILD_ID",
		pr: {
			any: [
				"CF_PULL_REQUEST_NUMBER",
				"CF_PULL_REQUEST_ID"
			]
		}
	},
	{
		name: "Codemagic",
		constant: "CODEMAGIC",
		env: "CM_BUILD_ID",
		pr: "CM_PULL_REQUEST"
	},
	{
		name: "Codeship",
		constant: "CODESHIP",
		env: {
			CI_NAME: "codeship"
		}
	},
	{
		name: "Drone",
		constant: "DRONE",
		env: "DRONE",
		pr: {
			DRONE_BUILD_EVENT: "pull_request"
		}
	},
	{
		name: "dsari",
		constant: "DSARI",
		env: "DSARI"
	},
	{
		name: "Earthly",
		constant: "EARTHLY",
		env: "EARTHLY_CI"
	},
	{
		name: "Expo Application Services",
		constant: "EAS",
		env: "EAS_BUILD"
	},
	{
		name: "Gerrit",
		constant: "GERRIT",
		env: "GERRIT_PROJECT"
	},
	{
		name: "Gitea Actions",
		constant: "GITEA_ACTIONS",
		env: "GITEA_ACTIONS"
	},
	{
		name: "GitHub Actions",
		constant: "GITHUB_ACTIONS",
		env: "GITHUB_ACTIONS",
		pr: {
			GITHUB_EVENT_NAME: "pull_request"
		}
	},
	{
		name: "GitLab CI",
		constant: "GITLAB",
		env: "GITLAB_CI",
		pr: "CI_MERGE_REQUEST_ID"
	},
	{
		name: "GoCD",
		constant: "GOCD",
		env: "GO_PIPELINE_LABEL"
	},
	{
		name: "Google Cloud Build",
		constant: "GOOGLE_CLOUD_BUILD",
		env: "BUILDER_OUTPUT"
	},
	{
		name: "Harness CI",
		constant: "HARNESS",
		env: "HARNESS_BUILD_ID"
	},
	{
		name: "Heroku",
		constant: "HEROKU",
		env: {
			env: "NODE",
			includes: "/app/.heroku/node/bin/node"
		}
	},
	{
		name: "Hudson",
		constant: "HUDSON",
		env: "HUDSON_URL"
	},
	{
		name: "Jenkins",
		constant: "JENKINS",
		env: [
			"JENKINS_URL",
			"BUILD_ID"
		],
		pr: {
			any: [
				"ghprbPullId",
				"CHANGE_ID"
			]
		}
	},
	{
		name: "LayerCI",
		constant: "LAYERCI",
		env: "LAYERCI",
		pr: "LAYERCI_PULL_REQUEST"
	},
	{
		name: "Magnum CI",
		constant: "MAGNUM",
		env: "MAGNUM"
	},
	{
		name: "Netlify CI",
		constant: "NETLIFY",
		env: "NETLIFY",
		pr: {
			env: "PULL_REQUEST",
			ne: "false"
		}
	},
	{
		name: "Nevercode",
		constant: "NEVERCODE",
		env: "NEVERCODE",
		pr: {
			env: "NEVERCODE_PULL_REQUEST",
			ne: "false"
		}
	},
	{
		name: "Prow",
		constant: "PROW",
		env: "PROW_JOB_ID"
	},
	{
		name: "ReleaseHub",
		constant: "RELEASEHUB",
		env: "RELEASE_BUILD_ID"
	},
	{
		name: "Render",
		constant: "RENDER",
		env: "RENDER",
		pr: {
			IS_PULL_REQUEST: "true"
		}
	},
	{
		name: "Sail CI",
		constant: "SAIL",
		env: "SAILCI",
		pr: "SAIL_PULL_REQUEST_NUMBER"
	},
	{
		name: "Screwdriver",
		constant: "SCREWDRIVER",
		env: "SCREWDRIVER",
		pr: {
			env: "SD_PULL_REQUEST",
			ne: "false"
		}
	},
	{
		name: "Semaphore",
		constant: "SEMAPHORE",
		env: "SEMAPHORE",
		pr: "PULL_REQUEST_NUMBER"
	},
	{
		name: "Sourcehut",
		constant: "SOURCEHUT",
		env: {
			CI_NAME: "sourcehut"
		}
	},
	{
		name: "Strider CD",
		constant: "STRIDER",
		env: "STRIDER"
	},
	{
		name: "TaskCluster",
		constant: "TASKCLUSTER",
		env: [
			"TASK_ID",
			"RUN_ID"
		]
	},
	{
		name: "TeamCity",
		constant: "TEAMCITY",
		env: "TEAMCITY_VERSION"
	},
	{
		name: "Travis CI",
		constant: "TRAVIS",
		env: "TRAVIS",
		pr: {
			env: "TRAVIS_PULL_REQUEST",
			ne: "false"
		}
	},
	{
		name: "Vela",
		constant: "VELA",
		env: "VELA",
		pr: {
			VELA_PULL_REQUEST: "1"
		}
	},
	{
		name: "Vercel",
		constant: "VERCEL",
		env: {
			any: [
				"NOW_BUILDER",
				"VERCEL"
			]
		},
		pr: "VERCEL_GIT_PULL_REQUEST_ID"
	},
	{
		name: "Visual Studio App Center",
		constant: "APPCENTER",
		env: "APPCENTER_BUILD_ID"
	},
	{
		name: "Woodpecker",
		constant: "WOODPECKER",
		env: {
			CI: "woodpecker"
		},
		pr: {
			CI_BUILD_EVENT: "pull_request"
		}
	},
	{
		name: "Xcode Cloud",
		constant: "XCODE_CLOUD",
		env: "CI_XCODE_PROJECT",
		pr: "CI_PULL_REQUEST_NUMBER"
	},
	{
		name: "Xcode Server",
		constant: "XCODE_SERVER",
		env: "XCS"
	}
];

var hasRequiredCiInfo;

function requireCiInfo () {
	if (hasRequiredCiInfo) return ciInfo;
	hasRequiredCiInfo = 1;
	(function (exports) {

		const vendors = require$$0;

		const env = process.env;

		// Used for testing only
		Object.defineProperty(exports, '_vendors', {
		  value: vendors.map(function (v) {
		    return v.constant
		  })
		});

		exports.name = null;
		exports.isPR = null;
		exports.id = null;

		if (env.CI !== 'false') {
		  vendors.forEach(function (vendor) {
		    const envs = Array.isArray(vendor.env) ? vendor.env : [vendor.env];
		    const isCI = envs.every(function (obj) {
		      return checkEnv(obj)
		    });

		    exports[vendor.constant] = isCI;

		    if (!isCI) {
		      return
		    }

		    exports.name = vendor.name;
		    exports.isPR = checkPR(vendor);
		    exports.id = vendor.constant;
		  });
		}

		exports.isCI = !!(
		  env.CI !== 'false' && // Bypass all checks if CI env is explicitly set to 'false'
		  (env.BUILD_ID || // Jenkins, Cloudbees
		    env.BUILD_NUMBER || // Jenkins, TeamCity
		    env.CI || // Travis CI, CircleCI, Cirrus CI, Gitlab CI, Appveyor, CodeShip, dsari, Cloudflare Pages/Workers
		    env.CI_APP_ID || // Appflow
		    env.CI_BUILD_ID || // Appflow
		    env.CI_BUILD_NUMBER || // Appflow
		    env.CI_NAME || // Codeship and others
		    env.CONTINUOUS_INTEGRATION || // Travis CI, Cirrus CI
		    env.RUN_ID || // TaskCluster, dsari
		    exports.name ||
		    false)
		);

		function checkEnv (obj) {
		  // "env": "CIRRUS"
		  if (typeof obj === 'string') return !!env[obj]

		  // "env": { "env": "NODE", "includes": "/app/.heroku/node/bin/node" }
		  if ('env' in obj) {
		    // Currently there are no other types, uncomment when there are
		    // if ('includes' in obj) {
		    return env[obj.env] && env[obj.env].includes(obj.includes)
		    // }
		  }

		  if ('any' in obj) {
		    return obj.any.some(function (k) {
		      return !!env[k]
		    })
		  }

		  return Object.keys(obj).every(function (k) {
		    return env[k] === obj[k]
		  })
		}

		function checkPR (vendor) {
		  switch (typeof vendor.pr) {
		    case 'string':
		      // "pr": "CIRRUS_PR"
		      return !!env[vendor.pr]
		    case 'object':
		      if ('env' in vendor.pr) {
		        if ('any' in vendor.pr) {
		          // "pr": { "env": "CODEBUILD_WEBHOOK_EVENT", "any": ["PULL_REQUEST_CREATED", "PULL_REQUEST_UPDATED"] }
		          return vendor.pr.any.some(function (key) {
		            return env[vendor.pr.env] === key
		          })
		        } else {
		          // "pr": { "env": "BUILDKITE_PULL_REQUEST", "ne": "false" }
		          return vendor.pr.env in env && env[vendor.pr.env] !== vendor.pr.ne
		        }
		      } else if ('any' in vendor.pr) {
		        // "pr": { "any": ["ghprbPullId", "CHANGE_ID"] }
		        return vendor.pr.any.some(function (key) {
		          return !!env[key]
		        })
		      } else {
		        // "pr": { "DRONE_BUILD_EVENT": "pull_request" }
		        return checkEnv(vendor.pr)
		      }
		    default:
		      // PR detection not supported for this vendor
		      return null
		  }
		} 
	} (ciInfo));
	return ciInfo;
}

var ciInfoExports = requireCiInfo();

function checkIsInteractive() {
  if (ciInfoExports.isCI) {
    return false;
  }
  if (process.stdout == null) {
    return false;
  }
  if (process.stdout.isTTY) {
    return process.env.TERM !== "dumb";
  }
  return false;
}
checkIsInteractive();

process.platform === "win32";

var polyfills;
var hasRequiredPolyfills;

function requirePolyfills () {
	if (hasRequiredPolyfills) return polyfills;
	hasRequiredPolyfills = 1;
	var constants = require$$0$1;

	var origCwd = process.cwd;
	var cwd = null;

	var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;

	process.cwd = function() {
	  if (!cwd)
	    cwd = origCwd.call(process);
	  return cwd
	};
	try {
	  process.cwd();
	} catch (er) {}

	// This check is needed until node.js 12 is required
	if (typeof process.chdir === 'function') {
	  var chdir = process.chdir;
	  process.chdir = function (d) {
	    cwd = null;
	    chdir.call(process, d);
	  };
	  if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
	}

	polyfills = patch;

	function patch (fs) {
	  // (re-)implement some things that are known busted or missing.

	  // lchmod, broken prior to 0.6.2
	  // back-port the fix here.
	  if (constants.hasOwnProperty('O_SYMLINK') &&
	      process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
	    patchLchmod(fs);
	  }

	  // lutimes implementation, or no-op
	  if (!fs.lutimes) {
	    patchLutimes(fs);
	  }

	  // https://github.com/isaacs/node-graceful-fs/issues/4
	  // Chown should not fail on einval or eperm if non-root.
	  // It should not fail on enosys ever, as this just indicates
	  // that a fs doesn't support the intended operation.

	  fs.chown = chownFix(fs.chown);
	  fs.fchown = chownFix(fs.fchown);
	  fs.lchown = chownFix(fs.lchown);

	  fs.chmod = chmodFix(fs.chmod);
	  fs.fchmod = chmodFix(fs.fchmod);
	  fs.lchmod = chmodFix(fs.lchmod);

	  fs.chownSync = chownFixSync(fs.chownSync);
	  fs.fchownSync = chownFixSync(fs.fchownSync);
	  fs.lchownSync = chownFixSync(fs.lchownSync);

	  fs.chmodSync = chmodFixSync(fs.chmodSync);
	  fs.fchmodSync = chmodFixSync(fs.fchmodSync);
	  fs.lchmodSync = chmodFixSync(fs.lchmodSync);

	  fs.stat = statFix(fs.stat);
	  fs.fstat = statFix(fs.fstat);
	  fs.lstat = statFix(fs.lstat);

	  fs.statSync = statFixSync(fs.statSync);
	  fs.fstatSync = statFixSync(fs.fstatSync);
	  fs.lstatSync = statFixSync(fs.lstatSync);

	  // if lchmod/lchown do not exist, then make them no-ops
	  if (fs.chmod && !fs.lchmod) {
	    fs.lchmod = function (path, mode, cb) {
	      if (cb) process.nextTick(cb);
	    };
	    fs.lchmodSync = function () {};
	  }
	  if (fs.chown && !fs.lchown) {
	    fs.lchown = function (path, uid, gid, cb) {
	      if (cb) process.nextTick(cb);
	    };
	    fs.lchownSync = function () {};
	  }

	  // on Windows, A/V software can lock the directory, causing this
	  // to fail with an EACCES or EPERM if the directory contains newly
	  // created files.  Try again on failure, for up to 60 seconds.

	  // Set the timeout this long because some Windows Anti-Virus, such as Parity
	  // bit9, may lock files for up to a minute, causing npm package install
	  // failures. Also, take care to yield the scheduler. Windows scheduling gives
	  // CPU to a busy looping process, which can cause the program causing the lock
	  // contention to be starved of CPU by node, so the contention doesn't resolve.
	  if (platform === "win32") {
	    fs.rename = typeof fs.rename !== 'function' ? fs.rename
	    : (function (fs$rename) {
	      function rename (from, to, cb) {
	        var start = Date.now();
	        var backoff = 0;
	        fs$rename(from, to, function CB (er) {
	          if (er
	              && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY")
	              && Date.now() - start < 60000) {
	            setTimeout(function() {
	              fs.stat(to, function (stater, st) {
	                if (stater && stater.code === "ENOENT")
	                  fs$rename(from, to, CB);
	                else
	                  cb(er);
	              });
	            }, backoff);
	            if (backoff < 100)
	              backoff += 10;
	            return;
	          }
	          if (cb) cb(er);
	        });
	      }
	      if (Object.setPrototypeOf) Object.setPrototypeOf(rename, fs$rename);
	      return rename
	    })(fs.rename);
	  }

	  // if read() returns EAGAIN, then just try it again.
	  fs.read = typeof fs.read !== 'function' ? fs.read
	  : (function (fs$read) {
	    function read (fd, buffer, offset, length, position, callback_) {
	      var callback;
	      if (callback_ && typeof callback_ === 'function') {
	        var eagCounter = 0;
	        callback = function (er, _, __) {
	          if (er && er.code === 'EAGAIN' && eagCounter < 10) {
	            eagCounter ++;
	            return fs$read.call(fs, fd, buffer, offset, length, position, callback)
	          }
	          callback_.apply(this, arguments);
	        };
	      }
	      return fs$read.call(fs, fd, buffer, offset, length, position, callback)
	    }

	    // This ensures `util.promisify` works as it does for native `fs.read`.
	    if (Object.setPrototypeOf) Object.setPrototypeOf(read, fs$read);
	    return read
	  })(fs.read);

	  fs.readSync = typeof fs.readSync !== 'function' ? fs.readSync
	  : (function (fs$readSync) { return function (fd, buffer, offset, length, position) {
	    var eagCounter = 0;
	    while (true) {
	      try {
	        return fs$readSync.call(fs, fd, buffer, offset, length, position)
	      } catch (er) {
	        if (er.code === 'EAGAIN' && eagCounter < 10) {
	          eagCounter ++;
	          continue
	        }
	        throw er
	      }
	    }
	  }})(fs.readSync);

	  function patchLchmod (fs) {
	    fs.lchmod = function (path, mode, callback) {
	      fs.open( path
	             , constants.O_WRONLY | constants.O_SYMLINK
	             , mode
	             , function (err, fd) {
	        if (err) {
	          if (callback) callback(err);
	          return
	        }
	        // prefer to return the chmod error, if one occurs,
	        // but still try to close, and report closing errors if they occur.
	        fs.fchmod(fd, mode, function (err) {
	          fs.close(fd, function(err2) {
	            if (callback) callback(err || err2);
	          });
	        });
	      });
	    };

	    fs.lchmodSync = function (path, mode) {
	      var fd = fs.openSync(path, constants.O_WRONLY | constants.O_SYMLINK, mode);

	      // prefer to return the chmod error, if one occurs,
	      // but still try to close, and report closing errors if they occur.
	      var threw = true;
	      var ret;
	      try {
	        ret = fs.fchmodSync(fd, mode);
	        threw = false;
	      } finally {
	        if (threw) {
	          try {
	            fs.closeSync(fd);
	          } catch (er) {}
	        } else {
	          fs.closeSync(fd);
	        }
	      }
	      return ret
	    };
	  }

	  function patchLutimes (fs) {
	    if (constants.hasOwnProperty("O_SYMLINK") && fs.futimes) {
	      fs.lutimes = function (path, at, mt, cb) {
	        fs.open(path, constants.O_SYMLINK, function (er, fd) {
	          if (er) {
	            if (cb) cb(er);
	            return
	          }
	          fs.futimes(fd, at, mt, function (er) {
	            fs.close(fd, function (er2) {
	              if (cb) cb(er || er2);
	            });
	          });
	        });
	      };

	      fs.lutimesSync = function (path, at, mt) {
	        var fd = fs.openSync(path, constants.O_SYMLINK);
	        var ret;
	        var threw = true;
	        try {
	          ret = fs.futimesSync(fd, at, mt);
	          threw = false;
	        } finally {
	          if (threw) {
	            try {
	              fs.closeSync(fd);
	            } catch (er) {}
	          } else {
	            fs.closeSync(fd);
	          }
	        }
	        return ret
	      };

	    } else if (fs.futimes) {
	      fs.lutimes = function (_a, _b, _c, cb) { if (cb) process.nextTick(cb); };
	      fs.lutimesSync = function () {};
	    }
	  }

	  function chmodFix (orig) {
	    if (!orig) return orig
	    return function (target, mode, cb) {
	      return orig.call(fs, target, mode, function (er) {
	        if (chownErOk(er)) er = null;
	        if (cb) cb.apply(this, arguments);
	      })
	    }
	  }

	  function chmodFixSync (orig) {
	    if (!orig) return orig
	    return function (target, mode) {
	      try {
	        return orig.call(fs, target, mode)
	      } catch (er) {
	        if (!chownErOk(er)) throw er
	      }
	    }
	  }


	  function chownFix (orig) {
	    if (!orig) return orig
	    return function (target, uid, gid, cb) {
	      return orig.call(fs, target, uid, gid, function (er) {
	        if (chownErOk(er)) er = null;
	        if (cb) cb.apply(this, arguments);
	      })
	    }
	  }

	  function chownFixSync (orig) {
	    if (!orig) return orig
	    return function (target, uid, gid) {
	      try {
	        return orig.call(fs, target, uid, gid)
	      } catch (er) {
	        if (!chownErOk(er)) throw er
	      }
	    }
	  }

	  function statFix (orig) {
	    if (!orig) return orig
	    // Older versions of Node erroneously returned signed integers for
	    // uid + gid.
	    return function (target, options, cb) {
	      if (typeof options === 'function') {
	        cb = options;
	        options = null;
	      }
	      function callback (er, stats) {
	        if (stats) {
	          if (stats.uid < 0) stats.uid += 0x100000000;
	          if (stats.gid < 0) stats.gid += 0x100000000;
	        }
	        if (cb) cb.apply(this, arguments);
	      }
	      return options ? orig.call(fs, target, options, callback)
	        : orig.call(fs, target, callback)
	    }
	  }

	  function statFixSync (orig) {
	    if (!orig) return orig
	    // Older versions of Node erroneously returned signed integers for
	    // uid + gid.
	    return function (target, options) {
	      var stats = options ? orig.call(fs, target, options)
	        : orig.call(fs, target);
	      if (stats) {
	        if (stats.uid < 0) stats.uid += 0x100000000;
	        if (stats.gid < 0) stats.gid += 0x100000000;
	      }
	      return stats;
	    }
	  }

	  // ENOSYS means that the fs doesn't support the op. Just ignore
	  // that, because it doesn't matter.
	  //
	  // if there's no getuid, or if getuid() is something other
	  // than 0, and the error is EINVAL or EPERM, then just ignore
	  // it.
	  //
	  // This specific case is a silent failure in cp, install, tar,
	  // and most other unix tools that manage permissions.
	  //
	  // When running as root, or if other types of errors are
	  // encountered, then it's strict.
	  function chownErOk (er) {
	    if (!er)
	      return true

	    if (er.code === "ENOSYS")
	      return true

	    var nonroot = !process.getuid || process.getuid() !== 0;
	    if (nonroot) {
	      if (er.code === "EINVAL" || er.code === "EPERM")
	        return true
	    }

	    return false
	  }
	}
	return polyfills;
}

var legacyStreams;
var hasRequiredLegacyStreams;

function requireLegacyStreams () {
	if (hasRequiredLegacyStreams) return legacyStreams;
	hasRequiredLegacyStreams = 1;
	var Stream = require$$6.Stream;

	legacyStreams = legacy;

	function legacy (fs) {
	  return {
	    ReadStream: ReadStream,
	    WriteStream: WriteStream
	  }

	  function ReadStream (path, options) {
	    if (!(this instanceof ReadStream)) return new ReadStream(path, options);

	    Stream.call(this);

	    var self = this;

	    this.path = path;
	    this.fd = null;
	    this.readable = true;
	    this.paused = false;

	    this.flags = 'r';
	    this.mode = 438; /*=0666*/
	    this.bufferSize = 64 * 1024;

	    options = options || {};

	    // Mixin options into this
	    var keys = Object.keys(options);
	    for (var index = 0, length = keys.length; index < length; index++) {
	      var key = keys[index];
	      this[key] = options[key];
	    }

	    if (this.encoding) this.setEncoding(this.encoding);

	    if (this.start !== undefined) {
	      if ('number' !== typeof this.start) {
	        throw TypeError('start must be a Number');
	      }
	      if (this.end === undefined) {
	        this.end = Infinity;
	      } else if ('number' !== typeof this.end) {
	        throw TypeError('end must be a Number');
	      }

	      if (this.start > this.end) {
	        throw new Error('start must be <= end');
	      }

	      this.pos = this.start;
	    }

	    if (this.fd !== null) {
	      process.nextTick(function() {
	        self._read();
	      });
	      return;
	    }

	    fs.open(this.path, this.flags, this.mode, function (err, fd) {
	      if (err) {
	        self.emit('error', err);
	        self.readable = false;
	        return;
	      }

	      self.fd = fd;
	      self.emit('open', fd);
	      self._read();
	    });
	  }

	  function WriteStream (path, options) {
	    if (!(this instanceof WriteStream)) return new WriteStream(path, options);

	    Stream.call(this);

	    this.path = path;
	    this.fd = null;
	    this.writable = true;

	    this.flags = 'w';
	    this.encoding = 'binary';
	    this.mode = 438; /*=0666*/
	    this.bytesWritten = 0;

	    options = options || {};

	    // Mixin options into this
	    var keys = Object.keys(options);
	    for (var index = 0, length = keys.length; index < length; index++) {
	      var key = keys[index];
	      this[key] = options[key];
	    }

	    if (this.start !== undefined) {
	      if ('number' !== typeof this.start) {
	        throw TypeError('start must be a Number');
	      }
	      if (this.start < 0) {
	        throw new Error('start must be >= zero');
	      }

	      this.pos = this.start;
	    }

	    this.busy = false;
	    this._queue = [];

	    if (this.fd === null) {
	      this._open = fs.open;
	      this._queue.push([this._open, this.path, this.flags, this.mode, undefined]);
	      this.flush();
	    }
	  }
	}
	return legacyStreams;
}

var clone_1;
var hasRequiredClone;

function requireClone () {
	if (hasRequiredClone) return clone_1;
	hasRequiredClone = 1;

	clone_1 = clone;

	var getPrototypeOf = Object.getPrototypeOf || function (obj) {
	  return obj.__proto__
	};

	function clone (obj) {
	  if (obj === null || typeof obj !== 'object')
	    return obj

	  if (obj instanceof Object)
	    var copy = { __proto__: getPrototypeOf(obj) };
	  else
	    var copy = Object.create(null);

	  Object.getOwnPropertyNames(obj).forEach(function (key) {
	    Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
	  });

	  return copy
	}
	return clone_1;
}

var gracefulFs;
var hasRequiredGracefulFs;

function requireGracefulFs () {
	if (hasRequiredGracefulFs) return gracefulFs;
	hasRequiredGracefulFs = 1;
	var fs$1 = fs;
	var polyfills = requirePolyfills();
	var legacy = requireLegacyStreams();
	var clone = requireClone();

	var util = require$$0$2__default;

	/* istanbul ignore next - node 0.x polyfill */
	var gracefulQueue;
	var previousSymbol;

	/* istanbul ignore else - node 0.x polyfill */
	if (typeof Symbol === 'function' && typeof Symbol.for === 'function') {
	  gracefulQueue = Symbol.for('graceful-fs.queue');
	  // This is used in testing by future versions
	  previousSymbol = Symbol.for('graceful-fs.previous');
	} else {
	  gracefulQueue = '___graceful-fs.queue';
	  previousSymbol = '___graceful-fs.previous';
	}

	function noop () {}

	function publishQueue(context, queue) {
	  Object.defineProperty(context, gracefulQueue, {
	    get: function() {
	      return queue
	    }
	  });
	}

	var debug = noop;
	if (util.debuglog)
	  debug = util.debuglog('gfs4');
	else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ''))
	  debug = function() {
	    var m = util.format.apply(util, arguments);
	    m = 'GFS4: ' + m.split(/\n/).join('\nGFS4: ');
	    console.error(m);
	  };

	// Once time initialization
	if (!fs$1[gracefulQueue]) {
	  // This queue can be shared by multiple loaded instances
	  var queue = commonjsGlobal[gracefulQueue] || [];
	  publishQueue(fs$1, queue);

	  // Patch fs.close/closeSync to shared queue version, because we need
	  // to retry() whenever a close happens *anywhere* in the program.
	  // This is essential when multiple graceful-fs instances are
	  // in play at the same time.
	  fs$1.close = (function (fs$close) {
	    function close (fd, cb) {
	      return fs$close.call(fs$1, fd, function (err) {
	        // This function uses the graceful-fs shared queue
	        if (!err) {
	          resetQueue();
	        }

	        if (typeof cb === 'function')
	          cb.apply(this, arguments);
	      })
	    }

	    Object.defineProperty(close, previousSymbol, {
	      value: fs$close
	    });
	    return close
	  })(fs$1.close);

	  fs$1.closeSync = (function (fs$closeSync) {
	    function closeSync (fd) {
	      // This function uses the graceful-fs shared queue
	      fs$closeSync.apply(fs$1, arguments);
	      resetQueue();
	    }

	    Object.defineProperty(closeSync, previousSymbol, {
	      value: fs$closeSync
	    });
	    return closeSync
	  })(fs$1.closeSync);

	  if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || '')) {
	    process.on('exit', function() {
	      debug(fs$1[gracefulQueue]);
	      require$$5.equal(fs$1[gracefulQueue].length, 0);
	    });
	  }
	}

	if (!commonjsGlobal[gracefulQueue]) {
	  publishQueue(commonjsGlobal, fs$1[gracefulQueue]);
	}

	gracefulFs = patch(clone(fs$1));
	if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs$1.__patched) {
	    gracefulFs = patch(fs$1);
	    fs$1.__patched = true;
	}

	function patch (fs) {
	  // Everything that references the open() function needs to be in here
	  polyfills(fs);
	  fs.gracefulify = patch;

	  fs.createReadStream = createReadStream;
	  fs.createWriteStream = createWriteStream;
	  var fs$readFile = fs.readFile;
	  fs.readFile = readFile;
	  function readFile (path, options, cb) {
	    if (typeof options === 'function')
	      cb = options, options = null;

	    return go$readFile(path, options, cb)

	    function go$readFile (path, options, cb, startTime) {
	      return fs$readFile(path, options, function (err) {
	        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
	          enqueue([go$readFile, [path, options, cb], err, startTime || Date.now(), Date.now()]);
	        else {
	          if (typeof cb === 'function')
	            cb.apply(this, arguments);
	        }
	      })
	    }
	  }

	  var fs$writeFile = fs.writeFile;
	  fs.writeFile = writeFile;
	  function writeFile (path, data, options, cb) {
	    if (typeof options === 'function')
	      cb = options, options = null;

	    return go$writeFile(path, data, options, cb)

	    function go$writeFile (path, data, options, cb, startTime) {
	      return fs$writeFile(path, data, options, function (err) {
	        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
	          enqueue([go$writeFile, [path, data, options, cb], err, startTime || Date.now(), Date.now()]);
	        else {
	          if (typeof cb === 'function')
	            cb.apply(this, arguments);
	        }
	      })
	    }
	  }

	  var fs$appendFile = fs.appendFile;
	  if (fs$appendFile)
	    fs.appendFile = appendFile;
	  function appendFile (path, data, options, cb) {
	    if (typeof options === 'function')
	      cb = options, options = null;

	    return go$appendFile(path, data, options, cb)

	    function go$appendFile (path, data, options, cb, startTime) {
	      return fs$appendFile(path, data, options, function (err) {
	        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
	          enqueue([go$appendFile, [path, data, options, cb], err, startTime || Date.now(), Date.now()]);
	        else {
	          if (typeof cb === 'function')
	            cb.apply(this, arguments);
	        }
	      })
	    }
	  }

	  var fs$copyFile = fs.copyFile;
	  if (fs$copyFile)
	    fs.copyFile = copyFile;
	  function copyFile (src, dest, flags, cb) {
	    if (typeof flags === 'function') {
	      cb = flags;
	      flags = 0;
	    }
	    return go$copyFile(src, dest, flags, cb)

	    function go$copyFile (src, dest, flags, cb, startTime) {
	      return fs$copyFile(src, dest, flags, function (err) {
	        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
	          enqueue([go$copyFile, [src, dest, flags, cb], err, startTime || Date.now(), Date.now()]);
	        else {
	          if (typeof cb === 'function')
	            cb.apply(this, arguments);
	        }
	      })
	    }
	  }

	  var fs$readdir = fs.readdir;
	  fs.readdir = readdir;
	  var noReaddirOptionVersions = /^v[0-5]\./;
	  function readdir (path, options, cb) {
	    if (typeof options === 'function')
	      cb = options, options = null;

	    var go$readdir = noReaddirOptionVersions.test(process.version)
	      ? function go$readdir (path, options, cb, startTime) {
	        return fs$readdir(path, fs$readdirCallback(
	          path, options, cb, startTime
	        ))
	      }
	      : function go$readdir (path, options, cb, startTime) {
	        return fs$readdir(path, options, fs$readdirCallback(
	          path, options, cb, startTime
	        ))
	      };

	    return go$readdir(path, options, cb)

	    function fs$readdirCallback (path, options, cb, startTime) {
	      return function (err, files) {
	        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
	          enqueue([
	            go$readdir,
	            [path, options, cb],
	            err,
	            startTime || Date.now(),
	            Date.now()
	          ]);
	        else {
	          if (files && files.sort)
	            files.sort();

	          if (typeof cb === 'function')
	            cb.call(this, err, files);
	        }
	      }
	    }
	  }

	  if (process.version.substr(0, 4) === 'v0.8') {
	    var legStreams = legacy(fs);
	    ReadStream = legStreams.ReadStream;
	    WriteStream = legStreams.WriteStream;
	  }

	  var fs$ReadStream = fs.ReadStream;
	  if (fs$ReadStream) {
	    ReadStream.prototype = Object.create(fs$ReadStream.prototype);
	    ReadStream.prototype.open = ReadStream$open;
	  }

	  var fs$WriteStream = fs.WriteStream;
	  if (fs$WriteStream) {
	    WriteStream.prototype = Object.create(fs$WriteStream.prototype);
	    WriteStream.prototype.open = WriteStream$open;
	  }

	  Object.defineProperty(fs, 'ReadStream', {
	    get: function () {
	      return ReadStream
	    },
	    set: function (val) {
	      ReadStream = val;
	    },
	    enumerable: true,
	    configurable: true
	  });
	  Object.defineProperty(fs, 'WriteStream', {
	    get: function () {
	      return WriteStream
	    },
	    set: function (val) {
	      WriteStream = val;
	    },
	    enumerable: true,
	    configurable: true
	  });

	  // legacy names
	  var FileReadStream = ReadStream;
	  Object.defineProperty(fs, 'FileReadStream', {
	    get: function () {
	      return FileReadStream
	    },
	    set: function (val) {
	      FileReadStream = val;
	    },
	    enumerable: true,
	    configurable: true
	  });
	  var FileWriteStream = WriteStream;
	  Object.defineProperty(fs, 'FileWriteStream', {
	    get: function () {
	      return FileWriteStream
	    },
	    set: function (val) {
	      FileWriteStream = val;
	    },
	    enumerable: true,
	    configurable: true
	  });

	  function ReadStream (path, options) {
	    if (this instanceof ReadStream)
	      return fs$ReadStream.apply(this, arguments), this
	    else
	      return ReadStream.apply(Object.create(ReadStream.prototype), arguments)
	  }

	  function ReadStream$open () {
	    var that = this;
	    open(that.path, that.flags, that.mode, function (err, fd) {
	      if (err) {
	        if (that.autoClose)
	          that.destroy();

	        that.emit('error', err);
	      } else {
	        that.fd = fd;
	        that.emit('open', fd);
	        that.read();
	      }
	    });
	  }

	  function WriteStream (path, options) {
	    if (this instanceof WriteStream)
	      return fs$WriteStream.apply(this, arguments), this
	    else
	      return WriteStream.apply(Object.create(WriteStream.prototype), arguments)
	  }

	  function WriteStream$open () {
	    var that = this;
	    open(that.path, that.flags, that.mode, function (err, fd) {
	      if (err) {
	        that.destroy();
	        that.emit('error', err);
	      } else {
	        that.fd = fd;
	        that.emit('open', fd);
	      }
	    });
	  }

	  function createReadStream (path, options) {
	    return new fs.ReadStream(path, options)
	  }

	  function createWriteStream (path, options) {
	    return new fs.WriteStream(path, options)
	  }

	  var fs$open = fs.open;
	  fs.open = open;
	  function open (path, flags, mode, cb) {
	    if (typeof mode === 'function')
	      cb = mode, mode = null;

	    return go$open(path, flags, mode, cb)

	    function go$open (path, flags, mode, cb, startTime) {
	      return fs$open(path, flags, mode, function (err, fd) {
	        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
	          enqueue([go$open, [path, flags, mode, cb], err, startTime || Date.now(), Date.now()]);
	        else {
	          if (typeof cb === 'function')
	            cb.apply(this, arguments);
	        }
	      })
	    }
	  }

	  return fs
	}

	function enqueue (elem) {
	  debug('ENQUEUE', elem[0].name, elem[1]);
	  fs$1[gracefulQueue].push(elem);
	  retry();
	}

	// keep track of the timeout between retry() calls
	var retryTimer;

	// reset the startTime and lastTime to now
	// this resets the start of the 60 second overall timeout as well as the
	// delay between attempts so that we'll retry these jobs sooner
	function resetQueue () {
	  var now = Date.now();
	  for (var i = 0; i < fs$1[gracefulQueue].length; ++i) {
	    // entries that are only a length of 2 are from an older version, don't
	    // bother modifying those since they'll be retried anyway.
	    if (fs$1[gracefulQueue][i].length > 2) {
	      fs$1[gracefulQueue][i][3] = now; // startTime
	      fs$1[gracefulQueue][i][4] = now; // lastTime
	    }
	  }
	  // call retry to make sure we're actively processing the queue
	  retry();
	}

	function retry () {
	  // clear the timer and remove it to help prevent unintended concurrency
	  clearTimeout(retryTimer);
	  retryTimer = undefined;

	  if (fs$1[gracefulQueue].length === 0)
	    return

	  var elem = fs$1[gracefulQueue].shift();
	  var fn = elem[0];
	  var args = elem[1];
	  // these items may be unset if they were added by an older graceful-fs
	  var err = elem[2];
	  var startTime = elem[3];
	  var lastTime = elem[4];

	  // if we don't have a startTime we have no way of knowing if we've waited
	  // long enough, so go ahead and retry this item now
	  if (startTime === undefined) {
	    debug('RETRY', fn.name, args);
	    fn.apply(null, args);
	  } else if (Date.now() - startTime >= 60000) {
	    // it's been more than 60 seconds total, bail now
	    debug('TIMEOUT', fn.name, args);
	    var cb = args.pop();
	    if (typeof cb === 'function')
	      cb.call(null, err);
	  } else {
	    // the amount of time between the last attempt and right now
	    var sinceAttempt = Date.now() - lastTime;
	    // the amount of time between when we first tried, and when we last tried
	    // rounded up to at least 1
	    var sinceStart = Math.max(lastTime - startTime, 1);
	    // backoff. wait longer than the total time we've been retrying, but only
	    // up to a maximum of 100ms
	    var desiredDelay = Math.min(sinceStart * 1.2, 100);
	    // it's been long enough since the last retry, do it again
	    if (sinceAttempt >= desiredDelay) {
	      debug('RETRY', fn.name, args);
	      fn.apply(null, args.concat([startTime]));
	    } else {
	      // if we can't do this job yet, push it to the end of the queue
	      // and let the next iteration check again
	      fs$1[gracefulQueue].push(elem);
	    }
	  }

	  // schedule our next run if one isn't already scheduled
	  if (retryTimer === undefined) {
	    retryTimer = setTimeout(retry, 0);
	  }
	}
	return gracefulFs;
}

var gracefulFsExports = requireGracefulFs();

class ErrorWithStack extends Error {
  constructor(message, callsite, stackLimit) {
    const originalStackLimit = Error.stackTraceLimit;
    if (stackLimit) {
      Error.stackTraceLimit = Math.max(stackLimit, originalStackLimit || 10);
    }
    super(message);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, callsite);
    }
    Error.stackTraceLimit = originalStackLimit;
  }
}

process.platform === "win32";
Object.getPrototypeOf(process.env);

Object.keys(globalThis).filter((key) => key.startsWith("DTRACE"));

function isPromise(candidate) {
  return candidate != null && (typeof candidate === "object" || typeof candidate === "function") && typeof candidate.then === "function";
}

var utils$2 = {};

var constants$1;
var hasRequiredConstants$1;

function requireConstants$1 () {
	if (hasRequiredConstants$1) return constants$1;
	hasRequiredConstants$1 = 1;

	const path = path__default;
	const WIN_SLASH = '\\\\/';
	const WIN_NO_SLASH = `[^${WIN_SLASH}]`;

	/**
	 * Posix glob regex
	 */

	const DOT_LITERAL = '\\.';
	const PLUS_LITERAL = '\\+';
	const QMARK_LITERAL = '\\?';
	const SLASH_LITERAL = '\\/';
	const ONE_CHAR = '(?=.)';
	const QMARK = '[^/]';
	const END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
	const START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
	const DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
	const NO_DOT = `(?!${DOT_LITERAL})`;
	const NO_DOTS = `(?!${START_ANCHOR}${DOTS_SLASH})`;
	const NO_DOT_SLASH = `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`;
	const NO_DOTS_SLASH = `(?!${DOTS_SLASH})`;
	const QMARK_NO_DOT = `[^.${SLASH_LITERAL}]`;
	const STAR = `${QMARK}*?`;

	const POSIX_CHARS = {
	  DOT_LITERAL,
	  PLUS_LITERAL,
	  QMARK_LITERAL,
	  SLASH_LITERAL,
	  ONE_CHAR,
	  QMARK,
	  END_ANCHOR,
	  DOTS_SLASH,
	  NO_DOT,
	  NO_DOTS,
	  NO_DOT_SLASH,
	  NO_DOTS_SLASH,
	  QMARK_NO_DOT,
	  STAR,
	  START_ANCHOR
	};

	/**
	 * Windows glob regex
	 */

	const WINDOWS_CHARS = {
	  ...POSIX_CHARS,

	  SLASH_LITERAL: `[${WIN_SLASH}]`,
	  QMARK: WIN_NO_SLASH,
	  STAR: `${WIN_NO_SLASH}*?`,
	  DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
	  NO_DOT: `(?!${DOT_LITERAL})`,
	  NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
	  NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
	  NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
	  QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
	  START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
	  END_ANCHOR: `(?:[${WIN_SLASH}]|$)`
	};

	/**
	 * POSIX Bracket Regex
	 */

	const POSIX_REGEX_SOURCE = {
	  alnum: 'a-zA-Z0-9',
	  alpha: 'a-zA-Z',
	  ascii: '\\x00-\\x7F',
	  blank: ' \\t',
	  cntrl: '\\x00-\\x1F\\x7F',
	  digit: '0-9',
	  graph: '\\x21-\\x7E',
	  lower: 'a-z',
	  print: '\\x20-\\x7E ',
	  punct: '\\-!"#$%&\'()\\*+,./:;<=>?@[\\]^_`{|}~',
	  space: ' \\t\\r\\n\\v\\f',
	  upper: 'A-Z',
	  word: 'A-Za-z0-9_',
	  xdigit: 'A-Fa-f0-9'
	};

	constants$1 = {
	  MAX_LENGTH: 1024 * 64,
	  POSIX_REGEX_SOURCE,

	  // regular expressions
	  REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
	  REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
	  REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
	  REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
	  REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
	  REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,

	  // Replace globs with equivalent patterns to reduce parsing time.
	  REPLACEMENTS: {
	    '***': '*',
	    '**/**': '**',
	    '**/**/**': '**'
	  },

	  // Digits
	  CHAR_0: 48, /* 0 */
	  CHAR_9: 57, /* 9 */

	  // Alphabet chars.
	  CHAR_UPPERCASE_A: 65, /* A */
	  CHAR_LOWERCASE_A: 97, /* a */
	  CHAR_UPPERCASE_Z: 90, /* Z */
	  CHAR_LOWERCASE_Z: 122, /* z */

	  CHAR_LEFT_PARENTHESES: 40, /* ( */
	  CHAR_RIGHT_PARENTHESES: 41, /* ) */

	  CHAR_ASTERISK: 42, /* * */

	  // Non-alphabetic chars.
	  CHAR_AMPERSAND: 38, /* & */
	  CHAR_AT: 64, /* @ */
	  CHAR_BACKWARD_SLASH: 92, /* \ */
	  CHAR_CARRIAGE_RETURN: 13, /* \r */
	  CHAR_CIRCUMFLEX_ACCENT: 94, /* ^ */
	  CHAR_COLON: 58, /* : */
	  CHAR_COMMA: 44, /* , */
	  CHAR_DOT: 46, /* . */
	  CHAR_DOUBLE_QUOTE: 34, /* " */
	  CHAR_EQUAL: 61, /* = */
	  CHAR_EXCLAMATION_MARK: 33, /* ! */
	  CHAR_FORM_FEED: 12, /* \f */
	  CHAR_FORWARD_SLASH: 47, /* / */
	  CHAR_GRAVE_ACCENT: 96, /* ` */
	  CHAR_HASH: 35, /* # */
	  CHAR_HYPHEN_MINUS: 45, /* - */
	  CHAR_LEFT_ANGLE_BRACKET: 60, /* < */
	  CHAR_LEFT_CURLY_BRACE: 123, /* { */
	  CHAR_LEFT_SQUARE_BRACKET: 91, /* [ */
	  CHAR_LINE_FEED: 10, /* \n */
	  CHAR_NO_BREAK_SPACE: 160, /* \u00A0 */
	  CHAR_PERCENT: 37, /* % */
	  CHAR_PLUS: 43, /* + */
	  CHAR_QUESTION_MARK: 63, /* ? */
	  CHAR_RIGHT_ANGLE_BRACKET: 62, /* > */
	  CHAR_RIGHT_CURLY_BRACE: 125, /* } */
	  CHAR_RIGHT_SQUARE_BRACKET: 93, /* ] */
	  CHAR_SEMICOLON: 59, /* ; */
	  CHAR_SINGLE_QUOTE: 39, /* ' */
	  CHAR_SPACE: 32, /*   */
	  CHAR_TAB: 9, /* \t */
	  CHAR_UNDERSCORE: 95, /* _ */
	  CHAR_VERTICAL_LINE: 124, /* | */
	  CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279, /* \uFEFF */

	  SEP: path.sep,

	  /**
	   * Create EXTGLOB_CHARS
	   */

	  extglobChars(chars) {
	    return {
	      '!': { type: 'negate', open: '(?:(?!(?:', close: `))${chars.STAR})` },
	      '?': { type: 'qmark', open: '(?:', close: ')?' },
	      '+': { type: 'plus', open: '(?:', close: ')+' },
	      '*': { type: 'star', open: '(?:', close: ')*' },
	      '@': { type: 'at', open: '(?:', close: ')' }
	    };
	  },

	  /**
	   * Create GLOB_CHARS
	   */

	  globChars(win32) {
	    return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
	  }
	};
	return constants$1;
}

var hasRequiredUtils$1;

function requireUtils$1 () {
	if (hasRequiredUtils$1) return utils$2;
	hasRequiredUtils$1 = 1;
	(function (exports) {

		const path = path__default;
		const win32 = process.platform === 'win32';
		const {
		  REGEX_BACKSLASH,
		  REGEX_REMOVE_BACKSLASH,
		  REGEX_SPECIAL_CHARS,
		  REGEX_SPECIAL_CHARS_GLOBAL
		} = requireConstants$1();

		exports.isObject = val => val !== null && typeof val === 'object' && !Array.isArray(val);
		exports.hasRegexChars = str => REGEX_SPECIAL_CHARS.test(str);
		exports.isRegexChar = str => str.length === 1 && exports.hasRegexChars(str);
		exports.escapeRegex = str => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, '\\$1');
		exports.toPosixSlashes = str => str.replace(REGEX_BACKSLASH, '/');

		exports.removeBackslashes = str => {
		  return str.replace(REGEX_REMOVE_BACKSLASH, match => {
		    return match === '\\' ? '' : match;
		  });
		};

		exports.supportsLookbehinds = () => {
		  const segs = process.version.slice(1).split('.').map(Number);
		  if (segs.length === 3 && segs[0] >= 9 || (segs[0] === 8 && segs[1] >= 10)) {
		    return true;
		  }
		  return false;
		};

		exports.isWindows = options => {
		  if (options && typeof options.windows === 'boolean') {
		    return options.windows;
		  }
		  return win32 === true || path.sep === '\\';
		};

		exports.escapeLast = (input, char, lastIdx) => {
		  const idx = input.lastIndexOf(char, lastIdx);
		  if (idx === -1) return input;
		  if (input[idx - 1] === '\\') return exports.escapeLast(input, char, idx - 1);
		  return `${input.slice(0, idx)}\\${input.slice(idx)}`;
		};

		exports.removePrefix = (input, state = {}) => {
		  let output = input;
		  if (output.startsWith('./')) {
		    output = output.slice(2);
		    state.prefix = './';
		  }
		  return output;
		};

		exports.wrapOutput = (input, state = {}, options = {}) => {
		  const prepend = options.contains ? '' : '^';
		  const append = options.contains ? '' : '$';

		  let output = `${prepend}(?:${input})${append}`;
		  if (state.negated === true) {
		    output = `(?:^(?!${output}).*$)`;
		  }
		  return output;
		}; 
	} (utils$2));
	return utils$2;
}

var scan_1;
var hasRequiredScan;

function requireScan () {
	if (hasRequiredScan) return scan_1;
	hasRequiredScan = 1;

	const utils = requireUtils$1();
	const {
	  CHAR_ASTERISK,             /* * */
	  CHAR_AT,                   /* @ */
	  CHAR_BACKWARD_SLASH,       /* \ */
	  CHAR_COMMA,                /* , */
	  CHAR_DOT,                  /* . */
	  CHAR_EXCLAMATION_MARK,     /* ! */
	  CHAR_FORWARD_SLASH,        /* / */
	  CHAR_LEFT_CURLY_BRACE,     /* { */
	  CHAR_LEFT_PARENTHESES,     /* ( */
	  CHAR_LEFT_SQUARE_BRACKET,  /* [ */
	  CHAR_PLUS,                 /* + */
	  CHAR_QUESTION_MARK,        /* ? */
	  CHAR_RIGHT_CURLY_BRACE,    /* } */
	  CHAR_RIGHT_PARENTHESES,    /* ) */
	  CHAR_RIGHT_SQUARE_BRACKET  /* ] */
	} = requireConstants$1();

	const isPathSeparator = code => {
	  return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
	};

	const depth = token => {
	  if (token.isPrefix !== true) {
	    token.depth = token.isGlobstar ? Infinity : 1;
	  }
	};

	/**
	 * Quickly scans a glob pattern and returns an object with a handful of
	 * useful properties, like `isGlob`, `path` (the leading non-glob, if it exists),
	 * `glob` (the actual pattern), `negated` (true if the path starts with `!` but not
	 * with `!(`) and `negatedExtglob` (true if the path starts with `!(`).
	 *
	 * ```js
	 * const pm = require('picomatch');
	 * console.log(pm.scan('foo/bar/*.js'));
	 * { isGlob: true, input: 'foo/bar/*.js', base: 'foo/bar', glob: '*.js' }
	 * ```
	 * @param {String} `str`
	 * @param {Object} `options`
	 * @return {Object} Returns an object with tokens and regex source string.
	 * @api public
	 */

	const scan = (input, options) => {
	  const opts = options || {};

	  const length = input.length - 1;
	  const scanToEnd = opts.parts === true || opts.scanToEnd === true;
	  const slashes = [];
	  const tokens = [];
	  const parts = [];

	  let str = input;
	  let index = -1;
	  let start = 0;
	  let lastIndex = 0;
	  let isBrace = false;
	  let isBracket = false;
	  let isGlob = false;
	  let isExtglob = false;
	  let isGlobstar = false;
	  let braceEscaped = false;
	  let backslashes = false;
	  let negated = false;
	  let negatedExtglob = false;
	  let finished = false;
	  let braces = 0;
	  let prev;
	  let code;
	  let token = { value: '', depth: 0, isGlob: false };

	  const eos = () => index >= length;
	  const peek = () => str.charCodeAt(index + 1);
	  const advance = () => {
	    prev = code;
	    return str.charCodeAt(++index);
	  };

	  while (index < length) {
	    code = advance();
	    let next;

	    if (code === CHAR_BACKWARD_SLASH) {
	      backslashes = token.backslashes = true;
	      code = advance();

	      if (code === CHAR_LEFT_CURLY_BRACE) {
	        braceEscaped = true;
	      }
	      continue;
	    }

	    if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
	      braces++;

	      while (eos() !== true && (code = advance())) {
	        if (code === CHAR_BACKWARD_SLASH) {
	          backslashes = token.backslashes = true;
	          advance();
	          continue;
	        }

	        if (code === CHAR_LEFT_CURLY_BRACE) {
	          braces++;
	          continue;
	        }

	        if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
	          isBrace = token.isBrace = true;
	          isGlob = token.isGlob = true;
	          finished = true;

	          if (scanToEnd === true) {
	            continue;
	          }

	          break;
	        }

	        if (braceEscaped !== true && code === CHAR_COMMA) {
	          isBrace = token.isBrace = true;
	          isGlob = token.isGlob = true;
	          finished = true;

	          if (scanToEnd === true) {
	            continue;
	          }

	          break;
	        }

	        if (code === CHAR_RIGHT_CURLY_BRACE) {
	          braces--;

	          if (braces === 0) {
	            braceEscaped = false;
	            isBrace = token.isBrace = true;
	            finished = true;
	            break;
	          }
	        }
	      }

	      if (scanToEnd === true) {
	        continue;
	      }

	      break;
	    }

	    if (code === CHAR_FORWARD_SLASH) {
	      slashes.push(index);
	      tokens.push(token);
	      token = { value: '', depth: 0, isGlob: false };

	      if (finished === true) continue;
	      if (prev === CHAR_DOT && index === (start + 1)) {
	        start += 2;
	        continue;
	      }

	      lastIndex = index + 1;
	      continue;
	    }

	    if (opts.noext !== true) {
	      const isExtglobChar = code === CHAR_PLUS
	        || code === CHAR_AT
	        || code === CHAR_ASTERISK
	        || code === CHAR_QUESTION_MARK
	        || code === CHAR_EXCLAMATION_MARK;

	      if (isExtglobChar === true && peek() === CHAR_LEFT_PARENTHESES) {
	        isGlob = token.isGlob = true;
	        isExtglob = token.isExtglob = true;
	        finished = true;
	        if (code === CHAR_EXCLAMATION_MARK && index === start) {
	          negatedExtglob = true;
	        }

	        if (scanToEnd === true) {
	          while (eos() !== true && (code = advance())) {
	            if (code === CHAR_BACKWARD_SLASH) {
	              backslashes = token.backslashes = true;
	              code = advance();
	              continue;
	            }

	            if (code === CHAR_RIGHT_PARENTHESES) {
	              isGlob = token.isGlob = true;
	              finished = true;
	              break;
	            }
	          }
	          continue;
	        }
	        break;
	      }
	    }

	    if (code === CHAR_ASTERISK) {
	      if (prev === CHAR_ASTERISK) isGlobstar = token.isGlobstar = true;
	      isGlob = token.isGlob = true;
	      finished = true;

	      if (scanToEnd === true) {
	        continue;
	      }
	      break;
	    }

	    if (code === CHAR_QUESTION_MARK) {
	      isGlob = token.isGlob = true;
	      finished = true;

	      if (scanToEnd === true) {
	        continue;
	      }
	      break;
	    }

	    if (code === CHAR_LEFT_SQUARE_BRACKET) {
	      while (eos() !== true && (next = advance())) {
	        if (next === CHAR_BACKWARD_SLASH) {
	          backslashes = token.backslashes = true;
	          advance();
	          continue;
	        }

	        if (next === CHAR_RIGHT_SQUARE_BRACKET) {
	          isBracket = token.isBracket = true;
	          isGlob = token.isGlob = true;
	          finished = true;
	          break;
	        }
	      }

	      if (scanToEnd === true) {
	        continue;
	      }

	      break;
	    }

	    if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
	      negated = token.negated = true;
	      start++;
	      continue;
	    }

	    if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
	      isGlob = token.isGlob = true;

	      if (scanToEnd === true) {
	        while (eos() !== true && (code = advance())) {
	          if (code === CHAR_LEFT_PARENTHESES) {
	            backslashes = token.backslashes = true;
	            code = advance();
	            continue;
	          }

	          if (code === CHAR_RIGHT_PARENTHESES) {
	            finished = true;
	            break;
	          }
	        }
	        continue;
	      }
	      break;
	    }

	    if (isGlob === true) {
	      finished = true;

	      if (scanToEnd === true) {
	        continue;
	      }

	      break;
	    }
	  }

	  if (opts.noext === true) {
	    isExtglob = false;
	    isGlob = false;
	  }

	  let base = str;
	  let prefix = '';
	  let glob = '';

	  if (start > 0) {
	    prefix = str.slice(0, start);
	    str = str.slice(start);
	    lastIndex -= start;
	  }

	  if (base && isGlob === true && lastIndex > 0) {
	    base = str.slice(0, lastIndex);
	    glob = str.slice(lastIndex);
	  } else if (isGlob === true) {
	    base = '';
	    glob = str;
	  } else {
	    base = str;
	  }

	  if (base && base !== '' && base !== '/' && base !== str) {
	    if (isPathSeparator(base.charCodeAt(base.length - 1))) {
	      base = base.slice(0, -1);
	    }
	  }

	  if (opts.unescape === true) {
	    if (glob) glob = utils.removeBackslashes(glob);

	    if (base && backslashes === true) {
	      base = utils.removeBackslashes(base);
	    }
	  }

	  const state = {
	    prefix,
	    input,
	    start,
	    base,
	    glob,
	    isBrace,
	    isBracket,
	    isGlob,
	    isExtglob,
	    isGlobstar,
	    negated,
	    negatedExtglob
	  };

	  if (opts.tokens === true) {
	    state.maxDepth = 0;
	    if (!isPathSeparator(code)) {
	      tokens.push(token);
	    }
	    state.tokens = tokens;
	  }

	  if (opts.parts === true || opts.tokens === true) {
	    let prevIndex;

	    for (let idx = 0; idx < slashes.length; idx++) {
	      const n = prevIndex ? prevIndex + 1 : start;
	      const i = slashes[idx];
	      const value = input.slice(n, i);
	      if (opts.tokens) {
	        if (idx === 0 && start !== 0) {
	          tokens[idx].isPrefix = true;
	          tokens[idx].value = prefix;
	        } else {
	          tokens[idx].value = value;
	        }
	        depth(tokens[idx]);
	        state.maxDepth += tokens[idx].depth;
	      }
	      if (idx !== 0 || value !== '') {
	        parts.push(value);
	      }
	      prevIndex = i;
	    }

	    if (prevIndex && prevIndex + 1 < input.length) {
	      const value = input.slice(prevIndex + 1);
	      parts.push(value);

	      if (opts.tokens) {
	        tokens[tokens.length - 1].value = value;
	        depth(tokens[tokens.length - 1]);
	        state.maxDepth += tokens[tokens.length - 1].depth;
	      }
	    }

	    state.slashes = slashes;
	    state.parts = parts;
	  }

	  return state;
	};

	scan_1 = scan;
	return scan_1;
}

var parse_1$1;
var hasRequiredParse$1;

function requireParse$1 () {
	if (hasRequiredParse$1) return parse_1$1;
	hasRequiredParse$1 = 1;

	const constants = requireConstants$1();
	const utils = requireUtils$1();

	/**
	 * Constants
	 */

	const {
	  MAX_LENGTH,
	  POSIX_REGEX_SOURCE,
	  REGEX_NON_SPECIAL_CHARS,
	  REGEX_SPECIAL_CHARS_BACKREF,
	  REPLACEMENTS
	} = constants;

	/**
	 * Helpers
	 */

	const expandRange = (args, options) => {
	  if (typeof options.expandRange === 'function') {
	    return options.expandRange(...args, options);
	  }

	  args.sort();
	  const value = `[${args.join('-')}]`;

	  try {
	    /* eslint-disable-next-line no-new */
	    new RegExp(value);
	  } catch (ex) {
	    return args.map(v => utils.escapeRegex(v)).join('..');
	  }

	  return value;
	};

	/**
	 * Create the message for a syntax error
	 */

	const syntaxError = (type, char) => {
	  return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
	};

	/**
	 * Parse the given input string.
	 * @param {String} input
	 * @param {Object} options
	 * @return {Object}
	 */

	const parse = (input, options) => {
	  if (typeof input !== 'string') {
	    throw new TypeError('Expected a string');
	  }

	  input = REPLACEMENTS[input] || input;

	  const opts = { ...options };
	  const max = typeof opts.maxLength === 'number' ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;

	  let len = input.length;
	  if (len > max) {
	    throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
	  }

	  const bos = { type: 'bos', value: '', output: opts.prepend || '' };
	  const tokens = [bos];

	  const capture = opts.capture ? '' : '?:';
	  const win32 = utils.isWindows(options);

	  // create constants based on platform, for windows or posix
	  const PLATFORM_CHARS = constants.globChars(win32);
	  const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);

	  const {
	    DOT_LITERAL,
	    PLUS_LITERAL,
	    SLASH_LITERAL,
	    ONE_CHAR,
	    DOTS_SLASH,
	    NO_DOT,
	    NO_DOT_SLASH,
	    NO_DOTS_SLASH,
	    QMARK,
	    QMARK_NO_DOT,
	    STAR,
	    START_ANCHOR
	  } = PLATFORM_CHARS;

	  const globstar = opts => {
	    return `(${capture}(?:(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
	  };

	  const nodot = opts.dot ? '' : NO_DOT;
	  const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
	  let star = opts.bash === true ? globstar(opts) : STAR;

	  if (opts.capture) {
	    star = `(${star})`;
	  }

	  // minimatch options support
	  if (typeof opts.noext === 'boolean') {
	    opts.noextglob = opts.noext;
	  }

	  const state = {
	    input,
	    index: -1,
	    start: 0,
	    dot: opts.dot === true,
	    consumed: '',
	    output: '',
	    prefix: '',
	    backtrack: false,
	    negated: false,
	    brackets: 0,
	    braces: 0,
	    parens: 0,
	    quotes: 0,
	    globstar: false,
	    tokens
	  };

	  input = utils.removePrefix(input, state);
	  len = input.length;

	  const extglobs = [];
	  const braces = [];
	  const stack = [];
	  let prev = bos;
	  let value;

	  /**
	   * Tokenizing helpers
	   */

	  const eos = () => state.index === len - 1;
	  const peek = state.peek = (n = 1) => input[state.index + n];
	  const advance = state.advance = () => input[++state.index] || '';
	  const remaining = () => input.slice(state.index + 1);
	  const consume = (value = '', num = 0) => {
	    state.consumed += value;
	    state.index += num;
	  };

	  const append = token => {
	    state.output += token.output != null ? token.output : token.value;
	    consume(token.value);
	  };

	  const negate = () => {
	    let count = 1;

	    while (peek() === '!' && (peek(2) !== '(' || peek(3) === '?')) {
	      advance();
	      state.start++;
	      count++;
	    }

	    if (count % 2 === 0) {
	      return false;
	    }

	    state.negated = true;
	    state.start++;
	    return true;
	  };

	  const increment = type => {
	    state[type]++;
	    stack.push(type);
	  };

	  const decrement = type => {
	    state[type]--;
	    stack.pop();
	  };

	  /**
	   * Push tokens onto the tokens array. This helper speeds up
	   * tokenizing by 1) helping us avoid backtracking as much as possible,
	   * and 2) helping us avoid creating extra tokens when consecutive
	   * characters are plain text. This improves performance and simplifies
	   * lookbehinds.
	   */

	  const push = tok => {
	    if (prev.type === 'globstar') {
	      const isBrace = state.braces > 0 && (tok.type === 'comma' || tok.type === 'brace');
	      const isExtglob = tok.extglob === true || (extglobs.length && (tok.type === 'pipe' || tok.type === 'paren'));

	      if (tok.type !== 'slash' && tok.type !== 'paren' && !isBrace && !isExtglob) {
	        state.output = state.output.slice(0, -prev.output.length);
	        prev.type = 'star';
	        prev.value = '*';
	        prev.output = star;
	        state.output += prev.output;
	      }
	    }

	    if (extglobs.length && tok.type !== 'paren') {
	      extglobs[extglobs.length - 1].inner += tok.value;
	    }

	    if (tok.value || tok.output) append(tok);
	    if (prev && prev.type === 'text' && tok.type === 'text') {
	      prev.value += tok.value;
	      prev.output = (prev.output || '') + tok.value;
	      return;
	    }

	    tok.prev = prev;
	    tokens.push(tok);
	    prev = tok;
	  };

	  const extglobOpen = (type, value) => {
	    const token = { ...EXTGLOB_CHARS[value], conditions: 1, inner: '' };

	    token.prev = prev;
	    token.parens = state.parens;
	    token.output = state.output;
	    const output = (opts.capture ? '(' : '') + token.open;

	    increment('parens');
	    push({ type, value, output: state.output ? '' : ONE_CHAR });
	    push({ type: 'paren', extglob: true, value: advance(), output });
	    extglobs.push(token);
	  };

	  const extglobClose = token => {
	    let output = token.close + (opts.capture ? ')' : '');
	    let rest;

	    if (token.type === 'negate') {
	      let extglobStar = star;

	      if (token.inner && token.inner.length > 1 && token.inner.includes('/')) {
	        extglobStar = globstar(opts);
	      }

	      if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) {
	        output = token.close = `)$))${extglobStar}`;
	      }

	      if (token.inner.includes('*') && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) {
	        // Any non-magical string (`.ts`) or even nested expression (`.{ts,tsx}`) can follow after the closing parenthesis.
	        // In this case, we need to parse the string and use it in the output of the original pattern.
	        // Suitable patterns: `/!(*.d).ts`, `/!(*.d).{ts,tsx}`, `**/!(*-dbg).@(js)`.
	        //
	        // Disabling the `fastpaths` option due to a problem with parsing strings as `.ts` in the pattern like `**/!(*.d).ts`.
	        const expression = parse(rest, { ...options, fastpaths: false }).output;

	        output = token.close = `)${expression})${extglobStar})`;
	      }

	      if (token.prev.type === 'bos') {
	        state.negatedExtglob = true;
	      }
	    }

	    push({ type: 'paren', extglob: true, value, output });
	    decrement('parens');
	  };

	  /**
	   * Fast paths
	   */

	  if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
	    let backslashes = false;

	    let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index) => {
	      if (first === '\\') {
	        backslashes = true;
	        return m;
	      }

	      if (first === '?') {
	        if (esc) {
	          return esc + first + (rest ? QMARK.repeat(rest.length) : '');
	        }
	        if (index === 0) {
	          return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : '');
	        }
	        return QMARK.repeat(chars.length);
	      }

	      if (first === '.') {
	        return DOT_LITERAL.repeat(chars.length);
	      }

	      if (first === '*') {
	        if (esc) {
	          return esc + first + (rest ? star : '');
	        }
	        return star;
	      }
	      return esc ? m : `\\${m}`;
	    });

	    if (backslashes === true) {
	      if (opts.unescape === true) {
	        output = output.replace(/\\/g, '');
	      } else {
	        output = output.replace(/\\+/g, m => {
	          return m.length % 2 === 0 ? '\\\\' : (m ? '\\' : '');
	        });
	      }
	    }

	    if (output === input && opts.contains === true) {
	      state.output = input;
	      return state;
	    }

	    state.output = utils.wrapOutput(output, state, options);
	    return state;
	  }

	  /**
	   * Tokenize input until we reach end-of-string
	   */

	  while (!eos()) {
	    value = advance();

	    if (value === '\u0000') {
	      continue;
	    }

	    /**
	     * Escaped characters
	     */

	    if (value === '\\') {
	      const next = peek();

	      if (next === '/' && opts.bash !== true) {
	        continue;
	      }

	      if (next === '.' || next === ';') {
	        continue;
	      }

	      if (!next) {
	        value += '\\';
	        push({ type: 'text', value });
	        continue;
	      }

	      // collapse slashes to reduce potential for exploits
	      const match = /^\\+/.exec(remaining());
	      let slashes = 0;

	      if (match && match[0].length > 2) {
	        slashes = match[0].length;
	        state.index += slashes;
	        if (slashes % 2 !== 0) {
	          value += '\\';
	        }
	      }

	      if (opts.unescape === true) {
	        value = advance();
	      } else {
	        value += advance();
	      }

	      if (state.brackets === 0) {
	        push({ type: 'text', value });
	        continue;
	      }
	    }

	    /**
	     * If we're inside a regex character class, continue
	     * until we reach the closing bracket.
	     */

	    if (state.brackets > 0 && (value !== ']' || prev.value === '[' || prev.value === '[^')) {
	      if (opts.posix !== false && value === ':') {
	        const inner = prev.value.slice(1);
	        if (inner.includes('[')) {
	          prev.posix = true;

	          if (inner.includes(':')) {
	            const idx = prev.value.lastIndexOf('[');
	            const pre = prev.value.slice(0, idx);
	            const rest = prev.value.slice(idx + 2);
	            const posix = POSIX_REGEX_SOURCE[rest];
	            if (posix) {
	              prev.value = pre + posix;
	              state.backtrack = true;
	              advance();

	              if (!bos.output && tokens.indexOf(prev) === 1) {
	                bos.output = ONE_CHAR;
	              }
	              continue;
	            }
	          }
	        }
	      }

	      if ((value === '[' && peek() !== ':') || (value === '-' && peek() === ']')) {
	        value = `\\${value}`;
	      }

	      if (value === ']' && (prev.value === '[' || prev.value === '[^')) {
	        value = `\\${value}`;
	      }

	      if (opts.posix === true && value === '!' && prev.value === '[') {
	        value = '^';
	      }

	      prev.value += value;
	      append({ value });
	      continue;
	    }

	    /**
	     * If we're inside a quoted string, continue
	     * until we reach the closing double quote.
	     */

	    if (state.quotes === 1 && value !== '"') {
	      value = utils.escapeRegex(value);
	      prev.value += value;
	      append({ value });
	      continue;
	    }

	    /**
	     * Double quotes
	     */

	    if (value === '"') {
	      state.quotes = state.quotes === 1 ? 0 : 1;
	      if (opts.keepQuotes === true) {
	        push({ type: 'text', value });
	      }
	      continue;
	    }

	    /**
	     * Parentheses
	     */

	    if (value === '(') {
	      increment('parens');
	      push({ type: 'paren', value });
	      continue;
	    }

	    if (value === ')') {
	      if (state.parens === 0 && opts.strictBrackets === true) {
	        throw new SyntaxError(syntaxError('opening', '('));
	      }

	      const extglob = extglobs[extglobs.length - 1];
	      if (extglob && state.parens === extglob.parens + 1) {
	        extglobClose(extglobs.pop());
	        continue;
	      }

	      push({ type: 'paren', value, output: state.parens ? ')' : '\\)' });
	      decrement('parens');
	      continue;
	    }

	    /**
	     * Square brackets
	     */

	    if (value === '[') {
	      if (opts.nobracket === true || !remaining().includes(']')) {
	        if (opts.nobracket !== true && opts.strictBrackets === true) {
	          throw new SyntaxError(syntaxError('closing', ']'));
	        }

	        value = `\\${value}`;
	      } else {
	        increment('brackets');
	      }

	      push({ type: 'bracket', value });
	      continue;
	    }

	    if (value === ']') {
	      if (opts.nobracket === true || (prev && prev.type === 'bracket' && prev.value.length === 1)) {
	        push({ type: 'text', value, output: `\\${value}` });
	        continue;
	      }

	      if (state.brackets === 0) {
	        if (opts.strictBrackets === true) {
	          throw new SyntaxError(syntaxError('opening', '['));
	        }

	        push({ type: 'text', value, output: `\\${value}` });
	        continue;
	      }

	      decrement('brackets');

	      const prevValue = prev.value.slice(1);
	      if (prev.posix !== true && prevValue[0] === '^' && !prevValue.includes('/')) {
	        value = `/${value}`;
	      }

	      prev.value += value;
	      append({ value });

	      // when literal brackets are explicitly disabled
	      // assume we should match with a regex character class
	      if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) {
	        continue;
	      }

	      const escaped = utils.escapeRegex(prev.value);
	      state.output = state.output.slice(0, -prev.value.length);

	      // when literal brackets are explicitly enabled
	      // assume we should escape the brackets to match literal characters
	      if (opts.literalBrackets === true) {
	        state.output += escaped;
	        prev.value = escaped;
	        continue;
	      }

	      // when the user specifies nothing, try to match both
	      prev.value = `(${capture}${escaped}|${prev.value})`;
	      state.output += prev.value;
	      continue;
	    }

	    /**
	     * Braces
	     */

	    if (value === '{' && opts.nobrace !== true) {
	      increment('braces');

	      const open = {
	        type: 'brace',
	        value,
	        output: '(',
	        outputIndex: state.output.length,
	        tokensIndex: state.tokens.length
	      };

	      braces.push(open);
	      push(open);
	      continue;
	    }

	    if (value === '}') {
	      const brace = braces[braces.length - 1];

	      if (opts.nobrace === true || !brace) {
	        push({ type: 'text', value, output: value });
	        continue;
	      }

	      let output = ')';

	      if (brace.dots === true) {
	        const arr = tokens.slice();
	        const range = [];

	        for (let i = arr.length - 1; i >= 0; i--) {
	          tokens.pop();
	          if (arr[i].type === 'brace') {
	            break;
	          }
	          if (arr[i].type !== 'dots') {
	            range.unshift(arr[i].value);
	          }
	        }

	        output = expandRange(range, opts);
	        state.backtrack = true;
	      }

	      if (brace.comma !== true && brace.dots !== true) {
	        const out = state.output.slice(0, brace.outputIndex);
	        const toks = state.tokens.slice(brace.tokensIndex);
	        brace.value = brace.output = '\\{';
	        value = output = '\\}';
	        state.output = out;
	        for (const t of toks) {
	          state.output += (t.output || t.value);
	        }
	      }

	      push({ type: 'brace', value, output });
	      decrement('braces');
	      braces.pop();
	      continue;
	    }

	    /**
	     * Pipes
	     */

	    if (value === '|') {
	      if (extglobs.length > 0) {
	        extglobs[extglobs.length - 1].conditions++;
	      }
	      push({ type: 'text', value });
	      continue;
	    }

	    /**
	     * Commas
	     */

	    if (value === ',') {
	      let output = value;

	      const brace = braces[braces.length - 1];
	      if (brace && stack[stack.length - 1] === 'braces') {
	        brace.comma = true;
	        output = '|';
	      }

	      push({ type: 'comma', value, output });
	      continue;
	    }

	    /**
	     * Slashes
	     */

	    if (value === '/') {
	      // if the beginning of the glob is "./", advance the start
	      // to the current index, and don't add the "./" characters
	      // to the state. This greatly simplifies lookbehinds when
	      // checking for BOS characters like "!" and "." (not "./")
	      if (prev.type === 'dot' && state.index === state.start + 1) {
	        state.start = state.index + 1;
	        state.consumed = '';
	        state.output = '';
	        tokens.pop();
	        prev = bos; // reset "prev" to the first token
	        continue;
	      }

	      push({ type: 'slash', value, output: SLASH_LITERAL });
	      continue;
	    }

	    /**
	     * Dots
	     */

	    if (value === '.') {
	      if (state.braces > 0 && prev.type === 'dot') {
	        if (prev.value === '.') prev.output = DOT_LITERAL;
	        const brace = braces[braces.length - 1];
	        prev.type = 'dots';
	        prev.output += value;
	        prev.value += value;
	        brace.dots = true;
	        continue;
	      }

	      if ((state.braces + state.parens) === 0 && prev.type !== 'bos' && prev.type !== 'slash') {
	        push({ type: 'text', value, output: DOT_LITERAL });
	        continue;
	      }

	      push({ type: 'dot', value, output: DOT_LITERAL });
	      continue;
	    }

	    /**
	     * Question marks
	     */

	    if (value === '?') {
	      const isGroup = prev && prev.value === '(';
	      if (!isGroup && opts.noextglob !== true && peek() === '(' && peek(2) !== '?') {
	        extglobOpen('qmark', value);
	        continue;
	      }

	      if (prev && prev.type === 'paren') {
	        const next = peek();
	        let output = value;

	        if (next === '<' && !utils.supportsLookbehinds()) {
	          throw new Error('Node.js v10 or higher is required for regex lookbehinds');
	        }

	        if ((prev.value === '(' && !/[!=<:]/.test(next)) || (next === '<' && !/<([!=]|\w+>)/.test(remaining()))) {
	          output = `\\${value}`;
	        }

	        push({ type: 'text', value, output });
	        continue;
	      }

	      if (opts.dot !== true && (prev.type === 'slash' || prev.type === 'bos')) {
	        push({ type: 'qmark', value, output: QMARK_NO_DOT });
	        continue;
	      }

	      push({ type: 'qmark', value, output: QMARK });
	      continue;
	    }

	    /**
	     * Exclamation
	     */

	    if (value === '!') {
	      if (opts.noextglob !== true && peek() === '(') {
	        if (peek(2) !== '?' || !/[!=<:]/.test(peek(3))) {
	          extglobOpen('negate', value);
	          continue;
	        }
	      }

	      if (opts.nonegate !== true && state.index === 0) {
	        negate();
	        continue;
	      }
	    }

	    /**
	     * Plus
	     */

	    if (value === '+') {
	      if (opts.noextglob !== true && peek() === '(' && peek(2) !== '?') {
	        extglobOpen('plus', value);
	        continue;
	      }

	      if ((prev && prev.value === '(') || opts.regex === false) {
	        push({ type: 'plus', value, output: PLUS_LITERAL });
	        continue;
	      }

	      if ((prev && (prev.type === 'bracket' || prev.type === 'paren' || prev.type === 'brace')) || state.parens > 0) {
	        push({ type: 'plus', value });
	        continue;
	      }

	      push({ type: 'plus', value: PLUS_LITERAL });
	      continue;
	    }

	    /**
	     * Plain text
	     */

	    if (value === '@') {
	      if (opts.noextglob !== true && peek() === '(' && peek(2) !== '?') {
	        push({ type: 'at', extglob: true, value, output: '' });
	        continue;
	      }

	      push({ type: 'text', value });
	      continue;
	    }

	    /**
	     * Plain text
	     */

	    if (value !== '*') {
	      if (value === '$' || value === '^') {
	        value = `\\${value}`;
	      }

	      const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
	      if (match) {
	        value += match[0];
	        state.index += match[0].length;
	      }

	      push({ type: 'text', value });
	      continue;
	    }

	    /**
	     * Stars
	     */

	    if (prev && (prev.type === 'globstar' || prev.star === true)) {
	      prev.type = 'star';
	      prev.star = true;
	      prev.value += value;
	      prev.output = star;
	      state.backtrack = true;
	      state.globstar = true;
	      consume(value);
	      continue;
	    }

	    let rest = remaining();
	    if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
	      extglobOpen('star', value);
	      continue;
	    }

	    if (prev.type === 'star') {
	      if (opts.noglobstar === true) {
	        consume(value);
	        continue;
	      }

	      const prior = prev.prev;
	      const before = prior.prev;
	      const isStart = prior.type === 'slash' || prior.type === 'bos';
	      const afterStar = before && (before.type === 'star' || before.type === 'globstar');

	      if (opts.bash === true && (!isStart || (rest[0] && rest[0] !== '/'))) {
	        push({ type: 'star', value, output: '' });
	        continue;
	      }

	      const isBrace = state.braces > 0 && (prior.type === 'comma' || prior.type === 'brace');
	      const isExtglob = extglobs.length && (prior.type === 'pipe' || prior.type === 'paren');
	      if (!isStart && prior.type !== 'paren' && !isBrace && !isExtglob) {
	        push({ type: 'star', value, output: '' });
	        continue;
	      }

	      // strip consecutive `/**/`
	      while (rest.slice(0, 3) === '/**') {
	        const after = input[state.index + 4];
	        if (after && after !== '/') {
	          break;
	        }
	        rest = rest.slice(3);
	        consume('/**', 3);
	      }

	      if (prior.type === 'bos' && eos()) {
	        prev.type = 'globstar';
	        prev.value += value;
	        prev.output = globstar(opts);
	        state.output = prev.output;
	        state.globstar = true;
	        consume(value);
	        continue;
	      }

	      if (prior.type === 'slash' && prior.prev.type !== 'bos' && !afterStar && eos()) {
	        state.output = state.output.slice(0, -(prior.output + prev.output).length);
	        prior.output = `(?:${prior.output}`;

	        prev.type = 'globstar';
	        prev.output = globstar(opts) + (opts.strictSlashes ? ')' : '|$)');
	        prev.value += value;
	        state.globstar = true;
	        state.output += prior.output + prev.output;
	        consume(value);
	        continue;
	      }

	      if (prior.type === 'slash' && prior.prev.type !== 'bos' && rest[0] === '/') {
	        const end = rest[1] !== void 0 ? '|$' : '';

	        state.output = state.output.slice(0, -(prior.output + prev.output).length);
	        prior.output = `(?:${prior.output}`;

	        prev.type = 'globstar';
	        prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
	        prev.value += value;

	        state.output += prior.output + prev.output;
	        state.globstar = true;

	        consume(value + advance());

	        push({ type: 'slash', value: '/', output: '' });
	        continue;
	      }

	      if (prior.type === 'bos' && rest[0] === '/') {
	        prev.type = 'globstar';
	        prev.value += value;
	        prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
	        state.output = prev.output;
	        state.globstar = true;
	        consume(value + advance());
	        push({ type: 'slash', value: '/', output: '' });
	        continue;
	      }

	      // remove single star from output
	      state.output = state.output.slice(0, -prev.output.length);

	      // reset previous token to globstar
	      prev.type = 'globstar';
	      prev.output = globstar(opts);
	      prev.value += value;

	      // reset output with globstar
	      state.output += prev.output;
	      state.globstar = true;
	      consume(value);
	      continue;
	    }

	    const token = { type: 'star', value, output: star };

	    if (opts.bash === true) {
	      token.output = '.*?';
	      if (prev.type === 'bos' || prev.type === 'slash') {
	        token.output = nodot + token.output;
	      }
	      push(token);
	      continue;
	    }

	    if (prev && (prev.type === 'bracket' || prev.type === 'paren') && opts.regex === true) {
	      token.output = value;
	      push(token);
	      continue;
	    }

	    if (state.index === state.start || prev.type === 'slash' || prev.type === 'dot') {
	      if (prev.type === 'dot') {
	        state.output += NO_DOT_SLASH;
	        prev.output += NO_DOT_SLASH;

	      } else if (opts.dot === true) {
	        state.output += NO_DOTS_SLASH;
	        prev.output += NO_DOTS_SLASH;

	      } else {
	        state.output += nodot;
	        prev.output += nodot;
	      }

	      if (peek() !== '*') {
	        state.output += ONE_CHAR;
	        prev.output += ONE_CHAR;
	      }
	    }

	    push(token);
	  }

	  while (state.brackets > 0) {
	    if (opts.strictBrackets === true) throw new SyntaxError(syntaxError('closing', ']'));
	    state.output = utils.escapeLast(state.output, '[');
	    decrement('brackets');
	  }

	  while (state.parens > 0) {
	    if (opts.strictBrackets === true) throw new SyntaxError(syntaxError('closing', ')'));
	    state.output = utils.escapeLast(state.output, '(');
	    decrement('parens');
	  }

	  while (state.braces > 0) {
	    if (opts.strictBrackets === true) throw new SyntaxError(syntaxError('closing', '}'));
	    state.output = utils.escapeLast(state.output, '{');
	    decrement('braces');
	  }

	  if (opts.strictSlashes !== true && (prev.type === 'star' || prev.type === 'bracket')) {
	    push({ type: 'maybe_slash', value: '', output: `${SLASH_LITERAL}?` });
	  }

	  // rebuild the output if we had to backtrack at any point
	  if (state.backtrack === true) {
	    state.output = '';

	    for (const token of state.tokens) {
	      state.output += token.output != null ? token.output : token.value;

	      if (token.suffix) {
	        state.output += token.suffix;
	      }
	    }
	  }

	  return state;
	};

	/**
	 * Fast paths for creating regular expressions for common glob patterns.
	 * This can significantly speed up processing and has very little downside
	 * impact when none of the fast paths match.
	 */

	parse.fastpaths = (input, options) => {
	  const opts = { ...options };
	  const max = typeof opts.maxLength === 'number' ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
	  const len = input.length;
	  if (len > max) {
	    throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
	  }

	  input = REPLACEMENTS[input] || input;
	  const win32 = utils.isWindows(options);

	  // create constants based on platform, for windows or posix
	  const {
	    DOT_LITERAL,
	    SLASH_LITERAL,
	    ONE_CHAR,
	    DOTS_SLASH,
	    NO_DOT,
	    NO_DOTS,
	    NO_DOTS_SLASH,
	    STAR,
	    START_ANCHOR
	  } = constants.globChars(win32);

	  const nodot = opts.dot ? NO_DOTS : NO_DOT;
	  const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
	  const capture = opts.capture ? '' : '?:';
	  const state = { negated: false, prefix: '' };
	  let star = opts.bash === true ? '.*?' : STAR;

	  if (opts.capture) {
	    star = `(${star})`;
	  }

	  const globstar = opts => {
	    if (opts.noglobstar === true) return star;
	    return `(${capture}(?:(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
	  };

	  const create = str => {
	    switch (str) {
	      case '*':
	        return `${nodot}${ONE_CHAR}${star}`;

	      case '.*':
	        return `${DOT_LITERAL}${ONE_CHAR}${star}`;

	      case '*.*':
	        return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;

	      case '*/*':
	        return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;

	      case '**':
	        return nodot + globstar(opts);

	      case '**/*':
	        return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;

	      case '**/*.*':
	        return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;

	      case '**/.*':
	        return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;

	      default: {
	        const match = /^(.*?)\.(\w+)$/.exec(str);
	        if (!match) return;

	        const source = create(match[1]);
	        if (!source) return;

	        return source + DOT_LITERAL + match[2];
	      }
	    }
	  };

	  const output = utils.removePrefix(input, state);
	  let source = create(output);

	  if (source && opts.strictSlashes !== true) {
	    source += `${SLASH_LITERAL}?`;
	  }

	  return source;
	};

	parse_1$1 = parse;
	return parse_1$1;
}

var picomatch_1;
var hasRequiredPicomatch$1;

function requirePicomatch$1 () {
	if (hasRequiredPicomatch$1) return picomatch_1;
	hasRequiredPicomatch$1 = 1;

	const path = path__default;
	const scan = requireScan();
	const parse = requireParse$1();
	const utils = requireUtils$1();
	const constants = requireConstants$1();
	const isObject = val => val && typeof val === 'object' && !Array.isArray(val);

	/**
	 * Creates a matcher function from one or more glob patterns. The
	 * returned function takes a string to match as its first argument,
	 * and returns true if the string is a match. The returned matcher
	 * function also takes a boolean as the second argument that, when true,
	 * returns an object with additional information.
	 *
	 * ```js
	 * const picomatch = require('picomatch');
	 * // picomatch(glob[, options]);
	 *
	 * const isMatch = picomatch('*.!(*a)');
	 * console.log(isMatch('a.a')); //=> false
	 * console.log(isMatch('a.b')); //=> true
	 * ```
	 * @name picomatch
	 * @param {String|Array} `globs` One or more glob patterns.
	 * @param {Object=} `options`
	 * @return {Function=} Returns a matcher function.
	 * @api public
	 */

	const picomatch = (glob, options, returnState = false) => {
	  if (Array.isArray(glob)) {
	    const fns = glob.map(input => picomatch(input, options, returnState));
	    const arrayMatcher = str => {
	      for (const isMatch of fns) {
	        const state = isMatch(str);
	        if (state) return state;
	      }
	      return false;
	    };
	    return arrayMatcher;
	  }

	  const isState = isObject(glob) && glob.tokens && glob.input;

	  if (glob === '' || (typeof glob !== 'string' && !isState)) {
	    throw new TypeError('Expected pattern to be a non-empty string');
	  }

	  const opts = options || {};
	  const posix = utils.isWindows(options);
	  const regex = isState
	    ? picomatch.compileRe(glob, options)
	    : picomatch.makeRe(glob, options, false, true);

	  const state = regex.state;
	  delete regex.state;

	  let isIgnored = () => false;
	  if (opts.ignore) {
	    const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
	    isIgnored = picomatch(opts.ignore, ignoreOpts, returnState);
	  }

	  const matcher = (input, returnObject = false) => {
	    const { isMatch, match, output } = picomatch.test(input, regex, options, { glob, posix });
	    const result = { glob, state, regex, posix, input, output, match, isMatch };

	    if (typeof opts.onResult === 'function') {
	      opts.onResult(result);
	    }

	    if (isMatch === false) {
	      result.isMatch = false;
	      return returnObject ? result : false;
	    }

	    if (isIgnored(input)) {
	      if (typeof opts.onIgnore === 'function') {
	        opts.onIgnore(result);
	      }
	      result.isMatch = false;
	      return returnObject ? result : false;
	    }

	    if (typeof opts.onMatch === 'function') {
	      opts.onMatch(result);
	    }
	    return returnObject ? result : true;
	  };

	  if (returnState) {
	    matcher.state = state;
	  }

	  return matcher;
	};

	/**
	 * Test `input` with the given `regex`. This is used by the main
	 * `picomatch()` function to test the input string.
	 *
	 * ```js
	 * const picomatch = require('picomatch');
	 * // picomatch.test(input, regex[, options]);
	 *
	 * console.log(picomatch.test('foo/bar', /^(?:([^/]*?)\/([^/]*?))$/));
	 * // { isMatch: true, match: [ 'foo/', 'foo', 'bar' ], output: 'foo/bar' }
	 * ```
	 * @param {String} `input` String to test.
	 * @param {RegExp} `regex`
	 * @return {Object} Returns an object with matching info.
	 * @api public
	 */

	picomatch.test = (input, regex, options, { glob, posix } = {}) => {
	  if (typeof input !== 'string') {
	    throw new TypeError('Expected input to be a string');
	  }

	  if (input === '') {
	    return { isMatch: false, output: '' };
	  }

	  const opts = options || {};
	  const format = opts.format || (posix ? utils.toPosixSlashes : null);
	  let match = input === glob;
	  let output = (match && format) ? format(input) : input;

	  if (match === false) {
	    output = format ? format(input) : input;
	    match = output === glob;
	  }

	  if (match === false || opts.capture === true) {
	    if (opts.matchBase === true || opts.basename === true) {
	      match = picomatch.matchBase(input, regex, options, posix);
	    } else {
	      match = regex.exec(output);
	    }
	  }

	  return { isMatch: Boolean(match), match, output };
	};

	/**
	 * Match the basename of a filepath.
	 *
	 * ```js
	 * const picomatch = require('picomatch');
	 * // picomatch.matchBase(input, glob[, options]);
	 * console.log(picomatch.matchBase('foo/bar.js', '*.js'); // true
	 * ```
	 * @param {String} `input` String to test.
	 * @param {RegExp|String} `glob` Glob pattern or regex created by [.makeRe](#makeRe).
	 * @return {Boolean}
	 * @api public
	 */

	picomatch.matchBase = (input, glob, options, posix = utils.isWindows(options)) => {
	  const regex = glob instanceof RegExp ? glob : picomatch.makeRe(glob, options);
	  return regex.test(path.basename(input));
	};

	/**
	 * Returns true if **any** of the given glob `patterns` match the specified `string`.
	 *
	 * ```js
	 * const picomatch = require('picomatch');
	 * // picomatch.isMatch(string, patterns[, options]);
	 *
	 * console.log(picomatch.isMatch('a.a', ['b.*', '*.a'])); //=> true
	 * console.log(picomatch.isMatch('a.a', 'b.*')); //=> false
	 * ```
	 * @param {String|Array} str The string to test.
	 * @param {String|Array} patterns One or more glob patterns to use for matching.
	 * @param {Object} [options] See available [options](#options).
	 * @return {Boolean} Returns true if any patterns match `str`
	 * @api public
	 */

	picomatch.isMatch = (str, patterns, options) => picomatch(patterns, options)(str);

	/**
	 * Parse a glob pattern to create the source string for a regular
	 * expression.
	 *
	 * ```js
	 * const picomatch = require('picomatch');
	 * const result = picomatch.parse(pattern[, options]);
	 * ```
	 * @param {String} `pattern`
	 * @param {Object} `options`
	 * @return {Object} Returns an object with useful properties and output to be used as a regex source string.
	 * @api public
	 */

	picomatch.parse = (pattern, options) => {
	  if (Array.isArray(pattern)) return pattern.map(p => picomatch.parse(p, options));
	  return parse(pattern, { ...options, fastpaths: false });
	};

	/**
	 * Scan a glob pattern to separate the pattern into segments.
	 *
	 * ```js
	 * const picomatch = require('picomatch');
	 * // picomatch.scan(input[, options]);
	 *
	 * const result = picomatch.scan('!./foo/*.js');
	 * console.log(result);
	 * { prefix: '!./',
	 *   input: '!./foo/*.js',
	 *   start: 3,
	 *   base: 'foo',
	 *   glob: '*.js',
	 *   isBrace: false,
	 *   isBracket: false,
	 *   isGlob: true,
	 *   isExtglob: false,
	 *   isGlobstar: false,
	 *   negated: true }
	 * ```
	 * @param {String} `input` Glob pattern to scan.
	 * @param {Object} `options`
	 * @return {Object} Returns an object with
	 * @api public
	 */

	picomatch.scan = (input, options) => scan(input, options);

	/**
	 * Compile a regular expression from the `state` object returned by the
	 * [parse()](#parse) method.
	 *
	 * @param {Object} `state`
	 * @param {Object} `options`
	 * @param {Boolean} `returnOutput` Intended for implementors, this argument allows you to return the raw output from the parser.
	 * @param {Boolean} `returnState` Adds the state to a `state` property on the returned regex. Useful for implementors and debugging.
	 * @return {RegExp}
	 * @api public
	 */

	picomatch.compileRe = (state, options, returnOutput = false, returnState = false) => {
	  if (returnOutput === true) {
	    return state.output;
	  }

	  const opts = options || {};
	  const prepend = opts.contains ? '' : '^';
	  const append = opts.contains ? '' : '$';

	  let source = `${prepend}(?:${state.output})${append}`;
	  if (state && state.negated === true) {
	    source = `^(?!${source}).*$`;
	  }

	  const regex = picomatch.toRegex(source, options);
	  if (returnState === true) {
	    regex.state = state;
	  }

	  return regex;
	};

	/**
	 * Create a regular expression from a parsed glob pattern.
	 *
	 * ```js
	 * const picomatch = require('picomatch');
	 * const state = picomatch.parse('*.js');
	 * // picomatch.compileRe(state[, options]);
	 *
	 * console.log(picomatch.compileRe(state));
	 * //=> /^(?:(?!\.)(?=.)[^/]*?\.js)$/
	 * ```
	 * @param {String} `state` The object returned from the `.parse` method.
	 * @param {Object} `options`
	 * @param {Boolean} `returnOutput` Implementors may use this argument to return the compiled output, instead of a regular expression. This is not exposed on the options to prevent end-users from mutating the result.
	 * @param {Boolean} `returnState` Implementors may use this argument to return the state from the parsed glob with the returned regular expression.
	 * @return {RegExp} Returns a regex created from the given pattern.
	 * @api public
	 */

	picomatch.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
	  if (!input || typeof input !== 'string') {
	    throw new TypeError('Expected a non-empty string');
	  }

	  let parsed = { negated: false, fastpaths: true };

	  if (options.fastpaths !== false && (input[0] === '.' || input[0] === '*')) {
	    parsed.output = parse.fastpaths(input, options);
	  }

	  if (!parsed.output) {
	    parsed = parse(input, options);
	  }

	  return picomatch.compileRe(parsed, options, returnOutput, returnState);
	};

	/**
	 * Create a regular expression from the given regex source string.
	 *
	 * ```js
	 * const picomatch = require('picomatch');
	 * // picomatch.toRegex(source[, options]);
	 *
	 * const { output } = picomatch.parse('*.js');
	 * console.log(picomatch.toRegex(output));
	 * //=> /^(?:(?!\.)(?=.)[^/]*?\.js)$/
	 * ```
	 * @param {String} `source` Regular expression source string.
	 * @param {Object} `options`
	 * @return {RegExp}
	 * @api public
	 */

	picomatch.toRegex = (source, options) => {
	  try {
	    const opts = options || {};
	    return new RegExp(source, opts.flags || (opts.nocase ? 'i' : ''));
	  } catch (err) {
	    if (options && options.debug === true) throw err;
	    return /$^/;
	  }
	};

	/**
	 * Picomatch constants.
	 * @return {Object}
	 */

	picomatch.constants = constants;

	/**
	 * Expose "picomatch"
	 */

	picomatch_1 = picomatch;
	return picomatch_1;
}

var picomatch;
var hasRequiredPicomatch;

function requirePicomatch () {
	if (hasRequiredPicomatch) return picomatch;
	hasRequiredPicomatch = 1;

	picomatch = requirePicomatch$1();
	return picomatch;
}

requirePicomatch();

function pluralize(word, count, ending = "s") {
  return `${count} ${word}${count === 1 ? "" : ending}`;
}

const JEST_MATCHERS_OBJECT = Symbol.for("$$jest-matchers-object");
const INTERNAL_MATCHER_FLAG = Symbol.for("$$jest-internal-matcher");
if (!Object.prototype.hasOwnProperty.call(globalThis, JEST_MATCHERS_OBJECT)) {
  const defaultState = {
    assertionCalls: 0,
    expectedAssertionsNumber: null,
    isExpectingAssertions: false,
    numPassingAsserts: 0,
    suppressedErrors: []
    // errors that are not thrown immediately.
  };
  Object.defineProperty(globalThis, JEST_MATCHERS_OBJECT, {
    value: {
      customEqualityTesters: [],
      matchers: /* @__PURE__ */ Object.create(null),
      state: defaultState
    }
  });
}
const getState = () => globalThis[JEST_MATCHERS_OBJECT].state;
const setState = (state) => {
  Object.assign(globalThis[JEST_MATCHERS_OBJECT].state, state);
};
const getMatchers = () => globalThis[JEST_MATCHERS_OBJECT].matchers;
const setMatchers = (matchers, isInternal, expect) => {
  for (const key of Object.keys(matchers)) {
    const matcher = matchers[key];
    if (typeof matcher !== "function") {
      throw new TypeError(
        `expect.extend: \`${key}\` is not a valid matcher. Must be a function, is "${getType$1(
          matcher
        )}"`
      );
    }
    Object.defineProperty(matcher, INTERNAL_MATCHER_FLAG, {
      value: isInternal
    });
    if (!isInternal) {
      class CustomMatcher extends AsymmetricMatcher {
        constructor(inverse = false, ...sample) {
          super(sample, inverse);
        }
        asymmetricMatch(other) {
          const { pass } = matcher.call(
            this.getMatcherContext(),
            other,
            ...this.sample
          );
          return this.inverse ? !pass : pass;
        }
        toString() {
          return `${this.inverse ? "not." : ""}${key}`;
        }
        getExpectedType() {
          return "any";
        }
        toAsymmetricMatcher() {
          return `${this.toString()}<${this.sample.map(String).join(", ")}>`;
        }
      }
      Object.defineProperty(expect, key, {
        configurable: true,
        enumerable: true,
        value: (...sample) => new CustomMatcher(false, ...sample),
        writable: true
      });
      Object.defineProperty(expect.not, key, {
        configurable: true,
        enumerable: true,
        value: (...sample) => new CustomMatcher(true, ...sample),
        writable: true
      });
    }
  }
  Object.assign(globalThis[JEST_MATCHERS_OBJECT].matchers, matchers);
};
const getCustomEqualityTesters = () => globalThis[JEST_MATCHERS_OBJECT].customEqualityTesters;
const addCustomEqualityTesters = (newTesters) => {
  if (!Array.isArray(newTesters)) {
    throw new TypeError(
      `expect.customEqualityTesters: Must be set to an array of Testers. Was given "${getType$1(
        newTesters
      )}"`
    );
  }
  globalThis[JEST_MATCHERS_OBJECT].customEqualityTesters.push(
    ...newTesters
  );
};

const functionToString = Function.prototype.toString;
function fnNameFor(func) {
  if (func.name) {
    return func.name;
  }
  const matches = functionToString.call(func).match(/^(?:async)?\s*function\s*\*?\s*([\w$]+)\s*\(/);
  return matches ? matches[1] : "<anonymous>";
}
const utils$1 = Object.freeze({
  ...matcherUtils,
  iterableEquality,
  subsetEquality
});
function hasProperty(obj, property) {
  if (!obj) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(obj, property)) {
    return true;
  }
  return hasProperty(Object.getPrototypeOf(obj), property);
}
class AsymmetricMatcher {
  constructor(sample, inverse = false) {
    this.sample = sample;
    this.inverse = inverse;
  }
  $$typeof = Symbol.for("jest.asymmetricMatcher");
  getMatcherContext() {
    return {
      customTesters: getCustomEqualityTesters(),
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      dontThrow: () => {
      },
      ...getState(),
      equals,
      isNot: this.inverse,
      utils: utils$1
    };
  }
}
class Any extends AsymmetricMatcher {
  constructor(sample) {
    if (sample === void 0) {
      throw new TypeError(
        "any() expects to be passed a constructor function. Please pass one or use anything() to match any object."
      );
    }
    super(sample);
  }
  asymmetricMatch(other) {
    if (this.sample === String) {
      return typeof other === "string" || other instanceof String;
    }
    if (this.sample === Number) {
      return typeof other === "number" || other instanceof Number;
    }
    if (this.sample === Function) {
      return typeof other === "function" || other instanceof Function;
    }
    if (this.sample === Boolean) {
      return typeof other === "boolean" || other instanceof Boolean;
    }
    if (this.sample === BigInt) {
      return typeof other === "bigint" || other instanceof BigInt;
    }
    if (this.sample === Symbol) {
      return typeof other === "symbol" || other instanceof Symbol;
    }
    if (this.sample === Object) {
      return typeof other === "object";
    }
    if (this.sample === Array) {
      return Array.isArray(other);
    }
    return other instanceof this.sample;
  }
  toString() {
    return "Any";
  }
  getExpectedType() {
    if (this.sample === String) {
      return "string";
    }
    if (this.sample === Number) {
      return "number";
    }
    if (this.sample === Function) {
      return "function";
    }
    if (this.sample === Object) {
      return "object";
    }
    if (this.sample === Boolean) {
      return "boolean";
    }
    if (this.sample === Array) {
      return "array";
    }
    return fnNameFor(this.sample);
  }
  toAsymmetricMatcher() {
    return `Any<${fnNameFor(this.sample)}>`;
  }
}
class Anything extends AsymmetricMatcher {
  asymmetricMatch(other) {
    return other != null;
  }
  toString() {
    return "Anything";
  }
  // No getExpectedType method, because it matches either null or undefined.
  toAsymmetricMatcher() {
    return "Anything";
  }
}
class ArrayContaining extends AsymmetricMatcher {
  constructor(sample, inverse = false) {
    super(sample, inverse);
  }
  asymmetricMatch(other) {
    if (!Array.isArray(this.sample)) {
      throw new TypeError(
        `You must provide an array to ${this.toString()}, not '${typeof this.sample}'.`
      );
    }
    const matcherContext = this.getMatcherContext();
    const result = this.sample.length === 0 || Array.isArray(other) && this.sample.every(
      (item) => other.some(
        (another) => equals(item, another, matcherContext.customTesters)
      )
    );
    return this.inverse ? !result : result;
  }
  toString() {
    return `Array${this.inverse ? "Not" : ""}Containing`;
  }
  getExpectedType() {
    return "array";
  }
}
class ArrayOf extends AsymmetricMatcher {
  asymmetricMatch(other) {
    const matcherContext = this.getMatcherContext();
    const result = Array.isArray(other) && other.every(
      (item) => equals(this.sample, item, matcherContext.customTesters)
    );
    return this.inverse ? !result : result;
  }
  toString() {
    return `${this.inverse ? "Not" : ""}ArrayOf`;
  }
  getExpectedType() {
    return "array";
  }
}
class ObjectContaining extends AsymmetricMatcher {
  constructor(sample, inverse = false) {
    super(sample, inverse);
  }
  asymmetricMatch(other) {
    if (typeof this.sample !== "object") {
      throw new TypeError(
        `You must provide an object to ${this.toString()}, not '${typeof this.sample}'.`
      );
    }
    if (typeof other !== "object" || Array.isArray(other)) {
      return false;
    }
    let result = true;
    const matcherContext = this.getMatcherContext();
    const objectKeys = getObjectKeys(this.sample);
    for (const key of objectKeys) {
      if (!hasProperty(other, key) || !equals(this.sample[key], other[key], matcherContext.customTesters)) {
        result = false;
        break;
      }
    }
    return this.inverse ? !result : result;
  }
  toString() {
    return `Object${this.inverse ? "Not" : ""}Containing`;
  }
  getExpectedType() {
    return "object";
  }
}
class StringContaining extends AsymmetricMatcher {
  constructor(sample, inverse = false) {
    if (!isA("String", sample)) {
      throw new Error("Expected is not a string");
    }
    super(sample, inverse);
  }
  asymmetricMatch(other) {
    const result = isA("String", other) && other.includes(this.sample);
    return this.inverse ? !result : result;
  }
  toString() {
    return `String${this.inverse ? "Not" : ""}Containing`;
  }
  getExpectedType() {
    return "string";
  }
}
class StringMatching extends AsymmetricMatcher {
  constructor(sample, inverse = false) {
    if (!isA("String", sample) && !isA("RegExp", sample)) {
      throw new Error("Expected is not a String or a RegExp");
    }
    super(new RegExp(sample), inverse);
  }
  asymmetricMatch(other) {
    const result = isA("String", other) && this.sample.test(other);
    return this.inverse ? !result : result;
  }
  toString() {
    return `String${this.inverse ? "Not" : ""}Matching`;
  }
  getExpectedType() {
    return "string";
  }
}
class CloseTo extends AsymmetricMatcher {
  precision;
  constructor(sample, precision = 2, inverse = false) {
    if (!isA("Number", sample)) {
      throw new Error("Expected is not a Number");
    }
    if (!isA("Number", precision)) {
      throw new Error("Precision is not a Number");
    }
    super(sample);
    this.inverse = inverse;
    this.precision = precision;
  }
  asymmetricMatch(other) {
    if (!isA("Number", other)) {
      return false;
    }
    let result = false;
    if (other === Number.POSITIVE_INFINITY && this.sample === Number.POSITIVE_INFINITY) {
      result = true;
    } else if (other === Number.NEGATIVE_INFINITY && this.sample === Number.NEGATIVE_INFINITY) {
      result = true;
    } else {
      result = Math.abs(this.sample - other) < Math.pow(10, -this.precision) / 2;
    }
    return this.inverse ? !result : result;
  }
  toString() {
    return `Number${this.inverse ? "Not" : ""}CloseTo`;
  }
  getExpectedType() {
    return "number";
  }
  toAsymmetricMatcher() {
    return [
      this.toString(),
      this.sample,
      `(${pluralize("digit", this.precision)})`
    ].join(" ");
  }
}
const any = (expectedObject) => new Any(expectedObject);
const anything = () => new Anything();
const arrayContaining = (sample) => new ArrayContaining(sample);
const arrayNotContaining = (sample) => new ArrayContaining(sample, true);
const arrayOf = (sample) => new ArrayOf(sample);
const notArrayOf = (sample) => new ArrayOf(sample, true);
const objectContaining = (sample) => new ObjectContaining(sample);
const objectNotContaining = (sample) => new ObjectContaining(sample, true);
const stringContaining = (expected) => new StringContaining(expected);
const stringNotContaining = (expected) => new StringContaining(expected, true);
const stringMatching = (expected) => new StringMatching(expected);
const stringNotMatching = (expected) => new StringMatching(expected, true);
const closeTo = (expected, precision) => new CloseTo(expected, precision);
const notCloseTo = (expected, precision) => new CloseTo(expected, precision, true);

const resetAssertionsLocalState = () => {
  setState({
    assertionCalls: 0,
    expectedAssertionsNumber: null,
    isExpectingAssertions: false,
    numPassingAsserts: 0
  });
};
const extractExpectedAssertionsErrors = () => {
  const result = [];
  const {
    assertionCalls,
    expectedAssertionsNumber,
    expectedAssertionsNumberError,
    isExpectingAssertions,
    isExpectingAssertionsError
  } = getState();
  resetAssertionsLocalState();
  if (typeof expectedAssertionsNumber === "number" && assertionCalls !== expectedAssertionsNumber) {
    const numOfAssertionsExpected = EXPECTED_COLOR(
      pluralize$1("assertion", expectedAssertionsNumber)
    );
    expectedAssertionsNumberError.message = `${matcherHint(".assertions", "", expectedAssertionsNumber.toString(), {
      isDirectExpectCall: true
    })}

Expected ${numOfAssertionsExpected} to be called but received ${RECEIVED_COLOR(
      pluralize$1("assertion call", assertionCalls || 0)
    )}.`;
    result.push({
      actual: assertionCalls.toString(),
      error: expectedAssertionsNumberError,
      expected: expectedAssertionsNumber.toString()
    });
  }
  if (isExpectingAssertions && assertionCalls === 0) {
    const expected = EXPECTED_COLOR("at least one assertion");
    const received = RECEIVED_COLOR("received none");
    isExpectingAssertionsError.message = `${matcherHint(
      ".hasAssertions",
      "",
      "",
      { isDirectExpectCall: true }
    )}

Expected ${expected} to be called but ${received}.`;
    result.push({
      actual: "none",
      error: isExpectingAssertionsError,
      expected: "at least one"
    });
  }
  return result;
};

const printSubstring = (val) => val.replaceAll(/"|\\/g, "\\$&");
const printReceivedStringContainExpectedSubstring = (received, start, length) => RECEIVED_COLOR(
  `"${printSubstring(received.slice(0, start))}${INVERTED_COLOR(
    printSubstring(received.slice(start, start + length))
  )}${printSubstring(received.slice(start + length))}"`
);
const printReceivedStringContainExpectedResult = (received, result) => result === null ? printReceived(received) : printReceivedStringContainExpectedSubstring(
  received,
  result.index,
  result[0].length
);
const printReceivedArrayContainExpectedItem = (received, index) => RECEIVED_COLOR(
  `[${received.map((item, i) => {
    const stringified = stringify$1(item);
    return i === index ? INVERTED_COLOR(stringified) : stringified;
  }).join(", ")}]`
);
const printCloseTo = (receivedDiff, expectedDiff, precision, isNot) => {
  const receivedDiffString = stringify$1(receivedDiff);
  const expectedDiffString = receivedDiffString.includes("e") ? (
    // toExponential arg is number of digits after the decimal point.
    expectedDiff.toExponential(0)
  ) : 0 <= precision && precision < 20 ? (
    // toFixed arg is number of digits after the decimal point.
    // It may be a value between 0 and 20 inclusive.
    // Implementations may optionally support a larger range of values.
    expectedDiff.toFixed(precision + 1)
  ) : stringify$1(expectedDiff);
  return `Expected precision:  ${isNot ? "    " : ""}  ${stringify$1(precision)}
Expected difference: ${isNot ? "not " : ""}< ${EXPECTED_COLOR(
    expectedDiffString
  )}
Received difference: ${isNot ? "    " : ""}  ${RECEIVED_COLOR(
    receivedDiffString
  )}`;
};
const printExpectedConstructorName = (label, expected) => `${printConstructorName(label, expected, false, true)}
`;
const printExpectedConstructorNameNot = (label, expected) => `${printConstructorName(label, expected, true, true)}
`;
const printReceivedConstructorName = (label, received) => `${printConstructorName(label, received, false, false)}
`;
const printReceivedConstructorNameNot = (label, received, expected) => typeof expected.name === "string" && expected.name.length > 0 && typeof received.name === "string" && received.name.length > 0 ? `${printConstructorName(label, received, true, false)} ${Object.getPrototypeOf(received) === expected ? "extends" : "extends … extends"} ${EXPECTED_COLOR(expected.name)}
` : `${printConstructorName(label, received, false, false)}
`;
const printConstructorName = (label, constructor, isNot, isExpected) => typeof constructor.name === "string" ? constructor.name.length === 0 ? `${label} name is an empty string` : `${label}: ${isNot ? isExpected ? "not " : "    " : ""}${isExpected ? EXPECTED_COLOR(constructor.name) : RECEIVED_COLOR(constructor.name)}` : `${label} name is not a string`;

const EXPECTED_LABEL = "Expected";
const RECEIVED_LABEL = "Received";
const EXPECTED_VALUE_LABEL = "Expected value";
const RECEIVED_VALUE_LABEL = "Received value";
const isExpand$1 = (expand) => expand !== false;
const toStrictEqualTesters = [
  iterableEquality,
  typeEquality,
  sparseArrayEquality,
  arrayBufferEquality
];
const matchers$1 = {
  toBe(received, expected) {
    const matcherName = "toBe";
    const options = {
      comment: "Object.is equality",
      isNot: this.isNot,
      promise: this.promise
    };
    const pass = Object.is(received, expected);
    const message = pass ? () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected: not ${printExpected(expected)}`
    ) : () => {
      const expectedType = getType$1(expected);
      let deepEqualityName = null;
      if (expectedType !== "map" && expectedType !== "set") {
        if (equals(
          received,
          expected,
          [...this.customTesters, ...toStrictEqualTesters],
          true
        )) {
          deepEqualityName = "toStrictEqual";
        } else if (equals(received, expected, [
          ...this.customTesters,
          iterableEquality
        ])) {
          deepEqualityName = "toEqual";
        }
      }
      return (
        // eslint-disable-next-line prefer-template
        matcherHint(matcherName, void 0, void 0, options) + "\n\n" + (deepEqualityName === null ? "" : `${DIM_COLOR(
          `If it should pass with deep equality, replace "${matcherName}" with "${deepEqualityName}"`
        )}

`) + printDiffOrStringify(
          expected,
          received,
          EXPECTED_LABEL,
          RECEIVED_LABEL,
          isExpand$1(this.expand)
        )
      );
    };
    return { actual: received, expected, message, name: matcherName, pass };
  },
  toBeCloseTo(received, expected, precision = 2) {
    const matcherName = "toBeCloseTo";
    const secondArgument = arguments.length === 3 ? "precision" : void 0;
    const isNot = this.isNot;
    const options = {
      isNot,
      promise: this.promise,
      secondArgument,
      secondArgumentColor: (arg) => arg
    };
    if (typeof expected !== "number") {
      throw new TypeError(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, void 0, options),
          `${EXPECTED_COLOR("expected")} value must be a number`,
          printWithType("Expected", expected, printExpected)
        )
      );
    }
    if (typeof received !== "number") {
      throw new TypeError(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, void 0, options),
          `${RECEIVED_COLOR("received")} value must be a number`,
          printWithType("Received", received, printReceived)
        )
      );
    }
    let pass = false;
    let expectedDiff = 0;
    let receivedDiff = 0;
    if (received === Number.POSITIVE_INFINITY && expected === Number.POSITIVE_INFINITY) {
      pass = true;
    } else if (received === Number.NEGATIVE_INFINITY && expected === Number.NEGATIVE_INFINITY) {
      pass = true;
    } else {
      expectedDiff = Math.pow(10, -precision) / 2;
      receivedDiff = Math.abs(expected - received);
      pass = receivedDiff < expectedDiff;
    }
    const message = pass ? () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected: not ${printExpected(expected)}
` + (receivedDiff === 0 ? "" : `Received:     ${printReceived(received)}

${printCloseTo(receivedDiff, expectedDiff, precision, isNot)}`)
    ) : () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected: ${printExpected(expected)}
Received: ${printReceived(received)}

` + printCloseTo(receivedDiff, expectedDiff, precision, isNot)
    );
    return { message, pass };
  },
  toBeDefined(received, expected) {
    const matcherName = "toBeDefined";
    const options = {
      isNot: this.isNot,
      promise: this.promise
    };
    ensureNoExpected(expected, matcherName, options);
    const pass = received !== void 0;
    const message = () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, "", options) + `

Received: ${printReceived(received)}`
    );
    return { message, pass };
  },
  toBeFalsy(received, expected) {
    const matcherName = "toBeFalsy";
    const options = {
      isNot: this.isNot,
      promise: this.promise
    };
    ensureNoExpected(expected, matcherName, options);
    const pass = !received;
    const message = () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, "", options) + `

Received: ${printReceived(received)}`
    );
    return { message, pass };
  },
  toBeGreaterThan(received, expected) {
    const matcherName = "toBeGreaterThan";
    const isNot = this.isNot;
    const options = {
      isNot,
      promise: this.promise
    };
    ensureNumbers(received, expected, matcherName, options);
    const pass = received > expected;
    const message = () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected:${isNot ? " not" : ""} > ${printExpected(expected)}
Received:${isNot ? "    " : ""}   ${printReceived(received)}`
    );
    return { message, pass };
  },
  toBeGreaterThanOrEqual(received, expected) {
    const matcherName = "toBeGreaterThanOrEqual";
    const isNot = this.isNot;
    const options = {
      isNot,
      promise: this.promise
    };
    ensureNumbers(received, expected, matcherName, options);
    const pass = received >= expected;
    const message = () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected:${isNot ? " not" : ""} >= ${printExpected(expected)}
Received:${isNot ? "    " : ""}    ${printReceived(received)}`
    );
    return { message, pass };
  },
  toBeInstanceOf(received, expected) {
    const matcherName = "toBeInstanceOf";
    const options = {
      isNot: this.isNot,
      promise: this.promise
    };
    if (typeof expected !== "function") {
      throw new TypeError(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, void 0, options),
          `${EXPECTED_COLOR("expected")} value must be a function`,
          printWithType("Expected", expected, printExpected)
        )
      );
    }
    const pass = received instanceof expected;
    const message = pass ? () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + "\n\n" + printExpectedConstructorNameNot("Expected constructor", expected) + (typeof received.constructor === "function" && received.constructor !== expected ? printReceivedConstructorNameNot(
        "Received constructor",
        received.constructor,
        expected
      ) : "")
    ) : () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + "\n\n" + printExpectedConstructorName("Expected constructor", expected) + (isPrimitive(received) || Object.getPrototypeOf(received) === null ? `
Received value has no prototype
Received value: ${printReceived(
        received
      )}` : typeof received.constructor === "function" ? printReceivedConstructorName(
        "Received constructor",
        received.constructor
      ) : `
Received value: ${printReceived(received)}`)
    );
    return { message, pass };
  },
  toBeLessThan(received, expected) {
    const matcherName = "toBeLessThan";
    const isNot = this.isNot;
    const options = {
      isNot,
      promise: this.promise
    };
    ensureNumbers(received, expected, matcherName, options);
    const pass = received < expected;
    const message = () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected:${isNot ? " not" : ""} < ${printExpected(expected)}
Received:${isNot ? "    " : ""}   ${printReceived(received)}`
    );
    return { message, pass };
  },
  toBeLessThanOrEqual(received, expected) {
    const matcherName = "toBeLessThanOrEqual";
    const isNot = this.isNot;
    const options = {
      isNot,
      promise: this.promise
    };
    ensureNumbers(received, expected, matcherName, options);
    const pass = received <= expected;
    const message = () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected:${isNot ? " not" : ""} <= ${printExpected(expected)}
Received:${isNot ? "    " : ""}    ${printReceived(received)}`
    );
    return { message, pass };
  },
  toBeNaN(received, expected) {
    const matcherName = "toBeNaN";
    const options = {
      isNot: this.isNot,
      promise: this.promise
    };
    ensureNoExpected(expected, matcherName, options);
    const pass = Number.isNaN(received);
    const message = () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, "", options) + `

Received: ${printReceived(received)}`
    );
    return { message, pass };
  },
  toBeNull(received, expected) {
    const matcherName = "toBeNull";
    const options = {
      isNot: this.isNot,
      promise: this.promise
    };
    ensureNoExpected(expected, matcherName, options);
    const pass = received === null;
    const message = () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, "", options) + `

Received: ${printReceived(received)}`
    );
    return { message, pass };
  },
  toBeTruthy(received, expected) {
    const matcherName = "toBeTruthy";
    const options = {
      isNot: this.isNot,
      promise: this.promise
    };
    ensureNoExpected(expected, matcherName, options);
    const pass = !!received;
    const message = () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, "", options) + `

Received: ${printReceived(received)}`
    );
    return { message, pass };
  },
  toBeUndefined(received, expected) {
    const matcherName = "toBeUndefined";
    const options = {
      isNot: this.isNot,
      promise: this.promise
    };
    ensureNoExpected(expected, matcherName, options);
    const pass = received === void 0;
    const message = () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, "", options) + `

Received: ${printReceived(received)}`
    );
    return { message, pass };
  },
  toContain(received, expected) {
    const matcherName = "toContain";
    const isNot = this.isNot;
    const options = {
      comment: "indexOf",
      isNot,
      promise: this.promise
    };
    if (received == null) {
      throw new Error(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, void 0, options),
          `${RECEIVED_COLOR("received")} value must not be null nor undefined`,
          printWithType("Received", received, printReceived)
        )
      );
    }
    if (typeof received === "string") {
      const wrongTypeErrorMessage = `${EXPECTED_COLOR(
        "expected"
      )} value must be a string if ${RECEIVED_COLOR(
        "received"
      )} value is a string`;
      if (typeof expected !== "string") {
        throw new TypeError(
          matcherErrorMessage(
            matcherHint(matcherName, received, String(expected), options),
            wrongTypeErrorMessage,
            // eslint-disable-next-line prefer-template
            printWithType("Expected", expected, printExpected) + "\n" + printWithType("Received", received, printReceived)
          )
        );
      }
      const index2 = received.indexOf(String(expected));
      const pass2 = index2 !== -1;
      const message2 = () => {
        const labelExpected = `Expected ${typeof expected === "string" ? "substring" : "value"}`;
        const labelReceived = "Received string";
        const printLabel = getLabelPrinter(labelExpected, labelReceived);
        return (
          // eslint-disable-next-line prefer-template
          matcherHint(matcherName, void 0, void 0, options) + `

${printLabel(labelExpected)}${isNot ? "not " : ""}${printExpected(
            expected
          )}
${printLabel(labelReceived)}${isNot ? "    " : ""}${isNot ? printReceivedStringContainExpectedSubstring(
            received,
            index2,
            String(expected).length
          ) : printReceived(received)}`
        );
      };
      return { message: message2, pass: pass2 };
    }
    const indexable = [...received];
    const index = indexable.indexOf(expected);
    const pass = index !== -1;
    const message = () => {
      const labelExpected = "Expected value";
      const labelReceived = `Received ${getType$1(received)}`;
      const printLabel = getLabelPrinter(labelExpected, labelReceived);
      return (
        // eslint-disable-next-line prefer-template
        matcherHint(matcherName, void 0, void 0, options) + `

${printLabel(labelExpected)}${isNot ? "not " : ""}${printExpected(
          expected
        )}
${printLabel(labelReceived)}${isNot ? "    " : ""}${isNot && Array.isArray(received) ? printReceivedArrayContainExpectedItem(received, index) : printReceived(received)}` + (!isNot && indexable.some(
          (item) => equals(item, expected, [...this.customTesters, iterableEquality])
        ) ? `

${SUGGEST_TO_CONTAIN_EQUAL}` : "")
      );
    };
    return { message, pass };
  },
  toContainEqual(received, expected) {
    const matcherName = "toContainEqual";
    const isNot = this.isNot;
    const options = {
      comment: "deep equality",
      isNot,
      promise: this.promise
    };
    if (received == null) {
      throw new Error(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, void 0, options),
          `${RECEIVED_COLOR("received")} value must not be null nor undefined`,
          printWithType("Received", received, printReceived)
        )
      );
    }
    const index = [...received].findIndex(
      (item) => equals(item, expected, [...this.customTesters, iterableEquality])
    );
    const pass = index !== -1;
    const message = () => {
      const labelExpected = "Expected value";
      const labelReceived = `Received ${getType$1(received)}`;
      const printLabel = getLabelPrinter(labelExpected, labelReceived);
      return (
        // eslint-disable-next-line prefer-template
        matcherHint(matcherName, void 0, void 0, options) + `

${printLabel(labelExpected)}${isNot ? "not " : ""}${printExpected(
          expected
        )}
${printLabel(labelReceived)}${isNot ? "    " : ""}${isNot && Array.isArray(received) ? printReceivedArrayContainExpectedItem(received, index) : printReceived(received)}`
      );
    };
    return { message, pass };
  },
  toEqual(received, expected) {
    const matcherName = "toEqual";
    const options = {
      comment: "deep equality",
      isNot: this.isNot,
      promise: this.promise
    };
    const pass = equals(received, expected, [
      ...this.customTesters,
      iterableEquality
    ]);
    const message = pass ? () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected: not ${printExpected(expected)}
` + (stringify$1(expected) === stringify$1(received) ? "" : `Received:     ${printReceived(received)}`)
    ) : () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + "\n\n" + printDiffOrStringify(
        expected,
        received,
        EXPECTED_LABEL,
        RECEIVED_LABEL,
        isExpand$1(this.expand)
      )
    );
    return { actual: received, expected, message, name: matcherName, pass };
  },
  toHaveLength(received, expected) {
    const matcherName = "toHaveLength";
    const isNot = this.isNot;
    const options = {
      isNot,
      promise: this.promise
    };
    if (typeof received?.length !== "number") {
      throw new TypeError(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, void 0, options),
          `${RECEIVED_COLOR(
            "received"
          )} value must have a length property whose value must be a number`,
          printWithType("Received", received, printReceived)
        )
      );
    }
    ensureExpectedIsNonNegativeInteger(expected, matcherName, options);
    const pass = received.length === expected;
    const message = () => {
      const labelExpected = "Expected length";
      const labelReceivedLength = "Received length";
      const labelReceivedValue = `Received ${getType$1(received)}`;
      const printLabel = getLabelPrinter(
        labelExpected,
        labelReceivedLength,
        labelReceivedValue
      );
      return (
        // eslint-disable-next-line prefer-template
        matcherHint(matcherName, void 0, void 0, options) + `

${printLabel(labelExpected)}${isNot ? "not " : ""}${printExpected(
          expected
        )}
` + (isNot ? "" : `${printLabel(labelReceivedLength)}${printReceived(
          received.length
        )}
`) + `${printLabel(labelReceivedValue)}${isNot ? "    " : ""}${printReceived(
          received
        )}`
      );
    };
    return { message, pass };
  },
  toHaveProperty(received, expectedPath, expectedValue) {
    const matcherName = "toHaveProperty";
    const expectedArgument = "path";
    const hasValue = arguments.length === 3;
    const options = {
      isNot: this.isNot,
      promise: this.promise,
      secondArgument: hasValue ? "value" : ""
    };
    if (received === null || received === void 0) {
      throw new Error(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, expectedArgument, options),
          `${RECEIVED_COLOR("received")} value must not be null nor undefined`,
          printWithType("Received", received, printReceived)
        )
      );
    }
    const expectedPathType = getType$1(expectedPath);
    if (expectedPathType !== "string" && expectedPathType !== "array") {
      throw new Error(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, expectedArgument, options),
          `${EXPECTED_COLOR("expected")} path must be a string or array`,
          printWithType("Expected", expectedPath, printExpected)
        )
      );
    }
    const expectedPathLength = typeof expectedPath === "string" ? pathAsArray(expectedPath).length : expectedPath.length;
    if (expectedPathType === "array" && expectedPathLength === 0) {
      throw new Error(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, expectedArgument, options),
          `${EXPECTED_COLOR("expected")} path must not be an empty array`,
          printWithType("Expected", expectedPath, printExpected)
        )
      );
    }
    const result = getPath(received, expectedPath);
    const { lastTraversedObject, endPropIsDefined, hasEndProp, value } = result;
    const receivedPath = result.traversedPath;
    const hasCompletePath = receivedPath.length === expectedPathLength;
    const receivedValue = hasCompletePath ? result.value : lastTraversedObject;
    const pass = hasValue && endPropIsDefined ? equals(value, expectedValue, [
      ...this.customTesters,
      iterableEquality
    ]) : Boolean(hasEndProp);
    const message = pass ? () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, expectedArgument, options) + "\n\n" + (hasValue ? `Expected path: ${printExpected(expectedPath)}

Expected value: not ${printExpected(expectedValue)}${stringify$1(expectedValue) === stringify$1(receivedValue) ? "" : `
Received value:     ${printReceived(receivedValue)}`}` : `Expected path: not ${printExpected(expectedPath)}

Received value: ${printReceived(receivedValue)}`)
    ) : () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, expectedArgument, options) + `

Expected path: ${printExpected(expectedPath)}
` + (hasCompletePath ? `
${printDiffOrStringify(
        expectedValue,
        receivedValue,
        EXPECTED_VALUE_LABEL,
        RECEIVED_VALUE_LABEL,
        isExpand$1(this.expand)
      )}` : `Received path: ${printReceived(
        expectedPathType === "array" || receivedPath.length === 0 ? receivedPath : receivedPath.join(".")
      )}

${hasValue ? `Expected value: ${printExpected(expectedValue)}
` : ""}Received value: ${printReceived(receivedValue)}`)
    );
    return { message, pass };
  },
  toMatch(received, expected) {
    const matcherName = "toMatch";
    const options = {
      isNot: this.isNot,
      promise: this.promise
    };
    if (typeof received !== "string") {
      throw new TypeError(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, void 0, options),
          `${RECEIVED_COLOR("received")} value must be a string`,
          printWithType("Received", received, printReceived)
        )
      );
    }
    if (!(typeof expected === "string") && !(expected && typeof expected.test === "function")) {
      throw new Error(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, void 0, options),
          `${EXPECTED_COLOR(
            "expected"
          )} value must be a string or regular expression`,
          printWithType("Expected", expected, printExpected)
        )
      );
    }
    const pass = typeof expected === "string" ? received.includes(expected) : new RegExp(expected).test(received);
    const message = pass ? () => typeof expected === "string" ? (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected substring: not ${printExpected(expected)}
Received string:        ${printReceivedStringContainExpectedSubstring(
        received,
        received.indexOf(expected),
        expected.length
      )}`
    ) : (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected pattern: not ${printExpected(expected)}
Received string:      ${printReceivedStringContainExpectedResult(
        received,
        typeof expected.exec === "function" ? expected.exec(received) : null
      )}`
    ) : () => {
      const labelExpected = `Expected ${typeof expected === "string" ? "substring" : "pattern"}`;
      const labelReceived = "Received string";
      const printLabel = getLabelPrinter(labelExpected, labelReceived);
      return (
        // eslint-disable-next-line prefer-template
        matcherHint(matcherName, void 0, void 0, options) + `

${printLabel(labelExpected)}${printExpected(expected)}
${printLabel(labelReceived)}${printReceived(received)}`
      );
    };
    return { message, pass };
  },
  toMatchObject(received, expected) {
    const matcherName = "toMatchObject";
    const options = {
      isNot: this.isNot,
      promise: this.promise
    };
    if (typeof received !== "object" || received === null) {
      throw new Error(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, void 0, options),
          `${RECEIVED_COLOR("received")} value must be a non-null object`,
          printWithType("Received", received, printReceived)
        )
      );
    }
    if (typeof expected !== "object" || expected === null) {
      throw new Error(
        matcherErrorMessage(
          matcherHint(matcherName, void 0, void 0, options),
          `${EXPECTED_COLOR("expected")} value must be a non-null object`,
          printWithType("Expected", expected, printExpected)
        )
      );
    }
    const pass = equals(received, expected, [
      ...this.customTesters,
      iterableEquality,
      subsetEquality
    ]);
    const message = pass ? () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected: not ${printExpected(expected)}` + (stringify$1(expected) === stringify$1(received) ? "" : `
Received:     ${printReceived(received)}`)
    ) : () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + "\n\n" + printDiffOrStringify(
        expected,
        getObjectSubset(received, expected, this.customTesters),
        EXPECTED_LABEL,
        RECEIVED_LABEL,
        isExpand$1(this.expand)
      )
    );
    return { message, pass };
  },
  toStrictEqual(received, expected) {
    const matcherName = "toStrictEqual";
    const options = {
      comment: "deep equality",
      isNot: this.isNot,
      promise: this.promise
    };
    const pass = equals(
      received,
      expected,
      [...this.customTesters, ...toStrictEqualTesters],
      true
    );
    const message = pass ? () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + `

Expected: not ${printExpected(expected)}
` + (stringify$1(expected) === stringify$1(received) ? "" : `Received:     ${printReceived(received)}`)
    ) : () => (
      // eslint-disable-next-line prefer-template
      matcherHint(matcherName, void 0, void 0, options) + "\n\n" + printDiffOrStringify(
        expected,
        received,
        EXPECTED_LABEL,
        RECEIVED_LABEL,
        isExpand$1(this.expand)
      )
    );
    return { actual: received, expected, message, name: matcherName, pass };
  }
};

const isExpand = (expand) => expand !== false;
const PRINT_LIMIT = 3;
const NO_ARGUMENTS = "called with 0 arguments";
const printExpectedArgs = (expected) => expected.length === 0 ? NO_ARGUMENTS : expected.map((arg) => printExpected(arg)).join(", ");
const printReceivedArgs = (received, expected) => received.length === 0 ? NO_ARGUMENTS : received.map(
  (arg, i) => Array.isArray(expected) && i < expected.length && isEqualValue(expected[i], arg) ? printCommon(arg) : printReceived(arg)
).join(", ");
const printCommon = (val) => DIM_COLOR(stringify$1(val));
const isEqualValue = (expected, received) => equals(expected, received, [...getCustomEqualityTesters(), iterableEquality]);
const isEqualCall = (expected, received) => received.length === expected.length && isEqualValue(expected, received);
const isEqualReturn = (expected, result) => result.type === "return" && isEqualValue(expected, result.value);
const countReturns = (results) => results.reduce(
  (n, result) => result.type === "return" ? n + 1 : n,
  0
);
const printNumberOfReturns = (countReturns2, countCalls) => `
Number of returns: ${printReceived(countReturns2)}${countCalls === countReturns2 ? "" : `
Number of calls:   ${printReceived(countCalls)}`}`;
const getRightAlignedPrinter = (label) => {
  const index = label.indexOf(":");
  const suffix = label.slice(index);
  return (string, isExpectedCall) => (isExpectedCall ? `->${" ".repeat(Math.max(0, index - 2 - string.length))}` : " ".repeat(Math.max(index - string.length))) + string + suffix;
};
const printReceivedCallsNegative = (expected, indexedCalls, isOnlyCall, iExpectedCall) => {
  if (indexedCalls.length === 0) {
    return "";
  }
  const label = "Received:     ";
  if (isOnlyCall) {
    return `${label + printReceivedArgs(indexedCalls[0], expected)}
`;
  }
  const printAligned = getRightAlignedPrinter(label);
  return `Received
${indexedCalls.reduce(
    (printed, [i, args]) => `${printed + printAligned(String(i + 1), i === iExpectedCall) + printReceivedArgs(args, expected)}
`,
    ""
  )}`;
};
const printExpectedReceivedCallsPositive = (expected, indexedCalls, expand, isOnlyCall, iExpectedCall) => {
  const expectedLine = `Expected: ${printExpectedArgs(expected)}
`;
  if (indexedCalls.length === 0) {
    return expectedLine;
  }
  const label = "Received: ";
  if (isOnlyCall && (iExpectedCall === 0 || iExpectedCall === void 0)) {
    const received = indexedCalls[0][1];
    if (isLineDiffableCall(expected, received)) {
      const lines = [
        EXPECTED_COLOR("- Expected"),
        RECEIVED_COLOR("+ Received"),
        ""
      ];
      const length = Math.max(expected.length, received.length);
      for (let i = 0; i < length; i += 1) {
        if (i < expected.length && i < received.length) {
          if (isEqualValue(expected[i], received[i])) {
            lines.push(`  ${printCommon(received[i])},`);
            continue;
          }
          if (isLineDiffableArg(expected[i], received[i])) {
            const difference = diff(expected[i], received[i], { expand });
            if (typeof difference === "string" && difference.includes("- Expected") && difference.includes("+ Received")) {
              lines.push(`${difference.split("\n").slice(3).join("\n")},`);
              continue;
            }
          }
        }
        if (i < expected.length) {
          lines.push(`${EXPECTED_COLOR(`- ${stringify$1(expected[i])}`)},`);
        }
        if (i < received.length) {
          lines.push(`${RECEIVED_COLOR(`+ ${stringify$1(received[i])}`)},`);
        }
      }
      return `${lines.join("\n")}
`;
    }
    return `${expectedLine + label + printReceivedArgs(received, expected)}
`;
  }
  const printAligned = getRightAlignedPrinter(label);
  return (
    // eslint-disable-next-line prefer-template
    expectedLine + "Received\n" + indexedCalls.reduce((printed, [i, received]) => {
      const aligned = printAligned(String(i + 1), i === iExpectedCall);
      return `${printed + ((i === iExpectedCall || iExpectedCall === void 0) && isLineDiffableCall(expected, received) ? aligned.replace(": ", "\n") + printDiffCall(expected, received, expand) : aligned + printReceivedArgs(received, expected))}
`;
    }, "")
  );
};
const indentation = "Received".replaceAll(/\w/g, " ");
const printDiffCall = (expected, received, expand) => received.map((arg, i) => {
  if (i < expected.length) {
    if (isEqualValue(expected[i], arg)) {
      return `${indentation}  ${printCommon(arg)},`;
    }
    if (isLineDiffableArg(expected[i], arg)) {
      const difference = diff(expected[i], arg, { expand });
      if (typeof difference === "string" && difference.includes("- Expected") && difference.includes("+ Received")) {
        return `${difference.split("\n").slice(3).map((line) => indentation + line).join("\n")},`;
      }
    }
  }
  return `${indentation + (i < expected.length ? `  ${printReceived(arg)}` : RECEIVED_COLOR(`+ ${stringify$1(arg)}`))},`;
}).join("\n");
const isLineDiffableCall = (expected, received) => expected.some(
  (arg, i) => i < received.length && isLineDiffableArg(arg, received[i])
);
const isLineDiffableArg = (expected, received) => {
  const expectedType = getType$1(expected);
  const receivedType = getType$1(received);
  if (expectedType !== receivedType) {
    return false;
  }
  if (isPrimitive(expected)) {
    return false;
  }
  if (expectedType === "date" || expectedType === "function" || expectedType === "regexp") {
    return false;
  }
  if (expected instanceof Error && received instanceof Error) {
    return false;
  }
  if (expectedType === "object" && typeof expected.asymmetricMatch === "function") {
    return false;
  }
  if (receivedType === "object" && typeof received.asymmetricMatch === "function") {
    return false;
  }
  return true;
};
const printResult = (result, expected) => result.type === "throw" ? "function call threw an error" : result.type === "incomplete" ? "function call has not returned yet" : isEqualValue(expected, result.value) ? printCommon(result.value) : printReceived(result.value);
const printReceivedResults = (label, expected, indexedResults, isOnlyCall, iExpectedCall) => {
  if (indexedResults.length === 0) {
    return "";
  }
  if (isOnlyCall && (iExpectedCall === 0 || iExpectedCall === void 0)) {
    return `${label + printResult(indexedResults[0][1], expected)}
`;
  }
  const printAligned = getRightAlignedPrinter(label);
  return (
    // eslint-disable-next-line prefer-template
    label.replace(":", "").trim() + "\n" + indexedResults.reduce(
      (printed, [i, result]) => `${printed + printAligned(String(i + 1), i === iExpectedCall) + printResult(result, expected)}
`,
      ""
    )
  );
};
const createToHaveBeenCalledMatcher = () => function(received, expected) {
  const expectedArgument = "";
  const options = {
    isNot: this.isNot,
    promise: this.promise
  };
  ensureNoExpected(expected, "toHaveBeenCalled", options);
  ensureMockOrSpy(received, "toHaveBeenCalled", expectedArgument, options);
  const receivedIsSpy = isSpy(received);
  const receivedName = receivedIsSpy ? "spy" : received.getMockName();
  const count = receivedIsSpy ? received.calls.count() : received.mock.calls.length;
  const calls = receivedIsSpy ? received.calls.all().map((x) => x.args) : received.mock.calls;
  const pass = count > 0;
  const message = pass ? () => (
    // eslint-disable-next-line prefer-template
    matcherHint(
      "toHaveBeenCalled",
      receivedName,
      expectedArgument,
      options
    ) + `

Expected number of calls: ${printExpected(0)}
Received number of calls: ${printReceived(count)}

` + calls.reduce((lines, args, i) => {
      if (lines.length < PRINT_LIMIT) {
        lines.push(`${i + 1}: ${printReceivedArgs(args)}`);
      }
      return lines;
    }, []).join("\n")
  ) : () => (
    // eslint-disable-next-line prefer-template
    matcherHint(
      "toHaveBeenCalled",
      receivedName,
      expectedArgument,
      options
    ) + `

Expected number of calls: >= ${printExpected(1)}
Received number of calls:    ${printReceived(count)}`
  );
  return { message, pass };
};
const createToHaveReturnedMatcher = () => function(received, expected) {
  const expectedArgument = "";
  const options = {
    isNot: this.isNot,
    promise: this.promise
  };
  ensureNoExpected(expected, "toHaveReturned", options);
  ensureMock(received, "toHaveReturned", expectedArgument, options);
  const receivedName = received.getMockName();
  const count = received.mock.results.reduce(
    (n, result) => result.type === "return" ? n + 1 : n,
    0
  );
  const pass = count > 0;
  const message = pass ? () => (
    // eslint-disable-next-line prefer-template
    matcherHint(
      "toHaveReturned",
      receivedName,
      expectedArgument,
      options
    ) + `

Expected number of returns: ${printExpected(0)}
Received number of returns: ${printReceived(count)}

` + received.mock.results.reduce((lines, result, i) => {
      if (result.type === "return" && lines.length < PRINT_LIMIT) {
        lines.push(`${i + 1}: ${printReceived(result.value)}`);
      }
      return lines;
    }, []).join("\n") + (received.mock.calls.length === count ? "" : `

Received number of calls:   ${printReceived(
      received.mock.calls.length
    )}`)
  ) : () => (
    // eslint-disable-next-line prefer-template
    matcherHint(
      "toHaveReturned",
      receivedName,
      expectedArgument,
      options
    ) + `

Expected number of returns: >= ${printExpected(1)}
Received number of returns:    ${printReceived(count)}` + (received.mock.calls.length === count ? "" : `
Received number of calls:      ${printReceived(
      received.mock.calls.length
    )}`)
  );
  return { message, pass };
};
const createToHaveBeenCalledTimesMatcher = () => function(received, expected) {
  const expectedArgument = "expected";
  const options = {
    isNot: this.isNot,
    promise: this.promise
  };
  ensureExpectedIsNonNegativeInteger(
    expected,
    "toHaveBeenCalledTimes",
    options
  );
  ensureMockOrSpy(
    received,
    "toHaveBeenCalledTimes",
    expectedArgument,
    options
  );
  const receivedIsSpy = isSpy(received);
  const receivedName = receivedIsSpy ? "spy" : received.getMockName();
  const count = receivedIsSpy ? received.calls.count() : received.mock.calls.length;
  const pass = count === expected;
  const message = pass ? () => (
    // eslint-disable-next-line prefer-template
    matcherHint(
      "toHaveBeenCalledTimes",
      receivedName,
      expectedArgument,
      options
    ) + `

Expected number of calls: not ${printExpected(expected)}`
  ) : () => (
    // eslint-disable-next-line prefer-template
    matcherHint(
      "toHaveBeenCalledTimes",
      receivedName,
      expectedArgument,
      options
    ) + `

Expected number of calls: ${printExpected(expected)}
Received number of calls: ${printReceived(count)}`
  );
  return { message, pass };
};
const createToHaveReturnedTimesMatcher = () => function(received, expected) {
  const expectedArgument = "expected";
  const options = {
    isNot: this.isNot,
    promise: this.promise
  };
  ensureExpectedIsNonNegativeInteger(
    expected,
    "toHaveReturnedTimes",
    options
  );
  ensureMock(received, "toHaveReturnedTimes", expectedArgument, options);
  const receivedName = received.getMockName();
  const count = received.mock.results.reduce(
    (n, result) => result.type === "return" ? n + 1 : n,
    0
  );
  const pass = count === expected;
  const message = pass ? () => (
    // eslint-disable-next-line prefer-template
    matcherHint(
      "toHaveReturnedTimes",
      receivedName,
      expectedArgument,
      options
    ) + `

Expected number of returns: not ${printExpected(expected)}` + (received.mock.calls.length === count ? "" : `

Received number of calls:       ${printReceived(
      received.mock.calls.length
    )}`)
  ) : () => (
    // eslint-disable-next-line prefer-template
    matcherHint(
      "toHaveReturnedTimes",
      receivedName,
      expectedArgument,
      options
    ) + `

Expected number of returns: ${printExpected(expected)}
Received number of returns: ${printReceived(count)}` + (received.mock.calls.length === count ? "" : `
Received number of calls:   ${printReceived(
      received.mock.calls.length
    )}`)
  );
  return { message, pass };
};
const createToHaveBeenCalledWithMatcher = () => function(received, ...expected) {
  const expectedArgument = "...expected";
  const options = {
    isNot: this.isNot,
    promise: this.promise
  };
  ensureMockOrSpy(
    received,
    "toHaveBeenCalledWith",
    expectedArgument,
    options
  );
  const receivedIsSpy = isSpy(received);
  const receivedName = receivedIsSpy ? "spy" : received.getMockName();
  const calls = receivedIsSpy ? received.calls.all().map((x) => x.args) : received.mock.calls;
  const pass = calls.some((call) => isEqualCall(expected, call));
  const message = pass ? () => {
    const indexedCalls = [];
    let i = 0;
    while (i < calls.length && indexedCalls.length < PRINT_LIMIT) {
      if (isEqualCall(expected, calls[i])) {
        indexedCalls.push([i, calls[i]]);
      }
      i += 1;
    }
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveBeenCalledWith",
        receivedName,
        expectedArgument,
        options
      ) + `

Expected: not ${printExpectedArgs(expected)}
` + (calls.length === 1 && stringify$1(calls[0]) === stringify$1(expected) ? "" : printReceivedCallsNegative(
        expected,
        indexedCalls,
        calls.length === 1
      )) + `
Number of calls: ${printReceived(calls.length)}`
    );
  } : () => {
    const indexedCalls = [];
    let i = 0;
    while (i < calls.length && indexedCalls.length < PRINT_LIMIT) {
      indexedCalls.push([i, calls[i]]);
      i += 1;
    }
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveBeenCalledWith",
        receivedName,
        expectedArgument,
        options
      ) + "\n\n" + printExpectedReceivedCallsPositive(
        expected,
        indexedCalls,
        isExpand(this.expand),
        calls.length === 1
      ) + `
Number of calls: ${printReceived(calls.length)}`
    );
  };
  return { message, pass };
};
const createToHaveReturnedWithMatcher = () => function(received, expected) {
  const expectedArgument = "expected";
  const options = {
    isNot: this.isNot,
    promise: this.promise
  };
  ensureMock(received, "toHaveReturnedWith", expectedArgument, options);
  const receivedName = received.getMockName();
  const { calls, results } = received.mock;
  const pass = results.some((result) => isEqualReturn(expected, result));
  const message = pass ? () => {
    const indexedResults = [];
    let i = 0;
    while (i < results.length && indexedResults.length < PRINT_LIMIT) {
      if (isEqualReturn(expected, results[i])) {
        indexedResults.push([i, results[i]]);
      }
      i += 1;
    }
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveReturnedWith",
        receivedName,
        expectedArgument,
        options
      ) + `

Expected: not ${printExpected(expected)}
` + (results.length === 1 && results[0].type === "return" && stringify$1(results[0].value) === stringify$1(expected) ? "" : printReceivedResults(
        "Received:     ",
        expected,
        indexedResults,
        results.length === 1
      )) + printNumberOfReturns(countReturns(results), calls.length)
    );
  } : () => {
    const indexedResults = [];
    let i = 0;
    while (i < results.length && indexedResults.length < PRINT_LIMIT) {
      indexedResults.push([i, results[i]]);
      i += 1;
    }
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveReturnedWith",
        receivedName,
        expectedArgument,
        options
      ) + `

Expected: ${printExpected(expected)}
` + printReceivedResults(
        "Received: ",
        expected,
        indexedResults,
        results.length === 1
      ) + printNumberOfReturns(countReturns(results), calls.length)
    );
  };
  return { message, pass };
};
const createToHaveBeenLastCalledWithMatcher = () => function(received, ...expected) {
  const expectedArgument = "...expected";
  const options = {
    isNot: this.isNot,
    promise: this.promise
  };
  ensureMockOrSpy(
    received,
    "toHaveBeenLastCalledWith",
    expectedArgument,
    options
  );
  const receivedIsSpy = isSpy(received);
  const receivedName = receivedIsSpy ? "spy" : received.getMockName();
  const calls = receivedIsSpy ? received.calls.all().map((x) => x.args) : received.mock.calls;
  const iLast = calls.length - 1;
  const pass = iLast >= 0 && isEqualCall(expected, calls[iLast]);
  const message = pass ? () => {
    const indexedCalls = [];
    if (iLast > 0) {
      indexedCalls.push([iLast - 1, calls[iLast - 1]]);
    }
    indexedCalls.push([iLast, calls[iLast]]);
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveBeenLastCalledWith",
        receivedName,
        expectedArgument,
        options
      ) + `

Expected: not ${printExpectedArgs(expected)}
` + (calls.length === 1 && stringify$1(calls[0]) === stringify$1(expected) ? "" : printReceivedCallsNegative(
        expected,
        indexedCalls,
        calls.length === 1,
        iLast
      )) + `
Number of calls: ${printReceived(calls.length)}`
    );
  } : () => {
    const indexedCalls = [];
    if (iLast >= 0) {
      if (iLast > 0) {
        let i = iLast - 1;
        while (i >= 0 && !isEqualCall(expected, calls[i])) {
          i -= 1;
        }
        if (i < 0) {
          i = iLast - 1;
        }
        indexedCalls.push([i, calls[i]]);
      }
      indexedCalls.push([iLast, calls[iLast]]);
    }
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveBeenLastCalledWith",
        receivedName,
        expectedArgument,
        options
      ) + "\n\n" + printExpectedReceivedCallsPositive(
        expected,
        indexedCalls,
        isExpand(this.expand),
        calls.length === 1,
        iLast
      ) + `
Number of calls: ${printReceived(calls.length)}`
    );
  };
  return { message, pass };
};
const createToHaveLastReturnedWithMatcher = () => function(received, expected) {
  const expectedArgument = "expected";
  const options = {
    isNot: this.isNot,
    promise: this.promise
  };
  ensureMock(received, "toHaveLastReturnedWith", expectedArgument, options);
  const receivedName = received.getMockName();
  const { calls, results } = received.mock;
  const iLast = results.length - 1;
  const pass = iLast >= 0 && isEqualReturn(expected, results[iLast]);
  const message = pass ? () => {
    const indexedResults = [];
    if (iLast > 0) {
      indexedResults.push([iLast - 1, results[iLast - 1]]);
    }
    indexedResults.push([iLast, results[iLast]]);
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveLastReturnedWith",
        receivedName,
        expectedArgument,
        options
      ) + `

Expected: not ${printExpected(expected)}
` + (results.length === 1 && results[0].type === "return" && stringify$1(results[0].value) === stringify$1(expected) ? "" : printReceivedResults(
        "Received:     ",
        expected,
        indexedResults,
        results.length === 1,
        iLast
      )) + printNumberOfReturns(countReturns(results), calls.length)
    );
  } : () => {
    const indexedResults = [];
    if (iLast >= 0) {
      if (iLast > 0) {
        let i = iLast - 1;
        while (i >= 0 && !isEqualReturn(expected, results[i])) {
          i -= 1;
        }
        if (i < 0) {
          i = iLast - 1;
        }
        indexedResults.push([i, results[i]]);
      }
      indexedResults.push([iLast, results[iLast]]);
    }
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveLastReturnedWith",
        receivedName,
        expectedArgument,
        options
      ) + `

Expected: ${printExpected(expected)}
` + printReceivedResults(
        "Received: ",
        expected,
        indexedResults,
        results.length === 1,
        iLast
      ) + printNumberOfReturns(countReturns(results), calls.length)
    );
  };
  return { message, pass };
};
const createToHaveBeenNthCalledWithMatcher = () => function(received, nth, ...expected) {
  const expectedArgument = "n";
  const options = {
    expectedColor: (arg) => arg,
    isNot: this.isNot,
    promise: this.promise,
    secondArgument: "...expected"
  };
  ensureMockOrSpy(
    received,
    "toHaveBeenNthCalledWith",
    expectedArgument,
    options
  );
  if (!Number.isSafeInteger(nth) || nth < 1) {
    throw new Error(
      matcherErrorMessage(
        matcherHint(
          "toHaveBeenNthCalledWith",
          void 0,
          expectedArgument,
          options
        ),
        `${expectedArgument} must be a positive integer`,
        printWithType(expectedArgument, nth, stringify$1)
      )
    );
  }
  const receivedIsSpy = isSpy(received);
  const receivedName = receivedIsSpy ? "spy" : received.getMockName();
  const calls = receivedIsSpy ? received.calls.all().map((x) => x.args) : received.mock.calls;
  const length = calls.length;
  const iNth = nth - 1;
  const pass = iNth < length && isEqualCall(expected, calls[iNth]);
  const message = pass ? () => {
    const indexedCalls = [];
    if (iNth - 1 >= 0) {
      indexedCalls.push([iNth - 1, calls[iNth - 1]]);
    }
    indexedCalls.push([iNth, calls[iNth]]);
    if (iNth + 1 < length) {
      indexedCalls.push([iNth + 1, calls[iNth + 1]]);
    }
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveBeenNthCalledWith",
        receivedName,
        expectedArgument,
        options
      ) + `

n: ${nth}
Expected: not ${printExpectedArgs(expected)}
` + (calls.length === 1 && stringify$1(calls[0]) === stringify$1(expected) ? "" : printReceivedCallsNegative(
        expected,
        indexedCalls,
        calls.length === 1,
        iNth
      )) + `
Number of calls: ${printReceived(calls.length)}`
    );
  } : () => {
    const indexedCalls = [];
    if (iNth < length) {
      if (iNth - 1 >= 0) {
        let i = iNth - 1;
        while (i >= 0 && !isEqualCall(expected, calls[i])) {
          i -= 1;
        }
        if (i < 0) {
          i = iNth - 1;
        }
        indexedCalls.push([i, calls[i]]);
      }
      indexedCalls.push([iNth, calls[iNth]]);
      if (iNth + 1 < length) {
        let i = iNth + 1;
        while (i < length && !isEqualCall(expected, calls[i])) {
          i += 1;
        }
        if (i >= length) {
          i = iNth + 1;
        }
        indexedCalls.push([i, calls[i]]);
      }
    } else if (length > 0) {
      let i = length - 1;
      while (i >= 0 && !isEqualCall(expected, calls[i])) {
        i -= 1;
      }
      if (i < 0) {
        i = length - 1;
      }
      indexedCalls.push([i, calls[i]]);
    }
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveBeenNthCalledWith",
        receivedName,
        expectedArgument,
        options
      ) + `

n: ${nth}
` + printExpectedReceivedCallsPositive(
        expected,
        indexedCalls,
        isExpand(this.expand),
        calls.length === 1,
        iNth
      ) + `
Number of calls: ${printReceived(calls.length)}`
    );
  };
  return { message, pass };
};
const createToHaveNthReturnedWithMatcher = () => function(received, nth, expected) {
  const expectedArgument = "n";
  const options = {
    expectedColor: (arg) => arg,
    isNot: this.isNot,
    promise: this.promise,
    secondArgument: "expected"
  };
  ensureMock(received, "toHaveNthReturnedWith", expectedArgument, options);
  if (!Number.isSafeInteger(nth) || nth < 1) {
    throw new Error(
      matcherErrorMessage(
        matcherHint(
          "toHaveNthReturnedWith",
          void 0,
          expectedArgument,
          options
        ),
        `${expectedArgument} must be a positive integer`,
        printWithType(expectedArgument, nth, stringify$1)
      )
    );
  }
  const receivedName = received.getMockName();
  const { calls, results } = received.mock;
  const length = results.length;
  const iNth = nth - 1;
  const pass = iNth < length && isEqualReturn(expected, results[iNth]);
  const message = pass ? () => {
    const indexedResults = [];
    if (iNth - 1 >= 0) {
      indexedResults.push([iNth - 1, results[iNth - 1]]);
    }
    indexedResults.push([iNth, results[iNth]]);
    if (iNth + 1 < length) {
      indexedResults.push([iNth + 1, results[iNth + 1]]);
    }
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveNthReturnedWith",
        receivedName,
        expectedArgument,
        options
      ) + `

n: ${nth}
Expected: not ${printExpected(expected)}
` + (results.length === 1 && results[0].type === "return" && stringify$1(results[0].value) === stringify$1(expected) ? "" : printReceivedResults(
        "Received:     ",
        expected,
        indexedResults,
        results.length === 1,
        iNth
      )) + printNumberOfReturns(countReturns(results), calls.length)
    );
  } : () => {
    const indexedResults = [];
    if (iNth < length) {
      if (iNth - 1 >= 0) {
        let i = iNth - 1;
        while (i >= 0 && !isEqualReturn(expected, results[i])) {
          i -= 1;
        }
        if (i < 0) {
          i = iNth - 1;
        }
        indexedResults.push([i, results[i]]);
      }
      indexedResults.push([iNth, results[iNth]]);
      if (iNth + 1 < length) {
        let i = iNth + 1;
        while (i < length && !isEqualReturn(expected, results[i])) {
          i += 1;
        }
        if (i >= length) {
          i = iNth + 1;
        }
        indexedResults.push([i, results[i]]);
      }
    } else if (length > 0) {
      let i = length - 1;
      while (i >= 0 && !isEqualReturn(expected, results[i])) {
        i -= 1;
      }
      if (i < 0) {
        i = length - 1;
      }
      indexedResults.push([i, results[i]]);
    }
    return (
      // eslint-disable-next-line prefer-template
      matcherHint(
        "toHaveNthReturnedWith",
        receivedName,
        expectedArgument,
        options
      ) + `

n: ${nth}
Expected: ${printExpected(expected)}
` + printReceivedResults(
        "Received: ",
        expected,
        indexedResults,
        results.length === 1,
        iNth
      ) + printNumberOfReturns(countReturns(results), calls.length)
    );
  };
  return { message, pass };
};
const spyMatchers = {
  toHaveBeenCalled: createToHaveBeenCalledMatcher(),
  toHaveBeenCalledTimes: createToHaveBeenCalledTimesMatcher(),
  toHaveBeenCalledWith: createToHaveBeenCalledWithMatcher(),
  toHaveBeenLastCalledWith: createToHaveBeenLastCalledWithMatcher(),
  toHaveBeenNthCalledWith: createToHaveBeenNthCalledWithMatcher(),
  toHaveLastReturnedWith: createToHaveLastReturnedWithMatcher(),
  toHaveNthReturnedWith: createToHaveNthReturnedWithMatcher(),
  toHaveReturned: createToHaveReturnedMatcher(),
  toHaveReturnedTimes: createToHaveReturnedTimesMatcher(),
  toHaveReturnedWith: createToHaveReturnedWithMatcher()
};
const isMock = (received) => received != null && received._isMockFunction === true;
const isSpy = (received) => received != null && received.calls != null && typeof received.calls.all === "function" && typeof received.calls.count === "function";
const ensureMockOrSpy = (received, matcherName, expectedArgument, options) => {
  if (!isMock(received) && !isSpy(received)) {
    throw new Error(
      matcherErrorMessage(
        matcherHint(matcherName, void 0, expectedArgument, options),
        `${RECEIVED_COLOR("received")} value must be a mock or spy function`,
        printWithType("Received", received, printReceived)
      )
    );
  }
};
const ensureMock = (received, matcherName, expectedArgument, options) => {
  if (!isMock(received)) {
    throw new Error(
      matcherErrorMessage(
        matcherHint(matcherName, void 0, expectedArgument, options),
        `${RECEIVED_COLOR("received")} value must be a mock function`,
        printWithType("Received", received, printReceived)
      )
    );
  }
};

var lib$1 = {};

var picocolors_browser = {exports: {}};

var hasRequiredPicocolors_browser;

function requirePicocolors_browser () {
	if (hasRequiredPicocolors_browser) return picocolors_browser.exports;
	hasRequiredPicocolors_browser = 1;
	var x=String;
	var create=function() {return {isColorSupported:false,reset:x,bold:x,dim:x,italic:x,underline:x,inverse:x,hidden:x,strikethrough:x,black:x,red:x,green:x,yellow:x,blue:x,magenta:x,cyan:x,white:x,gray:x,bgBlack:x,bgRed:x,bgGreen:x,bgYellow:x,bgBlue:x,bgMagenta:x,bgCyan:x,bgWhite:x,blackBright:x,redBright:x,greenBright:x,yellowBright:x,blueBright:x,magentaBright:x,cyanBright:x,whiteBright:x,bgBlackBright:x,bgRedBright:x,bgGreenBright:x,bgYellowBright:x,bgBlueBright:x,bgMagentaBright:x,bgCyanBright:x,bgWhiteBright:x}};
	picocolors_browser.exports=create();
	picocolors_browser.exports.createColors = create;
	return picocolors_browser.exports;
}

var jsTokens = {};

var hasRequiredJsTokens;

function requireJsTokens () {
	if (hasRequiredJsTokens) return jsTokens;
	hasRequiredJsTokens = 1;
	// Copyright 2014, 2015, 2016, 2017, 2018 Simon Lydell
	// License: MIT. (See LICENSE.)

	Object.defineProperty(jsTokens, "__esModule", {
	  value: true
	});

	// This regex comes from regex.coffee, and is inserted here by generate-index.js
	// (run `npm run build`).
	jsTokens.default = /((['"])(?:(?!\2|\\).|\\(?:\r\n|[\s\S]))*(\2)?|`(?:[^`\\$]|\\[\s\S]|\$(?!\{)|\$\{(?:[^{}]|\{[^}]*\}?)*\}?)*(`)?)|(\/\/.*)|(\/\*(?:[^*]|\*(?!\/))*(\*\/)?)|(\/(?!\*)(?:\[(?:(?![\]\\]).|\\.)*\]|(?![\/\]\\]).|\\.)+\/(?:(?!\s*(?:\b|[\u0080-\uFFFF$\\'"~({]|[+\-!](?!=)|\.?\d))|[gmiyus]{1,6}\b(?![\u0080-\uFFFF$\\]|\s*(?:[+\-*%&|^<>!=?({]|\/(?![\/*])))))|(0[xX][\da-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)|((?!\d)(?:(?!\s)[$\w\u0080-\uFFFF]|\\u[\da-fA-F]{4}|\\u\{[\da-fA-F]+\})+)|(--|\+\+|&&|\|\||=>|\.{3}|(?:[+\-\/%&|^]|\*{1,2}|<{1,2}|>{1,3}|!=?|={1,2})=?|[?~.,:;[\](){}])|(\s+)|(^$|[\s\S])/g;

	jsTokens.matchToToken = function(match) {
	  var token = {type: "invalid", value: match[0], closed: undefined};
	       if (match[ 1]) token.type = "string" , token.closed = !!(match[3] || match[4]);
	  else if (match[ 5]) token.type = "comment";
	  else if (match[ 6]) token.type = "comment", token.closed = !!match[7];
	  else if (match[ 8]) token.type = "regex";
	  else if (match[ 9]) token.type = "number";
	  else if (match[10]) token.type = "name";
	  else if (match[11]) token.type = "punctuator";
	  else if (match[12]) token.type = "whitespace";
	  return token
	};
	return jsTokens;
}

var lib = {};

var identifier = {};

var hasRequiredIdentifier;

function requireIdentifier () {
	if (hasRequiredIdentifier) return identifier;
	hasRequiredIdentifier = 1;

	Object.defineProperty(identifier, "__esModule", {
	  value: true
	});
	identifier.isIdentifierChar = isIdentifierChar;
	identifier.isIdentifierName = isIdentifierName;
	identifier.isIdentifierStart = isIdentifierStart;
	let nonASCIIidentifierStartChars = "\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u037f\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u052f\u0531-\u0556\u0559\u0560-\u0588\u05d0-\u05ea\u05ef-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u0860-\u086a\u0870-\u0887\u0889-\u088f\u08a0-\u08c9\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u09fc\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0af9\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c39\u0c3d\u0c58-\u0c5a\u0c5c\u0c5d\u0c60\u0c61\u0c80\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cdc-\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d04-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d54-\u0d56\u0d5f-\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e86-\u0e8a\u0e8c-\u0ea3\u0ea5\u0ea7-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f5\u13f8-\u13fd\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f8\u1700-\u1711\u171f-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1878\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191e\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19b0-\u19c9\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4c\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1c80-\u1c8a\u1c90-\u1cba\u1cbd-\u1cbf\u1ce9-\u1cec\u1cee-\u1cf3\u1cf5\u1cf6\u1cfa\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2118-\u211d\u2124\u2126\u2128\u212a-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309b-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312f\u3131-\u318e\u31a0-\u31bf\u31f0-\u31ff\u3400-\u4dbf\u4e00-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua69d\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua7dc\ua7f1-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua8fd\ua8fe\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\ua9e0-\ua9e4\ua9e6-\ua9ef\ua9fa-\ua9fe\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa7e-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uab30-\uab5a\uab5c-\uab69\uab70-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc";
	let nonASCIIidentifierChars = "\xb7\u0300-\u036f\u0387\u0483-\u0487\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u0669\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7\u06e8\u06ea-\u06ed\u06f0-\u06f9\u0711\u0730-\u074a\u07a6-\u07b0\u07c0-\u07c9\u07eb-\u07f3\u07fd\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0859-\u085b\u0897-\u089f\u08ca-\u08e1\u08e3-\u0903\u093a-\u093c\u093e-\u094f\u0951-\u0957\u0962\u0963\u0966-\u096f\u0981-\u0983\u09bc\u09be-\u09c4\u09c7\u09c8\u09cb-\u09cd\u09d7\u09e2\u09e3\u09e6-\u09ef\u09fe\u0a01-\u0a03\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a66-\u0a71\u0a75\u0a81-\u0a83\u0abc\u0abe-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ae2\u0ae3\u0ae6-\u0aef\u0afa-\u0aff\u0b01-\u0b03\u0b3c\u0b3e-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b55-\u0b57\u0b62\u0b63\u0b66-\u0b6f\u0b82\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd7\u0be6-\u0bef\u0c00-\u0c04\u0c3c\u0c3e-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0c66-\u0c6f\u0c81-\u0c83\u0cbc\u0cbe-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0ce6-\u0cef\u0cf3\u0d00-\u0d03\u0d3b\u0d3c\u0d3e-\u0d44\u0d46-\u0d48\u0d4a-\u0d4d\u0d57\u0d62\u0d63\u0d66-\u0d6f\u0d81-\u0d83\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0de6-\u0def\u0df2\u0df3\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0e50-\u0e59\u0eb1\u0eb4-\u0ebc\u0ec8-\u0ece\u0ed0-\u0ed9\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e\u0f3f\u0f71-\u0f84\u0f86\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\u102b-\u103e\u1040-\u1049\u1056-\u1059\u105e-\u1060\u1062-\u1064\u1067-\u106d\u1071-\u1074\u1082-\u108d\u108f-\u109d\u135d-\u135f\u1369-\u1371\u1712-\u1715\u1732-\u1734\u1752\u1753\u1772\u1773\u17b4-\u17d3\u17dd\u17e0-\u17e9\u180b-\u180d\u180f-\u1819\u18a9\u1920-\u192b\u1930-\u193b\u1946-\u194f\u19d0-\u19da\u1a17-\u1a1b\u1a55-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1ab0-\u1abd\u1abf-\u1add\u1ae0-\u1aeb\u1b00-\u1b04\u1b34-\u1b44\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1b82\u1ba1-\u1bad\u1bb0-\u1bb9\u1be6-\u1bf3\u1c24-\u1c37\u1c40-\u1c49\u1c50-\u1c59\u1cd0-\u1cd2\u1cd4-\u1ce8\u1ced\u1cf4\u1cf7-\u1cf9\u1dc0-\u1dff\u200c\u200d\u203f\u2040\u2054\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2cef-\u2cf1\u2d7f\u2de0-\u2dff\u302a-\u302f\u3099\u309a\u30fb\ua620-\ua629\ua66f\ua674-\ua67d\ua69e\ua69f\ua6f0\ua6f1\ua802\ua806\ua80b\ua823-\ua827\ua82c\ua880\ua881\ua8b4-\ua8c5\ua8d0-\ua8d9\ua8e0-\ua8f1\ua8ff-\ua909\ua926-\ua92d\ua947-\ua953\ua980-\ua983\ua9b3-\ua9c0\ua9d0-\ua9d9\ua9e5\ua9f0-\ua9f9\uaa29-\uaa36\uaa43\uaa4c\uaa4d\uaa50-\uaa59\uaa7b-\uaa7d\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uaaeb-\uaaef\uaaf5\uaaf6\uabe3-\uabea\uabec\uabed\uabf0-\uabf9\ufb1e\ufe00-\ufe0f\ufe20-\ufe2f\ufe33\ufe34\ufe4d-\ufe4f\uff10-\uff19\uff3f\uff65";
	const nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
	const nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");
	nonASCIIidentifierStartChars = nonASCIIidentifierChars = null;
	const astralIdentifierStartCodes = [0, 11, 2, 25, 2, 18, 2, 1, 2, 14, 3, 13, 35, 122, 70, 52, 268, 28, 4, 48, 48, 31, 14, 29, 6, 37, 11, 29, 3, 35, 5, 7, 2, 4, 43, 157, 19, 35, 5, 35, 5, 39, 9, 51, 13, 10, 2, 14, 2, 6, 2, 1, 2, 10, 2, 14, 2, 6, 2, 1, 4, 51, 13, 310, 10, 21, 11, 7, 25, 5, 2, 41, 2, 8, 70, 5, 3, 0, 2, 43, 2, 1, 4, 0, 3, 22, 11, 22, 10, 30, 66, 18, 2, 1, 11, 21, 11, 25, 7, 25, 39, 55, 7, 1, 65, 0, 16, 3, 2, 2, 2, 28, 43, 28, 4, 28, 36, 7, 2, 27, 28, 53, 11, 21, 11, 18, 14, 17, 111, 72, 56, 50, 14, 50, 14, 35, 39, 27, 10, 22, 251, 41, 7, 1, 17, 5, 57, 28, 11, 0, 9, 21, 43, 17, 47, 20, 28, 22, 13, 52, 58, 1, 3, 0, 14, 44, 33, 24, 27, 35, 30, 0, 3, 0, 9, 34, 4, 0, 13, 47, 15, 3, 22, 0, 2, 0, 36, 17, 2, 24, 20, 1, 64, 6, 2, 0, 2, 3, 2, 14, 2, 9, 8, 46, 39, 7, 3, 1, 3, 21, 2, 6, 2, 1, 2, 4, 4, 0, 19, 0, 13, 4, 31, 9, 2, 0, 3, 0, 2, 37, 2, 0, 26, 0, 2, 0, 45, 52, 19, 3, 21, 2, 31, 47, 21, 1, 2, 0, 185, 46, 42, 3, 37, 47, 21, 0, 60, 42, 14, 0, 72, 26, 38, 6, 186, 43, 117, 63, 32, 7, 3, 0, 3, 7, 2, 1, 2, 23, 16, 0, 2, 0, 95, 7, 3, 38, 17, 0, 2, 0, 29, 0, 11, 39, 8, 0, 22, 0, 12, 45, 20, 0, 19, 72, 200, 32, 32, 8, 2, 36, 18, 0, 50, 29, 113, 6, 2, 1, 2, 37, 22, 0, 26, 5, 2, 1, 2, 31, 15, 0, 24, 43, 261, 18, 16, 0, 2, 12, 2, 33, 125, 0, 80, 921, 103, 110, 18, 195, 2637, 96, 16, 1071, 18, 5, 26, 3994, 6, 582, 6842, 29, 1763, 568, 8, 30, 18, 78, 18, 29, 19, 47, 17, 3, 32, 20, 6, 18, 433, 44, 212, 63, 33, 24, 3, 24, 45, 74, 6, 0, 67, 12, 65, 1, 2, 0, 15, 4, 10, 7381, 42, 31, 98, 114, 8702, 3, 2, 6, 2, 1, 2, 290, 16, 0, 30, 2, 3, 0, 15, 3, 9, 395, 2309, 106, 6, 12, 4, 8, 8, 9, 5991, 84, 2, 70, 2, 1, 3, 0, 3, 1, 3, 3, 2, 11, 2, 0, 2, 6, 2, 64, 2, 3, 3, 7, 2, 6, 2, 27, 2, 3, 2, 4, 2, 0, 4, 6, 2, 339, 3, 24, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 7, 1845, 30, 7, 5, 262, 61, 147, 44, 11, 6, 17, 0, 322, 29, 19, 43, 485, 27, 229, 29, 3, 0, 208, 30, 2, 2, 2, 1, 2, 6, 3, 4, 10, 1, 225, 6, 2, 3, 2, 1, 2, 14, 2, 196, 60, 67, 8, 0, 1205, 3, 2, 26, 2, 1, 2, 0, 3, 0, 2, 9, 2, 3, 2, 0, 2, 0, 7, 0, 5, 0, 2, 0, 2, 0, 2, 2, 2, 1, 2, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 1, 2, 0, 3, 3, 2, 6, 2, 3, 2, 3, 2, 0, 2, 9, 2, 16, 6, 2, 2, 4, 2, 16, 4421, 42719, 33, 4381, 3, 5773, 3, 7472, 16, 621, 2467, 541, 1507, 4938, 6, 8489];
	const astralIdentifierCodes = [509, 0, 227, 0, 150, 4, 294, 9, 1368, 2, 2, 1, 6, 3, 41, 2, 5, 0, 166, 1, 574, 3, 9, 9, 7, 9, 32, 4, 318, 1, 78, 5, 71, 10, 50, 3, 123, 2, 54, 14, 32, 10, 3, 1, 11, 3, 46, 10, 8, 0, 46, 9, 7, 2, 37, 13, 2, 9, 6, 1, 45, 0, 13, 2, 49, 13, 9, 3, 2, 11, 83, 11, 7, 0, 3, 0, 158, 11, 6, 9, 7, 3, 56, 1, 2, 6, 3, 1, 3, 2, 10, 0, 11, 1, 3, 6, 4, 4, 68, 8, 2, 0, 3, 0, 2, 3, 2, 4, 2, 0, 15, 1, 83, 17, 10, 9, 5, 0, 82, 19, 13, 9, 214, 6, 3, 8, 28, 1, 83, 16, 16, 9, 82, 12, 9, 9, 7, 19, 58, 14, 5, 9, 243, 14, 166, 9, 71, 5, 2, 1, 3, 3, 2, 0, 2, 1, 13, 9, 120, 6, 3, 6, 4, 0, 29, 9, 41, 6, 2, 3, 9, 0, 10, 10, 47, 15, 199, 7, 137, 9, 54, 7, 2, 7, 17, 9, 57, 21, 2, 13, 123, 5, 4, 0, 2, 1, 2, 6, 2, 0, 9, 9, 49, 4, 2, 1, 2, 4, 9, 9, 55, 9, 266, 3, 10, 1, 2, 0, 49, 6, 4, 4, 14, 10, 5350, 0, 7, 14, 11465, 27, 2343, 9, 87, 9, 39, 4, 60, 6, 26, 9, 535, 9, 470, 0, 2, 54, 8, 3, 82, 0, 12, 1, 19628, 1, 4178, 9, 519, 45, 3, 22, 543, 4, 4, 5, 9, 7, 3, 6, 31, 3, 149, 2, 1418, 49, 513, 54, 5, 49, 9, 0, 15, 0, 23, 4, 2, 14, 1361, 6, 2, 16, 3, 6, 2, 1, 2, 4, 101, 0, 161, 6, 10, 9, 357, 0, 62, 13, 499, 13, 245, 1, 2, 9, 233, 0, 3, 0, 8, 1, 6, 0, 475, 6, 110, 6, 6, 9, 4759, 9, 787719, 239];
	function isInAstralSet(code, set) {
	  let pos = 0x10000;
	  for (let i = 0, length = set.length; i < length; i += 2) {
	    pos += set[i];
	    if (pos > code) return false;
	    pos += set[i + 1];
	    if (pos >= code) return true;
	  }
	  return false;
	}
	function isIdentifierStart(code) {
	  if (code < 65) return code === 36;
	  if (code <= 90) return true;
	  if (code < 97) return code === 95;
	  if (code <= 122) return true;
	  if (code <= 0xffff) {
	    return code >= 0xaa && nonASCIIidentifierStart.test(String.fromCharCode(code));
	  }
	  return isInAstralSet(code, astralIdentifierStartCodes);
	}
	function isIdentifierChar(code) {
	  if (code < 48) return code === 36;
	  if (code < 58) return true;
	  if (code < 65) return false;
	  if (code <= 90) return true;
	  if (code < 97) return code === 95;
	  if (code <= 122) return true;
	  if (code <= 0xffff) {
	    return code >= 0xaa && nonASCIIidentifier.test(String.fromCharCode(code));
	  }
	  return isInAstralSet(code, astralIdentifierStartCodes) || isInAstralSet(code, astralIdentifierCodes);
	}
	function isIdentifierName(name) {
	  let isFirst = true;
	  for (let i = 0; i < name.length; i++) {
	    let cp = name.charCodeAt(i);
	    if ((cp & 0xfc00) === 0xd800 && i + 1 < name.length) {
	      const trail = name.charCodeAt(++i);
	      if ((trail & 0xfc00) === 0xdc00) {
	        cp = 0x10000 + ((cp & 0x3ff) << 10) + (trail & 0x3ff);
	      }
	    }
	    if (isFirst) {
	      isFirst = false;
	      if (!isIdentifierStart(cp)) {
	        return false;
	      }
	    } else if (!isIdentifierChar(cp)) {
	      return false;
	    }
	  }
	  return !isFirst;
	}

	
	return identifier;
}

var keyword = {};

var hasRequiredKeyword;

function requireKeyword () {
	if (hasRequiredKeyword) return keyword;
	hasRequiredKeyword = 1;

	Object.defineProperty(keyword, "__esModule", {
	  value: true
	});
	keyword.isKeyword = isKeyword;
	keyword.isReservedWord = isReservedWord;
	keyword.isStrictBindOnlyReservedWord = isStrictBindOnlyReservedWord;
	keyword.isStrictBindReservedWord = isStrictBindReservedWord;
	keyword.isStrictReservedWord = isStrictReservedWord;
	const reservedWords = {
	  keyword: ["break", "case", "catch", "continue", "debugger", "default", "do", "else", "finally", "for", "function", "if", "return", "switch", "throw", "try", "var", "const", "while", "with", "new", "this", "super", "class", "extends", "export", "import", "null", "true", "false", "in", "instanceof", "typeof", "void", "delete"],
	  strict: ["implements", "interface", "let", "package", "private", "protected", "public", "static", "yield"],
	  strictBind: ["eval", "arguments"]
	};
	const keywords = new Set(reservedWords.keyword);
	const reservedWordsStrictSet = new Set(reservedWords.strict);
	const reservedWordsStrictBindSet = new Set(reservedWords.strictBind);
	function isReservedWord(word, inModule) {
	  return inModule && word === "await" || word === "enum";
	}
	function isStrictReservedWord(word, inModule) {
	  return isReservedWord(word, inModule) || reservedWordsStrictSet.has(word);
	}
	function isStrictBindOnlyReservedWord(word) {
	  return reservedWordsStrictBindSet.has(word);
	}
	function isStrictBindReservedWord(word, inModule) {
	  return isStrictReservedWord(word, inModule) || isStrictBindOnlyReservedWord(word);
	}
	function isKeyword(word) {
	  return keywords.has(word);
	}

	
	return keyword;
}

var hasRequiredLib$1;

function requireLib$1 () {
	if (hasRequiredLib$1) return lib;
	hasRequiredLib$1 = 1;
	(function (exports) {

		Object.defineProperty(exports, "__esModule", {
		  value: true
		});
		Object.defineProperty(exports, "isIdentifierChar", {
		  enumerable: true,
		  get: function () {
		    return _identifier.isIdentifierChar;
		  }
		});
		Object.defineProperty(exports, "isIdentifierName", {
		  enumerable: true,
		  get: function () {
		    return _identifier.isIdentifierName;
		  }
		});
		Object.defineProperty(exports, "isIdentifierStart", {
		  enumerable: true,
		  get: function () {
		    return _identifier.isIdentifierStart;
		  }
		});
		Object.defineProperty(exports, "isKeyword", {
		  enumerable: true,
		  get: function () {
		    return _keyword.isKeyword;
		  }
		});
		Object.defineProperty(exports, "isReservedWord", {
		  enumerable: true,
		  get: function () {
		    return _keyword.isReservedWord;
		  }
		});
		Object.defineProperty(exports, "isStrictBindOnlyReservedWord", {
		  enumerable: true,
		  get: function () {
		    return _keyword.isStrictBindOnlyReservedWord;
		  }
		});
		Object.defineProperty(exports, "isStrictBindReservedWord", {
		  enumerable: true,
		  get: function () {
		    return _keyword.isStrictBindReservedWord;
		  }
		});
		Object.defineProperty(exports, "isStrictReservedWord", {
		  enumerable: true,
		  get: function () {
		    return _keyword.isStrictReservedWord;
		  }
		});
		var _identifier = requireIdentifier();
		var _keyword = requireKeyword();

		
	} (lib));
	return lib;
}

var hasRequiredLib;

function requireLib () {
	if (hasRequiredLib) return lib$1;
	hasRequiredLib = 1;

	Object.defineProperty(lib$1, '__esModule', { value: true });

	var picocolors = /*@__PURE__*/ requirePicocolors_browser();
	var jsTokens = requireJsTokens();
	var helperValidatorIdentifier = requireLib$1();

	function isColorSupported() {
	  return (typeof process === "object" && (process.env.FORCE_COLOR === "0" || process.env.FORCE_COLOR === "false") ? false : picocolors.isColorSupported
	  );
	}
	const compose = (f, g) => v => f(g(v));
	function buildDefs(colors) {
	  return {
	    keyword: colors.cyan,
	    capitalized: colors.yellow,
	    jsxIdentifier: colors.yellow,
	    punctuator: colors.yellow,
	    number: colors.magenta,
	    string: colors.green,
	    regex: colors.magenta,
	    comment: colors.gray,
	    invalid: compose(compose(colors.white, colors.bgRed), colors.bold),
	    gutter: colors.gray,
	    marker: compose(colors.red, colors.bold),
	    message: compose(colors.red, colors.bold),
	    reset: colors.reset
	  };
	}
	const defsOn = buildDefs(picocolors.createColors(true));
	const defsOff = buildDefs(picocolors.createColors(false));
	function getDefs(enabled) {
	  return enabled ? defsOn : defsOff;
	}

	const sometimesKeywords = new Set(["as", "async", "from", "get", "of", "set"]);
	const NEWLINE$1 = /\r\n|[\n\r\u2028\u2029]/;
	const BRACKET = /^[()[\]{}]$/;
	let tokenize;
	{
	  const JSX_TAG = /^[a-z][\w-]*$/i;
	  const getTokenType = function (token, offset, text) {
	    if (token.type === "name") {
	      if (helperValidatorIdentifier.isKeyword(token.value) || helperValidatorIdentifier.isStrictReservedWord(token.value, true) || sometimesKeywords.has(token.value)) {
	        return "keyword";
	      }
	      if (JSX_TAG.test(token.value) && (text[offset - 1] === "<" || text.slice(offset - 2, offset) === "</")) {
	        return "jsxIdentifier";
	      }
	      if (token.value[0] !== token.value[0].toLowerCase()) {
	        return "capitalized";
	      }
	    }
	    if (token.type === "punctuator" && BRACKET.test(token.value)) {
	      return "bracket";
	    }
	    if (token.type === "invalid" && (token.value === "@" || token.value === "#")) {
	      return "punctuator";
	    }
	    return token.type;
	  };
	  tokenize = function* (text) {
	    let match;
	    while (match = jsTokens.default.exec(text)) {
	      const token = jsTokens.matchToToken(match);
	      yield {
	        type: getTokenType(token, match.index, text),
	        value: token.value
	      };
	    }
	  };
	}
	function highlight(text) {
	  if (text === "") return "";
	  const defs = getDefs(true);
	  let highlighted = "";
	  for (const {
	    type,
	    value
	  } of tokenize(text)) {
	    if (type in defs) {
	      highlighted += value.split(NEWLINE$1).map(str => defs[type](str)).join("\n");
	    } else {
	      highlighted += value;
	    }
	  }
	  return highlighted;
	}

	let deprecationWarningShown = false;
	const NEWLINE = /\r\n|[\n\r\u2028\u2029]/;
	function getMarkerLines(loc, source, opts) {
	  const startLoc = Object.assign({
	    column: 0,
	    line: -1
	  }, loc.start);
	  const endLoc = Object.assign({}, startLoc, loc.end);
	  const {
	    linesAbove = 2,
	    linesBelow = 3
	  } = opts || {};
	  const startLine = startLoc.line;
	  const startColumn = startLoc.column;
	  const endLine = endLoc.line;
	  const endColumn = endLoc.column;
	  let start = Math.max(startLine - (linesAbove + 1), 0);
	  let end = Math.min(source.length, endLine + linesBelow);
	  if (startLine === -1) {
	    start = 0;
	  }
	  if (endLine === -1) {
	    end = source.length;
	  }
	  const lineDiff = endLine - startLine;
	  const markerLines = {};
	  if (lineDiff) {
	    for (let i = 0; i <= lineDiff; i++) {
	      const lineNumber = i + startLine;
	      if (!startColumn) {
	        markerLines[lineNumber] = true;
	      } else if (i === 0) {
	        const sourceLength = source[lineNumber - 1].length;
	        markerLines[lineNumber] = [startColumn, sourceLength - startColumn + 1];
	      } else if (i === lineDiff) {
	        markerLines[lineNumber] = [0, endColumn];
	      } else {
	        const sourceLength = source[lineNumber - i].length;
	        markerLines[lineNumber] = [0, sourceLength];
	      }
	    }
	  } else {
	    if (startColumn === endColumn) {
	      if (startColumn) {
	        markerLines[startLine] = [startColumn, 0];
	      } else {
	        markerLines[startLine] = true;
	      }
	    } else {
	      markerLines[startLine] = [startColumn, endColumn - startColumn];
	    }
	  }
	  return {
	    start,
	    end,
	    markerLines
	  };
	}
	function codeFrameColumns(rawLines, loc, opts = {}) {
	  const shouldHighlight = opts.forceColor || isColorSupported() && opts.highlightCode;
	  const defs = getDefs(shouldHighlight);
	  const lines = rawLines.split(NEWLINE);
	  const {
	    start,
	    end,
	    markerLines
	  } = getMarkerLines(loc, lines, opts);
	  const hasColumns = loc.start && typeof loc.start.column === "number";
	  const numberMaxWidth = String(end).length;
	  const highlightedLines = shouldHighlight ? highlight(rawLines) : rawLines;
	  let frame = highlightedLines.split(NEWLINE, end).slice(start, end).map((line, index) => {
	    const number = start + 1 + index;
	    const paddedNumber = ` ${number}`.slice(-numberMaxWidth);
	    const gutter = ` ${paddedNumber} |`;
	    const hasMarker = markerLines[number];
	    const lastMarkerLine = !markerLines[number + 1];
	    if (hasMarker) {
	      let markerLine = "";
	      if (Array.isArray(hasMarker)) {
	        const markerSpacing = line.slice(0, Math.max(hasMarker[0] - 1, 0)).replace(/[^\t]/g, " ");
	        const numberOfMarkers = hasMarker[1] || 1;
	        markerLine = ["\n ", defs.gutter(gutter.replace(/\d/g, " ")), " ", markerSpacing, defs.marker("^").repeat(numberOfMarkers)].join("");
	        if (lastMarkerLine && opts.message) {
	          markerLine += " " + defs.message(opts.message);
	        }
	      }
	      return [defs.marker(">"), defs.gutter(gutter), line.length > 0 ? ` ${line}` : "", markerLine].join("");
	    } else {
	      return ` ${defs.gutter(gutter)}${line.length > 0 ? ` ${line}` : ""}`;
	    }
	  }).join("\n");
	  if (opts.message && !hasColumns) {
	    frame = `${" ".repeat(numberMaxWidth + 1)}${opts.message}\n${frame}`;
	  }
	  if (shouldHighlight) {
	    return defs.reset(frame);
	  } else {
	    return frame;
	  }
	}
	function index (rawLines, lineNumber, colNumber, opts = {}) {
	  if (!deprecationWarningShown) {
	    deprecationWarningShown = true;
	    const message = "Passing lineNumber and colNumber is deprecated to @babel/code-frame. Please use `codeFrameColumns`.";
	    if (process.emitWarning) {
	      process.emitWarning(message, "DeprecationWarning");
	    } else {
	      const deprecationError = new Error(message);
	      deprecationError.name = "DeprecationWarning";
	      console.warn(new Error(message));
	    }
	  }
	  colNumber = Math.max(colNumber, 0);
	  const location = {
	    start: {
	      column: colNumber,
	      line: lineNumber
	    }
	  };
	  return codeFrameColumns(rawLines, location, opts);
	}

	lib$1.codeFrameColumns = codeFrameColumns;
	lib$1.default = index;
	lib$1.highlight = highlight;
	
	return lib$1;
}

var libExports = requireLib();

var utils = {};

var hasRequiredUtils;

function requireUtils () {
	if (hasRequiredUtils) return utils;
	hasRequiredUtils = 1;
	(function (exports) {

		exports.isInteger = num => {
		  if (typeof num === 'number') {
		    return Number.isInteger(num);
		  }
		  if (typeof num === 'string' && num.trim() !== '') {
		    return Number.isInteger(Number(num));
		  }
		  return false;
		};

		/**
		 * Find a node of the given type
		 */

		exports.find = (node, type) => node.nodes.find(node => node.type === type);

		/**
		 * Find a node of the given type
		 */

		exports.exceedsLimit = (min, max, step = 1, limit) => {
		  if (limit === false) return false;
		  if (!exports.isInteger(min) || !exports.isInteger(max)) return false;
		  return ((Number(max) - Number(min)) / Number(step)) >= limit;
		};

		/**
		 * Escape the given node with '\\' before node.value
		 */

		exports.escapeNode = (block, n = 0, type) => {
		  const node = block.nodes[n];
		  if (!node) return;

		  if ((type && node.type === type) || node.type === 'open' || node.type === 'close') {
		    if (node.escaped !== true) {
		      node.value = '\\' + node.value;
		      node.escaped = true;
		    }
		  }
		};

		/**
		 * Returns true if the given brace node should be enclosed in literal braces
		 */

		exports.encloseBrace = node => {
		  if (node.type !== 'brace') return false;
		  if ((node.commas >> 0 + node.ranges >> 0) === 0) {
		    node.invalid = true;
		    return true;
		  }
		  return false;
		};

		/**
		 * Returns true if a brace node is invalid.
		 */

		exports.isInvalidBrace = block => {
		  if (block.type !== 'brace') return false;
		  if (block.invalid === true || block.dollar) return true;
		  if ((block.commas >> 0 + block.ranges >> 0) === 0) {
		    block.invalid = true;
		    return true;
		  }
		  if (block.open !== true || block.close !== true) {
		    block.invalid = true;
		    return true;
		  }
		  return false;
		};

		/**
		 * Returns true if a node is an open or close node
		 */

		exports.isOpenOrClose = node => {
		  if (node.type === 'open' || node.type === 'close') {
		    return true;
		  }
		  return node.open === true || node.close === true;
		};

		/**
		 * Reduce an array of text nodes.
		 */

		exports.reduce = nodes => nodes.reduce((acc, node) => {
		  if (node.type === 'text') acc.push(node.value);
		  if (node.type === 'range') node.type = 'text';
		  return acc;
		}, []);

		/**
		 * Flatten an array
		 */

		exports.flatten = (...args) => {
		  const result = [];

		  const flat = arr => {
		    for (let i = 0; i < arr.length; i++) {
		      const ele = arr[i];

		      if (Array.isArray(ele)) {
		        flat(ele);
		        continue;
		      }

		      if (ele !== undefined) {
		        result.push(ele);
		      }
		    }
		    return result;
		  };

		  flat(args);
		  return result;
		}; 
	} (utils));
	return utils;
}

var stringify;
var hasRequiredStringify;

function requireStringify () {
	if (hasRequiredStringify) return stringify;
	hasRequiredStringify = 1;

	const utils = requireUtils();

	stringify = (ast, options = {}) => {
	  const stringify = (node, parent = {}) => {
	    const invalidBlock = options.escapeInvalid && utils.isInvalidBrace(parent);
	    const invalidNode = node.invalid === true && options.escapeInvalid === true;
	    let output = '';

	    if (node.value) {
	      if ((invalidBlock || invalidNode) && utils.isOpenOrClose(node)) {
	        return '\\' + node.value;
	      }
	      return node.value;
	    }

	    if (node.value) {
	      return node.value;
	    }

	    if (node.nodes) {
	      for (const child of node.nodes) {
	        output += stringify(child);
	      }
	    }
	    return output;
	  };

	  return stringify(ast);
	};
	return stringify;
}

/*!
 * is-number <https://github.com/jonschlinkert/is-number>
 *
 * Copyright (c) 2014-present, Jon Schlinkert.
 * Released under the MIT License.
 */

var isNumber;
var hasRequiredIsNumber;

function requireIsNumber () {
	if (hasRequiredIsNumber) return isNumber;
	hasRequiredIsNumber = 1;

	isNumber = function(num) {
	  if (typeof num === 'number') {
	    return num - num === 0;
	  }
	  if (typeof num === 'string' && num.trim() !== '') {
	    return Number.isFinite ? Number.isFinite(+num) : isFinite(+num);
	  }
	  return false;
	};
	return isNumber;
}

/*!
 * to-regex-range <https://github.com/micromatch/to-regex-range>
 *
 * Copyright (c) 2015-present, Jon Schlinkert.
 * Released under the MIT License.
 */

var toRegexRange_1;
var hasRequiredToRegexRange;

function requireToRegexRange () {
	if (hasRequiredToRegexRange) return toRegexRange_1;
	hasRequiredToRegexRange = 1;

	const isNumber = requireIsNumber();

	const toRegexRange = (min, max, options) => {
	  if (isNumber(min) === false) {
	    throw new TypeError('toRegexRange: expected the first argument to be a number');
	  }

	  if (max === void 0 || min === max) {
	    return String(min);
	  }

	  if (isNumber(max) === false) {
	    throw new TypeError('toRegexRange: expected the second argument to be a number.');
	  }

	  let opts = { relaxZeros: true, ...options };
	  if (typeof opts.strictZeros === 'boolean') {
	    opts.relaxZeros = opts.strictZeros === false;
	  }

	  let relax = String(opts.relaxZeros);
	  let shorthand = String(opts.shorthand);
	  let capture = String(opts.capture);
	  let wrap = String(opts.wrap);
	  let cacheKey = min + ':' + max + '=' + relax + shorthand + capture + wrap;

	  if (toRegexRange.cache.hasOwnProperty(cacheKey)) {
	    return toRegexRange.cache[cacheKey].result;
	  }

	  let a = Math.min(min, max);
	  let b = Math.max(min, max);

	  if (Math.abs(a - b) === 1) {
	    let result = min + '|' + max;
	    if (opts.capture) {
	      return `(${result})`;
	    }
	    if (opts.wrap === false) {
	      return result;
	    }
	    return `(?:${result})`;
	  }

	  let isPadded = hasPadding(min) || hasPadding(max);
	  let state = { min, max, a, b };
	  let positives = [];
	  let negatives = [];

	  if (isPadded) {
	    state.isPadded = isPadded;
	    state.maxLen = String(state.max).length;
	  }

	  if (a < 0) {
	    let newMin = b < 0 ? Math.abs(b) : 1;
	    negatives = splitToPatterns(newMin, Math.abs(a), state, opts);
	    a = state.a = 0;
	  }

	  if (b >= 0) {
	    positives = splitToPatterns(a, b, state, opts);
	  }

	  state.negatives = negatives;
	  state.positives = positives;
	  state.result = collatePatterns(negatives, positives);

	  if (opts.capture === true) {
	    state.result = `(${state.result})`;
	  } else if (opts.wrap !== false && (positives.length + negatives.length) > 1) {
	    state.result = `(?:${state.result})`;
	  }

	  toRegexRange.cache[cacheKey] = state;
	  return state.result;
	};

	function collatePatterns(neg, pos, options) {
	  let onlyNegative = filterPatterns(neg, pos, '-', false) || [];
	  let onlyPositive = filterPatterns(pos, neg, '', false) || [];
	  let intersected = filterPatterns(neg, pos, '-?', true) || [];
	  let subpatterns = onlyNegative.concat(intersected).concat(onlyPositive);
	  return subpatterns.join('|');
	}

	function splitToRanges(min, max) {
	  let nines = 1;
	  let zeros = 1;

	  let stop = countNines(min, nines);
	  let stops = new Set([max]);

	  while (min <= stop && stop <= max) {
	    stops.add(stop);
	    nines += 1;
	    stop = countNines(min, nines);
	  }

	  stop = countZeros(max + 1, zeros) - 1;

	  while (min < stop && stop <= max) {
	    stops.add(stop);
	    zeros += 1;
	    stop = countZeros(max + 1, zeros) - 1;
	  }

	  stops = [...stops];
	  stops.sort(compare);
	  return stops;
	}

	/**
	 * Convert a range to a regex pattern
	 * @param {Number} `start`
	 * @param {Number} `stop`
	 * @return {String}
	 */

	function rangeToPattern(start, stop, options) {
	  if (start === stop) {
	    return { pattern: start, count: [], digits: 0 };
	  }

	  let zipped = zip(start, stop);
	  let digits = zipped.length;
	  let pattern = '';
	  let count = 0;

	  for (let i = 0; i < digits; i++) {
	    let [startDigit, stopDigit] = zipped[i];

	    if (startDigit === stopDigit) {
	      pattern += startDigit;

	    } else if (startDigit !== '0' || stopDigit !== '9') {
	      pattern += toCharacterClass(startDigit, stopDigit);

	    } else {
	      count++;
	    }
	  }

	  if (count) {
	    pattern += options.shorthand === true ? '\\d' : '[0-9]';
	  }

	  return { pattern, count: [count], digits };
	}

	function splitToPatterns(min, max, tok, options) {
	  let ranges = splitToRanges(min, max);
	  let tokens = [];
	  let start = min;
	  let prev;

	  for (let i = 0; i < ranges.length; i++) {
	    let max = ranges[i];
	    let obj = rangeToPattern(String(start), String(max), options);
	    let zeros = '';

	    if (!tok.isPadded && prev && prev.pattern === obj.pattern) {
	      if (prev.count.length > 1) {
	        prev.count.pop();
	      }

	      prev.count.push(obj.count[0]);
	      prev.string = prev.pattern + toQuantifier(prev.count);
	      start = max + 1;
	      continue;
	    }

	    if (tok.isPadded) {
	      zeros = padZeros(max, tok, options);
	    }

	    obj.string = zeros + obj.pattern + toQuantifier(obj.count);
	    tokens.push(obj);
	    start = max + 1;
	    prev = obj;
	  }

	  return tokens;
	}

	function filterPatterns(arr, comparison, prefix, intersection, options) {
	  let result = [];

	  for (let ele of arr) {
	    let { string } = ele;

	    // only push if _both_ are negative...
	    if (!intersection && !contains(comparison, 'string', string)) {
	      result.push(prefix + string);
	    }

	    // or _both_ are positive
	    if (intersection && contains(comparison, 'string', string)) {
	      result.push(prefix + string);
	    }
	  }
	  return result;
	}

	/**
	 * Zip strings
	 */

	function zip(a, b) {
	  let arr = [];
	  for (let i = 0; i < a.length; i++) arr.push([a[i], b[i]]);
	  return arr;
	}

	function compare(a, b) {
	  return a > b ? 1 : b > a ? -1 : 0;
	}

	function contains(arr, key, val) {
	  return arr.some(ele => ele[key] === val);
	}

	function countNines(min, len) {
	  return Number(String(min).slice(0, -len) + '9'.repeat(len));
	}

	function countZeros(integer, zeros) {
	  return integer - (integer % Math.pow(10, zeros));
	}

	function toQuantifier(digits) {
	  let [start = 0, stop = ''] = digits;
	  if (stop || start > 1) {
	    return `{${start + (stop ? ',' + stop : '')}}`;
	  }
	  return '';
	}

	function toCharacterClass(a, b, options) {
	  return `[${a}${(b - a === 1) ? '' : '-'}${b}]`;
	}

	function hasPadding(str) {
	  return /^-?(0+)\d/.test(str);
	}

	function padZeros(value, tok, options) {
	  if (!tok.isPadded) {
	    return value;
	  }

	  let diff = Math.abs(tok.maxLen - String(value).length);
	  let relax = options.relaxZeros !== false;

	  switch (diff) {
	    case 0:
	      return '';
	    case 1:
	      return relax ? '0?' : '0';
	    case 2:
	      return relax ? '0{0,2}' : '00';
	    default: {
	      return relax ? `0{0,${diff}}` : `0{${diff}}`;
	    }
	  }
	}

	/**
	 * Cache
	 */

	toRegexRange.cache = {};
	toRegexRange.clearCache = () => (toRegexRange.cache = {});

	/**
	 * Expose `toRegexRange`
	 */

	toRegexRange_1 = toRegexRange;
	return toRegexRange_1;
}

/*!
 * fill-range <https://github.com/jonschlinkert/fill-range>
 *
 * Copyright (c) 2014-present, Jon Schlinkert.
 * Licensed under the MIT License.
 */

var fillRange;
var hasRequiredFillRange;

function requireFillRange () {
	if (hasRequiredFillRange) return fillRange;
	hasRequiredFillRange = 1;

	const util = require$$0$2__default;
	const toRegexRange = requireToRegexRange();

	const isObject = val => val !== null && typeof val === 'object' && !Array.isArray(val);

	const transform = toNumber => {
	  return value => toNumber === true ? Number(value) : String(value);
	};

	const isValidValue = value => {
	  return typeof value === 'number' || (typeof value === 'string' && value !== '');
	};

	const isNumber = num => Number.isInteger(+num);

	const zeros = input => {
	  let value = `${input}`;
	  let index = -1;
	  if (value[0] === '-') value = value.slice(1);
	  if (value === '0') return false;
	  while (value[++index] === '0');
	  return index > 0;
	};

	const stringify = (start, end, options) => {
	  if (typeof start === 'string' || typeof end === 'string') {
	    return true;
	  }
	  return options.stringify === true;
	};

	const pad = (input, maxLength, toNumber) => {
	  if (maxLength > 0) {
	    let dash = input[0] === '-' ? '-' : '';
	    if (dash) input = input.slice(1);
	    input = (dash + input.padStart(dash ? maxLength - 1 : maxLength, '0'));
	  }
	  if (toNumber === false) {
	    return String(input);
	  }
	  return input;
	};

	const toMaxLen = (input, maxLength) => {
	  let negative = input[0] === '-' ? '-' : '';
	  if (negative) {
	    input = input.slice(1);
	    maxLength--;
	  }
	  while (input.length < maxLength) input = '0' + input;
	  return negative ? ('-' + input) : input;
	};

	const toSequence = (parts, options, maxLen) => {
	  parts.negatives.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
	  parts.positives.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

	  let prefix = options.capture ? '' : '?:';
	  let positives = '';
	  let negatives = '';
	  let result;

	  if (parts.positives.length) {
	    positives = parts.positives.map(v => toMaxLen(String(v), maxLen)).join('|');
	  }

	  if (parts.negatives.length) {
	    negatives = `-(${prefix}${parts.negatives.map(v => toMaxLen(String(v), maxLen)).join('|')})`;
	  }

	  if (positives && negatives) {
	    result = `${positives}|${negatives}`;
	  } else {
	    result = positives || negatives;
	  }

	  if (options.wrap) {
	    return `(${prefix}${result})`;
	  }

	  return result;
	};

	const toRange = (a, b, isNumbers, options) => {
	  if (isNumbers) {
	    return toRegexRange(a, b, { wrap: false, ...options });
	  }

	  let start = String.fromCharCode(a);
	  if (a === b) return start;

	  let stop = String.fromCharCode(b);
	  return `[${start}-${stop}]`;
	};

	const toRegex = (start, end, options) => {
	  if (Array.isArray(start)) {
	    let wrap = options.wrap === true;
	    let prefix = options.capture ? '' : '?:';
	    return wrap ? `(${prefix}${start.join('|')})` : start.join('|');
	  }
	  return toRegexRange(start, end, options);
	};

	const rangeError = (...args) => {
	  return new RangeError('Invalid range arguments: ' + util.inspect(...args));
	};

	const invalidRange = (start, end, options) => {
	  if (options.strictRanges === true) throw rangeError([start, end]);
	  return [];
	};

	const invalidStep = (step, options) => {
	  if (options.strictRanges === true) {
	    throw new TypeError(`Expected step "${step}" to be a number`);
	  }
	  return [];
	};

	const fillNumbers = (start, end, step = 1, options = {}) => {
	  let a = Number(start);
	  let b = Number(end);

	  if (!Number.isInteger(a) || !Number.isInteger(b)) {
	    if (options.strictRanges === true) throw rangeError([start, end]);
	    return [];
	  }

	  // fix negative zero
	  if (a === 0) a = 0;
	  if (b === 0) b = 0;

	  let descending = a > b;
	  let startString = String(start);
	  let endString = String(end);
	  let stepString = String(step);
	  step = Math.max(Math.abs(step), 1);

	  let padded = zeros(startString) || zeros(endString) || zeros(stepString);
	  let maxLen = padded ? Math.max(startString.length, endString.length, stepString.length) : 0;
	  let toNumber = padded === false && stringify(start, end, options) === false;
	  let format = options.transform || transform(toNumber);

	  if (options.toRegex && step === 1) {
	    return toRange(toMaxLen(start, maxLen), toMaxLen(end, maxLen), true, options);
	  }

	  let parts = { negatives: [], positives: [] };
	  let push = num => parts[num < 0 ? 'negatives' : 'positives'].push(Math.abs(num));
	  let range = [];
	  let index = 0;

	  while (descending ? a >= b : a <= b) {
	    if (options.toRegex === true && step > 1) {
	      push(a);
	    } else {
	      range.push(pad(format(a, index), maxLen, toNumber));
	    }
	    a = descending ? a - step : a + step;
	    index++;
	  }

	  if (options.toRegex === true) {
	    return step > 1
	      ? toSequence(parts, options, maxLen)
	      : toRegex(range, null, { wrap: false, ...options });
	  }

	  return range;
	};

	const fillLetters = (start, end, step = 1, options = {}) => {
	  if ((!isNumber(start) && start.length > 1) || (!isNumber(end) && end.length > 1)) {
	    return invalidRange(start, end, options);
	  }

	  let format = options.transform || (val => String.fromCharCode(val));
	  let a = `${start}`.charCodeAt(0);
	  let b = `${end}`.charCodeAt(0);

	  let descending = a > b;
	  let min = Math.min(a, b);
	  let max = Math.max(a, b);

	  if (options.toRegex && step === 1) {
	    return toRange(min, max, false, options);
	  }

	  let range = [];
	  let index = 0;

	  while (descending ? a >= b : a <= b) {
	    range.push(format(a, index));
	    a = descending ? a - step : a + step;
	    index++;
	  }

	  if (options.toRegex === true) {
	    return toRegex(range, null, { wrap: false, options });
	  }

	  return range;
	};

	const fill = (start, end, step, options = {}) => {
	  if (end == null && isValidValue(start)) {
	    return [start];
	  }

	  if (!isValidValue(start) || !isValidValue(end)) {
	    return invalidRange(start, end, options);
	  }

	  if (typeof step === 'function') {
	    return fill(start, end, 1, { transform: step });
	  }

	  if (isObject(step)) {
	    return fill(start, end, 0, step);
	  }

	  let opts = { ...options };
	  if (opts.capture === true) opts.wrap = true;
	  step = step || opts.step || 1;

	  if (!isNumber(step)) {
	    if (step != null && !isObject(step)) return invalidStep(step, opts);
	    return fill(start, end, 1, step);
	  }

	  if (isNumber(start) && isNumber(end)) {
	    return fillNumbers(start, end, step, opts);
	  }

	  return fillLetters(start, end, Math.max(Math.abs(step), 1), opts);
	};

	fillRange = fill;
	return fillRange;
}

var compile_1;
var hasRequiredCompile;

function requireCompile () {
	if (hasRequiredCompile) return compile_1;
	hasRequiredCompile = 1;

	const fill = requireFillRange();
	const utils = requireUtils();

	const compile = (ast, options = {}) => {
	  const walk = (node, parent = {}) => {
	    const invalidBlock = utils.isInvalidBrace(parent);
	    const invalidNode = node.invalid === true && options.escapeInvalid === true;
	    const invalid = invalidBlock === true || invalidNode === true;
	    const prefix = options.escapeInvalid === true ? '\\' : '';
	    let output = '';

	    if (node.isOpen === true) {
	      return prefix + node.value;
	    }

	    if (node.isClose === true) {
	      console.log('node.isClose', prefix, node.value);
	      return prefix + node.value;
	    }

	    if (node.type === 'open') {
	      return invalid ? prefix + node.value : '(';
	    }

	    if (node.type === 'close') {
	      return invalid ? prefix + node.value : ')';
	    }

	    if (node.type === 'comma') {
	      return node.prev.type === 'comma' ? '' : invalid ? node.value : '|';
	    }

	    if (node.value) {
	      return node.value;
	    }

	    if (node.nodes && node.ranges > 0) {
	      const args = utils.reduce(node.nodes);
	      const range = fill(...args, { ...options, wrap: false, toRegex: true, strictZeros: true });

	      if (range.length !== 0) {
	        return args.length > 1 && range.length > 1 ? `(${range})` : range;
	      }
	    }

	    if (node.nodes) {
	      for (const child of node.nodes) {
	        output += walk(child, node);
	      }
	    }

	    return output;
	  };

	  return walk(ast);
	};

	compile_1 = compile;
	return compile_1;
}

var expand_1;
var hasRequiredExpand;

function requireExpand () {
	if (hasRequiredExpand) return expand_1;
	hasRequiredExpand = 1;

	const fill = requireFillRange();
	const stringify = requireStringify();
	const utils = requireUtils();

	const append = (queue = '', stash = '', enclose = false) => {
	  const result = [];

	  queue = [].concat(queue);
	  stash = [].concat(stash);

	  if (!stash.length) return queue;
	  if (!queue.length) {
	    return enclose ? utils.flatten(stash).map(ele => `{${ele}}`) : stash;
	  }

	  for (const item of queue) {
	    if (Array.isArray(item)) {
	      for (const value of item) {
	        result.push(append(value, stash, enclose));
	      }
	    } else {
	      for (let ele of stash) {
	        if (enclose === true && typeof ele === 'string') ele = `{${ele}}`;
	        result.push(Array.isArray(ele) ? append(item, ele, enclose) : item + ele);
	      }
	    }
	  }
	  return utils.flatten(result);
	};

	const expand = (ast, options = {}) => {
	  const rangeLimit = options.rangeLimit === undefined ? 1000 : options.rangeLimit;

	  const walk = (node, parent = {}) => {
	    node.queue = [];

	    let p = parent;
	    let q = parent.queue;

	    while (p.type !== 'brace' && p.type !== 'root' && p.parent) {
	      p = p.parent;
	      q = p.queue;
	    }

	    if (node.invalid || node.dollar) {
	      q.push(append(q.pop(), stringify(node, options)));
	      return;
	    }

	    if (node.type === 'brace' && node.invalid !== true && node.nodes.length === 2) {
	      q.push(append(q.pop(), ['{}']));
	      return;
	    }

	    if (node.nodes && node.ranges > 0) {
	      const args = utils.reduce(node.nodes);

	      if (utils.exceedsLimit(...args, options.step, rangeLimit)) {
	        throw new RangeError('expanded array length exceeds range limit. Use options.rangeLimit to increase or disable the limit.');
	      }

	      let range = fill(...args, options);
	      if (range.length === 0) {
	        range = stringify(node, options);
	      }

	      q.push(append(q.pop(), range));
	      node.nodes = [];
	      return;
	    }

	    const enclose = utils.encloseBrace(node);
	    let queue = node.queue;
	    let block = node;

	    while (block.type !== 'brace' && block.type !== 'root' && block.parent) {
	      block = block.parent;
	      queue = block.queue;
	    }

	    for (let i = 0; i < node.nodes.length; i++) {
	      const child = node.nodes[i];

	      if (child.type === 'comma' && node.type === 'brace') {
	        if (i === 1) queue.push('');
	        queue.push('');
	        continue;
	      }

	      if (child.type === 'close') {
	        q.push(append(q.pop(), queue, enclose));
	        continue;
	      }

	      if (child.value && child.type !== 'open') {
	        queue.push(append(queue.pop(), child.value));
	        continue;
	      }

	      if (child.nodes) {
	        walk(child, node);
	      }
	    }

	    return queue;
	  };

	  return utils.flatten(walk(ast));
	};

	expand_1 = expand;
	return expand_1;
}

var constants;
var hasRequiredConstants;

function requireConstants () {
	if (hasRequiredConstants) return constants;
	hasRequiredConstants = 1;

	constants = {
	  MAX_LENGTH: 10000,

	  // Digits
	  CHAR_0: '0', /* 0 */
	  CHAR_9: '9', /* 9 */

	  // Alphabet chars.
	  CHAR_UPPERCASE_A: 'A', /* A */
	  CHAR_LOWERCASE_A: 'a', /* a */
	  CHAR_UPPERCASE_Z: 'Z', /* Z */
	  CHAR_LOWERCASE_Z: 'z', /* z */

	  CHAR_LEFT_PARENTHESES: '(', /* ( */
	  CHAR_RIGHT_PARENTHESES: ')', /* ) */

	  CHAR_ASTERISK: '*', /* * */

	  // Non-alphabetic chars.
	  CHAR_AMPERSAND: '&', /* & */
	  CHAR_AT: '@', /* @ */
	  CHAR_BACKSLASH: '\\', /* \ */
	  CHAR_BACKTICK: '`', /* ` */
	  CHAR_CARRIAGE_RETURN: '\r', /* \r */
	  CHAR_CIRCUMFLEX_ACCENT: '^', /* ^ */
	  CHAR_COLON: ':', /* : */
	  CHAR_COMMA: ',', /* , */
	  CHAR_DOLLAR: '$', /* . */
	  CHAR_DOT: '.', /* . */
	  CHAR_DOUBLE_QUOTE: '"', /* " */
	  CHAR_EQUAL: '=', /* = */
	  CHAR_EXCLAMATION_MARK: '!', /* ! */
	  CHAR_FORM_FEED: '\f', /* \f */
	  CHAR_FORWARD_SLASH: '/', /* / */
	  CHAR_HASH: '#', /* # */
	  CHAR_HYPHEN_MINUS: '-', /* - */
	  CHAR_LEFT_ANGLE_BRACKET: '<', /* < */
	  CHAR_LEFT_CURLY_BRACE: '{', /* { */
	  CHAR_LEFT_SQUARE_BRACKET: '[', /* [ */
	  CHAR_LINE_FEED: '\n', /* \n */
	  CHAR_NO_BREAK_SPACE: '\u00A0', /* \u00A0 */
	  CHAR_PERCENT: '%', /* % */
	  CHAR_PLUS: '+', /* + */
	  CHAR_QUESTION_MARK: '?', /* ? */
	  CHAR_RIGHT_ANGLE_BRACKET: '>', /* > */
	  CHAR_RIGHT_CURLY_BRACE: '}', /* } */
	  CHAR_RIGHT_SQUARE_BRACKET: ']', /* ] */
	  CHAR_SEMICOLON: ';', /* ; */
	  CHAR_SINGLE_QUOTE: '\'', /* ' */
	  CHAR_SPACE: ' ', /*   */
	  CHAR_TAB: '\t', /* \t */
	  CHAR_UNDERSCORE: '_', /* _ */
	  CHAR_VERTICAL_LINE: '|', /* | */
	  CHAR_ZERO_WIDTH_NOBREAK_SPACE: '\uFEFF' /* \uFEFF */
	};
	return constants;
}

var parse_1;
var hasRequiredParse;

function requireParse () {
	if (hasRequiredParse) return parse_1;
	hasRequiredParse = 1;

	const stringify = requireStringify();

	/**
	 * Constants
	 */

	const {
	  MAX_LENGTH,
	  CHAR_BACKSLASH, /* \ */
	  CHAR_BACKTICK, /* ` */
	  CHAR_COMMA, /* , */
	  CHAR_DOT, /* . */
	  CHAR_LEFT_PARENTHESES, /* ( */
	  CHAR_RIGHT_PARENTHESES, /* ) */
	  CHAR_LEFT_CURLY_BRACE, /* { */
	  CHAR_RIGHT_CURLY_BRACE, /* } */
	  CHAR_LEFT_SQUARE_BRACKET, /* [ */
	  CHAR_RIGHT_SQUARE_BRACKET, /* ] */
	  CHAR_DOUBLE_QUOTE, /* " */
	  CHAR_SINGLE_QUOTE, /* ' */
	  CHAR_NO_BREAK_SPACE,
	  CHAR_ZERO_WIDTH_NOBREAK_SPACE
	} = requireConstants();

	/**
	 * parse
	 */

	const parse = (input, options = {}) => {
	  if (typeof input !== 'string') {
	    throw new TypeError('Expected a string');
	  }

	  const opts = options || {};
	  const max = typeof opts.maxLength === 'number' ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
	  if (input.length > max) {
	    throw new SyntaxError(`Input length (${input.length}), exceeds max characters (${max})`);
	  }

	  const ast = { type: 'root', input, nodes: [] };
	  const stack = [ast];
	  let block = ast;
	  let prev = ast;
	  let brackets = 0;
	  const length = input.length;
	  let index = 0;
	  let depth = 0;
	  let value;

	  /**
	   * Helpers
	   */

	  const advance = () => input[index++];
	  const push = node => {
	    if (node.type === 'text' && prev.type === 'dot') {
	      prev.type = 'text';
	    }

	    if (prev && prev.type === 'text' && node.type === 'text') {
	      prev.value += node.value;
	      return;
	    }

	    block.nodes.push(node);
	    node.parent = block;
	    node.prev = prev;
	    prev = node;
	    return node;
	  };

	  push({ type: 'bos' });

	  while (index < length) {
	    block = stack[stack.length - 1];
	    value = advance();

	    /**
	     * Invalid chars
	     */

	    if (value === CHAR_ZERO_WIDTH_NOBREAK_SPACE || value === CHAR_NO_BREAK_SPACE) {
	      continue;
	    }

	    /**
	     * Escaped chars
	     */

	    if (value === CHAR_BACKSLASH) {
	      push({ type: 'text', value: (options.keepEscaping ? value : '') + advance() });
	      continue;
	    }

	    /**
	     * Right square bracket (literal): ']'
	     */

	    if (value === CHAR_RIGHT_SQUARE_BRACKET) {
	      push({ type: 'text', value: '\\' + value });
	      continue;
	    }

	    /**
	     * Left square bracket: '['
	     */

	    if (value === CHAR_LEFT_SQUARE_BRACKET) {
	      brackets++;

	      let next;

	      while (index < length && (next = advance())) {
	        value += next;

	        if (next === CHAR_LEFT_SQUARE_BRACKET) {
	          brackets++;
	          continue;
	        }

	        if (next === CHAR_BACKSLASH) {
	          value += advance();
	          continue;
	        }

	        if (next === CHAR_RIGHT_SQUARE_BRACKET) {
	          brackets--;

	          if (brackets === 0) {
	            break;
	          }
	        }
	      }

	      push({ type: 'text', value });
	      continue;
	    }

	    /**
	     * Parentheses
	     */

	    if (value === CHAR_LEFT_PARENTHESES) {
	      block = push({ type: 'paren', nodes: [] });
	      stack.push(block);
	      push({ type: 'text', value });
	      continue;
	    }

	    if (value === CHAR_RIGHT_PARENTHESES) {
	      if (block.type !== 'paren') {
	        push({ type: 'text', value });
	        continue;
	      }
	      block = stack.pop();
	      push({ type: 'text', value });
	      block = stack[stack.length - 1];
	      continue;
	    }

	    /**
	     * Quotes: '|"|`
	     */

	    if (value === CHAR_DOUBLE_QUOTE || value === CHAR_SINGLE_QUOTE || value === CHAR_BACKTICK) {
	      const open = value;
	      let next;

	      if (options.keepQuotes !== true) {
	        value = '';
	      }

	      while (index < length && (next = advance())) {
	        if (next === CHAR_BACKSLASH) {
	          value += next + advance();
	          continue;
	        }

	        if (next === open) {
	          if (options.keepQuotes === true) value += next;
	          break;
	        }

	        value += next;
	      }

	      push({ type: 'text', value });
	      continue;
	    }

	    /**
	     * Left curly brace: '{'
	     */

	    if (value === CHAR_LEFT_CURLY_BRACE) {
	      depth++;

	      const dollar = prev.value && prev.value.slice(-1) === '$' || block.dollar === true;
	      const brace = {
	        type: 'brace',
	        open: true,
	        close: false,
	        dollar,
	        depth,
	        commas: 0,
	        ranges: 0,
	        nodes: []
	      };

	      block = push(brace);
	      stack.push(block);
	      push({ type: 'open', value });
	      continue;
	    }

	    /**
	     * Right curly brace: '}'
	     */

	    if (value === CHAR_RIGHT_CURLY_BRACE) {
	      if (block.type !== 'brace') {
	        push({ type: 'text', value });
	        continue;
	      }

	      const type = 'close';
	      block = stack.pop();
	      block.close = true;

	      push({ type, value });
	      depth--;

	      block = stack[stack.length - 1];
	      continue;
	    }

	    /**
	     * Comma: ','
	     */

	    if (value === CHAR_COMMA && depth > 0) {
	      if (block.ranges > 0) {
	        block.ranges = 0;
	        const open = block.nodes.shift();
	        block.nodes = [open, { type: 'text', value: stringify(block) }];
	      }

	      push({ type: 'comma', value });
	      block.commas++;
	      continue;
	    }

	    /**
	     * Dot: '.'
	     */

	    if (value === CHAR_DOT && depth > 0 && block.commas === 0) {
	      const siblings = block.nodes;

	      if (depth === 0 || siblings.length === 0) {
	        push({ type: 'text', value });
	        continue;
	      }

	      if (prev.type === 'dot') {
	        block.range = [];
	        prev.value += value;
	        prev.type = 'range';

	        if (block.nodes.length !== 3 && block.nodes.length !== 5) {
	          block.invalid = true;
	          block.ranges = 0;
	          prev.type = 'text';
	          continue;
	        }

	        block.ranges++;
	        block.args = [];
	        continue;
	      }

	      if (prev.type === 'range') {
	        siblings.pop();

	        const before = siblings[siblings.length - 1];
	        before.value += prev.value + value;
	        prev = before;
	        block.ranges--;
	        continue;
	      }

	      push({ type: 'dot', value });
	      continue;
	    }

	    /**
	     * Text
	     */

	    push({ type: 'text', value });
	  }

	  // Mark imbalanced braces and brackets as invalid
	  do {
	    block = stack.pop();

	    if (block.type !== 'root') {
	      block.nodes.forEach(node => {
	        if (!node.nodes) {
	          if (node.type === 'open') node.isOpen = true;
	          if (node.type === 'close') node.isClose = true;
	          if (!node.nodes) node.type = 'text';
	          node.invalid = true;
	        }
	      });

	      // get the location of the block on parent.nodes (block's siblings)
	      const parent = stack[stack.length - 1];
	      const index = parent.nodes.indexOf(block);
	      // replace the (invalid) block with it's nodes
	      parent.nodes.splice(index, 1, ...block.nodes);
	    }
	  } while (stack.length > 0);

	  push({ type: 'eos' });
	  return ast;
	};

	parse_1 = parse;
	return parse_1;
}

var braces_1;
var hasRequiredBraces;

function requireBraces () {
	if (hasRequiredBraces) return braces_1;
	hasRequiredBraces = 1;

	const stringify = requireStringify();
	const compile = requireCompile();
	const expand = requireExpand();
	const parse = requireParse();

	/**
	 * Expand the given pattern or create a regex-compatible string.
	 *
	 * ```js
	 * const braces = require('braces');
	 * console.log(braces('{a,b,c}', { compile: true })); //=> ['(a|b|c)']
	 * console.log(braces('{a,b,c}')); //=> ['a', 'b', 'c']
	 * ```
	 * @param {String} `str`
	 * @param {Object} `options`
	 * @return {String}
	 * @api public
	 */

	const braces = (input, options = {}) => {
	  let output = [];

	  if (Array.isArray(input)) {
	    for (const pattern of input) {
	      const result = braces.create(pattern, options);
	      if (Array.isArray(result)) {
	        output.push(...result);
	      } else {
	        output.push(result);
	      }
	    }
	  } else {
	    output = [].concat(braces.create(input, options));
	  }

	  if (options && options.expand === true && options.nodupes === true) {
	    output = [...new Set(output)];
	  }
	  return output;
	};

	/**
	 * Parse the given `str` with the given `options`.
	 *
	 * ```js
	 * // braces.parse(pattern, [, options]);
	 * const ast = braces.parse('a/{b,c}/d');
	 * console.log(ast);
	 * ```
	 * @param {String} pattern Brace pattern to parse
	 * @param {Object} options
	 * @return {Object} Returns an AST
	 * @api public
	 */

	braces.parse = (input, options = {}) => parse(input, options);

	/**
	 * Creates a braces string from an AST, or an AST node.
	 *
	 * ```js
	 * const braces = require('braces');
	 * let ast = braces.parse('foo/{a,b}/bar');
	 * console.log(stringify(ast.nodes[2])); //=> '{a,b}'
	 * ```
	 * @param {String} `input` Brace pattern or AST.
	 * @param {Object} `options`
	 * @return {Array} Returns an array of expanded values.
	 * @api public
	 */

	braces.stringify = (input, options = {}) => {
	  if (typeof input === 'string') {
	    return stringify(braces.parse(input, options), options);
	  }
	  return stringify(input, options);
	};

	/**
	 * Compiles a brace pattern into a regex-compatible, optimized string.
	 * This method is called by the main [braces](#braces) function by default.
	 *
	 * ```js
	 * const braces = require('braces');
	 * console.log(braces.compile('a/{b,c}/d'));
	 * //=> ['a/(b|c)/d']
	 * ```
	 * @param {String} `input` Brace pattern or AST.
	 * @param {Object} `options`
	 * @return {Array} Returns an array of expanded values.
	 * @api public
	 */

	braces.compile = (input, options = {}) => {
	  if (typeof input === 'string') {
	    input = braces.parse(input, options);
	  }
	  return compile(input, options);
	};

	/**
	 * Expands a brace pattern into an array. This method is called by the
	 * main [braces](#braces) function when `options.expand` is true. Before
	 * using this method it's recommended that you read the [performance notes](#performance))
	 * and advantages of using [.compile](#compile) instead.
	 *
	 * ```js
	 * const braces = require('braces');
	 * console.log(braces.expand('a/{b,c}/d'));
	 * //=> ['a/b/d', 'a/c/d'];
	 * ```
	 * @param {String} `pattern` Brace pattern
	 * @param {Object} `options`
	 * @return {Array} Returns an array of expanded values.
	 * @api public
	 */

	braces.expand = (input, options = {}) => {
	  if (typeof input === 'string') {
	    input = braces.parse(input, options);
	  }

	  let result = expand(input, options);

	  // filter out empty strings if specified
	  if (options.noempty === true) {
	    result = result.filter(Boolean);
	  }

	  // filter out duplicates if specified
	  if (options.nodupes === true) {
	    result = [...new Set(result)];
	  }

	  return result;
	};

	/**
	 * Processes a brace pattern and returns either an expanded array
	 * (if `options.expand` is true), a highly optimized regex-compatible string.
	 * This method is called by the main [braces](#braces) function.
	 *
	 * ```js
	 * const braces = require('braces');
	 * console.log(braces.create('user-{200..300}/project-{a,b,c}-{1..10}'))
	 * //=> 'user-(20[0-9]|2[1-9][0-9]|300)/project-(a|b|c)-([1-9]|10)'
	 * ```
	 * @param {String} `pattern` Brace pattern
	 * @param {Object} `options`
	 * @return {Array} Returns an array of expanded values.
	 * @api public
	 */

	braces.create = (input, options = {}) => {
	  if (input === '' || input.length < 3) {
	    return [input];
	  }

	  return options.expand !== true
	    ? braces.compile(input, options)
	    : braces.expand(input, options);
	};

	/**
	 * Expose "braces"
	 */

	braces_1 = braces;
	return braces_1;
}

var micromatch_1;
var hasRequiredMicromatch;

function requireMicromatch () {
	if (hasRequiredMicromatch) return micromatch_1;
	hasRequiredMicromatch = 1;

	const util = require$$0$2__default;
	const braces = requireBraces();
	const picomatch = requirePicomatch();
	const utils = requireUtils$1();

	const isEmptyString = v => v === '' || v === './';
	const hasBraces = v => {
	  const index = v.indexOf('{');
	  return index > -1 && v.indexOf('}', index) > -1;
	};

	/**
	 * Returns an array of strings that match one or more glob patterns.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * // mm(list, patterns[, options]);
	 *
	 * console.log(mm(['a.js', 'a.txt'], ['*.js']));
	 * //=> [ 'a.js' ]
	 * ```
	 * @param {String|Array<string>} `list` List of strings to match.
	 * @param {String|Array<string>} `patterns` One or more glob patterns to use for matching.
	 * @param {Object} `options` See available [options](#options)
	 * @return {Array} Returns an array of matches
	 * @summary false
	 * @api public
	 */

	const micromatch = (list, patterns, options) => {
	  patterns = [].concat(patterns);
	  list = [].concat(list);

	  let omit = new Set();
	  let keep = new Set();
	  let items = new Set();
	  let negatives = 0;

	  let onResult = state => {
	    items.add(state.output);
	    if (options && options.onResult) {
	      options.onResult(state);
	    }
	  };

	  for (let i = 0; i < patterns.length; i++) {
	    let isMatch = picomatch(String(patterns[i]), { ...options, onResult }, true);
	    let negated = isMatch.state.negated || isMatch.state.negatedExtglob;
	    if (negated) negatives++;

	    for (let item of list) {
	      let matched = isMatch(item, true);

	      let match = negated ? !matched.isMatch : matched.isMatch;
	      if (!match) continue;

	      if (negated) {
	        omit.add(matched.output);
	      } else {
	        omit.delete(matched.output);
	        keep.add(matched.output);
	      }
	    }
	  }

	  let result = negatives === patterns.length ? [...items] : [...keep];
	  let matches = result.filter(item => !omit.has(item));

	  if (options && matches.length === 0) {
	    if (options.failglob === true) {
	      throw new Error(`No matches found for "${patterns.join(', ')}"`);
	    }

	    if (options.nonull === true || options.nullglob === true) {
	      return options.unescape ? patterns.map(p => p.replace(/\\/g, '')) : patterns;
	    }
	  }

	  return matches;
	};

	/**
	 * Backwards compatibility
	 */

	micromatch.match = micromatch;

	/**
	 * Returns a matcher function from the given glob `pattern` and `options`.
	 * The returned function takes a string to match as its only argument and returns
	 * true if the string is a match.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * // mm.matcher(pattern[, options]);
	 *
	 * const isMatch = mm.matcher('*.!(*a)');
	 * console.log(isMatch('a.a')); //=> false
	 * console.log(isMatch('a.b')); //=> true
	 * ```
	 * @param {String} `pattern` Glob pattern
	 * @param {Object} `options`
	 * @return {Function} Returns a matcher function.
	 * @api public
	 */

	micromatch.matcher = (pattern, options) => picomatch(pattern, options);

	/**
	 * Returns true if **any** of the given glob `patterns` match the specified `string`.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * // mm.isMatch(string, patterns[, options]);
	 *
	 * console.log(mm.isMatch('a.a', ['b.*', '*.a'])); //=> true
	 * console.log(mm.isMatch('a.a', 'b.*')); //=> false
	 * ```
	 * @param {String} `str` The string to test.
	 * @param {String|Array} `patterns` One or more glob patterns to use for matching.
	 * @param {Object} `[options]` See available [options](#options).
	 * @return {Boolean} Returns true if any patterns match `str`
	 * @api public
	 */

	micromatch.isMatch = (str, patterns, options) => picomatch(patterns, options)(str);

	/**
	 * Backwards compatibility
	 */

	micromatch.any = micromatch.isMatch;

	/**
	 * Returns a list of strings that _**do not match any**_ of the given `patterns`.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * // mm.not(list, patterns[, options]);
	 *
	 * console.log(mm.not(['a.a', 'b.b', 'c.c'], '*.a'));
	 * //=> ['b.b', 'c.c']
	 * ```
	 * @param {Array} `list` Array of strings to match.
	 * @param {String|Array} `patterns` One or more glob pattern to use for matching.
	 * @param {Object} `options` See available [options](#options) for changing how matches are performed
	 * @return {Array} Returns an array of strings that **do not match** the given patterns.
	 * @api public
	 */

	micromatch.not = (list, patterns, options = {}) => {
	  patterns = [].concat(patterns).map(String);
	  let result = new Set();
	  let items = [];

	  let onResult = state => {
	    if (options.onResult) options.onResult(state);
	    items.push(state.output);
	  };

	  let matches = new Set(micromatch(list, patterns, { ...options, onResult }));

	  for (let item of items) {
	    if (!matches.has(item)) {
	      result.add(item);
	    }
	  }
	  return [...result];
	};

	/**
	 * Returns true if the given `string` contains the given pattern. Similar
	 * to [.isMatch](#isMatch) but the pattern can match any part of the string.
	 *
	 * ```js
	 * var mm = require('micromatch');
	 * // mm.contains(string, pattern[, options]);
	 *
	 * console.log(mm.contains('aa/bb/cc', '*b'));
	 * //=> true
	 * console.log(mm.contains('aa/bb/cc', '*d'));
	 * //=> false
	 * ```
	 * @param {String} `str` The string to match.
	 * @param {String|Array} `patterns` Glob pattern to use for matching.
	 * @param {Object} `options` See available [options](#options) for changing how matches are performed
	 * @return {Boolean} Returns true if any of the patterns matches any part of `str`.
	 * @api public
	 */

	micromatch.contains = (str, pattern, options) => {
	  if (typeof str !== 'string') {
	    throw new TypeError(`Expected a string: "${util.inspect(str)}"`);
	  }

	  if (Array.isArray(pattern)) {
	    return pattern.some(p => micromatch.contains(str, p, options));
	  }

	  if (typeof pattern === 'string') {
	    if (isEmptyString(str) || isEmptyString(pattern)) {
	      return false;
	    }

	    if (str.includes(pattern) || (str.startsWith('./') && str.slice(2).includes(pattern))) {
	      return true;
	    }
	  }

	  return micromatch.isMatch(str, pattern, { ...options, contains: true });
	};

	/**
	 * Filter the keys of the given object with the given `glob` pattern
	 * and `options`. Does not attempt to match nested keys. If you need this feature,
	 * use [glob-object][] instead.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * // mm.matchKeys(object, patterns[, options]);
	 *
	 * const obj = { aa: 'a', ab: 'b', ac: 'c' };
	 * console.log(mm.matchKeys(obj, '*b'));
	 * //=> { ab: 'b' }
	 * ```
	 * @param {Object} `object` The object with keys to filter.
	 * @param {String|Array} `patterns` One or more glob patterns to use for matching.
	 * @param {Object} `options` See available [options](#options) for changing how matches are performed
	 * @return {Object} Returns an object with only keys that match the given patterns.
	 * @api public
	 */

	micromatch.matchKeys = (obj, patterns, options) => {
	  if (!utils.isObject(obj)) {
	    throw new TypeError('Expected the first argument to be an object');
	  }
	  let keys = micromatch(Object.keys(obj), patterns, options);
	  let res = {};
	  for (let key of keys) res[key] = obj[key];
	  return res;
	};

	/**
	 * Returns true if some of the strings in the given `list` match any of the given glob `patterns`.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * // mm.some(list, patterns[, options]);
	 *
	 * console.log(mm.some(['foo.js', 'bar.js'], ['*.js', '!foo.js']));
	 * // true
	 * console.log(mm.some(['foo.js'], ['*.js', '!foo.js']));
	 * // false
	 * ```
	 * @param {String|Array} `list` The string or array of strings to test. Returns as soon as the first match is found.
	 * @param {String|Array} `patterns` One or more glob patterns to use for matching.
	 * @param {Object} `options` See available [options](#options) for changing how matches are performed
	 * @return {Boolean} Returns true if any `patterns` matches any of the strings in `list`
	 * @api public
	 */

	micromatch.some = (list, patterns, options) => {
	  let items = [].concat(list);

	  for (let pattern of [].concat(patterns)) {
	    let isMatch = picomatch(String(pattern), options);
	    if (items.some(item => isMatch(item))) {
	      return true;
	    }
	  }
	  return false;
	};

	/**
	 * Returns true if every string in the given `list` matches
	 * any of the given glob `patterns`.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * // mm.every(list, patterns[, options]);
	 *
	 * console.log(mm.every('foo.js', ['foo.js']));
	 * // true
	 * console.log(mm.every(['foo.js', 'bar.js'], ['*.js']));
	 * // true
	 * console.log(mm.every(['foo.js', 'bar.js'], ['*.js', '!foo.js']));
	 * // false
	 * console.log(mm.every(['foo.js'], ['*.js', '!foo.js']));
	 * // false
	 * ```
	 * @param {String|Array} `list` The string or array of strings to test.
	 * @param {String|Array} `patterns` One or more glob patterns to use for matching.
	 * @param {Object} `options` See available [options](#options) for changing how matches are performed
	 * @return {Boolean} Returns true if all `patterns` matches all of the strings in `list`
	 * @api public
	 */

	micromatch.every = (list, patterns, options) => {
	  let items = [].concat(list);

	  for (let pattern of [].concat(patterns)) {
	    let isMatch = picomatch(String(pattern), options);
	    if (!items.every(item => isMatch(item))) {
	      return false;
	    }
	  }
	  return true;
	};

	/**
	 * Returns true if **all** of the given `patterns` match
	 * the specified string.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * // mm.all(string, patterns[, options]);
	 *
	 * console.log(mm.all('foo.js', ['foo.js']));
	 * // true
	 *
	 * console.log(mm.all('foo.js', ['*.js', '!foo.js']));
	 * // false
	 *
	 * console.log(mm.all('foo.js', ['*.js', 'foo.js']));
	 * // true
	 *
	 * console.log(mm.all('foo.js', ['*.js', 'f*', '*o*', '*o.js']));
	 * // true
	 * ```
	 * @param {String|Array} `str` The string to test.
	 * @param {String|Array} `patterns` One or more glob patterns to use for matching.
	 * @param {Object} `options` See available [options](#options) for changing how matches are performed
	 * @return {Boolean} Returns true if any patterns match `str`
	 * @api public
	 */

	micromatch.all = (str, patterns, options) => {
	  if (typeof str !== 'string') {
	    throw new TypeError(`Expected a string: "${util.inspect(str)}"`);
	  }

	  return [].concat(patterns).every(p => picomatch(p, options)(str));
	};

	/**
	 * Returns an array of matches captured by `pattern` in `string, or `null` if the pattern did not match.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * // mm.capture(pattern, string[, options]);
	 *
	 * console.log(mm.capture('test/*.js', 'test/foo.js'));
	 * //=> ['foo']
	 * console.log(mm.capture('test/*.js', 'foo/bar.css'));
	 * //=> null
	 * ```
	 * @param {String} `glob` Glob pattern to use for matching.
	 * @param {String} `input` String to match
	 * @param {Object} `options` See available [options](#options) for changing how matches are performed
	 * @return {Array|null} Returns an array of captures if the input matches the glob pattern, otherwise `null`.
	 * @api public
	 */

	micromatch.capture = (glob, input, options) => {
	  let posix = utils.isWindows(options);
	  let regex = picomatch.makeRe(String(glob), { ...options, capture: true });
	  let match = regex.exec(posix ? utils.toPosixSlashes(input) : input);

	  if (match) {
	    return match.slice(1).map(v => v === void 0 ? '' : v);
	  }
	};

	/**
	 * Create a regular expression from the given glob `pattern`.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * // mm.makeRe(pattern[, options]);
	 *
	 * console.log(mm.makeRe('*.js'));
	 * //=> /^(?:(\.[\\\/])?(?!\.)(?=.)[^\/]*?\.js)$/
	 * ```
	 * @param {String} `pattern` A glob pattern to convert to regex.
	 * @param {Object} `options`
	 * @return {RegExp} Returns a regex created from the given pattern.
	 * @api public
	 */

	micromatch.makeRe = (...args) => picomatch.makeRe(...args);

	/**
	 * Scan a glob pattern to separate the pattern into segments. Used
	 * by the [split](#split) method.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * const state = mm.scan(pattern[, options]);
	 * ```
	 * @param {String} `pattern`
	 * @param {Object} `options`
	 * @return {Object} Returns an object with
	 * @api public
	 */

	micromatch.scan = (...args) => picomatch.scan(...args);

	/**
	 * Parse a glob pattern to create the source string for a regular
	 * expression.
	 *
	 * ```js
	 * const mm = require('micromatch');
	 * const state = mm.parse(pattern[, options]);
	 * ```
	 * @param {String} `glob`
	 * @param {Object} `options`
	 * @return {Object} Returns an object with useful properties and output to be used as regex source string.
	 * @api public
	 */

	micromatch.parse = (patterns, options) => {
	  let res = [];
	  for (let pattern of [].concat(patterns || [])) {
	    for (let str of braces(String(pattern), options)) {
	      res.push(picomatch.parse(str, options));
	    }
	  }
	  return res;
	};

	/**
	 * Process the given brace `pattern`.
	 *
	 * ```js
	 * const { braces } = require('micromatch');
	 * console.log(braces('foo/{a,b,c}/bar'));
	 * //=> [ 'foo/(a|b|c)/bar' ]
	 *
	 * console.log(braces('foo/{a,b,c}/bar', { expand: true }));
	 * //=> [ 'foo/a/bar', 'foo/b/bar', 'foo/c/bar' ]
	 * ```
	 * @param {String} `pattern` String with brace pattern to process.
	 * @param {Object} `options` Any [options](#options) to change how expansion is performed. See the [braces][] library for all available options.
	 * @return {Array}
	 * @api public
	 */

	micromatch.braces = (pattern, options) => {
	  if (typeof pattern !== 'string') throw new TypeError('Expected a string');
	  if ((options && options.nobrace === true) || !hasBraces(pattern)) {
	    return [pattern];
	  }
	  return braces(pattern, options);
	};

	/**
	 * Expand braces
	 */

	micromatch.braceExpand = (pattern, options) => {
	  if (typeof pattern !== 'string') throw new TypeError('Expected a string');
	  return micromatch.braces(pattern, { ...options, expand: true });
	};

	/**
	 * Expose micromatch
	 */

	// exposed for tests
	micromatch.hasBraces = hasBraces;
	micromatch_1 = micromatch;
	return micromatch_1;
}

var micromatchExports = requireMicromatch();
const micromatch = /*@__PURE__*/getDefaultExportFromCjs(micromatchExports);

var slash$1;
var hasRequiredSlash;

function requireSlash () {
	if (hasRequiredSlash) return slash$1;
	hasRequiredSlash = 1;
	slash$1 = path => {
		const isExtendedLengthPath = /^\\\\\?\\/.test(path);
		const hasNonAscii = /[^\u0000-\u0080]+/.test(path); // eslint-disable-line no-control-regex

		if (isExtendedLengthPath || hasNonAscii) {
			return path;
		}

		return path.replace(/\\/g, '/');
	};
	return slash$1;
}

var slashExports = requireSlash();
const slash = /*@__PURE__*/getDefaultExportFromCjs(slashExports);

var escapeStringRegexp;
var hasRequiredEscapeStringRegexp;

function requireEscapeStringRegexp () {
	if (hasRequiredEscapeStringRegexp) return escapeStringRegexp;
	hasRequiredEscapeStringRegexp = 1;

	const matchOperatorsRegex = /[|\\{}()[\]^$+*?.-]/g;

	escapeStringRegexp = string => {
		if (typeof string !== 'string') {
			throw new TypeError('Expected a string');
		}

		return string.replace(matchOperatorsRegex, '\\$&');
	};
	return escapeStringRegexp;
}

var stackUtils$1;
var hasRequiredStackUtils;

function requireStackUtils () {
	if (hasRequiredStackUtils) return stackUtils$1;
	hasRequiredStackUtils = 1;

	const escapeStringRegexp = requireEscapeStringRegexp();

	const cwd = typeof process === 'object' && process && typeof process.cwd === 'function'
	  ? process.cwd()
	  : '.';

	const natives = [].concat(
	  require$$1.builtinModules,
	  'bootstrap_node',
	  'node',
	).map(n => new RegExp(`(?:\\((?:node:)?${n}(?:\\.js)?:\\d+:\\d+\\)$|^\\s*at (?:node:)?${n}(?:\\.js)?:\\d+:\\d+$)`));

	natives.push(
	  /\((?:node:)?internal\/[^:]+:\d+:\d+\)$/,
	  /\s*at (?:node:)?internal\/[^:]+:\d+:\d+$/,
	  /\/\.node-spawn-wrap-\w+-\w+\/node:\d+:\d+\)?$/
	);

	class StackUtils {
	  constructor (opts) {
	    opts = {
	      ignoredPackages: [],
	      ...opts
	    };

	    if ('internals' in opts === false) {
	      opts.internals = StackUtils.nodeInternals();
	    }

	    if ('cwd' in opts === false) {
	      opts.cwd = cwd;
	    }

	    this._cwd = opts.cwd.replace(/\\/g, '/');
	    this._internals = [].concat(
	      opts.internals,
	      ignoredPackagesRegExp(opts.ignoredPackages)
	    );

	    this._wrapCallSite = opts.wrapCallSite || false;
	  }

	  static nodeInternals () {
	    return [...natives];
	  }

	  clean (stack, indent = 0) {
	    indent = ' '.repeat(indent);

	    if (!Array.isArray(stack)) {
	      stack = stack.split('\n');
	    }

	    if (!(/^\s*at /.test(stack[0])) && (/^\s*at /.test(stack[1]))) {
	      stack = stack.slice(1);
	    }

	    let outdent = false;
	    let lastNonAtLine = null;
	    const result = [];

	    stack.forEach(st => {
	      st = st.replace(/\\/g, '/');

	      if (this._internals.some(internal => internal.test(st))) {
	        return;
	      }

	      const isAtLine = /^\s*at /.test(st);

	      if (outdent) {
	        st = st.trimEnd().replace(/^(\s+)at /, '$1');
	      } else {
	        st = st.trim();
	        if (isAtLine) {
	          st = st.slice(3);
	        }
	      }

	      st = st.replace(`${this._cwd}/`, '');

	      if (st) {
	        if (isAtLine) {
	          if (lastNonAtLine) {
	            result.push(lastNonAtLine);
	            lastNonAtLine = null;
	          }

	          result.push(st);
	        } else {
	          outdent = true;
	          lastNonAtLine = st;
	        }
	      }
	    });

	    return result.map(line => `${indent}${line}\n`).join('');
	  }

	  captureString (limit, fn = this.captureString) {
	    if (typeof limit === 'function') {
	      fn = limit;
	      limit = Infinity;
	    }

	    const {stackTraceLimit} = Error;
	    if (limit) {
	      Error.stackTraceLimit = limit;
	    }

	    const obj = {};

	    Error.captureStackTrace(obj, fn);
	    const {stack} = obj;
	    Error.stackTraceLimit = stackTraceLimit;

	    return this.clean(stack);
	  }

	  capture (limit, fn = this.capture) {
	    if (typeof limit === 'function') {
	      fn = limit;
	      limit = Infinity;
	    }

	    const {prepareStackTrace, stackTraceLimit} = Error;
	    Error.prepareStackTrace = (obj, site) => {
	      if (this._wrapCallSite) {
	        return site.map(this._wrapCallSite);
	      }

	      return site;
	    };

	    if (limit) {
	      Error.stackTraceLimit = limit;
	    }

	    const obj = {};
	    Error.captureStackTrace(obj, fn);
	    const { stack } = obj;
	    Object.assign(Error, {prepareStackTrace, stackTraceLimit});

	    return stack;
	  }

	  at (fn = this.at) {
	    const [site] = this.capture(1, fn);

	    if (!site) {
	      return {};
	    }

	    const res = {
	      line: site.getLineNumber(),
	      column: site.getColumnNumber()
	    };

	    setFile(res, site.getFileName(), this._cwd);

	    if (site.isConstructor()) {
	      Object.defineProperty(res, 'constructor', {
	        value: true,
	        configurable: true,
	      });
	    }

	    if (site.isEval()) {
	      res.evalOrigin = site.getEvalOrigin();
	    }

	    // Node v10 stopped with the isNative() on callsites, apparently
	    /* istanbul ignore next */
	    if (site.isNative()) {
	      res.native = true;
	    }

	    let typename;
	    try {
	      typename = site.getTypeName();
	    } catch (_) {
	    }

	    if (typename && typename !== 'Object' && typename !== '[object Object]') {
	      res.type = typename;
	    }

	    const fname = site.getFunctionName();
	    if (fname) {
	      res.function = fname;
	    }

	    const meth = site.getMethodName();
	    if (meth && fname !== meth) {
	      res.method = meth;
	    }

	    return res;
	  }

	  parseLine (line) {
	    const match = line && line.match(re);
	    if (!match) {
	      return null;
	    }

	    const ctor = match[1] === 'new';
	    let fname = match[2];
	    const evalOrigin = match[3];
	    const evalFile = match[4];
	    const evalLine = Number(match[5]);
	    const evalCol = Number(match[6]);
	    let file = match[7];
	    const lnum = match[8];
	    const col = match[9];
	    const native = match[10] === 'native';
	    const closeParen = match[11] === ')';
	    let method;

	    const res = {};

	    if (lnum) {
	      res.line = Number(lnum);
	    }

	    if (col) {
	      res.column = Number(col);
	    }

	    if (closeParen && file) {
	      // make sure parens are balanced
	      // if we have a file like "asdf) [as foo] (xyz.js", then odds are
	      // that the fname should be += " (asdf) [as foo]" and the file
	      // should be just "xyz.js"
	      // walk backwards from the end to find the last unbalanced (
	      let closes = 0;
	      for (let i = file.length - 1; i > 0; i--) {
	        if (file.charAt(i) === ')') {
	          closes++;
	        } else if (file.charAt(i) === '(' && file.charAt(i - 1) === ' ') {
	          closes--;
	          if (closes === -1 && file.charAt(i - 1) === ' ') {
	            const before = file.slice(0, i - 1);
	            const after = file.slice(i + 1);
	            file = after;
	            fname += ` (${before}`;
	            break;
	          }
	        }
	      }
	    }

	    if (fname) {
	      const methodMatch = fname.match(methodRe);
	      if (methodMatch) {
	        fname = methodMatch[1];
	        method = methodMatch[2];
	      }
	    }

	    setFile(res, file, this._cwd);

	    if (ctor) {
	      Object.defineProperty(res, 'constructor', {
	        value: true,
	        configurable: true,
	      });
	    }

	    if (evalOrigin) {
	      res.evalOrigin = evalOrigin;
	      res.evalLine = evalLine;
	      res.evalColumn = evalCol;
	      res.evalFile = evalFile && evalFile.replace(/\\/g, '/');
	    }

	    if (native) {
	      res.native = true;
	    }

	    if (fname) {
	      res.function = fname;
	    }

	    if (method && fname !== method) {
	      res.method = method;
	    }

	    return res;
	  }
	}

	function setFile (result, filename, cwd) {
	  if (filename) {
	    filename = filename.replace(/\\/g, '/');
	    if (filename.startsWith(`${cwd}/`)) {
	      filename = filename.slice(cwd.length + 1);
	    }

	    result.file = filename;
	  }
	}

	function ignoredPackagesRegExp(ignoredPackages) {
	  if (ignoredPackages.length === 0) {
	    return [];
	  }

	  const packages = ignoredPackages.map(mod => escapeStringRegexp(mod));

	  return new RegExp(`[\/\\\\]node_modules[\/\\\\](?:${packages.join('|')})[\/\\\\][^:]+:\\d+:\\d+`)
	}

	const re = new RegExp(
	  '^' +
	    // Sometimes we strip out the '    at' because it's noisy
	  '(?:\\s*at )?' +
	    // $1 = ctor if 'new'
	  '(?:(new) )?' +
	    // $2 = function name (can be literally anything)
	    // May contain method at the end as [as xyz]
	  '(?:(.*?) \\()?' +
	    // (eval at <anonymous> (file.js:1:1),
	    // $3 = eval origin
	    // $4:$5:$6 are eval file/line/col, but not normally reported
	  '(?:eval at ([^ ]+) \\((.+?):(\\d+):(\\d+)\\), )?' +
	    // file:line:col
	    // $7:$8:$9
	    // $10 = 'native' if native
	  '(?:(.+?):(\\d+):(\\d+)|(native))' +
	    // maybe close the paren, then end
	    // if $11 is ), then we only allow balanced parens in the filename
	    // any imbalance is placed on the fname.  This is a heuristic, and
	    // bound to be incorrect in some edge cases.  The bet is that
	    // having weird characters in method names is more common than
	    // having weird characters in filenames, which seems reasonable.
	  '(\\)?)$'
	);

	const methodRe = /^(.*?) \[as (.*?)\]$/;

	stackUtils$1 = StackUtils;
	return stackUtils$1;
}

var stackUtilsExports = requireStackUtils();
const StackUtils = /*@__PURE__*/getDefaultExportFromCjs(stackUtilsExports);

const stackUtils = new StackUtils({ cwd: "something which does not exist" });
let nodeInternals = [];
try {
  nodeInternals = StackUtils.nodeInternals();
} catch {
}
const PATH_NODE_MODULES = `${path.sep}node_modules${path.sep}`;
const PATH_JEST_PACKAGES = `${path.sep}jest${path.sep}packages${path.sep}`;
const JASMINE_IGNORE = /^\s+at(?:(?:.jasmine-)|\s+jasmine\.buildExpectationResult)/;
const JEST_INTERNALS_IGNORE = /^\s+at.*?jest(-.*?)?(\/|\\)(build|node_modules|packages)(\/|\\)/;
const ANONYMOUS_FN_IGNORE = /^\s+at <anonymous>.*$/;
const ANONYMOUS_PROMISE_IGNORE = /^\s+at (new )?Promise \(<anonymous>\).*$/;
const ANONYMOUS_GENERATOR_IGNORE = /^\s+at Generator.next \(<anonymous>\).*$/;
const NATIVE_NEXT_IGNORE = /^\s+at next \(native\).*$/;
const TITLE_INDENT = "  ";
const MESSAGE_INDENT = "    ";
const STACK_INDENT = "      ";
const TITLE_BULLET = chalk.bold("● ");
const STACK_TRACE_COLOR = chalk.dim;
const STACK_PATH_REGEXP = /\s*at.*\(?(:\d*:\d*|native)\)?/;
const EXEC_ERROR_MESSAGE = "Test suite failed to run";
const NOT_EMPTY_LINE_REGEXP = /^(?!$)/gm;
const indentAllLines = (lines) => lines.replaceAll(NOT_EMPTY_LINE_REGEXP, MESSAGE_INDENT);
const trim = (string) => (string || "").trim();
const trimPaths = (string) => STACK_PATH_REGEXP.test(string) ? trim(string) : string;
const getRenderedCallsite = (fileContent, line, column) => {
  let renderedCallsite = libExports.codeFrameColumns(
    fileContent,
    { start: { column, line } },
    { highlightCode: true }
  );
  renderedCallsite = indentAllLines(renderedCallsite);
  renderedCallsite = `
${renderedCallsite}
`;
  return renderedCallsite;
};
const blankStringRegexp = /^\s*$/;
function checkForCommonEnvironmentErrors(error) {
  if (error.includes("ReferenceError: document is not defined") || error.includes("ReferenceError: window is not defined") || error.includes("ReferenceError: navigator is not defined")) {
    return warnAboutWrongTestEnvironment(error, "jsdom");
  } else if (error.includes(".unref is not a function")) {
    return warnAboutWrongTestEnvironment(error, "node");
  }
  return error;
}
function warnAboutWrongTestEnvironment(error, env) {
  return chalk.bold.red(
    `The error below may be caused by using the wrong test environment, see ${chalk.dim.underline(
      "https://jestjs.io/docs/configuration#testenvironment-string"
    )}.
Consider using the "${env}" test environment.

`
  ) + error;
}
const formatExecError = (error, config, options, testPath, reuseMessage, noTitle) => {
  if (!error || typeof error === "number") {
    error = new Error(`Expected an Error, but "${String(error)}" was thrown`);
    error.stack = "";
  }
  let message, stack;
  let cause = "";
  const subErrors = [];
  if (typeof error === "string" || !error) {
    error ||= "EMPTY ERROR";
    message = "";
    stack = error;
  } else {
    message = error.message;
    stack = typeof error.stack === "string" ? error.stack : `thrown: ${format(error, { maxDepth: 3 })}`;
    if ("cause" in error) {
      const prefix = "\n\nCause:\n";
      if (typeof error.cause === "string" || typeof error.cause === "number") {
        cause += `${prefix}${error.cause}`;
      } else if (types.isNativeError(error.cause) || error.cause instanceof Error) {
        const formatted = formatExecError(
          error.cause,
          config,
          options,
          testPath,
          reuseMessage,
          true
        );
        cause += `${prefix}${formatted}`;
      }
    }
    if ("errors" in error && Array.isArray(error.errors)) {
      for (const subError of error.errors) {
        subErrors.push(
          formatExecError(
            subError,
            config,
            options,
            testPath,
            reuseMessage,
            true
          )
        );
      }
    }
  }
  if (cause !== "") {
    cause = indentAllLines(cause);
  }
  const separated = separateMessageFromStack(stack || "");
  stack = separated.stack;
  if (separated.message.includes(trim(message))) {
    message = separated.message;
  }
  message = checkForCommonEnvironmentErrors(message);
  message = indentAllLines(message);
  stack = stack && !options.noStackTrace ? `
${formatStackTrace(stack, config, options)}` : "";
  if (typeof stack !== "string" || blankStringRegexp.test(message) && blankStringRegexp.test(stack)) {
    message = `thrown: ${format(error, { maxDepth: 3 })}`;
  }
  let messageToUse;
  if (noTitle) {
    messageToUse = ` ${message.trim()}`;
  } else {
    messageToUse = `${EXEC_ERROR_MESSAGE}

${message}`;
  }
  const title = noTitle ? "" : `${TITLE_INDENT + TITLE_BULLET}`;
  const subErrorStr = subErrors.length > 0 ? indentAllLines(
    `

Errors contained in AggregateError:
${subErrors.join("\n")}`
  ) : "";
  return `${title + messageToUse + stack + cause + subErrorStr}
`;
};
const removeInternalStackEntries = (lines, options) => {
  let pathCounter = 0;
  return lines.filter((line) => {
    if (!line) {
      return false;
    }
    if (ANONYMOUS_FN_IGNORE.test(line)) {
      return false;
    }
    if (ANONYMOUS_PROMISE_IGNORE.test(line)) {
      return false;
    }
    if (ANONYMOUS_GENERATOR_IGNORE.test(line)) {
      return false;
    }
    if (NATIVE_NEXT_IGNORE.test(line)) {
      return false;
    }
    if (nodeInternals.some((internal) => internal.test(line))) {
      return false;
    }
    if (!STACK_PATH_REGEXP.test(line)) {
      return true;
    }
    if (JASMINE_IGNORE.test(line)) {
      return false;
    }
    if (++pathCounter === 1) {
      return true;
    }
    if (options.noStackTrace) {
      return false;
    }
    if (JEST_INTERNALS_IGNORE.test(line)) {
      return false;
    }
    return true;
  });
};
const formatPath = (line, config, relativeTestPath = null) => {
  const match = line.match(/(^\s*at .*?\(?)([^()]+)(:\d+:\d+\)?.*$)/);
  if (!match) {
    return line;
  }
  let filePath = slash(path.relative(config.rootDir, match[2]));
  if (config.testMatch && config.testMatch.length > 0 && micromatch([filePath], config.testMatch).length > 0 || filePath === relativeTestPath) {
    filePath = chalk.reset.cyan(filePath);
  }
  return STACK_TRACE_COLOR(match[1]) + filePath + STACK_TRACE_COLOR(match[3]);
};
function getStackTraceLines(stack, options) {
  options = { noCodeFrame: false, noStackTrace: false, ...options };
  return removeInternalStackEntries(stack.split(/\n/), options);
}
function getTopFrame(lines) {
  for (const line of lines) {
    if (line.includes(PATH_NODE_MODULES) || line.includes(PATH_JEST_PACKAGES)) {
      continue;
    }
    const parsedFrame = stackUtils.parseLine(line.trim());
    if (parsedFrame && parsedFrame.file) {
      if (parsedFrame.file.startsWith("file://")) {
        parsedFrame.file = slash(fileURLToPath(parsedFrame.file));
      }
      return parsedFrame;
    }
  }
  return null;
}
function formatStackTrace(stack, config, options, testPath) {
  const lines = getStackTraceLines(stack, options);
  let renderedCallsite = "";
  const relativeTestPath = null;
  if (!options.noStackTrace && !options.noCodeFrame) {
    const topFrame = getTopFrame(lines);
    if (topFrame) {
      const { column, file: filename, line } = topFrame;
      if (line && filename && path.isAbsolute(filename)) {
        let fileContent;
        try {
          fileContent = gracefulFsExports.readFileSync(filename, "utf8");
          renderedCallsite = getRenderedCallsite(fileContent, line, column);
        } catch {
        }
      }
    }
  }
  const stacktrace = lines.length === 0 ? "" : `
${lines.map(
    (line) => STACK_INDENT + formatPath(trimPaths(line), config, relativeTestPath)
  ).join("\n")}`;
  return renderedCallsite + stacktrace;
}
const errorRegexp = /^Error:?\s*$/;
const removeBlankErrorLine = (str) => str.split("\n").filter((line) => !errorRegexp.test(line)).join("\n").trimEnd();
const separateMessageFromStack = (content) => {
  if (!content) {
    return { message: "", stack: "" };
  }
  const messageMatch = content.match(
    /^(?:Error: )?([\S\s]*?(?=\n\s*at\s.*:\d*:\d*)|\s*.*)([\S\s]*)$/
  );
  if (!messageMatch) {
    throw new Error("If you hit this error, the regex above is buggy.");
  }
  const message = removeBlankErrorLine(messageMatch[1]);
  const stack = removeBlankErrorLine(messageMatch[2]);
  return { message, stack };
};

const DID_NOT_THROW = "Received function did not throw";
const getThrown = (e) => {
  const hasMessage = e !== null && e !== void 0 && typeof e.message === "string";
  if (hasMessage && typeof e.name === "string" && typeof e.stack === "string") {
    return {
      hasMessage,
      isError: true,
      message: e.message,
      value: e
    };
  }
  return {
    hasMessage,
    isError: false,
    message: hasMessage ? e.message : String(e),
    value: e
  };
};
const createMatcher = (matcherName, fromPromise) => function(received, expected) {
  const options = {
    isNot: this.isNot,
    promise: this.promise
  };
  let thrown = null;
  if (fromPromise && isError(received)) {
    thrown = getThrown(received);
  } else {
    if (typeof received === "function") {
      try {
        received();
      } catch (error) {
        thrown = getThrown(error);
      }
    } else {
      if (!fromPromise) {
        const placeholder = expected === void 0 ? "" : "expected";
        throw new Error(
          matcherErrorMessage(
            matcherHint(matcherName, void 0, placeholder, options),
            `${RECEIVED_COLOR("received")} value must be a function`,
            printWithType("Received", received, printReceived)
          )
        );
      }
    }
  }
  if (expected === void 0) {
    return toThrow(matcherName, options, thrown);
  } else if (typeof expected === "function") {
    return toThrowExpectedClass(matcherName, options, thrown, expected);
  } else if (typeof expected === "string") {
    return toThrowExpectedString(matcherName, options, thrown, expected);
  } else if (expected !== null && typeof expected.test === "function") {
    return toThrowExpectedRegExp(matcherName, options, thrown, expected);
  } else if (expected !== null && typeof expected.asymmetricMatch === "function") {
    return toThrowExpectedAsymmetric(matcherName, options, thrown, expected);
  } else if (expected !== null && typeof expected === "object") {
    return toThrowExpectedObject(matcherName, options, thrown, expected);
  } else {
    throw new Error(
      matcherErrorMessage(
        matcherHint(matcherName, void 0, void 0, options),
        `${EXPECTED_COLOR(
          "expected"
        )} value must be a string or regular expression or class or error`,
        printWithType("Expected", expected, printExpected)
      )
    );
  }
};
const matchers = {
  toThrow: createMatcher("toThrow")
};
const toThrowExpectedRegExp = (matcherName, options, thrown, expected) => {
  const pass = thrown !== null && expected.test(thrown.message);
  const message = pass ? () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, void 0, options) + "\n\n" + formatExpected("Expected pattern: not ", expected) + (thrown !== null && thrown.hasMessage ? formatReceived(
      "Received message:     ",
      thrown,
      "message",
      expected
    ) + formatStack(thrown) : formatReceived("Received value:       ", thrown, "value"))
  ) : () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, void 0, options) + "\n\n" + formatExpected("Expected pattern: ", expected) + (thrown === null ? `
${DID_NOT_THROW}` : thrown.hasMessage ? formatReceived("Received message: ", thrown, "message") + formatStack(thrown) : formatReceived("Received value:   ", thrown, "value"))
  );
  return { message, pass };
};
const toThrowExpectedAsymmetric = (matcherName, options, thrown, expected) => {
  const pass = thrown !== null && expected.asymmetricMatch(thrown.value);
  const message = pass ? () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, void 0, options) + "\n\n" + formatExpected("Expected asymmetric matcher: not ", expected) + "\n" + (thrown !== null && thrown.hasMessage ? formatReceived("Received name:    ", thrown, "name") + formatReceived("Received message: ", thrown, "message") + formatStack(thrown) : formatReceived("Thrown value: ", thrown, "value"))
  ) : () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, void 0, options) + "\n\n" + formatExpected("Expected asymmetric matcher: ", expected) + "\n" + (thrown === null ? DID_NOT_THROW : thrown.hasMessage ? formatReceived("Received name:    ", thrown, "name") + formatReceived("Received message: ", thrown, "message") + formatStack(thrown) : formatReceived("Thrown value: ", thrown, "value"))
  );
  return { message, pass };
};
const toThrowExpectedObject = (matcherName, options, thrown, expected) => {
  const expectedMessageAndCause = createMessageAndCause(expected);
  const thrownMessageAndCause = thrown === null ? null : createMessageAndCause(thrown.value);
  const isCompareErrorInstance = thrown?.isError && expected instanceof Error;
  const isExpectedCustomErrorInstance = expected.constructor.name !== Error.name;
  const pass = thrown !== null && thrown.message === expected.message && thrownMessageAndCause === expectedMessageAndCause && (!isCompareErrorInstance || !isExpectedCustomErrorInstance || thrown.value instanceof expected.constructor);
  const message = pass ? () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, void 0, options) + "\n\n" + formatExpected(
      `Expected ${messageAndCause(expected)}: not `,
      expectedMessageAndCause
    ) + (thrown !== null && thrown.hasMessage ? formatStack(thrown) : formatReceived("Received value:       ", thrown, "value"))
  ) : () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, void 0, options) + "\n\n" + (thrown === null ? (
      // eslint-disable-next-line prefer-template
      formatExpected(
        `Expected ${messageAndCause(expected)}: `,
        expectedMessageAndCause
      ) + "\n" + DID_NOT_THROW
    ) : thrown.hasMessage ? (
      // eslint-disable-next-line prefer-template
      printDiffOrStringify(
        expectedMessageAndCause,
        thrownMessageAndCause,
        `Expected ${messageAndCause(expected)}`,
        `Received ${messageAndCause(thrown.value)}`,
        true
      ) + "\n" + formatStack(thrown)
    ) : formatExpected(
      `Expected ${messageAndCause(expected)}: `,
      expectedMessageAndCause
    ) + formatReceived("Received value:   ", thrown, "value"))
  );
  return { message, pass };
};
const toThrowExpectedClass = (matcherName, options, thrown, expected) => {
  const pass = thrown !== null && thrown.value instanceof expected;
  const message = pass ? () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, void 0, options) + "\n\n" + printExpectedConstructorNameNot("Expected constructor", expected) + (thrown !== null && thrown.value != null && typeof thrown.value.constructor === "function" && thrown.value.constructor !== expected ? printReceivedConstructorNameNot(
      "Received constructor",
      thrown.value.constructor,
      expected
    ) : "") + "\n" + (thrown !== null && thrown.hasMessage ? formatReceived("Received message: ", thrown, "message") + formatStack(thrown) : formatReceived("Received value: ", thrown, "value"))
  ) : () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, void 0, options) + "\n\n" + printExpectedConstructorName("Expected constructor", expected) + (thrown === null ? `
${DID_NOT_THROW}` : `${thrown.value != null && typeof thrown.value.constructor === "function" ? printReceivedConstructorName(
      "Received constructor",
      thrown.value.constructor
    ) : ""}
${thrown.hasMessage ? formatReceived("Received message: ", thrown, "message") + formatStack(thrown) : formatReceived("Received value: ", thrown, "value")}`)
  );
  return { message, pass };
};
const toThrowExpectedString = (matcherName, options, thrown, expected) => {
  const pass = thrown !== null && thrown.message.includes(expected);
  const message = pass ? () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, void 0, options) + "\n\n" + formatExpected("Expected substring: not ", expected) + (thrown !== null && thrown.hasMessage ? formatReceived(
      "Received message:       ",
      thrown,
      "message",
      expected
    ) + formatStack(thrown) : formatReceived("Received value:         ", thrown, "value"))
  ) : () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, void 0, options) + "\n\n" + formatExpected("Expected substring: ", expected) + (thrown === null ? `
${DID_NOT_THROW}` : thrown.hasMessage ? formatReceived("Received message:   ", thrown, "message") + formatStack(thrown) : formatReceived("Received value:     ", thrown, "value"))
  );
  return { message, pass };
};
const toThrow = (matcherName, options, thrown) => {
  const pass = thrown !== null;
  const message = pass ? () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, "", options) + "\n\n" + (thrown !== null && thrown.hasMessage ? formatReceived("Error name:    ", thrown, "name") + formatReceived("Error message: ", thrown, "message") + formatStack(thrown) : formatReceived("Thrown value: ", thrown, "value"))
  ) : () => (
    // eslint-disable-next-line prefer-template
    matcherHint(matcherName, void 0, "", options) + "\n\n" + DID_NOT_THROW
  );
  return { message, pass };
};
const formatExpected = (label, expected) => `${label + printExpected(expected)}
`;
const formatReceived = (label, thrown, key, expected) => {
  if (thrown === null) {
    return "";
  }
  if (key === "message") {
    const message = thrown.message;
    if (typeof expected === "string") {
      const index = message.indexOf(expected);
      if (index !== -1) {
        return `${label + printReceivedStringContainExpectedSubstring(
          message,
          index,
          expected.length
        )}
`;
      }
    } else if (expected instanceof RegExp) {
      return `${label + printReceivedStringContainExpectedResult(
        message,
        typeof expected.exec === "function" ? expected.exec(message) : null
      )}
`;
    }
    return `${label + printReceived(message)}
`;
  }
  if (key === "name") {
    return thrown.isError ? `${label + printReceived(thrown.value.name)}
` : "";
  }
  if (key === "value") {
    return thrown.isError ? "" : `${label + printReceived(thrown.value)}
`;
  }
  return "";
};
const formatStack = (thrown) => {
  if (thrown === null || !thrown.isError) {
    return "";
  } else {
    const config = {
      rootDir: process.cwd(),
      testMatch: []
    };
    const options = {
      noStackTrace: false
    };
    if (thrown.value instanceof AggregateError) {
      return formatExecError(thrown.value, config, options);
    } else {
      return formatStackTrace(
        separateMessageFromStack(thrown.value.stack).stack,
        config,
        options
      );
    }
  }
};
function createMessageAndCause(error) {
  if (error.cause) {
    const seen = /* @__PURE__ */ new WeakSet();
    return JSON.stringify(buildSerializeError(error), (_, value) => {
      if (isObject(value)) {
        if (seen.has(value)) return;
        seen.add(value);
      }
      if (typeof value === "bigint" || value === void 0) {
        return String(value);
      }
      return value;
    });
  }
  return error.message;
}
function buildSerializeError(error) {
  if (!isObject(error)) {
    return error;
  }
  const result = {};
  for (const name of Object.getOwnPropertyNames(error).sort()) {
    if (["stack", "fileName", "lineNumber"].includes(name)) {
      continue;
    }
    if (name === "cause") {
      result[name] = buildSerializeError(error["cause"]);
      continue;
    }
    result[name] = error[name];
  }
  return result;
}
function isObject(obj) {
  return obj != null && typeof obj === "object";
}
function messageAndCause(error) {
  return error.cause === void 0 ? "message" : "message and cause";
}

class JestAssertionError extends Error {
  matcherResult;
}
const createToThrowErrorMatchingSnapshotMatcher = function(matcher) {
  return function(received, testNameOrInlineSnapshot) {
    return matcher.apply(this, [received, testNameOrInlineSnapshot, true]);
  };
};
const getPromiseMatcher = (name, matcher) => {
  if (name === "toThrow") {
    return createMatcher(name, true);
  } else if (name === "toThrowErrorMatchingSnapshot" || name === "toThrowErrorMatchingInlineSnapshot") {
    return createToThrowErrorMatchingSnapshotMatcher(matcher);
  }
  return null;
};
const expect$1 = (actual, ...rest) => {
  if (rest.length > 0) {
    throw new Error("Expect takes at most one argument.");
  }
  const allMatchers = getMatchers();
  const expectation = {
    not: {},
    rejects: { not: {} },
    resolves: { not: {} }
  };
  const err = new JestAssertionError();
  for (const name of Object.keys(allMatchers)) {
    const matcher = allMatchers[name];
    const promiseMatcher = getPromiseMatcher(name, matcher) || matcher;
    expectation[name] = makeThrowingMatcher(matcher, false, "", actual);
    expectation.not[name] = makeThrowingMatcher(matcher, true, "", actual);
    expectation.resolves[name] = makeResolveMatcher(
      name,
      promiseMatcher,
      false,
      actual,
      err
    );
    expectation.resolves.not[name] = makeResolveMatcher(
      name,
      promiseMatcher,
      true,
      actual,
      err
    );
    expectation.rejects[name] = makeRejectMatcher(
      name,
      promiseMatcher,
      false,
      actual,
      err
    );
    expectation.rejects.not[name] = makeRejectMatcher(
      name,
      promiseMatcher,
      true,
      actual,
      err
    );
  }
  return expectation;
};
const getMessage = (message) => message && message() || RECEIVED_COLOR("No message was specified for this matcher.");
const makeResolveMatcher = (matcherName, matcher, isNot, actual, outerErr) => (...args) => {
  const options = {
    isNot,
    promise: "resolves"
  };
  const actualWrapper = typeof actual === "function" ? actual() : actual;
  if (!isPromise(actualWrapper)) {
    throw new JestAssertionError(
      matcherErrorMessage(
        matcherHint(matcherName, void 0, "", options),
        `${RECEIVED_COLOR(
          "received"
        )} value must be a promise or a function returning a promise`,
        printWithType(
          "Received",
          actual,
          printReceived
        )
      )
    );
  }
  const innerErr = new JestAssertionError();
  return actualWrapper.then(
    (result) => makeThrowingMatcher(matcher, isNot, "resolves", result, innerErr).apply(
      null,
      args
    ),
    (error) => {
      outerErr.message = `${matcherHint(
        matcherName,
        void 0,
        "",
        options
      )}

Received promise rejected instead of resolved
Rejected to value: ${printReceived(error)}`;
      throw outerErr;
    }
  );
};
const makeRejectMatcher = (matcherName, matcher, isNot, actual, outerErr) => (...args) => {
  const options = {
    isNot,
    promise: "rejects"
  };
  const actualWrapper = typeof actual === "function" ? actual() : actual;
  if (!isPromise(actualWrapper)) {
    throw new JestAssertionError(
      matcherErrorMessage(
        matcherHint(matcherName, void 0, "", options),
        `${RECEIVED_COLOR(
          "received"
        )} value must be a promise or a function returning a promise`,
        printWithType(
          "Received",
          actual,
          printReceived
        )
      )
    );
  }
  const innerErr = new JestAssertionError();
  return actualWrapper.then(
    (result) => {
      outerErr.message = `${matcherHint(
        matcherName,
        void 0,
        "",
        options
      )}

Received promise resolved instead of rejected
Resolved to value: ${printReceived(result)}`;
      throw outerErr;
    },
    (error) => makeThrowingMatcher(matcher, isNot, "rejects", error, innerErr).apply(
      null,
      args
    )
  );
};
const makeThrowingMatcher = (matcher, isNot, promise, actual, err) => function throwingMatcher(...args) {
  let throws = true;
  const utils = {
    ...matcherUtils,
    iterableEquality,
    subsetEquality
  };
  const matcherUtilsThing = {
    customTesters: getCustomEqualityTesters(),
    // When throws is disabled, the matcher will not throw errors during test
    // execution but instead add them to the global matcher state. If a
    // matcher throws, test execution is normally stopped immediately. The
    // snapshot matcher uses it because we want to log all snapshot
    // failures in a test.
    dontThrow: () => throws = false,
    equals,
    utils
  };
  const matcherContext = {
    ...getState(),
    ...matcherUtilsThing,
    error: err,
    isNot,
    promise
  };
  const processResult = (result, asyncError) => {
    _validateResult(result);
    getState().assertionCalls++;
    if (result.pass && isNot || !result.pass && !isNot) {
      const message = getMessage(result.message);
      let error;
      if (err) {
        error = err;
        error.message = message;
      } else if (asyncError) {
        error = asyncError;
        error.message = message;
      } else {
        error = new JestAssertionError(message);
        if (Error.captureStackTrace) {
          Error.captureStackTrace(error, throwingMatcher);
        }
      }
      error.matcherResult = { ...result, message };
      if (throws) {
        throw error;
      } else {
        getState().suppressedErrors.push(error);
      }
    } else {
      getState().numPassingAsserts++;
    }
  };
  const handleError = (error) => {
    if (matcher[INTERNAL_MATCHER_FLAG] === true && !(error instanceof JestAssertionError) && error.name !== "PrettyFormatPluginError" && // Guard for some environments (browsers) that do not support this feature.
    Error.captureStackTrace) {
      Error.captureStackTrace(error, throwingMatcher);
    }
    throw error;
  };
  let potentialResult;
  try {
    potentialResult = matcher[INTERNAL_MATCHER_FLAG] === true ? matcher.call(matcherContext, actual, ...args) : (
      // It's a trap specifically for inline snapshot to capture this name
      // in the stack trace, so that it can correctly get the custom matcher
      // function call.
      (function __EXTERNAL_MATCHER_TRAP__() {
        return matcher.call(matcherContext, actual, ...args);
      })()
    );
    if (isPromise(potentialResult)) {
      const asyncError = new JestAssertionError();
      if (Error.captureStackTrace) {
        Error.captureStackTrace(asyncError, throwingMatcher);
      }
      return potentialResult.then((aResult) => processResult(aResult, asyncError)).catch(handleError);
    } else {
      return processResult(potentialResult);
    }
  } catch (error) {
    return handleError(error);
  }
};
expect$1.extend = (matchers2) => setMatchers(matchers2, false, expect$1);
expect$1.addEqualityTesters = (customTesters) => addCustomEqualityTesters(customTesters);
expect$1.anything = anything;
expect$1.any = any;
expect$1.not = {
  arrayContaining: arrayNotContaining,
  arrayOf: notArrayOf,
  closeTo: notCloseTo,
  objectContaining: objectNotContaining,
  stringContaining: stringNotContaining,
  stringMatching: stringNotMatching
};
expect$1.arrayContaining = arrayContaining;
expect$1.arrayOf = arrayOf;
expect$1.closeTo = closeTo;
expect$1.objectContaining = objectContaining;
expect$1.stringContaining = stringContaining;
expect$1.stringMatching = stringMatching;
const _validateResult = (result) => {
  if (typeof result !== "object" || typeof result.pass !== "boolean" || result.message && typeof result.message !== "string" && typeof result.message !== "function") {
    throw new Error(
      `Unexpected return from a matcher function.
Matcher functions should return an object in the following format:
  {message?: string | function, pass: boolean}
'${stringify$1(result)}' was returned`
    );
  }
};
function assertions(expected) {
  const error = new ErrorWithStack(void 0, assertions);
  setState({
    expectedAssertionsNumber: expected,
    expectedAssertionsNumberError: error
  });
}
function hasAssertions(...args) {
  const error = new ErrorWithStack(void 0, hasAssertions);
  ensureNoExpected(args[0], ".hasAssertions");
  setState({
    isExpectingAssertions: true,
    isExpectingAssertionsError: error
  });
}
setMatchers(matchers$1, true, expect$1);
setMatchers(spyMatchers, true, expect$1);
setMatchers(matchers, true, expect$1);
expect$1.assertions = assertions;
expect$1.hasAssertions = hasAssertions;
expect$1.getState = getState;
expect$1.setState = setState;
expect$1.extractExpectedAssertionsErrors = extractExpectedAssertionsErrors;

const expect = expect$1;

export { expect };
