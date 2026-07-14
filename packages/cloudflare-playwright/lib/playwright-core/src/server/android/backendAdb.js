import { EventEmitter } from 'node:events';
import net from 'node:net';
import { assert } from '../../utils/isomorphic/assert.js';
import { debug } from '../../utilsBundle.js';

class AdbBackend {
  async devices(options = {}) {
    const result = await runCommand("host:devices", options.host, options.port);
    const lines = result.toString().trim().split("\n");
    return lines.map((line) => {
      const [serial, status] = line.trim().split("	");
      return new AdbDevice(serial, status, options.host, options.port);
    });
  }
}
class AdbDevice {
  constructor(serial, status, host, port) {
    this._closed = false;
    this.serial = serial;
    this.status = status;
    this.host = host;
    this.port = port;
  }
  async init() {
  }
  async close() {
    this._closed = true;
  }
  runCommand(command) {
    if (this._closed)
      throw new Error("Device is closed");
    return runCommand(command, this.host, this.port, this.serial);
  }
  async open(command) {
    if (this._closed)
      throw new Error("Device is closed");
    const result = await open(command, this.host, this.port, this.serial);
    result.becomeSocket();
    return result;
  }
}
async function runCommand(command, host = "127.0.0.1", port = 5037, serial) {
  debug("pw:adb:runCommand")(command, serial);
  const socket = new BufferedSocketWrapper(command, net.createConnection({ host, port }));
  try {
    if (serial) {
      await socket.write(encodeMessage(`host:transport:${serial}`));
      const status2 = await socket.read(4);
      assert(status2.toString() === "OKAY", status2.toString());
    }
    await socket.write(encodeMessage(command));
    const status = await socket.read(4);
    assert(status.toString() === "OKAY", status.toString());
    let commandOutput;
    if (!command.startsWith("shell:")) {
      const remainingLength = parseInt((await socket.read(4)).toString(), 16);
      commandOutput = await socket.read(remainingLength);
    } else {
      commandOutput = await socket.readAll();
    }
    return commandOutput;
  } finally {
    socket.close();
  }
}
async function open(command, host = "127.0.0.1", port = 5037, serial) {
  const socket = new BufferedSocketWrapper(command, net.createConnection({ host, port }));
  if (serial) {
    await socket.write(encodeMessage(`host:transport:${serial}`));
    const status2 = await socket.read(4);
    assert(status2.toString() === "OKAY", status2.toString());
  }
  await socket.write(encodeMessage(command));
  const status = await socket.read(4);
  assert(status.toString() === "OKAY", status.toString());
  return socket;
}
function encodeMessage(message) {
  let lenHex = message.length.toString(16);
  lenHex = "0".repeat(4 - lenHex.length) + lenHex;
  return Buffer.from(lenHex + message);
}
class BufferedSocketWrapper extends EventEmitter {
  constructor(command, socket) {
    super();
    this._buffer = Buffer.from([]);
    this._isSocket = false;
    this._isClosed = false;
    this._command = command;
    this._socket = socket;
    this._connectPromise = new Promise((f) => this._socket.on("connect", f));
    this._socket.on("data", (data) => {
      debug("pw:adb:data")(data.toString());
      if (this._isSocket) {
        this.emit("data", data);
        return;
      }
      this._buffer = Buffer.concat([this._buffer, data]);
      if (this._notifyReader)
        this._notifyReader();
    });
    this._socket.on("close", () => {
      this._isClosed = true;
      if (this._notifyReader)
        this._notifyReader();
      this.close();
      this.emit("close");
    });
    this._socket.on("error", (error) => this.emit("error", error));
  }
  async write(data) {
    debug("pw:adb:send")(data.toString().substring(0, 100) + "...");
    await this._connectPromise;
    await new Promise((f) => this._socket.write(data, f));
  }
  close() {
    if (this._isClosed)
      return;
    debug("pw:adb")("Close " + this._command);
    this._socket.destroy();
  }
  async read(length) {
    await this._connectPromise;
    assert(!this._isSocket, "Can not read by length in socket mode");
    while (this._buffer.length < length)
      await new Promise((f) => this._notifyReader = f);
    const result = this._buffer.slice(0, length);
    this._buffer = this._buffer.slice(length);
    debug("pw:adb:recv")(result.toString().substring(0, 100) + "...");
    return result;
  }
  async readAll() {
    while (!this._isClosed)
      await new Promise((f) => this._notifyReader = f);
    return this._buffer;
  }
  becomeSocket() {
    assert(!this._buffer.length);
    this._isSocket = true;
  }
}

export { AdbBackend };
