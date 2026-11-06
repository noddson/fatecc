import type { Character } from '../domain/types';

export interface CharacterDraft {
  id: string;
  campaignId: string;
  characterId: string;
  baseRevision: number;
  base: Character;
  proposed: Character;
  savedAt: string;
}
const key = 'fate.character-drafts.v1';
export function makeDraft(campaignId: string, character: Character): CharacterDraft {
  return {
    id: crypto.randomUUID(),
    campaignId,
    characterId: character.id,
    baseRevision: character.revision,
    base: structuredClone(character),
    proposed: structuredClone(character),
    savedAt: new Date().toISOString(),
  };
}
export function compareDraft(
  draft: CharacterDraft,
  current: Character,
): { stale: boolean; changedFields: string[]; conflictingFields: string[] } {
  const fields = Object.keys(draft.proposed) as (keyof Character)[];
  const changedFields = fields.filter(
    (k) => JSON.stringify(draft.proposed[k]) !== JSON.stringify(draft.base[k]),
  );
  return {
    stale: current.revision !== draft.baseRevision,
    changedFields,
    conflictingFields: changedFields.filter(
      (k) =>
        JSON.stringify(current[k]) !== JSON.stringify(draft.base[k]) &&
        JSON.stringify(current[k]) !== JSON.stringify(draft.proposed[k]),
    ),
  };
}
export function listDrafts(campaignId?: string): CharacterDraft[] {
  try {
    const drafts = JSON.parse(localStorage.getItem(key) || '[]') as CharacterDraft[];
    return Array.isArray(drafts) ? drafts.filter((d) => !campaignId || d.campaignId === campaignId) : [];
  } catch {
    return [];
  }
}
export function saveDraft(draft: CharacterDraft): void {
  const drafts = listDrafts().filter((d) => d.id !== draft.id);
  localStorage.setItem(key, JSON.stringify([...drafts, { ...draft, savedAt: new Date().toISOString() }]));
}
export function deleteDraft(id: string): void {
  localStorage.setItem(key, JSON.stringify(listDrafts().filter((d) => d.id !== id)));
}
