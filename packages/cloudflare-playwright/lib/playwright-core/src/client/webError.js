class WebError {
  constructor(page, error) {
    this._page = page;
    this._error = error;
  }
  page() {
    return this._page;
  }
  error() {
    return this._error;
  }
}

export { WebError };
