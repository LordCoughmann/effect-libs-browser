import { errors } from '../../../index.js';
import { monotonicTime } from '../../../playwright-core/src/utils/isomorphic/time.js';
import { raceAgainstDeadline } from '../../../playwright-core/src/utils/isomorphic/timeoutRunner.js';
import '../../../_virtual/pixelmatch.js';
import '../../../playwright-core/src/utilsBundle.js';
import 'node:crypto';
import '../../../playwright-core/src/server/utils/debug.js';
import '../../../playwright-core/src/server/utils/debugLogger.js';
import { getPackageManagerExecCommand } from '../../../playwright-core/src/server/utils/env.js';
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
import { currentlyLoadingFileSuite, currentTestInfo, setCurrentlyLoadingFileSuite } from './globals.js';
import { TestCase, Suite } from './test.js';
import { expect } from '../matchers/expect.js';
import { wrapFunctionWithLocation } from '../../../mocks/transform.js';
import { validateTestDetails } from './validators.js';

const testTypeSymbol = Symbol("testType");
class TestTypeImpl {
  constructor(fixtures) {
    this.fixtures = fixtures;
    const test = wrapFunctionWithLocation(this._createTest.bind(this, "default"));
    test[testTypeSymbol] = this;
    test.expect = expect;
    test.only = wrapFunctionWithLocation(this._createTest.bind(this, "only"));
    test.describe = wrapFunctionWithLocation(this._describe.bind(this, "default"));
    test.describe.only = wrapFunctionWithLocation(this._describe.bind(this, "only"));
    test.describe.configure = wrapFunctionWithLocation(this._configure.bind(this));
    test.describe.fixme = wrapFunctionWithLocation(this._describe.bind(this, "fixme"));
    test.describe.parallel = wrapFunctionWithLocation(this._describe.bind(this, "parallel"));
    test.describe.parallel.only = wrapFunctionWithLocation(this._describe.bind(this, "parallel.only"));
    test.describe.serial = wrapFunctionWithLocation(this._describe.bind(this, "serial"));
    test.describe.serial.only = wrapFunctionWithLocation(this._describe.bind(this, "serial.only"));
    test.describe.skip = wrapFunctionWithLocation(this._describe.bind(this, "skip"));
    test.beforeEach = wrapFunctionWithLocation(this._hook.bind(this, "beforeEach"));
    test.afterEach = wrapFunctionWithLocation(this._hook.bind(this, "afterEach"));
    test.beforeAll = wrapFunctionWithLocation(this._hook.bind(this, "beforeAll"));
    test.afterAll = wrapFunctionWithLocation(this._hook.bind(this, "afterAll"));
    test.skip = wrapFunctionWithLocation(this._modifier.bind(this, "skip"));
    test.fixme = wrapFunctionWithLocation(this._modifier.bind(this, "fixme"));
    test.fail = wrapFunctionWithLocation(this._modifier.bind(this, "fail"));
    test.fail.only = wrapFunctionWithLocation(this._createTest.bind(this, "fail.only"));
    test.slow = wrapFunctionWithLocation(this._modifier.bind(this, "slow"));
    test.setTimeout = wrapFunctionWithLocation(this._setTimeout.bind(this));
    test.step = this._step.bind(this, "pass");
    test.step.skip = this._step.bind(this, "skip");
    test.use = wrapFunctionWithLocation(this._use.bind(this));
    test.extend = wrapFunctionWithLocation(this._extend.bind(this));
    test.info = () => {
      const result = currentTestInfo();
      if (!result)
        throw new Error("test.info() can only be called while test is running");
      return result;
    };
    this.test = test;
  }
  _currentSuite(location, title) {
    const suite = currentlyLoadingFileSuite();
    if (!suite) {
      throw new Error([
        `Playwright Test did not expect ${title} to be called here.`,
        `Most common reasons include:`,
        `- You are calling ${title} in a configuration file.`,
        `- You are calling ${title} in a file that is imported by the configuration file.`,
        `- You have two different versions of @playwright/test. This usually happens`,
        `  when one of the dependencies in your package.json depends on @playwright/test.`
      ].join("\n"));
    }
    return suite;
  }
  _createTest(type, location, title, fnOrDetails, fn) {
    throwIfRunningInsideJest();
    const suite = this._currentSuite(location, "test()");
    if (!suite)
      return;
    let details;
    let body;
    if (typeof fnOrDetails === "function") {
      body = fnOrDetails;
      details = {};
    } else {
      body = fn;
      details = fnOrDetails;
    }
    const validatedDetails = validateTestDetails(details, location);
    const test = new TestCase(title, body, this, location);
    test._requireFile = suite._requireFile;
    test.annotations.push(...validatedDetails.annotations);
    test._tags.push(...validatedDetails.tags);
    suite._addTest(test);
    if (type === "only" || type === "fail.only")
      test._only = true;
    if (type === "skip" || type === "fixme" || type === "fail")
      test.annotations.push({ type, location });
    else if (type === "fail.only")
      test.annotations.push({ type: "fail", location });
  }
  _describe(type, location, titleOrFn, fnOrDetails, fn) {
    throwIfRunningInsideJest();
    const suite = this._currentSuite(location, "test.describe()");
    if (!suite)
      return;
    let title;
    let body;
    let details;
    if (typeof titleOrFn === "function") {
      title = "";
      details = {};
      body = titleOrFn;
    } else if (typeof fnOrDetails === "function") {
      title = titleOrFn;
      details = {};
      body = fnOrDetails;
    } else {
      title = titleOrFn;
      details = fnOrDetails;
      body = fn;
    }
    const validatedDetails = validateTestDetails(details, location);
    const child = new Suite(title, "describe");
    child._requireFile = suite._requireFile;
    child.location = location;
    child._staticAnnotations.push(...validatedDetails.annotations);
    child._tags.push(...validatedDetails.tags);
    suite._addSuite(child);
    if (type === "only" || type === "serial.only" || type === "parallel.only")
      child._only = true;
    if (type === "serial" || type === "serial.only")
      child._parallelMode = "serial";
    if (type === "parallel" || type === "parallel.only")
      child._parallelMode = "parallel";
    if (type === "skip" || type === "fixme")
      child._staticAnnotations.push({ type, location });
    for (let parent = suite; parent; parent = parent.parent) {
      if (parent._parallelMode === "serial" && child._parallelMode === "parallel")
        throw new Error("describe.parallel cannot be nested inside describe.serial");
      if (parent._parallelMode === "default" && child._parallelMode === "parallel")
        throw new Error("describe.parallel cannot be nested inside describe with default mode");
    }
    setCurrentlyLoadingFileSuite(child);
    body();
    setCurrentlyLoadingFileSuite(suite);
  }
  _hook(name, location, title, fn) {
    const suite = this._currentSuite(location, `test.${name}()`);
    if (!suite)
      return;
    if (typeof title === "function") {
      fn = title;
      title = `${name} hook`;
    }
    suite._hooks.push({ type: name, fn, title, location });
  }
  _configure(location, options) {
    throwIfRunningInsideJest();
    const suite = this._currentSuite(location, `test.describe.configure()`);
    if (!suite)
      return;
    if (options.timeout !== void 0)
      suite._timeout = options.timeout;
    if (options.retries !== void 0)
      suite._retries = options.retries;
    if (options.mode !== void 0) {
      if (suite._parallelMode !== "none")
        throw new Error(`"${suite._parallelMode}" mode is already assigned for the enclosing scope.`);
      suite._parallelMode = options.mode;
      for (let parent = suite.parent; parent; parent = parent.parent) {
        if (parent._parallelMode === "serial" && suite._parallelMode === "parallel")
          throw new Error("describe with parallel mode cannot be nested inside describe with serial mode");
        if (parent._parallelMode === "default" && suite._parallelMode === "parallel")
          throw new Error("describe with parallel mode cannot be nested inside describe with default mode");
      }
    }
  }
  _modifier(type, location, ...modifierArgs) {
    const suite = currentlyLoadingFileSuite();
    if (suite) {
      if (typeof modifierArgs[0] === "string" && typeof modifierArgs[1] === "function" && (type === "skip" || type === "fixme" || type === "fail")) {
        this._createTest(type, location, modifierArgs[0], modifierArgs[1]);
        return;
      }
      if (typeof modifierArgs[0] === "string" && typeof modifierArgs[1] === "object" && typeof modifierArgs[2] === "function" && (type === "skip" || type === "fixme" || type === "fail")) {
        this._createTest(type, location, modifierArgs[0], modifierArgs[1], modifierArgs[2]);
        return;
      }
      if (typeof modifierArgs[0] === "function") {
        suite._modifiers.push({ type, fn: modifierArgs[0], location, description: modifierArgs[1] });
      } else {
        if (modifierArgs.length >= 1 && !modifierArgs[0])
          return;
        const description = modifierArgs[1];
        suite._staticAnnotations.push({ type, description, location });
      }
      return;
    }
    const testInfo = currentTestInfo();
    if (!testInfo)
      throw new Error(`test.${type}() can only be called inside test, describe block or fixture`);
    if (typeof modifierArgs[0] === "function")
      throw new Error(`test.${type}() with a function can only be called inside describe block`);
    testInfo._modifier(type, location, modifierArgs);
  }
  _setTimeout(location, timeout) {
    const suite = currentlyLoadingFileSuite();
    if (suite) {
      suite._timeout = timeout;
      return;
    }
    const testInfo = currentTestInfo();
    if (!testInfo)
      throw new Error(`test.setTimeout() can only be called from a test`);
    testInfo.setTimeout(timeout);
  }
  _use(location, fixtures) {
    const suite = this._currentSuite(location, `test.use()`);
    if (!suite)
      return;
    suite._use.push({ fixtures, location });
  }
  async _step(expectation, title, body, options = {}) {
    const testInfo = currentTestInfo();
    if (!testInfo)
      throw new Error(`test.step() can only be called from a test`);
    const step = testInfo._addStep({ category: "test.step", title, location: options.location, box: options.box });
    return await currentZone().with("stepZone", step).run(async () => {
      try {
        let result = void 0;
        result = await raceAgainstDeadline(async () => {
          try {
            return await step.info._runStepBody(expectation === "skip", body, step.location);
          } catch (e) {
            if (result?.timedOut)
              testInfo._failWithError(e);
            throw e;
          }
        }, options.timeout ? monotonicTime() + options.timeout : 0);
        if (result.timedOut)
          throw new errors.TimeoutError(`Step timeout of ${options.timeout}ms exceeded.`);
        step.complete({});
        return result.result;
      } catch (error) {
        step.complete({ error });
        throw error;
      }
    });
  }
  _extend(location, fixtures) {
    if (fixtures[testTypeSymbol])
      throw new Error(`test.extend() accepts fixtures object, not a test object.
Did you mean to call mergeTests()?`);
    const fixturesWithLocation = { fixtures, location };
    return new TestTypeImpl([...this.fixtures, fixturesWithLocation]).test;
  }
}
function throwIfRunningInsideJest() {
  if (process.env.JEST_WORKER_ID) {
    const packageManagerCommand = getPackageManagerExecCommand();
    throw new Error(
      `Playwright Test needs to be invoked via '${packageManagerCommand} playwright test' and excluded from Jest test runs.
Creating one directory for Playwright tests and one for Jest is the recommended way of doing it.
See https://playwright.dev/docs/intro for more information about Playwright Test.`
    );
  }
}
const rootTestType = new TestTypeImpl([]);
function mergeTests(...tests) {
  let result = rootTestType;
  for (const t of tests) {
    const testTypeImpl = t[testTypeSymbol];
    if (!testTypeImpl)
      throw new Error(`mergeTests() accepts "test" functions as parameters.
Did you mean to call test.extend() with fixtures instead?`);
    const newFixtures = testTypeImpl.fixtures.filter((theirs) => !result.fixtures.find((ours) => ours.fixtures === theirs.fixtures));
    result = new TestTypeImpl([...result.fixtures, ...newFixtures]);
  }
  return result.test;
}

export { TestTypeImpl, mergeTests, rootTestType };
