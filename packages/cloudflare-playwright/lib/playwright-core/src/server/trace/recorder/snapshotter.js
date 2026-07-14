import { frameSnapshotStreamer } from './snapshotterInjected.js';
import { monotonicTime } from '../../../utils/isomorphic/time.js';
import { createGuid, calculateSha1 } from '../../utils/crypto.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { eventsHelper } from '../../utils/eventsHelper.js';
import { mime } from '../../../utilsBundle.js';
import { BrowserContext } from '../../browserContext.js';
import { Page } from '../../page.js';

class Snapshotter {
  constructor(context, delegate) {
    this._eventListeners = [];
    this._started = false;
    this._context = context;
    this._delegate = delegate;
    const guid = createGuid();
    this._snapshotStreamer = "__playwright_snapshot_streamer_" + guid;
  }
  started() {
    return this._started;
  }
  async start() {
    this._started = true;
    if (!this._initScript)
      await this._initialize();
    await this.reset();
  }
  async reset() {
    if (this._started)
      await this._context.safeNonStallingEvaluateInAllFrames(`window["${this._snapshotStreamer}"].reset()`, "main");
  }
  stop() {
    this._started = false;
  }
  async resetForReuse() {
    if (this._initScript) {
      eventsHelper.removeEventListeners(this._eventListeners);
      await this._context.removeInitScripts([this._initScript]);
      this._initScript = void 0;
    }
  }
  async _initialize() {
    for (const page of this._context.pages())
      this._onPage(page);
    this._eventListeners = [
      eventsHelper.addEventListener(this._context, BrowserContext.Events.Page, this._onPage.bind(this))
    ];
    const { javaScriptEnabled } = this._context._options;
    const initScript = `((__name => (${frameSnapshotStreamer}))(t => t))`;
    const initScriptSource = `(${initScript})("${this._snapshotStreamer}", ${javaScriptEnabled || javaScriptEnabled === void 0})`;
    this._initScript = await this._context.addInitScript(void 0, initScriptSource);
    await this._context.safeNonStallingEvaluateInAllFrames(initScriptSource, "main");
  }
  dispose() {
    eventsHelper.removeEventListeners(this._eventListeners);
  }
  async _captureFrameSnapshot(frame) {
    const needsReset = !!frame[kNeedsResetSymbol];
    frame[kNeedsResetSymbol] = false;
    const expression = `window["${this._snapshotStreamer}"].captureSnapshot(${needsReset ? "true" : "false"})`;
    try {
      return await frame.nonStallingRawEvaluateInExistingMainContext(expression);
    } catch (e) {
      frame[kNeedsResetSymbol] = true;
      debugLogger.log("error", e);
    }
  }
  async captureSnapshot(page, callId, snapshotName) {
    const snapshots = page.frames().map(async (frame) => {
      const data = await this._captureFrameSnapshot(frame);
      if (!data || !this._started)
        return;
      const snapshot = {
        callId,
        snapshotName,
        pageId: page.guid,
        frameId: frame.guid,
        frameUrl: data.url,
        doctype: data.doctype,
        html: data.html,
        viewport: data.viewport,
        timestamp: monotonicTime(),
        wallTime: data.wallTime,
        collectionTime: data.collectionTime,
        resourceOverrides: [],
        isMainFrame: page.mainFrame() === frame
      };
      for (const { url, content, contentType } of data.resourceOverrides) {
        if (typeof content === "string") {
          const buffer = Buffer.from(content);
          const sha1 = calculateSha1(buffer) + "." + (mime.getExtension(contentType) || "dat");
          this._delegate.onSnapshotterBlob({ sha1, buffer });
          snapshot.resourceOverrides.push({ url, sha1 });
        } else {
          snapshot.resourceOverrides.push({ url, ref: content });
        }
      }
      this._delegate.onFrameSnapshot(snapshot);
    });
    await Promise.all(snapshots);
  }
  _onPage(page) {
    for (const frame of page.frames())
      this._annotateFrameHierarchy(frame);
    this._eventListeners.push(eventsHelper.addEventListener(page, Page.Events.FrameAttached, (frame) => this._annotateFrameHierarchy(frame)));
  }
  async _annotateFrameHierarchy(frame) {
    try {
      const frameElement = await frame.frameElement();
      const parent = frame.parentFrame();
      if (!parent)
        return;
      const context = await parent._mainContext();
      await context?.evaluate(({ snapshotStreamer, frameElement: frameElement2, frameId }) => {
        window[snapshotStreamer].markIframe(frameElement2, frameId);
      }, { snapshotStreamer: this._snapshotStreamer, frameElement, frameId: frame.guid });
      frameElement.dispose();
    } catch (e) {
    }
  }
}
const kNeedsResetSymbol = Symbol("kNeedsReset");

export { Snapshotter };
