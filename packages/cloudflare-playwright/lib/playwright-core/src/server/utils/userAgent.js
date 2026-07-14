import require$$0 from '../../../package.json.js';
import { execSync } from '../../../../mocks/childProcess.js';
import os from 'node:os';
import { getLinuxDistributionInfoSync } from './linuxUtils.js';

let cachedUserAgent;
function getUserAgent() {
  if (cachedUserAgent)
    return cachedUserAgent;
  try {
    cachedUserAgent = determineUserAgent();
  } catch (e) {
    cachedUserAgent = "Playwright/unknown";
  }
  return cachedUserAgent;
}
function determineUserAgent() {
  let osIdentifier = "unknown";
  let osVersion = "unknown";
  if (process.platform === "win32") {
    const version = os.release().split(".");
    osIdentifier = "windows";
    osVersion = `${version[0]}.${version[1]}`;
  } else if (process.platform === "darwin") {
    const version = execSync().toString().trim().split(".");
    osIdentifier = "macOS";
    osVersion = `${version[0]}.${version[1]}`;
  } else if (process.platform === "linux") {
    const distroInfo = getLinuxDistributionInfoSync();
    if (distroInfo) {
      osIdentifier = distroInfo.id || "linux";
      osVersion = distroInfo.version || "unknown";
    } else {
      osIdentifier = "linux";
    }
  }
  const additionalTokens = [];
  if (process.env.CI)
    additionalTokens.push("CI/1");
  const serializedTokens = additionalTokens.length ? " " + additionalTokens.join(" ") : "";
  const { embedderName, embedderVersion } = getEmbedderName();
  return `Playwright/${getPlaywrightVersion()} (${os.arch()}; ${osIdentifier} ${osVersion}) ${embedderName}/${embedderVersion}${serializedTokens}`;
}
function getEmbedderName() {
  let embedderName = "unknown";
  let embedderVersion = "unknown";
  if (!process.env.PW_LANG_NAME) {
    embedderName = "node";
    embedderVersion = process.version.substring(1).split(".").slice(0, 2).join(".");
  } else if (["node", "python", "java", "csharp"].includes(process.env.PW_LANG_NAME)) {
    embedderName = process.env.PW_LANG_NAME;
    embedderVersion = process.env.PW_LANG_NAME_VERSION ?? "unknown";
  }
  return { embedderName, embedderVersion };
}
function getPlaywrightVersion(majorMinorOnly = false) {
  const version = process.env.PW_VERSION_OVERRIDE || require$$0.version;
  return majorMinorOnly ? version.split(".").slice(0, 2).join(".") : version;
}

export { getEmbedderName, getPlaywrightVersion, getUserAgent };
