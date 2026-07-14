import { Predicate } from "effect";

/**
 * Selector engine for parsing and executing CSS, XPath, and text selectors.
 *
 * Supports Playwright-style selector syntax:
 * - Plain CSS selectors (default): `div.foo`, `#id`, etc.
 * - CSS selector with prefix: `css=div.foo`
 * - XPath selector: `xpath=/html/body/div`
 * - Text selector: `text=Hello`, `text="Hello World"`, `text=/regex/`
 *   (self-text-match — Playwright's `text-is` / `text-matches` engine)
 * - Text-contains selector: `text-contains="Hello World"`,
 *   `text-contains=/regex/` (descendant-includes — Playwright's
 *   `internal:has-text` engine). Used by `filter({ hasText })`.
 * - Chained selectors: `css=div >> text=Hello`
 *
 * Chained selector algorithm follows Playwright's approach:
 * - Start with roots = [document]
 * - For each part, query the engine within each root, collecting results into new roots
 * - For $eval (single), return the first result
 * - For $$eval (all), return all results
 *
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Parsed selector with type and value.
 * For chained selectors, this represents a single segment.
 */
export interface ParsedSelector {
  readonly type: "css" | "xpath" | "text";
  /**
   * For `text` type only. `self` = the element's own text matches
   * (Playwright's `text-is` / `text-matches` engine). `contains` =
   * the element's subtree text contains the search string
   * (Playwright's `internal:has-text` engine). Default: `self`.
   */
  readonly textMode?: "self" | "contains";
  readonly value: string;
  readonly textMatch?: TextMatchOptions;
}

/**
 * Options for text matching.
 */
export interface TextMatchOptions {
  /** Exact match vs substring */
  readonly exact: boolean;
  /** Regex pattern (if applicable) */
  readonly regex?: {
    readonly source: string;
    readonly flags: string;
  };
}

/**
 * Parsed selector chain (one or more selectors).
 */
export interface SelectorChain {
  readonly selectors: readonly ParsedSelector[];
}

// =============================================================================
// Selector Parsing
// =============================================================================

/**
 * Regex patterns for selector prefixes.
 */
const SELECTOR_PREFIX_RE = /^(css|xpath|text|text-contains)\s*=\s*/i;
const TEXT_QUOTED_RE = /^"([^"]*)"|^'([^']*)'/;
const TEXT_REGEX_RE = /^\/(.+)\/([gimsuy]*)$/;

/**
 * Parses a single selector segment.
 * Detects selector type from prefix or defaults to CSS.
 * Handles bare quoted strings ("text") as text selectors in chains.
 */
const parseSelectorSegment = (segment: string): ParsedSelector => {
  const trimmed = segment.trim();

  // Check for explicit prefix (css=, xpath=, text=, text-contains=)
  const prefixMatch = trimmed.match(SELECTOR_PREFIX_RE);
  if (prefixMatch) {
    const type = prefixMatch[1].toLowerCase() as "css" | "xpath" | "text" | "text-contains";
    const value = trimmed.slice(prefixMatch[0].length).trim();

    if (type === "text") {
      return parseTextSelector(value, "self");
    }
    if (type === "text-contains") {
      // Used by filter({ hasText }) — see also `parseTextContainsSelector`
      // for the encoding details. We treat the value as JSON-encoded for
      // string inputs (sidesteps quote-escaping) and as a regex source for
      // `/.../flags` patterns.
      return parseTextContainsSelector(value);
    }

    return { type, value };
  }

  // No prefix - check for bare quoted string (treated as text selector)
  // e.g., "Hello" or 'Hello' in a chain like: css=div >> "Hello"
  const bareQuotedMatch = trimmed.match(TEXT_QUOTED_RE);
  if (bareQuotedMatch) {
    const text = bareQuotedMatch[1] ?? bareQuotedMatch[2] ?? "";
    return {
      type: "text",
      value: text,
      textMatch: { exact: true },
    };
  }

  // No prefix, not a quoted string - default to CSS
  return { type: "css", value: trimmed };
};

