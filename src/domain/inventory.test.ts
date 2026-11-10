import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCampaign, createCharacter } from './defaults';
import { applyCommand } from './commands';
import { releaseCharacterInventory, removeInventoryItem, saveInventoryItem } from './inventory';
import type { Actor, Campaign, InventoryItem } from './types';
import { projectCampaign } from '../network/projection';
import { assertReferences, campaignSchema } from '../storage/schema';
import { cloneCampaign, exportCampaign, exportCampaignZip, parseCampaignExport } from '../storage/backup';
import { deleteCampaign, loadCampaign, saveCampaign } from '../storage/db';
import { FatePeerHost } from '../network/peer';
import { GrantStore } from '../network/credentials';

const gm: Actor = { id: 'gm', role: 'gm', characterIds: [] };
const alice: Actor = { id: 'alice', role: 'player', characterIds: ['mara'] };
const bob: Actor = { id: 'bob', role: 'player', characterIds: ['ivo'] };

function fixture() {
  const campaign = createCampaign('Personal possessions');
  const mara = createCharacter(campaign.rules, 'Mara');
  const ivo = createCharacter(campaign.rules, 'Ivo');
  const npc = createCharacter(campaign.rules, 'Hidden NPC', 'main');
  mara.id = 'mara';
  mara.ownerId = alice.id;
  ivo.id = 'ivo';
  ivo.ownerId = bob.id;
  npc.id = 'npc';
  campaign.characters = [mara, ivo, npc];
  campaign.members.push({ ...alice, name: 'Alice' }, { ...bob, name: 'Bob' });
  const item = (name: string, ownerId: string, visibility: InventoryItem['visibility']): InventoryItem => ({
    id: crypto.randomUUID(),
    revision: 0,
    name,
    description: `${name} details`,
    quantity: 1,
    unit: 'item',
    ownerId,
    visibility,
  });
  saveInventoryItem(campaign, item('PUBLIC_SUPPLIES', 'party', 'shared'));
  saveInventoryItem(campaign, item('MARA_SECRET', mara.id, 'character'));
  saveInventoryItem(campaign, item('IVO_SECRET', ivo.id, 'character'));
  saveInventoryItem(campaign, item('GM_SECRET', 'party', 'gm'));
  saveInventoryItem(campaign, item('NPC_SECRET', npc.id, 'character'));
  return campaign;
}

afterEach(() => vi.unstubAllGlobals());

