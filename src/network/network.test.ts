import { describe, expect, it, vi } from 'vitest';
import { createAspect, createCampaign, createCharacter } from '../domain/defaults';
import type { Campaign, GameEvent, Asset } from '../domain/types';
import { projectCampaign } from './projection';
import { compareDraft, makeDraft } from './drafts';
import { GrantStore, type KeyValueStore } from './credentials';
import { DataTransport, decodeDescription, encodeDescription, validCommand } from './protocol';
import { assertReferences, campaignSchema } from '../storage/schema';
import { FatePeerClient, FatePeerHost } from './peer';
import { bytesToDataUrl } from '../storage/assets';

function fixture(): Campaign {
  const c = createCampaign('Shared table');
  const hero = createCharacter(c.rules, 'Hero');
  hero.id = 'hero';
  hero.aspects = [createAspect('highConcept', 'Brave explorer')];
  const npc = createCharacter(c.rules, 'SECRET NPC', 'main');
  npc.id = 'secret-npc';
  npc.notes = 'SECRET NOTES';
  npc.aspects[0].id = 'secret-character-aspect';
  npc.aspects[0].name = 'SECRET CHARACTER ASPECT';
  npc.aspects[0].visibility = 'shared';
  hero.phases[0].characterIds = [npc.id];
  c.characters = [hero, npc];
  c.members.push({ id: 'player', name: 'Player', role: 'player', characterIds: ['hero', npc.id] });
  const asset = (id: string, visibility: Asset['visibility']): Asset => ({
    id,
    name: id,
    mime: 'image/png',
    hash: '0'.repeat(64),
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    visibility,
  });
  c.assets = [
    asset('visible-map', 'shared'),
    asset('private-map', 'gm'),
    asset('unused-asset', 'shared'),
    asset('portrait', 'gm'),
  ];
  hero.portraitAssetId = 'portrait';
  const hidden = createAspect('game', 'SECRET ASPECT');
  hidden.visibility = 'gm';
  hidden.id = 'secret-aspect';
  c.issues.push(hidden);
  c.play.aspects.push({
    ...createAspect('situation', 'Known aspect'),
    ownerId: npc.id,
    freeInvokeOwnerId: npc.id,
  });
  c.play.actedIds = ['hero', npc.id];
  c.play.pendingAwards = [
    { id: 'award', characterId: 'hero', amount: 1, boundary: 'scene', reason: 'SECRET INVOCATION' },
  ];
  c.play.npcFatePoints = 4;
  c.play.npcCarryover = 2;
  c.play.contest.scores = { hero: 1, [npc.id]: 2 };
  c.world = [
    {
      id: 'secret-note',
      kind: 'note',
      title: 'SECRET NOTE',
      body: 'SECRET BODY',
      visibility: 'gm',
      tags: [],
    },
    {
      id: 'public-note',
      kind: 'note',
      title: 'Known place',
      body: 'Public description',
      visibility: 'shared',
      tags: [],
      assetId: 'portrait',
    },
  ];
  c.inventory = [
    {
      id: 'secret-item',
      revision: 0,
      name: 'SECRET ITEM',
      quantity: 1,
      unit: 'item',
      ownerId: 'party',
      description: '',
      visibility: 'gm',
    },
  ];
  c.maps = [
    {
      id: 'map',
      name: 'Known map',
      visibility: 'shared',
      currentRevisionId: 'secret-version',
      sharedRevisionId: 'public-version',
      revisions: [
        {
          id: 'public-version',
          assetId: 'visible-map',
          createdAt: '',
          zones: [],
          tokens: [
            { id: 'known', label: 'Hero', characterId: 'hero', x: 0.1, y: 0.2, visibility: 'shared' },
            {
              id: 'hidden',
              label: 'SECRET TOKEN',
              characterId: npc.id,
              x: 0.4,
              y: 0.4,
              visibility: 'shared',
            },
          ],
          annotations: [{ id: 'annotation', text: 'SECRET ANNOTATION', x: 0.1, y: 0.2, visibility: 'gm' }],
        },
        {
          id: 'secret-version',
          assetId: 'private-map',
          createdAt: '',
          zones: [],
          tokens: [],
          annotations: [],
        },
      ],
    },
  ];
  const event = (id: string, visibility: GameEvent['visibility'], characterId?: string): GameEvent => ({
    id,
    commandId: id,
    sequence: 7,
    timestamp: '',
    actorId: 'gm',
    type: 'test',
    summary: visibility === 'gm' ? 'SECRET EVENT' : 'Public action',
    visibility,
    characterId,
    detail: 'PRIVATE DIAGNOSTIC',
  });
  c.events = [
    event('private', 'gm'),
    event('public', 'shared', 'hero'),
    event('hidden-character', 'shared', npc.id),
  ];
  c.processedCommandIds = ['PRIVATE COMMAND ID'];
  return c;
}

