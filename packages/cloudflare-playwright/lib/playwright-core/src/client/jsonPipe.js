import { ChannelOwner } from './channelOwner.js';

class JsonPipe extends ChannelOwner {
  static from(jsonPipe) {
    return jsonPipe._object;
  }
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
  }
  channel() {
    return this._channel;
  }
}

export { JsonPipe };
