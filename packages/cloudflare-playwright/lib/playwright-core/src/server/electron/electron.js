import require$$0 from '../../../../_virtual/empty.js';
import fs from 'node:fs';
import os from 'node:os';
import path__default from 'node:path';
import { createInterface } from '../../../../mocks/readline.js';
import { ManualPromise } from '../../utils/isomorphic/manualPromise.js';
import { wrapInASCIIBox } from '../utils/ascii.js';
import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import '../utils/debug.js';
import { RecentLogsCollector } from '../utils/debugLogger.js';
import { eventsHelper } from '../utils/eventsHelper.js';
import '../utils/expectUtils.js';
import '../../zipBundle.js';
import '../utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../utils/happyEyeballs.js';
import '../utils/nodePlatform.js';
import { envArrayToObject, launchProcess } from '../utils/processLauncher.js';
import '../utils/profiler.js';
import '../utils/socksProxy.js';
import '../utils/zones.js';
import { validateBrowserContextOptions } from '../browserContext.js';
import { CRBrowser } from '../chromium/crBrowser.js';
import { CRConnection } from '../chromium/crConnection.js';
import { CRExecutionContext, createHandle } from '../chromium/crExecutionContext.js';
import { toConsoleMessageLocation } from '../chromium/crProtocolHelper.js';
import { ConsoleMessage } from '../console.js';
import { helper } from '../helper.js';
import { SdkObject } from '../instrumentation.js';
import { ExecutionContext, JSHandle } from '../javascript.js';
import { WebSocketTransport } from '../../../../cloudflare/webSocketTransport.js';

