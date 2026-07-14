import { execSync } from '../../../../mocks/childProcess.js';
import os from 'node:os';
import { getLinuxDistributionInfoSync } from './linuxUtils.js';

function calculatePlatform() {
  if (process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE) {
    return {
      hostPlatform: process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE,
      isOfficiallySupportedPlatform: false
    };
  }
  const platform = os.platform();
  if (platform === "darwin") {
    const ver = os.release().split(".").map((a) => parseInt(a, 10));
    let macVersion = "";
    if (ver[0] < 18) {
      macVersion = "mac10.13";
    } else if (ver[0] === 18) {
      macVersion = "mac10.14";
    } else if (ver[0] === 19) {
      macVersion = "mac10.15";
    } else {
      const LAST_STABLE_MACOS_MAJOR_VERSION = 15;
      macVersion = "mac" + Math.min(ver[0] - 9, LAST_STABLE_MACOS_MAJOR_VERSION);
      if (os.cpus().some((cpu) => cpu.model.includes("Apple")))
        macVersion += "-arm64";
    }
    return { hostPlatform: macVersion, isOfficiallySupportedPlatform: true };
  }
  if (platform === "linux") {
    if (!["x64", "arm64"].includes(os.arch()))
      return { hostPlatform: "<unknown>", isOfficiallySupportedPlatform: false };
    const archSuffix = "-" + os.arch();
    const distroInfo = getLinuxDistributionInfoSync();
    if (distroInfo?.id === "ubuntu" || distroInfo?.id === "pop" || distroInfo?.id === "neon" || distroInfo?.id === "tuxedo") {
      const isUbuntu = distroInfo?.id === "ubuntu";
      const version = distroInfo?.version;
      const major = parseInt(distroInfo.version, 10);
      if (major < 20)
        return { hostPlatform: "ubuntu18.04" + archSuffix, isOfficiallySupportedPlatform: false };
      if (major < 22)
        return { hostPlatform: "ubuntu20.04" + archSuffix, isOfficiallySupportedPlatform: isUbuntu && version === "20.04" };
      if (major < 24)
        return { hostPlatform: "ubuntu22.04" + archSuffix, isOfficiallySupportedPlatform: isUbuntu && version === "22.04" };
      if (major < 26)
        return { hostPlatform: "ubuntu24.04" + archSuffix, isOfficiallySupportedPlatform: isUbuntu && version === "24.04" };
      return { hostPlatform: "ubuntu" + distroInfo.version + archSuffix, isOfficiallySupportedPlatform: false };
    }
    if (distroInfo?.id === "linuxmint") {
      const mintMajor = parseInt(distroInfo.version, 10);
      if (mintMajor <= 20)
        return { hostPlatform: "ubuntu20.04" + archSuffix, isOfficiallySupportedPlatform: false };
      if (mintMajor === 21)
        return { hostPlatform: "ubuntu22.04" + archSuffix, isOfficiallySupportedPlatform: false };
      return { hostPlatform: "ubuntu24.04" + archSuffix, isOfficiallySupportedPlatform: false };
    }
    if (distroInfo?.id === "debian" || distroInfo?.id === "raspbian") {
      const isOfficiallySupportedPlatform2 = distroInfo?.id === "debian";
      if (distroInfo?.version === "11")
        return { hostPlatform: "debian11" + archSuffix, isOfficiallySupportedPlatform: isOfficiallySupportedPlatform2 };
      if (distroInfo?.version === "12")
        return { hostPlatform: "debian12" + archSuffix, isOfficiallySupportedPlatform: isOfficiallySupportedPlatform2 };
      if (distroInfo?.version === "13")
        return { hostPlatform: "debian13" + archSuffix, isOfficiallySupportedPlatform: isOfficiallySupportedPlatform2 };
      if (distroInfo?.version === "")
        return { hostPlatform: "debian13" + archSuffix, isOfficiallySupportedPlatform: isOfficiallySupportedPlatform2 };
    }
    return { hostPlatform: "ubuntu24.04" + archSuffix, isOfficiallySupportedPlatform: false };
  }
  if (platform === "win32")
    return { hostPlatform: "win64", isOfficiallySupportedPlatform: true };
  return { hostPlatform: "<unknown>", isOfficiallySupportedPlatform: false };
}
const { hostPlatform, isOfficiallySupportedPlatform } = calculatePlatform();
function toShortPlatform(hostPlatform2) {
  if (hostPlatform2 === "<unknown>")
    return "<unknown>";
  if (hostPlatform2 === "win64")
    return "win-x64";
  if (hostPlatform2.startsWith("mac"))
    return hostPlatform2.endsWith("arm64") ? "mac-arm64" : "mac-x64";
  return hostPlatform2.endsWith("arm64") ? "linux-arm64" : "linux-x64";
}
const shortPlatform = toShortPlatform(hostPlatform);
let hasGpuMacValue;
function hasGpuMac() {
  try {
    if (hasGpuMacValue === void 0) {
      const output = execSync("system_profiler SPDisplaysDataType", { stdio: ["ignore", "pipe", "ignore"] }).toString();
      hasGpuMacValue = output.includes("Metal: Supported") || output.includes("Metal Support: Metal");
    }
    return hasGpuMacValue;
  } catch (e) {
    return false;
  }
}

export { hasGpuMac, hostPlatform, isOfficiallySupportedPlatform, shortPlatform };
