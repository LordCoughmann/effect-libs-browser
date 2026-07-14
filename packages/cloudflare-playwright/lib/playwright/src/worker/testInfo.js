import fs from 'node:fs';
import path__default from 'node:path';
import { escapeWithQuotes } from '../../../playwright-core/src/utils/isomorphic/stringUtils.js';
import { ManualPromise } from '../../../playwright-core/src/utils/isomorphic/manualPromise.js';
import { captureRawStack, stringifyStackFrames } from '../../../playwright-core/src/utils/isomorphic/stackTrace.js';
import { monotonicTime } from '../../../playwright-core/src/utils/isomorphic/time.js';
import '../../../_virtual/pixelmatch.js';
import '../../../playwright-core/src/utilsBundle.js';
import { createGuid } from '../../../playwright-core/src/server/utils/crypto.js';
import '../../../playwright-core/src/server/utils/debug.js';
import '../../../playwright-core/src/server/utils/debugLogger.js';
import '../../../playwright-core/src/server/utils/expectUtils.js';
import { sanitizeForFilePath } from '../../../playwright-core/src/server/utils/fileUtils.js';
import '../../../playwright-core/src/server/utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../../../playwright-core/src/server/utils/happyEyeballs.js';
import '../../../playwright-core/src/server/utils/nodePlatform.js';
import '../../../playwright-core/src/server/utils/profiler.js';
import '../../../playwright-core/src/server/utils/socksProxy.js';
import 'node:os';
import '../../../playwright-core/src/zipBundle.js';
import { currentZone } from '../../../playwright-core/src/server/utils/zones.js';
import { TimeoutManager, kMaxDeadline, TimeoutManagerError } from './timeoutManager.js';
import { trimLongString, filteredStackTrace, normalizeAndSaveAttachment, getContainedPath, sanitizeFilePathBeforeExtension, addSuffixToFilePath, windowsFilesystemFriendlyLength } from '../util.js';
import { TestTracing } from './testTracing.js';
import { testInfoError } from './util.js';
import { wrapFunctionWithLocation } from '../../../mocks/transform.js';

