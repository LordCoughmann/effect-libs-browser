function isUnsupportedOperationError(error) {
  return error.message?.startsWith("Cloudflare Workers does not support browserType.");
}
function unsupportedOperations(playwright) {
  playwright.chromium.launch = async () => {
    throw new Error("Cloudflare Workers does not support browserType.launch.");
  };
  playwright.chromium.launchPersistentContext = async () => {
    throw new Error("Cloudflare Workers does not support browserType.launchPersistentContext.");
  };
  playwright.chromium.launchServer = async () => {
    throw new Error("Cloudflare Workers does not support browserType.launchServer.");
  };
  playwright.chromium.connect = async () => {
    throw new Error("Cloudflare Workers does not support browserType.connect.");
  };
}

export { isUnsupportedOperationError, unsupportedOperations };
