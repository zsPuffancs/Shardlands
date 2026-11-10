'use strict';
const { createHash } = require('node:crypto');

const MAX_PENDING_BYTES = 256 * 1024;
const MAX_FRAME_BYTES = 65536;
const HEARTBEAT_MS = 15000;

function encodeFrame(opcode, payload) {
  const payloadLength = payload.length;
  const header = Buffer.alloc(payloadLength < 126 ? 2 : payloadLength < 65536 ? 4 : 10);
  header[0] = 0x80 | opcode;
  if (payloadLength < 126) header[1] = payloadLength;
  else if (payloadLength < 65536) { header[1] = 126; header.writeUInt16BE(payloadLength, 2); }
  else { header[1] = 127; header.writeBigUInt64BE(BigInt(payloadLength), 2); }
  return Buffer.concat([header, payload]);
}

function attachWebSockets(server, onMessage, onLeave) {
  const clients = new Set();
  let backpressureDisconnects = 0;
  function dispose(client) {
    if (client.closed) return;
    client.closed = true;
    clients.delete(client);
    onLeave(client);
  }

  function canSend(client) {
    if (!client || client.closed || client.sock.destroyed || client.sock.writableEnded) return false;
    if (client.sock.writableLength >= MAX_PENDING_BYTES) {
      backpressureDisconnects++;
      client.sock.destroy();
      return false;
    }
    return true;
  }

  function write(client, opcode, payload) {
    if (!canSend(client)) return false;
    const frame = encodeFrame(opcode, payload);
    if (client.sock.writableLength + frame.length > MAX_PENDING_BYTES) {
      backpressureDisconnects++;
      client.sock.destroy();
      return false;
    }
    client.sock.write(frame);
    client.bytes += frame.length;
    return true;
  }

  function receive(client, chunk) {
    if (client.closed) return;
    client.buf = client.buf.length ? Buffer.concat([client.buf, chunk]) : chunk;
    while (!client.sock.destroyed && client.buf.length >= 2) {
      const buffer = client.buf, opcode = buffer[0] & 15;
      const final = (buffer[0] & 0x80) !== 0;
      let payloadLength = buffer[1] & 127, offset = 2;
      if ((buffer[0] & 0x70) || !(buffer[1] & 0x80) || ![0, 1, 8, 9, 10].includes(opcode)) return client.sock.destroy();
      if (opcode >= 8 && (!final || payloadLength > 125)) return client.sock.destroy();
      if (payloadLength === 126) {
        if (buffer.length < 4) return;
        payloadLength = buffer.readUInt16BE(2); offset = 4;
      } else if (payloadLength === 127) {
        if (buffer.length < 10) return;
        payloadLength = Number(buffer.readBigUInt64BE(2)); offset = 10;
      }
      if (payloadLength > MAX_FRAME_BYTES || (opcode === 0 && client.fragmentBytes + payloadLength > MAX_FRAME_BYTES)) return client.sock.destroy();
      if (buffer.length < offset + 4 + payloadLength) return;
      const mask = buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + payloadLength));
      for (let i = 0; i < payloadLength; i++) payload[i] ^= mask[i & 3];
      client.buf = buffer.subarray(offset + 4 + payloadLength);

      if (opcode === 8) {
        dispose(client);
        return client.sock.end(encodeFrame(8, payload));
      }
      if (opcode === 9) { write(client, 10, payload); continue; }
      if (opcode === 10) { client.alive = true; continue; }
      if ((opcode === 1 && client.fragments.length) || (opcode === 0 && !client.fragments.length)) return client.sock.destroy();
      let message = payload;
      if (!final || opcode === 0) {
        client.fragments.push(payload);
        client.fragmentBytes += payloadLength;
        if (client.fragments.length > 256) return client.sock.destroy();
        if (!final) continue;
        message = Buffer.concat(client.fragments, client.fragmentBytes);
        client.fragments = [];
        client.fragmentBytes = 0;
      }
      let parsed;
      try { parsed = JSON.parse(message.toString()); } catch { continue; }
      try { onMessage(client, parsed); } catch (error) { console.error('WebSocket message handler failed', error); }
    }
  }

  function upgrade(req, socket, head) {
    const key = req.headers['sec-websocket-key'];
    if (req.method !== 'GET' || req.headers.upgrade?.toLowerCase() !== 'websocket' ||
        req.headers['sec-websocket-version'] !== '13' || typeof key !== 'string' ||
        !/^[A-Za-z0-9+/]{22}==$/.test(key)) return socket.destroy();
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    const client = { sock: socket, buf: Buffer.alloc(0), p: null, alive: true, closed: false, bytes: 0,
      connectedAt: Date.now(), fragments: [], fragmentBytes: 0 };
    clients.add(client);
    socket.setNoDelay(true);
    socket.on('data', chunk => receive(client, chunk));
    socket.on('close', () => dispose(client));
    socket.on('error', () => dispose(client));
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    if (head.length) receive(client, head);
  }
  server.on('upgrade', upgrade);

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) { client.sock.destroy(); continue; }
      client.alive = false;
      write(client, 9, Buffer.alloc(0));
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    canSend,
    send: (client, obj) => write(client, 1, Buffer.from(JSON.stringify(obj))),
    stats() {
      let bytesPerSecond = 0, peakPlayerBytesPerSecond = 0;
      for (const client of clients) {
        if (!client.p) continue;
        const rate = client.bytes / Math.max(1, (Date.now() - client.connectedAt) / 1000);
        bytesPerSecond += rate;
        peakPlayerBytesPerSecond = Math.max(peakPlayerBytesPerSecond, rate);
      }
      return { bytesPerSecond: Math.round(bytesPerSecond), peakPlayerBytesPerSecond: Math.round(peakPlayerBytesPerSecond), backpressureDisconnects };
    },
    close() {
      server.off('upgrade', upgrade);
      clearInterval(heartbeat);
      for (const client of clients) { dispose(client); client.sock.destroy(); }
    },
  };
}

module.exports = { attachWebSockets };