describe('participant projection', () => {
  it('removes hidden entities, nested references, assets, map versions, and historical events', () => {
    const original = fixture();
    const projected = projectCampaign(original);
    const text = JSON.stringify(projected);
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('PRIVATE');
    expect(text).not.toContain('secret-npc');
    expect(projected.characters).toHaveLength(1);
    expect(projected.characters[0].portraitAssetId).toBeUndefined();
    expect(projected.characters[0].phases[0].characterIds).toEqual([]);
    expect(projected.members[1].characterIds).toEqual(['hero']);
    expect(projected.maps[0].currentRevisionId).toBe('public-version');
    expect(projected.maps[0].revisions).toHaveLength(1);
    expect(projected.maps[0].revisions[0].tokens).toHaveLength(1);
    expect(projected.assets.map((a) => a.id)).toEqual(['visible-map']);
    expect(projected.events.map((e) => e.sequence)).toEqual([1]);
    expect(projected.processedCommandIds).toEqual([]);
    expect(() => assertReferences(projected)).not.toThrow();
    expect(() => campaignSchema.parse(projected)).not.toThrow();
    expect(original.characters).toHaveLength(2);
    expect(original.maps[0].revisions).toHaveLength(2);
  });
  it('does not grant access to a hidden character just because a player claims ownership', () => {
    const projected = projectCampaign(fixture(), {
      id: 'player',
      role: 'player',
      characterIds: ['secret-npc'],
    });
    expect(projected.characters.find((c) => c.id === 'secret-npc')).toBeUndefined();
  });
  it('returns an independent complete copy to a trusted GM', () => {
    const original = fixture();
    const projected = projectCampaign(original, { id: 'gm', role: 'gm', characterIds: [] });
    expect(projected).toEqual(original);
    projected.characters[0].name = 'Changed';
    expect(original.characters[0].name).toBe('Hero');
  });
  it('drops a roll that references a now-hidden aspect or target', () => {
    const c = fixture();
    const base = {
      id: 'roll',
      characterId: 'hero',
      characterName: 'Hero',
      action: 'overcome' as const,
      skillId: 'lore',
      skillName: 'Lore',
      dice: [0, 0, 0, 0],
      skill: 1,
      modifier: 0,
      opposition: 1,
      total: 1,
      shifts: 0,
      outcome: 'tie' as const,
      explanation: '',
      advantageExisting: false,
      finalized: false,
    };
    c.events[1].roll = {
      ...base,
      invocations: [{ aspectId: 'secret-aspect', name: 'SECRET ASPECT', free: false, bonus: 2 }],
    };
    expect(projectCampaign(c).events).toHaveLength(0);
    c.events[1].roll = {
      ...base,
      invocations: [
        { aspectId: 'secret-character-aspect', name: 'SECRET CHARACTER ASPECT', free: false, bonus: 2 },
      ],
    };
    expect(projectCampaign(c).events).toHaveLength(0);
    c.events[1].roll = { ...base, invocations: [], targetCharacterId: 'secret-npc' };
    expect(projectCampaign(c).events).toHaveLength(0);
  });
});