/**
 * Parses a text selector value.
 * Handles: text=foo, text="foo bar", text=/regex/
 *
 * @param mode - `"self"` for self-text-match (text-is / text-matches);
 *   `"contains"` for descendant-includes (has-text).
 */
const parseTextSelector = (value: string, mode: "self" | "contains" = "self"): ParsedSelector => {
  // Check for regex pattern: /pattern/flags
  const regexMatch = value.match(TEXT_REGEX_RE);
  if (regexMatch) {
    return {
      type: "text",
      textMode: mode,
      value: regexMatch[1],
      textMatch: {
        exact: false,
        regex: {
          source: regexMatch[1],
          flags: regexMatch[2] || "",
        },
      },
    };
  }

  // Check for quoted string: "foo bar" or 'foo bar'
  const quotedMatch = value.match(TEXT_QUOTED_RE);
  if (quotedMatch) {
    const text = quotedMatch[1] ?? quotedMatch[2] ?? "";
    return {
      type: "text",
      textMode: mode,
      value: text,
      textMatch: { exact: true },
    };
  }

  // Unquoted - substring match
  return {
    type: "text",
    textMode: mode,
    value,
    textMatch: { exact: false },
  };
};

/**
 * Parses a `text-contains=` selector value.
 *
 * Encoding:
 * - Regex: `/source/flags` (mirrors `text=` regex form)
 * - String: JSON-encoded `"\"the string\""` (sidesteps quote-escape
 *   ambiguity that the `text=` parser has).
 *
 * @example
 *   - text-contains="hello world"     => value "hello world", no regex
 *   - text-contains with regex form: text-contains followed by /pattern/flags
 *   - text-contains with JSON-escaped quotes: text-contains="\"Hello \\\"world\\\"\""  => value 'Hello "world"'
 */
const parseTextContainsSelector = (value: string): ParsedSelector => {
  // Regex form
  const regexMatch = value.match(TEXT_REGEX_RE);
  if (regexMatch) {
    return {
      type: "text",
      textMode: "contains",
      value: regexMatch[1],
      textMatch: {
        exact: false,
        regex: {
          source: regexMatch[1],
          flags: regexMatch[2] || "",
        },
      },
    };
  }

  // JSON-encoded string form. We use JSON.parse so embedded quotes and
  // backslashes round-trip cleanly.
  try {
    const decoded: unknown = JSON.parse(value);
    if (Predicate.isString(decoded)) {
      return {
        type: "text",
        textMode: "contains",
        value: decoded,
        textMatch: { exact: false },
      };
    }
  } catch {
    // Fall through — try bare-quote parse for backward compatibility
  }

  // Bare quoted form (legacy / hand-written chains)
  const quotedMatch = value.match(TEXT_QUOTED_RE);
  if (quotedMatch) {
    const text = quotedMatch[1] ?? quotedMatch[2] ?? "";
    return {
      type: "text",
      textMode: "contains",
      value: text,
      textMatch: { exact: false },
    };
  }

  // Unquoted — substring match
  return {
    type: "text",
    textMode: "contains",
    value,
    textMatch: { exact: false },
  };
};

/**
 * Parses a selector string into a chain of selectors.
 * Handles the `>>` chaining syntax.
 */
export const parseSelector = (selector: string): SelectorChain => {
  // Split by >> but preserve quoted strings
  const segments: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];

    // Handle quotes
    if ((char === '"' || char === "'") && (i === 0 || selector[i - 1] !== "\\")) {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
      }
      current += char;
      continue;
    }

    // Handle >> separator (only outside quotes)
    if (!inQuote && char === ">" && selector[i + 1] === ">") {
      segments.push(current);
      current = "";
      i++; // Skip second >
      continue;
    }

    current += char;
  }

  // Add final segment
  if (current) {
    segments.push(current);
  }

  // Parse each segment
  const selectors = segments.map((s) => parseSelectorSegment(s));

  return { selectors };
};