describe('character-private inventory', () => {
  it('projects items and historical events only to their authorized character or the GM', () => {
    const campaign = fixture();
    expect(projectCampaign(campaign, gm)).toEqual(campaign);
    for (const [actor, privateName] of [
      [alice, 'MARA_SECRET'],
      [bob, 'IVO_SECRET'],
    ] as const) {
      const view = projectCampaign(campaign, actor);
      expect(view.inventory.map((item) => item.name)).toEqual(['PUBLIC_SUPPLIES', privateName]);
      expect(view.events).toHaveLength(2);
      expect(view.events[1].summary).toContain(privateName);
      expect(JSON.stringify(view)).not.toContain('GM_SECRET');
      expect(JSON.stringify(view)).not.toContain('NPC_SECRET');
      expect(campaignSchema.parse(view)).toEqual(view);
      expect(() => assertReferences(view)).not.toThrow();
    }
    const publicView = projectCampaign(campaign);
    expect(publicView.inventory.map((item) => item.name)).toEqual(['PUBLIC_SUPPLIES']);
    expect(publicView.events).toHaveLength(1);
    expect(JSON.stringify(publicView)).not.toContain('SECRET');
    expect(projectCampaign(campaign, { ...alice, characterIds: [] })).toEqual(publicView);
    expect(JSON.stringify(projectCampaign(campaign, { ...alice, characterIds: ['npc'] }))).not.toContain(
      'NPC_SECRET',
    );
  });

  it('keeps private history with its original character when possession changes', () => {
    const campaign = fixture();
    const item = campaign.inventory.find((entry) => entry.name === 'MARA_SECRET')!;
    const originalEventId = campaign.events[1].id;
    saveInventoryItem(campaign, {
      ...item,
      ownerId: 'ivo',
      name: 'NEW_PRIVATE_NAME',
      description: 'New information',
    });
    const aliceView = projectCampaign(campaign, alice);
    const bobView = projectCampaign(campaign, bob);
    expect(aliceView.inventory.find((entry) => entry.id === item.id)).toBeUndefined();
    expect(JSON.stringify(aliceView)).not.toContain('NEW_PRIVATE_NAME');
    expect(aliceView.events.find((event) => event.id === originalEventId)?.summary).toContain('MARA_SECRET');
    expect(bobView.inventory.find((entry) => entry.id === item.id)?.name).toBe('NEW_PRIVATE_NAME');
    expect(bobView.events.find((event) => event.id === originalEventId)).toBeUndefined();
    expect(JSON.stringify(bobView)).not.toContain('MARA_SECRET');
    expect(bobView.events.at(-1)?.characterId).toBe('ivo');
  });

  it('does not make earlier private events public when the item is shared later', () => {
    const campaign = fixture();
    const item = campaign.inventory.find((entry) => entry.name === 'MARA_SECRET')!;
    saveInventoryItem(campaign, {
      ...item,
      name: 'Shared relic',
      description: 'A public description',
      visibility: 'shared',
    });
    const publicView = projectCampaign(campaign);
    expect(publicView.inventory.find((entry) => entry.id === item.id)?.name).toBe('Shared relic');
    expect(publicView.events.at(-1)?.summary).toContain('Shared relic');
    expect(JSON.stringify(publicView)).not.toContain('MARA_SECRET');
  });

  it('keeps corrections and removal records private', () => {
    const original = fixture();
    const campaign = applyCommand(
      original,
      {
        id: 'correct-private-event',
        type: 'correction',
        eventId: original.events[1].id,
        reason: 'Corrected quantity',
      },
      gm,
    );
    expect(campaign.events.at(-1)).toMatchObject({ visibility: 'character', characterId: 'mara' });
    const item = campaign.inventory.find((entry) => entry.name === 'MARA_SECRET')!;
    removeInventoryItem(campaign, item);
    expect(campaign.inventory.find((entry) => entry.id === item.id)).toBeUndefined();
    expect(projectCampaign(campaign, alice).events.at(-1)?.summary).toContain('Removed: MARA_SECRET');
    expect(JSON.stringify(projectCampaign(campaign, bob))).not.toContain('MARA_SECRET');
    expect(JSON.stringify(projectCampaign(campaign))).not.toContain('MARA_SECRET');
  });

  it('rejects party or missing owners in edits, saves, and imports', async () => {
    for (const ownerId of ['party', 'deleted-character']) {
      const campaign = fixture();
      const item = { ...campaign.inventory[1], ownerId };
      expect(() => saveInventoryItem(campaign, item)).toThrow('Choose a character');
      campaign.inventory[1] = item;
      expect(campaignSchema.safeParse(campaign).success).toBe(false);
      expect(() => assertReferences(campaign)).toThrow('existing character');
      await expect(saveCampaign(campaign, -1)).rejects.toThrow('existing character');
      const valid = JSON.parse(await exportCampaign(fixture()));
      valid.campaign.inventory[1].ownerId = ownerId;
      await expect(parseCampaignExport(JSON.stringify(valid))).rejects.toThrow('existing character');
    }
    const campaign = fixture();
    delete campaign.events[1].characterId;
    expect(campaignSchema.safeParse(campaign).success).toBe(false);
    expect(JSON.stringify(projectCampaign(campaign, alice))).not.toContain('MARA_SECRET ·');
  });

  it('refuses stale saves and deletions without changing data or duplicating history', () => {
    const campaign = fixture();
    const stale = { ...campaign.inventory[1] };
    saveInventoryItem(campaign, { ...stale, quantity: 2 });
    const baseline = structuredClone(campaign);
    expect(() => saveInventoryItem(campaign, stale)).toThrow('changed');
    expect(() => removeInventoryItem(campaign, stale)).toThrow('changed');
    expect(campaign).toEqual(baseline);
    removeInventoryItem(campaign, campaign.inventory[1]);
    const removed = structuredClone(campaign);
    expect(() => saveInventoryItem(campaign, stale)).toThrow('removed');
    expect(campaign).toEqual(removed);
  });

  it('retains deleted characters’ private possessions as GM-only party items', () => {
    const campaign = fixture();
    releaseCharacterInventory(campaign, 'mara');
    campaign.characters = campaign.characters.filter((character) => character.id !== 'mara');
    expect(campaign.inventory[1]).toMatchObject({ ownerId: 'party', visibility: 'gm', revision: 2 });
    expect(campaignSchema.parse(campaign)).toEqual(campaign);
    expect(() => assertReferences(campaign)).not.toThrow();
    expect(JSON.stringify(projectCampaign(campaign, alice))).not.toContain('MARA_SECRET');
  });

  it('persists local saves and independent copies without dropping privacy', async () => {
    const campaign = fixture();
    try {
      await saveCampaign(campaign, -1);
      const loaded = await loadCampaign(campaign.id);
      expect(loaded).toEqual(campaign);
      const copy = cloneCampaign(loaded!);
      expect(copy.id).not.toBe(campaign.id);
      expect(copy.inventory).toEqual(campaign.inventory);
      expect(copy.events).toEqual(campaign.events);
      expect(JSON.stringify(projectCampaign(copy))).not.toContain('SECRET');
    } finally {
      await deleteCampaign(campaign.id);
    }
  });

  it.each(['json', 'zip'] as const)(
    'restores %s backups and filters player exports using the actual audience',
    async (format) => {
      const campaign = fixture();
      const exporter = format === 'json' ? exportCampaign : exportCampaignZip;
      expect((await parseCampaignExport(await exporter(campaign))).campaign).toEqual(campaign);
      const ownerCopy = (await parseCampaignExport(await exporter(campaign, 'player', alice))).campaign;
      expect(ownerCopy).toEqual(projectCampaign(campaign, alice));
      expect(JSON.stringify(ownerCopy)).toContain('MARA_SECRET');
      expect(JSON.stringify(ownerCopy)).not.toContain('IVO_SECRET');
      const publicCopy = (await parseCampaignExport(await exporter(campaign, 'player'))).campaign;
      expect(JSON.stringify(publicCopy)).not.toContain('SECRET');
    },
  );

  it('uses live host grants and ownership for snapshots after reassignment or revocation', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    const campaign = fixture();
    const host = new FatePeerHost({ getCampaign: () => campaign, onCommand: async () => campaign });
    const internal = host as unknown as {
      grants: GrantStore;
      sendSnapshot(peer: unknown): Promise<void>;
    };
    const grant = internal.grants.create('Alice device', ['mara']);
    campaign.characters[0].ownerId = grant.memberId;
    campaign.members.push({ id: grant.memberId, name: grant.name, role: 'player', characterIds: ['mara'] });
    const send = vi.fn().mockResolvedValue(undefined);
    const peer = {
      grant,
      control: { channel: { readyState: 'open' }, send },
      info: {},
      snapshotQueue: Promise.resolve(),
      sentAssets: new Set<string>(),
    };
    const lastSnapshot = () =>
      send.mock.calls.filter(([value]) => value.type === 'snapshot').at(-1)?.[0].campaign as Campaign;
    try {
      await internal.sendSnapshot(peer);
      expect(JSON.stringify(lastSnapshot())).toContain('MARA_SECRET');
      expect(JSON.stringify(lastSnapshot())).not.toContain('IVO_SECRET');
      campaign.characters[0].ownerId = bob.id;
      await internal.sendSnapshot(peer);
      expect(JSON.stringify(lastSnapshot())).not.toContain('MARA_SECRET');
      campaign.characters[0].ownerId = grant.memberId;
      campaign.members.find((member) => member.id === grant.memberId)!.characterIds = [];
      await internal.sendSnapshot(peer);
      expect(JSON.stringify(lastSnapshot())).not.toContain('MARA_SECRET');
      internal.grants.revoke(grant.memberId);
      send.mockClear();
      await internal.sendSnapshot(peer);
      expect(send).not.toHaveBeenCalled();
    } finally {
      host.close();
    }
  });
});
