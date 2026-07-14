import path__default from 'node:path';
import '../../../_virtual/pixelmatch.js';
import '../../../playwright-core/src/utilsBundle.js';
import { calculateSha1 } from '../../../playwright-core/src/server/utils/crypto.js';
import '../../../playwright-core/src/server/utils/debug.js';
import '../../../playwright-core/src/server/utils/debugLogger.js';
import '../../../playwright-core/src/server/utils/expectUtils.js';
import { toPosixPath } from '../../../playwright-core/src/server/utils/fileUtils.js';
import '../../../playwright-core/src/server/utils/hostPlatform.js';
import 'node:fs';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../../../playwright-core/src/server/utils/happyEyeballs.js';
import '../../../playwright-core/src/server/utils/nodePlatform.js';
import '../../../playwright-core/src/server/utils/profiler.js';
import '../../../playwright-core/src/server/utils/socksProxy.js';
import 'node:os';
import '../../../playwright-core/src/zipBundle.js';
import '../../../playwright-core/src/server/utils/zones.js';
import '../util.js';

function filterTestsRemoveEmptySuites(suite, filter) {
  const filteredSuites = suite.suites.filter((child) => filterTestsRemoveEmptySuites(child, filter));
  const filteredTests = suite.tests.filter(filter);
  const entries = /* @__PURE__ */ new Set([...filteredSuites, ...filteredTests]);
  suite._entries = suite._entries.filter((e) => entries.has(e));
  return !!suite._entries.length;
}
function bindFileSuiteToProject(project, suite) {
  const relativeFile = path__default.relative(project.project.testDir, suite.location.file);
  const fileId = calculateSha1(toPosixPath(relativeFile)).slice(0, 20);
  const result = suite._deepClone();
  result._fileId = fileId;
  result.forEachTest((test, suite2) => {
    suite2._fileId = fileId;
    const [file, ...titles] = test.titlePath();
    const testIdExpression = `[project=${project.id}]${toPosixPath(file)}${titles.join("")}`;
    const testId = fileId + "-" + calculateSha1(testIdExpression).slice(0, 20);
    test.id = testId;
    test._projectId = project.id;
    let inheritedRetries;
    let inheritedTimeout;
    for (let parentSuite = suite2; parentSuite; parentSuite = parentSuite.parent) {
      if (parentSuite._staticAnnotations.length)
        test.annotations.unshift(...parentSuite._staticAnnotations);
      if (inheritedRetries === void 0 && parentSuite._retries !== void 0)
        inheritedRetries = parentSuite._retries;
      if (inheritedTimeout === void 0 && parentSuite._timeout !== void 0)
        inheritedTimeout = parentSuite._timeout;
    }
    test.retries = inheritedRetries ?? project.project.retries;
    test.timeout = inheritedTimeout ?? project.project.timeout;
    if (test.annotations.some((a) => a.type === "skip" || a.type === "fixme"))
      test.expectedStatus = "skipped";
    if (test._poolDigest)
      test._workerHash = `${project.id}-${test._poolDigest}-0`;
  });
  return result;
}
function applyRepeatEachIndex(project, fileSuite, repeatEachIndex) {
  fileSuite.forEachTest((test, suite) => {
    if (repeatEachIndex) {
      const [file, ...titles] = test.titlePath();
      const testIdExpression = `[project=${project.id}]${toPosixPath(file)}${titles.join("")} (repeat:${repeatEachIndex})`;
      const testId = suite._fileId + "-" + calculateSha1(testIdExpression).slice(0, 20);
      test.id = testId;
      test.repeatEachIndex = repeatEachIndex;
      if (test._poolDigest)
        test._workerHash = `${project.id}-${test._poolDigest}-${repeatEachIndex}`;
    }
  });
}

export { applyRepeatEachIndex, bindFileSuiteToProject, filterTestsRemoveEmptySuites };
