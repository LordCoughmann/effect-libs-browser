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

async function toBeTruthy(matcherName, locator, receiverType, expected, arg, query, options = {}) {
  expectTypes(locator, [receiverType], matcherName);
  const timeout = options.timeout ?? this.timeout;
  const { matches: pass, log, timedOut, received, errorMessage } = await query(!!this.isNot, timeout);
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
  if (pass) {
    printedExpected = `Expected: not ${expected}`;
    printedReceived = errorMessage ? "" : `Received: ${expected}`;
  } else {
    printedExpected = `Expected: ${expected}`;
    printedReceived = errorMessage ? "" : `Received: ${received}`;
  }
  const message = () => {
    return formatMatcherMessage(this.utils, {
      isNot: this.isNot,
      promise: this.promise,
      matcherName,
      expectation: arg,
      locator: locator.toString(),
      timeout,
      timedOut,
      printedExpected,
      printedReceived,
      errorMessage,
      log
    });
  };
  return {
    message,
    pass,
    actual: received,
    name: matcherName,
    expected,
    log,
    timeout: timedOut ? timeout : void 0
  };
}

export { toBeTruthy };
