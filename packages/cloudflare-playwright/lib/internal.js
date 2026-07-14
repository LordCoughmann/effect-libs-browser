import fs from 'node:fs';
import { asLocatorDescription } from './playwright-core/src/utils/isomorphic/locatorGenerators.js';
export { asLocator } from './playwright-core/src/utils/isomorphic/locatorGenerators.js';
import { ManualPromise } from './playwright-core/src/utils/isomorphic/manualPromise.js';
import { renderTitleForCall } from './playwright-core/src/utils/isomorphic/protocolFormatter.js';
import { timeOrigin, setTimeOrigin } from './playwright-core/src/utils/isomorphic/time.js';
import './_virtual/pixelmatch.js';
import { debug } from './playwright-core/src/utilsBundle.js';
export { HttpsProxyAgent, PNG, ProgramOption, SocksProxyAgent, colors, diff, dotenv, getProxyForUrl, jpegjs, lockfile, mime, minimatch, ms, open, program, progress, ws, wsReceiver, wsSender, wsServer, yaml } from './playwright-core/src/utilsBundle.js';
import 'node:crypto';
export { isUnderTest } from './playwright-core/src/server/utils/debug.js';
import './playwright-core/src/server/utils/debugLogger.js';
import './playwright-core/src/server/utils/expectUtils.js';
import 'node:path';
export { extract, yauzl, yazl } from './playwright-core/src/zipBundle.js';
import './playwright-core/src/server/utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import './playwright-core/src/server/utils/happyEyeballs.js';
import './playwright-core/src/server/utils/nodePlatform.js';
import './playwright-core/src/server/utils/profiler.js';
import './playwright-core/src/server/utils/socksProxy.js';
import 'node:os';
import { currentZone } from './playwright-core/src/server/utils/zones.js';
import { loadConfig } from './playwright/src/common/configLoader.js';
import { setCurrentlyLoadingFileSuite, currentTestInfo } from './playwright/src/common/globals.js';
import { bindFileSuiteToProject } from './playwright/src/common/suiteUtils.js';
import { Suite, TestCase } from './playwright/src/common/test.js';
import { rootTestType } from './playwright/src/common/testType.js';
export { mergeTests } from './playwright/src/common/testType.js';
import { WorkerMain } from './playwright/src/worker/workerMain.js';
import { isUnsupportedOperationError } from './cloudflare/unsupportedOperations.js';
import playwright from './index.js';

