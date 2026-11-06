import Dexie, { type Table } from 'dexie';
import type { Asset, Campaign } from '../domain/types';
import { campaignSchema } from './schema';
import { bytesToDataUrl, readAssetBytes } from './assets';

type StoredCampaign = Omit<Campaign, 'assets'> & { assets: Omit<Asset, 'dataUrl'>[] };
interface StoredAsset {
  key: string;
  campaignId: string;
  assetId: string;
  blob: Blob;
}
export class CampaignDatabase extends Dexie {
  campaigns!: Table<StoredCampaign, string>;
  assets!: Table<StoredAsset, string>;
  constructor(name = 'fate-core-companion') {
    super(name);
    this.version(1).stores({ campaigns: 'id, updatedAt, archived', assets: 'key, campaignId, assetId' });
  }
}
export const db = new CampaignDatabase();
export class RevisionConflictError extends Error {
  constructor() {
    super('This campaign changed in another window. Reload the latest version before saving your changes.');
    this.name = 'RevisionConflictError';
  }
}
function dehydrate(campaign: Campaign): { row: StoredCampaign; assets: StoredAsset[] } {
  const clean = campaignSchema.parse(campaign);
  return {
    row: { ...clean, assets: clean.assets.map(({ dataUrl: _data, ...asset }) => asset) },
    assets: clean.assets.map((asset) => ({
      key: `${clean.id}:${asset.id}`,
      campaignId: clean.id,
      assetId: asset.id,
      blob: new Blob([readAssetBytes(asset).slice().buffer], { type: asset.mime }),
    })),
  };
}
async function hydrate(row: StoredCampaign, storedAssets: StoredAsset[]): Promise<Campaign> {
  const blobs = new Map(storedAssets.map((a) => [a.assetId, a.blob]));
  const assets = await Promise.all(
    row.assets.map(async (asset) => {
      const blob = blobs.get(asset.id);
      if (!blob) throw new Error(`Stored image is missing: ${asset.name}. Restore a backup to recover it.`);
      return { ...asset, dataUrl: bytesToDataUrl(new Uint8Array(await blob.arrayBuffer()), asset.mime) };
    }),
  );
  return { ...row, assets };
}
export async function loadCampaign(id: string): Promise<Campaign | undefined> {
  const [row, assets] = await db.transaction('r', db.campaigns, db.assets, async () =>
    Promise.all([db.campaigns.get(id), db.assets.where('campaignId').equals(id).toArray()]),
  );
  return row ? hydrate(row, assets) : undefined;
}
export async function listCampaigns(): Promise<Campaign[]> {
  const [rows, assets] = await db.transaction('r', db.campaigns, db.assets, async () =>
    Promise.all([db.campaigns.orderBy('updatedAt').reverse().toArray(), db.assets.toArray()]),
  );
  return Promise.all(
    rows.map((row) =>
      hydrate(
        row,
        assets.filter((asset) => asset.campaignId === row.id),
      ),
    ),
  );
}
async function writePrepared(
  prepared: ReturnType<typeof dehydrate>,
  expectedRevision?: number,
): Promise<void> {
  const existing = await db.campaigns.get(prepared.row.id);
  if (expectedRevision !== undefined && (existing?.revision ?? -1) !== expectedRevision)
    throw new RevisionConflictError();
  await db.assets.where('campaignId').equals(prepared.row.id).delete();
  if (prepared.assets.length) await db.assets.bulkPut(prepared.assets);
  await db.campaigns.put(prepared.row);
}
export async function saveCampaign(campaign: Campaign, expectedRevision?: number): Promise<void> {
  const prepared = dehydrate(campaign);
  try {
    await db.transaction('rw', db.campaigns, db.assets, () => writePrepared(prepared, expectedRevision));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'QuotaExceededError' || error.message.includes('QuotaExceeded'))
    )
      throw new Error(
        'Browser storage is full. Export a backup and remove unused images before trying again. Your previous save is intact.',
      );
    throw error;
  }
}
/** Optimistic transaction: mutation is pure; read and write revisions are checked atomically. */
export async function transactCampaign(
  id: string,
  mutate: (campaign: Campaign) => Campaign,
  expectedRevision?: number,
): Promise<Campaign> {
  const current = await loadCampaign(id);
  if (!current) throw new Error('Campaign was not found.');
  if (expectedRevision !== undefined && current.revision !== expectedRevision)
    throw new RevisionConflictError();
  const next = mutate(structuredClone(current));
  if (next.id !== current.id) throw new Error('A transaction cannot change campaign identity.');
  await saveCampaign(next, current.revision);
  return next;
}
export async function deleteCampaign(id: string): Promise<void> {
  await db.transaction('rw', db.campaigns, db.assets, async () => {
    await db.assets.where('campaignId').equals(id).delete();
    await db.campaigns.delete(id);
  });
}
export async function storageStatus(): Promise<{ usage: number; quota: number; persistent: boolean }> {
  const estimate = (await navigator.storage?.estimate?.()) ?? {};
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
    persistent: (await navigator.storage?.persisted?.()) ?? false,
  };
}
export async function requestPersistence(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}
