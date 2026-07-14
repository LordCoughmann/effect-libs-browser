import { Android } from './android.js';
import { Browser } from './browser.js';
import { BrowserType } from './browserType.js';
import { ChannelOwner } from './channelOwner.js';
import { Electron } from './electron.js';
import { TimeoutError } from './errors.js';
import { APIRequest } from './fetch.js';
import { Selectors } from './selectors.js';

class Playwright extends ChannelOwner {
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this.request = new APIRequest(this);
    this.chromium = BrowserType.from(initializer.chromium);
    this.chromium._playwright = this;
    this.firefox = BrowserType.from(initializer.firefox);
    this.firefox._playwright = this;
    this.webkit = BrowserType.from(initializer.webkit);
    this.webkit._playwright = this;
    this._android = Android.from(initializer.android);
    this._android._playwright = this;
    this._electron = Electron.from(initializer.electron);
    this._electron._playwright = this;
    this.devices = this._connection.localUtils()?.devices ?? {};
    this.selectors = new Selectors(this._connection._platform);
    this.errors = { TimeoutError };
  }
  static from(channel) {
    return channel._object;
  }
  _browserTypes() {
    return [this.chromium, this.firefox, this.webkit];
  }
  _preLaunchedBrowser() {
    const browser = Browser.from(this._initializer.preLaunchedBrowser);
    browser._connectToBrowserType(this[browser._name], {}, void 0);
    return browser;
  }
  _allContexts() {
    return this._browserTypes().flatMap((type) => [...type._contexts]);
  }
  _allPages() {
    return this._allContexts().flatMap((context) => context.pages());
  }
}

export { Playwright };
