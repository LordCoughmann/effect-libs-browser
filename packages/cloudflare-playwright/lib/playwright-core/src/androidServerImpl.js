import { PlaywrightServer } from './remote/playwrightServer.js';
import { createPlaywright } from './server/playwright.js';
import { createGuid } from './server/utils/crypto.js';
import { ws } from './utilsBundle.js';
import { ProgressController } from './server/progress.js';

class AndroidServerLauncherImpl {
  async launchServer(options = {}) {
    const playwright = createPlaywright({ sdkLanguage: "javascript", isServer: true });
    const controller = new ProgressController();
    let devices = await controller.run((progress) => playwright.android.devices(progress, {
      host: options.adbHost,
      port: options.adbPort,
      omitDriverInstall: options.omitDriverInstall
    }));
    if (devices.length === 0)
      throw new Error("No devices found");
    if (options.deviceSerialNumber) {
      devices = devices.filter((d) => d.serial === options.deviceSerialNumber);
      if (devices.length === 0)
        throw new Error(`No device with serial number '${options.deviceSerialNumber}' was found`);
    }
    if (devices.length > 1)
      throw new Error(`More than one device found. Please specify deviceSerialNumber`);
    const device = devices[0];
    const path = options.wsPath ? options.wsPath.startsWith("/") ? options.wsPath : `/${options.wsPath}` : `/${createGuid()}`;
    const server = new PlaywrightServer({ mode: "launchServer", path, maxConnections: 1, preLaunchedAndroidDevice: device });
    const wsEndpoint = await server.listen(options.port, options.host);
    const browserServer = new ws.EventEmitter();
    browserServer.wsEndpoint = () => wsEndpoint;
    browserServer.close = () => device.close();
    browserServer.kill = () => device.close();
    device.on("close", () => {
      server.close();
      browserServer.emit("close");
    });
    return browserServer;
  }
}

export { AndroidServerLauncherImpl };
