export interface ConnectionSettings {
  stunMode: 'none' | 'cloudflare' | 'google' | 'custom';
  customStun: string;
  turnMode: 'none' | 'cloudflare' | 'custom';
  customTurn: string;
  turnUsername: string;
  turnCredential: string;
  relayOnly: boolean;
}

export const CLOUDFLARE_STUN_URL = 'stun:stun.cloudflare.com:3478';
export const GOOGLE_STUN_URL = 'stun:stun.l.google.com:19302';
export const CLOUDFLARE_TURN_URL = 'turns:turn.cloudflare.com:443?transport=tcp';

// Deliberately memory-only: do not include these settings in campaign records or backups.
export const DEFAULT_CONNECTION_SETTINGS: Readonly<ConnectionSettings> = Object.freeze({
  stunMode: import.meta.env.VITE_ENABLE_MANUAL_PAIRING === 'true' ? 'none' : 'google',
  customStun: '',
  turnMode: 'none',
  customTurn: '',
  turnUsername: '',
  turnCredential: '',
  relayOnly: false,
});

function serverUrl(value: string, service: 'STUN' | 'TURN'): string {
  const url = value.trim();
  const schemes = service === 'STUN' ? 'stuns?' : 'turns?';
  const match = new RegExp(
    `^(${schemes}):(\\[[0-9a-f:.]+\\]|[a-z0-9.-]+)(?::([0-9]+))?(\\?transport=(udp|tcp))?$`,
    'i',
  ).exec(url);
  const invalid = () =>
    new Error(
      `Enter a valid ${service} ${service === 'STUN' ? 'server' : 'relay'} URL, such as ${
        service === 'STUN' ? 'stun:your-server.example:3478' : 'turn:your-server.example:3478'
      }.`,
    );
  if (!match || (service === 'STUN' && match[4])) throw invalid();
  const hostname = match[2];
  if (
    !hostname.startsWith('[') &&
    !hostname
      .replace(/\.$/, '')
      .split('.')
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  )
    throw invalid();
  if (match[3] && (+match[3] < 1 || +match[3] > 65535)) throw invalid();
  try {
    // The URL parser checks numeric IP literals (including IPv6); it cannot parse ICE URIs directly.
    new URL(`http://${hostname}`);
  } catch {
    throw invalid();
  }
  return url;
}

export function buildIceConfiguration(settings: ConnectionSettings): {
  iceServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
} {
  const iceServers: RTCIceServer[] = [];
  switch (settings.stunMode) {
    case 'none':
      break;
    case 'cloudflare':
      iceServers.push({ urls: CLOUDFLARE_STUN_URL });
      break;
    case 'google':
      iceServers.push({ urls: GOOGLE_STUN_URL });
      break;
    case 'custom':
      iceServers.push({ urls: serverUrl(settings.customStun, 'STUN') });
      break;
    default:
      throw new Error('Choose a supported STUN service.');
  }
  switch (settings.turnMode) {
    case 'none':
      break;
    case 'cloudflare':
    case 'custom': {
      const urls =
        settings.turnMode === 'cloudflare' ? CLOUDFLARE_TURN_URL : serverUrl(settings.customTurn, 'TURN');
      if (!settings.turnUsername.trim() || !settings.turnCredential.trim()) {
        throw new Error('Enter the TURN username and TURN credential issued by your relay provider.');
      }
      iceServers.push({
        urls,
        username: settings.turnUsername.trim(),
        credential: settings.turnCredential,
      });
      break;
    }
    default:
      throw new Error('Choose a supported TURN service.');
  }
  if (settings.relayOnly && settings.turnMode === 'none') {
    throw new Error('A TURN relay is required for relay-only mode.');
  }
  return { iceServers, iceTransportPolicy: settings.relayOnly ? 'relay' : 'all' };
}
