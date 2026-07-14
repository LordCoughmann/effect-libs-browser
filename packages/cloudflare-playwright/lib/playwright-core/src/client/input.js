class Keyboard {
  constructor(page) {
    this._page = page;
  }
  async down(key) {
    await this._page._channel.keyboardDown({ key });
  }
  async up(key) {
    await this._page._channel.keyboardUp({ key });
  }
  async insertText(text) {
    await this._page._channel.keyboardInsertText({ text });
  }
  async type(text, options = {}) {
    await this._page._channel.keyboardType({ text, ...options });
  }
  async press(key, options = {}) {
    await this._page._channel.keyboardPress({ key, ...options });
  }
}
class Mouse {
  constructor(page) {
    this._page = page;
  }
  async move(x, y, options = {}) {
    await this._page._channel.mouseMove({ x, y, ...options });
  }
  async down(options = {}) {
    await this._page._channel.mouseDown({ ...options });
  }
  async up(options = {}) {
    await this._page._channel.mouseUp(options);
  }
  async click(x, y, options = {}) {
    await this._page._channel.mouseClick({ x, y, ...options });
  }
  async dblclick(x, y, options = {}) {
    await this._page._wrapApiCall(async () => {
      await this.click(x, y, { ...options, clickCount: 2 });
    }, { title: "Double click" });
  }
  async wheel(deltaX, deltaY) {
    await this._page._channel.mouseWheel({ deltaX, deltaY });
  }
}
class Touchscreen {
  constructor(page) {
    this._page = page;
  }
  async tap(x, y) {
    await this._page._channel.touchscreenTap({ x, y });
  }
}

export { Keyboard, Mouse, Touchscreen };
