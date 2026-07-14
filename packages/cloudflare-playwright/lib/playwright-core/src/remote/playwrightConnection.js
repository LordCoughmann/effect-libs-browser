import '../server/registry/index.js';
import { DispatcherConnection, RootDispatcher } from '../server/dispatchers/dispatcher.js';
import { PlaywrightDispatcher } from '../server/dispatchers/playwrightDispatcher.js';
import { AndroidDevice } from '../server/android/android.js';
import 'node:events';
import 'node:net';
import '../utilsBundle.js';
import 'node:os';
import 'node:fs';
import 'node:path';
import '../server/browserContext.js';
import '../server/utils/debug.js';
import { monotonicTime } from '../utils/isomorphic/time.js';
import '../zipBundle.js';
import '../server/helper.js';
import 'node:crypto';
import '../../../_virtual/pixelmatch.js';
import { debugLogger } from '../server/utils/debugLogger.js';
import '../server/utils/expectUtils.js';
import '../server/utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../server/utils/happyEyeballs.js';
import '../server/utils/nodePlatform.js';
import { startProfiling, stopProfiling } from '../server/utils/profiler.js';
import '../server/utils/socksProxy.js';
import '../server/utils/zones.js';
import 'node:stream';
import 'node:tls';
import '../../../cloudflare/webSocketTransport.js';
import '../server/bidi/bidiBrowser.js';
import '../server/chromium/chromium.js';
import '../server/debugController.js';
import '../server/electron/electron.js';
import { Browser } from '../server/browser.js';
import '../protocol/serializers.js';
import '../server/network.js';
import '../server/page.js';
import '../server/webkit/wkPage.js';
import { DebugControllerDispatcher } from '../server/dispatchers/debugControllerDispatcher.js';

class PlaywrightConnection {
  constructor(semaphore, ws, controller, playwright, initialize, id) {
    this._cleanups = [];
    this._disconnected = false;
    this._ws = ws;
    this._semaphore = semaphore;
    this._id = id;
    this._profileName = (/* @__PURE__ */ new Date()).toISOString();
    const lock = this._semaphore.acquire();
    this._dispatcherConnection = new DispatcherConnection();
    this._dispatcherConnection.onmessage = async (message) => {
      await lock;
      if (ws.readyState !== ws.CLOSING) {
        const messageString = JSON.stringify(message);
        if (debugLogger.isEnabled("server:channel"))
          debugLogger.log("server:channel", `[${this._id}] ${monotonicTime() * 1e3} SEND ► ${messageString}`);
        if (debugLogger.isEnabled("server:metadata"))
          this.logServerMetadata(message, messageString, "SEND");
        ws.send(messageString);
      }
    };
    ws.on("message", async (message) => {
      await lock;
      const messageString = Buffer.from(message).toString();
      const jsonMessage = JSON.parse(messageString);
      if (debugLogger.isEnabled("server:channel"))
        debugLogger.log("server:channel", `[${this._id}] ${monotonicTime() * 1e3} ◀ RECV ${messageString}`);
      if (debugLogger.isEnabled("server:metadata"))
        this.logServerMetadata(jsonMessage, messageString, "RECV");
      this._dispatcherConnection.dispatch(jsonMessage);
    });
    ws.on("close", () => this._onDisconnect());
    ws.on("error", (error) => this._onDisconnect(error));
    if (controller) {
      debugLogger.log("server", `[${this._id}] engaged reuse controller mode`);
      this._root = new DebugControllerDispatcher(this._dispatcherConnection, playwright.debugController);
      return;
    }
    this._root = new RootDispatcher(this._dispatcherConnection, async (scope, params) => {
      await startProfiling();
      const options = await initialize();
      if (options.preLaunchedBrowser) {
        const browser = options.preLaunchedBrowser;
        browser.options.sdkLanguage = params.sdkLanguage;
        browser.on(Browser.Events.Disconnected, () => {
          this.close({ code: 1001, reason: "Browser closed" });
        });
      }
      if (options.preLaunchedAndroidDevice) {
        const androidDevice = options.preLaunchedAndroidDevice;
        androidDevice.on(AndroidDevice.Events.Close, () => {
          this.close({ code: 1001, reason: "Android device disconnected" });
        });
      }
      if (options.dispose)
        this._cleanups.push(options.dispose);
      const dispatcher = new PlaywrightDispatcher(scope, playwright, options);
      this._cleanups.push(() => dispatcher.cleanup());
      return dispatcher;
    });
  }
  async _onDisconnect(error) {
    this._disconnected = true;
    debugLogger.log("server", `[${this._id}] disconnected. error: ${error}`);
    await this._root.stopPendingOperations(new Error("Disconnected")).catch(() => {
    });
    this._root._dispose();
    debugLogger.log("server", `[${this._id}] starting cleanup`);
    for (const cleanup of this._cleanups)
      await cleanup().catch(() => {
      });
    await stopProfiling(this._profileName);
    this._semaphore.release();
    debugLogger.log("server", `[${this._id}] finished cleanup`);
  }
  logServerMetadata(message, messageString, direction) {
    const serverLogMetadata = {
      wallTime: Date.now(),
      id: message.id,
      guid: message.guid,
      method: message.method,
      payloadSizeInBytes: Buffer.byteLength(messageString, "utf-8")
    };
    debugLogger.log("server:metadata", (direction === "SEND" ? "SEND ► " : "◀ RECV ") + JSON.stringify(serverLogMetadata));
  }
  async close(reason) {
    if (this._disconnected)
      return;
    debugLogger.log("server", `[${this._id}] force closing connection: ${reason?.reason || ""} (${reason?.code || 0})`);
    try {
      this._ws.close(reason?.code, reason?.reason);
    } catch (e) {
    }
  }
}

export { PlaywrightConnection };
