import fs from 'node:fs';

let didFailToReadOSRelease = false;
let osRelease;
function getLinuxDistributionInfoSync() {
  if (process.platform !== "linux")
    return void 0;
  if (!osRelease && !didFailToReadOSRelease) {
    try {
      const osReleaseText = fs.readFileSync("/etc/os-release", "utf8");
      const fields = parseOSReleaseText(osReleaseText);
      osRelease = {
        id: fields.get("id") ?? "",
        version: fields.get("version_id") ?? ""
      };
    } catch (e) {
      didFailToReadOSRelease = true;
    }
  }
  return osRelease;
}
function parseOSReleaseText(osReleaseText) {
  const fields = /* @__PURE__ */ new Map();
  for (const line of osReleaseText.split("\n")) {
    const tokens = line.split("=");
    const name = tokens.shift();
    let value = tokens.join("=").trim();
    if (value.startsWith('"') && value.endsWith('"'))
      value = value.substring(1, value.length - 1);
    if (!name)
      continue;
    fields.set(name.toLowerCase(), value);
  }
  return fields;
}

export { getLinuxDistributionInfoSync };
