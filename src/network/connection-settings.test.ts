import { describe, expect, it } from 'vitest';
import {
  buildIceConfiguration,
  CLOUDFLARE_STUN_URL,
  CLOUDFLARE_TURN_URL,
  DEFAULT_CONNECTION_SETTINGS,
  GOOGLE_STUN_URL,
  type ConnectionSettings,
} from './connection-settings';

const config = (changes: Partial<ConnectionSettings> = {}) =>
  buildIceConfiguration({ ...DEFAULT_CONNECTION_SETTINGS, ...changes });

describe('connection settings', () => {
  it('uses no external service by default and ignores unselected saved fields', () => {
    expect(config()).toEqual({ iceServers: [], iceTransportPolicy: 'all' });
    expect(config({ customStun: 'invalid', customTurn: 'invalid', turnCredential: 'secret' })).toEqual(
      config(),
    );
  });

  it('selects Cloudflare STUN without requiring credentials', () => {
    expect(config({ stunMode: 'cloudflare' })).toEqual({
      iceServers: [{ urls: CLOUDFLARE_STUN_URL }],
      iceTransportPolicy: 'all',
    });
  });

  it('selects Google STUN on UDP port 19302 without credentials', () => {
    expect(config({ stunMode: 'google', customStun: 'unused-invalid-url' })).toEqual({
      iceServers: [{ urls: GOOGLE_STUN_URL }],
      iceTransportPolicy: 'all',
    });
    expect(GOOGLE_STUN_URL).toBe('stun:stun.l.google.com:19302');
  });

  it('combines Google STUN with an independently configured TURN relay', () => {
    expect(
      config({
        stunMode: 'google',
        turnMode: 'custom',
        customTurn: 'turn:relay.example:3478?transport=udp',
        turnUsername: 'user',
        turnCredential: 'password',
        relayOnly: true,
      }),
    ).toEqual({
      iceServers: [
        { urls: GOOGLE_STUN_URL },
        { urls: 'turn:relay.example:3478?transport=udp', username: 'user', credential: 'password' },
      ],
      iceTransportPolicy: 'relay',
    });
  });

  it('combines Cloudflare services and preserves issued credential bytes', () => {
    expect(
      config({
        stunMode: 'cloudflare',
        turnMode: 'cloudflare',
        turnUsername: ' issued-user ',
        turnCredential: ' issued-secret ',
        relayOnly: true,
      }),
    ).toEqual({
      iceServers: [
        { urls: CLOUDFLARE_STUN_URL },
        { urls: CLOUDFLARE_TURN_URL, username: 'issued-user', credential: ' issued-secret ' },
      ],
      iceTransportPolicy: 'relay',
    });
  });

  it.each([
    'stun:relay.example:3478',
    'stuns:relay.example:5349',
    'stun:192.168.1.10:3478',
    'stun:[2001:db8::1]:3478',
    'stun:localhost',
  ])('accepts a custom STUN endpoint %s', (url) => {
    expect(config({ stunMode: 'custom', customStun: ` ${url} ` }).iceServers).toEqual([{ urls: url }]);
  });

  it.each([
    'turn:relay.example:3478?transport=udp',
    'turns:relay.example:443?transport=tcp',
    'turn:[::1]:3478',
    'turn:192.168.1.10',
  ])('accepts a custom TURN endpoint %s', (url) => {
    expect(
      config({ turnMode: 'custom', customTurn: url, turnUsername: 'user', turnCredential: 'pass' })
        .iceServers,
    ).toEqual([{ urls: url, username: 'user', credential: 'pass' }]);
  });

  it.each([
    '',
    'https://relay.example',
    'turn:relay.example',
    'stun:',
    'stun://relay.example',
    'stun:relay.example:0',
    'stun:relay.example:65536',
    'stun:relay.example/path',
    'stun:relay.example?transport=udp',
    'stun:user:pass@relay.example',
    'stun:bad host',
    'stun:bad..example',
    'stun:999.1.1.1',
    'stun:[:::1]',
  ])('rejects invalid custom STUN endpoint %j', (url) => {
    expect(() => config({ stunMode: 'custom', customStun: url })).toThrow(/valid STUN/);
  });

  it.each(['', 'stun:relay.example', 'turn:relay.example?transport=quic', 'turns:relay.example#fragment'])(
    'rejects invalid custom TURN endpoint %j',
    (url) => {
      expect(() =>
        config({ turnMode: 'custom', customTurn: url, turnUsername: 'u', turnCredential: 'p' }),
      ).toThrow(/valid TURN/);
    },
  );

  it.each(['cloudflare', 'custom'] as const)('requires issued credentials for %s TURN', (turnMode) => {
    for (const [turnUsername, turnCredential] of [
      ['', ''],
      ['user', ' '],
      [' ', 'pass'],
    ]) {
      expect(() =>
        config({ turnMode, customTurn: 'turn:relay.example', turnUsername, turnCredential }),
      ).toThrow(/TURN username and TURN credential/);
    }
  });

  it('rejects relay-only configuration without a relay', () => {
    expect(() => config({ stunMode: 'cloudflare', relayOnly: true })).toThrow(/TURN relay is required/);
  });
});
