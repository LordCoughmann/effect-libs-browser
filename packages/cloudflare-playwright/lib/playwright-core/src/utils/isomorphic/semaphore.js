import { ManualPromise } from './manualPromise.js';

class Semaphore {
  constructor(max) {
    this._acquired = 0;
    this._queue = [];
    this._max = max;
  }
  setMax(max) {
    this._max = max;
  }
  acquire() {
    const lock = new ManualPromise();
    this._queue.push(lock);
    this._flush();
    return lock;
  }
  release() {
    --this._acquired;
    this._flush();
  }
  _flush() {
    while (this._acquired < this._max && this._queue.length) {
      ++this._acquired;
      this._queue.shift().resolve();
    }
  }
}

export { Semaphore };
