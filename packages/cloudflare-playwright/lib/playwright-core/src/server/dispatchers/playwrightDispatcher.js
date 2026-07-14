import { SocksProxy } from '../utils/socksProxy.js';
import { GlobalAPIRequestContext } from '../fetch.js';
import { AndroidDispatcher, AndroidDeviceDispatcher } from './androidDispatcher.js';
import { BrowserDispatcher } from './browserDispatcher.js';
import { BrowserTypeDispatcher } from './browserTypeDispatcher.js';
import { Dispatcher } from './dispatcher.js';
import { ElectronDispatcher } from './electronDispatcher.js';
import { LocalUtilsDispatcher } from './localUtilsDispatcher.js';
import { APIRequestContextDispatcher } from './networkDispatchers.js';
import { SdkObject } from '../instrumentation.js';
import { eventsHelper } from '../utils/eventsHelper.js';

class PlaywrightDispatcher extends Dispatcher {
  constructor(scope, playwright, options = {}) {
    const denyLaunch = options.denyLaunch ?? false;
    const chromium = new BrowserTypeDispatcher(scope, playwright.chromium, denyLaunch);
    const firefox = new BrowserTypeDispatcher(scope, playwright.firefox, denyLaunch);
    const webkit = new BrowserTypeDispatcher(scope, playwright.webkit, denyLaunch);
    const android = new AndroidDispatcher(scope, playwright.android);
    const initializer = {
      chromium,
      firefox,
      webkit,
      android,
      electron: new ElectronDispatcher(scope, playwright.electron, denyLaunch),
      utils: playwright.options.isServer ? void 0 : new LocalUtilsDispatcher(scope, playwright),
      socksSupport: options.socksProxy ? new SocksSupportDispatcher(scope, playwright, options.socksProxy) : void 0
    };
    let browserDispatcher;
    if (options.preLaunchedBrowser) {
      const browserTypeDispatcher = initializer[options.preLaunchedBrowser.options.name];
      browserDispatcher = new BrowserDispatcher(browserTypeDispatcher, options.preLaunchedBrowser, {
        ignoreStopAndKill: true,
        isolateContexts: !options.sharedBrowser
      });
      initializer.preLaunchedBrowser = browserDispatcher;
    }
    if (options.preLaunchedAndroidDevice)
      initializer.preConnectedAndroidDevice = new AndroidDeviceDispatcher(android, options.preLaunchedAndroidDevice);
    super(scope, playwright, "Playwright", initializer);
    this._type_Playwright = true;
    this._browserDispatcher = browserDispatcher;
  }
  async newRequest(params, progress) {
    const request = new GlobalAPIRequestContext(this._object, params);
    return { request: APIRequestContextDispatcher.from(this.parentScope(), request) };
  }
  async cleanup() {
    await this._browserDispatcher?.cleanupContexts();
  }
}
class SocksSupportDispatcher extends Dispatcher {
  constructor(scope, parent, socksProxy) {
    super(scope, new SdkObject(parent, "socksSupport"), "SocksSupport", {});
    this._type_SocksSupport = true;
    this._socksProxy = socksProxy;
    this._socksListeners = [
      eventsHelper.addEventListener(socksProxy, SocksProxy.Events.SocksRequested, (payload) => this._dispatchEvent("socksRequested", payload)),
      eventsHelper.addEventListener(socksProxy, SocksProxy.Events.SocksData, (payload) => this._dispatchEvent("socksData", payload)),
      eventsHelper.addEventListener(socksProxy, SocksProxy.Events.SocksClosed, (payload) => this._dispatchEvent("socksClosed", payload))
    ];
  }
  async socksConnected(params, progress) {
    this._socksProxy?.socketConnected(params);
  }
  async socksFailed(params, progress) {
    this._socksProxy?.socketFailed(params);
  }
  async socksData(params, progress) {
    this._socksProxy?.sendSocketData(params);
  }
  async socksError(params, progress) {
    this._socksProxy?.sendSocketError(params);
  }
  async socksEnd(params, progress) {
    this._socksProxy?.sendSocketEnd(params);
  }
  _onDispose() {
    eventsHelper.removeEventListeners(this._socksListeners);
  }
}

export { PlaywrightDispatcher };
