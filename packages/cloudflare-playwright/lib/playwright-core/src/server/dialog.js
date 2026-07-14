import { assert } from '../utils/isomorphic/assert.js';
import '../../../_virtual/pixelmatch.js';
import '../utilsBundle.js';
import 'node:crypto';
import './utils/debug.js';
import './utils/debugLogger.js';
import './utils/expectUtils.js';
import 'node:fs';
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
import { SdkObject } from './instrumentation.js';

class Dialog extends SdkObject {
  constructor(page, type, message, onHandle, defaultValue) {
    super(page, "dialog");
    this._handled = false;
    this._page = page;
    this._type = type;
    this._message = message;
    this._onHandle = onHandle;
    this._defaultValue = defaultValue || "";
  }
  page() {
    return this._page;
  }
  type() {
    return this._type;
  }
  message() {
    return this._message;
  }
  defaultValue() {
    return this._defaultValue;
  }
  async accept(promptText) {
    assert(!this._handled, "Cannot accept dialog which is already handled!");
    this._handled = true;
    this._page.browserContext.dialogManager.dialogWillClose(this);
    await this._onHandle(true, promptText);
  }
  async dismiss() {
    assert(!this._handled, "Cannot dismiss dialog which is already handled!");
    this._handled = true;
    this._page.browserContext.dialogManager.dialogWillClose(this);
    await this._onHandle(false);
  }
  async close() {
    if (this._type === "beforeunload")
      await this.accept();
    else
      await this.dismiss();
  }
}
class DialogManager {
  constructor(instrumentation) {
    this._dialogHandlers = /* @__PURE__ */ new Set();
    this._openedDialogs = /* @__PURE__ */ new Set();
    this._instrumentation = instrumentation;
  }
  dialogDidOpen(dialog) {
    for (const frame of dialog.page().frameManager.frames())
      frame._invalidateNonStallingEvaluations("JavaScript dialog interrupted evaluation");
    this._openedDialogs.add(dialog);
    this._instrumentation.onDialog(dialog);
    let hasHandlers = false;
    for (const handler of this._dialogHandlers) {
      if (handler(dialog))
        hasHandlers = true;
    }
    if (!hasHandlers)
      dialog.close().then(() => {
      });
  }
  dialogWillClose(dialog) {
    this._openedDialogs.delete(dialog);
  }
  addDialogHandler(handler) {
    this._dialogHandlers.add(handler);
  }
  removeDialogHandler(handler) {
    this._dialogHandlers.delete(handler);
    if (!this._dialogHandlers.size) {
      for (const dialog of this._openedDialogs)
        dialog.close().catch(() => {
        });
    }
  }
  hasOpenDialogsForPage(page) {
    return [...this._openedDialogs].some((dialog) => dialog.page() === page);
  }
  async closeBeforeUnloadDialogs() {
    await Promise.all([...this._openedDialogs].map(async (dialog) => {
      if (dialog.type() === "beforeunload")
        await dialog.dismiss();
    }));
  }
}

export { Dialog, DialogManager };
