import { yauzl } from '../../zipBundle.js';

class ZipFile {
  constructor(fileName) {
    this._entries = /* @__PURE__ */ new Map();
    this._fileName = fileName;
    this._openedPromise = this._open();
  }
  async _open() {
    await new Promise((fulfill, reject) => {
      yauzl.open(this._fileName, { autoClose: false }, (e, z) => {
        if (e) {
          reject(e);
          return;
        }
        this._zipFile = z;
        this._zipFile.on("entry", (entry) => {
          this._entries.set(entry.fileName, entry);
        });
        this._zipFile.on("end", fulfill);
      });
    });
  }
  async entries() {
    await this._openedPromise;
    return [...this._entries.keys()];
  }
  async read(entryPath) {
    await this._openedPromise;
    const entry = this._entries.get(entryPath);
    if (!entry)
      throw new Error(`${entryPath} not found in file ${this._fileName}`);
    return new Promise((resolve, reject) => {
      this._zipFile.openReadStream(entry, (error, readStream) => {
        if (error || !readStream) {
          reject(error || "Entry not found");
          return;
        }
        const buffers = [];
        readStream.on("data", (data) => buffers.push(data));
        readStream.on("end", () => resolve(Buffer.concat(buffers)));
      });
    });
  }
  close() {
    this._zipFile?.close();
  }
}

export { ZipFile };
