import fs from 'node:fs';

class ThrottledFile {
  constructor(file) {
    this._file = file;
  }
  setContent(text) {
    this._text = text;
    if (!this._timer)
      this._timer = setTimeout(() => this.flush(), 250);
  }
  flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = void 0;
    }
    if (this._text)
      fs.writeFileSync(this._file, this._text);
    this._text = void 0;
  }
}

export { ThrottledFile };
