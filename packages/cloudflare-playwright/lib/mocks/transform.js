import { currentlyLoadingFileSuite } from '../playwright/src/common/globals.js';
import { configLocation, playwrightTestConfig } from '../internal.js';

const requireOrImport = (file) => {
  if (file === configLocation.resolvedConfigFile)
    return playwrightTestConfig;
};
function setSingleTSConfig() {
}
function wrapFunctionWithLocation(func) {
  return (...args) => {
    const location = {
      file: currentlyLoadingFileSuite()?._requireFile || "",
      line: 0,
      column: 0
    };
    return func(location, ...args);
  };
}

export { requireOrImport, setSingleTSConfig, wrapFunctionWithLocation };