describe('device authority', () => {
  it('issues unique credentials, derives only player authority, persists, and revokes', () => {
    const data = new Map<string, string>();
    const memory: KeyValueStore = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    };
    const grants = new GrantStore('campaign', memory);
    const grant = grants.create('Player', ['hero', 'hero']);
    expect(grant.token).toHaveLength(64);
    expect(grants.authenticate('player')).toBeUndefined();
    expect(grants.actor(grant)).toEqual({ id: grant.memberId, role: 'player', characterIds: ['hero'] });
    const reopened = new GrantStore('campaign', memory);
    expect(reopened.authenticate(grant.token)?.memberId).toBe(grant.memberId);
    reopened.revoke(grant.memberId);
    expect(grants.authenticate(grant.token)).toBeUndefined();
    expect(new GrantStore('other-campaign', memory).authenticate(grant.token)).toBeUndefined();
  });
});

describe('offline character drafts', () => {
  it('preserves the base revision and identifies stale conflicting fields without overwriting', () => {
    const c = createCharacter();
    c.revision = 4;
    c.description = 'Original';
    const draft = makeDraft('campaign', c);
    draft.proposed.description = 'Player edit';
    const current = structuredClone(c);
    current.revision = 5;
    current.description = 'GM edit';
    expect(compareDraft(draft, current)).toEqual({
      stale: true,
      changedFields: ['description'],
      conflictingFields: ['description'],
    });
    expect(c.description).toBe('Original');
    expect(current.description).toBe('GM edit');
  });
});

class FakeChannel extends EventTarget {
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  readyState = 'open';
  sent: string[] = [];
  send(value: string) {
    this.sent.push(value);
  }
  deliver(data: string) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
  close() {
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
  }
}
describe('bounded peer protocol', () => {
  it('chunks and reconstructs large messages, ignoring duplicate frames', async () => {
    const outgoing = new FakeChannel();
    const incoming = new FakeChannel();
    const values: unknown[] = [];
    const errors: string[] = [];
    const sender = new DataTransport(
      outgoing as unknown as RTCDataChannel,
      () => {},
      (message) => errors.push(message),
    );
    new DataTransport(
      incoming as unknown as RTCDataChannel,
      (value) => values.push(value),
      (message) => errors.push(message),
    );
    const value = { type: 'snapshot', body: 'long campaign text '.repeat(10_000) };
    await sender.send(value);
    expect(outgoing.sent.length).toBeGreaterThan(10);
    expect(outgoing.sent.every((frame) => frame.length < 16_000)).toBe(true);
    const frames = [...outgoing.sent].reverse();
    incoming.deliver(frames[0]);
    incoming.deliver(frames[0]);
    for (const frame of frames.slice(1)) incoming.deliver(frame);
    expect(values).toEqual([value]);
    expect(errors).toEqual([]);
  });
  it('rejects malformed and oversized chunk headers', () => {
    const incoming = new FakeChannel();
    const errors: string[] = [];
    new DataTransport(
      incoming as unknown as RTCDataChannel,
      () => {
        throw new Error('must not receive');
      },
      (message) => errors.push(message),
    );
    incoming.deliver(JSON.stringify({ id: 'bad', index: 0, total: 1_000_000_000, data: '' }));
    incoming.deliver(JSON.stringify({ id: 'bad', index: -1, total: 1, data: '' }));
    expect(errors).toHaveLength(2);
  });
  it('requires valid connection descriptions and stable command identifiers', () => {
    const offer = encodeDescription({
      version: 1,
      campaignId: 'campaign',
      peerId: 'peer',
      description: { type: 'offer', sdp: 'sdp' },
    });
    expect(decodeDescription(offer, 'offer').peerId).toBe('peer');
    expect(() => decodeDescription(offer, 'answer')).toThrow();
    expect(() => decodeDescription('{}', 'offer')).toThrow();
    expect(validCommand({ id: '', type: 'roll' })).toBe(false);
    expect(validCommand({ id: 'stable', type: 'roll', role: 'gm' })).toBe(true); // Shape does not grant authority; GrantStore supplies the actor.
  });
});

