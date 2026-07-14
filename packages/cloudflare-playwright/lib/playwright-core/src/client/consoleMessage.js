import { JSHandle } from './jsHandle.js';

class ConsoleMessage {
  constructor(platform, event, page, worker) {
    this._page = page;
    this._worker = worker;
    this._event = event;
    if (platform.inspectCustom)
      this[platform.inspectCustom] = () => this._inspect();
  }
  worker() {
    return this._worker;
  }
  page() {
    return this._page;
  }
  type() {
    return this._event.type;
  }
  text() {
    return this._event.text;
  }
  args() {
    return this._event.args.map(JSHandle.from);
  }
  location() {
    return this._event.location;
  }
  _inspect() {
    return this.text();
  }
}

export { ConsoleMessage };
