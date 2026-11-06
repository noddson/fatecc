import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectCampaign } from './network/projection';
import { sampleCampaign } from './sample';
import { loadLanternCoastMap } from './sample-map';
import { exportCampaign, exportCampaignZip, parseCampaignExport } from './storage/backup';
import { assertReferences, campaignSchema } from './storage/schema';

const image = await readFile(new URL('../public/sample/lantern-coast.png', import.meta.url));
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(image, { headers: { 'Content-Type': 'image/png' } })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Lantern Coast example map', () => {
  it('creates a portable, player-safe example with connected travel zones and party tokens', async () => {
    const campaign = await sampleCampaign();
    expect(fetch).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}sample/lantern-coast.png`);
    expect(campaign.maps).toHaveLength(1);
    expect(campaign.assets).toHaveLength(1);
    expect(campaignSchema.parse(campaign)).toEqual(campaign);
    expect(() => assertReferences(campaign)).not.toThrow();
    const map = campaign.maps[0],
      revision = map.revisions[0];
    expect(revision.zones.map((zone) => zone.name)).toEqual([
      'Bellweather Harbor',
      'The Lighthouse',
      'Flooded Road North',
      'The Dark Beacon',
      'The Chandlery',
    ]);
    for (const zone of revision.zones) {
      expect(zone.x + zone.width).toBeLessThanOrEqual(1);
      expect(zone.y + zone.height).toBeLessThanOrEqual(1);
      for (const connection of zone.connections)
        expect(revision.zones.find((candidate) => candidate.id === connection)?.connections).toContain(
          zone.id,
        );
    }
    expect(revision.tokens.map((token) => token.characterId)).toEqual(campaign.characters.map((c) => c.id));
    expect(revision.tokens.every((token) => token.zoneId === revision.zones[0].id)).toBe(true);
    const playerCopy = projectCampaign(campaign);
    expect(playerCopy.maps).toEqual(campaign.maps);
    expect(playerCopy.assets).toEqual(campaign.assets);
    expect(playerCopy.world.some((entry) => entry.title === 'The first night')).toBe(false);
    expect(campaign.assets[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    const json = await parseCampaignExport(await exportCampaign(campaign));
    const zip = await parseCampaignExport(await exportCampaignZip(campaign));
    for (const restored of [json.campaign, zip.campaign]) {
      expect(restored.maps).toEqual(campaign.maps);
      expect(restored.assets).toEqual(campaign.assets);
    }
  }, 20000);

  it('rejects an unavailable image or one that has changed unexpectedly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(loadLanternCoastMap([])).rejects.toThrow('could not be loaded');
    const changed = new Uint8Array(image);
    changed[changed.length - 1] ^= 1;
    vi.mocked(fetch).mockResolvedValueOnce(new Response(changed));
    await expect(loadLanternCoastMap([])).rejects.toThrow('integrity check');
  });
});
