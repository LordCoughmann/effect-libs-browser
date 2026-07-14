import path__default from 'node:path';
import { assert } from '../utils/isomorphic/assert.js';
import '../../../_virtual/pixelmatch.js';
import '../utilsBundle.js';
import { createGuid } from './utils/crypto.js';
import './utils/debug.js';
import { debugLogger } from './utils/debugLogger.js';
import { eventsHelper } from './utils/eventsHelper.js';
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
import { VideoRecorder } from './videoRecorder.js';
import { Page } from './page.js';
import { registry } from './registry/index.js';

class Screencast {
  constructor(page) {
    this._videoRecorder = null;
    this._videoId = null;
    this._screencastClients = /* @__PURE__ */ new Set();
    // Aiming at 25 fps by default - each frame is 40ms, but we give some slack with 35ms.
    // When throttling for tracing, 200ms between frames, except for 10 frames around the action.
    this._frameThrottler = new FrameThrottler(10, 35, 200);
    this._frameListener = null;
    this._page = page;
  }
  stopFrameThrottler() {
    this._frameThrottler.dispose();
  }
  setOptions(options) {
    this._setOptions(options).catch((e) => debugLogger.log("error", e));
    this._frameThrottler.setThrottlingEnabled(!!options);
  }
  throttleFrameAck(ack) {
    this._frameThrottler.ack(ack);
  }
  temporarilyDisableThrottling() {
    this._frameThrottler.recharge();
  }
  launchVideoRecorder() {
    const recordVideo = this._page.browserContext._options.recordVideo;
    if (!recordVideo)
      return void 0;
    assert(!this._videoId);
    this._videoId = createGuid();
    const outputFile = path__default.join(recordVideo.dir, this._videoId + ".webm");
    const videoOptions = {
      // validateBrowserContextOptions ensures correct video size.
      ...recordVideo.size,
      outputFile
    };
    const ffmpegPath = registry.findExecutable("ffmpeg").executablePathOrDie(this._page.browserContext._browser.sdkLanguage());
    this._videoRecorder = new VideoRecorder(ffmpegPath, videoOptions);
    this._frameListener = eventsHelper.addEventListener(this._page, Page.Events.ScreencastFrame, (frame) => this._videoRecorder.writeFrame(frame.buffer, frame.frameSwapWallTime / 1e3));
    this._page.waitForInitializedOrError().then((p) => {
      if (p instanceof Error)
        this.stopVideoRecording().catch(() => {
        });
    });
    return videoOptions;
  }
  async startVideoRecording(options) {
    const videoId = this._videoId;
    assert(videoId);
    this._page.once(Page.Events.Close, () => this.stopVideoRecording().catch(() => {
    }));
    const gotFirstFrame = new Promise((f) => this._page.once(Page.Events.ScreencastFrame, f));
    await this._startScreencast(this._videoRecorder, {
      quality: 90,
      width: options.width,
      height: options.height
    });
    gotFirstFrame.then(() => {
      this._page.browserContext._browser._videoStarted(this._page.browserContext, videoId, options.outputFile, this._page.waitForInitializedOrError());
    });
  }
  async stopVideoRecording() {
    if (!this._videoId)
      return;
    if (this._frameListener)
      eventsHelper.removeEventListeners([this._frameListener]);
    this._frameListener = null;
    const videoId = this._videoId;
    this._videoId = null;
    const videoRecorder = this._videoRecorder;
    this._videoRecorder = null;
    await this._stopScreencast(videoRecorder);
    await videoRecorder.stop();
    const video = this._page.browserContext._browser._takeVideo(videoId);
    video?.reportFinished();
  }
  async _setOptions(options) {
    if (options)
      await this._startScreencast(this, options);
    else
      await this._stopScreencast(this);
  }
  async _startScreencast(client, options) {
    this._screencastClients.add(client);
    if (this._screencastClients.size === 1) {
      await this._page.delegate.startScreencast({
        width: options.width,
        height: options.height,
        quality: options.quality
      });
    }
  }
  async _stopScreencast(client) {
    this._screencastClients.delete(client);
    if (!this._screencastClients.size)
      await this._page.delegate.stopScreencast();
  }
}
class FrameThrottler {
  constructor(nonThrottledFrames, defaultInterval, throttlingInterval) {
    this._acks = [];
    this._throttlingEnabled = false;
    this._nonThrottledFrames = nonThrottledFrames;
    this._budget = nonThrottledFrames;
    this._defaultInterval = defaultInterval;
    this._throttlingInterval = throttlingInterval;
    this._tick();
  }
  dispose() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = void 0;
    }
  }
  setThrottlingEnabled(enabled) {
    this._throttlingEnabled = enabled;
  }
  recharge() {
    for (const ack of this._acks)
      ack();
    this._acks = [];
    this._budget = this._nonThrottledFrames;
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._tick();
    }
  }
  ack(ack) {
    if (!this._timeoutId) {
      ack();
      return;
    }
    this._acks.push(ack);
  }
  _tick() {
    const ack = this._acks.shift();
    if (ack) {
      --this._budget;
      ack();
    }
    if (this._throttlingEnabled && this._budget <= 0) {
      this._timeoutId = setTimeout(() => this._tick(), this._throttlingInterval);
    } else {
      this._timeoutId = setTimeout(() => this._tick(), this._defaultInterval);
    }
  }
}

export { Screencast };
