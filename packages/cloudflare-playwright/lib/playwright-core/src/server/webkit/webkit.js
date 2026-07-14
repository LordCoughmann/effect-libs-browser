import path__default from 'node:path';
import { kBrowserCloseMessageId } from './wkConnection.js';
import { wrapInASCIIBox } from '../utils/ascii.js';
import { BrowserType, kNoXServerRunningError } from '../browserType.js';
import { WKBrowser } from './wkBrowser.js';
import { spawnAsync } from '../utils/spawnAsync.js';

class WebKit extends BrowserType {
  constructor(parent) {
    super(parent, "webkit");
  }
  connectToTransport(transport, options) {
    return WKBrowser.connect(this.attribution.playwright, transport, options);
  }
  amendEnvironment(env, userDataDir, isPersistent, options) {
    return {
      ...env,
      CURL_COOKIE_JAR_PATH: process.platform === "win32" && isPersistent ? path__default.join(userDataDir, "cookiejar.db") : void 0
    };
  }
  doRewriteStartupLog(logs) {
    if (logs.includes("Failed to open display") || logs.includes("cannot open display"))
      logs = "\n" + wrapInASCIIBox(kNoXServerRunningError, 1);
    return logs;
  }
  attemptToGracefullyCloseBrowser(transport) {
    transport.send({ method: "Playwright.close", params: {}, id: kBrowserCloseMessageId });
  }
  async defaultArgs(options, isPersistent, userDataDir) {
    const { args = [], headless } = options;
    const userDataDirArg = args.find((arg) => arg.startsWith("--user-data-dir"));
    if (userDataDirArg)
      throw this._createUserDataDirArgMisuseError("--user-data-dir");
    if (args.find((arg) => !arg.startsWith("-")))
      throw new Error("Arguments can not specify page to be opened");
    const webkitArguments = ["--inspector-pipe"];
    if (process.platform === "win32" && options.channel !== "webkit-wsl")
      webkitArguments.push("--disable-accelerated-compositing");
    if (headless)
      webkitArguments.push("--headless");
    if (isPersistent)
      webkitArguments.push(`--user-data-dir=${options.channel === "webkit-wsl" ? await translatePathToWSL(userDataDir) : userDataDir}`);
    else
      webkitArguments.push(`--no-startup-window`);
    const proxy = options.proxyOverride || options.proxy;
    if (proxy) {
      if (process.platform === "darwin") {
        webkitArguments.push(`--proxy=${proxy.server}`);
        if (proxy.bypass)
          webkitArguments.push(`--proxy-bypass-list=${proxy.bypass}`);
      } else if (process.platform === "linux" || process.platform === "win32" && options.channel === "webkit-wsl") {
        webkitArguments.push(`--proxy=${proxy.server}`);
        if (proxy.bypass)
          webkitArguments.push(...proxy.bypass.split(",").map((t) => `--ignore-host=${t}`));
      } else if (process.platform === "win32") {
        webkitArguments.push(`--curl-proxy=${proxy.server.replace(/^socks5:\/\//, "socks5h://")}`);
        if (proxy.bypass)
          webkitArguments.push(`--curl-noproxy=${proxy.bypass}`);
      }
    }
    webkitArguments.push(...args);
    if (isPersistent)
      webkitArguments.push("about:blank");
    return webkitArguments;
  }
}
async function translatePathToWSL(path2) {
  const { stdout } = await spawnAsync("wsl.exe", ["-d", "playwright", "--cd", "/home/pwuser", "wslpath", path2.replace(/\\/g, "\\\\")]);
  return stdout.toString().trim();
}

export { WebKit, translatePathToWSL };
