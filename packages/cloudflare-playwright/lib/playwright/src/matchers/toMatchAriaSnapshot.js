import fs from 'node:fs';
import path__default from 'node:path';
import { isString, escapeTemplateString } from '../../../playwright-core/src/utils/isomorphic/stringUtils.js';
import '../../../_virtual/pixelmatch.js';
import '../../../playwright-core/src/utilsBundle.js';
import 'node:crypto';
import '../../../playwright-core/src/server/utils/debug.js';
import '../../../playwright-core/src/server/utils/debugLogger.js';
import { printReceivedStringContainExpectedSubstring, formatMatcherMessage } from '../../../playwright-core/src/server/utils/expectUtils.js';
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
import { fileExistsAsync } from '../util.js';
import { currentTestInfo } from '../common/globals.js';

async function toMatchAriaSnapshot(locator, expectedParam, options = {}) {
  const matcherName = "toMatchAriaSnapshot";
  const testInfo = currentTestInfo();
  if (!testInfo)
    throw new Error(`toMatchAriaSnapshot() must be called during the test`);
  if (testInfo._projectInternal.ignoreSnapshots)
    return { pass: !this.isNot, message: () => "", name: "toMatchAriaSnapshot", expected: "" };
  const updateSnapshots = testInfo.config.updateSnapshots;
  let expected;
  let timeout;
  let expectedPath;
  if (isString(expectedParam)) {
    expected = expectedParam;
    timeout = options.timeout ?? this.timeout;
  } else {
    const legacyPath = testInfo._resolveSnapshotPaths("aria", expectedParam?.name, "dontUpdateSnapshotIndex", ".yml").absoluteSnapshotPath;
    expectedPath = testInfo._resolveSnapshotPaths("aria", expectedParam?.name, "updateSnapshotIndex").absoluteSnapshotPath;
    if (!await fileExistsAsync(expectedPath) && await fileExistsAsync(legacyPath))
      expectedPath = legacyPath;
    expected = await fs.promises.readFile(expectedPath, "utf8").catch(() => "");
    timeout = expectedParam?.timeout ?? this.timeout;
  }
  const generateMissingBaseline = updateSnapshots === "missing" && !expected;
  if (generateMissingBaseline) {
    if (this.isNot) {
      const message2 = `Matchers using ".not" can't generate new baselines`;
      return { pass: this.isNot, message: () => message2, name: "toMatchAriaSnapshot" };
    } else {
      expected = `- none "Generating new baseline"`;
    }
  }
  expected = unshift(expected);
  const { matches: pass, received, log, timedOut, errorMessage } = await locator._expect("to.match.aria", { expectedValue: expected, isNot: this.isNot, timeout });
  const typedReceived = received;
  const message = () => {
    let printedExpected;
    let printedReceived;
    let printedDiff;
    if (errorMessage) {
      printedExpected = `Expected: ${this.isNot ? "not " : ""}${this.utils.printExpected(expected)}`;
    } else if (pass) {
      const receivedString = printReceivedStringContainExpectedSubstring(this.utils, typedReceived.raw, typedReceived.raw.indexOf(expected), expected.length);
      printedExpected = `Expected: not ${this.utils.printExpected(expected)}`;
      printedReceived = `Received: ${receivedString}`;
    } else {
      printedDiff = this.utils.printDiffOrStringify(expected, typedReceived.raw, "Expected", "Received", false);
    }
    return formatMatcherMessage(this.utils, {
      isNot: this.isNot,
      promise: this.promise,
      matcherName,
      expectation: "expected",
      locator: locator.toString(),
      timeout,
      timedOut,
      printedExpected,
      printedReceived,
      printedDiff,
      errorMessage,
      log
    });
  };
  if (errorMessage)
    return { pass: this.isNot, message, name: "toMatchAriaSnapshot", expected };
  if (!this.isNot) {
    if (updateSnapshots === "all" || updateSnapshots === "changed" && pass === this.isNot || generateMissingBaseline) {
      if (expectedPath) {
        await fs.promises.mkdir(path__default.dirname(expectedPath), { recursive: true });
        await fs.promises.writeFile(expectedPath, typedReceived.regex, "utf8");
        const relativePath = path__default.relative(process.cwd(), expectedPath);
        if (updateSnapshots === "missing") {
          const message2 = `A snapshot doesn't exist at ${relativePath}, writing actual.`;
          testInfo._hasNonRetriableError = true;
          testInfo._failWithError(new Error(message2));
        } else {
          const message2 = `A snapshot is generated at ${relativePath}.`;
          console.log(message2);
        }
        return { pass: true, message: () => "", name: "toMatchAriaSnapshot" };
      } else {
        const suggestedRebaseline = `\`
${escapeTemplateString(indent(typedReceived.regex, "{indent}  "))}
{indent}\``;
        if (updateSnapshots === "missing") {
          const message2 = "A snapshot is not provided, generating new baseline.";
          testInfo._hasNonRetriableError = true;
          testInfo._failWithError(new Error(message2));
        }
        return { pass: false, message: () => "", name: "toMatchAriaSnapshot", suggestedRebaseline };
      }
    }
  }
  return {
    name: matcherName,
    expected,
    message,
    pass,
    actual: received,
    log,
    timeout: timedOut ? timeout : void 0
  };
}
function unshift(snapshot) {
  const lines = snapshot.split("\n");
  let whitespacePrefixLength = 100;
  for (const line of lines) {
    if (!line.trim())
      continue;
    const match = line.match(/^(\s*)/);
    if (match && match[1].length < whitespacePrefixLength)
      whitespacePrefixLength = match[1].length;
  }
  return lines.filter((t) => t.trim()).map((line) => line.substring(whitespacePrefixLength)).join("\n");
}
function indent(snapshot, indent2) {
  return snapshot.split("\n").map((line) => indent2 + line).join("\n");
}

export { toMatchAriaSnapshot };
