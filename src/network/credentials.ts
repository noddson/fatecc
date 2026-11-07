import type { Actor } from '../domain/types';

export interface DeviceGrant {
  memberId: string;
  name: string;
  token: string;
  characterIds: string[];
  revoked: boolean;
  createdAt: string;
}
export interface ReconnectCredential {
  token: string;
  memberId: string;
}
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const key = (campaignId: string) => `fate.host-grants.v1.${campaignId}`;
export function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, '0')).join(
    '',
  );
}
export class GrantStore {
  constructor(
    private campaignId: string,
    private storage: KeyValueStore = localStorage,
  ) {}
  list(): DeviceGrant[] {
    try {
      const value: unknown = JSON.parse(this.storage.getItem(key(this.campaignId)) || '[]');
      return Array.isArray(value) ? (value as DeviceGrant[]) : [];
    } catch {
      return [];
    }
  }
  private write(grants: DeviceGrant[]): void {
    this.storage.setItem(key(this.campaignId), JSON.stringify(grants));
  }
  create(name: string, characterIds: string[]): DeviceGrant {
    const grant: DeviceGrant = {
      memberId: crypto.randomUUID(),
      name,
      token: randomSecret(),
      characterIds: [...new Set(characterIds)],
      revoked: false,
      createdAt: new Date().toISOString(),
    };
    this.write([...this.list(), grant]);
    return grant;
  }
  authenticate(token: unknown): DeviceGrant | undefined {
    if (typeof token !== 'string' || token.length !== 64) return undefined;
    return this.list().find((g) => !g.revoked && g.token === token);
  }
  revoke(memberId: string): void {
    this.write(this.list().map((g) => (g.memberId === memberId ? { ...g, revoked: true } : g)));
  }
  renew(memberId: string, name: string, characterIds: string[]): DeviceGrant {
    const grants = this.list();
    const existing = grants.find((grant) => grant.memberId === memberId && !grant.revoked);
    if (!existing) throw new Error('This approval was revoked. Create a new player invitation.');
    const renewed = { ...existing, name, characterIds: [...new Set(characterIds)], token: randomSecret() };
    this.write(grants.map((grant) => (grant.memberId === memberId ? renewed : grant)));
    return renewed;
  }
  actor(grant: DeviceGrant): Actor {
    return { id: grant.memberId, role: 'player', characterIds: [...grant.characterIds] };
  }
}
export function loadReconnect(campaignId: string): ReconnectCredential | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(`fate.client-grant.v1.${campaignId}`) || 'null');
    return value &&
      typeof value.token === 'string' &&
      /^[a-f0-9]{64}$/.test(value.token) &&
      typeof value.memberId === 'string'
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
export function loadPlayerName(): string {
  try {
    return localStorage.getItem('fate.player-name.v1') || 'Player';
  } catch {
    return 'Player';
  }
}
export function savePlayerName(name: string): void {
  try {
    localStorage.setItem('fate.player-name.v1', name.slice(0, 100));
  } catch {
    /* Optional preference. */
  }
}
export function clearReconnect(campaignId: string): void {
  localStorage.removeItem(`fate.client-grant.v1.${campaignId}`);
}
export function saveReconnect(campaignId: string, credential: ReconnectCredential): void {
  localStorage.setItem(`fate.client-grant.v1.${campaignId}`, JSON.stringify(credential));
}
/** An explicit campaign restore starts a new pairing boundary, even on the same browser. */
export function clearHostGrants(campaignId: string): void {
  localStorage.removeItem(key(campaignId));
}
