import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadSeaOfCloudsMap, SEA_OF_CLOUDS_MAP_HASH } from './cirrus-skimmer-map';
import references from './content/accelerated-reference.json';
import metadata from './content/accelerated-metadata.json';
import { CIRRUS_SOURCES, cirrusSkimmerCampaign } from './cirrus-skimmer';
import { deriveCharacter, validateCharacter } from './domain/rules';
import { projectCampaign } from './network/projection';
import { exportCampaign, exportCampaignZip, parseCampaignExport } from './storage/backup';
import { assertReferences, campaignSchema } from './storage/schema';

const image = await readFile(new URL('../public/sample/cirrus-skimmer-sea-of-clouds.png', import.meta.url));
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(image, { headers: { 'Content-Type': 'image/png' } })),
  ),
);
afterEach(() => vi.unstubAllGlobals());

describe('Cirrus Skimmer Accelerated starter', () => {
  it('creates valid, ready Accelerated characters and contrasting NPC profiles in a fresh campaign', async () => {
    const c = await cirrusSkimmerCampaign();
    expect(campaignSchema.parse(c)).toEqual(c);
    expect(() => assertReferences(c)).not.toThrow();
    expect(c.rules.system).toBe('fate-accelerated');
    expect(c.characters.filter((ch) => ch.kind === 'pc').map((ch) => ch.name)).toEqual([
      'Voltaire',
      'Sanchez',
      'Mira Vale',
    ]);
    for (const ch of c.characters) {
      expect(validateCharacter(ch, c.rules), ch.name).toEqual([]);
      expect(ch.status).toBe('ready');
      expect(ch.phases).toEqual([]);
      if (ch.kind !== 'pc') continue;
      expect(Object.values(ch.skills).sort()).toEqual([0, 1, 1, 2, 2, 3]);
      expect(deriveCharacter(ch, c.rules)).toMatchObject({
        refresh: 3,
        tracks: [{ id: 'stress', boxes: [1, 2, 3] }],
      });
      expect(ch.fatePoints).toBe(3);
    }
    const shark = c.characters.find((ch) => ch.name === 'Sky shark')!;
    const party = c.characters.find((ch) => ch.name === 'Naval boarding party')!;
    expect(shark.mook).toMatchObject({ stressBoxes: 2 });
    expect(party.mook).toMatchObject({ groupSize: 4 });
    for (const ch of [shark, party])
      expect(deriveCharacter(ch, c.rules)).toMatchObject({
        tracks: [{ boxes: [1, 2] }],
        consequenceSlots: [],
      });
    expect(c.play.npcFatePoints).toBe(3);
    expect(c.play.aspects).toHaveLength(2);
    expect(c.events).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}sample/cirrus-skimmer-sea-of-clouds.png`);
    expect(c.assets).toHaveLength(1);
    expect(c.assets[0].hash).toBe(SEA_OF_CLOUDS_MAP_HASH);
    const map = c.maps[0];
    expect(map.name).toBe('Sea of Clouds');
    expect(map.sharedRevisionId).toBe(map.currentRevisionId);
    const revision = map.revisions[0];
    expect(revision.assetId).toBe(c.assets[0].id);
    expect(revision.zones.map((zone) => zone.name)).toEqual([
      'Cloudbreak Anchorage',
      'Glasswind Spires',
      'Stormwall',
      'Patrol Reach',
      'Trade Winds Reach',
      'The Quiet Shoals',
      'Lower Cloud Sea',
    ]);
    for (const zone of revision.zones) {
      expect(zone.x + zone.width).toBeLessThanOrEqual(1);
      expect(zone.y + zone.height).toBeLessThanOrEqual(1);
      for (const target of zone.connections)
        expect(revision.zones.find((other) => other.id === target)?.connections).toContain(zone.id);
    }
    expect(revision.tokens.map((token) => token.characterId)).toEqual(
      c.characters.filter((ch) => ch.kind === 'pc').map((ch) => ch.id),
    );
    const start = revision.zones.find((zone) => zone.name === 'Trade Winds Reach')!;
    for (const token of revision.tokens) {
      expect(token.zoneId).toBe(start.id);
      expect(token.x).toBeGreaterThanOrEqual(start.x);
      expect(token.x).toBeLessThanOrEqual(start.x + start.width);
      expect(token.y).toBeGreaterThanOrEqual(start.y);
      expect(token.y).toBeLessThanOrEqual(start.y + start.height);
    }

    expect((await cirrusSkimmerCampaign()).id).not.toBe(c.id);
  });

  it('retains Voltaire’s source mechanics and identifies every adaptation with pinned attribution', async () => {
    const c = await cirrusSkimmerCampaign();
    const voltaire = c.characters[0];
    const source = references.find((entry) => entry.title === 'Voltaire')!;
    expect(voltaire.skills).toEqual({ careful: 1, clever: 1, flashy: 3, forceful: 0, quick: 2, sneaky: 2 });
    for (const aspect of voltaire.aspects) expect(source.body).toContain(aspect.name);
    expect(source.body).toContain(voltaire.stunts[0].name);
    expect(voltaire.stunts[0]).toMatchObject({ refreshCost: 1, fateCost: 0, limit: 'none' });
    const credits = c.world.find((entry) => entry.kind === 'reference')!;
    for (const citation of CIRRUS_SOURCES) {
      const original = references.find((entry) => entry.sourceLine === citation.line)!;
      expect(original.title).toBe(citation.section);
      expect(original.body.toLowerCase()).toContain(citation.evidence.toLowerCase());
      expect(credits.body).toContain(`${metadata.sourceUrl}#L${citation.line}`);
    }
    expect(credits.body).toContain(metadata.attribution);
    expect(credits.body).toContain(metadata.licenseUrl);
    expect(credits.body).toContain('not an official published adventure');
    expect(credits.body).toContain('companion additions');
  });

  it('keeps GM preparation private and preserves the source credit and selected system in portable backups', async () => {
    const c = await cirrusSkimmerCampaign();
    const player = projectCampaign(c);
    expect(player.maps).toEqual(c.maps);
    expect(player.assets).toEqual(c.assets);
    expect(player.characters.map((ch) => ch.name)).toEqual(['Voltaire', 'Sanchez', 'Mira Vale']);
    expect(player.world.some((entry) => entry.title.startsWith('Opening:'))).toBe(false);
    expect(player.world.some((entry) => entry.title === 'Running the opening')).toBe(false);
    expect(player.world.find((entry) => entry.kind === 'reference')?.body).toContain(metadata.attribution);
    for (const backup of [
      await exportCampaign(c),
      await exportCampaignZip(c),
      await exportCampaign(c, 'player'),
    ]) {
      const restored = (await parseCampaignExport(backup)).campaign;
      expect(restored.rules.system).toBe('fate-accelerated');
      expect(restored.maps).toEqual(c.maps);
      expect(restored.assets).toEqual(c.assets);
      expect(restored.world.find((entry) => entry.kind === 'reference')?.body).toContain(
        metadata.attribution,
      );
    }
  });
  it('rejects an unavailable or changed chart before creating a starter', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(cirrusSkimmerCampaign()).rejects.toThrow('could not be loaded');
    const changed = new Uint8Array(image);
    changed[changed.length - 1] ^= 1;
    vi.mocked(fetch).mockResolvedValueOnce(new Response(changed));
    await expect(loadSeaOfCloudsMap([])).rejects.toThrow('integrity check');
  });
});
