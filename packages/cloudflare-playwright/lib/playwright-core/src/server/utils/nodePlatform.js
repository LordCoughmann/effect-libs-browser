import require$$0 from '../../../../_virtual/inspector.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path__default from 'node:path';
import * as require$$0$2 from 'node:util';
import { pipeline, Writable, Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { colors } from '../../utilsBundle.js';
import { debugLogger } from './debugLogger.js';
import { emptyZone, currentZone } from './zones.js';
import { isUnderTest, debugMode } from './debug.js';

const pipelineAsync = require$$0$2.promisify(pipeline);
class NodeZone {
  constructor(zone) {
    this._zone = zone;
  }
  push(data) {
    return new NodeZone(this._zone.with("apiZone", data));
  }
  pop() {
    return new NodeZone(this._zone.without("apiZone"));
  }
  run(func) {
    return this._zone.run(func);
  }
  data() {
    return this._zone.data("apiZone");
  }
}
let boxedStackPrefixes = [];
const coreDir = path__default.dirname(".");
const nodePlatform = {
  name: "node",
  boxedStackPrefixes: () => {
    if (process.env.PWDEBUGIMPL)
      return [];
    return [coreDir, ...boxedStackPrefixes];
  },
  calculateSha1: (text) => {
    const sha1 = crypto.createHash("sha1");
    sha1.update(text);
    return Promise.resolve(sha1.digest("hex"));
  },
  colors,
  coreDir,
  createGuid: () => crypto.randomBytes(16).toString("hex"),
  defaultMaxListeners: () => EventEmitter.defaultMaxListeners,
  fs: () => fs,
  env: process.env,
  inspectCustom: require$$0$2.inspect.custom,
  isDebugMode: () => debugMode() === "inspector",
  isJSDebuggerAttached: () => !!require$$0.url(),
  isLogEnabled(name) {
    return debugLogger.isEnabled(name);
  },
  isUnderTest: () => isUnderTest(),
  log(name, message) {
    debugLogger.log(name, message);
  },
  path: () => path__default,
  pathSeparator: path__default.sep,
  showInternalStackFrames: () => !!process.env.PWDEBUGIMPL,
  async streamFile(path2, stream) {
    await pipelineAsync(fs.createReadStream(path2), stream);
  },
  streamReadable: (channel) => {
    return new ReadableStreamImpl(channel);
  },
  streamWritable: (channel) => {
    return new WritableStreamImpl(channel);
  },
  zodToJsonSchema: (schema) => {
    throw new Error("Not implemented");
  },
  zones: {
    current: () => new NodeZone(currentZone()),
    empty: new NodeZone(emptyZone)
  }
};
class ReadableStreamImpl extends Readable {
  constructor(channel) {
    super();
    this._channel = channel;
  }
  async _read() {
    const result = await this._channel.read({ size: 1024 * 1024 });
    if (result.binary.byteLength)
      this.push(result.binary);
    else
      this.push(null);
  }
  _destroy(error, callback) {
    this._channel.close().catch((e) => null);
    super._destroy(error, callback);
  }
}
class WritableStreamImpl extends Writable {
  constructor(channel) {
    super();
    this._channel = channel;
  }
  async _write(chunk, encoding, callback) {
    const error = await this._channel.write({ binary: typeof chunk === "string" ? Buffer.from(chunk) : chunk }).catch((e) => e);
    callback(error || null);
  }
  async _final(callback) {
    const error = await this._channel.close().catch((e) => e);
    callback(error || null);
  }
}

export { nodePlatform };
