import os from 'node:os';
import path__default from 'node:path';
import { FFBrowser } from './ffBrowser.js';
import { kBrowserCloseMessageId } from './ffConnection.js';
import { wrapInASCIIBox } from '../utils/ascii.js';
import { BrowserType, kNoXServerRunningError } from '../browserType.js';
import { ManualPromise } from '../../utils/isomorphic/manualPromise.js';

class Firefox extends BrowserType {
  constructor(parent, bidiFirefox) {
    super(parent, "firefox");
    this._bidiFirefox = bidiFirefox;
  }
  launch(progress, options, protocolLogger) {
    if (options.channel?.startsWith("moz-"))
      return this._bidiFirefox.launch(progress, options, protocolLogger);
    return super.launch(progress, options, protocolLogger);
  }
  async launchPersistentContext(progress, userDataDir, options) {
    if (options.channel?.startsWith("moz-"))
      return this._bidiFirefox.launchPersistentContext(progress, userDataDir, options);
    return super.launchPersistentContext(progress, userDataDir, options);
  }
  connectToTransport(transport, options) {
    return FFBrowser.connect(this.attribution.playwright, transport, options);
  }
  doRewriteStartupLog(logs) {
    if (logs.includes(`as root in a regular user's session is not supported.`))
      logs = "\n" + wrapInASCIIBox(`Firefox is unable to launch if the $HOME folder isn't owned by the current user.
Workaround: Set the HOME=/root environment variable${process.env.GITHUB_ACTION ? " in your GitHub Actions workflow file" : ""} when running Playwright.`, 1);
    if (logs.includes("no DISPLAY environment variable specified"))
      logs = "\n" + wrapInASCIIBox(kNoXServerRunningError, 1);
    return logs;
  }
  amendEnvironment(env) {
    if (!path__default.isAbsolute(os.homedir()))
      throw new Error(`Cannot launch Firefox with relative home directory. Did you set ${os.platform() === "win32" ? "USERPROFILE" : "HOME"} to a relative path?`);
    if (os.platform() === "linux") {
      return { ...env, SNAP_NAME: void 0, SNAP_INSTANCE_NAME: void 0 };
    }
    return env;
  }
  attemptToGracefullyCloseBrowser(transport) {
    const message = { method: "Browser.close", params: {}, id: kBrowserCloseMessageId };
    transport.send(message);
  }
  async defaultArgs(options, isPersistent, userDataDir) {
    const { args = [], headless } = options;
    const userDataDirArg = args.find((arg) => arg.startsWith("-profile") || arg.startsWith("--profile"));
    if (userDataDirArg)
      throw this._createUserDataDirArgMisuseError("--profile");
    if (args.find((arg) => arg.startsWith("-juggler")))
      throw new Error("Use the port parameter instead of -juggler argument");
    const firefoxArguments = ["-no-remote"];
    if (headless) {
      firefoxArguments.push("-headless");
    } else {
      firefoxArguments.push("-wait-for-browser");
      firefoxArguments.push("-foreground");
    }
    firefoxArguments.push(`-profile`, userDataDir);
    firefoxArguments.push("-juggler-pipe");
    firefoxArguments.push(...args);
    if (isPersistent)
      firefoxArguments.push("about:blank");
    else
      firefoxArguments.push("-silent");
    return firefoxArguments;
  }
  waitForReadyState(options, browserLogsCollector) {
    const result = new ManualPromise();
    browserLogsCollector.onMessage((message) => {
      if (message.includes("Juggler listening to the pipe"))
        result.resolve({});
    });
    return result;
  }
}

export { Firefox };