describe('connection lifecycle', () => {
  it('marks a peer disconnected when its control channel closes before ICE changes state', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const connections: FakePeerConnection[] = [];
    class FakePeerConnection {
      connectionState = 'connected';
      iceGatheringState = 'complete';
      localDescription?: RTCSessionDescriptionInit;
      onconnectionstatechange?: () => void;
      control = new FakeChannel();
      assets = new FakeChannel();
      close = vi.fn(); // Deliberately leaves ICE connected to reproduce the delayed-state report.
      constructor() {
        connections.push(this);
      }
      createDataChannel(label: string) {
        return label === 'fate-control' ? this.control : this.assets;
      }
      async createOffer() {
        return { type: 'offer' as const, sdp: 'test-description' };
      }
      async setLocalDescription(value: RTCSessionDescriptionInit) {
        this.localDescription = value;
      }
      async getStats() {
        return new Map();
      }
    }
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    let host: FatePeerHost | undefined;
    try {
      const campaign = createCampaign();
      host = new FatePeerHost({ getCampaign: () => campaign, onCommand: async () => campaign });
      const invitation = await host.createOffer();
      const internal = host as unknown as { grants: GrantStore; peers: Map<string, { grant?: unknown }> };
      internal.peers.get(invitation.peerId)!.grant = internal.grants.create('Player', []);
      const connection = connections[0];
      connection.onconnectionstatechange?.();
      expect(host.peerList[0].status).toBe('connected');
      connection.control.close();
      expect(host.peerList[0].status).toBe('disconnected');
      expect(connection.close).toHaveBeenCalled();
      connection.onconnectionstatechange?.();
      expect(host.peerList[0].status).toBe('disconnected');
    } finally {
      host?.close();
      vi.unstubAllGlobals();
    }
  });
  it('does not republish a campaign when image verification finishes after disconnect', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
    const asset: Asset = {
      id: 'image',
      name: 'Image',
      mime: 'image/png',
      dataUrl: bytesToDataUrl(bytes, 'image/png'),
      hash,
      visibility: 'shared',
    };
    const campaign = createCampaign();
    campaign.assets = [asset];
    const onCampaign = vi.fn();
    const client = new FatePeerClient({ name: 'Player', onCampaign });
    const internal = client as unknown as {
      approved: boolean;
      pendingCampaign?: Campaign;
      receiveAsset(value: unknown): Promise<void>;
    };
    internal.approved = true;
    internal.pendingCampaign = campaign;
    let finish!: (value: ArrayBuffer) => void;
    const spy = vi.spyOn(crypto.subtle, 'digest').mockReturnValue(
      new Promise<ArrayBuffer>((resolve) => {
        finish = resolve;
      }),
    );
    try {
      const verification = internal.receiveAsset({ type: 'asset', asset });
      client.close();
      finish(digest);
      await verification;
      expect(onCampaign).not.toHaveBeenCalled();
      expect(internal.pendingCampaign).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
  it('drops a queued player command after the host closes', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    try {
      const campaign = createCampaign();
      const hero = createCharacter(campaign.rules);
      campaign.characters = [hero];
      const onCommand = vi.fn().mockResolvedValue(campaign);
      const host = new FatePeerHost({ getCampaign: () => campaign, onCommand });
      const internal = host as unknown as {
        grants: GrantStore;
        peers: Map<string, unknown>;
        receive(peerId: string, value: unknown): Promise<void>;
      };
      const grant = internal.grants.create('Player', [hero.id]);
      hero.ownerId = grant.memberId;
      campaign.members.push({
        id: grant.memberId,
        name: grant.name,
        role: 'player',
        characterIds: [hero.id],
      });
      const channel = { readyState: 'open' };
      internal.peers.set('peer', {
        pc: {
          close: () => {
            channel.readyState = 'closed';
          },
        },
        info: {
          peerId: 'peer',
          name: 'Player',
          status: 'connected',
          route: 'direct',
          characterIds: [hero.id],
        },
        control: { channel, send: vi.fn().mockResolvedValue(undefined) },
        grant,
        receivedAt: [],
        snapshotQueue: Promise.resolve(),
        assetQueue: Promise.resolve(),
        sentAssets: new Set(),
      });
      const pending = internal.receive('peer', {
        type: 'command',
        command: {
          id: 'queued-roll',
          type: 'roll',
          characterId: hero.id,
          action: 'overcome',
          skillId: 'lore',
          opposition: 1,
        },
      });
      host.close();
      await pending;
      expect(onCommand).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
