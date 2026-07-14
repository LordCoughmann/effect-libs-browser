import { isRegExp } from '../../../playwright-core/src/utils/isomorphic/rtti.js';
import '../../../_virtual/pixelmatch.js';
import '../../../playwright-core/src/utilsBundle.js';
import 'node:crypto';
import '../../../playwright-core/src/server/utils/debug.js';
import '../../../playwright-core/src/server/utils/debugLogger.js';
import { formatMatcherMessage } from '../../../playwright-core/src/server/utils/expectUtils.js';
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

const EXPECTED_LABEL = "Expected";
const RECEIVED_LABEL = "Received";
async function toEqual(matcherName, locator, receiverType, query, expected, options = {}) {
  expectTypes(locator, [receiverType], matcherName);
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
  let printedReceived;
  let printedExpected;
  let printedDiff;
  if (pass) {
    printedExpected = `Expected: not ${this.utils.printExpected(expected)}`;
    printedReceived = errorMessage ? "" : `Received: ${this.utils.printReceived(received)}`;
  } else if (errorMessage) {
    printedExpected = `Expected: ${this.utils.printExpected(expected)}`;
  } else if (Array.isArray(expected) && Array.isArray(received)) {
    const normalizedExpected = expected.map((exp, index) => {
      const rec = received[index];
      if (isRegExp(exp))
        return exp.test(rec) ? rec : exp;
      return exp;
    });
    printedDiff = this.utils.printDiffOrStringify(
      normalizedExpected,
      received,
      EXPECTED_LABEL,
      RECEIVED_LABEL,
      false
    );
  } else {
    printedDiff = this.utils.printDiffOrStringify(
      expected,
      received,
      EXPECTED_LABEL,
      RECEIVED_LABEL,
      false
    );
  }
  const message = () => {
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
  return {
    actual: received,
    expected,
    message,
    name: matcherName,
    pass,
    log,
    timeout: timedOut ? timeout : void 0
  };
}

export { toEqual };
