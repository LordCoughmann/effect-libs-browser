import { ManualPromise } from '../utils/isomorphic/manualPromise.js';

class Video {
  constructor(page, connection) {
    this._artifact = null;
    this._artifactReadyPromise = new ManualPromise();
    this._isRemote = false;
    this._isRemote = connection.isRemote();
    this._artifact = page._closedOrCrashedScope.safeRace(this._artifactReadyPromise);
  }
  _artifactReady(artifact) {
    this._artifactReadyPromise.resolve(artifact);
  }
  async path() {
    if (this._isRemote)
      throw new Error(`Path is not available when connecting remotely. Use saveAs() to save a local copy.`);
    const artifact = await this._artifact;
    if (!artifact)
      throw new Error("Page did not produce any video frames");
    return artifact._initializer.absolutePath;
  }
  async saveAs(path) {
    const artifact = await this._artifact;
    if (!artifact)
      throw new Error("Page did not produce any video frames");
    return await artifact.saveAs(path);
  }
  async delete() {
    const artifact = await this._artifact;
    if (artifact)
      await artifact.delete();
  }
}

export { Video };
