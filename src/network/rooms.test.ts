import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  hostRoom,
  loadRoom,
  saveRoom,
  newRoomCode,
  normalizeRoomCode,
  parseRoomAddress,
  rotateRoom,
  signHost,
  verifyHost,
} from './rooms';
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());
it('generates prefixed codes and accepts suffixes, case differences, and QR join links', () => {
  expect(newRoomCode()).toMatch(/^fatecore-[A-HJ-NP-Z2-9]{8}$/);
  expect(normalizeRoomCode(' k7mp4qtx ')).toBe('fatecore-K7MP4QTX');
  expect(normalizeRoomCode('FATECORE-k7mp4qtx')).toBe('fatecore-K7MP4QTX');
  expect(parseRoomAddress('https://example.com/fatecc/#join=fatecore-K7MP4QTX')).toEqual({
    code: 'fatecore-K7MP4QTX',
  });
  for (const input of ['', 'fatecore-123', 'fatecore-00000000', 'https://example.com/#other=K7MP4QTX'])
    expect(() => normalizeRoomCode(input)).toThrow();
});
it('persists the same host identity and room across restarts, rotating only the code explicitly', async () => {
  const first = await hostRoom('campaign');
  expect(await hostRoom('campaign')).toEqual(first);
  const next = rotateRoom('campaign', first);
  expect(next.code).not.toBe(first.code);
  expect(next.publicKey).toBe(first.publicKey);
  expect(await hostRoom('campaign')).toEqual(next);
});
it('binds identity proofs to the room, campaign, fresh challenge and negotiated host fingerprint', async () => {
  const host = await hostRoom('campaign');
  const room = { ...host, campaignId: 'campaign' };
  const sdp = 'v=0\r\na=fingerprint:sha-256 ABCDEF\r\n';
  const signature = await signHost(host, 'campaign', 'challenge', sdp);
  expect(await verifyHost(room, 'challenge', sdp, signature)).toBe(true);
  expect(await verifyHost(room, 'other-challenge', sdp, signature)).toBe(false);
  expect(await verifyHost(room, 'challenge', sdp.replace('ABCDEF', 'ATTACKER'), signature)).toBe(false);
  expect(await verifyHost({ ...room, campaignId: 'other' }, 'challenge', sdp, signature)).toBe(false);
  expect(await verifyHost({ ...room, code: newRoomCode() }, 'challenge', sdp, signature)).toBe(false);
  const impostor = await hostRoom('impostor');
  expect(await verifyHost({ ...room, publicKey: impostor.publicKey }, 'challenge', sdp, signature)).toBe(
    false,
  );
});
it('keeps reconnect addresses separate per campaign and tolerates corrupt saved addresses', async () => {
  const host = await hostRoom('a');
  const a = { code: host.code, publicKey: host.publicKey, campaignId: 'a' };
  const b = { ...a, campaignId: 'b', code: newRoomCode() };
  saveRoom(a);
  saveRoom(b);
  expect(loadRoom('a')).toEqual(a);
  expect(loadRoom()).toEqual(b);
  storage.set('fate.client-room.v1.a', '{broken');
  expect(loadRoom('a')).toBeUndefined();
});
