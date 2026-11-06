import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createCampaign, createCharacter } from '../domain/defaults';
import type { Asset, Campaign } from '../domain/types';
import { assetHash, bytesToDataUrl, createAsset, validateAssets } from './assets';
import {
  cloneCampaign,
  exportCampaign,
  exportCampaignZip,
  exportCharacter,
  exportRules,
  importCampaign,
  parseCampaignExport,
  parseCharacterExport,
  parseRulesExport,
} from './backup';
import {
  db,
  deleteCampaign,
  listCampaigns,
  loadCampaign,
  RevisionConflictError,
  saveCampaign,
  transactCampaign,
} from './db';
import { campaignSchema, characterSchema, MAX_IMPORT_BYTES, rulesSchema } from './schema';

const png = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
);
async function fixture(): Promise<Campaign> {
  const campaign = createCampaign('The lantern road');
  campaign.rules.houseRules = 'Resources may represent community support.';
  const character = createCharacter(campaign.rules, 'Mira');
  character.skills = { will: 3, lore: 4 };
  campaign.characters.push(character);
  const image: Asset = {
    id: 'portrait',
    name: 'Portrait.png',
    mime: 'image/png',
    dataUrl: bytesToDataUrl(png, 'image/png'),
    hash: await assetHash(png),
    visibility: 'shared',
  };
  character.portraitAssetId = image.id;
  campaign.assets.push(image);
  campaign.world.push({
    id: 'secret',
    title: 'Secret identity',
    body: 'The archivist is the antagonist.',
    kind: 'note',
    visibility: 'gm',
    tags: [],
  });
  campaign.inventory.push({
    id: 'lantern',
    revision: 0,
    name: 'Lantern',
    description: 'Found at the gate.',
    quantity: 2,
    unit: 'items',
    ownerId: character.id,
    visibility: 'shared',
  });
  campaign.events.push({
    id: 'event-1',
    commandId: 'command-1',
    sequence: 1,
    actorId: 'gm',
    type: 'note',
    summary: 'The journey begins.',
    timestamp: new Date().toISOString(),
    visibility: 'shared',
  });
  campaign.processedCommandIds.push('command-1');
  return campaign;
}

beforeEach(async () => {
  await db.campaigns.clear();
  await db.assets.clear();
});
afterAll(async () => {
  await db.delete();
});

describe('ruleset configuration integrity', () => {
  it('rejects a stress track whose governing skill was removed', () => {
    const rules = createCampaign().rules;
    rules.skills = rules.skills.filter((skill) => skill.id !== 'will');
    expect(rulesSchema.safeParse(rules).success).toBe(false);
  });
  it('rejects creation slots above the selected skill cap', () => {
    const rules = createCampaign().rules;
    rules.skillCap = 3;
    expect(rulesSchema.safeParse(rules).success).toBe(false);
    delete rules.skillSlots['4'];
    expect(rulesSchema.safeParse(rules).success).toBe(true);
  });
});

