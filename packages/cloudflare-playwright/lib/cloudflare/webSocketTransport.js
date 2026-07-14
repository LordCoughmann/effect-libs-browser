import { AsyncLocalStorage } from 'node:async_hooks';

const transportZone = new AsyncLocalStorage();
class WebSocketTransport {
  static async connect() {
    const transport = transportZone.getStore();
    if (!transport)
      throw new Error("Transport is not available in the current zone");
    return transport;
  }
  constructor(ws, sessionId) {
    this._ws = ws;
    this.sessionId = sessionId;
    this._ws.addEventListener("message", (event) => {
      this.onmessage?.(JSON.parse(event.data));
    });
    this._ws.addEventListener("close", () => {
      this.onclose?.();
    });
    this._ws.addEventListener("error", (e) => {
      console.error(`Websocket error: SessionID: ${sessionId}`, e);
    });
  }
  send(message) {
    this._ws.send(JSON.stringify(message));
  }
  close() {
    this._ws.close();
    this.onclose?.();
  }
  async closeAndWait() {
    if (this._ws.readyState === WebSocket.CLOSED)
      return;
    this.close();
  }
  toString() {
    return this.sessionId;
  }
}

export { WebSocketTransport, transportZone };
