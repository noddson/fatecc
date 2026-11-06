import { deflateSync, inflateSync } from 'fflate';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { isRecord, type SignalingEnvelope } from './protocol';

export type ConnectionKind = 'offer' | 'answer';

/** Stay below maximum QR capacity so ordinary camera scans remain practical. */
export const MAX_QR_TEXT_LENGTH = 1800;
export const MAX_CONNECTION_TEXT_BYTES = 256_000;
const PREFIX = 'FATE1:';
const MAX_ID_LENGTH = 128;
const MAX_SDP_LENGTH = 240_000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function invalidMessage(): Error {
  return new Error('Use a Fate invitation or response QR code, or paste its connection text.');
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw invalidMessage();
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  // Reject noncanonical padding bits, which can otherwise disguise malformed payloads.
  if (encodeBase64Url(bytes) !== value) throw invalidMessage();
  return bytes;
}

function normalize(text: string, expectedType: ConnectionKind): SignalingEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalidMessage();
  }
  const validId = (id: unknown): id is string =>
    typeof id === 'string' && id.trim().length > 0 && id.length <= MAX_ID_LENGTH;
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !validId(value.campaignId) ||
    !validId(value.peerId) ||
    !isRecord(value.description) ||
    !['offer', 'answer'].includes(String(value.description.type)) ||
    typeof value.description.sdp !== 'string' ||
    !value.description.sdp.trim() ||
    value.description.sdp.length > MAX_SDP_LENGTH ||
    value.description.sdp.includes('\0')
  )
    throw invalidMessage();
  if (value.description.type !== expectedType)
    throw new Error(
      expectedType === 'offer'
        ? 'This is a response. Scan the GM’s invitation QR code here.'
        : 'This is an invitation. Scan the player’s response QR code here.',
    );
  return {
    version: 1,
    campaignId: value.campaignId,
    peerId: value.peerId,
    description: { type: expectedType, sdp: value.description.sdp },
  };
}

/** Accept both new compressed QR payloads and existing copy/paste invitations. */
export function decodeConnectionInput(
  input: string,
  expectedType: ConnectionKind,
): { text: string; envelope: SignalingEnvelope } {
  if (typeof input !== 'string') throw invalidMessage();
  if (
    input.length > MAX_CONNECTION_TEXT_BYTES ||
    textEncoder.encode(input).length > MAX_CONNECTION_TEXT_BYTES
  )
    throw new Error('The connection message is too large. Ask for a fresh invitation or response.');
  let text = input.trim();
  if (text.startsWith(PREFIX)) {
    if (text.length > MAX_QR_TEXT_LENGTH)
      throw new Error('This QR connection message is too large. Use copy/paste instead.');
    try {
      const compressed = decodeBase64Url(text.slice(PREFIX.length));
      // fflate truncates when a caller supplies an output buffer. The extra byte
      // detects every oversized result while keeping allocation bounded.
      const decoded = inflateSync(compressed, { out: new Uint8Array(MAX_CONNECTION_TEXT_BYTES + 1) });
      if (decoded.length > MAX_CONNECTION_TEXT_BYTES)
        throw new Error('The expanded connection message is too large.');
      text = textDecoder.decode(decoded);
    } catch {
      throw new Error(
        'This QR connection message is damaged or too large. Use a fresh QR code or copy/paste.',
      );
    }
  } else if (/^FATE[^:]*:/.test(text)) {
    throw new Error('This Fate QR format is unsupported. Use a current invitation or copy/paste.');
  }
  const envelope = normalize(text, expectedType);
  const normalized = JSON.stringify(envelope);
  if (textEncoder.encode(normalized).length > MAX_CONNECTION_TEXT_BYTES)
    throw new Error('The connection message is too large. Ask for a fresh invitation or response.');
  return { text: normalized, envelope };
}

export function encodeConnectionQr(text: string, expectedType: ConnectionKind): string {
  const normalized = decodeConnectionInput(text, expectedType).text;
  const result = PREFIX + encodeBase64Url(deflateSync(textEncoder.encode(normalized), { level: 9 }));
  if (result.length > MAX_QR_TEXT_LENGTH)
    throw new Error('This connection message is too large for one QR code. Use copy/paste instead.');
  return result;
}

/** Generate locally; no third-party QR service receives connection information. */
export async function connectionQrImage(text: string, expectedType: ConnectionKind): Promise<string> {
  return QRCode.toDataURL(encodeConnectionQr(text, expectedType), {
    type: 'image/png',
    errorCorrectionLevel: 'M',
    margin: 4,
    scale: 6,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

/** Shared image/camera decoder; callers control capture and image resizing. */
export function decodeQrPixels(data: Uint8ClampedArray, width: number, height: number): string | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > 4_000_000 ||
    data.length !== width * height * 4
  )
    throw new Error('The QR image dimensions are invalid or too large.');
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}
