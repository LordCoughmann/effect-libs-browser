class HarRouter {
  static async create(localUtils, file, notFoundAction, options) {
    const { harId, error } = await localUtils.harOpen({ file });
    if (error)
      throw new Error(error);
    return new HarRouter(localUtils, harId, notFoundAction, options);
  }
  constructor(localUtils, harId, notFoundAction, options) {
    this._localUtils = localUtils;
    this._harId = harId;
    this._options = options;
    this._notFoundAction = notFoundAction;
  }
  async _handle(route) {
    const request = route.request();
    const response = await this._localUtils.harLookup({
      harId: this._harId,
      url: request.url(),
      method: request.method(),
      headers: await request.headersArray(),
      postData: request.postDataBuffer() || void 0,
      isNavigationRequest: request.isNavigationRequest()
    });
    if (response.action === "redirect") {
      route._platform.log("api", `HAR: ${route.request().url()} redirected to ${response.redirectURL}`);
      await route._redirectNavigationRequest(response.redirectURL);
      return;
    }
    if (response.action === "fulfill") {
      if (response.status === -1)
        return;
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers.map((h) => [h.name, h.value])),
        body: response.body
      });
      return;
    }
    if (response.action === "error")
      route._platform.log("api", "HAR: " + response.message);
    if (this._notFoundAction === "abort") {
      await route.abort();
      return;
    }
    await route.fallback();
  }
  async addContextRoute(context) {
    await context.route(this._options.urlMatch || "**/*", (route) => this._handle(route));
  }
  async addPageRoute(page) {
    await page.route(this._options.urlMatch || "**/*", (route) => this._handle(route));
  }
  async [Symbol.asyncDispose]() {
    await this.dispose();
  }
  dispose() {
    this._localUtils.harClose({ harId: this._harId }).catch(() => {
    });
  }
}

export { HarRouter };
