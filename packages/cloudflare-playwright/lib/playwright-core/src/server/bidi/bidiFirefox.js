import os from 'node:os';
import path__default from 'node:path';
import { wrapInASCIIBox } from '../utils/ascii.js';
import { BrowserType, kNoXServerRunningError } from '../browserType.js';
import { BidiBrowser } from './bidiBrowser.js';
import { kShutdownSessionNewMessageId, kBrowserCloseMessageId } from './bidiConnection.js';
import { createProfile } from './third_party/firefoxPrefs.js';
import { ManualPromise } from '../../utils/isomorphic/manualPromise.js';

class BidiFirefox extends BrowserType {
  constructor(parent) {
    super(parent, "firefox");
  }
  executablePath() {
    return "";
  }
  async connectToTransport(transport, options) {
    return BidiBrowser.connect(this.attribution.playwright, transport, options);
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
    env = {
      ...env,
      "MOZ_CRASHREPORTER": "1",
      "MOZ_CRASHREPORTER_NO_REPORT": "1",
      "MOZ_CRASHREPORTER_SHUTDOWN": "1"
    };
    if (os.platform() === "linux") {
      return { ...env, SNAP_NAME: void 0, SNAP_INSTANCE_NAME: void 0 };
    }
    return env;
  }
  attemptToGracefullyCloseBrowser(transport) {
    this._attemptToGracefullyCloseBrowser(transport).catch(() => {
    });
  }
  async _attemptToGracefullyCloseBrowser(transport) {
    if (!transport.onmessage) {
      transport.send({ method: "session.new", params: { capabilities: {} }, id: kShutdownSessionNewMessageId });
      await new Promise((resolve) => {
        transport.onmessage = (message) => {
          if (message.id === kShutdownSessionNewMessageId)
            resolve(true);
        };
      });
    }
    transport.send({ method: "browser.close", params: {}, id: kBrowserCloseMessageId });
  }
  supportsPipeTransport() {
    return false;
  }
  async prepareUserDataDir(options, userDataDir) {
    await createProfile({
      path: userDataDir,
      preferences: options.firefoxUserPrefs || {}
    });
  }
  async defaultArgs(options, isPersistent, userDataDir) {
    const { args = [], headless } = options;
    const userDataDirArg = args.find((arg) => arg.startsWith("-profile") || arg.startsWith("--profile"));
    if (userDataDirArg)
      throw this._createUserDataDirArgMisuseError("--profile");
    if (args.find((arg) => !arg.startsWith("-")))
      throw new Error("Arguments can not specify page to be opened");
    const firefoxArguments = ["--remote-debugging-port=0"];
    if (headless)
      firefoxArguments.push("--headless");
    else
      firefoxArguments.push("--foreground");
    firefoxArguments.push(`--profile`, userDataDir);
    firefoxArguments.push(...args);
    return firefoxArguments;
  }
  async waitForReadyState(options, browserLogsCollector) {
    const result = new ManualPromise();
    browserLogsCollector.onMessage((message) => {
      const match = message.match(/WebDriver BiDi listening on (ws:\/\/.*)$/);
      if (match)
        result.resolve({ wsEndpoint: match[1] + "/session" });
    });
    return result;
  }
}

export { BidiFirefox };