// =============================================================================
// Browser-side Selector Execution Code Generation
// =============================================================================

/**
 * Generates a JavaScript match expression for a text selector.
 * Returns an expression that evaluates to true/false for a given element `el`.
 */
const generateTextMatchExpr = (parsed: ParsedSelector): string => {
  if (parsed.textMatch?.regex) {
    return `new RegExp(${JSON.stringify(parsed.textMatch.regex.source)}, ${JSON.stringify(parsed.textMatch.regex.flags)}).test(el.textContent || '')`;
  }
  if (parsed.textMatch?.exact) {
    return `el.textContent?.trim() === ${JSON.stringify(parsed.value)}`;
  }
  // Substring match (unquoted text=)
  return `el.textContent?.includes(${JSON.stringify(parsed.value)})`;
};

/**
 * Generates code to query elements from a single root using a CSS selector.
 * Returns an array of elements.
 * Includes shadow DOM piercing like Playwright.
 */
const generateCSSQueryAll = (value: string, rootVar: string): string => {
  return `(() => {
    const result = [];
    const query = (root) => {
      result.push(...root.querySelectorAll(${JSON.stringify(value)}));
      if (root.shadowRoot) query(root.shadowRoot);
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) query(el.shadowRoot);
      }
    };
    query(${rootVar});
    return result;
  })()`;
};

/**
 * Generates code to query elements from a single root using an XPath selector.
 * Returns an array of elements.
 */
const generateXPathQueryAll = (value: string, rootVar: string): string => {
  return `(() => {
    const result = document.evaluate(${JSON.stringify(value)}, ${rootVar}, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const elements = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      elements.push(result.snapshotItem(i));
    }
    return elements;
  })()`;
};

/**
 * Generates code to query elements from a single root using a text selector.
 *
 * Follows Playwright's text matching algorithm:
 * - For textMode = "self" (text-is / text-matches): walk all descendant
 *   elements and check if element's own text matches AND no child element
 *   also matches (i.e., it's the most specific/leaf element with the matching
 *   text). Also checks the root element itself if it's an Element (not
 *   Document), which handles cases like `button >> "Next"` where the
 *   button IS the element whose text matches.
 * - For textMode = "contains" (has-text): check if the element's combined
 *   subtree text (normalized whitespace, lowercased) includes the search
 *   string. Mirrors Playwright's `internal:has-text` engine.
 */
const generateTextQueryAll = (parsed: ParsedSelector, rootVar: string): string => {
  if (parsed.textMode === "contains") {
    return generateTextContainsQueryAll(parsed, rootVar);
  }
  const matchExpr = generateTextMatchExpr(parsed);
  // Note: matchSelf is a JS function (not inlined via string-substitution).
  // The previous implementation did `matchExpr.replace(/el/g, "child")` to
  // inline a child-recursive check, but the global replace corrupted the
  // match expression by rewriting `el` inside string literals (e.g.
  // `"hello"` → `"hchildlo"`). Using a recursive function call avoids this
  // and is also cleaner to read.
  return `(() => {
    const result = [];
    const matchSelf = (el) => {
      if (!(${matchExpr})) return false;
      for (let child = el.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.ELEMENT_NODE && matchSelf(child)) return false;
      }
      return true;
    };
    // Check root element itself (e.g., <button>Next</button> when root is that button)
    if (${rootVar}.nodeType === Node.ELEMENT_NODE) {
      if (matchSelf(${rootVar})) result.push(${rootVar});
    }
    // Walk descendants
    const walker = document.createTreeWalker(${rootVar}, NodeFilter.SHOW_ELEMENT);
    let node;
    while (node = walker.nextNode()) {
      const el = node;
      if (matchSelf(el)) result.push(el);
    }
    return result;
  })()`;
};

