import '../../../_virtual/pixelmatch.js';
import '../utilsBundle.js';
import 'node:crypto';
import './utils/debug.js';
import { debugLogger } from './utils/debugLogger.js';
import './utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../zipBundle.js';
import './utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import './utils/happyEyeballs.js';
import './utils/nodePlatform.js';
import './utils/profiler.js';
import './utils/socksProxy.js';
import { makeWaitForNextTask } from './utils/task.js';
import 'node:os';
import './utils/zones.js';

class PipeTransport {
  constructor(pipeWrite, pipeRead) {
    this._pendingBuffers = [];
    this._waitForNextTask = makeWaitForNextTask();
    this._closed = false;
    this._pipeRead = pipeRead;
    this._pipeWrite = pipeWrite;
    pipeRead.on("data", (buffer) => this._dispatch(buffer));
    pipeRead.on("close", () => {
      this._closed = true;
      if (this._onclose)
        this._onclose.call(null);
    });
    pipeRead.on("error", (e) => debugLogger.log("error", e));
    pipeWrite.on("error", (e) => debugLogger.log("error", e));
    this.onmessage = void 0;
  }
  get onclose() {
    return this._onclose;
  }
  set onclose(onclose) {
    this._onclose = onclose;
    if (onclose && !this._pipeRead.readable)
      onclose();
  }
  send(message) {
    if (this._closed)
      throw new Error("Pipe has been closed");
    this._pipeWrite.write(JSON.stringify(message));
    this._pipeWrite.write("\0");
  }
  close() {
    throw new Error("unimplemented");
  }
  _dispatch(buffer) {
    let end = buffer.indexOf("\0");
    if (end === -1) {
      this._pendingBuffers.push(buffer);
      return;
    }
    this._pendingBuffers.push(buffer.slice(0, end));
    const message = Buffer.concat(this._pendingBuffers).toString();
    this._waitForNextTask(() => {
      if (this.onmessage)
        this.onmessage.call(null, JSON.parse(message));
    });
    let start = end + 1;
    end = buffer.indexOf("\0", start);
    while (end !== -1) {
      const message2 = buffer.toString(void 0, start, end);
      this._waitForNextTask(() => {
        if (this.onmessage)
          this.onmessage.call(null, JSON.parse(message2));
      });
      start = end + 1;
      end = buffer.indexOf("\0", start);
    }
    this._pendingBuffers = [buffer.slice(start)];
  }
}

export { PipeTransport };
