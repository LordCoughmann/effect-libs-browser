import { assert } from '../../utils/isomorphic/assert.js';
import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import '../utils/debug.js';
import '../utils/debugLogger.js';
import { eventsHelper } from '../utils/eventsHelper.js';
import '../utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../../zipBundle.js';
import '../utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../utils/happyEyeballs.js';
import '../utils/nodePlatform.js';
import '../utils/profiler.js';
import '../utils/socksProxy.js';
import 'node:os';
import '../utils/zones.js';

class WKProvisionalPage {
  constructor(session, page) {
    this._sessionListeners = [];
    this._mainFrameId = null;
    this._session = session;
    this._wkPage = page;
    this._coopNavigationRequest = page._page.mainFrame().pendingDocument()?.request;
    const overrideFrameId = (handler) => {
      return (payload) => {
        if (payload.frameId)
          payload.frameId = this._wkPage._page.frameManager.mainFrame()._id;
        handler(payload);
      };
    };
    const wkPage = this._wkPage;
    this._sessionListeners = [
      eventsHelper.addEventListener(session, "Network.requestWillBeSent", overrideFrameId((e) => this._onRequestWillBeSent(e))),
      eventsHelper.addEventListener(session, "Network.requestIntercepted", overrideFrameId((e) => wkPage._onRequestIntercepted(session, e))),
      eventsHelper.addEventListener(session, "Network.responseReceived", overrideFrameId((e) => wkPage._onResponseReceived(session, e))),
      eventsHelper.addEventListener(session, "Network.loadingFinished", overrideFrameId((e) => this._onLoadingFinished(e))),
      eventsHelper.addEventListener(session, "Network.loadingFailed", overrideFrameId((e) => this._onLoadingFailed(e)))
    ];
    this.initializationPromise = this._wkPage._initializeSession(session, true, ({ frameTree }) => this._handleFrameTree(frameTree));
  }
  coopNavigationRequest() {
    return this._coopNavigationRequest;
  }
  dispose() {
    eventsHelper.removeEventListeners(this._sessionListeners);
  }
  commit() {
    assert(this._mainFrameId);
    this._wkPage._onFrameAttached(this._mainFrameId, null);
  }
  _onRequestWillBeSent(event) {
    if (this._coopNavigationRequest && this._coopNavigationRequest.url() === event.request.url) {
      this._wkPage._adoptRequestFromNewProcess(this._coopNavigationRequest, this._session, event.requestId);
      return;
    }
    this._wkPage._onRequestWillBeSent(this._session, event);
  }
  _onLoadingFinished(event) {
    this._coopNavigationRequest = void 0;
    this._wkPage._onLoadingFinished(event);
  }
  _onLoadingFailed(event) {
    this._coopNavigationRequest = void 0;
    this._wkPage._onLoadingFailed(this._session, event);
  }
  _handleFrameTree(frameTree) {
    assert(!frameTree.frame.parentId);
    this._mainFrameId = frameTree.frame.id;
  }
}

export { WKProvisionalPage };
