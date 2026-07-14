class Download {
  constructor(page, url, suggestedFilename, artifact) {
    this._page = page;
    this._url = url;
    this._suggestedFilename = suggestedFilename;
    this._artifact = artifact;
  }
  page() {
    return this._page;
  }
  url() {
    return this._url;
  }
  suggestedFilename() {
    return this._suggestedFilename;
  }
  async path() {
    return await this._artifact.pathAfterFinished();
  }
  async saveAs(path) {
    return await this._artifact.saveAs(path);
  }
  async failure() {
    return await this._artifact.failure();
  }
  async createReadStream() {
    return await this._artifact.createReadStream();
  }
  async cancel() {
    return await this._artifact.cancel();
  }
  async delete() {
    return await this._artifact.delete();
  }
}

export { Download };
