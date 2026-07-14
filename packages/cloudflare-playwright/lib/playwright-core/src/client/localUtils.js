import { ChannelOwner } from './channelOwner.js';

class LocalUtils extends ChannelOwner {
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this.devices = {};
    for (const { name, descriptor } of initializer.deviceDescriptors)
      this.devices[name] = descriptor;
  }
  async zip(params) {
    return await this._channel.zip(params);
  }
  async harOpen(params) {
    return await this._channel.harOpen(params);
  }
  async harLookup(params) {
    return await this._channel.harLookup(params);
  }
  async harClose(params) {
    return await this._channel.harClose(params);
  }
  async harUnzip(params) {
    return await this._channel.harUnzip(params);
  }
  async tracingStarted(params) {
    return await this._channel.tracingStarted(params);
  }
  async traceDiscarded(params) {
    return await this._channel.traceDiscarded(params);
  }
  async addStackToTracingNoReply(params) {
    return await this._channel.addStackToTracingNoReply(params);
  }
}

export { LocalUtils };
