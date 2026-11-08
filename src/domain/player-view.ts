import type { Actor, Campaign, Character } from './types';

export function controlledCharacters(campaign: Campaign, playerView?: boolean, actor?: Actor) {
  return campaign.characters.filter(
    (c) => !playerView || (actor?.characterIds.includes(c.id) && c.ownerId === actor.id),
  );
}

export function playerName(campaign: Campaign, character: Character) {
  return campaign.members.find(
    (m) => m.role === 'player' && m.id === character.ownerId && m.characterIds.includes(character.id),
  )?.name;
}
