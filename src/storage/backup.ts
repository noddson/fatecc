import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';
import type { Actor, Campaign, CampaignExport, Character, RuleSetDefinition } from '../domain/types';
import { projectCampaign } from '../network/projection';
import { assetHash, bytesToDataUrl, readAssetBytes, validateAssets } from './assets';
import { loadCampaign, saveCampaign } from './db';
import {
  assertReferences,
  assertSafeObject,
  assetSchema,
  campaignExportSchema,
  characterSchema,
  MAX_ASSET_BYTES,
  MAX_IMPORT_BYTES,
  rulesSchema,
  SCHEMA_VERSION,
} from './schema';

const publicActor: Actor = { id: 'public-export', role: 'player', characterIds: [] };
export function cloneCampaign(campaign: Campaign): Campaign {
  const now = new Date().toISOString();
  return {
    ...structuredClone(campaign),
    id: crypto.randomUUID(),
    name: `${campaign.name} (copy)`,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    processedCommandIds: [],
  };
}
function packageFor(campaign: Campaign, audience: 'gm' | 'player', actor: Actor): CampaignExport {
  return campaignExportSchema.parse({
    format: 'fate-core-companion',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    audience,
    campaign: audience === 'player' ? projectCampaign(campaign, actor) : campaign,
  });
}
export async function exportCampaign(
  campaign: Campaign,
  audience: 'gm' | 'player' = 'gm',
  actor: Actor = publicActor,
): Promise<string> {
  const output = packageFor(campaign, audience, actor);
  assertReferences(output.campaign);
  await validateAssets(output.campaign.assets);
  const json = JSON.stringify(output, null, 2);
  if (new TextEncoder().encode(json).byteLength > MAX_IMPORT_BYTES)
    throw new Error(
      'This JSON backup would exceed the 64 MB import limit. Use ZIP to avoid base64 overhead, or remove unused images.',
    );
  return json;
}
export async function exportCampaignZip(
  campaign: Campaign,
  audience: 'gm' | 'player' = 'gm',
  actor: Actor = publicActor,
): Promise<Uint8Array> {
  const output = packageFor(campaign, audience, actor);
  assertReferences(output.campaign);
  await validateAssets(output.campaign.assets);
  const files: Record<string, Uint8Array> = {};
  for (const asset of output.campaign.assets) {
    files[`assets/${asset.hash}`] = readAssetBytes(asset);
    asset.dataUrl = '';
  }
  files['campaign.json'] = strToU8(JSON.stringify(output));
  if (Object.values(files).reduce((sum, bytes) => sum + bytes.byteLength, 0) > MAX_IMPORT_BYTES)
    throw new Error(
      'This backup exceeds the 64 MB expanded archive limit. Remove unused images before exporting.',
    );
  return zipSync(files, { level: 6 });
}
function parseJson(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES)
    throw new Error('The import is larger than 64 MB. Use a smaller campaign backup.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('This is not valid JSON. Choose a Fate Companion export.');
  }
  assertSafeObject(value);
  return value;
}
/** v0 was the initial prototype: same state with no audience field or command receipt history. */
export function migrateExport(value: unknown): unknown {
  if (!value || typeof value !== 'object') throw new Error('This file is not a Fate Companion export.');
  const input = value as Record<string, unknown>;
  if (input.format !== 'fate-core-companion')
    throw new Error('This file is not a Fate Companion campaign export.');
  if (typeof input.schemaVersion !== 'number') throw new Error('The file is missing its format version.');
  if (input.schemaVersion > SCHEMA_VERSION)
    throw new Error('This backup uses a newer format. Update Fate Companion before importing it.');
  if (input.schemaVersion === 0) {
    if (!input.campaign || typeof input.campaign !== 'object')
      throw new Error('The legacy backup is missing campaign data.');
    const campaign = input.campaign as Record<string, unknown>;
    return {
      ...input,
      schemaVersion: 1,
      audience: input.audience ?? 'gm',
      campaign: { ...campaign, processedCommandIds: campaign.processedCommandIds ?? [] },
    };
  }
  if (input.schemaVersion !== SCHEMA_VERSION) throw new Error('This backup format is not supported.');
  return input;
}
function unpackZip(bytes: Uint8Array): { text: string; assets: Record<string, Uint8Array> } {
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new Error('The backup is larger than 64 MB.');
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(file) {
        if (file.name !== 'campaign.json' && !/^assets\/[a-f0-9]{64}$/.test(file.name))
          throw new Error('The archive contains an unexpected file.');
        total += file.originalSize;
        if (
          total > MAX_IMPORT_BYTES ||
          (file.name !== 'campaign.json' && file.originalSize > MAX_ASSET_BYTES)
        )
          throw new Error('Expanded backup exceeds the supported size.');
        return true;
      },
    });
  } catch (error) {
    throw new Error(`Cannot open backup archive: ${error instanceof Error ? error.message : 'invalid ZIP'}`);
  }
  if (!files['campaign.json']) throw new Error('This archive is missing campaign.json.');
  return { text: strFromU8(files['campaign.json']), assets: files };
}
export async function parseCampaignExport(input: string | Uint8Array): Promise<CampaignExport> {
  let text: string;
  let files: Record<string, Uint8Array> | undefined;
  if (typeof input === 'string') text = input;
  else if (input[0] === 0x50 && input[1] === 0x4b) {
    const unzipped = unpackZip(input);
    text = unzipped.text;
    files = unzipped.assets;
  } else {
    if (input.byteLength > MAX_IMPORT_BYTES) throw new Error('The backup is larger than 64 MB.');
    text = strFromU8(input);
  }
  const migrated = migrateExport(parseJson(text));
  if (files && migrated && typeof migrated === 'object') {
    const raw = migrated as { campaign?: { assets?: unknown[] } };
    if (Array.isArray(raw.campaign?.assets)) {
      for (const candidate of raw.campaign.assets) {
        if (!candidate || typeof candidate !== 'object') continue;
        const asset = candidate as { dataUrl?: string; hash?: string; mime?: string };
        if (
          typeof asset.hash === 'string' &&
          /^[a-f0-9]{64}$/.test(asset.hash) &&
          typeof asset.mime === 'string' &&
          asset.dataUrl === ''
        ) {
          const bytes = files[`assets/${asset.hash}`];
          if (!bytes) throw new Error('An image is missing from this backup.');
          asset.dataUrl = bytesToDataUrl(bytes, asset.mime);
        }
      }
    }
  }
  const result = campaignExportSchema.safeParse(migrated);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Invalid campaign data at ${issue.path.join('.') || 'root'}: ${issue.message}`);
  }
  assertReferences(result.data.campaign);
  await validateAssets(result.data.campaign.assets);
  return result.data;
}
export async function importCampaign(
  input: string | Uint8Array,
  mode: 'copy' | 'restore' = 'copy',
): Promise<Campaign> {
  const parsed = await parseCampaignExport(input);
  if (parsed.audience === 'player' && mode === 'restore')
    throw new Error(
      'A player export is a reference copy, not a complete GM backup. Import it as a separate copy.',
    );
  const campaign = mode === 'copy' ? cloneCampaign(parsed.campaign) : parsed.campaign;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    const { usage = 0, quota = Infinity } = await navigator.storage.estimate();
    const required = new TextEncoder().encode(JSON.stringify(campaign)).byteLength;
    if (quota - usage < required * 1.1)
      throw new Error(
        'There is not enough browser storage to import this campaign. Export existing data before freeing space.',
      );
  }
  const existing = await loadCampaign(campaign.id);
  if (mode === 'restore' && existing) campaign.revision = existing.revision + 1;
  await saveCampaign(campaign, existing?.revision ?? -1);
  return campaign;
}

export interface CharacterExport {
  format: 'fate-core-character';
  schemaVersion: 1;
  exportedAt: string;
  character: Character;
  rules: RuleSetDefinition;
  assets: Campaign['assets'];
}
const characterExportSchema = z.object({
  format: z.literal('fate-core-character'),
  schemaVersion: z.literal(1),
  exportedAt: z.string().max(100),
  character: characterSchema,
  rules: rulesSchema,
  assets: z.array(assetSchema).max(1),
});
export async function exportCharacter(campaign: Campaign, characterId: string): Promise<string> {
  const character = campaign.characters.find((c) => c.id === characterId);
  if (!character) throw new Error('Character was not found.');
  const assets = campaign.assets.filter((a) => a.id === character.portraitAssetId);
  await validateAssets(assets);
  return JSON.stringify(
    {
      format: 'fate-core-character',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      character: characterSchema.parse(character),
      rules: rulesSchema.parse(campaign.rules),
      assets,
    },
    null,
    2,
  );
}
export async function parseCharacterExport(input: string): Promise<CharacterExport> {
  const parsed = characterExportSchema.parse(parseJson(input));
  const assets = parsed.assets;
  await validateAssets(assets);
  if (parsed.character.portraitAssetId && !assets.some((a) => a.id === parsed.character.portraitAssetId))
    throw new Error('The character portrait is missing.');
  return { ...parsed, assets };
}
export async function exportRules(rules: RuleSetDefinition): Promise<string> {
  return JSON.stringify(
    { format: 'fate-core-rules', schemaVersion: 1, rules: rulesSchema.parse(rules) },
    null,
    2,
  );
}
export function parseRulesExport(input: string): RuleSetDefinition {
  return z
    .object({ format: z.literal('fate-core-rules'), schemaVersion: z.literal(1), rules: rulesSchema })
    .parse(parseJson(input)).rules;
}

export function downloadFile(
  content: string | Uint8Array,
  filename: string,
  mime = 'application/json',
): void {
  const blob = new Blob([typeof content === 'string' ? content : content.slice().buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export { assetHash };
