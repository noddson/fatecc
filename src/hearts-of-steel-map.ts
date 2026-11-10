import { id } from './domain/defaults';
import type { Asset, CampaignMap } from './domain/types';
import { createAsset } from './storage/assets';

const mapHash = '24795fe2d40896f541419ca4affdd59a871b48f3f125f73388476498943fb751';

/** Embed the precached image so the starter's map also travels in player copies and backups. */
export async function loadRivertonMap(): Promise<{ asset: Asset; map: CampaignMap }> {
  const response = await fetch(`${import.meta.env.BASE_URL}sample/hearts-of-steel-riverton-map.png`);
  if (!response.ok) throw new Error('The Riverton map could not be loaded. Please try again.');
  const asset = await createAsset(
    new File([await response.blob()], 'Riverton.png', { type: 'image/png' }),
    'shared',
  );
  if (asset.hash !== mapHash) throw new Error('The Riverton map failed its image integrity check.');
  const revisionId = id();
  return {
    asset,
    map: {
      id: id(),
      name: 'Riverton',
      visibility: 'shared',
      currentRevisionId: revisionId,
      sharedRevisionId: revisionId,
      revisions: [
        {
          id: revisionId,
          assetId: asset.id,
          createdAt: new Date().toISOString(),
          zones: [],
          tokens: [],
          annotations: [],
        },
      ],
    },
  };
}
