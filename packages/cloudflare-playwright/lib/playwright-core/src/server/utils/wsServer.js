import { createHttpServer } from './network.js';
import { wsServer } from '../../utilsBundle.js';
import { debugLogger } from './debugLogger.js';

let lastConnectionId = 0;
const kConnectionSymbol = Symbol("kConnection");
const perMessageDeflate = {
  serverNoContextTakeover: true,
  zlibDeflateOptions: {
    level: 3
  },
  zlibInflateOptions: {
    chunkSize: 10 * 1024
  },
  threshold: 10 * 1024
};
class WSServer {
  constructor(delegate) {
    this._delegate = delegate;
  }
  async listen(port = 0, hostname, path) {
    debugLogger.log("server", `Server started at ${/* @__PURE__ */ new Date()}`);
    const server = createHttpServer(this._delegate.onRequest);
    server.on("error", (error) => debugLogger.log("server", String(error)));
    this.server = server;
    const wsEndpoint = await new Promise((resolve, reject) => {
      server.listen(port, hostname, () => {
        const address = server.address();
        if (!address) {
          reject(new Error("Could not bind server socket"));
          return;
        }
        const wsEndpoint2 = typeof address === "string" ? `${address}${path}` : `ws://${hostname || "localhost"}:${address.port}${path}`;
        resolve(wsEndpoint2);
      }).on("error", reject);
    });
    debugLogger.log("server", "Listening at " + wsEndpoint);
    this._wsServer = new wsServer({
      noServer: true,
      perMessageDeflate
    });
    this._wsServer.on("headers", (headers) => this._delegate.onHeaders(headers));
    server.on("upgrade", (request, socket, head) => {
      const pathname = new URL("http://localhost" + request.url).pathname;
      if (pathname !== path) {
        socket.write(`HTTP/${request.httpVersion} 400 Bad Request\r
\r
`);
        socket.destroy();
        return;
      }
      const upgradeResult = this._delegate.onUpgrade(request, socket);
      if (upgradeResult) {
        socket.write(upgradeResult.error);
        socket.destroy();
        return;
      }
      this._wsServer.handleUpgrade(request, socket, head, (ws) => this._wsServer.emit("connection", ws, request));
    });
    this._wsServer.on("connection", (ws, request) => {
      debugLogger.log("server", "Connected client ws.extension=" + ws.extensions);
      const url = new URL("http://localhost" + (request.url || ""));
      const id = String(++lastConnectionId);
      debugLogger.log("server", `[${id}] serving connection: ${request.url}`);
      const connection = this._delegate.onConnection(request, url, ws, id);
      ws[kConnectionSymbol] = connection;
    });
    return wsEndpoint;
  }
  async close() {
    const server = this._wsServer;
    if (!server)
      return;
    debugLogger.log("server", "closing websocket server");
    const waitForClose = new Promise((f) => server.close(f));
    await Promise.all(Array.from(server.clients).map(async (ws) => {
      const connection = ws[kConnectionSymbol];
      if (connection)
        await connection.close();
      try {
        ws.terminate();
      } catch (e) {
      }
    }));
    await waitForClose;
    debugLogger.log("server", "closing http server");
    if (this.server)
      await new Promise((f) => this.server.close(f));
    this._wsServer = void 0;
    this.server = void 0;
    debugLogger.log("server", "closed server");
  }
}

export { WSServer, perMessageDeflate };
