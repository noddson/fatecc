import { id } from './domain/defaults';
import type { Asset, CampaignMap, Character, Zone } from './domain/types';
import { createAsset } from './storage/assets';

const mapHash = '447f2e3c607b3bedd638f419aea9b996b559e242db23ee4b79a372972077594c';

/** The bundled image is cached with the app, then embedded in the campaign for portable backups. */
export async function loadLanternCoastMap(
  characters: Character[],
): Promise<{ asset: Asset; map: CampaignMap }> {
  const response = await fetch(`${import.meta.env.BASE_URL}sample/lantern-coast.png`);
  if (!response.ok) throw new Error('The Lantern Coast map could not be loaded. Please try again.');
  const asset = await createAsset(
    new File([await response.blob()], 'lantern-coast.png', { type: 'image/png' }),
    'shared',
  );
  if (asset.hash !== mapHash) throw new Error('The Lantern Coast map failed its image integrity check.');
  const harbor = id(),
    lighthouse = id(),
    road = id(),
    beacon = id(),
    chandlery = id();
  const zones: Zone[] = [
    {
      id: harbor,
      name: 'Bellweather Harbor',
      x: 0.49,
      y: 0.65,
      width: 0.33,
      height: 0.19,
      aspect: 'Candles for those still at sea',
      connections: [lighthouse, road, chandlery],
    },
    {
      id: lighthouse,
      name: 'The Lighthouse',
      x: 0.32,
      y: 0.59,
      width: 0.13,
      height: 0.18,
      aspect: 'Keep a light burning',
      connections: [harbor],
    },
    {
      id: road,
      name: 'Flooded Road North',
      x: 0.51,
      y: 0.26,
      width: 0.28,
      height: 0.22,
      aspect: 'The tide has the right of way',
      connections: [harbor, beacon],
    },
    {
      id: beacon,
      name: 'The Dark Beacon',
      x: 0.37,
      y: 0.12,
      width: 0.2,
      height: 0.13,
      aspect: 'The light has gone out',
      connections: [road],
    },
    {
      id: chandlery,
      name: 'The Chandlery',
      x: 0.65,
      y: 0.5,
      width: 0.18,
      height: 0.15,
      aspect: 'Every favor has a price',
      connections: [harbor],
    },
  ];
  const revisionId = id();
  return {
    asset,
    map: {
      id: id(),
      name: 'The Lantern Coast',
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
            .filter((character) => character.kind === 'pc' && character.visibility === 'shared')
            .slice(0, 7)
            .map((character, index) => ({
              id: id(),
              characterId: character.id,
              label: character.name,
              x: 0.54 + (index % 4) * 0.065,
              y: 0.73 + Math.floor(index / 4) * 0.06,
              zoneId: harbor,
              visibility: 'shared' as const,
            })),
          annotations: [],
        },
      ],
    },
  };
}
