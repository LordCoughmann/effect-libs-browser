import { ChannelOwner } from './channelOwner.js';

class WritableStream extends ChannelOwner {
  static from(Stream) {
    return Stream._object;
  }
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
  }
  stream() {
    return this._platform.streamWritable(this._channel);
  }
}

export { WritableStream };
