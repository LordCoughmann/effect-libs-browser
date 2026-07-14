import { createGuid } from './utils/crypto.js';
import { parseSelector, visitAllSelectorParts, stringifySelector } from '../utils/isomorphic/selectorParser.js';
import { InvalidSelectorError } from '../utils/isomorphic/cssParser.js';

class Selectors {
  constructor(engines, testIdAttributeName) {
    this.guid = `selectors@${createGuid()}`;
    this._builtinEngines = /* @__PURE__ */ new Set([
      "css",
      "css:light",
      "xpath",
      "xpath:light",
      "_react",
      "_vue",
      "text",
      "text:light",
      "id",
      "id:light",
      "data-testid",
      "data-testid:light",
      "data-test-id",
      "data-test-id:light",
      "data-test",
      "data-test:light",
      "nth",
      "visible",
      "internal:control",
      "internal:has",
      "internal:has-not",
      "internal:has-text",
      "internal:has-not-text",
      "internal:and",
      "internal:or",
      "internal:chain",
      "role",
      "internal:attr",
      "internal:label",
      "internal:text",
      "internal:role",
      "internal:testid",
      "internal:describe",
      "aria-ref"
    ]);
    this._builtinEnginesInMainWorld = /* @__PURE__ */ new Set([
      "_react",
      "_vue"
    ]);
    this._engines = /* @__PURE__ */ new Map();
    this._testIdAttributeName = testIdAttributeName ?? "data-testid";
    for (const engine of engines)
      this.register(engine);
  }
  register(engine) {
    if (!engine.name.match(/^[a-zA-Z_0-9-]+$/))
      throw new Error("Selector engine name may only contain [a-zA-Z0-9_] characters");
    if (this._builtinEngines.has(engine.name) || engine.name === "zs" || engine.name === "zs:light")
      throw new Error(`"${engine.name}" is a predefined selector engine`);
    if (this._engines.has(engine.name))
      throw new Error(`"${engine.name}" selector engine has been already registered`);
    this._engines.set(engine.name, engine);
  }
  testIdAttributeName() {
    return this._testIdAttributeName;
  }
  setTestIdAttributeName(testIdAttributeName) {
    this._testIdAttributeName = testIdAttributeName;
  }
  parseSelector(selector, strict) {
    const parsed = typeof selector === "string" ? parseSelector(selector) : selector;
    let needsMainWorld = false;
    visitAllSelectorParts(parsed, (part) => {
      const name = part.name;
      const custom = this._engines.get(name);
      if (!custom && !this._builtinEngines.has(name))
        throw new InvalidSelectorError(`Unknown engine "${name}" while parsing selector ${stringifySelector(parsed)}`);
      if (custom && !custom.contentScript)
        needsMainWorld = true;
      if (this._builtinEnginesInMainWorld.has(name))
        needsMainWorld = true;
    });
    return {
      parsed,
      world: needsMainWorld ? "main" : "utility",
      strict
    };
  }
}

export { Selectors };
