function getFromENV(name) {
  let value = process.env[name];
  value = value === void 0 ? process.env[`npm_config_${name.toLowerCase()}`] : value;
  value = value === void 0 ? process.env[`npm_package_config_${name.toLowerCase()}`] : value;
  return value;
}
function getAsBooleanFromENV(name, defaultValue) {
  const value = getFromENV(name);
  if (value === "false" || value === "0")
    return false;
  if (value)
    return true;
  return false;
}
function getPackageManager() {
  const env = process.env.npm_config_user_agent || "";
  if (env.includes("yarn"))
    return "yarn";
  if (env.includes("pnpm"))
    return "pnpm";
  return "npm";
}
function getPackageManagerExecCommand() {
  const packageManager = getPackageManager();
  if (packageManager === "yarn")
    return "yarn";
  if (packageManager === "pnpm")
    return "pnpm exec";
  return "npx";
}

export { getAsBooleanFromENV, getFromENV, getPackageManager, getPackageManagerExecCommand };
