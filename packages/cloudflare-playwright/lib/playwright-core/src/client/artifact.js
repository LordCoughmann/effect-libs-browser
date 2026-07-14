import { ChannelOwner } from './channelOwner.js';
import { Stream } from './stream.js';
import { mkdirIfNeeded } from './fileUtils.js';

class Artifact extends ChannelOwner {
  static from(channel) {
    return channel._object;
  }
  async pathAfterFinished() {
    if (this._connection.isRemote())
      throw new Error(`Path is not available when connecting remotely. Use saveAs() to save a local copy.`);
    return (await this._channel.pathAfterFinished()).value;
  }
  async saveAs(path) {
    if (!this._connection.isRemote()) {
      await this._channel.saveAs({ path });
      return;
    }
    const result = await this._channel.saveAsStream();
    const stream = Stream.from(result.stream);
    await mkdirIfNeeded(this._platform, path);
    await new Promise((resolve, reject) => {
      stream.stream().pipe(this._platform.fs().createWriteStream(path)).on("finish", resolve).on("error", reject);
    });
  }
  async failure() {
    return (await this._channel.failure()).error || null;
  }
  async createReadStream() {
    const result = await this._channel.stream();
    const stream = Stream.from(result.stream);
    return stream.stream();
  }
  async readIntoBuffer() {
    const stream = await this.createReadStream();
    return await new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => {
        chunks.push(chunk);
      });
      stream.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      stream.on("error", reject);
    });
  }
  async cancel() {
    return await this._channel.cancel();
  }
  async delete() {
    return await this._channel.delete();
  }
}

export { Artifact };
