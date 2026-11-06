import type { Asset, Campaign, Character, RuleSetDefinition } from './types';
import { id } from './defaults';

export function ruleDifferences(source: RuleSetDefinition, target: RuleSetDefinition): string[] {
  const fields: [keyof RuleSetDefinition, string][] = [
    ['aspectCount', 'Aspect count'],
    ['phaseCount', 'Backstory phases'],
    ['skillCap', 'Skill cap'],
    ['allocation', 'Skill allocation'],
    ['skillSlots', 'Skill slots'],
    ['skills', 'Skills'],
    ['refresh', 'Base refresh'],
    ['freeStunts', 'Free stunts'],
    ['stressTracks', 'Stress tracks'],
    ['consequenceSlots', 'Consequence slots'],
    ['houseRules', 'House rules'],
  ];
  return fields
    .filter(([field]) => JSON.stringify(source[field]) !== JSON.stringify(target[field]))
    .map(([, name]) => name);
}

/** A reviewed character import is an independent draft; asset and internal IDs are remapped. */
export function prepareCharacterImport(
  source: { character: Character; assets: Asset[] },
  campaign: Campaign,
): { character: Character; assets: Asset[] } {
  const character = structuredClone(source.character),
    oldId = character.id,
    newId = id();
  const assetIds = new Map(source.assets.map((asset) => [asset.id, id()]));
  const aspectIds = new Map(character.aspects.map((aspect) => [aspect.id, id()]));
  character.id = newId;
  character.revision = 0;
  character.status = 'draft';
  character.ownerId = campaign.members.find((member) => member.role === 'gm')?.id || 'gm';
  character.portraitAssetId = character.portraitAssetId ? assetIds.get(character.portraitAssetId) : undefined;
  character.aspects.forEach((aspect) => {
    aspect.id = aspectIds.get(aspect.id)!;
    aspect.ownerId = aspect.ownerId === oldId ? newId : undefined;
    aspect.freeInvokeOwnerId = aspect.freeInvokeOwnerId === oldId ? newId : undefined;
  });
  character.consequences.forEach((consequence) => {
    consequence.id = aspectIds.get(consequence.id) || id();
    consequence.incurredConflictId = undefined;
  });
  character.stunts.forEach((stunt) => {
    stunt.id = id();
  });
  character.phases.forEach((phase) => {
    phase.id = id();
    phase.characterIds = [];
  });
  character.milestones.forEach((milestone) => {
    milestone.id = id();
  });
  const assets = structuredClone(source.assets).map((asset) => ({
    ...asset,
    id: assetIds.get(asset.id)!,
    visibility: character.visibility,
  }));
  return { character, assets };
}
