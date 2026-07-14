import { assert } from '../utils/isomorphic/assert.js';
import { monotonicTime } from '../utils/isomorphic/time.js';
import '../../../_virtual/pixelmatch.js';
import '../utilsBundle.js';
import 'node:crypto';
import './utils/debug.js';
import { debugLogger } from './utils/debugLogger.js';
import './utils/expectUtils.js';
import { mkdirIfNeeded } from './utils/fileUtils.js';
import './utils/hostPlatform.js';
import 'node:fs';
import 'node:path';
import 'node:http';
import 'node:http2';
import 'node:https';
import './utils/happyEyeballs.js';
import './utils/nodePlatform.js';
import { launchProcess } from './utils/processLauncher.js';
import './utils/profiler.js';
import './utils/socksProxy.js';
import 'node:os';
import '../zipBundle.js';
import './utils/zones.js';

const fps = 25;
class VideoRecorder {
  constructor(ffmpegPath, options) {
    this._process = null;
    this._gracefullyClose = null;
    this._lastWritePromise = Promise.resolve();
    this._firstFrameTimestamp = 0;
    this._lastFrame = null;
    this._lastWriteNodeTime = 0;
    this._frameQueue = [];
    this._isStopped = false;
    this._ffmpegPath = ffmpegPath;
    if (!options.outputFile.endsWith(".webm"))
      throw new Error("File must have .webm extension");
    this._launchPromise = this._launch(options).catch((e) => e);
  }
  async _launch(options) {
    await mkdirIfNeeded(options.outputFile);
    const w = options.width;
    const h = options.height;
    const args = `-loglevel error -f image2pipe -avioflags direct -fpsprobesize 0 -probesize 32 -analyzeduration 0 -c:v mjpeg -i pipe:0 -y -an -r ${fps} -c:v vp8 -qmin 0 -qmax 50 -crf 8 -deadline realtime -speed 8 -b:v 1M -threads 1 -vf pad=${w}:${h}:0:0:gray,crop=${w}:${h}:0:0`.split(" ");
    args.push(options.outputFile);
    const { launchedProcess, gracefullyClose } = await launchProcess({
      command: this._ffmpegPath,
      args,
      stdio: "stdin",
      log: (message) => debugLogger.log("browser", message),
      tempDirectories: [],
      attemptToGracefullyClose: async () => {
        debugLogger.log("browser", "Closing stdin...");
        launchedProcess.stdin.end();
      },
      onExit: (exitCode, signal) => {
        debugLogger.log("browser", `ffmpeg onkill exitCode=${exitCode} signal=${signal}`);
      }
    });
    launchedProcess.stdin.on("finish", () => {
      debugLogger.log("browser", "ffmpeg finished input.");
    });
    launchedProcess.stdin.on("error", () => {
      debugLogger.log("browser", "ffmpeg error.");
    });
    this._process = launchedProcess;
    this._gracefullyClose = gracefullyClose;
  }
  writeFrame(frame, timestamp) {
    this._launchPromise.then((error) => {
      if (error)
        return;
      this._writeFrame(frame, timestamp);
    });
  }
  _writeFrame(frame, timestamp) {
    assert(this._process);
    if (this._isStopped)
      return;
    if (!this._firstFrameTimestamp)
      this._firstFrameTimestamp = timestamp;
    const frameNumber = Math.floor((timestamp - this._firstFrameTimestamp) * fps);
    if (this._lastFrame) {
      const repeatCount = frameNumber - this._lastFrame.frameNumber;
      for (let i = 0; i < repeatCount; ++i)
        this._frameQueue.push(this._lastFrame.buffer);
      this._lastWritePromise = this._lastWritePromise.then(() => this._sendFrames());
    }
    this._lastFrame = { buffer: frame, timestamp, frameNumber };
    this._lastWriteNodeTime = monotonicTime();
  }
  async _sendFrames() {
    while (this._frameQueue.length)
      await this._sendFrame(this._frameQueue.shift());
  }
  async _sendFrame(frame) {
    return new Promise((f) => this._process.stdin.write(frame, f)).then((error) => {
      if (error)
        debugLogger.log("browser", `ffmpeg failed to write: ${String(error)}`);
    });
  }
  async stop() {
    const error = await this._launchPromise;
    if (error)
      throw error;
    if (this._isStopped || !this._lastFrame)
      return;
    const addTime = Math.max((monotonicTime() - this._lastWriteNodeTime) / 1e3, 1);
    this._writeFrame(Buffer.from([]), this._lastFrame.timestamp + addTime);
    this._isStopped = true;
    try {
      await this._lastWritePromise;
      await this._gracefullyClose();
    } catch (e) {
      debugLogger.log("error", `ffmpeg failed to stop: ${String(e)}`);
    }
  }
}

export { VideoRecorder };
