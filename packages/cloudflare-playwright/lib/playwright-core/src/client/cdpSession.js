import { ChannelOwner } from './channelOwner.js';

class CDPSession extends ChannelOwner {
  static from(cdpSession) {
    return cdpSession._object;
  }
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this._channel.on("event", ({ method, params }) => {
      this.emit(method, params);
    });
    this.on = super.on;
    this.addListener = super.addListener;
    this.off = super.removeListener;
    this.removeListener = super.removeListener;
    this.once = super.once;
  }
  async send(method, params) {
    const result = await this._channel.send({ method, params });
    return result.result;
  }
  async detach() {
    return await this._channel.detach();
  }
}

export { CDPSession };
