class ConsoleMessage {
  constructor(page, worker, type, text, args, location) {
    this._page = page;
    this._worker = worker;
    this._type = type;
    this._text = text;
    this._args = args;
    this._location = location || { url: "", lineNumber: 0, columnNumber: 0 };
  }
  page() {
    return this._page;
  }
  worker() {
    return this._worker;
  }
  type() {
    return this._type;
  }
  text() {
    if (this._text === void 0)
      this._text = this._args.map((arg) => arg.preview()).join(" ");
    return this._text;
  }
  args() {
    return this._args;
  }
  location() {
    return this._location;
  }
}

export { ConsoleMessage };
