import { Browser } from '../browser.js';
import { BrowserContextDispatcher } from './browserContextDispatcher.js';
import { CDPSessionDispatcher } from './cdpSessionDispatcher.js';
import { Dispatcher } from './dispatcher.js';
import { BrowserContext } from '../browserContext.js';
import { ArtifactDispatcher } from './artifactDispatcher.js';

class BrowserDispatcher extends Dispatcher {
  constructor(scope, browser, options = {}) {
    super(scope, browser, "Browser", { version: browser.version(), name: browser.options.name });
    this._type_Browser = true;
    this._isolatedContexts = /* @__PURE__ */ new Set();
    this._options = options;
    if (!options.isolateContexts) {
      this.addObjectListener(Browser.Events.Context, (context) => this._dispatchEvent("context", { context: BrowserContextDispatcher.from(this, context) }));
      this.addObjectListener(Browser.Events.Disconnected, () => this._didClose());
      if (browser._defaultContext)
        this._dispatchEvent("context", { context: BrowserContextDispatcher.from(this, browser._defaultContext) });
      for (const context of browser.contexts())
        this._dispatchEvent("context", { context: BrowserContextDispatcher.from(this, context) });
    }
  }
  _didClose() {
    this._dispatchEvent("close");
    this._dispose();
  }
  async newContext(params, progress) {
    if (params.recordVideo && this._object.attribution.playwright.options.isServer)
      params.recordVideo.dir = this._object.options.artifactsDir;
    if (!this._options.isolateContexts) {
      const context2 = await this._object.newContext(progress, params);
      const contextDispatcher2 = BrowserContextDispatcher.from(this, context2);
      return { context: contextDispatcher2 };
    }
    const context = await this._object.newContext(progress, params);
    this._isolatedContexts.add(context);
    context.on(BrowserContext.Events.Close, () => this._isolatedContexts.delete(context));
    const contextDispatcher = BrowserContextDispatcher.from(this, context);
    this._dispatchEvent("context", { context: contextDispatcher });
    return { context: contextDispatcher };
  }
  async newContextForReuse(params, progress) {
    const context = await this._object.newContextForReuse(progress, params);
    const contextDispatcher = BrowserContextDispatcher.from(this, context);
    this._dispatchEvent("context", { context: contextDispatcher });
    return { context: contextDispatcher };
  }
  async disconnectFromReusedContext(params, progress) {
    const context = this._object.contextForReuse();
    const contextDispatcher = context ? this.connection.existingDispatcher(context) : void 0;
    if (contextDispatcher) {
      await contextDispatcher.stopPendingOperations(new Error(params.reason));
      contextDispatcher._dispose();
    }
  }
  async close(params, progress) {
    if (this._options.ignoreStopAndKill)
      return;
    progress.metadata.potentiallyClosesScope = true;
    await this._object.close(params);
  }
  async killForTests(params, progress) {
    if (this._options.ignoreStopAndKill)
      return;
    progress.metadata.potentiallyClosesScope = true;
    await this._object.killForTests();
  }
  async defaultUserAgentForTest() {
    return { userAgent: this._object.userAgent() };
  }
  async newBrowserCDPSession(params, progress) {
    if (!this._object.options.isChromium)
      throw new Error(`CDP session is only available in Chromium`);
    const crBrowser = this._object;
    return { session: new CDPSessionDispatcher(this, await crBrowser.newBrowserCDPSession()) };
  }
  async startTracing(params, progress) {
    if (!this._object.options.isChromium)
      throw new Error(`Tracing is only available in Chromium`);
    const crBrowser = this._object;
    await crBrowser.startTracing(params.page ? params.page._object : void 0, params);
  }
  async stopTracing(params, progress) {
    if (!this._object.options.isChromium)
      throw new Error(`Tracing is only available in Chromium`);
    const crBrowser = this._object;
    return { artifact: ArtifactDispatcher.from(this, await crBrowser.stopTracing()) };
  }
  async cleanupContexts() {
    await Promise.all(Array.from(this._isolatedContexts).map((context) => context.close({ reason: "Global context cleanup (connection terminated)" })));
  }
}

export { BrowserDispatcher };
