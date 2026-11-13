import { expect, it } from 'vitest';
import { createCampaign } from './domain/defaults';
import { campaignBanner } from './campaign-banner';
import { LANTERN_COAST_MAP_HASH } from './sample-map';

it('recognizes existing and renamed Lantern Coast maps while preserving uploaded banner priority', () => {
  const c = createCampaign('Renamed coast');
  c.assets = [
    {
      id: 'map-image',
      name: 'Map.png',
      mime: 'image/png',
      hash: LANTERN_COAST_MAP_HASH,
      dataUrl: 'map-bytes',
      visibility: 'shared',
    },
  ];
  c.maps = [
    {
      id: 'map',
      name: 'Renamed map',
      currentRevisionId: 'revision',
      sharedRevisionId: 'revision',
      visibility: 'shared',
      revisions: [
        {
          id: 'revision',
          assetId: 'map-image',
          createdAt: c.createdAt,
          zones: [],
          tokens: [],
          annotations: [],
        },
      ],
    },
  ];
  expect(campaignBanner(c)?.src).toContain('illustrations/lantern-coast-dark-beacon.png');
  c.bannerAssetId = 'uploaded';
  c.bannerPosition = 65;
  c.assets.push({ ...c.assets[0], id: 'uploaded', hash: 'custom', dataUrl: 'custom-banner' });
  expect(campaignBanner(c)).toEqual({ src: 'custom-banner', position: 65 });
  delete c.bannerAssetId;
  expect(campaignBanner(c)?.src).toContain('lantern-coast-dark-beacon.png');
  c.maps = [];
  expect(campaignBanner(c)).toBeUndefined();
});

it('recognizes renamed Cirrus Skimmer starters while retaining uploaded banner priority', () => {
  const c = createCampaign('Renamed skyship', 'fate-accelerated');
  c.world.push({
    id: 'credit',
    kind: 'reference',
    title: 'Cirrus Skimmer — sources and credits',
    body: 'Credits',
    tags: [],
    visibility: 'shared',
  });
  expect(campaignBanner(c, 'overview')).toEqual({
    src: `${import.meta.env.BASE_URL}illustrations/cirrus-skimmer-sea-of-clouds.png`,
    position: 50,
  });
  c.assets.push({
    id: 'custom',
    name: 'Banner',
    mime: 'image/png',
    hash: 'custom',
    dataUrl: 'custom-banner',
    visibility: 'shared',
  });
  c.bannerAssetId = 'custom';
  c.bannerPosition = 65;
  expect(campaignBanner(c)).toEqual({ src: 'custom-banner', position: 65 });
  delete c.bannerAssetId;
  expect(campaignBanner(c)?.src).toContain('cirrus-skimmer-sea-of-clouds.png');
  c.world = [];
  expect(campaignBanner(c)).toBeUndefined();
});
