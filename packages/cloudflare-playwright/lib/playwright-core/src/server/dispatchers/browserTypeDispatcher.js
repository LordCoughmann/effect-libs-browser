import { BrowserContextDispatcher } from './browserContextDispatcher.js';
import { BrowserDispatcher } from './browserDispatcher.js';
import { Dispatcher } from './dispatcher.js';

class BrowserTypeDispatcher extends Dispatcher {
  constructor(scope, browserType, denyLaunch) {
    super(scope, browserType, "BrowserType", {
      executablePath: browserType.executablePath(),
      name: browserType.name()
    });
    this._type_BrowserType = true;
    this._denyLaunch = denyLaunch;
  }
  async launch(params, progress) {
    if (this._denyLaunch)
      throw new Error(`Launching more browsers is not allowed.`);
    const browser = await this._object.launch(progress, params);
    return { browser: new BrowserDispatcher(this, browser) };
  }
  async launchPersistentContext(params, progress) {
    if (this._denyLaunch)
      throw new Error(`Launching more browsers is not allowed.`);
    const browserContext = await this._object.launchPersistentContext(progress, params.userDataDir, params);
    const browserDispatcher = new BrowserDispatcher(this, browserContext._browser);
    const contextDispatcher = BrowserContextDispatcher.from(browserDispatcher, browserContext);
    return { browser: browserDispatcher, context: contextDispatcher };
  }
  async connectOverCDP(params, progress) {
    if (this._denyLaunch)
      throw new Error(`Launching more browsers is not allowed.`);
    const browser = await this._object.connectOverCDP(progress, params.endpointURL, params);
    const browserDispatcher = new BrowserDispatcher(this, browser);
    return {
      browser: browserDispatcher,
      defaultContext: browser._defaultContext ? BrowserContextDispatcher.from(browserDispatcher, browser._defaultContext) : void 0
    };
  }
}

export { BrowserTypeDispatcher };