const ARTIFACTS_FOLDER = path__default.join(os.tmpdir(), "playwright-artifacts-");
class ElectronApplication extends SdkObject {
  constructor(parent, browser, nodeConnection, process2) {
    super(parent, "electron-app");
    this._nodeElectronHandlePromise = new ManualPromise();
    this._process = process2;
    this._browserContext = browser._defaultContext;
    this._nodeConnection = nodeConnection;
    this._nodeSession = nodeConnection.rootSession;
    this._nodeSession.on("Runtime.executionContextCreated", async (event) => {
      if (!event.context.auxData || !event.context.auxData.isDefault)
        return;
      const crExecutionContext = new CRExecutionContext(this._nodeSession, event.context);
      this._nodeExecutionContext = new ExecutionContext(this, crExecutionContext, "electron");
      const { result: remoteObject } = await crExecutionContext._client.send("Runtime.evaluate", {
        expression: `require('electron')`,
        contextId: event.context.id,
        // Needed after Electron 28 to get access to require: https://github.com/microsoft/playwright/issues/28048
        includeCommandLineAPI: true
      });
      this._nodeElectronHandlePromise.resolve(new JSHandle(this._nodeExecutionContext, "object", "ElectronModule", remoteObject.objectId));
    });
    this._nodeSession.on("Runtime.consoleAPICalled", (event) => this._onConsoleAPI(event));
    const appClosePromise = new Promise((f) => this.once(ElectronApplication.Events.Close, f));
    this._browserContext.setCustomCloseHandler(async () => {
      await this._browserContext.stopVideoRecording();
      const electronHandle = await this._nodeElectronHandlePromise;
      await electronHandle.evaluate(({ app }) => app.quit()).catch(() => {
      });
      this._nodeConnection.close();
      await appClosePromise;
    });
  }
  static {
    this.Events = {
      Close: "close",
      Console: "console"
    };
  }
  async _onConsoleAPI(event) {
    if (event.executionContextId === 0) {
      return;
    }
    if (!this._nodeExecutionContext)
      return;
    const args = event.args.map((arg) => createHandle(this._nodeExecutionContext, arg));
    const message = new ConsoleMessage(null, null, event.type, void 0, args, toConsoleMessageLocation(event.stackTrace));
    this.emit(ElectronApplication.Events.Console, message);
  }
  async initialize() {
    await this._nodeSession.send("Runtime.enable", {});
    await this._nodeSession.send("Runtime.evaluate", { expression: "__playwright_run()" });
  }
  process() {
    return this._process;
  }
  context() {
    return this._browserContext;
  }
  async close() {
    await this._browserContext.close({ reason: "Application exited" });
  }
  async browserWindow(page) {
    const targetId = page.delegate._targetId;
    const electronHandle = await this._nodeElectronHandlePromise;
    return await electronHandle.evaluateHandle(({ BrowserWindow, webContents }, targetId2) => {
      const wc = webContents.fromDevToolsTargetId(targetId2);
      return BrowserWindow.fromWebContents(wc);
    }, targetId);
  }
}
class Electron extends SdkObject {
  constructor(playwright) {
    super(playwright, "electron");
    this.logName = "browser";
  }
  async launch(progress, options) {
    let app = void 0;
    let electronArguments = ["--inspect=0", "--remote-debugging-port=0", ...options.args || []];
    if (os.platform() === "linux") {
      const runningAsRoot = process.geteuid && process.geteuid() === 0;
      if (runningAsRoot && electronArguments.indexOf("--no-sandbox") === -1)
        electronArguments.unshift("--no-sandbox");
    }
    const artifactsDir = await progress.race(fs.promises.mkdtemp(ARTIFACTS_FOLDER));
    const browserLogsCollector = new RecentLogsCollector();
    const env = options.env ? envArrayToObject(options.env) : process.env;
    let command;
    if (options.executablePath) {
      command = options.executablePath;
    } else {
      try {
        command = require$$0;
      } catch (error) {
        if (error?.code === "MODULE_NOT_FOUND") {
          throw new Error("\n" + wrapInASCIIBox([
            "Electron executablePath not found!",
            "Please install it using `npm install -D electron` or set the executablePath to your Electron executable."
          ].join("\n"), 1));
        }
        throw error;
      }
      electronArguments.unshift("-r", require.resolve("./loader"));
    }
    let shell = false;
    if (process.platform === "win32") {
      shell = true;
      command = [command, ...electronArguments].map((arg) => `"${escapeDoubleQuotes(arg)}"`).join(" ");
      electronArguments = [];
    }
    delete env.NODE_OPTIONS;
    const { launchedProcess, gracefullyClose, kill } = await launchProcess({
      command,
      args: electronArguments,
      env,
      log: (message) => {
        progress.log(message);
        browserLogsCollector.log(message);
      },
      shell,
      stdio: "pipe",
      cwd: options.cwd,
      tempDirectories: [artifactsDir],
      attemptToGracefullyClose: () => app.close(),
      handleSIGINT: true,
      handleSIGTERM: true,
      handleSIGHUP: true,
      onExit: () => app?.emit(ElectronApplication.Events.Close)
    });
    const waitForXserverError = waitForLine(progress, launchedProcess, /Unable to open X display/).then(() => {
      throw new Error([
        "Unable to open X display!",
        `================================`,
        "Most likely this is because there is no X server available.",
        "Use 'xvfb-run' on Linux to launch your tests with an emulated display server.",
        "For example: 'xvfb-run npm run test:e2e'",
        `================================`,
        progress.metadata.log
      ].join("\n"));
    });
    const nodeMatchPromise = waitForLine(progress, launchedProcess, /^Debugger listening on (ws:\/\/.*)$/);
    const chromeMatchPromise = waitForLine(progress, launchedProcess, /^DevTools listening on (ws:\/\/.*)$/);
    const debuggerDisconnectPromise = waitForLine(progress, launchedProcess, /Waiting for the debugger to disconnect\.\.\./);
    try {
      const nodeMatch = await nodeMatchPromise;
      const nodeTransport = await WebSocketTransport.connect(progress, nodeMatch[1]);
      const nodeConnection = new CRConnection(this, nodeTransport, helper.debugProtocolLogger(), browserLogsCollector);
      debuggerDisconnectPromise.then(() => {
        nodeTransport.close();
      }).catch(() => {
      });
      const chromeMatch = await Promise.race([
        chromeMatchPromise,
        waitForXserverError
      ]);
      const chromeTransport = await WebSocketTransport.connect(progress, chromeMatch[1]);
      const browserProcess = {
        onclose: void 0,
        process: launchedProcess,
        close: gracefullyClose,
        kill
      };
      const contextOptions = {
        ...options,
        noDefaultViewport: true
      };
      const browserOptions = {
        name: "electron",
        isChromium: true,
        headful: true,
        persistent: contextOptions,
        browserProcess,
        protocolLogger: helper.debugProtocolLogger(),
        browserLogsCollector,
        artifactsDir,
        downloadsPath: artifactsDir,
        tracesDir: options.tracesDir || artifactsDir,
        originalLaunchOptions: {}
      };
      validateBrowserContextOptions(contextOptions, browserOptions);
      const browser = await progress.race(CRBrowser.connect(this.attribution.playwright, chromeTransport, browserOptions));
      app = new ElectronApplication(this, browser, nodeConnection, launchedProcess);
      await progress.race(app.initialize());
      return app;
    } catch (error) {
      await kill();
      throw error;
    }
  }
}
async function waitForLine(progress, process2, regex) {
  const promise = new ManualPromise();
  const rl = createInterface({ input: process2.stderr });
  const failError = new Error("Process failed to launch!");
  const listeners = [
    eventsHelper.addEventListener(rl, "line", onLine),
    eventsHelper.addEventListener(rl, "close", () => promise.reject(failError)),
    eventsHelper.addEventListener(process2, "exit", () => promise.reject(failError)),
    // It is Ok to remove error handler because we did not create process and there is another listener.
    eventsHelper.addEventListener(process2, "error", () => promise.reject(failError))
  ];
  function onLine(line) {
    const match = line.match(regex);
    if (match)
      promise.resolve(match);
  }
  try {
    return await progress.race(promise);
  } finally {
    eventsHelper.removeEventListeners(listeners);
  }
}
function escapeDoubleQuotes(str) {
  return str.replace(/"/g, '\\"');
}

export { Electron, ElectronApplication };