describe('Zod 4 import validation', () => {
  it('preserves sparse custom records without requiring undeclared keys', () => {
    const campaign = createCampaign();
    const character = createCharacter(campaign.rules, 'Custom setting');
    character.skills = { 'custom-skill': 3 };
    character.stress = { 'custom-track': [1, 3] };
    campaign.characters.push(character);
    campaign.play.contest.scores = { 'custom-team': 2 };
    expect(campaignSchema.parse(campaign)).toEqual(campaign);
    character.skills = {};
    character.stress = {};
    expect(characterSchema.parse(character)).toEqual(character);
  });

  it.each<[string, unknown]>([
    ['skills', { lore: '3' }],
    ['skills', { lore: -1 }],
    ['skills', { lore: 21 }],
    ['skills', { lore: 1.5 }],
    ['stress', { physical: [0] }],
    ['stress', { physical: [101] }],
    ['stress', { physical: ['1'] }],
    ['stress', { physical: 1 }],
  ])('rejects invalid character %s record values: %j', (field, value) => {
    const character = createCharacter(createCampaign().rules);
    const result = characterSchema.safeParse({ ...character, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path[0]).toBe(field);
  });

  it.each(['1', -1, 1.5, 1_000_001])('rejects invalid contest score %j', (score) => {
    const campaign = createCampaign();
    const result = campaignSchema.safeParse({
      ...campaign,
      play: { ...campaign.play, contest: { ...campaign.play.contest, scores: { team: score } } },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(['play', 'contest', 'scores', 'team']);
  });

  it.each(['1', -1, 1.5, 101])('rejects invalid creation-slot count %j', (slots) => {
    const rules = createCampaign().rules;
    expect(rulesSchema.safeParse({ ...rules, skillSlots: { 1: slots } }).success).toBe(false);
  });

  it.each<[string, number]>([
    ['characters', 1001],
    ['world', 10_001],
    ['assets', 501],
    ['events', 50_001],
    ['processedCommandIds', 100_001],
  ])('rejects oversized %s before generating per-element errors', (field, count) => {
    // Invalid elements formerly produced an issue per entry even after the size check failed.
    const result = campaignSchema.safeParse({ ...createCampaign(), [field]: Array(count).fill(null) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]).toMatchObject({ code: 'too_big', path: [field] });
    }
  });

  it('rejects oversized nested stress arrays before validating their elements', () => {
    const character = createCharacter(createCampaign().rules);
    const result = characterSchema.safeParse({ ...character, stress: { physical: Array(21).fill(null) } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]).toMatchObject({ code: 'too_big', path: ['stress', 'physical'] });
    }
  });
});

describe('IndexedDB persistence', () => {
  it('stores image bytes separately and restores campaign content exactly', async () => {
    const campaign = await fixture();
    await saveCampaign(campaign, -1);
    const stored = await db.campaigns.get(campaign.id);
    expect(stored!.assets[0]).not.toHaveProperty('dataUrl');
    expect((await db.assets.toArray())[0].blob).toBeInstanceOf(Blob);
    expect(await loadCampaign(campaign.id)).toEqual(campaign);
    expect(await listCampaigns()).toEqual([campaign]);
  });
  it('rejects a stale revision without replacing state or assets', async () => {
    const campaign = await fixture();
    await saveCampaign(campaign, -1);
    const latest = { ...campaign, revision: 1, name: 'Updated' };
    await saveCampaign(latest, 0);
    await expect(saveCampaign({ ...campaign, name: 'Stale' }, 0)).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    expect(await loadCampaign(campaign.id)).toEqual(latest);
  });
  it('runs a command mutation using compare-and-swap and deletes owned blobs', async () => {
    const campaign = await fixture();
    await saveCampaign(campaign, -1);
    const next = await transactCampaign(campaign.id, (c) => ({
      ...c,
      revision: c.revision + 1,
      name: 'Next chapter',
    }));
    expect(next.revision).toBe(1);
    await expect(transactCampaign(campaign.id, (c) => c, 0)).rejects.toBeInstanceOf(RevisionConflictError);
    await deleteCampaign(campaign.id);
    expect(await loadCampaign(campaign.id)).toBeUndefined();
    expect(await db.assets.count()).toBe(0);
  });
});

describe('Portable campaign packages', () => {
  it('round-trips full JSON with pinned rules, history, and embedded images', async () => {
    const campaign = await fixture();
    const json = await exportCampaign(campaign);
    const decoded = await parseCampaignExport(json);
    expect(decoded.campaign).toEqual(campaign);
    const imported = await importCampaign(json);
    expect(imported.id).not.toBe(campaign.id);
    expect(imported.characters).toEqual(campaign.characters);
    expect(imported.rules).toEqual(campaign.rules);
    expect((await loadCampaign(imported.id))!.assets).toEqual(campaign.assets);
  });
  it('round-trips ZIP with the same canonical campaign manifest and external image bytes', async () => {
    const campaign = await fixture();
    const decoded = await parseCampaignExport(await exportCampaignZip(campaign));
    expect(decoded.campaign).toEqual(campaign);
    expect(campaign.assets[0].dataUrl).toContain('base64,');
  });
  it('retains historical map overlays and optional mechanical state through backup and persistence', async () => {
    const campaign = await fixture();
    campaign.characters[0].npcTough = true;
    campaign.characters[0].aspects[0].freeInvokeOwnerId = campaign.characters[0].id;
    campaign.characters[0].milestones.push({
      id: 'milestone',
      type: 'minor',
      description: 'New outlook',
      timestamp: '2026-11-05',
      choiceUsed: true,
    });
    campaign.play.npcCarryover = 2;
    const original = {
      id: 'old',
      assetId: 'portrait',
      createdAt: '2026-11-04',
      zones: [
        { id: 'gate', name: 'Gate', x: 0, y: 0, width: 0.4, height: 0.5, aspect: 'Exposed', connections: [] },
      ],
      tokens: [
        {
          id: 'hero',
          characterId: campaign.characters[0].id,
          label: 'Mira',
          x: 0.2,
          y: 0.3,
          zoneId: 'gate',
          visibility: 'shared' as const,
        },
      ],
      annotations: [{ id: 'clue', text: 'Tracks', x: 0.1, y: 0.4, visibility: 'gm' as const }],
    };
    campaign.maps.push({
      id: 'map',
      name: 'Fortress',
      visibility: 'shared',
      currentRevisionId: 'new',
      sharedRevisionId: 'old',
      revisions: [original, { ...structuredClone(original), id: 'new', createdAt: '2026-11-05' }],
    });
    const parsed = await parseCampaignExport(await exportCampaignZip(campaign));
    expect(parsed.campaign).toEqual(campaign);
    await saveCampaign(parsed.campaign, -1);
    expect(await loadCampaign(campaign.id)).toEqual(campaign);
  });
  it('restores identity only when requested and advances the local revision', async () => {
    const campaign = await fixture();
    await saveCampaign(campaign, -1);
    const restored = await importCampaign(await exportCampaign(campaign), 'restore');
    expect(restored.id).toBe(campaign.id);
    expect(restored.revision).toBe(1);
    expect(await db.campaigns.count()).toBe(1);
  });
  it('rejects malformed, newer, unsafe and damaged exports without changing saved data', async () => {
    const campaign = await fixture();
    await saveCampaign(campaign, -1);
    const valid = JSON.parse(await exportCampaign(campaign));
    const invalid = structuredClone(valid);
    invalid.campaign.inventory[0].quantity = -1;
    const newer = { ...valid, schemaVersion: 999 };
    const missingAsset = structuredClone(valid);
    missingAsset.campaign.assets = [];
    const damaged = structuredClone(valid);
    damaged.campaign.assets[0].hash = 'f'.repeat(64);
    for (const input of [
      'not json',
      JSON.stringify(invalid),
      JSON.stringify(newer),
      JSON.stringify(missingAsset),
      JSON.stringify(damaged),
      '{"__proto__":{"admin":true}}',
    ]) {
      await expect(importCampaign(input, 'restore')).rejects.toThrow();
    }
    expect(await loadCampaign(campaign.id)).toEqual(campaign);
    expect(await db.campaigns.count()).toBe(1);
  });
  it('rejects oversized imports and collections without replacing saved state or image bytes', async () => {
    const campaign = await fixture();
    await saveCampaign(campaign, -1);
    await expect(importCampaign(new Uint8Array(MAX_IMPORT_BYTES + 1), 'restore')).rejects.toThrow('64 MB');
    const oversized = JSON.parse(await exportCampaign(campaign));
    oversized.campaign.characters = Array(1001).fill(null);
    await expect(importCampaign(JSON.stringify(oversized), 'restore')).rejects.toThrow('campaign.characters');
    expect(await loadCampaign(campaign.id)).toEqual(campaign);
    expect(await db.campaigns.count()).toBe(1);
    expect(await db.assets.count()).toBe(1);
  });
  it('migrates the initial v0 receipt-free envelope', async () => {
    const campaign = await fixture();
    const original = JSON.parse(await exportCampaign(campaign));
    original.schemaVersion = 0;
    delete original.audience;
    delete original.campaign.processedCommandIds;
    const restored = await parseCampaignExport(JSON.stringify(original));
    expect(restored.schemaVersion).toBe(1);
    expect(restored.audience).toBe('gm');
    expect(restored.campaign.processedCommandIds).toEqual([]);
    expect(restored.campaign.characters).toEqual(campaign.characters);
  });
  it('sanitizes player packages and removes unexpected connection credentials', async () => {
    const campaign = await fixture();
    const input = { ...campaign, reconnectToken: 'must-not-export', turnPassword: 'secret' };
    const json = await exportCampaign(input, 'player');
    expect(json).not.toContain('The archivist');
    expect(json).not.toContain('must-not-export');
    expect(json).not.toContain('turnPassword');
    expect((await parseCampaignExport(json)).campaign.world).toEqual([]);
    await expect(importCampaign(json, 'restore')).rejects.toThrow('player export');
  });
  it('copies a campaign without sharing local receipt identity', async () => {
    const campaign = await fixture();
    const copy = cloneCampaign(campaign);
    expect(copy.id).not.toBe(campaign.id);
    expect(copy.processedCommandIds).toEqual([]);
    copy.characters[0].name = 'Changed';
    expect(campaign.characters[0].name).toBe('Mira');
  });
});

describe('Character and rule exports', () => {
  it('carries the source rules snapshot and portrait with a character', async () => {
    const campaign = await fixture();
    const decoded = await parseCharacterExport(await exportCharacter(campaign, campaign.characters[0].id));
    expect(decoded.character).toEqual(campaign.characters[0]);
    expect(decoded.rules).toEqual(campaign.rules);
    expect(decoded.assets).toEqual(campaign.assets);
  });
  it('validates standalone rule definitions', async () => {
    const campaign = await fixture();
    expect(parseRulesExport(await exportRules(campaign.rules))).toEqual(campaign.rules);
    const invalid = JSON.parse(await exportRules(campaign.rules));
    invalid.rules.refresh = 0;
    expect(() => parseRulesExport(JSON.stringify(invalid))).toThrow();
  });
  it('keeps standalone imports subject to collection limits and record validation', async () => {
    const campaign = await fixture();
    const character = JSON.parse(await exportCharacter(campaign, campaign.characters[0].id));
    character.character.skills = { lore: '4' };
    await expect(parseCharacterExport(JSON.stringify(character))).rejects.toThrow();
    character.character.skills = { lore: 4 };
    character.character.stunts = Array(201).fill(null);
    await expect(parseCharacterExport(JSON.stringify(character))).rejects.toThrow();
    const rules = JSON.parse(await exportRules(campaign.rules));
    rules.rules.skillSlots = { 1: '4' };
    expect(() => parseRulesExport(JSON.stringify(rules))).toThrow();
    rules.rules.skillSlots = { 1: 4 };
    rules.rules.skills = Array(101).fill(null);
    expect(() => parseRulesExport(JSON.stringify(rules))).toThrow();
  });
});

describe('Image integrity', () => {
  it('checks actual format bytes and SHA-256', async () => {
    const file = new File([png], 'tiny.png', { type: 'image/png' });
    const asset = await createAsset(file, 'shared');
    expect(asset.hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(validateAssets([asset])).resolves.toBeUndefined();
    await expect(
      createAsset(new File(['<script>bad</script>'], 'fake.png', { type: 'image/png' })),
    ).rejects.toThrow('signature');
    await expect(createAsset(new File(['svg'], 'bad.svg', { type: 'image/svg+xml' }))).rejects.toThrow('PNG');
  });
});
