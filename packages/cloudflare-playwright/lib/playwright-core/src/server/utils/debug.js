import { getFromENV, getAsBooleanFromENV } from './env.js';

const _debugMode = getFromENV("PWDEBUG") || "";
function debugMode() {
  if (_debugMode === "console")
    return "console";
  if (_debugMode === "0" || _debugMode === "false")
    return "";
  return _debugMode ? "inspector" : "";
}
const _isUnderTest = getAsBooleanFromENV("PWTEST_UNDER_TEST");
function isUnderTest() {
  return _isUnderTest;
}

export { debugMode, isUnderTest };
