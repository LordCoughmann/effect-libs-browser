import { PlaywrightServer } from './remote/playwrightServer.js';
import { helper } from './server/helper.js';
import { createPlaywright } from './server/playwright.js';
import { createGuid } from './server/utils/crypto.js';
import { isUnderTest } from './server/utils/debug.js';
import { rewriteErrorMessage } from './utils/isomorphic/stackTrace.js';
import { DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT } from './utils/isomorphic/time.js';
import { ws } from './utilsBundle.js';
import { scheme, ValidationError } from './protocol/validatorPrimitives.js';
import { ProgressController } from './server/progress.js';

class BrowserServerLauncherImpl {
  constructor(browserName) {
    this._browserName = browserName;
  }
  async launchServer(options = {}) {
    const playwright = createPlaywright({ sdkLanguage: "javascript", isServer: true });
    const metadata = { id: "", startTime: 0, endTime: 0, type: "Internal", method: "", params: {}, log: [], internal: true };
    const validatorContext = {
      tChannelImpl: (names, arg, path2) => {
        throw new ValidationError(`${path2}: channels are not expected in launchServer`);
      },
      binary: "buffer",
      isUnderTest
    };
    let launchOptions = {
      ...options,
      ignoreDefaultArgs: Array.isArray(options.ignoreDefaultArgs) ? options.ignoreDefaultArgs : void 0,
      ignoreAllDefaultArgs: !!options.ignoreDefaultArgs && !Array.isArray(options.ignoreDefaultArgs),
      env: options.env ? envObjectToArray(options.env) : void 0,
      timeout: options.timeout ?? DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT
    };
    let browser;
    try {
      const controller = new ProgressController(metadata);
      browser = await controller.run(async (progress) => {
        if (options._userDataDir !== void 0) {
          const validator = scheme["BrowserTypeLaunchPersistentContextParams"];
          launchOptions = validator({ ...launchOptions, userDataDir: options._userDataDir }, "", validatorContext);
          const context = await playwright[this._browserName].launchPersistentContext(progress, options._userDataDir, launchOptions);
          return context._browser;
        } else {
          const validator = scheme["BrowserTypeLaunchParams"];
          launchOptions = validator(launchOptions, "", validatorContext);
          return await playwright[this._browserName].launch(progress, launchOptions, toProtocolLogger(options.logger));
        }
      });
    } catch (e) {
      const log = helper.formatBrowserLogs(metadata.log);
      rewriteErrorMessage(e, `${e.message} Failed to launch browser.${log}`);
      throw e;
    }
    const path = options.wsPath ? options.wsPath.startsWith("/") ? options.wsPath : `/${options.wsPath}` : `/${createGuid()}`;
    const server = new PlaywrightServer({ mode: options._sharedBrowser ? "launchServerShared" : "launchServer", path, maxConnections: Infinity, preLaunchedBrowser: browser });
    const wsEndpoint = await server.listen(options.port, options.host);
    const browserServer = new ws.EventEmitter();
    browserServer.process = () => browser.options.browserProcess.process;
    browserServer.wsEndpoint = () => wsEndpoint;
    browserServer.close = () => browser.options.browserProcess.close();
    browserServer[Symbol.asyncDispose] = browserServer.close;
    browserServer.kill = () => browser.options.browserProcess.kill();
    browserServer._disconnectForTest = () => server.close();
    browserServer._userDataDirForTest = browser._userDataDirForTest;
    browser.options.browserProcess.onclose = (exitCode, signal) => {
      server.close();
      browserServer.emit("close", exitCode, signal);
    };
    return browserServer;
  }
}
function toProtocolLogger(logger) {
  return logger ? (direction, message) => {
    if (logger.isEnabled("protocol", "verbose"))
      logger.log("protocol", "verbose", (direction === "send" ? "SEND ► " : "◀ RECV ") + JSON.stringify(message), [], {});
  } : void 0;
}
function envObjectToArray(env) {
  const result = [];
  for (const name in env) {
    if (!Object.is(env[name], void 0))
      result.push({ name, value: String(env[name]) });
  }
  return result;
}

export { BrowserServerLauncherImpl };
