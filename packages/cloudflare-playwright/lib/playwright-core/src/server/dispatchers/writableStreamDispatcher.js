import fs from 'node:fs';
import { Dispatcher } from './dispatcher.js';
import { SdkObject } from '../instrumentation.js';

class WritableStreamSdkObject extends SdkObject {
  constructor(parent, streamOrDirectory, lastModifiedMs) {
    super(parent, "stream");
    this.streamOrDirectory = streamOrDirectory;
    this.lastModifiedMs = lastModifiedMs;
  }
}
class WritableStreamDispatcher extends Dispatcher {
  constructor(scope, streamOrDirectory, lastModifiedMs) {
    super(scope, new WritableStreamSdkObject(scope._object, streamOrDirectory, lastModifiedMs), "WritableStream", {});
    this._type_WritableStream = true;
  }
  async write(params, progress) {
    if (typeof this._object.streamOrDirectory === "string")
      throw new Error("Cannot write to a directory");
    const stream = this._object.streamOrDirectory;
    await progress.race(new Promise((fulfill, reject) => {
      stream.write(params.binary, (error) => {
        if (error)
          reject(error);
        else
          fulfill();
      });
    }));
  }
  async close(params, progress) {
    if (typeof this._object.streamOrDirectory === "string")
      throw new Error("Cannot close a directory");
    const stream = this._object.streamOrDirectory;
    await progress.race(new Promise((fulfill) => stream.end(fulfill)));
    if (this._object.lastModifiedMs)
      await progress.race(fs.promises.utimes(this.path(), new Date(this._object.lastModifiedMs), new Date(this._object.lastModifiedMs)));
  }
  path() {
    if (typeof this._object.streamOrDirectory === "string")
      return this._object.streamOrDirectory;
    return this._object.streamOrDirectory.path;
  }
}

export { WritableStreamDispatcher };
