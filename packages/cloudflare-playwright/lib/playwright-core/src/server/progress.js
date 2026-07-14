import { TimeoutError } from './errors.js';
import { assert } from '../utils/isomorphic/assert.js';
import { ManualPromise } from '../utils/isomorphic/manualPromise.js';
import { monotonicTime } from '../utils/isomorphic/time.js';
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
import 'node:os';
import './utils/zones.js';

class ProgressController {
  constructor(metadata, onCallLog) {
    this._forceAbortPromise = new ManualPromise();
    this._donePromise = new ManualPromise();
    this._state = "before";
    this.metadata = metadata || { id: "", startTime: 0, endTime: 0, type: "Internal", method: "", params: {}, log: [], internal: true };
    this._onCallLog = onCallLog;
    this._forceAbortPromise.catch((e) => null);
    this._controller = new AbortController();
  }
  static createForSdkObject(sdkObject, callMetadata) {
    const logName = sdkObject.logName || "api";
    return new ProgressController(callMetadata, (message) => {
      debugLogger.log(logName, message);
      sdkObject.instrumentation.onCallLog(sdkObject, callMetadata, logName, message);
    });
  }
  async abort(error) {
    if (this._state === "running") {
      error[kAbortErrorSymbol] = true;
      this._state = { error };
      this._forceAbortPromise.reject(error);
      this._controller.abort(error);
    }
    await this._donePromise;
  }
  async run(task, timeout) {
    const deadline = timeout ? monotonicTime() + timeout : 0;
    assert(this._state === "before");
    this._state = "running";
    let timer;
    const progress = {
      timeout: timeout ?? 0,
      deadline,
      disableTimeout: () => {
        clearTimeout(timer);
      },
      log: (message) => {
        if (this._state === "running")
          this.metadata.log.push(message);
        this._onCallLog?.(message);
      },
      metadata: this.metadata,
      race: (promise) => {
        const promises = Array.isArray(promise) ? promise : [promise];
        if (!promises.length)
          return Promise.resolve();
        return Promise.race([...promises, this._forceAbortPromise]);
      },
      wait: async (timeout2) => {
        let timer2;
        const promise = new Promise((f) => timer2 = setTimeout(f, timeout2));
        return progress.race(promise).finally(() => clearTimeout(timer2));
      },
      signal: this._controller.signal
    };
    if (deadline) {
      const timeoutError = new TimeoutError(`Timeout ${timeout}ms exceeded.`);
      timer = setTimeout(() => {
        if (this.metadata.pauseStartTime && !this.metadata.pauseEndTime)
          return;
        if (this._state === "running") {
          this._state = { error: timeoutError };
          this._forceAbortPromise.reject(timeoutError);
          this._controller.abort(timeoutError);
        }
      }, deadline - monotonicTime());
    }
    try {
      const result = await task(progress);
      this._state = "finished";
      return result;
    } catch (error) {
      this._state = { error };
      throw error;
    } finally {
      clearTimeout(timer);
      this._donePromise.resolve();
    }
  }
}
const kAbortErrorSymbol = Symbol("kAbortError");
function isAbortError(error) {
  return error instanceof TimeoutError || !!error[kAbortErrorSymbol];
}
async function raceUncancellableOperationWithCleanup(progress, run, cleanup) {
  let aborted = false;
  try {
    return await progress.race(run().then(async (t) => {
      if (aborted)
        await cleanup(t);
      return t;
    }));
  } catch (error) {
    aborted = true;
    throw error;
  }
}

export { ProgressController, isAbortError, raceUncancellableOperationWithCleanup };
