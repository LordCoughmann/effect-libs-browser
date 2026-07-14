import { asLocator } from '../../utils/isomorphic/locatorGenerators.js';
import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import '../utils/debug.js';
import '../utils/debugLogger.js';
import '../utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../../zipBundle.js';
import '../utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../utils/happyEyeballs.js';
import '../utils/nodePlatform.js';
import '../utils/profiler.js';
import '../utils/socksProxy.js';
import 'node:os';
import '../utils/zones.js';

class JsonlLanguageGenerator {
  constructor() {
    this.id = "jsonl";
    this.groupName = "";
    this.name = "JSONL";
    this.highlighter = "javascript";
  }
  generateAction(actionInContext) {
    const locator = actionInContext.action.selector ? JSON.parse(asLocator("jsonl", actionInContext.action.selector)) : void 0;
    const entry = {
      ...actionInContext.action,
      ...actionInContext.frame,
      locator,
      ariaSnapshot: void 0
    };
    return JSON.stringify(entry);
  }
  generateHeader(options) {
    return JSON.stringify(options);
  }
  generateFooter(saveStorage) {
    return "";
  }
}

export { JsonlLanguageGenerator };