const emtpyTestInfoCallbacks = {
  onStepBegin: () => {
  },
  onStepEnd: () => {
  },
  onAttach: () => {
  },
  onTestPaused: () => Promise.reject(new Error("TestInfoImpl not initialized")),
  onCloneStorage: () => Promise.reject(new Error("TestInfoImpl not initialized")),
  onUpstreamStorage: () => Promise.resolve()
};
class TestInfoImpl {
  constructor(configInternal, projectInternal, workerParams, test, retry, callbacks) {
    this._snapshotNames = { lastAnonymousSnapshotIndex: 0, lastNamedSnapshotIndex: {} };
    this._ariaSnapshotNames = { lastAnonymousSnapshotIndex: 0, lastNamedSnapshotIndex: {} };
    this._interruptedPromise = new ManualPromise();
    this._lastStepId = 0;
    this._steps = [];
    this._stepMap = /* @__PURE__ */ new Map();
    this._hasNonRetriableError = false;
    this._hasUnhandledError = false;
    this._allowSkips = false;
    this.duration = 0;
    this.annotations = [];
    this.attachments = [];
    this.status = "passed";
    this.snapshotSuffix = "";
    this.errors = [];
    this.testId = test?.id ?? "";
    this._callbacks = callbacks;
    this._startTime = monotonicTime();
    this._startWallTime = Date.now();
    this._requireFile = test?._requireFile ?? "";
    this._uniqueSymbol = Symbol("testInfoUniqueSymbol");
    this._workerParams = workerParams;
    this.repeatEachIndex = workerParams.repeatEachIndex;
    this.retry = retry;
    this.workerIndex = workerParams.workerIndex;
    this.parallelIndex = workerParams.parallelIndex;
    this._projectInternal = projectInternal;
    this.project = projectInternal.project;
    this._configInternal = configInternal;
    this.config = configInternal.config;
    this.title = test?.title ?? "";
    this.titlePath = test?.titlePath() ?? [];
    this.file = test?.location.file ?? "";
    this.line = test?.location.line ?? 0;
    this.column = test?.location.column ?? 0;
    this.tags = test?.tags ?? [];
    this.fn = test?.fn ?? (() => {
    });
    this.expectedStatus = test?.expectedStatus ?? "skipped";
    this._timeoutManager = new TimeoutManager(this.project.timeout);
    if (configInternal.configCLIOverrides.debug)
      this._setDebugMode();
    this.outputDir = (() => {
      const relativeTestFilePath = path__default.relative(this.project.testDir, this._requireFile.replace(/\.(spec|test)\.(js|ts|jsx|tsx|mjs|mts|cjs|cts)$/, ""));
      const sanitizedRelativePath = relativeTestFilePath.replace(process.platform === "win32" ? new RegExp("\\\\", "g") : new RegExp("/", "g"), "-");
      const fullTitleWithoutSpec = this.titlePath.slice(1).join(" ");
      let testOutputDir = trimLongString(sanitizedRelativePath + "-" + sanitizeForFilePath(fullTitleWithoutSpec), windowsFilesystemFriendlyLength);
      if (projectInternal.id)
        testOutputDir += "-" + sanitizeForFilePath(projectInternal.id);
      if (this.retry)
        testOutputDir += "-retry" + this.retry;
      if (this.repeatEachIndex)
        testOutputDir += "-repeat" + this.repeatEachIndex;
      return path__default.join(this.project.outputDir, testOutputDir);
    })();
    this.snapshotDir = (() => {
      const relativeTestFilePath = path__default.relative(this.project.testDir, this._requireFile);
      return path__default.join(this.project.snapshotDir, relativeTestFilePath + "-snapshots");
    })();
    this._attachmentsPush = this.attachments.push.bind(this.attachments);
    const attachmentsPush = (...attachments) => {
      for (const a of attachments)
        this._attach(a, this._parentStep()?.stepId);
      return this.attachments.length;
    };
    Object.defineProperty(this.attachments, "push", {
      value: attachmentsPush,
      writable: true,
      enumerable: false,
      configurable: true
    });
    this._tracing = new TestTracing(this, workerParams.artifactsDir);
    this.skip = wrapFunctionWithLocation((location, ...args) => this._modifier("skip", location, args));
    this.fixme = wrapFunctionWithLocation((location, ...args) => this._modifier("fixme", location, args));
    this.fail = wrapFunctionWithLocation((location, ...args) => this._modifier("fail", location, args));
    this.slow = wrapFunctionWithLocation((location, ...args) => this._modifier("slow", location, args));
  }
  get error() {
    return this.errors[0];
  }
  set error(e) {
    if (e === void 0)
      throw new Error("Cannot assign testInfo.error undefined value!");
    this.errors[0] = e;
  }
  get timeout() {
    return this._timeoutManager.defaultSlot().timeout;
  }
  set timeout(timeout) {
  }
  _deadlineForMatcher(timeout) {
    const startTime = monotonicTime();
    const matcherDeadline = timeout ? startTime + timeout : kMaxDeadline;
    const testDeadline = this._timeoutManager.currentSlotDeadline() - 250;
    const matcherMessage = `Timeout ${timeout}ms exceeded while waiting on the predicate`;
    const testMessage = `Test timeout of ${this.timeout}ms exceeded`;
    return { deadline: Math.min(testDeadline, matcherDeadline), timeoutMessage: testDeadline < matcherDeadline ? testMessage : matcherMessage };
  }
  static _defaultDeadlineForMatcher(timeout) {
    return { deadline: timeout ? monotonicTime() + timeout : 0, timeoutMessage: `Timeout ${timeout}ms exceeded while waiting on the predicate` };
  }
  _modifier(type, location, modifierArgs) {
    if (typeof modifierArgs[1] === "function") {
      throw new Error([
        "It looks like you are calling test.skip() inside the test and pass a callback.",
        "Pass a condition instead and optional description instead:",
        `test('my test', async ({ page, isMobile }) => {`,
        `  test.skip(isMobile, 'This test is not applicable on mobile');`,
        `});`
      ].join("\n"));
    }
    if (modifierArgs.length >= 1 && !modifierArgs[0])
      return;
    const description = modifierArgs[1];
    this.annotations.push({ type, description, location });
    if (type === "slow") {
      this._timeoutManager.slow();
    } else if (type === "skip" || type === "fixme") {
      this.expectedStatus = "skipped";
      throw new TestSkipError("Test is skipped: " + (description || ""));
    } else if (type === "fail") {
      if (this.expectedStatus !== "skipped")
        this.expectedStatus = "failed";
    }
  }
  _findLastPredefinedStep(steps) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const child = this._findLastPredefinedStep(steps[i].steps);
      if (child)
        return child;
      if ((steps[i].category === "hook" || steps[i].category === "fixture") && !steps[i].endWallTime)
        return steps[i];
    }
  }
  _parentStep() {
    return currentZone().data("stepZone") ?? this._findLastPredefinedStep(this._steps);
  }
  _addStep(data, parentStep) {
    const stepId = `${data.category}@${++this._lastStepId}`;
    if (data.category === "hook" || data.category === "fixture") {
      parentStep = this._findLastPredefinedStep(this._steps);
    } else {
      if (!parentStep)
        parentStep = this._parentStep();
    }
    const filteredStack = filteredStackTrace(captureRawStack());
    let boxedStack = parentStep?.boxedStack;
    let location = data.location;
    if (!boxedStack && data.box) {
      boxedStack = filteredStack.slice(1);
      location = location || boxedStack[0];
    }
    location = location || filteredStack[0];
    const step = {
      ...data,
      stepId,
      group: parentStep?.group ?? data.group,
      boxedStack,
      location,
      steps: [],
      attachmentIndices: [],
      info: new TestStepInfoImpl(this, stepId, data.title, parentStep?.info),
      complete: (result) => {
        if (step.endWallTime)
          return;
        step.endWallTime = Date.now();
        if (result.error) {
          if (typeof result.error === "object" && !result.error?.[stepSymbol])
            result.error[stepSymbol] = step;
          const error = testInfoError(result.error);
          if (step.boxedStack)
            error.stack = `${error.message}
${stringifyStackFrames(step.boxedStack).join("\n")}`;
          step.error = error;
        }
        if (!step.error) {
          for (const childStep of step.steps) {
            if (childStep.error && childStep.infectParentStepsWithError) {
              step.error = childStep.error;
              step.infectParentStepsWithError = true;
              break;
            }
          }
        }
        if (!step.group) {
          const payload = {
            testId: this.testId,
            stepId,
            wallTime: step.endWallTime,
            error: step.error,
            suggestedRebaseline: result.suggestedRebaseline,
            annotations: step.info.annotations
          };
          this._callbacks.onStepEnd(payload);
        }
        if (step.group !== "internal") {
          const errorForTrace = step.error ? { name: "", message: step.error.message || "", stack: step.error.stack } : void 0;
          const attachments = step.attachmentIndices.map((i) => this.attachments[i]);
          this._tracing.appendAfterActionForStep(stepId, errorForTrace, attachments, step.info.annotations);
        }
      }
    };
    const parentStepList = parentStep ? parentStep.steps : this._steps;
    parentStepList.push(step);
    this._stepMap.set(stepId, step);
    if (!step.group) {
      const payload = {
        testId: this.testId,
        stepId,
        parentStepId: parentStep ? parentStep.stepId : void 0,
        title: step.title,
        category: step.category,
        wallTime: Date.now(),
        location: step.location
      };
      this._callbacks.onStepBegin(payload);
    }
    if (step.group !== "internal") {
      this._tracing.appendBeforeActionForStep({
        stepId,
        parentId: parentStep?.stepId,
        title: step.shortTitle ?? step.title,
        category: step.category,
        params: step.params,
        stack: step.location ? [step.location] : [],
        group: step.group
      });
    }
    return step;
  }
  _interrupt() {
    this._interruptedPromise.resolve();
    this._timeoutManager.interrupt();
    if (this.status === "passed")
      this.status = "interrupted";
  }
  _failWithError(error) {
    if (this.status === "passed" || this.status === "skipped")
      this.status = error instanceof TimeoutManagerError ? "timedOut" : "failed";
    const serialized = testInfoError(error);
    const step = typeof error === "object" ? error?.[stepSymbol] : void 0;
    if (step && step.boxedStack)
      serialized.stack = `${error.name}: ${error.message}
${stringifyStackFrames(step.boxedStack).join("\n")}`;
    this.errors.push(serialized);
    this._tracing.appendForError(serialized);
  }
  async _runAsStep(stepInfo, cb) {
    const step = this._addStep(stepInfo);
    try {
      await cb();
      step.complete({});
    } catch (error) {
      step.complete({ error });
      throw error;
    }
  }
  async _runWithTimeout(runnable, cb) {
    try {
      await this._timeoutManager.withRunnable(runnable, async () => {
        try {
          await cb();
        } catch (e) {
          if (this._allowSkips && e instanceof TestSkipError) {
            if (this.status === "passed")
              this.status = "skipped";
          } else {
            this._failWithError(e);
          }
          throw e;
        }
      });
    } catch (error) {
      if (!this._interruptedPromise.isDone() && error instanceof TimeoutManagerError)
        this._failWithError(error);
      throw error;
    }
  }
  _isFailure() {
    return this.status !== "skipped" && this.status !== this.expectedStatus;
  }
  _currentHookType() {
    const type = this._timeoutManager.currentSlotType();
    return ["beforeAll", "afterAll", "beforeEach", "afterEach"].includes(type) ? type : void 0;
  }
  _setDebugMode() {
    this._timeoutManager.setIgnoreTimeouts();
  }
  async _didFinishTestFunction() {
    const shouldPause = this._workerParams.pauseAtEnd && !this._isFailure() || this._workerParams.pauseOnError && this._isFailure();
    if (shouldPause) {
      await Promise.race([
        this._callbacks.onTestPaused({ testId: this.testId, errors: this._isFailure() ? this.errors : [], status: this.status }),
        this._interruptedPromise
      ]);
    }
    await this._onDidFinishTestFunctionCallback?.();
  }
  // ------------ TestInfo methods ------------
  async attach(name, options = {}) {
    const step = this._addStep({
      title: `Attach ${escapeWithQuotes(name, '"')}`,
      category: "test.attach"
    });
    this._attach(
      await normalizeAndSaveAttachment(this.outputPath(), name, options),
      step.stepId
    );
    step.complete({});
  }
  _attach(attachment, stepId) {
    const index = this._attachmentsPush(attachment) - 1;
    let step = stepId ? this._stepMap.get(stepId) : void 0;
    if (!!step?.group)
      step = void 0;
    if (step) {
      step.attachmentIndices.push(index);
    } else {
      const stepId2 = `attach@${createGuid()}`;
      this._tracing.appendBeforeActionForStep({ stepId: stepId2, title: `Attach ${escapeWithQuotes(attachment.name, '"')}`, category: "test.attach", stack: [] });
      this._tracing.appendAfterActionForStep(stepId2, void 0, [attachment]);
    }
    this._callbacks.onAttach({
      testId: this.testId,
      name: attachment.name,
      contentType: attachment.contentType,
      path: attachment.path,
      body: attachment.body?.toString("base64"),
      stepId: step?.stepId
    });
  }
  outputPath(...pathSegments) {
    const outputPath = this._getOutputPath(...pathSegments);
    fs.mkdirSync(this.outputDir, { recursive: true });
    return outputPath;
  }
  _getOutputPath(...pathSegments) {
    const joinedPath = path__default.join(...pathSegments);
    const outputPath = getContainedPath(this.outputDir, joinedPath);
    if (outputPath)
      return outputPath;
    throw new Error(`The outputPath is not allowed outside of the parent directory. Please fix the defined path.

	outputPath: ${joinedPath}`);
  }
  _fsSanitizedTestName() {
    const fullTitleWithoutSpec = this.titlePath.slice(1).join(" ");
    return sanitizeForFilePath(trimLongString(fullTitleWithoutSpec));
  }
  _resolveSnapshotPaths(kind, name, updateSnapshotIndex, anonymousExtension) {
    const snapshotNames = kind === "aria" ? this._ariaSnapshotNames : this._snapshotNames;
    const defaultExtensions = { "aria": ".aria.yml", "screenshot": ".png", "snapshot": ".txt" };
    const ariaAwareExtname = (filePath) => kind === "aria" && filePath.endsWith(".aria.yml") ? ".aria.yml" : path__default.extname(filePath);
    let subPath;
    let ext;
    let relativeOutputPath;
    if (!name) {
      const index = snapshotNames.lastAnonymousSnapshotIndex + 1;
      if (updateSnapshotIndex === "updateSnapshotIndex")
        snapshotNames.lastAnonymousSnapshotIndex = index;
      const fullTitleWithoutSpec = [...this.titlePath.slice(1), index].join(" ");
      ext = anonymousExtension ?? defaultExtensions[kind];
      subPath = sanitizeFilePathBeforeExtension(trimLongString(fullTitleWithoutSpec) + ext, ext);
      relativeOutputPath = sanitizeFilePathBeforeExtension(trimLongString(fullTitleWithoutSpec, windowsFilesystemFriendlyLength) + ext, ext);
    } else {
      if (Array.isArray(name)) {
        subPath = path__default.join(...name);
        relativeOutputPath = path__default.join(...name);
        ext = ariaAwareExtname(subPath);
      } else {
        ext = ariaAwareExtname(name);
        subPath = sanitizeFilePathBeforeExtension(name, ext);
        relativeOutputPath = sanitizeFilePathBeforeExtension(trimLongString(name, windowsFilesystemFriendlyLength), ext);
      }
      const index = (snapshotNames.lastNamedSnapshotIndex[relativeOutputPath] || 0) + 1;
      if (updateSnapshotIndex === "updateSnapshotIndex")
        snapshotNames.lastNamedSnapshotIndex[relativeOutputPath] = index;
      if (index > 1)
        relativeOutputPath = addSuffixToFilePath(relativeOutputPath, `-${index - 1}`);
    }
    const legacyTemplate = "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}";
    let template;
    if (kind === "screenshot") {
      template = this._projectInternal.expect?.toHaveScreenshot?.pathTemplate || this._projectInternal.snapshotPathTemplate || legacyTemplate;
    } else if (kind === "aria") {
      const ariaDefaultTemplate = "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}";
      template = this._projectInternal.expect?.toMatchAriaSnapshot?.pathTemplate || this._projectInternal.snapshotPathTemplate || ariaDefaultTemplate;
    } else {
      template = this._projectInternal.snapshotPathTemplate || legacyTemplate;
    }
    const nameArgument = path__default.join(path__default.dirname(subPath), path__default.basename(subPath, ext));
    const absoluteSnapshotPath = this._applyPathTemplate(template, nameArgument, ext);
    return { absoluteSnapshotPath, relativeOutputPath };
  }
  _applyPathTemplate(template, nameArgument, ext) {
    const relativeTestFilePath = path__default.relative(this.project.testDir, this._requireFile);
    const parsedRelativeTestFilePath = path__default.parse(relativeTestFilePath);
    const projectNamePathSegment = sanitizeForFilePath(this.project.name);
    const snapshotPath = template.replace(/\{(.)?testDir\}/g, "$1" + this.project.testDir).replace(/\{(.)?snapshotDir\}/g, "$1" + this.project.snapshotDir).replace(/\{(.)?snapshotSuffix\}/g, this.snapshotSuffix ? "$1" + this.snapshotSuffix : "").replace(/\{(.)?testFileDir\}/g, "$1" + parsedRelativeTestFilePath.dir).replace(/\{(.)?platform\}/g, "$1" + process.platform).replace(/\{(.)?projectName\}/g, projectNamePathSegment ? "$1" + projectNamePathSegment : "").replace(/\{(.)?testName\}/g, "$1" + this._fsSanitizedTestName()).replace(/\{(.)?testFileName\}/g, "$1" + parsedRelativeTestFilePath.base).replace(/\{(.)?testFilePath\}/g, "$1" + relativeTestFilePath).replace(/\{(.)?arg\}/g, "$1" + nameArgument).replace(/\{(.)?ext\}/g, ext ? "$1" + ext : "");
    return path__default.normalize(path__default.resolve(this._configInternal.configDir, snapshotPath));
  }
  snapshotPath(...args) {
    let name = args;
    let kind = "snapshot";
    const options = args[args.length - 1];
    if (options && typeof options === "object") {
      kind = options.kind ?? kind;
      name = args.slice(0, -1);
    }
    if (!["snapshot", "screenshot", "aria"].includes(kind))
      throw new Error(`testInfo.snapshotPath: unknown kind "${kind}", must be one of "snapshot", "screenshot" or "aria"`);
    return this._resolveSnapshotPaths(kind, name.length <= 1 ? name[0] : name, "dontUpdateSnapshotIndex").absoluteSnapshotPath;
  }
  setTimeout(timeout) {
    this._timeoutManager.setTimeout(timeout);
  }
  async _cloneStorage(storageFile) {
    return await this._callbacks.onCloneStorage({ storageFile });
  }
  async _upstreamStorage(storageFile, storageOutFile) {
    await this._callbacks.onUpstreamStorage({ storageFile, storageOutFile });
  }
  artifactsDir() {
    return this._workerParams.artifactsDir;
  }
}
class TestStepInfoImpl {
  constructor(testInfo, stepId, title, parentStep) {
    this.annotations = [];
    this._testInfo = testInfo;
    this._stepId = stepId;
    this._title = title;
    this._parentStep = parentStep;
    this.skip = wrapFunctionWithLocation((location, ...args) => {
      if (args.length > 0 && !args[0])
        return;
      const description = args[1];
      this.annotations.push({ type: "skip", description, location });
      throw new StepSkipError(description);
    });
  }
  async _runStepBody(skip, body, location) {
    if (skip) {
      this.annotations.push({ type: "skip", location });
      return void 0;
    }
    try {
      return await body(this);
    } catch (e) {
      if (e instanceof StepSkipError)
        return void 0;
      throw e;
    }
  }
  _attachToStep(attachment) {
    this._testInfo._attach(attachment, this._stepId);
  }
  async attach(name, options) {
    this._attachToStep(await normalizeAndSaveAttachment(this._testInfo.outputPath(), name, options));
  }
  get titlePath() {
    const parent = this._parentStep ?? this._testInfo;
    return [...parent.titlePath, this._title];
  }
}
class TestSkipError extends Error {
}
class StepSkipError extends Error {
}
const stepSymbol = Symbol("step");

export { StepSkipError, TestInfoImpl, TestSkipError, TestStepInfoImpl, emtpyTestInfoCallbacks };
