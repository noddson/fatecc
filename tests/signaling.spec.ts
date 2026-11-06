import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

test('optional broker routes only host offers and player answers without retaining a closed room', async () => {
  const service = spawn(process.execPath, ['signaling/server.mjs'], {
    env: { ...process.env, SIGNALING_PORT: '0', SIGNALING_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sockets: WebSocket[] = [];
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Signaling server did not start.')), 10_000);
      service.stdout.on('data', (data) => {
        const match = String(data).match(/ws:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      service.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Signaling server exited (${code}).`));
      });
      service.once('error', reject);
    });
    const connect = async () => {
      const socket = new WebSocket(url);
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('WebSocket connection failed.')), {
          once: true,
        });
      });
      return socket;
    };
    const receive = (socket: WebSocket) =>
      new Promise<any>((resolve) =>
        socket.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
          once: true,
        }),
      );
    const host = await connect();
    let hostMessage = receive(host);
    host.send(JSON.stringify({ type: 'host' }));
    const hosted = await hostMessage;
    expect(hosted.type).toBe('hosted');
    expect(hosted.roomId).toMatch(/^[0-9a-f]{24}$/);
    const player = await connect();
    hostMessage = receive(host);
    player.send(JSON.stringify({ type: 'join', roomId: hosted.roomId }));
    const joined = await hostMessage;
    expect(joined.type).toBe('join');
    let playerMessage = receive(player);
    host.send(JSON.stringify({ type: 'offer', peerId: joined.peerId, offer: 'offer payload' }));
    expect(await playerMessage).toEqual({ type: 'offer', offer: 'offer payload' });
    hostMessage = receive(host);
    player.send(JSON.stringify({ type: 'answer', peerId: 'forged identity', answer: 'answer payload' }));
    expect(await hostMessage).toEqual({ type: 'answer', peerId: joined.peerId, answer: 'answer payload' });
    playerMessage = receive(player);
    player.send(JSON.stringify({ type: 'offer', peerId: joined.peerId, offer: 'forged host offer' }));
    expect((await playerMessage).type).toBe('error');
    const hostClosed = new Promise<void>((resolve) =>
      host.addEventListener('close', () => resolve(), { once: true }),
    );
    host.close();
    await hostClosed;
    const latePlayer = await connect();
    const lateMessage = receive(latePlayer);
    latePlayer.send(JSON.stringify({ type: 'join', roomId: hosted.roomId }));
    expect((await lateMessage).type).toBe('error');
  } finally {
    for (const socket of sockets) socket.close();
    service.kill('SIGTERM');
  }
});
