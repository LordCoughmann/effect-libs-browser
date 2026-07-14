import { asLocatorDescription } from '../../../playwright-core/src/utils/isomorphic/locatorGenerators.js';
import { isTextualMimeType } from '../../../playwright-core/src/utils/isomorphic/mimeType.js';
import { isRegExp } from '../../../playwright-core/src/utils/isomorphic/rtti.js';
import { isString } from '../../../playwright-core/src/utils/isomorphic/stringUtils.js';
import { pollAgainstDeadline } from '../../../playwright-core/src/utils/isomorphic/timeoutRunner.js';
import { constructURLBasedOnBaseURL } from '../../../playwright-core/src/utils/isomorphic/urlMatch.js';
import '../../../_virtual/pixelmatch.js';
import { colors } from '../../../playwright-core/src/utilsBundle.js';
import 'node:crypto';
import '../../../playwright-core/src/server/utils/debug.js';
import '../../../playwright-core/src/server/utils/debugLogger.js';
import { serializeExpectedTextValues, formatMatcherMessage } from '../../../playwright-core/src/server/utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../../../playwright-core/src/zipBundle.js';
import '../../../playwright-core/src/server/utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../../../playwright-core/src/server/utils/happyEyeballs.js';
import '../../../playwright-core/src/server/utils/nodePlatform.js';
import '../../../playwright-core/src/server/utils/profiler.js';
import '../../../playwright-core/src/server/utils/socksProxy.js';
import 'node:os';
import '../../../playwright-core/src/server/utils/zones.js';
import { expectTypes } from '../util.js';
import { toBeTruthy } from './toBeTruthy.js';
import { toEqual } from './toEqual.js';
import { toHaveURLWithPredicate } from './toHaveURL.js';
import { toMatchText } from './toMatchText.js';
import { toHaveScreenshotStepTitle } from './toMatchSnapshot.js';
import { takeFirst } from '../common/config.js';
import { currentTestInfo } from '../common/globals.js';
import { TestInfoImpl } from '../worker/testInfo.js';

