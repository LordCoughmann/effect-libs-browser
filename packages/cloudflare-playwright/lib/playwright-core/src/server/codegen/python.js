import { toSignalMap, toKeyboardModifiers, toClickOptionsForSourceCode, sanitizeDeviceOptions } from './language.js';
import { asLocator } from '../../utils/isomorphic/locatorGenerators.js';
import { escapeWithQuotes, toSnakeCase } from '../../utils/isomorphic/stringUtils.js';
import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import '../utils/debug.js';
import '../utils/debugLogger.js';
import '../utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../../zipBundle.js';
import '../utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../utils/happyEyeballs.js';
import '../utils/nodePlatform.js';
import '../utils/profiler.js';
import '../utils/socksProxy.js';
import 'node:os';
import '../utils/zones.js';
import { deviceDescriptors } from '../deviceDescriptors.js';

class PythonLanguageGenerator {
  constructor(isAsync, isPyTest) {
    this.groupName = "Python";
    this.highlighter = "python";
    this.id = isPyTest ? "python-pytest" : isAsync ? "python-async" : "python";
    this.name = isPyTest ? "Pytest" : isAsync ? "Library Async" : "Library";
    this._isAsync = isAsync;
    this._isPyTest = isPyTest;
    this._awaitPrefix = isAsync ? "await " : "";
    this._asyncPrefix = isAsync ? "async " : "";
  }
  generateAction(actionInContext) {
    const action = actionInContext.action;
    if (this._isPyTest && (action.name === "openPage" || action.name === "closePage"))
      return "";
    const pageAlias = actionInContext.frame.pageAlias;
    const formatter = new PythonFormatter(4);
    if (action.name === "openPage") {
      formatter.add(`${pageAlias} = ${this._awaitPrefix}context.new_page()`);
      if (action.url && action.url !== "about:blank" && action.url !== "chrome://newtab/")
        formatter.add(`${this._awaitPrefix}${pageAlias}.goto(${quote(action.url)})`);
      return formatter.format();
    }
    const locators = actionInContext.frame.framePath.map((selector) => `.${this._asLocator(selector)}.content_frame`);
    const subject = `${pageAlias}${locators.join("")}`;
    const signals = toSignalMap(action);
    if (signals.dialog)
      formatter.add(`  ${pageAlias}.once("dialog", lambda dialog: dialog.dismiss())`);
    let code = `${this._awaitPrefix}${this._generateActionCall(subject, actionInContext)}`;
    if (signals.popup) {
      code = `${this._asyncPrefix}with ${pageAlias}.expect_popup() as ${signals.popup.popupAlias}_info {
        ${code}
      }
      ${signals.popup.popupAlias} = ${this._awaitPrefix}${signals.popup.popupAlias}_info.value`;
    }
    if (signals.download) {
      code = `${this._asyncPrefix}with ${pageAlias}.expect_download() as download${signals.download.downloadAlias}_info {
        ${code}
      }
      download${signals.download.downloadAlias} = ${this._awaitPrefix}download${signals.download.downloadAlias}_info.value`;
    }
    formatter.add(code);
    return formatter.format();
  }
  _generateActionCall(subject, actionInContext) {
    const action = actionInContext.action;
    switch (action.name) {
      case "openPage":
        throw Error("Not reached");
      case "closePage":
        return `${subject}.close()`;
      case "click": {
        let method = "click";
        if (action.clickCount === 2)
          method = "dblclick";
        const options = toClickOptionsForSourceCode(action);
        const optionsString = formatOptions(options, false);
        return `${subject}.${this._asLocator(action.selector)}.${method}(${optionsString})`;
      }
      case "hover":
        return `${subject}.${this._asLocator(action.selector)}.hover(${formatOptions({ position: action.position }, false)})`;
      case "check":
        return `${subject}.${this._asLocator(action.selector)}.check()`;
      case "uncheck":
        return `${subject}.${this._asLocator(action.selector)}.uncheck()`;
      case "fill":
        return `${subject}.${this._asLocator(action.selector)}.fill(${quote(action.text)})`;
      case "setInputFiles":
        return `${subject}.${this._asLocator(action.selector)}.set_input_files(${formatValue(action.files.length === 1 ? action.files[0] : action.files)})`;
      case "press": {
        const modifiers = toKeyboardModifiers(action.modifiers);
        const shortcut = [...modifiers, action.key].join("+");
        return `${subject}.${this._asLocator(action.selector)}.press(${quote(shortcut)})`;
      }
      case "navigate":
        return `${subject}.goto(${quote(action.url)})`;
      case "select":
        return `${subject}.${this._asLocator(action.selector)}.select_option(${formatValue(action.options.length === 1 ? action.options[0] : action.options)})`;
      case "assertText":
        return `expect(${subject}.${this._asLocator(action.selector)}).${action.substring ? "to_contain_text" : "to_have_text"}(${quote(action.text)})`;
      case "assertChecked":
        return `expect(${subject}.${this._asLocator(action.selector)}).${action.checked ? "to_be_checked()" : "not_to_be_checked()"}`;
      case "assertVisible":
        return `expect(${subject}.${this._asLocator(action.selector)}).to_be_visible()`;
      case "assertValue": {
        const assertion = action.value ? `to_have_value(${quote(action.value)})` : `to_be_empty()`;
        return `expect(${subject}.${this._asLocator(action.selector)}).${assertion};`;
      }
      case "assertSnapshot":
        return `expect(${subject}.${this._asLocator(action.selector)}).to_match_aria_snapshot(${quote(action.ariaSnapshot)})`;
    }
  }
  _asLocator(selector) {
    return asLocator("python", selector);
  }
  generateHeader(options) {
    const formatter = new PythonFormatter();
    const recordHar = options.contextOptions.recordHar;
    if (this._isPyTest) {
      const contextOptions = formatContextOptions(
        options.contextOptions,
        options.deviceName,
        true
        /* asDict */
      );
      const fixture = contextOptions ? `

@pytest.fixture(scope="session")
def browser_context_args(browser_context_args, playwright) {
    return {${contextOptions}}
}
` : "";
      formatter.add(`${options.deviceName || contextOptions ? "import pytest\n" : ""}import re
from playwright.sync_api import Page, expect
${fixture}

def test_example(page: Page) -> None {`);
      if (recordHar)
        formatter.add(`    page.route_from_har(${quote(recordHar.path)}${typeof recordHar.urlFilter === "string" ? `, url=${quote(recordHar.urlFilter)}` : ""})`);
    } else if (this._isAsync) {
      formatter.add(`
import asyncio
import re
from playwright.async_api import Playwright, async_playwright, expect


async def run(playwright: Playwright) -> None {
    browser = await playwright.${options.browserName}.launch(${formatOptions(options.launchOptions, false)})
    context = await browser.new_context(${formatContextOptions(options.contextOptions, options.deviceName)})`);
      if (recordHar)
        formatter.add(`    await context.route_from_har(${quote(recordHar.path)}${typeof recordHar.urlFilter === "string" ? `, url=${quote(recordHar.urlFilter)}` : ""})`);
    } else {
      formatter.add(`
import re
from playwright.sync_api import Playwright, sync_playwright, expect


def run(playwright: Playwright) -> None {
    browser = playwright.${options.browserName}.launch(${formatOptions(options.launchOptions, false)})
    context = browser.new_context(${formatContextOptions(options.contextOptions, options.deviceName)})`);
      if (recordHar)
        formatter.add(`    context.route_from_har(${quote(recordHar.path)}${typeof recordHar.urlFilter === "string" ? `, url=${quote(recordHar.urlFilter)}` : ""})`);
    }
    return formatter.format();
  }
  generateFooter(saveStorage) {
    if (this._isPyTest) {
      return "";
    } else if (this._isAsync) {
      const storageStateLine = saveStorage ? `
    await context.storage_state(path=${quote(saveStorage)})` : "";
      return `
    # ---------------------${storageStateLine}
    await context.close()
    await browser.close()


async def main() -> None:
    async with async_playwright() as playwright:
        await run(playwright)


asyncio.run(main())
`;
    } else {
      const storageStateLine = saveStorage ? `
    context.storage_state(path=${quote(saveStorage)})` : "";
      return `
    # ---------------------${storageStateLine}
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
`;
    }
  }
}
function formatValue(value) {
  if (value === false)
    return "False";
  if (value === true)
    return "True";
  if (value === void 0)
    return "None";
  if (Array.isArray(value))
    return `[${value.map(formatValue).join(", ")}]`;
  if (typeof value === "string")
    return quote(value);
  if (typeof value === "object")
    return JSON.stringify(value);
  return String(value);
}
function formatOptions(value, hasArguments, asDict) {
  const keys = Object.keys(value).filter((key) => value[key] !== void 0).sort();
  if (!keys.length)
    return "";
  return (hasArguments ? ", " : "") + keys.map((key) => {
    if (asDict)
      return `"${toSnakeCase(key)}": ${formatValue(value[key])}`;
    return `${toSnakeCase(key)}=${formatValue(value[key])}`;
  }).join(", ");
}
function formatContextOptions(options, deviceName, asDict) {
  options = { ...options, recordHar: void 0 };
  const device = deviceName && deviceDescriptors[deviceName];
  if (!device)
    return formatOptions(options, false, asDict);
  return `**playwright.devices[${quote(deviceName)}]` + formatOptions(sanitizeDeviceOptions(device, options), true, asDict);
}
class PythonFormatter {
  constructor(offset = 0) {
    this._lines = [];
    this._baseIndent = " ".repeat(4);
    this._baseOffset = " ".repeat(offset);
  }
  prepend(text) {
    this._lines = text.trim().split("\n").map((line) => line.trim()).concat(this._lines);
  }
  add(text) {
    this._lines.push(...text.trim().split("\n").map((line) => line.trim()));
  }
  newLine() {
    this._lines.push("");
  }
  format() {
    let spaces = "";
    const lines = [];
    this._lines.forEach((line) => {
      if (line === "")
        return lines.push(line);
      if (line === "}") {
        spaces = spaces.substring(this._baseIndent.length);
        return;
      }
      line = spaces + line;
      if (line.endsWith("{")) {
        spaces += this._baseIndent;
        line = line.substring(0, line.length - 1).trimEnd() + ":";
      }
      return lines.push(this._baseOffset + line);
    });
    return lines.join("\n");
  }
}
function quote(text) {
  return escapeWithQuotes(text, '"');
}

export { PythonLanguageGenerator };
