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
  actor(grant: DeviceGrant): Actor {
    return { id: grant.memberId, role: 'player', characterIds: [...grant.characterIds] };
  }
}
export function loadReconnect(campaignId: string): ReconnectCredential | undefined {
  try {
    return JSON.parse(localStorage.getItem(`fate.client-grant.v1.${campaignId}`) || 'null') || undefined;
  } catch {
    return undefined;
  }
}
export function saveReconnect(campaignId: string, credential: ReconnectCredential): void {
  localStorage.setItem(`fate.client-grant.v1.${campaignId}`, JSON.stringify(credential));
}
/** An explicit campaign restore starts a new pairing boundary, even on the same browser. */
export function clearHostGrants(campaignId: string): void {
  localStorage.removeItem(key(campaignId));
}
