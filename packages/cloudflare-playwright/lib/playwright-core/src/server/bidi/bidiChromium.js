import require$$0 from '../../../../_virtual/empty.js';
import os from 'node:os';
import { wrapInASCIIBox } from '../utils/ascii.js';
import { BrowserType, kNoXServerRunningError } from '../browserType.js';
import { BidiBrowser } from './bidiBrowser.js';
import { kBrowserCloseMessageId } from './bidiConnection.js';
import { chromiumSwitches } from '../chromium/chromiumSwitches.js';
import { waitForReadyState } from '../chromium/chromium.js';
import { hasGpuMac } from '../utils/hostPlatform.js';

class BidiChromium extends BrowserType {
  constructor(parent) {
    super(parent, "chromium");
  }
  async connectToTransport(transport, options, browserLogsCollector) {
    const bidiTransport = await require$$0.connectBidiOverCdp(transport);
    transport[kBidiOverCdpWrapper] = bidiTransport;
    try {
      return BidiBrowser.connect(this.attribution.playwright, bidiTransport, options);
    } catch (e) {
      if (browserLogsCollector.recentLogs().some((log) => log.includes("Failed to create a ProcessSingleton for your profile directory."))) {
        throw new Error(
          "Failed to create a ProcessSingleton for your profile directory. This usually means that the profile is already in use by another instance of Chromium."
        );
      }
      throw e;
    }
  }
  doRewriteStartupLog(logs) {
    if (logs.includes("Missing X server"))
      logs = "\n" + wrapInASCIIBox(kNoXServerRunningError, 1);
    if (!logs.includes("crbug.com/357670") && !logs.includes("No usable sandbox!") && !logs.includes("crbug.com/638180"))
      return logs;
    return [
      `Chromium sandboxing failed!`,
      `================================`,
      `To avoid the sandboxing issue, do either of the following:`,
      `  - (preferred): Configure your environment to support sandboxing`,
      `  - (alternative): Launch Chromium without sandbox using 'chromiumSandbox: false' option`,
      `================================`,
      ``
    ].join("\n");
  }
  amendEnvironment(env) {
    return env;
  }
  attemptToGracefullyCloseBrowser(transport) {
    const bidiTransport = transport[kBidiOverCdpWrapper];
    if (bidiTransport)
      transport = bidiTransport;
    transport.send({ method: "browser.close", params: {}, id: kBrowserCloseMessageId });
  }
  supportsPipeTransport() {
    return false;
  }
  async defaultArgs(options, isPersistent, userDataDir) {
    const chromeArguments = this._innerDefaultArgs(options);
    chromeArguments.push(`--user-data-dir=${userDataDir}`);
    chromeArguments.push("--remote-debugging-port=0");
    if (isPersistent)
      chromeArguments.push("about:blank");
    else
      chromeArguments.push("--no-startup-window");
    return chromeArguments;
  }
  async waitForReadyState(options, browserLogsCollector) {
    return waitForReadyState({ ...options, cdpPort: 0 }, browserLogsCollector);
  }
  _innerDefaultArgs(options) {
    const { args = [] } = options;
    const userDataDirArg = args.find((arg) => arg.startsWith("--user-data-dir"));
    if (userDataDirArg)
      throw this._createUserDataDirArgMisuseError("--user-data-dir");
    if (args.find((arg) => arg.startsWith("--remote-debugging-pipe")))
      throw new Error("Playwright manages remote debugging connection itself.");
    if (args.find((arg) => !arg.startsWith("-")))
      throw new Error("Arguments can not specify page to be opened");
    const chromeArguments = [...chromiumSwitches(options.assistantMode)];
    if (os.platform() !== "darwin" || !hasGpuMac()) {
      chromeArguments.push("--enable-unsafe-swiftshader");
    }
    if (options.headless) {
      chromeArguments.push("--headless");
      chromeArguments.push(
        "--hide-scrollbars",
        "--mute-audio",
        "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"
      );
    }
    if (options.chromiumSandbox !== true)
      chromeArguments.push("--no-sandbox");
    const proxy = options.proxyOverride || options.proxy;
    if (proxy) {
      const proxyURL = new URL(proxy.server);
      const isSocks = proxyURL.protocol === "socks5:";
      if (isSocks && !options.socksProxyPort) {
        chromeArguments.push(`--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE ${proxyURL.hostname}"`);
      }
      chromeArguments.push(`--proxy-server=${proxy.server}`);
      const proxyBypassRules = [];
      if (options.socksProxyPort)
        proxyBypassRules.push("<-loopback>");
      if (proxy.bypass)
        proxyBypassRules.push(...proxy.bypass.split(",").map((t) => t.trim()).map((t) => t.startsWith(".") ? "*" + t : t));
      if (!process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK && !proxyBypassRules.includes("<-loopback>"))
        proxyBypassRules.push("<-loopback>");
      if (proxyBypassRules.length > 0)
        chromeArguments.push(`--proxy-bypass-list=${proxyBypassRules.join(";")}`);
    }
    chromeArguments.push(...args);
    return chromeArguments;
  }
}
const kBidiOverCdpWrapper = Symbol("kBidiConnectionWrapper");

export { BidiChromium };
