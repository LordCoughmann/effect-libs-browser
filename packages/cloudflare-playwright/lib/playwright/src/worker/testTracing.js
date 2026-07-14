import fs from 'node:fs';
import path__default from 'node:path';
import { ManualPromise } from '../../../playwright-core/src/utils/isomorphic/manualPromise.js';
import { monotonicTime } from '../../../playwright-core/src/utils/isomorphic/time.js';
import '../../../_virtual/pixelmatch.js';
import '../../../playwright-core/src/utilsBundle.js';
import { createGuid, calculateSha1 } from '../../../playwright-core/src/server/utils/crypto.js';
import '../../../playwright-core/src/server/utils/debug.js';
import '../../../playwright-core/src/server/utils/debugLogger.js';
import '../../../playwright-core/src/server/utils/expectUtils.js';
import { SerializedFS } from '../../../playwright-core/src/server/utils/fileUtils.js';
import '../../../playwright-core/src/server/utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../../../playwright-core/src/server/utils/happyEyeballs.js';
import '../../../playwright-core/src/server/utils/nodePlatform.js';
import '../../../playwright-core/src/server/utils/profiler.js';
import '../../../playwright-core/src/server/utils/socksProxy.js';
import { getPlaywrightVersion } from '../../../playwright-core/src/server/utils/userAgent.js';
import { yazl, yauzl } from '../../../playwright-core/src/zipBundle.js';
import '../../../playwright-core/src/server/utils/zones.js';
import { filteredStackTrace } from '../util.js';

