import { Artifact } from './artifact.js';
import { ChannelOwner } from './channelOwner.js';

class Tracing extends ChannelOwner {
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this._includeSources = false;
    this._isLive = false;
    this._isTracing = false;
  }
  static from(channel) {
    return channel._object;
  }
  async start(options = {}) {
    await this._wrapApiCall(async () => {
      this._includeSources = !!options.sources;
      this._isLive = !!options._live;
      await this._channel.tracingStart({
        name: options.name,
        snapshots: options.snapshots,
        screenshots: options.screenshots,
        live: options._live
      });
      const { traceName } = await this._channel.tracingStartChunk({ name: options.name, title: options.title });
      await this._startCollectingStacks(traceName, this._isLive);
    });
  }
  async startChunk(options = {}) {
    await this._wrapApiCall(async () => {
      const { traceName } = await this._channel.tracingStartChunk(options);
      await this._startCollectingStacks(traceName, this._isLive);
    });
  }
  async group(name, options = {}) {
    await this._channel.tracingGroup({ name, location: options.location });
  }
  async groupEnd() {
    await this._channel.tracingGroupEnd();
  }
  async _startCollectingStacks(traceName, live) {
    if (!this._isTracing) {
      this._isTracing = true;
      this._connection.setIsTracing(true);
    }
    const result = await this._connection.localUtils()?.tracingStarted({ tracesDir: this._tracesDir, traceName, live });
    this._stacksId = result?.stacksId;
  }
  async stopChunk(options = {}) {
    await this._wrapApiCall(async () => {
      await this._doStopChunk(options.path);
    });
  }
  async stop(options = {}) {
    await this._wrapApiCall(async () => {
      await this._doStopChunk(options.path);
      await this._channel.tracingStop();
    });
  }
  async _doStopChunk(filePath) {
    this._resetStackCounter();
    if (!filePath) {
      await this._channel.tracingStopChunk({ mode: "discard" });
      if (this._stacksId)
        await this._connection.localUtils().traceDiscarded({ stacksId: this._stacksId });
      return;
    }
    const localUtils = this._connection.localUtils();
    if (!localUtils)
      throw new Error("Cannot save trace in thin clients");
    const isLocal = !this._connection.isRemote();
    if (isLocal) {
      const result2 = await this._channel.tracingStopChunk({ mode: "entries" });
      await localUtils.zip({ zipFile: filePath, entries: result2.entries, mode: "write", stacksId: this._stacksId, includeSources: this._includeSources });
      return;
    }
    const result = await this._channel.tracingStopChunk({ mode: "archive" });
    if (!result.artifact) {
      if (this._stacksId)
        await localUtils.traceDiscarded({ stacksId: this._stacksId });
      return;
    }
    const artifact = Artifact.from(result.artifact);
    await artifact.saveAs(filePath);
    await artifact.delete();
    await localUtils.zip({ zipFile: filePath, entries: [], mode: "append", stacksId: this._stacksId, includeSources: this._includeSources });
  }
  _resetStackCounter() {
    if (this._isTracing) {
      this._isTracing = false;
      this._connection.setIsTracing(false);
    }
  }
}

export { Tracing };
