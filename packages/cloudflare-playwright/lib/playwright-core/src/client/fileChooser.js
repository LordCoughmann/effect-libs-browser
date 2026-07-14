class FileChooser {
  constructor(page, elementHandle, isMultiple) {
    this._page = page;
    this._elementHandle = elementHandle;
    this._isMultiple = isMultiple;
  }
  element() {
    return this._elementHandle;
  }
  isMultiple() {
    return this._isMultiple;
  }
  page() {
    return this._page;
  }
  async setFiles(files, options) {
    return await this._elementHandle.setInputFiles(files, options);
  }
}

export { FileChooser };
