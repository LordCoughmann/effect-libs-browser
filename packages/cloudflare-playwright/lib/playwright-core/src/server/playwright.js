import { Android } from './android/android.js';
import { AdbBackend } from './android/backendAdb.js';
import { BidiChromium } from './bidi/bidiChromium.js';
import { BidiFirefox } from './bidi/bidiFirefox.js';
import { Chromium } from './chromium/chromium.js';
import { DebugController } from './debugController.js';
import { Electron } from './electron/electron.js';
import { Firefox } from './firefox/firefox.js';
import { SdkObject, createRootSdkObject } from './instrumentation.js';
import { WebKit } from './webkit/webkit.js';

class Playwright extends SdkObject {
  constructor(options) {
    super(createRootSdkObject(), void 0, "Playwright");
    this._allPages = /* @__PURE__ */ new Set();
    this._allBrowsers = /* @__PURE__ */ new Set();
    this.options = options;
    this.attribution.playwright = this;
    this.instrumentation.addListener({
      onBrowserOpen: (browser) => this._allBrowsers.add(browser),
      onBrowserClose: (browser) => this._allBrowsers.delete(browser),
      onPageOpen: (page) => this._allPages.add(page),
      onPageClose: (page) => this._allPages.delete(page)
    }, null);
    this.chromium = new Chromium(this, new BidiChromium(this));
    this.firefox = new Firefox(this, new BidiFirefox(this));
    this.webkit = new WebKit(this);
    this.electron = new Electron(this);
    this.android = new Android(this, new AdbBackend());
    this.debugController = new DebugController(this);
  }
  allBrowsers() {
    return [...this._allBrowsers];
  }
  allPages() {
    return [...this._allPages];
  }
}
function createPlaywright(options) {
  return new Playwright(options);
}

export { Playwright, createPlaywright };
