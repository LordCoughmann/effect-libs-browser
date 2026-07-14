import { ChannelOwner } from './channelOwner.js';

class Stream extends ChannelOwner {
  static from(Stream2) {
    return Stream2._object;
  }
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
  }
  stream() {
    return this._platform.streamReadable(this._channel);
  }
}

export { Stream };
