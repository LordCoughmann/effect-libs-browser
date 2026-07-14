import '../../../_virtual/pixelmatch.js';
import '../../../playwright-core/src/utilsBundle.js';
import 'node:crypto';
import '../../../playwright-core/src/server/utils/debug.js';
import '../../../playwright-core/src/server/utils/debugLogger.js';
import { formatMatcherMessage, printReceivedStringContainExpectedSubstring, printReceivedStringContainExpectedResult } from '../../../playwright-core/src/server/utils/expectUtils.js';
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

async function toMatchText(matcherName, receiver, receiverType, query, expected, options = {}) {
  expectTypes(receiver, [receiverType], matcherName);
  const locator = receiverType === "Locator" ? receiver : void 0;
  if (!(typeof expected === "string") && !(expected && typeof expected.test === "function")) {
    const errorMessage2 = `Error: ${this.utils.EXPECTED_COLOR("expected")} value must be a string or regular expression
${this.utils.printWithType("Expected", expected, this.utils.printExpected)}`;
    throw new Error(formatMatcherMessage(this.utils, { promise: this.promise, isNot: this.isNot, locator: locator?.toString(), matcherName, expectation: "expected", errorMessage: errorMessage2 }));
  }
  const timeout = options.timeout ?? this.timeout;
  const { matches: pass, received, log, timedOut, errorMessage } = await query(!!this.isNot, timeout);
  if (pass === !this.isNot) {
    return {
      name: matcherName,
      message: () => "",
      pass,
      expected
    };
  }
  const expectedSuffix = typeof expected === "string" ? options.matchSubstring ? " substring" : "" : " pattern";
  const receivedSuffix = typeof expected === "string" ? options.matchSubstring ? " string" : "" : " string";
  const receivedString = received || "";
  let printedReceived;
  let printedExpected;
  let printedDiff;
  if (pass) {
    if (typeof expected === "string") {
      printedExpected = `Expected${expectedSuffix}: not ${this.utils.printExpected(expected)}`;
      if (!errorMessage) {
        const formattedReceived = printReceivedStringContainExpectedSubstring(this.utils, receivedString, receivedString.indexOf(expected), expected.length);
        printedReceived = `Received${receivedSuffix}: ${formattedReceived}`;
      }
    } else {
      printedExpected = `Expected${expectedSuffix}: not ${this.utils.printExpected(expected)}`;
      if (!errorMessage) {
        const formattedReceived = printReceivedStringContainExpectedResult(this.utils, receivedString, typeof expected.exec === "function" ? expected.exec(receivedString) : null);
        printedReceived = `Received${receivedSuffix}: ${formattedReceived}`;
      }
    }
  } else {
    if (errorMessage)
      printedExpected = `Expected${expectedSuffix}: ${this.utils.printExpected(expected)}`;
    else
      printedDiff = this.utils.printDiffOrStringify(expected, receivedString, `Expected${expectedSuffix}`, `Received${receivedSuffix}`, false);
  }
  const message = () => {
    return formatMatcherMessage(this.utils, {
      promise: this.promise,
      isNot: this.isNot,
      matcherName,
      expectation: "expected",
      locator: locator?.toString(),
      timeout,
      timedOut,
      printedExpected,
      printedReceived,
      printedDiff,
      log,
      errorMessage
    });
  };
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

export { toMatchText };
