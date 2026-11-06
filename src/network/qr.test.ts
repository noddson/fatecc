import { describe, expect, it } from 'vitest';
import { deflateSync } from 'fflate';
import QRCode from 'qrcode';
import {
  connectionQrImage,
  decodeConnectionInput,
  decodeQrPixels,
  encodeConnectionQr,
  MAX_CONNECTION_TEXT_BYTES,
  MAX_QR_TEXT_LENGTH,
  type ConnectionKind,
} from './qr';

function message(type: ConnectionKind = 'offer', sdp?: string) {
  return {
    version: 1,
    campaignId: 'campaign-123',
    peerId: 'peer-456',
    description: {
      type,
      sdp:
        sdp ??
        'v=0\r\no=- 123 1 IN IP4 127.0.0.1\r\ns=海岸 — Côte\r\na=ice-ufrag:ABC\r\na=ice-pwd:1234567890abcdef123456\r\na=candidate:1 1 UDP 2122260223 192.168.1.2 43210 typ host\r\n',
    },
  };
}

function packed(text: string): string {
  return `FATE1:${Buffer.from(deflateSync(new TextEncoder().encode(text))).toString('base64url')}`;
}

function noisyText(length: number): string {
  let state = 12345;
  return Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return String.fromCharCode(33 + (state % 90));
  }).join('');
}

