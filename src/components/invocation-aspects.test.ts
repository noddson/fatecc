import { expect, it } from 'vitest';
import { createAspect, createCampaign, createCharacter } from '../domain/defaults';
import { projectCampaign } from '../network/projection';
import { invocationAspectGroups } from './invocation-aspects';

it('puts the rolling character first, then game and scene, while retaining labeled other characters', () => {
  const campaign = createCampaign();
  const other = createCharacter(campaign.rules, 'Landon');
  const own = createCharacter(campaign.rules, 'Cynere');
  const hidden = createCharacter(campaign.rules, 'Hidden adversary', 'main');
  other.aspects = [createAspect('highConcept', 'Disciple of the Ivory Shroud')];
  // Imported/sample character aspects do not always carry ownerId.
  own.aspects = [createAspect('highConcept', 'Infamous Girl with Sword')];
  hidden.aspects = [createAspect('highConcept', 'Secret identity')];
  campaign.characters = [other, own, hidden];
  campaign.issues = [createAspect('game', 'The Scar Triad'), createAspect('game', '   ')];
  const injury = createAspect('consequence', 'Twisted ankle', other.id);
  campaign.play.aspects = [createAspect('situation', 'Crowded market'), injury];

  const groups = invocationAspectGroups(projectCampaign(campaign), own.id, true);
  expect(groups.map((group) => group.label)).toEqual([
    'Cynere — your character',
    'Game aspects',
    'Scene aspects',
    'Landon — other character',
  ]);
  expect(groups.flatMap((group) => group.aspects.map((aspect) => aspect.name))).toEqual([
    'Infamous Girl with Sword',
    'The Scar Triad',
    'Crowded market',
    'Disciple of the Ivory Shroud',
    'Twisted ankle',
  ]);
  expect(groups.at(-1)?.aspects).toContainEqual(injury);

  const gmGroups = invocationAspectGroups(campaign, own.id, false);
  expect(gmGroups[0].label).toBe('Cynere — acting character');
  expect(gmGroups.flatMap((group) => group.aspects)).toContainEqual(hidden.aspects[0]);
  // Switching the roll's character must switch the first group too.
  expect(invocationAspectGroups(campaign, other.id, true)[0].aspects).toEqual([other.aspects[0], injury]);
});
