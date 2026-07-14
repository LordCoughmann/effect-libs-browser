import fs from 'node:fs';
import { debug } from '../../utilsBundle.js';

const debugLoggerColorMap = {
  "api": 45,
  // cyan
  "protocol": 34,
  // green
  "install": 34,
  // green
  "download": 34,
  // green
  "browser": 0,
  // reset
  "socks": 92,
  // purple
  "client-certificates": 92,
  // purple
  "error": 160,
  // red,
  "channel": 33,
  // blue
  "server": 45,
  // cyan
  "server:channel": 34,
  // green
  "server:metadata": 33,
  // blue,
  "recorder": 45
  // cyan
};
class DebugLogger {
  constructor() {
    this._debuggers = /* @__PURE__ */ new Map();
    if (process.env.DEBUG_FILE) {
      const ansiRegex = new RegExp([
        "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
        "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))"
      ].join("|"), "g");
      const stream = fs.createWriteStream(process.env.DEBUG_FILE);
      debug.log = (data) => {
        stream.write(data.replace(ansiRegex, ""));
        stream.write("\n");
      };
    }
  }
  log(name, message) {
    let cachedDebugger = this._debuggers.get(name);
    if (!cachedDebugger) {
      cachedDebugger = debug(`pw:${name}`);
      this._debuggers.set(name, cachedDebugger);
      cachedDebugger.color = debugLoggerColorMap[name] || 0;
    }
    cachedDebugger(message);
  }
  isEnabled(name) {
    return debug.enabled(`pw:${name}`);
  }
}
const debugLogger = new DebugLogger();
const kLogCount = 150;
class RecentLogsCollector {
  constructor() {
    this._logs = [];
    this._listeners = [];
  }
  log(message) {
    this._logs.push(message);
    if (this._logs.length === kLogCount * 2)
      this._logs.splice(0, kLogCount);
    for (const listener of this._listeners)
      listener(message);
  }
  recentLogs() {
    if (this._logs.length > kLogCount)
      return this._logs.slice(-kLogCount);
    return this._logs;
  }
  onMessage(listener) {
    for (const message of this._logs)
      listener(message);
    this._listeners.push(listener);
  }
}

export { RecentLogsCollector, debugLogger };