describe('portable QR connection descriptions', () => {
  it.each(['offer', 'answer'] as const)('round-trips a compressed %s, including Unicode', (type) => {
    const original = message(type);
    const encoded = encodeConnectionQr(JSON.stringify(original), type);
    expect(encoded).toMatch(/^FATE1:[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThan(MAX_QR_TEXT_LENGTH);
    const decoded = decodeConnectionInput(encoded, type);
    expect(decoded.envelope).toEqual(original);
    expect(JSON.parse(decoded.text)).toEqual(original);
  });

  it('accepts legacy pasted JSON and strips fields that are not connection data', () => {
    const original = message();
    const untrusted = {
      ...original,
      token: 'do-not-forward',
      role: 'gm',
      description: { ...original.description, additionalSecret: 'do-not-forward' },
    };
    const result = decodeConnectionInput(`\n${JSON.stringify(untrusted)}\n`, 'offer');
    expect(result.envelope).toEqual(original);
    expect(result.text).not.toContain('do-not-forward');
    expect(decodeConnectionInput(encodeConnectionQr(result.text, 'offer'), 'offer').envelope).toEqual(
      original,
    );
  });

  it.each(['offer', 'answer'] as const)('rejects the wrong direction for a %s', (type) => {
    const opposite = type === 'offer' ? 'answer' : 'offer';
    expect(() =>
      decodeConnectionInput(encodeConnectionQr(JSON.stringify(message(type)), type), opposite),
    ).toThrow(/This is an (invitation|response)|This is a response/);
  });

  it.each([
    '',
    'https://example.com/not-an-invitation',
    '{broken',
    '[]',
    'null',
    'FATE1:',
    'FATE1:@@@',
    'FATE1:A',
    'FATE1:AAAA',
    'FATE1:AB',
    'FATE2:AAAA',
  ])('rejects malformed or unsupported input %j', (input) => {
    expect(() => decodeConnectionInput(input, 'offer')).toThrow();
  });

  it.each([
    { ...message(), version: 2 },
    { ...message(), campaignId: '' },
    { ...message(), campaignId: ' '.repeat(3) },
    { ...message(), campaignId: 'a'.repeat(129) },
    { ...message(), peerId: 'b'.repeat(129) },
    { ...message(), peerId: 42 },
    { ...message(), description: { type: 'rollback', sdp: 'v=0' } },
    { ...message(), description: { type: 'offer', sdp: '' } },
    { ...message(), description: { type: 'offer', sdp: ' \r\n' } },
    { ...message(), description: { type: 'offer', sdp: 'v=0\0' } },
  ])('rejects invalid envelope %#', (value) => {
    expect(() => decodeConnectionInput(JSON.stringify(value), 'offer')).toThrow();
  });

  it('rejects excessive SDP and raw inputs by byte size, including multibyte text', () => {
    expect(() =>
      decodeConnectionInput(JSON.stringify(message('offer', 'x'.repeat(240_001))), 'offer'),
    ).toThrow();
    expect(() => decodeConnectionInput(' '.repeat(MAX_CONNECTION_TEXT_BYTES + 1), 'offer')).toThrow(
      /too large/,
    );
    const unicode = JSON.stringify(message('offer', '海'.repeat(90_000)));
    expect(unicode.length).toBeLessThan(MAX_CONNECTION_TEXT_BYTES);
    expect(() => decodeConnectionInput(unicode, 'offer')).toThrow(/too large/);
  });

  it('rejects oversized compressed input before decompression', () => {
    expect(() => decodeConnectionInput(`FATE1:${'A'.repeat(MAX_QR_TEXT_LENGTH)}`, 'offer')).toThrow(
      /too large/,
    );
  });

  it('rejects a tiny compressed payload that expands past the allocation limit', () => {
    const bomb = packed(JSON.stringify(message('offer', 'x'.repeat(MAX_CONNECTION_TEXT_BYTES * 2))));
    expect(bomb.length).toBeLessThan(MAX_QR_TEXT_LENGTH);
    expect(() => decodeConnectionInput(bomb, 'offer')).toThrow(/damaged or too large/);
  });

  it('rejects invalid UTF-8 in compressed content', () => {
    const invalidUtf8 = `FATE1:${Buffer.from(deflateSync(new Uint8Array([0xff, 0xfe]))).toString('base64url')}`;
    expect(() => decodeConnectionInput(invalidUtf8, 'offer')).toThrow(/damaged or too large/);
  });

  it('leaves copy/paste usable when a valid description is too large for one QR', () => {
    const original = JSON.stringify(message('offer', noisyText(6000)));
    expect(decodeConnectionInput(original, 'offer').envelope.description.sdp).toHaveLength(6000);
    expect(() => encodeConnectionQr(original, 'offer')).toThrow(/too large for one QR code.*copy\/paste/);
  });

  it('generates a downloadable PNG locally', async () => {
    expect(await connectionQrImage(JSON.stringify(message()), 'offer')).toMatch(/^data:image\/png;base64,/);
  });

  it.each(['offer', 'answer'] as const)('reads real QR pixels for a %s', (type) => {
    const original = message(type);
    const encoded = encodeConnectionQr(JSON.stringify(original), type);
    const qr = QRCode.create(encoded, { errorCorrectionLevel: 'M' });
    const scale = 5;
    const margin = 4;
    const width = (qr.modules.size + margin * 2) * scale;
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let y = 0; y < qr.modules.size; y++)
      for (let x = 0; x < qr.modules.size; x++)
        if (qr.modules.get(y, x))
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) {
              const offset = (((y + margin) * scale + dy) * width + (x + margin) * scale + dx) * 4;
              pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
            }
    const scanned = decodeQrPixels(pixels, width, width);
    expect(scanned).toBe(encoded);
    expect(decodeConnectionInput(scanned!, type).envelope).toEqual(original);
  });

  it('returns no code for a blank image and rejects inconsistent pixel buffers', () => {
    expect(decodeQrPixels(new Uint8ClampedArray(40 * 40 * 4).fill(255), 40, 40)).toBeNull();
    expect(() => decodeQrPixels(new Uint8ClampedArray(4), 40, 40)).toThrow(/dimensions/);
    expect(() => decodeQrPixels(new Uint8ClampedArray(4), -1, -1)).toThrow(/dimensions/);
    expect(() => decodeQrPixels(new Uint8ClampedArray(4), 4000, 4000)).toThrow(/dimensions/);
  });
});
