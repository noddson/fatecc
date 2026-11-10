import type { Aspect, Campaign } from '../domain/types';

/** Order the picker around the character making this roll, while retaining every aspect. */
export function invocationAspectGroups(campaign: Campaign, characterId: string, playerView: boolean) {
  const own: Aspect[] = [],
    game: Aspect[] = [],
    scene: Aspect[] = [];
  const others = new Map<string, Aspect[]>();
  const add = (aspect: Aspect, source: 'game' | 'scene' | 'character', attachedTo?: string) => {
    if (!aspect.name.trim()) return;
    const owner = attachedTo ?? aspect.ownerId;
    if (owner === characterId) own.push(aspect);
    else if (owner) {
      const bucket = others.get(owner) ?? [];
      bucket.push(aspect);
      others.set(owner, bucket);
    } else if (source === 'game') game.push(aspect);
    else scene.push(aspect);
  };
  for (const character of campaign.characters)
    for (const aspect of character.aspects) add(aspect, 'character', character.id);
  for (const aspect of campaign.issues) add(aspect, 'game');
  for (const aspect of campaign.play.aspects) add(aspect, 'scene');
  const name = campaign.characters.find((character) => character.id === characterId)?.name ?? 'Character';
  return [
    { label: `${name} — ${playerView ? 'your character' : 'acting character'}`, aspects: own },
    { label: 'Game aspects', aspects: game },
    { label: 'Scene aspects', aspects: scene },
    ...[...others].map(([owner, aspects]) => ({
      label: `${campaign.characters.find((character) => character.id === owner)?.name ?? 'Other'} — other character`,
      aspects,
    })),
  ].filter((group) => group.aspects.length > 0);
}