const testTraceEntryName = "test.trace";
const version = 8;
let traceOrdinal = 0;
class TestTracing {
  constructor(testInfo, artifactsDir) {
    this._traceEvents = [];
    this._temporaryTraceFiles = [];
    this._didFinishTestFunctionAndAfterEachHooks = false;
    this._testInfo = testInfo;
    this._artifactsDir = artifactsDir;
    this._tracesDir = path__default.join(this._artifactsDir, "traces");
    this._contextCreatedEvent = {
      version,
      type: "context-options",
      origin: "testRunner",
      browserName: "",
      playwrightVersion: getPlaywrightVersion(),
      options: {},
      platform: process.platform,
      wallTime: Date.now(),
      monotonicTime: monotonicTime(),
      sdkLanguage: "javascript"
    };
    this._appendTraceEvent(this._contextCreatedEvent);
  }
  _shouldCaptureTrace() {
    if (this._options?.mode === "on")
      return true;
    if (this._options?.mode === "retain-on-failure")
      return true;
    if (this._options?.mode === "on-first-retry" && this._testInfo.retry === 1)
      return true;
    if (this._options?.mode === "on-all-retries" && this._testInfo.retry > 0)
      return true;
    if (this._options?.mode === "retain-on-first-failure" && this._testInfo.retry === 0)
      return true;
    return false;
  }
  async startIfNeeded(value) {
    const defaultTraceOptions = { screenshots: true, snapshots: true, sources: true, attachments: true, _live: false, mode: "off" };
    if (!value) {
      this._options = defaultTraceOptions;
    } else if (typeof value === "string") {
      this._options = { ...defaultTraceOptions, mode: value === "retry-with-trace" ? "on-first-retry" : value };
    } else {
      const mode = value.mode || "off";
      this._options = { ...defaultTraceOptions, ...value, mode: mode === "retry-with-trace" ? "on-first-retry" : mode };
    }
    if (!this._shouldCaptureTrace()) {
      this._options = void 0;
      return;
    }
    if (!this._liveTraceFile && this._options._live) {
      this._liveTraceFile = { file: path__default.join(this._tracesDir, `${this._testInfo.testId}-test.trace`), fs: new SerializedFS() };
      this._liveTraceFile.fs.mkdir(path__default.dirname(this._liveTraceFile.file));
      const data = this._traceEvents.map((e) => JSON.stringify(e)).join("\n") + "\n";
      this._liveTraceFile.fs.writeFile(this._liveTraceFile.file, data);
    }
  }
  didFinishTestFunctionAndAfterEachHooks() {
    this._didFinishTestFunctionAndAfterEachHooks = true;
  }
  artifactsDir() {
    return this._artifactsDir;
  }
  tracesDir() {
    return this._tracesDir;
  }
  traceTitle() {
    return [path__default.relative(this._testInfo.project.testDir, this._testInfo.file) + ":" + this._testInfo.line, ...this._testInfo.titlePath.slice(1)].join(" › ");
  }
  generateNextTraceRecordingName() {
    const ordinalSuffix = traceOrdinal ? `-recording${traceOrdinal}` : "";
    ++traceOrdinal;
    const retrySuffix = this._testInfo.retry ? `-retry${this._testInfo.retry}` : "";
    return `${this._testInfo.testId}${retrySuffix}${ordinalSuffix}`;
  }
  _generateNextTraceRecordingPath() {
    const file = path__default.join(this._artifactsDir, createGuid() + ".zip");
    this._temporaryTraceFiles.push(file);
    return file;
  }
  traceOptions() {
    return this._options;
  }
  maybeGenerateNextTraceRecordingPath() {
    if (this._didFinishTestFunctionAndAfterEachHooks && this._shouldAbandonTrace())
      return;
    return this._generateNextTraceRecordingPath();
  }
  _shouldAbandonTrace() {
    if (!this._options)
      return true;
    const testFailed = this._testInfo.status !== this._testInfo.expectedStatus;
    return !testFailed && (this._options.mode === "retain-on-failure" || this._options.mode === "retain-on-first-failure");
  }
  async stopIfNeeded() {
    if (!this._options)
      return;
    const error = await this._liveTraceFile?.fs.syncAndGetError();
    if (error)
      throw error;
    if (this._shouldAbandonTrace()) {
      for (const file of this._temporaryTraceFiles)
        await fs.promises.unlink(file).catch(() => {
        });
      return;
    }
    const zipFile = new yazl.ZipFile();
    if (!this._options?.attachments) {
      for (const event of this._traceEvents) {
        if (event.type === "after")
          delete event.attachments;
      }
    }
    if (this._options?.sources) {
      const sourceFiles = /* @__PURE__ */ new Set();
      for (const event of this._traceEvents) {
        if (event.type === "before") {
          for (const frame of event.stack || [])
            sourceFiles.add(frame.file);
        }
      }
      for (const sourceFile of sourceFiles) {
        await fs.promises.readFile(sourceFile, "utf8").then((source) => {
          zipFile.addBuffer(Buffer.from(source), "resources/src@" + calculateSha1(sourceFile) + ".txt");
        }).catch(() => {
        });
      }
    }
    const sha1s = /* @__PURE__ */ new Set();
    for (const event of this._traceEvents.filter((e) => e.type === "after")) {
      for (const attachment of event.attachments || []) {
        let contentPromise;
        if (attachment.path)
          contentPromise = fs.promises.readFile(attachment.path).catch(() => void 0);
        else if (attachment.base64)
          contentPromise = Promise.resolve(Buffer.from(attachment.base64, "base64"));
        const content = await contentPromise;
        if (content === void 0)
          continue;
        const sha1 = calculateSha1(content);
        attachment.sha1 = sha1;
        delete attachment.path;
        delete attachment.base64;
        if (sha1s.has(sha1))
          continue;
        sha1s.add(sha1);
        zipFile.addBuffer(content, "resources/" + sha1);
      }
    }
    const traceContent = Buffer.from(this._traceEvents.map((e) => JSON.stringify(e)).join("\n"));
    zipFile.addBuffer(traceContent, testTraceEntryName);
    await new Promise((f) => {
      zipFile.end(void 0, () => {
        zipFile.outputStream.pipe(fs.createWriteStream(this._generateNextTraceRecordingPath())).on("close", f);
      });
    });
    const tracePath = this._testInfo.outputPath("trace.zip");
    await mergeTraceFiles(tracePath, this._temporaryTraceFiles);
    this._testInfo.attachments.push({ name: "trace", path: tracePath, contentType: "application/zip" });
  }
  appendForError(error) {
    const rawStack = error.stack?.split("\n") || [];
    const stack = rawStack ? filteredStackTrace(rawStack) : [];
    this._appendTraceEvent({
      type: "error",
      message: this._formatError(error),
      stack
    });
  }
  _formatError(error) {
    const parts = [error.message || String(error.value)];
    if (error.cause)
      parts.push("[cause]: " + this._formatError(error.cause));
    return parts.join("\n");
  }
  appendStdioToTrace(type, chunk) {
    this._appendTraceEvent({
      type,
      timestamp: monotonicTime(),
      text: typeof chunk === "string" ? chunk : void 0,
      base64: typeof chunk === "string" ? void 0 : chunk.toString("base64")
    });
  }
  appendBeforeActionForStep(options) {
    this._appendTraceEvent({
      type: "before",
      callId: options.stepId,
      stepId: options.stepId,
      parentId: options.parentId,
      startTime: monotonicTime(),
      class: "Test",
      method: options.category,
      title: options.title,
      params: Object.fromEntries(Object.entries(options.params || {}).map(([name, value]) => [name, generatePreview(value)])),
      stack: options.stack,
      group: options.group
    });
  }
  appendAfterActionForStep(callId, error, attachments = [], annotations) {
    this._appendTraceEvent({
      type: "after",
      callId,
      endTime: monotonicTime(),
      attachments: serializeAttachments(attachments),
      annotations,
      error
    });
  }
  _appendTraceEvent(event) {
    this._traceEvents.push(event);
    if (this._liveTraceFile)
      this._liveTraceFile.fs.appendFile(this._liveTraceFile.file, JSON.stringify(event) + "\n", true);
  }
}
function serializeAttachments(attachments) {
  if (attachments.length === 0)
    return void 0;
  return attachments.filter((a) => a.name !== "trace").map((a) => {
    return {
      name: a.name,
      contentType: a.contentType,
      path: a.path,
      base64: a.body?.toString("base64")
    };
  });
}
function generatePreview(value, visited = /* @__PURE__ */ new Set()) {
  if (visited.has(value))
    return "";
  visited.add(value);
  if (typeof value === "string")
    return value;
  if (typeof value === "number")
    return value.toString();
  if (typeof value === "boolean")
    return value.toString();
  if (value === null)
    return "null";
  if (value === void 0)
    return "undefined";
  if (Array.isArray(value))
    return "[" + value.map((v) => generatePreview(v, visited)).join(", ") + "]";
  if (typeof value === "object")
    return "Object";
  return String(value);
}
async function mergeTraceFiles(fileName, temporaryTraceFiles) {
  temporaryTraceFiles = temporaryTraceFiles.filter((file) => fs.existsSync(file));
  if (temporaryTraceFiles.length === 1) {
    await fs.promises.rename(temporaryTraceFiles[0], fileName);
    return;
  }
  const mergePromise = new ManualPromise();
  const zipFile = new yazl.ZipFile();
  const entryNames = /* @__PURE__ */ new Set();
  zipFile.on("error", (error) => mergePromise.reject(error));
  for (let i = temporaryTraceFiles.length - 1; i >= 0; --i) {
    const tempFile = temporaryTraceFiles[i];
    const promise = new ManualPromise();
    yauzl.open(tempFile, (err, inZipFile) => {
      if (err) {
        promise.reject(err);
        return;
      }
      let pendingEntries = inZipFile.entryCount;
      inZipFile.on("entry", (entry) => {
        let entryName = entry.fileName;
        if (entry.fileName === testTraceEntryName) ; else if (entry.fileName.match(/trace\.[a-z]*$/)) {
          entryName = i + "-" + entry.fileName;
        }
        if (entryNames.has(entryName)) {
          if (--pendingEntries === 0)
            promise.resolve();
          return;
        }
        entryNames.add(entryName);
        inZipFile.openReadStream(entry, (err2, readStream) => {
          if (err2) {
            promise.reject(err2);
            return;
          }
          zipFile.addReadStream(readStream, entryName);
          if (--pendingEntries === 0)
            promise.resolve();
        });
      });
    });
    await promise;
  }
  zipFile.end(void 0, () => {
    zipFile.outputStream.pipe(fs.createWriteStream(fileName)).on("close", () => {
      void Promise.all(temporaryTraceFiles.map((tempFile) => fs.promises.unlink(tempFile))).then(() => {
        mergePromise.resolve();
      }).catch((error) => mergePromise.reject(error));
    }).on("error", (error) => mergePromise.reject(error));
  });
  await mergePromise;
}

export { TestTracing, testTraceEntryName };
