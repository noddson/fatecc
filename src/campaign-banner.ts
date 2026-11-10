import type { Campaign } from './domain/types';
import { LANTERN_COAST_MAP_HASH } from './sample-map';

/** Uploaded artwork takes priority; the starter credit also identifies existing and renamed copies. */
export function campaignBanner(
  campaign: Campaign,
  placement: 'overview' | 'card' = 'card',
): { src: string; position: number } | undefined {
  const uploaded = campaign.assets.find((asset) => asset.id === campaign.bannerAssetId);
  if (uploaded) return { src: uploaded.dataUrl, position: campaign.bannerPosition ?? 50 };
  if (
    campaign.world.some(
      (entry) => entry.kind === 'reference' && entry.title === 'Hearts of Steel — sources and credits',
    )
  )
    return {
      src: `${import.meta.env.BASE_URL}illustrations/hearts-of-steel-riverton.png`,
      position: 50,
    };
  const coastAssets = new Set(
    campaign.assets.filter((asset) => asset.hash === LANTERN_COAST_MAP_HASH).map((asset) => asset.id),
  );
  if (campaign.maps.some((map) => map.revisions.some((revision) => coastAssets.has(revision.assetId))))
    return {
      src: `${import.meta.env.BASE_URL}illustrations/lantern-coast-dark-beacon.png`,
      position: placement === 'overview' ? 25 : 50,
    };
}