/**
 * Generates code to query elements whose subtree text contains the search
 * string. Mirrors Playwright's `internal:has-text` engine.
 *
 * For each candidate root:
 * - Always check the root itself (matches Playwright's `has-text` engine
 *   `matches()` semantics — the element is a candidate if its subtree text
 *   contains the search string).
 * - Additionally, when the root is a Document (the first chain step),
 *   walk descendants and add matching elements to the result.
 *
 * For chained use (e.g. `div >> text-contains="foo"`), the previous step's
 * roots are the candidate set and only the root itself is tested. This
 * matches Playwright's chain evaluator behavior, where each chain step
 * calls `engine.matches(candidate)` rather than collecting all descendants.
 */
const generateTextContainsQueryAll = (parsed: ParsedSelector, rootVar: string): string => {
  const searchExpr = generateTextContainsMatchExpr(parsed);
  return `(() => {
    const result = [];
    const elementText = (root) => {
      let text = '';
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) text += node.nodeValue;
      if (root.shadowRoot) text += elementText(root.shadowRoot);
      return text;
    };
    const normalizeWS = (s) => s.replace(/\\s+/g, ' ').trim();
    const matches = (root) => {
      if (!root || root.nodeType !== Node.ELEMENT_NODE) return false;
      const text = normalizeWS(elementText(root));
      return (${searchExpr});
    };
    // Always test the root element itself.
    if (matches(${rootVar})) result.push(${rootVar});
    // Additionally walk descendants when the root is a Document (first
    // chain step). For chained use (root is an Element), the previous
    // step's candidate set is already specific — don't re-walk.
    if (${rootVar}.nodeType === Node.DOCUMENT_NODE) {
      const walker = document.createTreeWalker(${rootVar}, NodeFilter.SHOW_ELEMENT);
      let node;
      while (node = walker.nextNode()) {
        if (matches(node)) result.push(node);
      }
    }
    return result;
  })()`;
};

/**
 * Match expression for `text-contains=` selectors.
 *
 * - String: substring match, both sides lowercased (Playwright `has-text`).
 * - RegExp: regex test on text as-is (user's flags control case sensitivity).
 */
const generateTextContainsMatchExpr = (parsed: ParsedSelector): string => {
  if (parsed.textMatch?.regex) {
    return `new RegExp(${JSON.stringify(parsed.textMatch.regex.source)}, ${JSON.stringify(parsed.textMatch.regex.flags)}).test(text)`;
  }
  return `text.toLowerCase().includes(${JSON.stringify(parsed.value.toLowerCase())})`;
};

/**
 * Generates code to query elements from a single root for a given selector part.
 * Returns an array of elements.
 */
const generateQueryAllForPart = (parsed: ParsedSelector, rootVar: string): string => {
  if (parsed.type === "css") {
    return generateCSSQueryAll(parsed.value, rootVar);
  }
  if (parsed.type === "xpath") {
    return generateXPathQueryAll(parsed.value, rootVar);
  }
  // parsed.type === "text"
  return generateTextQueryAll(parsed, rootVar);
};

/**
 * Generates JavaScript code to query a single element.
 * The generated code uses Playwright-style chaining:
 * roots = [document] → for each part, query all roots → collect results as new roots
 */
export const generateQuerySelector = (selector: string): string => {
  const chain = parseSelector(selector);

  if (chain.selectors.length === 1) {
    // Single selector — direct query
    const sel = chain.selectors[0];
    if (sel.type === "css") {
      return `document.querySelector(${JSON.stringify(sel.value)})`;
    }
    if (sel.type === "xpath") {
      return `document.evaluate(${JSON.stringify(sel.value)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`;
    }
    // text — walk and return first match
    if (sel.textMode === "contains") {
      // For `text-contains=`, dispatch to the descendant-includes query
      // (no single-match shortcut; first-match-wins is what we want).
      return `(() => {
        const all = ${generateTextContainsQueryAll(sel, "document")};
        return all[0] || null;
      })()`;
    }
    const matchExpr = generateTextMatchExpr(sel);
    return `(() => {
      const matchSelf = (el) => {
        if (!(${matchExpr})) return false;
        for (let child = el.firstChild; child; child = child.nextSibling) {
          if (child.nodeType === Node.ELEMENT_NODE && matchSelf(child)) return false;
        }
        return true;
      };
      if (document.body && matchSelf(document.body)) return document.body;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let node;
      while (node = walker.nextNode()) {
        const el = node;
        if (matchSelf(el)) return el;
      }
      return null;
    })()`;
  }

  return generateChainedSelector(chain, true);
};

