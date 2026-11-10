import type Peer from 'peerjs';
import type { PeerOptions } from 'peerjs';

// The manual offer/answer workflow is retained for a future offline mode.
export const MANUAL_PAIRING_ENABLED = import.meta.env.VITE_ENABLE_MANUAL_PAIRING === 'true';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRoomCode(): string {
  return `fatecore-${Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => alphabet[n % 32]).join('')}`;
}
export function normalizeRoomCode(input: string): string {
  let code = input.trim();
  if (/^https?:\/\//i.test(code)) {
    const url = new URL(code);
    code = new URLSearchParams(url.hash.slice(1)).get('join') || '';
  }
  code = code.replace(/^fatecore-/i, '').toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new Error('Enter a room code such as fatecore-K7MP4QTX.');
  return `fatecore-${code}`;
}
export function roomLink(code: string, publicKey?: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = new URLSearchParams({
    join: normalizeRoomCode(code),
    ...(publicKey ? { host: publicKey } : {}),
  }).toString();
  return url.href;
}
export interface RoomAddress {
  code: string;
  publicKey?: string;
  campaignId?: string;
}
export function parseRoomAddress(input: string): RoomAddress {
  const code = normalizeRoomCode(input);
  const publicKey = /^https?:\/\//i.test(input.trim())
    ? new URLSearchParams(new URL(input.trim()).hash.slice(1)).get('host') || undefined
    : undefined;
  if (publicKey && !/^[A-Za-z0-9_-]{87}$/.test(publicKey))
    throw new Error('This room link has an invalid host identity.');
  return { code, publicKey };
}
export function initialRoomAddress(): string {
  try {
    parseRoomAddress(window.location.href);
    return window.location.href;
  } catch {
    return '';
  }
}
export interface SavedRoom extends RoomAddress {
  campaignId: string;
  publicKey: string;
}
const hostKey = (id: string) => `fate.host-room.v1.${id}`;
const clientKey = (id: string) => `fate.client-room.v1.${id}`;
export function loadRoom(campaignId?: string): SavedRoom | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(clientKey(campaignId || 'last')) || 'null');
    if (
      value &&
      typeof value.campaignId === 'string' &&
      typeof value.publicKey === 'string' &&
      /^[A-Za-z0-9_-]{87}$/.test(value.publicKey)
    )
      return {
        campaignId: value.campaignId,
        publicKey: value.publicKey,
        code: normalizeRoomCode(value.code),
      };
  } catch {
    /* A malformed optional address must not block opening a campaign. */
  }
}
export function loadRoomByCode(code: string): SavedRoom | undefined {
  try {
    const value = JSON.parse(
      localStorage.getItem(`fate.client-room-code.v1.${normalizeRoomCode(code)}`) || 'null',
    );
    return value &&
      value.code === code &&
      typeof value.publicKey === 'string' &&
      typeof value.campaignId === 'string'
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
export function saveRoom(room: SavedRoom): void {
  localStorage.setItem(`fate.client-room-code.v1.${room.code}`, JSON.stringify(room));
  localStorage.setItem(clientKey(room.campaignId), JSON.stringify(room));
  localStorage.setItem(clientKey('last'), JSON.stringify(room));
}
function base64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function unbase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
export interface HostRoom {
  code: string;
  publicKey: string;
  privateKey: JsonWebKey;
}
export async function hostRoom(campaignId: string): Promise<HostRoom> {
  const saved = localStorage.getItem(hostKey(campaignId));
  if (saved) {
    const value = JSON.parse(saved) as HostRoom;
    normalizeRoomCode(value.code);
    // Fail explicitly on damaged identity; silently replacing it would break trust on every player.
    await crypto.subtle.importKey('jwk', value.privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
    ]);
    return value;
  }
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const room = {
    code: newRoomCode(),
    publicKey: base64(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
  localStorage.setItem(hostKey(campaignId), JSON.stringify(room));
  return room;
}
export function rotateRoom(campaignId: string, room: HostRoom): HostRoom {
  const next = { ...room, code: newRoomCode() };
  localStorage.setItem(hostKey(campaignId), JSON.stringify(next));
  return next;
}
// Bind the identity proof to this connection, preventing a different endpoint from
// forwarding a real host's challenge response to steal a saved device credential.
function proofText(code: string, campaignId: string, nonce: string, sdp: string): Uint8Array {
  const fingerprints = [
    ...new Set(sdp.split(/\r?\n/).filter((line) => line.startsWith('a=fingerprint:'))),
  ].sort();
  if (!fingerprints.length) throw new Error('The connection has no host fingerprint.');
  return new TextEncoder().encode(JSON.stringify([code, campaignId, nonce, fingerprints]));
}
export async function signHost(
  room: HostRoom,
  campaignId: string,
  nonce: string,
  sdp: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'jwk',
    room.privateKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return base64(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      proofText(room.code, campaignId, nonce, sdp),
    ),
  );
}
export async function verifyHost(
  room: SavedRoom,
  nonce: string,
  sdp: string,
  signature: string,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{87}$/.test(room.publicKey) || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    unbase64(room.publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    unbase64(signature),
    proofText(room.code, room.campaignId, nonce, sdp),
  );
}
export async function createRoomPeer(id: string | undefined, config: RTCConfiguration): Promise<Peer> {
  // PeerJS probes WebRTC support at import time. Defer that work until a user connects.
  const { default: Peer } = await import('peerjs');
  // Override only for a deliberately configured deployment/test broker. Cloud is the default.
  const endpoint = import.meta.env.VITE_PEERJS_SERVER;
  const options: PeerOptions = { config, debug: 0 };
  if (endpoint) {
    const url = new URL(endpoint);
    Object.assign(options, {
      host: url.hostname,
      port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
      secure: url.protocol === 'https:',
      path: url.pathname,
    });
  }
  return id ? new Peer(id, options) : new Peer(options);
}
