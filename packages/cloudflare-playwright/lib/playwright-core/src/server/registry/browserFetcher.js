import { fork } from '../../../../mocks/childProcess.js';
import fs from 'node:fs';
import os from 'node:os';
import path__default from 'node:path';
import { debugLogger } from '../utils/debugLogger.js';
import { ManualPromise } from '../../utils/isomorphic/manualPromise.js';
import { getUserAgent } from '../utils/userAgent.js';
import { colors, progress } from '../../utilsBundle.js';
import { existsAsync, removeFolders } from '../utils/fileUtils.js';
import { browserDirectoryToMarkerFilePath } from './index.js';

async function downloadBrowserWithProgressBar(title, browserDirectory, executablePath, downloadURLs, downloadFileName, downloadSocketTimeout, force) {
  if (await existsAsync(browserDirectoryToMarkerFilePath(browserDirectory))) {
    debugLogger.log("install", `${title} is already downloaded.`);
    if (force)
      debugLogger.log("install", `force-downloading ${title}.`);
    else
      return;
  }
  const uniqueTempDir = await fs.promises.mkdtemp(path__default.join(os.tmpdir(), "playwright-download-"));
  const zipPath = path__default.join(uniqueTempDir, downloadFileName);
  try {
    const retryCount = 5;
    for (let attempt = 1; attempt <= retryCount; ++attempt) {
      debugLogger.log("install", `downloading ${title} - attempt #${attempt}`);
      const url = downloadURLs[(attempt - 1) % downloadURLs.length];
      logPolitely(`Downloading ${title}` + colors.dim(` from ${url}`));
      const { error } = await downloadBrowserWithProgressBarOutOfProcess(title, browserDirectory, url, zipPath, executablePath, downloadSocketTimeout);
      if (!error) {
        debugLogger.log("install", `SUCCESS installing ${title}`);
        break;
      }
      if (await existsAsync(zipPath))
        await fs.promises.unlink(zipPath);
      if (await existsAsync(browserDirectory))
        await removeFolders([browserDirectory]);
      const errorMessage = error?.message || "";
      debugLogger.log("install", `attempt #${attempt} - ERROR: ${errorMessage}`);
      if (attempt >= retryCount)
        throw error;
    }
  } catch (e) {
    debugLogger.log("install", `FAILED installation ${title} with error: ${e}`);
    process.exitCode = 1;
    throw e;
  } finally {
    await removeFolders([uniqueTempDir]);
  }
  logPolitely(`${title} downloaded to ${browserDirectory}`);
}
function downloadBrowserWithProgressBarOutOfProcess(title, browserDirectory, url, zipPath, executablePath, socketTimeout) {
  const cp = fork(path__default.join("/home/runner/work/playwright/playwright/packages/playwright-cloudflare", "oopDownloadBrowserMain.js"));
  const promise = new ManualPromise();
  const progress = getDownloadProgress();
  cp.on("message", (message) => {
    if (message?.method === "log")
      debugLogger.log("install", message.params.message);
    if (message?.method === "progress")
      progress(message.params.done, message.params.total);
  });
  cp.on("exit", (code) => {
    if (code !== 0) {
      promise.resolve({ error: new Error(`Download failure, code=${code}`) });
      return;
    }
    if (!fs.existsSync(browserDirectoryToMarkerFilePath(browserDirectory)))
      promise.resolve({ error: new Error(`Download failure, ${browserDirectoryToMarkerFilePath(browserDirectory)} does not exist`) });
    else
      promise.resolve({ error: null });
  });
  cp.on("error", (error) => {
    promise.resolve({ error });
  });
  debugLogger.log("install", `running download:`);
  debugLogger.log("install", `-- from url: ${url}`);
  debugLogger.log("install", `-- to location: ${zipPath}`);
  const downloadParams = {
    title,
    browserDirectory,
    url,
    zipPath,
    executablePath,
    socketTimeout,
    userAgent: getUserAgent()
  };
  cp.send({ method: "download", params: downloadParams });
  return promise;
}
function logPolitely(toBeLogged) {
  const logLevel = process.env.npm_config_loglevel;
  const logLevelDisplay = ["silent", "error", "warn"].indexOf(logLevel || "") > -1;
  if (!logLevelDisplay)
    console.log(toBeLogged);
}
function getDownloadProgress() {
  if (process.stdout.isTTY)
    return getAnimatedDownloadProgress();
  return getBasicDownloadProgress();
}
function getAnimatedDownloadProgress() {
  let progressBar;
  let lastDownloadedBytes = 0;
  return (downloadedBytes, totalBytes) => {
    if (!progressBar) {
      progressBar = new progress(
        `${toMegabytes(
          totalBytes
        )} [:bar] :percent :etas`,
        {
          complete: "=",
          incomplete: " ",
          width: 20,
          total: totalBytes
        }
      );
    }
    const delta = downloadedBytes - lastDownloadedBytes;
    lastDownloadedBytes = downloadedBytes;
    progressBar.tick(delta);
  };
}
function getBasicDownloadProgress() {
  const totalRows = 10;
  const stepWidth = 8;
  let lastRow = -1;
  return (downloadedBytes, totalBytes) => {
    const percentage = downloadedBytes / totalBytes;
    const row = Math.floor(totalRows * percentage);
    if (row > lastRow) {
      lastRow = row;
      const percentageString = String(percentage * 100 | 0).padStart(3);
      console.log(`|${"■".repeat(row * stepWidth)}${" ".repeat((totalRows - row) * stepWidth)}| ${percentageString}% of ${toMegabytes(totalBytes)}`);
    }
  };
}
function toMegabytes(bytes) {
  const mb = bytes / 1024 / 1024;
  return `${Math.round(mb * 10) / 10} MiB`;
}

export { downloadBrowserWithProgressBar, logPolitely };
