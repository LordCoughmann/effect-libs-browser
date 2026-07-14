import fs from 'node:fs';
import path__default from 'node:path';
import { rewriteErrorMessage } from '../utils/isomorphic/stackTrace.js';
import { wrapInASCIIBox } from './utils/ascii.js';
import '../../../_virtual/pixelmatch.js';
import '../utilsBundle.js';
import 'node:crypto';
import { isUnderTest } from './utils/debug.js';
import './utils/debugLogger.js';
import './utils/expectUtils.js';
import '../zipBundle.js';
import './utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import './utils/happyEyeballs.js';
import './utils/nodePlatform.js';
import './utils/profiler.js';
import './utils/socksProxy.js';
import 'node:os';
import './utils/zones.js';
import { registryDirectory, findChromiumChannelBestEffort, buildPlaywrightCLICommand } from './registry/index.js';
import { ProgressController } from './progress.js';

async function launchApp(browserType, options) {
  const args = [...options.persistentContextOptions?.args ?? []];
  let channel = options.persistentContextOptions?.channel;
  if (browserType.name() === "chromium") {
    args.push(
      "--app=data:text/html,",
      `--window-size=${options.windowSize.width},${options.windowSize.height}`,
      ...options.windowPosition ? [`--window-position=${options.windowPosition.x},${options.windowPosition.y}`] : [],
      "--test-type="
    );
    if (!channel && !options.persistentContextOptions?.executablePath)
      channel = findChromiumChannelBestEffort(options.sdkLanguage);
  }
  const controller = new ProgressController();
  let context;
  try {
    context = await controller.run((progress) => browserType.launchPersistentContext(progress, "", {
      ignoreDefaultArgs: ["--enable-automation"],
      ...options?.persistentContextOptions,
      channel,
      noDefaultViewport: options.persistentContextOptions?.noDefaultViewport ?? true,
      acceptDownloads: options?.persistentContextOptions?.acceptDownloads ?? (isUnderTest() ? "accept" : "internal-browser-default"),
      colorScheme: options?.persistentContextOptions?.colorScheme ?? "no-override",
      args
    }), 0);
  } catch (error) {
    if (channel) {
      error = rewriteErrorMessage(error, [
        `Failed to launch "${channel}" channel.`,
        "Using custom channels could lead to unexpected behavior due to Enterprise policies (chrome://policy).",
        "Install the default browser instead:",
        wrapInASCIIBox(`${buildPlaywrightCLICommand(options.sdkLanguage, "install")}`, 2)
      ].join("\n"));
    }
    throw error;
  }
  const [page] = context.pages();
  if (browserType.name() === "chromium" && process.platform === "darwin") {
    context.on("page", async (newPage) => {
      if (newPage.mainFrame().url() === "chrome://new-tab-page/") {
        await page.bringToFront();
        await newPage.close();
      }
    });
  }
  if (browserType.name() === "chromium")
    await installAppIcon(page);
  return { context, page };
}
async function installAppIcon(page) {
  const icon = await fs.promises.readFile(require.resolve("./chromium/appIcon.png"));
  const crPage = page.delegate;
  await crPage._mainFrameSession._client.send("Browser.setDockTile", {
    image: icon.toString("base64")
  });
}
async function syncLocalStorageWithSettings(page, appName) {
  if (isUnderTest())
    return;
  const settingsFile = path__default.join(registryDirectory, ".settings", `${appName}.json`);
  const controller = new ProgressController();
  await controller.run(async (progress) => {
    await page.exposeBinding(progress, "_saveSerializedSettings", false, (_, settings2) => {
      fs.mkdirSync(path__default.dirname(settingsFile), { recursive: true });
      fs.writeFileSync(settingsFile, settings2);
    });
    const settings = await fs.promises.readFile(settingsFile, "utf-8").catch(() => "{}");
    await page.addInitScript(
      progress,
      `(${String((settings2) => {
        if (location && location.protocol === "data:")
          return;
        if (window.top !== window)
          return;
        Object.entries(settings2).map(([k, v]) => localStorage[k] = v);
        window.saveSettings = () => {
          window._saveSerializedSettings(JSON.stringify({ ...localStorage }));
        };
      })})(${settings});
    `
    );
  });
}

export { launchApp, syncLocalStorageWithSettings };
