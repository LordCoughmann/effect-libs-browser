import { debugLogger } from './utils/debugLogger.js';
import { eventsHelper } from './utils/eventsHelper.js';

const MAX_LOG_LENGTH = process.env.MAX_LOG_LENGTH ? +process.env.MAX_LOG_LENGTH : Infinity;
class Helper {
  static completeUserURL(urlString) {
    if (urlString.startsWith("localhost") || urlString.startsWith("127.0.0.1"))
      urlString = "http://" + urlString;
    return urlString;
  }
  static enclosingIntRect(rect) {
    const x = Math.floor(rect.x + 1e-3);
    const y = Math.floor(rect.y + 1e-3);
    const x2 = Math.ceil(rect.x + rect.width - 1e-3);
    const y2 = Math.ceil(rect.y + rect.height - 1e-3);
    return { x, y, width: x2 - x, height: y2 - y };
  }
  static enclosingIntSize(size) {
    return { width: Math.floor(size.width + 1e-3), height: Math.floor(size.height + 1e-3) };
  }
  static getViewportSizeFromWindowFeatures(features) {
    const widthString = features.find((f) => f.startsWith("width="));
    const heightString = features.find((f) => f.startsWith("height="));
    const width = widthString ? parseInt(widthString.substring(6), 10) : NaN;
    const height = heightString ? parseInt(heightString.substring(7), 10) : NaN;
    if (!Number.isNaN(width) && !Number.isNaN(height))
      return { width, height };
    return null;
  }
  static waitForEvent(progress, emitter, event, predicate) {
    const listeners = [];
    const dispose = () => eventsHelper.removeEventListeners(listeners);
    const promise = progress.race(new Promise((resolve, reject) => {
      listeners.push(eventsHelper.addEventListener(emitter, event, (eventArg) => {
        try {
          if (predicate && !predicate(eventArg))
            return;
          resolve(eventArg);
        } catch (e) {
          reject(e);
        }
      }));
    })).finally(() => dispose());
    return { promise, dispose };
  }
  static secondsToRoundishMillis(value) {
    return (value * 1e6 | 0) / 1e3;
  }
  static millisToRoundishMillis(value) {
    return (value * 1e3 | 0) / 1e3;
  }
  static debugProtocolLogger(protocolLogger) {
    return (direction, message) => {
      if (protocolLogger)
        protocolLogger(direction, message);
      if (debugLogger.isEnabled("protocol")) {
        let text = JSON.stringify(message);
        if (text.length > MAX_LOG_LENGTH)
          text = text.substring(0, MAX_LOG_LENGTH / 2) + " <<<<<( LOG TRUNCATED )>>>>> " + text.substring(text.length - MAX_LOG_LENGTH / 2);
        debugLogger.log("protocol", (direction === "send" ? "SEND ► " : "◀ RECV ") + text);
      }
    };
  }
  static formatBrowserLogs(logs, disconnectReason) {
    if (!disconnectReason && !logs.length)
      return "";
    return "\n" + (disconnectReason ? disconnectReason + "\n" : "") + logs.join("\n");
  }
}
const helper = Helper;

export { helper };
