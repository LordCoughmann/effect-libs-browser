/**
 * Minimal native WebSocket test server.
 *
 * Uses Node's built-in `http` server `upgrade` event to handle
 * WebSocket handshakes and frame parsing. No external dependencies
 * (no `ws` package) — we deliberately use only Node built-ins to keep
 * the project's "native WebSocket" stance.
 *
 * Supports:
 * - Upgrade handshake (RFC 6455 Sec-WebSocket-Accept)
 * - Text and binary frames
 * - Close frames
 * - Ping/pong (we send back a pong in response to a ping, as required
 *   by the spec)
 * - Multi-byte payload lengths (16-bit and 64-bit)
 *
 * Limits: payloads must fit in 4 GiB. Frame fragmentation is handled
 * (continuation frames are reassembled).
 *
 * Used by the WebSocket route interception integration tests to provide
 * a real WebSocket server for `connectToServer()` testing.
 *
 * @module tests/setup/WebSocketServer
 */

import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";

import * as Str from "effect/String";
import { createHash } from "node:crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

/** RFC 6455 §1.3 — magic GUID for Sec-WebSocket-Accept computation. */
const WS_MAGIC_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** WebSocket opcodes (RFC 6455 §5.2). */
const OPCODE_CONTINUATION = 0x0;
const OPCODE_TEXT = 0x1;
const OPCODE_BINARY = 0x2;
const OPCODE_CLOSE = 0x8;
const OPCODE_PING = 0x9;
const OPCODE_PONG = 0xa;

// ── Frame Parsing ─────────────────────────────────────────────────────────────

interface IncomingFrame {
  fin: boolean;
  opcode: number;
  payload: Buffer;
}

/**
 * WebSocket connection state. One per upgrade.
 *
 * The connection buffers incoming data and parses out complete frames.
 * Fragmented messages are reassembled into a single frame before being
 * delivered to the handler.
 */
class WebSocketConnection {
  private buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentOpcode: number = -1;
  private closed = false;

  constructor(
    private readonly socket: Duplex,
    private readonly handler: WebSocketHandler,
  ) {
    socket.on("data", (data) => this.onData(data as Buffer));
    socket.on("close", () => this.onClose());
    socket.on("error", () => {
      // ignore
    });
    handler.onOpen?.(this);
  }

  /** Send a text frame. */
  sendText(message: string): void {
    this.sendFrame(OPCODE_TEXT, Buffer.from(message, "utf8"));
  }

  /** Send a binary frame. */
  sendBinary(data: Buffer | Uint8Array): void {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.sendFrame(OPCODE_BINARY, buf);
  }

