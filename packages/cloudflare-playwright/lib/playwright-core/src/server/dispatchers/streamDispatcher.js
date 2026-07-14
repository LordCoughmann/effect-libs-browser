import { Dispatcher } from './dispatcher.js';
import { ManualPromise } from '../../utils/isomorphic/manualPromise.js';
import { SdkObject } from '../instrumentation.js';

class StreamSdkObject extends SdkObject {
  constructor(parent, stream) {
    super(parent, "stream");
    this.stream = stream;
  }
}
class StreamDispatcher extends Dispatcher {
  constructor(scope, stream) {
    super(scope, new StreamSdkObject(scope._object, stream), "Stream", {});
    this._type_Stream = true;
    this._ended = false;
    stream.once("end", () => this._ended = true);
    stream.once("error", () => this._ended = true);
  }
  async read(params, progress) {
    const stream = this._object.stream;
    if (this._ended)
      return { binary: Buffer.from("") };
    if (!stream.readableLength) {
      const readyPromise = new ManualPromise();
      const done = () => readyPromise.resolve();
      stream.on("readable", done);
      stream.on("end", done);
      stream.on("error", done);
      await progress.race(readyPromise).finally(() => {
        stream.off("readable", done);
        stream.off("end", done);
        stream.off("error", done);
      });
    }
    const buffer = stream.read(Math.min(stream.readableLength, params.size || stream.readableLength));
    return { binary: buffer || Buffer.from("") };
  }
  async close(params, progress) {
    this._object.stream.destroy();
  }
}

export { StreamDispatcher };
