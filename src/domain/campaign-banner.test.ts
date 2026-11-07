import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCampaign, createCharacter } from './defaults';
import { replaceCampaignBanner } from './campaign-banner';
import type { Asset, Campaign } from './types';
import { assetHash, bytesToDataUrl } from '../storage/assets';
import {
  cloneCampaign,
  exportCampaign,
  exportCampaignZip,
  importCampaign,
  parseCampaignExport,
} from '../storage/backup';
import { db, loadCampaign, saveCampaign } from '../storage/db';
import { assertReferences, campaignSchema } from '../storage/schema';
import { projectCampaign } from '../network/projection';
import { FatePeerClient } from '../network/peer';

const png = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
);
async function banner(id = 'banner', visibility: Asset['visibility'] = 'shared'): Promise<Asset> {
  return {
    id,
    name: `${id}.png`,
    mime: 'image/png',
    dataUrl: bytesToDataUrl(png, 'image/png'),
    hash: await assetHash(png),
    visibility,
  };
}
beforeEach(async () => {
  await db.campaigns.clear();
  await db.assets.clear();
});
afterAll(async () => {
  await db.delete();
});

describe('campaign banner persistence', () => {
  it('persists its bytes and focal position through IndexedDB reload and independent copies', async () => {
    const c = createCampaign('Banner coast'),
      image = await banner();
    replaceCampaignBanner(c, image, 25);
    await saveCampaign(c);
    const loaded = (await loadCampaign(c.id))!;
    expect(loaded.bannerAssetId).toBe(image.id);
    expect(loaded.bannerPosition).toBe(25);
    expect(loaded.assets).toEqual([image]);
    const copy = cloneCampaign(loaded);
    expect(copy.id).not.toBe(c.id);
    expect(copy.bannerAssetId).toBe(image.id);
    expect(copy.bannerPosition).toBe(25);
    await saveCampaign(copy);
    replaceCampaignBanner(c, undefined);
    expect((await loadCampaign(copy.id))?.assets).toEqual([image]);
  });

  it.each(['JSON', 'ZIP'] as const)('restores a portable %s backup into empty storage', async (format) => {
    const c = createCampaign('Portable banner'),
      image = await banner();
    replaceCampaignBanner(c, image, 73);
    const backup = format === 'JSON' ? await exportCampaign(c) : await exportCampaignZip(c);
    const restored = await importCampaign(backup, 'restore');
    const loaded = await loadCampaign(restored.id);
    expect(loaded?.bannerAssetId).toBe(image.id);
    expect(loaded?.bannerPosition).toBe(73);
    expect(loaded?.assets).toEqual([image]);
  });

  it('keeps older records without banner fields valid and rejects invalid references/positions', async () => {
    const c = createCampaign('Older record');
    const parsed = await parseCampaignExport(await exportCampaign(c));
    expect(parsed.campaign.bannerAssetId).toBeUndefined();
    expect(parsed.campaign.bannerPosition).toBeUndefined();
    c.bannerAssetId = 'missing';
    expect(() => assertReferences(c)).toThrow('banner image is missing');
    await expect(exportCampaign(c)).rejects.toThrow('banner image is missing');
    for (const position of [-1, 101, NaN, Infinity])
      expect(campaignSchema.safeParse({ ...c, bannerPosition: position }).success).toBe(false);
  });
});

