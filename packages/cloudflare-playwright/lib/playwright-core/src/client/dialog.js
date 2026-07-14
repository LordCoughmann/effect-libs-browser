import { ChannelOwner } from './channelOwner.js';
import { Page } from './page.js';

class Dialog extends ChannelOwner {
  static from(dialog) {
    return dialog._object;
  }
  constructor(parent, type, guid, initializer) {
    super(parent, type, guid, initializer);
    this._page = Page.fromNullable(initializer.page);
  }
  page() {
    return this._page;
  }
  type() {
    return this._initializer.type;
  }
  message() {
    return this._initializer.message;
  }
  defaultValue() {
    return this._initializer.defaultValue;
  }
  async accept(promptText) {
    await this._channel.accept({ promptText });
  }
  async dismiss() {
    await this._channel.dismiss();
  }
}

export { Dialog };
