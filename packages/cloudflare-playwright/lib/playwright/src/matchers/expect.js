import { isString, escapeWithQuotes } from '../../../playwright-core/src/utils/isomorphic/stringUtils.js';
import { captureRawStack } from '../../../playwright-core/src/utils/isomorphic/stackTrace.js';
import { pollAgainstDeadline } from '../../../playwright-core/src/utils/isomorphic/timeoutRunner.js';
import '../../../_virtual/pixelmatch.js';
import '../../../playwright-core/src/utilsBundle.js';
import { createGuid } from '../../../playwright-core/src/server/utils/crypto.js';
import '../../../playwright-core/src/server/utils/debug.js';
import '../../../playwright-core/src/server/utils/debugLogger.js';
import '../../../playwright-core/src/server/utils/expectUtils.js';
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
import { currentZone } from '../../../playwright-core/src/server/utils/zones.js';
import { isJestError, ExpectError } from './matcherHint.js';
import { toPass, toHaveValues, toHaveValue, toHaveURL, toHaveTitle, toHaveText, toHaveRole, toHaveJSProperty, toHaveId, toHaveCSS, toHaveCount, toHaveClass, toHaveAttribute, toHaveAccessibleErrorMessage, toHaveAccessibleName, toHaveAccessibleDescription, toContainClass, toContainText, toBeVisible, toBeOK, toBeInViewport, toBeHidden, toBeFocused, toBeEnabled, toBeEmpty, toBeEditable, toBeDisabled, toBeChecked, toBeAttached, computeMatcherTitleSuffix } from './matchers.js';
import { toMatchAriaSnapshot } from './toMatchAriaSnapshot.js';
import { toMatchSnapshot, toHaveScreenshot } from './toMatchSnapshot.js';
import { expect as expect$1 } from '../common/expectBundle.js';
import { currentTestInfo } from '../common/globals.js';
import { filteredStackTrace } from '../util.js';
import { TestInfoImpl } from '../worker/testInfo.js';