describe('campaign banner visibility and replacement', () => {
  it('publishes play state while a banner transfers and adds the image only after verification', async () => {
    const c = createCampaign(),
      image = await banner();
    replaceCampaignBanner(c, image, 70);
    const onCampaign = vi.fn(),
      onStatus = vi.fn();
    const client = new FatePeerClient({ name: 'Player', onCampaign, onStatus });
    const internal = client as unknown as {
      approved: boolean;
      pc: { connectionState: string; close(): void };
      control: { channel: { readyState: string } };
      pendingCampaign: Campaign;
      publishIfReady(): void;
      receiveAsset(value: unknown): Promise<void>;
    };
    internal.approved = true;
    internal.pc = { connectionState: 'connected', close() {} };
    internal.control = { channel: { readyState: 'open' } };
    internal.pendingCampaign = c;
    expect(() => internal.publishIfReady()).not.toThrow();
    const pending = onCampaign.mock.calls[0][0] as Campaign;
    expect(pending.bannerAssetId).toBeUndefined();
    expect(pending.bannerPosition).toBeUndefined();
    expect(pending.assets).toEqual([]);
    expect(onStatus).toHaveBeenLastCalledWith('syncing-assets');
    await internal.receiveAsset({ type: 'asset', asset: image });
    const complete = onCampaign.mock.calls.at(-1)![0] as Campaign;
    expect(complete.bannerAssetId).toBe(image.id);
    expect(complete.bannerPosition).toBe(70);
    expect(complete.assets).toEqual([image]);
    expect(onStatus).toHaveBeenLastCalledWith('connected');
    client.close();
  });

  it('includes shared banners in player snapshots and exports while removing private banner identifiers and bytes', async () => {
    const c = createCampaign(),
      image = await banner();
    replaceCampaignBanner(c, image, 10);
    expect(projectCampaign(c).assets).toEqual([image]);
    expect(projectCampaign(c).bannerPosition).toBe(10);
    const sharedExport = await parseCampaignExport(await exportCampaign(c, 'player'));
    expect(sharedExport.campaign.bannerAssetId).toBe(image.id);
    expect(sharedExport.campaign.assets).toEqual([image]);
    c.assets[0].visibility = 'gm';
    for (const projected of [
      projectCampaign(c),
      (await parseCampaignExport(await exportCampaign(c, 'player'))).campaign,
    ]) {
      expect(projected.bannerAssetId).toBeUndefined();
      expect(projected.bannerPosition).toBeUndefined();
      expect(projected.assets).toEqual([]);
    }
    expect(projectCampaign(c, { id: 'gm', role: 'gm', characterIds: [] }).bannerAssetId).toBe(image.id);
    c.bannerAssetId = 'dangling';
    expect(projectCampaign(c).bannerAssetId).toBeUndefined();
  });

  it('removes replaced or cleared banner assets while retaining unrelated assets', async () => {
    const c = createCampaign(),
      old = await banner('old'),
      next = await banner('next'),
      unrelated = await banner('other');
    c.assets.push(unrelated);
    replaceCampaignBanner(c, old);
    expect(c.bannerPosition).toBe(50);
    replaceCampaignBanner(c, next, 80);
    expect(c.assets.map((a) => a.id)).toEqual(['other', 'next']);
    replaceCampaignBanner(c, next, 20);
    expect(c.assets).toHaveLength(2);
    expect(c.bannerPosition).toBe(20);
    replaceCampaignBanner(c, undefined);
    expect(c.bannerAssetId).toBeUndefined();
    expect(c.bannerPosition).toBeUndefined();
    expect(c.assets).toEqual([unrelated]);
  });

  it.each(['portrait', 'attachment', 'old map revision'] as const)(
    'retains a replaced banner still used by a %s',
    async (reference) => {
      const c = createCampaign(),
        image = await banner('shared-image');
      replaceCampaignBanner(c, image);
      if (reference === 'portrait') {
        const character = createCharacter(c.rules, 'Mara');
        character.portraitAssetId = image.id;
        c.characters.push(character);
      } else if (reference === 'attachment') {
        c.world.push({
          id: 'place',
          kind: 'location',
          title: 'Coast',
          body: '',
          tags: [],
          visibility: 'shared',
          assetId: image.id,
        });
      } else {
        c.maps.push({
          id: 'map',
          name: 'Coast',
          visibility: 'gm',
          currentRevisionId: 'current',
          revisions: [
            { id: 'old', assetId: image.id, createdAt: c.createdAt, zones: [], tokens: [], annotations: [] },
            {
              id: 'current',
              assetId: 'new-banner',
              createdAt: c.createdAt,
              zones: [],
              tokens: [],
              annotations: [],
            },
          ],
        });
      }
      replaceCampaignBanner(c, await banner('new-banner'));
      expect(c.assets.some((asset) => asset.id === image.id)).toBe(true);
      expect(() => assertReferences(c)).not.toThrow();
    },
  );

  it('rejects invalid replacements before changing campaign state', async () => {
    const c = createCampaign(),
      image = await banner();
    const original: Campaign = structuredClone(c);
    expect(() => replaceCampaignBanner(c, image, -2)).toThrow('between 0 and 100');
    expect(c).toEqual(original);
    replaceCampaignBanner(c, image);
    expect(() => replaceCampaignBanner(c, { ...image, hash: 'different' })).toThrow('another asset');
    expect(c.assets).toEqual([image]);
  });
});
