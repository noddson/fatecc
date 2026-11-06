import type { Asset, Campaign } from './types';

/** Apply inside the campaign's atomic update; retain images used elsewhere. */
export function replaceCampaignBanner(campaign: Campaign, asset: Asset | undefined, position = 50): void {
  const previousId = campaign.bannerAssetId;
  if (asset) {
    if (!Number.isFinite(position) || position < 0 || position > 100)
      throw new Error('Banner position must be between 0 and 100.');
    const existing = campaign.assets.find((entry) => entry.id === asset.id);
    if (existing && existing.hash !== asset.hash)
      throw new Error('This image identifier already belongs to another asset.');
    if (!existing) campaign.assets.push(asset);
    campaign.bannerAssetId = asset.id;
    campaign.bannerPosition = position;
  } else {
    delete campaign.bannerAssetId;
    delete campaign.bannerPosition;
  }
  if (
    previousId &&
    previousId !== campaign.bannerAssetId &&
    !campaign.characters.some((character) => character.portraitAssetId === previousId) &&
    !campaign.world.some((entry) => entry.assetId === previousId) &&
    !campaign.maps.some((map) => map.revisions.some((revision) => revision.assetId === previousId))
  ) {
    campaign.assets = campaign.assets.filter((entry) => entry.id !== previousId);
  }
}