  /** Send a close frame. */
  close(code = 1000, reason = ""): void {
    if (this.closed) return;
    this.closed = true;
    const reasonBuf = Buffer.from(reason, "utf8");
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);
    this.sendFrame(OPCODE_CLOSE, payload);
    // The remote end will also send us a close; we don't strictly
    // need to end the socket here, but it helps avoid hanging tests.
    setImmediate(() => {
      if (typeof (this.socket as unknown as { end?: () => void }).end === "function") {
        (this.socket as unknown as { end: () => void }).end();
      } else {
        (this.socket as unknown as { destroy?: () => void }).destroy?.();
      }
    });
  }

  private sendFrame(opcode: number, payload: Buffer): void {
    if (this.closed) return;
    const len = payload.length;
    let header: Buffer;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 0x00 | len;
    } else if (len < 0x10000) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 0x00 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 0x00 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch {
      /* socket already closed */
    }
  }

  private onData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (true) {
      const frame = this.tryParseFrame();
      if (frame === null) break;
      this.handleFrame(frame);
    }
  }

  private tryParseFrame(): IncomingFrame | null {
    if (this.buffer.length < 2) return null;

    const b0 = this.buffer[0];
    const b1 = this.buffer[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let payloadLen = b1 & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
      if (this.buffer.length < offset + 2) return null;
      payloadLen = this.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLen === 127) {
      if (this.buffer.length < offset + 8) return null;
      // Use BigInt then downcast — test payloads are small.
      payloadLen = Number(this.buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    let mask: Buffer | null = null;
    if (masked) {
      if (this.buffer.length < offset + 4) return null;
      mask = this.buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    if (this.buffer.length < offset + payloadLen) return null;

    let payload = this.buffer.subarray(offset, offset + payloadLen);
    if (mask) {
      const out = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        out[i] = payload[i] ^ mask[i % 4];
      }
      payload = out;
    }

    // Advance the buffer
    this.buffer = this.buffer.subarray(offset + payloadLen);

    return { fin, opcode, payload };
  }

  private handleFrame(frame: IncomingFrame): void {
    switch (frame.opcode) {
      case OPCODE_TEXT:
      case OPCODE_BINARY: {
        if (this.fragmentOpcode === -1) {
          // Unfragmented
          this.handler.onMessage?.(this, frame.payload, frame.opcode === OPCODE_TEXT);
        } else {
          this.fragments.push(frame.payload);
        }
        if (frame.fin) {
          if (this.fragmentOpcode !== -1) {
            const combined = Buffer.concat(this.fragments);
            this.handler.onMessage?.(this, combined, this.fragmentOpcode === OPCODE_TEXT);
            this.fragments = [];
            this.fragmentOpcode = -1;
          }
        } else {
          if (this.fragmentOpcode === -1) this.fragmentOpcode = frame.opcode;
        }
        return;
      }
      case OPCODE_CONTINUATION: {
        this.fragments.push(frame.payload);
        if (frame.fin) {
          const combined = Buffer.concat(this.fragments);
          this.handler.onMessage?.(this, combined, this.fragmentOpcode === OPCODE_TEXT);
          this.fragments = [];
          this.fragmentOpcode = -1;
        }
        return;
      }
      case OPCODE_PING: {
        // Reply with pong (RFC 6455 §5.5.3)
        this.sendFrame(OPCODE_PONG, frame.payload);
        return;
      }
      case OPCODE_PONG: {
        // No-op (we don't send pings)
        return;
      }
      case OPCODE_CLOSE: {
        // Echo close back if we haven't sent one yet
        if (!this.closed) {
          this.sendFrame(OPCODE_CLOSE, frame.payload);
        }
        this.closed = true;
        this.handler.onClose?.(this, frame.payload);
        try {
          (this.socket as unknown as { end?: () => void }).end?.();
        } catch {
          /* ignore */
        }
        return;
      }
    }
  }

  private onClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.handler.onClose?.(this, null);
  }
}

// ── Handler Type ──────────────────────────────────────────────────────────────

/**
 * Handler for incoming WebSocket connections.
 *
 * Mirror of `ws`'s `WebSocketServer` options (subset).
 */
export interface WebSocketHandler {
  /** Called once per connection, with the WebSocketConnection. */
  onOpen?: (conn: WebSocketConnection) => void;
  /**
   * Called for each complete text/binary message.
   * `isText` is true for text frames, false for binary.
   */
  onMessage?: (conn: WebSocketConnection, payload: Buffer, isText: boolean) => void;
  /**
   * Called when the connection closes. `payload` is the close-frame
   * payload (2-byte code + UTF-8 reason) or null if the close was
   * unclean.
   */
  onClose?: (conn: WebSocketConnection, payload: Buffer | null) => void;
}

// ── Server Attach ─────────────────────────────────────────────────────────────

/**
 * Attaches a WebSocket handler to an existing HTTP server.
 *
 * Listens for `upgrade` events on the given path. Other paths are
 * ignored (so the regular HTTP routes still work).
 */
export const attachWebSocketHandler = (
  server: Server,
  path: string,
  handler: WebSocketHandler,
): void => {
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, _head: Buffer) => {
    if (req.url !== path) {
      // Not for us — leave it to other upgrade handlers.
      return;
    }
    const key = req.headers["sec-websocket-key"];
    if (typeof key !== "string" || Str.isEmpty(key)) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }
    const accept = createHash("sha1")
      .update(key + WS_MAGIC_GUID)
      .digest("base64");
    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        "",
      ].join("\r\n"),
    );
    // Detach socket from http parser
    (socket as unknown as { setNoDelay?: (noDelay: boolean) => void }).setNoDelay?.(true);
    // Create the connection
    new WebSocketConnection(socket, handler);
  });
};

/** Re-export the connection type for tests. */
export { WebSocketConnection };