/**
 * Generates JavaScript code to query all matching elements.
 */
export const generateQuerySelectorAll = (selector: string): string => {
  const chain = parseSelector(selector);

  if (chain.selectors.length === 1) {
    return generateQueryAllForPart(chain.selectors[0], "document");
  }

  return generateChainedSelector(chain, false);
};

/**
 * Generates code for chained selectors using Playwright's algorithm:
 *
 * 1. Start with roots = [document]
 * 2. For each part, for each root, query the engine and collect results into new roots
 * 3. Return first result (single) or all results (all)
 */
const generateChainedSelector = (chain: SelectorChain, single: boolean): string => {
  const parts: string[] = [];

  // Start with roots = [document]
  parts.push(`let roots = [document];`);

  for (let i = 0; i < chain.selectors.length; i++) {
    const sel = chain.selectors[i];
    const isLast = i === chain.selectors.length - 1;

    // For each root, query all matching elements, collect into new roots
    const queryAllCode = generateQueryAllForPart(sel, "root");

    parts.push(`{`);
    parts.push(`  const next = new Set();`);
    parts.push(`  for (const root of roots) {`);
    parts.push(`    const found = ${queryAllCode};`);
    parts.push(`    for (const el of found) next.add(el);`);
    parts.push(`  }`);

    if (single && isLast) {
      // For $eval, return the first element from the final set
      parts.push(`  return next.values().next().value || null;`);
    } else if (!single && isLast) {
      // For $$eval, return all elements from the final set
      parts.push(`  return [...next];`);
    } else {
      // Intermediate part — roots become the new set for the next part
      parts.push(`  roots = [...next];`);
      parts.push(`  if (roots.length === 0) ${single ? "return null" : "return []"};`);
    }
    parts.push(`}`);
  }

  return `(() => { ${parts.join("\n")} })()`;
};

// =============================================================================
// Helper Functions for EvalOnSelector
// =============================================================================

/**
 * Generates the wrapper code for $eval.
 * Returns a function body that queries a single element and evaluates fn on it.
 */
export const make$evalWrapperCode = (
  fnSource: string,
  selector: string,
  hasArg: boolean,
): string => {
  const queryCode = generateQuerySelector(selector);

  if (hasArg) {
    return `
      const argVal = arguments[0];
      const el = ${queryCode};
      if (!el) throw new Error('Failed to find element matching selector "${selector.replace(/"/g, '\\"')}"');
      const fn = (${fnSource});
      return fn(el, argVal);
    `;
  }

  return `
    const el = ${queryCode};
    if (!el) throw new Error('Failed to find element matching selector "${selector.replace(/"/g, '\\"')}"');
    const fn = (${fnSource});
    return fn(el);
  `;
};

/**
 * Generates the wrapper code for $$eval.
 * Returns a function body that queries all elements and evaluates fn on them.
 */
export const make$$evalWrapperCode = (
  fnSource: string,
  selector: string,
  hasArg: boolean,
): string => {
  const queryCode = generateQuerySelectorAll(selector);

  if (hasArg) {
    return `
      const argVal = arguments[0];
      const els = ${queryCode};
      const fn = (${fnSource});
      return fn(els, argVal);
    `;
  }

  return `
    const els = ${queryCode};
    const fn = (${fnSource});
    return fn(els);
  `;
};