debug.log = (...args) => console.log(...args);
const _baseTest = rootTestType.test;
const _rootSuites = [];
function setCurrentTestFile(file) {
  if (!file) {
    setCurrentlyLoadingFileSuite(void 0);
    return;
  }
  const suite = new Suite(file, "file");
  suite._requireFile = `/bundle/${file}`;
  suite.location = { file, line: 0, column: 0 };
  setCurrentlyLoadingFileSuite(suite);
  _rootSuites.push(suite);
}
function toInfo(test) {
  if (test instanceof Suite) {
    return {
      type: test._type,
      file: test._requireFile,
      title: test.title,
      fullTitle: test.titlePath().join(" > "),
      entries: test._entries.map(toInfo)
    };
  } else if (test instanceof TestCase) {
    return {
      type: "test",
      file: test._requireFile,
      title: test.title,
      fullTitle: test.titlePath().join(" > "),
      testId: test.id
    };
  }
  throw new Error("Invalid test");
}
const playwrightTestConfig = {
  projects: [
    {
      timeout: 5e3,
      name: "chromium",
      outputDir: "/tmp/test-results",
      testDir: "/bundle"
    }
  ]
};
const configLocation = {
  resolvedConfigFile: "/bundle/playwright.config.ts",
  configDir: "/bundle"
};
async function bindSuites() {
  const fullConfig = await loadConfig(configLocation);
  const [project] = fullConfig.projects;
  return _rootSuites.map((s) => bindFileSuiteToProject(project, s));
}
async function testSuites() {
  const suites = await bindSuites();
  return suites.map(toInfo);
}
class TestWorker extends WorkerMain {
  constructor(options) {
    super({
      workerIndex: 0,
      parallelIndex: 0,
      repeatEachIndex: 0,
      projectId: playwrightTestConfig.projects[0].name,
      config: {
        location: configLocation,
        configCLIOverrides: {
          timeout: 5e3,
          ...options
        }
      },
      artifactsDir: `/tmp/tests`,
      recoverFromStepErrors: false
    });
    this._donePromise = new ManualPromise();
    this._attachments = [];
  }
  async testResult() {
    return await this._donePromise;
  }
  dispatchEvent(method, params) {
    if (method === "attach") {
      const { name, body, path, contentType } = params;
      let fileContent;
      if (!body) {
        if (!path)
          throw new Error("Either body or path must be provided");
        if (!fs.existsSync(path))
          throw new Error(`File does not exist: ${path}`);
        fileContent = fs.readFileSync(path, "base64");
      }
      this._attachments.push({ name, body: body ?? fileContent, contentType });
    }
    if (method === "testEnd")
      this._testResult = params;
    if (method === "done") {
      if (!this._testResult) {
        this._testResult = {
          testId: params.testId,
          errors: params.fatalErrors ?? [],
          annotations: [],
          expectedStatus: "passed",
          status: "failed",
          hasNonRetriableError: false,
          duration: 0,
          timeout: 0
        };
      }
      this._donePromise.resolve({
        ...this._testResult,
        attachments: this._attachments
      });
    }
  }
}
let context;
function currentTestContext() {
  if (!context)
    throw new Error(`Test context not initialized`);
  return context;
}
class TestRunner {
  constructor(testContext, options) {
    this._testContext = testContext;
    this._options = options;
  }
  async runTest(file, testId) {
    if (timeOrigin() === 0 && Date.now() !== 0)
      setTimeOrigin(Date.now());
    context = this._testContext;
    const testWorker = new TestWorker(this._options);
    try {
      const { retry } = this._testContext;
      const [result] = await Promise.all([
        testWorker.testResult(),
        testWorker.runTestGroup({ file, entries: [{ testId, retry }] })
      ]);
      if (result.status === "failed" && result.errors.some(isUnsupportedOperationError)) {
        return {
          ...result,
          status: "skipped",
          expectedStatus: "skipped"
        };
      }
      return result;
    } finally {
      await testWorker.gracefullyClose();
      context = void 0;
    }
  }
}
const tracingGroupSteps = [];
const expectApiListener = {
  onApiCallBegin: (data, channel) => {
    const testInfo = currentTestInfo();
    if (!testInfo || data.apiName.includes("setTestIdAttribute") || data.apiName === "tracing.groupEnd")
      return;
    const zone = currentZone().data("stepZone");
    if (zone && zone.category === "expect") {
      if (zone.apiName)
        data.apiName = zone.apiName;
      if (zone.title)
        data.title = zone.title;
      data.stepId = zone.stepId;
      return;
    }
    const step = testInfo._addStep({
      location: data.frames[0],
      category: "pw:api",
      title: renderTitle(channel.type, channel.method, channel.params, data.title),
      apiName: data.apiName,
      params: channel.params
    }, tracingGroupSteps[tracingGroupSteps.length - 1]);
    data.userData = step;
    data.stepId = step.stepId;
    if (data.apiName === "tracing.group")
      tracingGroupSteps.push(step);
  },
  onApiCallEnd: (data) => {
    if (data.apiName === "tracing.group")
      return;
    if (data.apiName === "tracing.groupEnd") {
      const step2 = tracingGroupSteps.pop();
      step2?.complete({ error: data.error });
      return;
    }
    const step = data.userData;
    step?.complete({ error: data.error });
  }
};
function renderTitle(type, method, params, title) {
  const prefix = renderTitleForCall({ title, type, method, params });
  let selector;
  if (params?.["selector"] && typeof params.selector === "string")
    selector = asLocatorDescription("javascript", params.selector);
  return prefix + (selector ? ` ${selector}` : "");
}
async function runWithExpectApiListener(fn) {
  playwright._instrumentation.addListener(expectApiListener);
  try {
    return await fn();
  } finally {
    playwright._instrumentation.removeListener(expectApiListener);
  }
}

export { TestRunner, _baseTest, _rootSuites, configLocation, currentTestContext, debug, playwrightTestConfig, runWithExpectApiListener, setCurrentTestFile, testSuites };
