import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

// Optional, stateless connection broker. Campaign content never travels over this socket.
const host = process.env.SIGNALING_HOST || '127.0.0.1';
const port = Number(process.env.SIGNALING_PORT || 8787);
const allowedOrigins = (process.env.SIGNALING_ORIGINS || '').split(',').filter(Boolean);
const lifetime = 2 * 60 * 60 * 1000;
const rooms = new Map();
const clients = new Map();
const server = createServer((request, response) => {
  response.writeHead(request.url === '/health' ? 200 : 404, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(
    JSON.stringify(
      request.url === '/health' ? { status: 'ok', role: 'signaling-only' } : { error: 'Not found' },
    ),
  );
});
const wss = new WebSocketServer({
  server,
  maxPayload: 256_000,
  verifyClient: (info) => !allowedOrigins.length || allowedOrigins.includes(info.origin),
});
const send = (socket, message) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
};
const failure = (socket, message) => send(socket, { type: 'error', message });

wss.on('connection', (socket) => {
  const client = { id: randomUUID(), socket, role: undefined, roomId: undefined, recent: [], alive: true };
  clients.set(socket, client);
  socket.on('pong', () => {
    client.alive = true;
  });
  socket.on('message', (raw) => {
    const now = Date.now();
    client.recent = client.recent.filter((time) => now - time < 60_000);
    if (client.recent.length >= 120) {
      socket.close(1008, 'Rate limit');
      return;
    }
    client.recent.push(now);
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      failure(socket, 'Invalid message.');
      return;
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return;
    if (message.type === 'host') {
      if (client.role) {
        failure(socket, 'This connection already belongs to a room.');
        return;
      }
      if (rooms.size >= 500) {
        failure(socket, 'The signaling service is full.');
        return;
      }
      const roomId = randomBytes(12).toString('hex');
      rooms.set(roomId, { host: client, peers: new Map(), expires: now + lifetime });
      client.role = 'host';
      client.roomId = roomId;
      send(socket, { type: 'hosted', roomId });
      return;
    }
    if (message.type === 'join') {
      if (client.role) {
        failure(socket, 'This connection already belongs to a room.');
        return;
      }
      const room = typeof message.roomId === 'string' && rooms.get(message.roomId);
      if (!room || room.expires <= now) {
        failure(socket, 'This room is unavailable or expired.');
        return;
      }
      if (room.peers.size >= 7) {
        failure(socket, 'This table is full.');
        return;
      }
      client.role = 'player';
      client.roomId = message.roomId;
      room.peers.set(client.id, client);
      send(room.host.socket, { type: 'join', peerId: client.id });
      return;
    }
    const room = client.roomId && rooms.get(client.roomId);
    if (!room || room.expires <= now) {
      failure(socket, 'Join or create a room first.');
      return;
    }
    if (
      message.type === 'offer' &&
      client.role === 'host' &&
      typeof message.peerId === 'string' &&
      typeof message.offer === 'string' &&
      message.offer.length <= 250_000
    ) {
      const peer = room.peers.get(message.peerId);
      if (peer) send(peer.socket, { type: 'offer', offer: message.offer });
      return;
    }
    if (
      message.type === 'answer' &&
      client.role === 'player' &&
      typeof message.answer === 'string' &&
      message.answer.length <= 250_000
    ) {
      send(room.host.socket, { type: 'answer', peerId: client.id, answer: message.answer });
      return;
    }
    failure(socket, 'This message is not permitted.');
  });
  socket.on('close', () => {
    clients.delete(socket);
    const room = client.roomId && rooms.get(client.roomId);
    if (!room) return;
    if (client.role === 'host') {
      rooms.delete(client.roomId);
      for (const peer of room.peers.values()) {
        failure(peer.socket, 'The host closed this invitation room. Existing peer connections may continue.');
        peer.socket.close();
      }
    } else room.peers.delete(client.id);
  });
});

const cleanup = setInterval(() => {
  for (const [id, room] of rooms)
    if (room.expires <= Date.now()) {
      rooms.delete(id);
      failure(room.host.socket, 'The invitation room expired. Create a new one for new players.');
      room.host.socket.close();
      for (const peer of room.peers.values()) peer.socket.close();
    }
  for (const client of clients.values()) {
    if (!client.alive) client.socket.terminate();
    else {
      client.alive = false;
      client.socket.ping();
    }
  }
}, 30_000);
cleanup.unref();
server.listen(port, host, () => console.log(`Fate signaling: ws://${host}:${server.address().port}`));
function close() {
  clearInterval(cleanup);
  for (const client of clients.values()) client.socket.terminate();
  wss.close();
  server.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
