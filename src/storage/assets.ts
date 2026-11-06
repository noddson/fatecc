import type { Asset, Visibility } from '../domain/types';
import { MAX_ASSET_BYTES } from './schema';

const supported = new Set(['image/png', 'image/jpeg', 'image/webp']);
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return `data:${mime};base64,${btoa(binary)}`;
}
export function readAssetBytes(asset: Pick<Asset, 'mime' | 'dataUrl'>): Uint8Array {
  if (!supported.has(asset.mime)) throw new Error('Only PNG, JPEG, and WebP images are supported.');
  const prefix = `data:${asset.mime};base64,`;
  if (!asset.dataUrl.startsWith(prefix)) throw new Error('Image contents do not match their declared type.');
  const encoded = asset.dataUrl.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
    throw new Error('Image contains invalid base64 data.');
  if (encoded.length > Math.ceil((MAX_ASSET_BYTES * 4) / 3) + 4)
    throw new Error('Each image must be 10 MB or smaller.');
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    throw new Error('Image contains invalid base64 data.');
  }
  const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  if (bytes.length > MAX_ASSET_BYTES) throw new Error('Each image must be 10 MB or smaller.');
  const isPng = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const isJpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isWebp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(asset.mime === 'image/png' ? isPng : asset.mime === 'image/jpeg' ? isJpeg : isWebp))
    throw new Error('Image signature does not match its declared type.');
  return bytes;
}
export async function assetHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function createAsset(file: File, visibility: Visibility = 'gm'): Promise<Asset> {
  if (!supported.has(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.');
  if (file.size > MAX_ASSET_BYTES) throw new Error('Each image must be 10 MB or smaller.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dataUrl = bytesToDataUrl(bytes, file.type);
  readAssetBytes({ mime: file.type, dataUrl });
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mime: file.type,
    dataUrl,
    hash: await assetHash(bytes),
    visibility,
  };
}
export async function validateAssets(assets: Asset[]): Promise<void> {
  for (const asset of assets) {
    if ((await assetHash(readAssetBytes(asset))) !== asset.hash)
      throw new Error(`Image integrity check failed: ${asset.name}`);
  }
}
