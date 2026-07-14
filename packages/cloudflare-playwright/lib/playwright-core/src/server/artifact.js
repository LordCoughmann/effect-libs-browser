import fs from 'node:fs';
import { assert } from '../utils/isomorphic/assert.js';
import { ManualPromise } from '../utils/isomorphic/manualPromise.js';
import '../../../_virtual/pixelmatch.js';
import '../utilsBundle.js';
import 'node:crypto';
import './utils/debug.js';
import './utils/debugLogger.js';
import './utils/expectUtils.js';
import 'node:path';
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
import { TargetClosedError } from './errors.js';
import { SdkObject } from './instrumentation.js';

class Artifact extends SdkObject {
  constructor(parent, localPath, unaccessibleErrorMessage, cancelCallback) {
    super(parent, "artifact");
    this._finishedPromise = new ManualPromise();
    this._saveCallbacks = [];
    this._finished = false;
    this._deleted = false;
    this._localPath = localPath;
    this._unaccessibleErrorMessage = unaccessibleErrorMessage;
    this._cancelCallback = cancelCallback;
  }
  finishedPromise() {
    return this._finishedPromise;
  }
  localPath() {
    return this._localPath;
  }
  async localPathAfterFinished() {
    if (this._unaccessibleErrorMessage)
      throw new Error(this._unaccessibleErrorMessage);
    await this._finishedPromise;
    if (this._failureError)
      throw this._failureError;
    return this._localPath;
  }
  saveAs(saveCallback) {
    if (this._unaccessibleErrorMessage)
      throw new Error(this._unaccessibleErrorMessage);
    if (this._deleted)
      throw new Error(`File already deleted. Save before deleting.`);
    if (this._failureError)
      throw this._failureError;
    if (this._finished) {
      saveCallback(this._localPath).catch(() => {
      });
      return;
    }
    this._saveCallbacks.push(saveCallback);
  }
  async failureError() {
    if (this._unaccessibleErrorMessage)
      return this._unaccessibleErrorMessage;
    await this._finishedPromise;
    return this._failureError?.message || null;
  }
  async cancel() {
    assert(this._cancelCallback !== void 0);
    return this._cancelCallback();
  }
  async delete() {
    if (this._unaccessibleErrorMessage)
      return;
    const fileName = await this.localPathAfterFinished();
    if (this._deleted)
      return;
    this._deleted = true;
    if (fileName)
      await fs.promises.unlink(fileName).catch((e) => {
      });
  }
  async deleteOnContextClose() {
    if (this._deleted)
      return;
    this._deleted = true;
    if (!this._unaccessibleErrorMessage)
      await fs.promises.unlink(this._localPath).catch((e) => {
      });
    await this.reportFinished(new TargetClosedError(this.closeReason()));
  }
  async reportFinished(error) {
    if (this._finished)
      return;
    this._finished = true;
    this._failureError = error;
    if (error) {
      for (const callback of this._saveCallbacks)
        await callback("", error);
    } else {
      for (const callback of this._saveCallbacks)
        await callback(this._localPath);
    }
    this._saveCallbacks = [];
    this._finishedPromise.resolve();
  }
}

export { Artifact };