function toBeAttached(locator, options) {
  const attached = !options || options.attached === void 0 || options.attached;
  const expected = attached ? "attached" : "detached";
  const arg = attached ? "" : "{ attached: false }";
  return toBeTruthy.call(this, "toBeAttached", locator, "Locator", expected, arg, async (isNot, timeout) => {
    return await locator._expect(attached ? "to.be.attached" : "to.be.detached", { isNot, timeout });
  }, options);
}
function toBeChecked(locator, options) {
  const checked = options?.checked;
  const indeterminate = options?.indeterminate;
  const expectedValue = {
    checked,
    indeterminate
  };
  let expected;
  let arg;
  if (options?.indeterminate) {
    expected = "indeterminate";
    arg = `{ indeterminate: true }`;
  } else {
    expected = options?.checked === false ? "unchecked" : "checked";
    arg = options?.checked === false ? `{ checked: false }` : "";
  }
  return toBeTruthy.call(this, "toBeChecked", locator, "Locator", expected, arg, async (isNot, timeout) => {
    return await locator._expect("to.be.checked", { isNot, timeout, expectedValue });
  }, options);
}
function toBeDisabled(locator, options) {
  return toBeTruthy.call(this, "toBeDisabled", locator, "Locator", "disabled", "", async (isNot, timeout) => {
    return await locator._expect("to.be.disabled", { isNot, timeout });
  }, options);
}
function toBeEditable(locator, options) {
  const editable = !options || options.editable === void 0 || options.editable;
  const expected = editable ? "editable" : "readOnly";
  const arg = editable ? "" : "{ editable: false }";
  return toBeTruthy.call(this, "toBeEditable", locator, "Locator", expected, arg, async (isNot, timeout) => {
    return await locator._expect(editable ? "to.be.editable" : "to.be.readonly", { isNot, timeout });
  }, options);
}
function toBeEmpty(locator, options) {
  return toBeTruthy.call(this, "toBeEmpty", locator, "Locator", "empty", "", async (isNot, timeout) => {
    return await locator._expect("to.be.empty", { isNot, timeout });
  }, options);
}
function toBeEnabled(locator, options) {
  const enabled = !options || options.enabled === void 0 || options.enabled;
  const expected = enabled ? "enabled" : "disabled";
  const arg = enabled ? "" : "{ enabled: false }";
  return toBeTruthy.call(this, "toBeEnabled", locator, "Locator", expected, arg, async (isNot, timeout) => {
    return await locator._expect(enabled ? "to.be.enabled" : "to.be.disabled", { isNot, timeout });
  }, options);
}
function toBeFocused(locator, options) {
  return toBeTruthy.call(this, "toBeFocused", locator, "Locator", "focused", "", async (isNot, timeout) => {
    return await locator._expect("to.be.focused", { isNot, timeout });
  }, options);
}
function toBeHidden(locator, options) {
  return toBeTruthy.call(this, "toBeHidden", locator, "Locator", "hidden", "", async (isNot, timeout) => {
    return await locator._expect("to.be.hidden", { isNot, timeout });
  }, options);
}
function toBeVisible(locator, options) {
  const visible = !options || options.visible === void 0 || options.visible;
  const expected = visible ? "visible" : "hidden";
  const arg = visible ? "" : "{ visible: false }";
  return toBeTruthy.call(this, "toBeVisible", locator, "Locator", expected, arg, async (isNot, timeout) => {
    return await locator._expect(visible ? "to.be.visible" : "to.be.hidden", { isNot, timeout });
  }, options);
}
function toBeInViewport(locator, options) {
  return toBeTruthy.call(this, "toBeInViewport", locator, "Locator", "in viewport", "", async (isNot, timeout) => {
    return await locator._expect("to.be.in.viewport", { isNot, expectedNumber: options?.ratio, timeout });
  }, options);
}
function toContainText(locator, expected, options = {}) {
  if (Array.isArray(expected)) {
    return toEqual.call(this, "toContainText", locator, "Locator", async (isNot, timeout) => {
      const expectedText = serializeExpectedTextValues(expected, { matchSubstring: true, normalizeWhiteSpace: true, ignoreCase: options.ignoreCase });
      return await locator._expect("to.contain.text.array", { expectedText, isNot, useInnerText: options.useInnerText, timeout });
    }, expected, { ...options, contains: true });
  } else {
    return toMatchText.call(this, "toContainText", locator, "Locator", async (isNot, timeout) => {
      const expectedText = serializeExpectedTextValues([expected], { matchSubstring: true, normalizeWhiteSpace: true, ignoreCase: options.ignoreCase });
      return await locator._expect("to.have.text", { expectedText, isNot, useInnerText: options.useInnerText, timeout });
    }, expected, { ...options, matchSubstring: true });
  }
}
function toHaveAccessibleDescription(locator, expected, options) {
  return toMatchText.call(this, "toHaveAccessibleDescription", locator, "Locator", async (isNot, timeout) => {
    const expectedText = serializeExpectedTextValues([expected], { ignoreCase: options?.ignoreCase, normalizeWhiteSpace: true });
    return await locator._expect("to.have.accessible.description", { expectedText, isNot, timeout });
  }, expected, options);
}
function toHaveAccessibleName(locator, expected, options) {
  return toMatchText.call(this, "toHaveAccessibleName", locator, "Locator", async (isNot, timeout) => {
    const expectedText = serializeExpectedTextValues([expected], { ignoreCase: options?.ignoreCase, normalizeWhiteSpace: true });
    return await locator._expect("to.have.accessible.name", { expectedText, isNot, timeout });
  }, expected, options);
}
function toHaveAccessibleErrorMessage(locator, expected, options) {
  return toMatchText.call(this, "toHaveAccessibleErrorMessage", locator, "Locator", async (isNot, timeout) => {
    const expectedText = serializeExpectedTextValues([expected], { ignoreCase: options?.ignoreCase, normalizeWhiteSpace: true });
    return await locator._expect("to.have.accessible.error.message", { expectedText, isNot, timeout });
  }, expected, options);
}
function toHaveAttribute(locator, name, expected, options) {
  if (!options) {
    if (typeof expected === "object" && !isRegExp(expected)) {
      options = expected;
      expected = void 0;
    }
  }
  if (expected === void 0) {
    return toBeTruthy.call(this, "toHaveAttribute", locator, "Locator", "have attribute", "", async (isNot, timeout) => {
      return await locator._expect("to.have.attribute", { expressionArg: name, isNot, timeout });
    }, options);
  }
  return toMatchText.call(this, "toHaveAttribute", locator, "Locator", async (isNot, timeout) => {
    const expectedText = serializeExpectedTextValues([expected], { ignoreCase: options?.ignoreCase });
    return await locator._expect("to.have.attribute.value", { expressionArg: name, expectedText, isNot, timeout });
  }, expected, options);
}
function toHaveClass(locator, expected, options) {
  if (Array.isArray(expected)) {
    return toEqual.call(this, "toHaveClass", locator, "Locator", async (isNot, timeout) => {
      const expectedText = serializeExpectedTextValues(expected);
      return await locator._expect("to.have.class.array", { expectedText, isNot, timeout });
    }, expected, options);
  } else {
    return toMatchText.call(this, "toHaveClass", locator, "Locator", async (isNot, timeout) => {
      const expectedText = serializeExpectedTextValues([expected]);
      return await locator._expect("to.have.class", { expectedText, isNot, timeout });
    }, expected, options);
  }
}
function toContainClass(locator, expected, options) {
  if (Array.isArray(expected)) {
    if (expected.some((e) => isRegExp(e)))
      throw new Error(`"expected" argument in toContainClass cannot contain RegExp values`);
    return toEqual.call(this, "toContainClass", locator, "Locator", async (isNot, timeout) => {
      const expectedText = serializeExpectedTextValues(expected);
      return await locator._expect("to.contain.class.array", { expectedText, isNot, timeout });
    }, expected, options);
  } else {
    if (isRegExp(expected))
      throw new Error(`"expected" argument in toContainClass cannot be a RegExp value`);
    return toMatchText.call(this, "toContainClass", locator, "Locator", async (isNot, timeout) => {
      const expectedText = serializeExpectedTextValues([expected]);
      return await locator._expect("to.contain.class", { expectedText, isNot, timeout });
    }, expected, options);
  }
}
function toHaveCount(locator, expected, options) {
  return toEqual.call(this, "toHaveCount", locator, "Locator", async (isNot, timeout) => {
    return await locator._expect("to.have.count", { expectedNumber: expected, isNot, timeout });
  }, expected, options);
}
function toHaveCSS(locator, name, expected, options) {
  return toMatchText.call(this, "toHaveCSS", locator, "Locator", async (isNot, timeout) => {
    const expectedText = serializeExpectedTextValues([expected]);
    return await locator._expect("to.have.css", { expressionArg: name, expectedText, isNot, timeout });
  }, expected, options);
}
function toHaveId(locator, expected, options) {
  return toMatchText.call(this, "toHaveId", locator, "Locator", async (isNot, timeout) => {
    const expectedText = serializeExpectedTextValues([expected]);
    return await locator._expect("to.have.id", { expectedText, isNot, timeout });
  }, expected, options);
}
function toHaveJSProperty(locator, name, expected, options) {
  return toEqual.call(this, "toHaveJSProperty", locator, "Locator", async (isNot, timeout) => {
    return await locator._expect("to.have.property", { expressionArg: name, expectedValue: expected, isNot, timeout });
  }, expected, options);
}
function toHaveRole(locator, expected, options) {
  if (!isString(expected))
    throw new Error(`"role" argument in toHaveRole must be a string`);
  return toMatchText.call(this, "toHaveRole", locator, "Locator", async (isNot, timeout) => {
    const expectedText = serializeExpectedTextValues([expected]);
    return await locator._expect("to.have.role", { expectedText, isNot, timeout });
  }, expected, options);
}
function toHaveText(locator, expected, options = {}) {
  if (Array.isArray(expected)) {
    return toEqual.call(this, "toHaveText", locator, "Locator", async (isNot, timeout) => {
      const expectedText = serializeExpectedTextValues(expected, { normalizeWhiteSpace: true, ignoreCase: options.ignoreCase });
      return await locator._expect("to.have.text.array", { expectedText, isNot, useInnerText: options?.useInnerText, timeout });
    }, expected, options);
  } else {
    return toMatchText.call(this, "toHaveText", locator, "Locator", async (isNot, timeout) => {
      const expectedText = serializeExpectedTextValues([expected], { normalizeWhiteSpace: true, ignoreCase: options.ignoreCase });
      return await locator._expect("to.have.text", { expectedText, isNot, useInnerText: options?.useInnerText, timeout });
    }, expected, options);
  }
}
function toHaveValue(locator, expected, options) {
  return toMatchText.call(this, "toHaveValue", locator, "Locator", async (isNot, timeout) => {
    const expectedText = serializeExpectedTextValues([expected]);
    return await locator._expect("to.have.value", { expectedText, isNot, timeout });
  }, expected, options);
}
function toHaveValues(locator, expected, options) {
  return toEqual.call(this, "toHaveValues", locator, "Locator", async (isNot, timeout) => {
    const expectedText = serializeExpectedTextValues(expected);
    return await locator._expect("to.have.values", { expectedText, isNot, timeout });
  }, expected, options);
}
function toHaveTitle(page, expected, options = {}) {
  return toMatchText.call(this, "toHaveTitle", page, "Page", async (isNot, timeout) => {
    const expectedText = serializeExpectedTextValues([expected], { normalizeWhiteSpace: true });
    return await page.mainFrame()._expect("to.have.title", { expectedText, isNot, timeout });
  }, expected, options);
}
function toHaveURL(page, expected, options) {
  if (typeof expected === "function")
    return toHaveURLWithPredicate.call(this, page, expected, options);
  const baseURL = page.context()._options.baseURL;
  expected = typeof expected === "string" ? constructURLBasedOnBaseURL(baseURL, expected) : expected;
  return toMatchText.call(this, "toHaveURL", page, "Page", async (isNot, timeout) => {
    const expectedText = serializeExpectedTextValues([expected], { ignoreCase: options?.ignoreCase });
    return await page.mainFrame()._expect("to.have.url", { expectedText, isNot, timeout });
  }, expected, options);
}
async function toBeOK(response) {
  const matcherName = "toBeOK";
  expectTypes(response, ["APIResponse"], matcherName);
  const contentType = response.headers()["content-type"];
  const isTextEncoding = contentType && isTextualMimeType(contentType);
  const [log, text] = this.isNot === response.ok() ? await Promise.all([
    response._fetchLog(),
    isTextEncoding ? response.text() : null
  ]) : [];
  const message = () => formatMatcherMessage(this.utils, {
    isNot: this.isNot,
    promise: this.promise,
    matcherName,
    receiver: "response",
    expectation: "",
    log
  }) + (text === null ? "" : `
Response text:
${colors.dim(text?.substring(0, 1e3) || "")}`);
  const pass = response.ok();
  return { message, pass };
}
async function toPass(callback, options = {}) {
  const testInfo = currentTestInfo();
  const timeout = takeFirst(options.timeout, testInfo?._projectInternal.expect?.toPass?.timeout, 0);
  const intervals = takeFirst(options.intervals, testInfo?._projectInternal.expect?.toPass?.intervals, [100, 250, 500, 1e3]);
  const { deadline, timeoutMessage } = testInfo ? testInfo._deadlineForMatcher(timeout) : TestInfoImpl._defaultDeadlineForMatcher(timeout);
  const result = await pollAgainstDeadline(async () => {
    if (testInfo && currentTestInfo() !== testInfo)
      return { continuePolling: false, result: void 0 };
    try {
      await callback();
      return { continuePolling: !!this.isNot, result: void 0 };
    } catch (e) {
      return { continuePolling: !this.isNot, result: e };
    }
  }, deadline, intervals);
  if (result.timedOut) {
    const message = result.result ? [
      result.result.message,
      "",
      `Call Log:`,
      `- ${timeoutMessage}`
    ].join("\n") : timeoutMessage;
    return { message: () => message, pass: !!this.isNot };
  }
  return { pass: !this.isNot, message: () => "" };
}
function computeMatcherTitleSuffix(matcherName, receiver, args) {
  if (matcherName === "toHaveScreenshot") {
    const title = toHaveScreenshotStepTitle(...args);
    return { short: title ? `(${title})` : "" };
  }
  if (receiver && typeof receiver === "object" && receiver.constructor?.name === "Locator") {
    try {
      return { long: " " + asLocatorDescription("javascript", receiver._selector) };
    } catch {
    }
  }
  return {};
}

export { computeMatcherTitleSuffix, toBeAttached, toBeChecked, toBeDisabled, toBeEditable, toBeEmpty, toBeEnabled, toBeFocused, toBeHidden, toBeInViewport, toBeOK, toBeVisible, toContainClass, toContainText, toHaveAccessibleDescription, toHaveAccessibleErrorMessage, toHaveAccessibleName, toHaveAttribute, toHaveCSS, toHaveClass, toHaveCount, toHaveId, toHaveJSProperty, toHaveRole, toHaveText, toHaveTitle, toHaveURL, toHaveValue, toHaveValues, toPass };
