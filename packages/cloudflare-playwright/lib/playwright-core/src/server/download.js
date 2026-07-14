import path__default from 'node:path';
import { Page } from './page.js';
import { assert } from '../utils/isomorphic/assert.js';
import '../../../_virtual/pixelmatch.js';
import '../utilsBundle.js';
import 'node:crypto';
import './utils/debug.js';
import './utils/debugLogger.js';
import './utils/expectUtils.js';
import 'node:fs';
import '../zipBundle.js';
import './utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import './utils/happyEyeballs.js';
import './utils/nodePlatform.js';
import './utils/profiler.js';
import './utils/socksProxy.js';
import 'node:os';
import './utils/zones.js';
import { Artifact } from './artifact.js';

class Download {
  constructor(page, downloadsPath, uuid, url, suggestedFilename) {
    const unaccessibleErrorMessage = page.browserContext._options.acceptDownloads === "deny" ? "Pass { acceptDownloads: true } when you are creating your browser context." : void 0;
    this.artifact = new Artifact(page, path__default.join(downloadsPath, uuid), unaccessibleErrorMessage, () => {
      return this._page.browserContext.cancelDownload(uuid);
    });
    this._page = page;
    this.url = url;
    this._suggestedFilename = suggestedFilename;
    page.browserContext._downloads.add(this);
    if (suggestedFilename !== void 0)
      this._fireDownloadEvent();
  }
  page() {
    return this._page;
  }
  _filenameSuggested(suggestedFilename) {
    assert(this._suggestedFilename === void 0);
    this._suggestedFilename = suggestedFilename;
    this._fireDownloadEvent();
  }
  suggestedFilename() {
    return this._suggestedFilename;
  }
  _fireDownloadEvent() {
    this._page.instrumentation.onDownload(this._page, this);
    this._page.emit(Page.Events.Download, this);
  }
}

export { Download };