function createMatchers(actual, info, prefix) {
  return new Proxy(expect$1(actual), new ExpectMetaInfoProxyHandler(actual, info, prefix));
}
const userMatchersSymbol = Symbol("userMatchers");
function qualifiedMatcherName(qualifier, matcherName) {
  return qualifier.join(":") + "$" + matcherName;
}
function createExpect(info, prefix, userMatchers) {
  const expectInstance = new Proxy(expect$1, {
    apply: function(target, thisArg, argumentsList) {
      const [actual, messageOrOptions] = argumentsList;
      const message = isString(messageOrOptions) ? messageOrOptions : messageOrOptions?.message || info.message;
      const newInfo = { ...info, message };
      if (newInfo.poll) {
        if (typeof actual !== "function")
          throw new Error("`expect.poll()` accepts only function as a first argument");
        newInfo.poll.generator = actual;
      }
      return createMatchers(actual, newInfo, prefix);
    },
    get: function(target, property) {
      if (property === "configure")
        return configure;
      if (property === "extend") {
        return (matchers) => {
          const qualifier = [...prefix, createGuid()];
          const wrappedMatchers = {};
          for (const [name, matcher] of Object.entries(matchers)) {
            wrappedMatchers[name] = wrapPlaywrightMatcherToPassNiceThis(matcher);
            const key = qualifiedMatcherName(qualifier, name);
            wrappedMatchers[key] = wrappedMatchers[name];
            Object.defineProperty(wrappedMatchers[key], "name", { value: name });
          }
          expect$1.extend(wrappedMatchers);
          return createExpect(info, qualifier, { ...userMatchers, ...matchers });
        };
      }
      if (property === "soft") {
        return (actual, messageOrOptions) => {
          return configure({ soft: true })(actual, messageOrOptions);
        };
      }
      if (property === userMatchersSymbol)
        return userMatchers;
      if (property === "poll") {
        return (actual, messageOrOptions) => {
          const poll = isString(messageOrOptions) ? {} : messageOrOptions || {};
          return configure({ _poll: poll })(actual, messageOrOptions);
        };
      }
      return expect$1[property];
    }
  });
  const configure = (configuration) => {
    const newInfo = { ...info };
    if ("message" in configuration)
      newInfo.message = configuration.message;
    if ("timeout" in configuration)
      newInfo.timeout = configuration.timeout;
    if ("soft" in configuration)
      newInfo.isSoft = configuration.soft;
    if ("_poll" in configuration) {
      newInfo.poll = configuration._poll ? { ...info.poll, generator: () => {
      } } : void 0;
      if (typeof configuration._poll === "object") {
        newInfo.poll.timeout = configuration._poll.timeout ?? newInfo.poll.timeout;
        newInfo.poll.intervals = configuration._poll.intervals ?? newInfo.poll.intervals;
      }
    }
    return createExpect(newInfo, prefix, userMatchers);
  };
  return expectInstance;
}
let matcherCallContext;
function setMatcherCallContext(context) {
  matcherCallContext = context;
}
function takeMatcherCallContext() {
  try {
    return matcherCallContext;
  } finally {
    matcherCallContext = void 0;
  }
}
const defaultExpectTimeout = 5e3;
function wrapPlaywrightMatcherToPassNiceThis(matcher) {
  return function(...args) {
    const { isNot, promise, utils } = this;
    const context = takeMatcherCallContext();
    const timeout = context?.expectInfo.timeout ?? context?.testInfo?._projectInternal?.expect?.timeout ?? defaultExpectTimeout;
    const newThis = {
      isNot,
      promise,
      utils,
      timeout,
      _stepInfo: context?.step
    };
    newThis.equals = throwUnsupportedExpectMatcherError;
    return matcher.call(newThis, ...args);
  };
}
function throwUnsupportedExpectMatcherError() {
  throw new Error("It looks like you are using custom expect matchers that are not compatible with Playwright. See https://aka.ms/playwright/expect-compatibility");
}
expect$1.setState({ expand: false });
const customAsyncMatchers = {
  toBeAttached,
  toBeChecked,
  toBeDisabled,
  toBeEditable,
  toBeEmpty,
  toBeEnabled,
  toBeFocused,
  toBeHidden,
  toBeInViewport,
  toBeOK,
  toBeVisible,
  toContainText,
  toContainClass,
  toHaveAccessibleDescription,
  toHaveAccessibleName,
  toHaveAccessibleErrorMessage,
  toHaveAttribute,
  toHaveClass,
  toHaveCount,
  toHaveCSS,
  toHaveId,
  toHaveJSProperty,
  toHaveRole,
  toHaveText,
  toHaveTitle,
  toHaveURL,
  toHaveValue,
  toHaveValues,
  toHaveScreenshot,
  toMatchAriaSnapshot,
  toPass
};
const customMatchers = {
  ...customAsyncMatchers,
  toMatchSnapshot
};
class ExpectMetaInfoProxyHandler {
  constructor(actual, info, prefix) {
    this._actual = actual;
    this._info = { ...info };
    this._prefix = prefix;
  }
  get(target, matcherName, receiver) {
    if (matcherName === "toThrowError")
      matcherName = "toThrow";
    let matcher = Reflect.get(target, matcherName, receiver);
    if (typeof matcherName !== "string")
      return matcher;
    let resolvedMatcherName = matcherName;
    for (let i = this._prefix.length; i > 0; i--) {
      const qualifiedName = qualifiedMatcherName(this._prefix.slice(0, i), matcherName);
      if (Reflect.has(target, qualifiedName)) {
        matcher = Reflect.get(target, qualifiedName, receiver);
        resolvedMatcherName = qualifiedName;
        break;
      }
    }
    if (matcher === void 0)
      throw new Error(`expect: Property '${matcherName}' not found.`);
    if (typeof matcher !== "function") {
      if (matcherName === "not")
        this._info.isNot = !this._info.isNot;
      return new Proxy(matcher, this);
    }
    if (this._info.poll) {
      if (customAsyncMatchers[matcherName] || matcherName === "resolves" || matcherName === "rejects")
        throw new Error(`\`expect.poll()\` does not support "${matcherName}" matcher.`);
      matcher = (...args) => pollMatcher(resolvedMatcherName, this._info, this._prefix, ...args);
    }
    return (...args) => {
      const testInfo = currentTestInfo();
      setMatcherCallContext({ expectInfo: this._info, testInfo });
      if (!testInfo)
        return matcher.call(target, ...args);
      const customMessage = this._info.message || "";
      const suffixes = computeMatcherTitleSuffix(matcherName, this._actual, args);
      const defaultTitle = `${this._info.poll ? "poll " : ""}${this._info.isSoft ? "soft " : ""}${this._info.isNot ? "not " : ""}${matcherName}${suffixes.short || ""}`;
      const shortTitle = customMessage || `Expect ${escapeWithQuotes(defaultTitle, '"')}`;
      const longTitle = shortTitle + (suffixes.long || "");
      const apiName = `expect${this._info.poll ? ".poll " : ""}${this._info.isSoft ? ".soft " : ""}${this._info.isNot ? ".not" : ""}.${matcherName}${suffixes.short || ""}`;
      const stackFrames = filteredStackTrace(captureRawStack());
      const stepInfo = {
        category: "expect",
        apiName,
        title: longTitle,
        shortTitle,
        params: args[0] ? { expected: args[0] } : void 0,
        infectParentStepsWithError: this._info.isSoft
      };
      const step = testInfo._addStep(stepInfo);
      const reportStepError = (e) => {
        const jestError = isJestError(e) ? e : null;
        const expectError = jestError ? new ExpectError(jestError, customMessage, stackFrames) : void 0;
        if (jestError?.matcherResult.suggestedRebaseline) {
          step.complete({ suggestedRebaseline: jestError?.matcherResult.suggestedRebaseline });
          return;
        }
        const error = expectError ?? e;
        step.complete({ error });
        if (this._info.isSoft)
          testInfo._failWithError(error);
        else
          throw error;
      };
      const finalizer = () => {
        step.complete({});
      };
      try {
        setMatcherCallContext({ expectInfo: this._info, testInfo, step: step.info });
        const callback = () => matcher.call(target, ...args);
        const result = currentZone().with("stepZone", step).run(callback);
        if (result instanceof Promise)
          return result.then(finalizer).catch(reportStepError);
        finalizer();
        return result;
      } catch (e) {
        void reportStepError(e);
      }
    };
  }
}
async function pollMatcher(qualifiedMatcherName2, info, prefix, ...args) {
  const testInfo = currentTestInfo();
  const poll = info.poll;
  const timeout = poll.timeout ?? info.timeout ?? testInfo?._projectInternal?.expect?.timeout ?? defaultExpectTimeout;
  const { deadline, timeoutMessage } = testInfo ? testInfo._deadlineForMatcher(timeout) : TestInfoImpl._defaultDeadlineForMatcher(timeout);
  const result = await pollAgainstDeadline(async () => {
    if (testInfo && currentTestInfo() !== testInfo)
      return { continuePolling: false, result: void 0 };
    const innerInfo = {
      ...info,
      isSoft: false,
      // soft is outside of poll, not inside
      poll: void 0
    };
    const value = await poll.generator();
    try {
      let matchers = createMatchers(value, innerInfo, prefix);
      if (info.isNot)
        matchers = matchers.not;
      matchers[qualifiedMatcherName2](...args);
      return { continuePolling: false, result: void 0 };
    } catch (error) {
      return { continuePolling: true, result: error };
    }
  }, deadline, poll.intervals ?? [100, 250, 500, 1e3]);
  if (result.timedOut) {
    const message = result.result ? [
      result.result.message,
      "",
      `Call Log:`,
      `- ${timeoutMessage}`
    ].join("\n") : timeoutMessage;
    throw new Error(message);
  }
}
const expect = createExpect({}, [], {}).extend(customMatchers);
function mergeExpects(...expects) {
  let merged = expect;
  for (const e of expects) {
    const internals = e[userMatchersSymbol];
    if (!internals)
      continue;
    merged = merged.extend(internals);
  }
  return merged;
}

export { expect, mergeExpects };
