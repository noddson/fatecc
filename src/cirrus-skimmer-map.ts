import { id } from './domain/defaults';
import type { Asset, CampaignMap, Character, Zone } from './domain/types';
import { createAsset } from './storage/assets';

export const SEA_OF_CLOUDS_MAP_HASH = '684ae62b400d94f8e3d5bc03d2cddab4dfa73a700fbe967642acf7de909a7230';

/** Embed the precached chart so maps, tokens, and zones travel in campaign backups. */
export async function loadSeaOfCloudsMap(
  characters: Character[],
): Promise<{ asset: Asset; map: CampaignMap }> {
  const response = await fetch(`${import.meta.env.BASE_URL}sample/cirrus-skimmer-sea-of-clouds.png`);
  if (!response.ok) throw new Error('The Sea of Clouds chart could not be loaded. Please try again.');
  const asset = await createAsset(
    new File([await response.blob()], 'sea-of-clouds.png', { type: 'image/png' }),
    'shared',
  );
  if (asset.hash !== SEA_OF_CLOUDS_MAP_HASH)
    throw new Error('The Sea of Clouds chart failed its image integrity check.');
  const cloudbreak = id(),
    spires = id(),
    stormwall = id(),
    patrol = id(),
    winds = id(),
    shoals = id(),
    lower = id();
  const zones: Zone[] = [
    {
      id: cloudbreak,
      name: 'Cloudbreak Anchorage',
      x: 0.65,
      y: 0.25,
      width: 0.29,
      height: 0.39,
      aspect: 'A Safe Harbor Above the Clouds',
      connections: [winds, spires, lower],
    },
    {
      id: spires,
      name: 'Glasswind Spires',
      x: 0.66,
      y: 0.02,
      width: 0.24,
      height: 0.23,
      aspect: 'Needle Rocks in the Crosswind',
      connections: [cloudbreak, stormwall],
    },
    {
      id: stormwall,
      name: 'Stormwall',
      x: 0.3,
      y: 0.02,
      width: 0.35,
      height: 0.28,
      aspect: 'The Weather Has the Right of Way',
      connections: [spires, patrol, winds],
    },
    {
      id: patrol,
      name: 'Patrol Reach',
      x: 0.06,
      y: 0.24,
      width: 0.26,
      height: 0.31,
      aspect: 'Few Places to Hide a Skyship',
      connections: [stormwall, winds, shoals],
    },
    {
      id: winds,
      name: 'Trade Winds Reach',
      x: 0.36,
      y: 0.42,
      width: 0.25,
      height: 0.24,
      aspect: 'A Following Wind Can Change Everything',
      connections: [cloudbreak, stormwall, patrol, shoals, lower],
    },
    {
      id: shoals,
      name: 'The Quiet Shoals',
      x: 0.07,
      y: 0.6,
      width: 0.26,
      height: 0.24,
      aspect: 'Calm Clouds Conceal Old Moorings',
      connections: [patrol, winds],
    },
    {
      id: lower,
      name: 'Lower Cloud Sea',
      x: 0.61,
      y: 0.66,
      width: 0.3,
      height: 0.2,
      aspect: 'Nothing Solid Beneath You',
      connections: [cloudbreak, winds],
    },
  ];
  const revisionId = id();
  return {
    asset,
    map: {
      id: id(),
      name: 'Sea of Clouds',
      visibility: 'shared',
      currentRevisionId: revisionId,
      sharedRevisionId: revisionId,
      revisions: [
        {
          id: revisionId,
          assetId: asset.id,
          createdAt: new Date().toISOString(),
          zones,
          tokens: characters
            .filter((ch) => ch.kind === 'pc' && ch.visibility === 'shared')
            .map((ch, index) => ({
              id: id(),
              characterId: ch.id,
              label: ch.name,
              x: 0.43 + index * 0.055,
              y: 0.56,
              zoneId: winds,
              visibility: 'shared',
            })),
          annotations: [],
        },
      ],
    },
  };
}
