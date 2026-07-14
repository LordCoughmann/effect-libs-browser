import { makeWaitForNextTask } from './task.js';

class PipeTransport {
  constructor(pipeWrite, pipeRead, closeable, endian = "le") {
    this._data = Buffer.from([]);
    this._waitForNextTask = makeWaitForNextTask();
    this._closed = false;
    this._bytesLeft = 0;
    this._pipeWrite = pipeWrite;
    this._endian = endian;
    this._closeableStream = closeable;
    pipeRead.on("data", (buffer) => this._dispatch(buffer));
    pipeRead.on("close", () => {
      this._closed = true;
      if (this.onclose)
        this.onclose();
    });
    this.onmessage = void 0;
    this.onclose = void 0;
  }
  send(message) {
    if (this._closed)
      throw new Error("Pipe has been closed");
    const data = Buffer.from(message, "utf-8");
    const dataLength = Buffer.alloc(4);
    if (this._endian === "be")
      dataLength.writeUInt32BE(data.length, 0);
    else
      dataLength.writeUInt32LE(data.length, 0);
    this._pipeWrite.write(dataLength);
    this._pipeWrite.write(data);
  }
  close() {
    this._closeableStream.close();
  }
  _dispatch(buffer) {
    this._data = Buffer.concat([this._data, buffer]);
    while (true) {
      if (!this._bytesLeft && this._data.length < 4) {
        break;
      }
      if (!this._bytesLeft) {
        this._bytesLeft = this._endian === "be" ? this._data.readUInt32BE(0) : this._data.readUInt32LE(0);
        this._data = this._data.slice(4);
      }
      if (!this._bytesLeft || this._data.length < this._bytesLeft) {
        break;
      }
      const message = this._data.slice(0, this._bytesLeft);
      this._data = this._data.slice(this._bytesLeft);
      this._bytesLeft = 0;
      this._waitForNextTask(() => {
        if (this.onmessage)
          this.onmessage(message.toString("utf-8"));
      });
    }
  }
}

export { PipeTransport };
