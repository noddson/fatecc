import type { Campaign } from './domain/types';

/** Uploaded artwork takes priority; the starter credit also identifies existing and renamed copies. */
export function campaignBanner(campaign: Campaign): { src: string; position: number } | undefined {
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
}
